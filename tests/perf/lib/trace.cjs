"use strict";
// Reading a Chrome trace the way DevTools' bottom-up view does: self time per event on the
// renderer's main thread, the tasks that broke the frame budget and what ran inside them.
const { round, distribution } = require("./stats.cjs");

/** The renderer main thread of the page: the CrRendererMain thread that ran the most tasks. */
function findMainThread(events) {
  const names = new Map();
  for (const e of events) {
    if (e.ph === "M" && e.name === "thread_name") names.set(`${e.pid}:${e.tid}`, e.args && e.args.name);
  }
  const tally = new Map();
  for (const e of events) {
    if (e.name !== "RunTask" && e.name !== "FireAnimationFrame" && e.name !== "FunctionCall") continue;
    const k = `${e.pid}:${e.tid}`;
    if (names.get(k) !== "CrRendererMain") continue;
    tally.set(k, (tally.get(k) || 0) + 1);
  }
  let best = null;
  for (const [k, v] of tally) if (!best || v > best.n) best = { k, n: v };
  if (!best) return null;
  const [pid, tid] = best.k.split(":").map(Number);
  return { pid, tid };
}

/** Complete events of one thread, B/E pairs folded into X, ordered so parents precede children. */
function threadEvents(events, thread, fromUs = -Infinity, toUs = Infinity) {
  const out = [];
  const open = [];
  for (const e of events) {
    if (e.pid !== thread.pid || e.tid !== thread.tid) continue;
    if (e.ph === "X" && typeof e.dur === "number") {
      if (e.ts >= fromUs && e.ts <= toUs) out.push(e);
    } else if (e.ph === "B") open.push(e);
    else if (e.ph === "E") {
      const b = open.pop();
      if (b && b.ts >= fromUs && b.ts <= toUs) out.push({ ...b, ph: "X", dur: e.ts - b.ts });
    }
  }
  out.sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  return out;
}

/** Self time by event name (and by a finer key for script), with the nesting respected. */
function selfTimes(list, keyFn) {
  const totals = new Map();
  const stack = [];
  const add = (key, dur) => {
    const t = totals.get(key) || { key, self_us: 0, total_us: 0, count: 0, max_self_us: 0 };
    t.self_us += dur;
    t.count++;
    if (dur > t.max_self_us) t.max_self_us = dur;
    totals.set(key, t);
  };
  const close = (frame) => {
    const self = Math.max(0, frame.e.dur - frame.child);
    add(keyFn(frame.e), self);
    const t = totals.get(keyFn(frame.e));
    t.total_us += frame.e.dur;
    if (stack.length) stack[stack.length - 1].child += frame.e.dur;
  };
  for (const e of list) {
    while (stack.length && stack[stack.length - 1].e.ts + stack[stack.length - 1].e.dur <= e.ts) close(stack.pop());
    stack.push({ e, child: 0 });
  }
  while (stack.length) close(stack.pop());
  return [...totals.values()].sort((a, b) => b.self_us - a.self_us);
}

const scriptKey = (e) => {
  const d = (e.args && e.args.data) || {};
  if (e.name === "FunctionCall") return `FunctionCall ${d.functionName || "(anon)"} ${(d.url || "").replace(/^https?:\/\/[^/]+/, "")}:${d.lineNumber}`;
  if (e.name === "EvaluateScript" || e.name === "v8.compile" || e.name === "v8.run") return `${e.name} ${(d.url || "").replace(/^https?:\/\/[^/]+/, "")}`;
  if (e.name === "EventDispatch") return `EventDispatch ${d.type}`;
  return e.name;
};

/** Top-level tasks with their duration and the biggest things that ran inside. */
function tasks(list) {
  const out = [];
  let cur = null;
  for (const e of list) {
    if (e.name === "RunTask") {
      cur = { ts: e.ts, dur: e.dur, children: [] };
      out.push(cur);
    } else if (cur && e.ts >= cur.ts && e.ts + e.dur <= cur.ts + cur.dur + 1) cur.children.push(e);
  }
  return out;
}

function describeTask(t, topN = 4) {
  const agg = new Map();
  const stack = [];
  // direct-ish children by inclusive time, grouped by script key
  for (const c of t.children) {
    if (c.name === "RunTask") continue;
    while (stack.length && stack[stack.length - 1].ts + stack[stack.length - 1].dur <= c.ts) stack.pop();
    if (stack.length === 0) {
      const k = scriptKey(c);
      agg.set(k, (agg.get(k) || 0) + c.dur);
    }
    stack.push(c);
  }
  return [...agg.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([k, us]) => `${k} ${round(us / 1000, 1)}ms`);
}

/** Group of numbers close in time: the gaps between consecutive spikes, to see any period. */
function periodicity(timesMs) {
  if (timesMs.length < 4) return null;
  const gaps = [];
  for (let i = 1; i < timesMs.length; i++) gaps.push(timesMs[i] - timesMs[i - 1]);
  const bins = new Map();
  for (const g of gaps) {
    const b = Math.round(g / 50) * 50;
    bins.set(b, (bins.get(b) || 0) + 1);
  }
  const top = [...bins.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  return { spikes: timesMs.length, gap_ms: distribution(gaps), common_gaps_ms: top.map(([g, n]) => `${g}ms x${n}`) };
}

module.exports = { findMainThread, threadEvents, selfTimes, scriptKey, tasks, describeTask, periodicity };
