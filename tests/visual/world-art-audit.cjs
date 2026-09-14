// Same-browser, DPR=1 audit. No production writes. Run before and after changes.
const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const base=process.argv[2]||'http://127.0.0.1:19125', label=process.argv[3]||'after';
const shotsOnly=process.argv.includes('--shots-only'),perfOnly=process.argv.includes('--perf-only');
const festival=process.argv.includes('--festival');
const out=path.resolve(__dirname,'../../docs/renguin-world/visual-upgrade',label);
fs.mkdirSync(out,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const port=9700+Math.floor(Math.random()*200);
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new',`--remote-debugging-port=${port}`,`--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(),'rw-art-'))}`,'--no-first-run','about:blank'],{stdio:'ignore',windowsHide:true});
(async()=>{
 let target;for(let k=0;k<60&&!target;k++){await sleep(200);target=await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'}).then(r=>r.json()).catch(()=>null);}
 const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
 let id=0,events=[];const pending=new Map();
 ws.onmessage=async e=>{const m=JSON.parse(e.data);if(m.id){pending.get(m.id)?.(m);pending.delete(m.id);}else {
  events.push(m);
  if(m.method==='Fetch.requestPaused') {
   const requestId=m.params.requestId;
   const r=await send('Fetch.getResponseBody',{requestId});
   const state=JSON.parse(r.base64Encoded?Buffer.from(r.body,'base64').toString():r.body);
   state.activity={...state.activity,state:'FESTIVAL',crowd_density:'FESTIVAL',lights_level:100,event_flags:['FESTIVAL_BANNERS','FIREWORKS','CONFETTI']};
   state.visual={...state.visual,lights_level:100,shops_open:1};
   state.residents={...state.residents,visible:Math.max(28,state.residents.visible),crowd_density:'FESTIVAL'};
   await send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(state)).toString('base64')});
  }
 }};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,m=>m.error?reject(Error(JSON.stringify(m.error))):resolve(m.result));ws.send(JSON.stringify({id:n,method,params}));});
 const js=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 for(const d of ['Page','Network','Runtime','Performance'])await send(d+'.enable');
 if(festival) await send('Fetch.enable',{patterns:[{urlPattern:'*/api/world/simulate?contents=100&*',requestStage:'Response'}]});
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__rwAudit={longTasks:[],ready:0};new PerformanceObserver(l=>window.__rwAudit.longTasks.push(...l.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});const watch=new MutationObserver(()=>{if(document.querySelector('#rw-stage svg')&&!window.__rwAudit.ready){window.__rwAudit.ready=performance.now();watch.disconnect();}});watch.observe(document,{childList:true,subtree:true});`});
 const vp=w=>send('Emulation.setDeviceMetricsOverride',{width:w,height:w===390?844:900,deviceScaleFactor:1,mobile:w===390});
 const metrics=async()=>Object.fromEntries((await send('Performance.getMetrics')).metrics.map(x=>[x.name,x.value]));
 const open=async url=>{events=[];await send('Page.navigate',{url});for(let k=0;k<100;k++){await sleep(100);if(await js("document.querySelector('#rw-stage svg')!==null"))break;}await js('document.fonts.ready');await sleep(750);};
 const shot=async name=>fs.writeFileSync(path.join(out,name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 const report={label,base,browser:(await send('Browser.getVersion')).product,dpr:1,fixture:festival?'QA response override: 100-content state plus FESTIVAL, 28 desktop / 14 mobile; backend/growth unchanged':'unmodified engine simulation',date:new Date().toISOString(),samples:[],scenarios:[],cleanup:[]};
 await vp(1440);await send('Page.navigate',{url:base+'/?intro=off'});await sleep(6000);
 report.officeWorldRequests=events.filter(e=>e.method==='Network.requestWillBeSent'&&/\/static\/world\/|\/api\/world\//.test(e.params.request.url)).map(e=>e.params.request.url);
 if(!shotsOnly) for(const width of [1440,390]){
  await vp(width);
  for(let run=0;run<3;run++){
   await send('Network.clearBrowserCache');await send('Network.setCacheDisabled',{cacheDisabled:false});
   for(const cache of (festival?['cold']:['cold','warm'])){
    await open(base+'/world?sim=100&time=day');
    const timing=await js(`(()=>{const n=performance.getEntriesByType('navigation')[0];const r=performance.getEntriesByType('resource');return {activity:document.querySelector("#rw-stage").dataset.activity,imageBitmapEstimate:[...document.querySelectorAll("#rw-stage img")].reduce((sum,img)=>sum+img.naturalWidth*img.naturalHeight*4,0),worldReady:window.__rwAudit.ready,domContentLoaded:n.domContentLoadedEventEnd,load:n.loadEventEnd,imageTransfer:r.filter(x=>x.initiatorType==='img').reduce((a,x)=>a+x.transferSize,0),imageDecoded:r.filter(x=>x.initiatorType==='img').reduce((a,x)=>a+x.decodedBodySize,0),walkers:document.querySelectorAll('.rw-walker').length,scroll:document.documentElement.scrollWidth,brokenImages:[...document.querySelectorAll('#rw-stage img')].filter(x=>!x.complete||!x.naturalWidth).length};})()`);
    await sleep(14000);const a=await metrics();await sleep(5000);const b=await metrics();
    report.samples.push({width,run,cache,...timing,mainMsPerSecond:(b.TaskDuration-a.TaskDuration)*200,layoutsPerSecond:(b.LayoutCount-a.LayoutCount)/5,heap:b.JSHeapUsedSize,longTasks:await js('window.__rwAudit.longTasks')});
    if(festival&&run===0)await shot(width+'-100-festival');
    console.log(label,width,run,cache,report.samples.at(-1).mainMsPerSecond.toFixed(2));
   }
  }
 }
 if(!perfOnly) for(const width of [1440,390]){
  await vp(width);
  for(const q of ['sim=0','sim=5','sim=10','sim=20','sim=35','sim=50','sim=75','sim=85','sim=100','sim=20&time=night','sim=50&time=dusk&idle=10','sim=50&time=night&idle=20','sim=50&idle=45','sim=50&gap=20&idle=1']){
   const query=new URLSearchParams(q);if(!query.has('time'))query.set('time','day');
   await open(base+'/world?'+query);await sleep(500);await shot(width+'-'+q.replaceAll(/[=&]/g,'-'));
   report.scenarios.push({width,q,...await js(`({era:document.querySelector('#rw-stage').dataset.era,activity:document.querySelector('#rw-stage').dataset.activity,daypart:document.querySelector('#rw-stage').dataset.daypart,scroll:document.documentElement.scrollWidth,brokenImages:[...document.querySelectorAll('#rw-stage img')].filter(x=>!x.complete||!x.naturalWidth).length,actors:document.querySelectorAll('[data-character="RENGUIN"]').length})`),errors:events.filter(e=>e.method==='Runtime.exceptionThrown'||(e.method==='Network.responseReceived'&&e.params.response.status>=400)).map(e=>e.params)});
  }
 }
 await vp(1440);
 for(let k=0;k<10;k++){
  await open(base+'/world?sim=100&time=day');await js("window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}))");await send('HeapProfiler.collectGarbage');
  report.cleanup.push({...await js('RenguinWorld.debug()'),mountedCardNodes:await js("document.querySelectorAll('#rw-hud *, #rw-districts *, #rw-footer *').length"),heap:(await metrics()).JSHeapUsedSize});
  await js("window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))");await sleep(350);
 }
 await js("Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))");report.hidden=await js('RenguinWorld.debug()');
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 report.reducedMotion=await js("[...document.querySelectorAll('.rw-stage *')].filter(x=>getComputedStyle(x).animationName!=='none').length");
 if(label==='after') {
  await js("window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))");await sleep(500);
  report.restoredVisible=await js("({running:RenguinWorld.debug().running,paused:document.querySelector('#rw-stage').classList.contains('rw-paused'),hasScene:!!document.querySelector('#rw-stage svg')})");
 }
 fs.writeFileSync(path.join(out,festival?'festival.json':shotsOnly?'screenshots.json':perfOnly?'performance.json':'audit.json'),JSON.stringify(report,null,2));ws.close();
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>chrome.kill());
