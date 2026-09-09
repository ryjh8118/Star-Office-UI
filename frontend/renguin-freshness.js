/* One timestamp predicate for every Office decision surface. No state authority. */
(() => {
  'use strict';
  function epoch(value) {
    if(typeof value==='number')return Number.isFinite(value)?value:NaN;
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value))return NaN;
    return Date.parse(value)/1000;
  }
  function inspect(value, allowedSeconds, now=Date.now()/1000) {
    const timestamp=epoch(value),age=now-timestamp;
    if(!Number.isFinite(timestamp)||!Number.isFinite(now)||!Number.isFinite(allowedSeconds)||allowedSeconds<0)
      return {fresh:false,status:'UNKNOWN',reason:'INVALID_OR_MISSING_TIMESTAMP',age:null};
    if(age<0)return {fresh:false,status:'UNKNOWN',reason:'FUTURE_TIMESTAMP',age};
    if(age>allowedSeconds)return {fresh:false,status:'STALE',reason:'TTL_EXPIRED',age};
    return {fresh:true,status:'FRESH',reason:null,age};
  }
  function envelope(response, now=Date.now()/1000) {
    if(!response?.projection)return {fresh:false,status:'UNAVAILABLE',reason:'NO_VERIFIED_PROJECTION'};
    if(!['FRESH','LIVE'].includes(response.status))return {fresh:false,status:response.status==='STALE'?'STALE':'UNKNOWN',reason:'ENVELOPE_NOT_FRESH'};
    const p=response.projection,limit=p.freshness_threshold_seconds;
    const transport=inspect(p.generated_at,limit,now);
    if(!transport.fresh)return transport;
    return inspect(p.source?.high_water_timestamp,limit,now);
  }
  function project(response, value, now=Date.now()/1000) {
    const outer=envelope(response,now);
    return outer.fresh?inspect(value?.updated_at,response.projection.freshness_threshold_seconds,now):outer;
  }
  function lease(job, now=Date.now()/1000) {
    const heartbeat=epoch(job?.last_heartbeat),expiry=epoch(job?.lease_expires_at);
    const ttl=expiry-heartbeat;
    if(!Number.isFinite(ttl)||ttl<0||ttl>300)return {fresh:false,status:'UNKNOWN',reason:'INVALID_LEASE_TTL'};
    return inspect(heartbeat,ttl,now);
  }
  const api=Object.freeze({epoch,inspect,envelope,project,lease});
  if(typeof window!=='undefined')window.RenguinFreshness=api;
  if(typeof module!=='undefined')module.exports=api;
})();
