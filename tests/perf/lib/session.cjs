"use strict";
// One page in one fresh Chrome, and the ways of measuring what it does.
const fs = require("node:fs");
const path = require("node:path");
const { launchChrome, sleep, traceCapture } = require("./cdp.cjs");
const { frameStats, distribution, round, median } = require("./stats.cjs");

const PROBE = fs.readFileSync(path.join(__dirname, "probe.js"), "utf8");

// The user's display is a 5120x1440 panel at 120 Hz with Windows at 150%: a maximised
// Chrome window is ~3413 x 960 CSS px at DPR 1.5. The others are for comparison.
const VIEWPORTS = {
  ultrawide: { width: 3413, height: 960, dpr: 1.5, mobile: false },
  desktop: { width: 1936, height: 1096, dpr: 1, mobile: false },
  mobile: { width: 500, height: 900, dpr: 2, mobile: true, emulate: { width: 390, height: 844, deviceScaleFactor: 2 } },
};

const num = (v) => (Number.isFinite(v) ? v : 0);

async function open({ base, urlPath = "/?intro=off", viewport = "ultrawide", headless = true, audit = false, cache = false, waitUsable = true, usableTimeoutMs = 40000, chrome: reuse, args = [] }) {
  const vp = VIEWPORTS[viewport];
  const chrome = reuse || (await launchChrome({ headless, width: vp.width, height: vp.height, dpr: vp.dpr, args }));
  const page = await chrome.newPage();
  const c = page.client;
  for (const d of ["Page", "Runtime", "Performance", "Network", "Log", "DOM", "Memory", "HeapProfiler"]) await c.send(d + ".enable").catch(() => {});
  await c.send("Network.setCacheDisabled", { cacheDisabled: !cache });
  if (vp.mobile && vp.emulate) {
    await c.send("Emulation.setDeviceMetricsOverride", { ...vp.emulate, mobile: true });
    await c.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  }
  await c.send("Page.addScriptToEvaluateOnNewDocument", { source: `window.__soMode=${JSON.stringify(audit ? "audit" : "light")};` + PROBE });
  const s = { chrome, page, c, base, viewport, vp, errors: [], requests: new Map(), reqOrder: [], consoleWarn: 0, navStart: null, closed: false };
  c.on("Runtime.exceptionThrown", (p) => s.errors.push((p.exceptionDetails.exception && p.exceptionDetails.exception.description) || p.exceptionDetails.text));
  c.on("Log.entryAdded", (p) => {
    if (p.entry.level === "error" && !/favicon|Failed to load resource: the server responded with a status of 404/.test(p.entry.text)) s.errors.push("log:" + p.entry.text.slice(0, 200));
  });
  c.on("Network.requestWillBeSent", (p) => {
    const url = p.request.url.replace(base, "");
    const r = { id: p.requestId, url, method: p.request.method, t: p.timestamp, wall: p.wallTime, type: p.type, bytes: 0, status: 0, finished: 0 };
    s.requests.set(p.requestId, r);
    s.reqOrder.push(r);
  });
  c.on("Network.responseReceived", (p) => {
    const r = s.requests.get(p.requestId);
    if (r) {
      r.status = p.response.status;
      r.mime = p.response.mimeType;
      r.fromCache = p.response.fromDiskCache || p.response.fromPrefetchCache;
      r.recv = p.timestamp;
    }
  });
  c.on("Network.loadingFinished", (p) => {
    const r = s.requests.get(p.requestId);
    if (r) {
      r.bytes = p.encodedDataLength;
      r.finished = p.timestamp;
    }
  });
  s.ev = async (expr) => {
    const r = await c.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error("EVAL " + (r.exceptionDetails.exception && r.exceptionDetails.exception.description) + " :: " + expr.slice(0, 120));
    return r.result && r.result.value;
  };
  s.json = async (expr) => JSON.parse(await s.ev(`JSON.stringify(${expr})`));
  s.metrics = async () => Object.fromEntries((await c.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
  s.navigate = async (url, { wait = "load" } = {}) => {
    const loaded = c.once("Page.loadEventFired", () => true, 90000).catch(() => null);
    s.navStart = Date.now();
    await c.send("Page.navigate", { url });
    if (wait) await loaded;
  };
  s.usable = () =>
    s.ev(`(function(){var card=document.querySelector('article.co-project[data-project-id]'); var cv=document.querySelector('#game-container canvas'); var m=document.querySelectorAll('button.co-member').length;
      return !!card && !!cv && cv.width>0 && m>0;})()`);
  s.waitUsable = async (timeoutMs = usableTimeoutMs) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (await s.usable().catch(() => false)) return Date.now() - (s.navStart || t0);
      await sleep(80);
    }
    return null;
  };
  s.close = async () => {
    if (s.closed) return;
    s.closed = true;
    await chrome.closePage(page).catch(() => {});
  };
  s.shutdown = async () => {
    await s.close();
    if (!reuse) await chrome.close();
  };
  if (urlPath) {
    await s.navigate(base + urlPath);
    if (waitUsable) s.usableAfterMs = await s.waitUsable();
  }
  return s;
}

