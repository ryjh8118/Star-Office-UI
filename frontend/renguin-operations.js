(() => {
  'use strict';
  let current={jobs:[],coverage_complete:false};
  const expanded=new Set();
  const names={CHATGPT_WORK:'ChatGPT／Work',CLAUDE:'Claude',ASTRA:'ASTRA',BIONIC:'BIONIC'};
  const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
  function effective(job) {
    if(['COMPLETED','FAILED'].includes(job.effective_status)) {
      const start=job.started_at, finish=job.finished_at;
      return Number.isFinite(start)&&Number.isFinite(finish)&&start<=finish&&finish<=Date.now()/1000?job.effective_status:'UNKNOWN';
    }
    const freshness=window.RenguinFreshness.lease(job);
    if(!freshness.fresh)return freshness.status;
    return {ACTIVE:'RUNNING',WAITING_HUMAN:'WAITING_USER',WAITING:'WAITING_AGENT',LOST:'STALE'}[job.effective_status]||job.effective_status||'UNKNOWN';
  }
  const statusLabels={STARTING:'正在啟動',RUNNING:'正在執行',WAITING_USER:'等待你處理',WAITING_AGENT:'等待其他 Agent',BLOCKED:'卡住',IDLE:'閒置',STALE:'狀態可能過期',COMPLETED:'本次工作已完成',FAILED:'本次工作失敗',UNKNOWN:'目前無法確認'};
  function projectAgent(pid) {
    return [...new Set(current.jobs.filter(j=>j.project_id===pid&&['RUNNING','WAITING_USER','WAITING_AGENT','BLOCKED'].includes(effective(j))).map(j=>names[j.agent]||'未知 Agent'))].join('、')||'目前無法確認';
  }
  function render(root) {
    const retainedForm=root.querySelector('#rc-admission');
    for(const child of [...root.children])if(child!==retainedForm)child.remove();
    const anchor=retainedForm;
    const add=element=>root.insertBefore(element,anchor);
    const count=node('p',`已確認執行中 ${current.jobs.filter(j=>effective(j)==='RUNNING').length} · 卡住 ${current.jobs.filter(j=>effective(j)==='BLOCKED').length} · 可安全派工：${current.coverage_complete?'請先檢查工作範圍':'來源未完整接入，目前無法確認'}`);count.style.gridColumn='1/-1';add(count);
    for(const [agent,name] of Object.entries(names)) {
      const jobs=current.jobs.filter(j=>j.agent===agent);
      for(const job of jobs.length?jobs:[{agent,effective_status:'UNKNOWN',status_label:'目前無法確認'}]) {
        const state=effective(job);
        const card=node('article');card.dataset.agent=agent;card.dataset.status=state;
        card.append(node('h3',job.source==='CODEX_EXECUTOR_OWNER_CALL'?name+'（本次工作）':name),node('strong',statusLabels[state]||statusLabels.UNKNOWN));
        card.append(node('p',state==='UNKNOWN'?(job.native_observations?.length?'原生紀錄已連接；任務尚未確認':'尚未收到可驗證的工作租約'):`任務：${job.task||'未回報'}`));
        card.append(node('p',current.coverage_complete?'派工前請先檢查範圍':'派工安全：資料不足，不能保證安全'));
        card.append(node('p',`專案：${job.project_name||job.project_id||'目前無法確認'}`),node('p',`最後心跳：${Number.isFinite(job.last_heartbeat)?new Date(job.last_heartbeat*1000).toLocaleString('zh-TW'):'未收到'}`));
        if(['COMPLETED','FAILED'].includes(state))card.append(node('p',`結束時間：${new Date(job.finished_at*1000).toLocaleString('zh-TW')}`));
        card.append(node('p',`下一步：${state==='UNKNOWN'?'等待工作來源回報':job.next_step||'等待來源連接'}`));
        const d=node('details');const detailKey=agent+':'+(job.job_id||'unknown');d.open=expanded.has(detailKey);d.addEventListener('toggle',()=>d.open?expanded.add(detailKey):expanded.delete(detailKey));d.append(node('summary','工作與資源詳情'),node('pre',JSON.stringify(job,null,2)));card.append(d);add(card);
      }
    }
    if(retainedForm)return;
    const form=node('form');form.style.gridColumn='1/-1';
    form.append(node('h3','派工前檢查'),node('p','先檢查修改範圍是否重疊；這裡只分析，不會派出工作。'));
    const fields=[['project_id','專案識別'],['repo','程式庫位置'],['branch','分支'],['worktree','工作目錄'],
                  ['read_scope','讀取範圍（每行一個完整路徑）'],['write_scope','修改範圍（每行一個完整路徑）']];
    const inputs={};
    for(const [key,label] of fields) {
      const wrapper=node('label',label);wrapper.style.display='block';
      const input=node(key.endsWith('_scope')?'textarea':'input');input.name=key;input.setAttribute('aria-label',label);
      wrapper.append(input);form.append(wrapper);inputs[key]=input;
    }
    const advanced=node('details');advanced.append(node('summary','共用資源與剪輯範圍'));
    for(const [key,label] of [['authority_scope','權限範圍'],['shared_contracts','共用契約'],['active_locks','資源鎖'],['runtime_resources','執行資源'],['premiere_project','Premiere 專案路徑'],['premiere_sequence','Premiere 序列識別']]) {
      const wrapper=node('label',label);wrapper.style.display='block';const input=node('input'); input.setAttribute('aria-label',label);wrapper.append(input);advanced.append(wrapper);inputs[key]=input;
    }
    form.append(advanced);const submit=node('button','檢查是否撞車');submit.type='submit';form.append(submit);
    const result=node('div');result.setAttribute('aria-live','polite');form.append(result);
    form.addEventListener('submit',async event=>{
      event.preventDefault();const candidate={};
      const arrays=['read_scope','write_scope','authority_scope','shared_contracts','active_locks','runtime_resources'];
      for(const [key,input] of Object.entries(inputs))candidate[key]=arrays.includes(key)?input.value.split(/[\n,]/).map(s=>s.trim()).filter(Boolean):input.value.trim()||null;
      submit.disabled=true;
      try {
        const response=await fetch('/api/renguin/collision',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(candidate),signal:AbortSignal.timeout(4000)});
        const data=await response.json();result.replaceChildren(node('strong',data.label||'目前無法確認'));
        for(const conflict of data.conflicts||[])result.append(node('p',`${names[conflict.agent]||'其他工作'}：${(conflict.reasons||[]).join('；')}`));
        for(const reason of data.reasons||[])result.append(node('p',typeof reason==='string'?reason:reason.reason||'需要確認共用資源'));
        if(data.prohibited_scope?.length)result.append(node('p','暫時不要修改：'+data.prohibited_scope.join('、')));
        if(data.safe_scope?.length)result.append(node('p','可平行修改：'+data.safe_scope.join('、')));
      } catch {result.replaceChildren(node('p','連線失敗，目前無法確認'));} finally {submit.disabled=false;}
    });
    const admission=node('details');admission.id='rc-admission';admission.style.gridColumn='1/-1';admission.append(node('summary','派工前檢查範圍'),form);root.append(admission);
  }
  async function poll() {
    try {const response=await fetch('/api/renguin/operations',{cache:'no-store',signal:AbortSignal.timeout(4000)});if(!response.ok)throw Error();current=await response.json();}
    catch {current={...current,coverage_complete:false,source_unavailable:true};}
    window.RenguinReadiness?.operations(current);
    const root=document.getElementById('rc-agent-board');
    // Preserve the dispatch form during user input; canonical refresh owns render.
    if(root)render(root);
    window.RenguinControlRoom?.refreshAgentNames?.();
  }
  window.RenguinOperations={render,poll,projectAgent,effective,get current(){return current;}};poll();setInterval(poll,5000);
  setInterval(()=>{const root=document.getElementById('rc-agent-board');if(root)render(root);window.RenguinControlRoom?.refreshAgentNames?.();},1000);
})();
