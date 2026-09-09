/* Display-only interpretation of explicit canonical timeline evidence. */
(() => {
  'use strict';
  const labels={PROJECT_CREATED:'企劃建立',RAW:'素材就緒',INDEX:'索引',CALIBRATION:'校正',LONGFORM_DIRECTOR:'導演分析',WORKORDER:'執行單',GATE:'確認',AI_ROUGH_CUT:'自動粗剪',HUMAN_FINAL_CUT:'人工定剪',AI_POST:'後製',SUBTITLES:'字幕',RELEASE_PREP:'發布準備',PUBLISH:'發布',ROUGH_CUT_LEARNING:'剪輯學習',PROJECT_FINAL_LEARNING:'專案學習'};
  function view(project) {
    const F=typeof window!=='undefined'?window.RenguinFreshness:require('./renguin-freshness.js');
    const timeline=(project.timeline||[]).map(row=>{
      const time=F.inspect(row.updated_at,600);
      const supported=row.ledger_entry_id||(row.evidence_provenance?.verified===true&&row.evidence_provenance.canonical_project_id===project.project_id);
      return {...row,label:labels[row.id]||'其他階段',historical:!time.fresh,
        status:supported&&(time.fresh||time.status==='STALE')?row.status:'UNKNOWN'};
    });
    const known=timeline.filter(row=>!['UNKNOWN','NOT_REQUIRED'].includes(row.status));
    let current;
    for(const state of ['BLOCKED','REVIEW','ACTIVE','TODO']) {
      current=known.find(row=>row.status===state&&!row.historical);if(current)break;
    }
    current ||= known.filter(row=>row.status==='DONE').at(-1);
    const status=current?.status||'UNKNOWN';
    const text=current?({ACTIVE:`正在${current.label}`,TODO:`等待${current.label}`,DONE:`${current.label}完成`,REVIEW:`${current.label}等待確認`,BLOCKED:`${current.label}受阻`}[status]||'目前無法確認'):'目前無法確認';
    const human=!!current && !current.historical && status!=='DONE' && (project.owner==='YOU' && ['ACTIVE','TODO','REVIEW','BLOCKED'].includes(status) || ['REVIEW','TODO'].includes(status)&&current?.id==='GATE' || project.blocker==='等待人工確認');
    const next=human?'請確認待處理項目':status==='BLOCKED'?'先處理阻擋原因':['ACTIVE','TODO','REVIEW'].includes(status)?text:'下一步尚待正式狀態判定';
    return {timeline,current,status,text,human,next};
  }
  const api={view};
  if(typeof module!=='undefined')module.exports=api;
  if(typeof window!=='undefined')window.RenguinSemantics=api;
})();