/** Everything the page does between start and stop: frames, main thread, CPU, tasks, network. */
async function measure(s, during, { label = "window", frames = true, settleMs = 0 } = {}) {
  const { c, chrome } = s;
  await s.ev(`window.__so.clearObserved(); 1`);
  const reqMark = s.reqOrder.length;
  if (frames) await s.ev(`window.__so.startFrames(); 1`);
  const m0 = await s.metrics();
  const cpu0 = await chrome.cpu();
  const t0 = Date.now();
  let extra;
  try {
    extra = await during();
  } finally {
    // stop first so the recorder never runs into the readout
  }
  if (settleMs) await sleep(settleMs);
  const t1 = Date.now();
  const m1 = await s.metrics();
  const cpu1 = await chrome.cpu();
  const rec = frames ? await s.ev(`window.__so.stopFrames()`) : { t: [], y: [] };
  const ts = rec.t;
  const seconds = (t1 - t0) / 1000;
  const probe = await s.json(`{longtasks: window.__so.longtasks, loaf: window.__so.loaf, events: window.__so.events}`);
  const d = (k) => (m1[k] - m0[k]) / seconds;
  const cpuPct = (k) => round((((cpu1[k] || 0) - (cpu0[k] || 0)) / seconds) * 100, 1);
  const longs = probe.longtasks.map((l) => l.d);
  const reqs = s.reqOrder.slice(reqMark).filter((r) => r.finished || r.status);
  const out = {
    label,
    seconds: round(seconds, 2),
    frames: frames ? frameStats(ts) : null,
    where: frames ? hitchMap(rec) : null,
    main: {
      task_ms_per_s: round(d("TaskDuration") * 1000, 1),
      script_ms_per_s: round(d("ScriptDuration") * 1000, 1),
      layout_ms_per_s: round(d("LayoutDuration") * 1000, 2),
      style_ms_per_s: round(d("RecalcStyleDuration") * 1000, 1),
      style_recalcs_per_s: round(d("RecalcStyleCount"), 1),
      layouts_per_s: round(d("LayoutCount"), 1),
      heap_mb: round(m1.JSHeapUsedSize / 1048576, 1),
      dom_nodes: m1.Nodes,
      listeners: m1.JSEventListeners,
      documents: m1.Documents,
      frames_count: m1.Frames,
    },
    cpu_pct_of_one_core: { renderer: cpuPct("renderer"), gpu: cpuPct("GPU"), browser: cpuPct("browser"), total: cpuPct("total") },
    long_tasks: { count: longs.length, over_100: longs.filter((x) => x > 100).length, sum_ms: round(longs.reduce((a, b) => a + b, 0), 0), max_ms: longs.length ? Math.max(...longs) : 0, list: probe.longtasks.slice(0, 20) },
    loaf: { count: probe.loaf.length, worst_ms: probe.loaf.length ? Math.max(...probe.loaf.map((l) => l.d)) : 0, top: probe.loaf.slice().sort((a, b) => b.d - a.d).slice(0, 6) },
    slow_events: probe.events.slice(0, 12),
    network: netSummary(reqs, seconds),
  };
  out.extra = extra;
  return out;
}

