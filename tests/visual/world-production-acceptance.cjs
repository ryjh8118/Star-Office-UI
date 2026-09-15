// Real local browser, live data. Screenshots stay in ignored runtime, never Git.
const {spawn}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const base=process.argv[2],label=process.argv[3]||'preview';
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(base))throw Error('LOCAL_ONLY');
const out=path.resolve(__dirname,'../../.qa-runtime/stable-'+label);fs.mkdirSync(out,{recursive:true});
const port=9600+Math.floor(Math.random()*100),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new',`--remote-debugging-port=${port}`,`--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(),'rw-accept-'))}`,'--no-first-run','about:blank'],{stdio:'ignore',windowsHide:true});
const checks=[];const check=(name,pass)=>checks.push({name,pass:!!pass});
(async()=>{
 let target;for(let i=0;i<60&&!target;i++){await sleep(200);target=await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'}).then(r=>r.json()).catch(()=>null);}
 const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
 let id=0,events=[];const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){pending.get(m.id)?.(m);pending.delete(m.id);}else events.push(m);};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,m=>m.error?reject(Error('BROWSER_COMMAND_FAILED')):resolve(m.result));ws.send(JSON.stringify({id:n,method,params}));});
 const js=async expression=>(await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true})).result?.value;
 for(const d of ['Page','Runtime','Network'])await send(d+'.enable');
 for(const width of [1440,390]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:900,deviceScaleFactor:1,mobile:width===390});
  events=[];await send('Page.navigate',{url:base+'/world?time=day'});
  for(let i=0;i<100;i++){await sleep(100);if(await js("!!document.querySelector('#rw-stage svg')"))break;}
  await sleep(1300);
  const state=await js("fetch('/api/world/state').then(r=>r.json())");
  check(width+' live world 20 / 74 / 14 / ERA_03',state.content.total===20&&state.world_score===74&&state.world_level===14&&state.current_era==='ERA_03');
  const counts=state.popularity.resolution_counts;
  check(width+' declared 16 / 3 / 1',counts.FULLY_VERIFIED===16&&counts.IDENTITY_VERIFIED===3&&counts.IDENTITY_UNRESOLVED===1);
  check(width+' unavailable explicitly visible',await js("document.querySelector('.rw-featured-card').textContent.includes('3 筆觀看次數未提供（unavailable）')"));
  check(width+' unresolved cannot link',state.featured_contents.filter(c=>c.youtube_resolution_status==='IDENTITY_UNRESOLVED').every(c=>!c.youtube_video_id));
  check(width+' null is never zero',state.featured_contents.filter(c=>c.youtube_resolution_status==='IDENTITY_VERIFIED').every(c=>c.view_count===null&&c.view_tier===null));
  check(width+' no overflow or broken images',await js("document.documentElement.scrollWidth<=innerWidth+1 && [...document.querySelectorAll('#rw-stage img')].every(i=>i.complete&&i.naturalWidth>0)"));
  const shot=async name=>fs.writeFileSync(path.join(out,width+'-'+name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await shot('live-day');
  await js("document.querySelector('#rw-time').click()");await sleep(350);
  check(width+' time button changes scene',await js("document.querySelector('#rw-stage').dataset.daypart!=='day'"));
  const gossip=await js("document.querySelector('#rw-gossip').textContent");
  await js("document.querySelector('#rw-gossip-next').click()");
  check(width+' resident dialogue advances',(await js("document.querySelector('#rw-gossip').textContent"))!==gossip);
  await js("document.querySelector('#rw-motion').click()");
  check(width+' motion pause works',await js("document.querySelector('#rw-stage').classList.contains('rw-motion-static')"));
  await js("document.querySelector('#rw-motion').click()");
  await shot('time-change');
  await js("document.querySelector('.rw-featured-card').scrollIntoView()");await shot('data');
  await js("document.querySelector('.rw-roster-card').open=true");await sleep(800);
  check(width+' roster loads on demand',events.some(e=>e.method==='Network.requestWillBeSent'&&e.params.request.url.includes('/api/world/characters')));
  await js("document.querySelector('#rw-refresh').click()");await sleep(700);
  check(width+' refresh retains real world',await js("!!document.querySelector('#rw-stage svg') && document.querySelector('.rw-era-card').textContent.includes('14')"));
  check(width+' zero console exceptions',!events.some(e=>e.method==='Runtime.exceptionThrown'||e.method==='Runtime.consoleAPICalled'&&e.params.type==='error'));
 }
 ws.close();fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify(checks,null,2));
 console.log(JSON.stringify({passed:checks.filter(c=>c.pass).length,total:checks.length,failed:checks.filter(c=>!c.pass)}));
 if(checks.some(c=>!c.pass))process.exitCode=1;
})().catch(()=>{console.error('ACCEPTANCE_BROWSER_FAILED');process.exitCode=1;}).finally(()=>chrome.kill());
