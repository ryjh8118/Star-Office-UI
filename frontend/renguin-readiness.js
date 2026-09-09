/* Product entry telemetry. A rendered stale/unknown UI is never critical-ready. */
(() => {
 'use strict';
 const marks={APP_BOOT:0,REQUEST_START:null,REGISTRY_AVAILABLE:null,CANONICAL_PROJECTION_READY:null,
  ACTIVE_PROJECTS_READY:null,AGENT_STATUS_READY:null,CRITICAL_UI_FIRST_RENDER:null,
  CRITICAL_CONTROL_TOWER_READY:null,FULL_UI_READY:null};
 let projects=null,operations=null;
 const mark=name=>{if(marks[name]===null){marks[name]=performance.now();performance.mark(name);}};
 function blockers(){
  const F=window.RenguinFreshness,out=[];
  if(!F||!F.envelope(projects).fresh)out.push('CANONICAL_NOT_FRESH');
  const primary=projects?.projection?.projects?.filter(p=>p.classification==='REGISTERED'&&['YOUTUBE','VIDEO_PROJECT'].includes(p.project_type))||[];
  if(primary.some(p=>!F?.project(projects,p).fresh))out.push('PROJECT_DATA_NOT_FRESH');
  if(primary.some(p=>!window.RenguinSemantics||window.RenguinSemantics.view(p).status==='UNKNOWN'))out.push('PROJECT_STAGE_UNVERIFIED');
  if(operations?.coverage_complete!==true)out.push('EXECUTOR_COVERAGE_INCOMPLETE');
  if(!operations?.jobs?.length||operations.jobs.some(j=>!F?.lease(j).fresh||['UNKNOWN','STALE','LOST'].includes(j.effective_status)))out.push('EXECUTOR_STATUS_NOT_VERIFIED');
  if(!marks.ACTIVE_PROJECTS_READY||!marks.AGENT_STATUS_READY)out.push('CRITICAL_SURFACES_PENDING');
  return out;
 }
 function render(){
  const root=document.querySelector('#creator-office, #renguin-control-room');if(!root)return;
  mark('CRITICAL_UI_FIRST_RENDER');
  if(projects?.projection&&root.querySelector('.rc-projects, #active-projects .co-grid'))mark('ACTIVE_PROJECTS_READY');
  requestAnimationFrame(()=>requestAnimationFrame(()=>{if(blockers().length===0)mark('CRITICAL_CONTROL_TOWER_READY');}));
 }
 new MutationObserver(render).observe(document,{subtree:true,childList:true});
 const timer=setInterval(()=>{
  const nav=performance.getEntriesByType('navigation')[0];if(nav?.requestStart)marks.REQUEST_START=nav.requestStart;
  const overlay=document.querySelector('#loading-overlay');
  if(document.readyState==='complete'&&marks.ACTIVE_PROJECTS_READY&&document.querySelector('canvas')&&overlay&&getComputedStyle(overlay).display==='none'){
   mark('FULL_UI_READY');clearInterval(timer);
  }
 },50);
 window.RenguinReadiness={
  projects(value){projects=value;if(value?.projection){mark('REGISTRY_AVAILABLE');mark('CANONICAL_PROJECTION_READY');}render();},
  operations(value){operations=value;if(Array.isArray(value?.jobs))mark('AGENT_STATUS_READY');render();},
  snapshot(){return {marks:{...marks},critical_ready:blockers().length===0,blockers:blockers(),
   project_status:projects?.status||'UNKNOWN',executor_coverage_complete:operations?.coverage_complete===true,
   time_origin:performance.timeOrigin,clock:'NAVIGATION_INCLUDING_PRE_REQUEST_WAIT'};}
 };
})();