/** Where on the page the frames were lost, and the worst few, with the moment they happened. */
function hitchMap(rec) {
  const { t, y } = rec;
  if (!t || t.length < 3) return null;
  const st = frameStats(t);
  const interval = st.interval_ms;
  const buckets = new Map();
  const worst = [];
  for (let i = 1; i < t.length; i++) {
    const d = t[i] - t[i - 1];
    if (d > interval * 1.5) {
      const b = Math.floor(y[i] / 250) * 250;
      const e = buckets.get(b) || { at_y: b, hitches: 0, lost_ms: 0, worst_ms: 0 };
      e.hitches++;
      e.lost_ms += d - interval;
      e.worst_ms = Math.max(e.worst_ms, d);
      buckets.set(b, e);
    }
    worst.push({ d, i });
  }
  worst.sort((a, b) => b.d - a.d);
  return {
    hitches_by_scroll_y: [...buckets.values()].sort((a, b) => b.lost_ms - a.lost_ms).slice(0, 8).map((e) => ({ ...e, lost_ms: round(e.lost_ms, 0), worst_ms: round(e.worst_ms, 0) })),
    worst_frames: worst.slice(0, 6).map((w) => ({ ms: round(w.d, 1), at_s: round((t[w.i] - t[0]) / 1000, 2), scroll_y: Math.round(y[w.i]) })),
  };
}

function netSummary(reqs, seconds) {
  const by = new Map();
  for (const r of reqs) {
    const key = r.url.split("?")[0].replace(/\/(\d+|[0-9a-f]{8,})(?=\/|$)/g, "/:id");
    const e = by.get(key) || { url: key, n: 0, bytes: 0, max_bytes: 0, methods: new Set(), times: [] };
    e.n++;
    e.bytes += r.bytes || 0;
    e.max_bytes = Math.max(e.max_bytes, r.bytes || 0);
    e.methods.add(r.method);
    e.times.push(r.t);
    by.set(key, e);
  }
  const rows = [...by.values()]
    .map((e) => {
      e.times.sort((a, b) => a - b);
      const gaps = e.times.slice(1).map((t, i) => t - e.times[i]);
      return { url: e.url, n: e.n, per_min: round((e.n / seconds) * 60, 1), kb_per_req: round(e.max_bytes / 1024, 1), kb_per_s: round(e.bytes / 1024 / seconds, 1), interval_s: gaps.length ? round(median(gaps), 2) : null, methods: [...e.methods].join("/") };
    })
    .sort((a, b) => b.kb_per_s - a.kb_per_s);
  const nonGet = reqs.filter((r) => r.method !== "GET").map((r) => `${r.method} ${r.url.split("?")[0]}`);
  return { requests: reqs.length, total_kb: round(reqs.reduce((a, r) => a + (r.bytes || 0), 0) / 1024, 0), kb_per_s: round(reqs.reduce((a, r) => a + (r.bytes || 0), 0) / 1024 / seconds, 1), non_get: [...new Set(nonGet)], top: rows.slice(0, 12) };
}

// ---------------------------------------------------------------- input
/** A reader's scroll through the browser's own input path (wheel events at the gesture's speed). */
async function scrollGesture(s, { x, y, distance, speed, source = "mouse" }) {
  await s.c.send("Input.synthesizeScrollGesture", { x, y, yDistance: -distance, speed, gestureSourceType: source, preventFling: true, repeatCount: 0 }, 120000);
}

async function click(s, selector, { index = 0 } = {}) {
  const box = await s.json(`(function(){var e=document.querySelectorAll(${JSON.stringify(selector)})[${index}]; if(!e) return null; e.scrollIntoView({block:'center',behavior:'instant'}); var r=e.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height};})()`);
  if (!box || !box.w) return false;
  await s.c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y });
  await s.c.send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1 });
  await s.c.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "left", clickCount: 1 });
  return true;
}

/** How long until the page has painted two frames after `action` ran: what an interaction feels like. */
async function paintLatency(s, action) {
  await s.ev(`window.__lat = null; 1`);
  const t0 = await s.ev(`performance.now()`);
  await action();
  return s.ev(`new Promise(function(res){var start=${t0}; var n=0; (function f(){ n++; if(n>=3) res(performance.now()-start); else requestAnimationFrame(f); })(); })`);
}

// ---------------------------------------------------------------- refresh rate
async function refreshRate(s) {
  await s.ev(`window.__so.startFrames(); 1`);
  await sleep(2500);
  const rec = await s.ev(`window.__so.stopFrames()`);
  const st = frameStats(rec.t);
  return st.error ? null : st.refresh_hz;
}

module.exports = { VIEWPORTS, open, measure, netSummary, scrollGesture, click, paintLatency, refreshRate, sleep, traceCapture, frameStats, distribution, round, median, num };
