"use strict";
// "Which code broke the frame?" — every main-thread task over a threshold, named by the JS
// sampling profile that ran alongside the trace, and by the response that had just arrived
// when the profile only says "(program)" (native work such as parsing a large JSON body).
const { sleep, traceCapture } = require("./cdp.cjs");
const T = require("./trace.cjs");
const { round, median } = require("./stats.cjs");

const CATEGORIES = "devtools.timeline,disabled-by-default-devtools.timeline,v8.gc";

async function capture(s, seconds, { thresholdMs = 8, categories = CATEGORIES, during } = {}) {
  await s.c.send("Profiler.enable");
  await s.c.send("Profiler.setSamplingInterval", { interval: 200 });
  let profile;
  const { events } = await traceCapture(s.c, categories, async () => {
    await s.c.send("Profiler.start");
    if (during) await during();
    else await sleep(seconds * 1000);
    profile = (await s.c.send("Profiler.stop", {}, 120000)).profile;
  });
  await s.c.send("Profiler.disable").catch(() => {});
  return analyze(events, profile, { thresholdMs, seconds });
}

function analyze(events, profile, { thresholdMs, seconds }) {
  const th = T.findMainThread(events);
  if (!th) return { error: "NO_MAIN_THREAD" };
  const list = T.threadEvents(events, th);
  let t0 = Infinity;
  for (const e of events) if (e.pid === th.pid && e.tid === th.tid && e.ts && e.ts < t0) t0 = e.ts;
  const tasks = T.tasks(list);
  const busy = tasks.reduce((a, k) => a + k.dur, 0);

  // ---- profile timeline
  const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const ch of n.children || []) parent.set(ch, n.id);
  const times = [];
  let t = profile.startTime;
  for (let i = 0; i < profile.samples.length; i++) {
    t += profile.timeDeltas[i];
    times.push(t);
  }
  const short = (n) => `${n.callFrame.functionName || "(anon)"} ${(n.callFrame.url || "").replace(/^https?:\/\/[^/]+/, "").replace(/\?.*$/, "").replace(/^\/static\//, "")}:${n.callFrame.lineNumber + 1}`;
  const appStack = (id) => {
    const out = [];
    for (let cur = id; cur; cur = parent.get(cur)) {
      const n = nodes.get(cur);
      const u = n.callFrame.url || "";
      if (u && !/phaser/.test(u)) out.push(short(n));
      else if (/phaser/.test(u) && out.length === 0) out.push("[phaser] " + short(n));
    }
    return out.slice(0, 3).join(" < ") || "(native)";
  };
  const lower = (x) => {
    let lo = 0;
    let hi = times.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (times[m] < x) lo = m + 1;
      else hi = m;
    }
    return lo;
  };

  // ---- network from the same trace, so no clock has to be aligned
  const urlOf = (e) => ((e.args && e.args.data && e.args.data.url) || "").replace(/^https?:\/\/[^/]+/, "").split("?")[0];
  const byReq = new Map();
  for (const e of events) {
    if (!/^Resource(SendRequest|ReceiveResponse|Finish)$/.test(e.name)) continue;
    const d = e.args.data || {};
    const r = byReq.get(d.requestId) || { url: "", fin: 0, decoded: 0 };
    if (d.url) r.url = urlOf(e);
    if (e.name === "ResourceFinish") {
      r.fin = e.ts;
      r.decoded = d.decodedBodyLength || 0;
    }
    byReq.set(d.requestId, r);
  }
  const finished = [...byReq.values()].filter((r) => r.fin && r.url && !/\.(png|webp|css|js|jpg|svg|woff2?)$/.test(r.url));

  // ---- each task over the threshold
  // The profiler's own start-up is a long task at the very start of the window; it is not the page's.
  const big = tasks.filter((k) => k.dur > thresholdMs * 1000 && k.ts - t0 > 400000).sort((a, b) => a.ts - b.ts);
  const spikes = big.map((k) => {
    const a = lower(k.ts);
    const b = lower(k.ts + k.dur);
    const agg = new Map();
    for (let i = a; i < b; i++) {
      const n = nodes.get(profile.samples[i]);
      const nm = n.callFrame.functionName;
      const key = nm === "(idle)" || nm === "(program)" || nm === "(garbage collector)" ? nm : appStack(profile.samples[i]);
      agg.set(key, (agg.get(key) || 0) + profile.timeDeltas[i]);
    }
    const top = [...agg.entries()].sort((x, y) => y[1] - x[1])[0];
    // Parsing a body costs by its size, so of the responses that had just arrived the biggest is the suspect.
    const near = finished
      .filter((r) => r.fin <= k.ts + 2000 && r.fin >= k.ts - 150000)
      .sort((a, b) => b.decoded - a.decoded)
      .map((r) => `${r.url} ${round(r.decoded / 1024, 0)}KB`);
    return {
      t_s: round((k.ts - t0) / 1e6, 2),
      dur_ms: round(k.dur / 1000, 1),
      culprit: top ? top[0] : "?",
      culprit_ms: top ? round(top[1] / 1000, 1) : 0,
      inside: T.describeTask(k, 2),
      just_after_response: near.slice(0, 3),
    };
  });

  // ---- families: the same culprit recurring is a period, and a period has an owner
  const fam = new Map();
  for (const sp of spikes) {
    const key = sp.culprit === "(program)" && sp.just_after_response.length ? "(native) after " + sp.just_after_response[0].replace(/ \d+KB$/, "") : sp.culprit;
    const f = fam.get(key) || { family: key, count: 0, total_ms: 0, max_ms: 0, at: [] };
    f.count++;
    f.total_ms += sp.dur_ms;
    f.max_ms = Math.max(f.max_ms, sp.dur_ms);
    f.at.push(sp.t_s);
    fam.set(key, f);
  }
  const families = [...fam.values()]
    .map((f) => {
      const gaps = f.at.slice(1).map((x, i) => x - f.at[i]);
      return { family: f.family, count: f.count, total_ms: round(f.total_ms, 0), max_ms: f.max_ms, period_s: gaps.length >= 2 ? round(median(gaps), 2) : null };
    })
    .sort((a, b) => b.total_ms - a.total_ms);

  // ---- who owns the JS time overall
  const owner = new Map();
  let sampled = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    const n = nodes.get(profile.samples[i]);
    const nm = n.callFrame.functionName;
    if (nm === "(idle)") continue;
    sampled += profile.timeDeltas[i];
    const key = nm === "(program)" || nm === "(garbage collector)" ? nm : appStack(profile.samples[i]);
    owner.set(key, (owner.get(key) || 0) + profile.timeDeltas[i]);
  }
  const owners = [...owner.entries()].sort((x, y) => y[1] - x[1]).slice(0, 14).map(([k, us]) => ({ owner: k, ms_per_s: round(us / 1000 / seconds, 2) }));

  // ---- self time by trace event name, for the non-JS side (style, layout, paint, commit)
  const selfBy = T.selfTimes(list, (e) => e.name)
    .slice(0, 12)
    .map((r) => ({ event: r.key, ms_per_s: round(r.self_us / 1000 / seconds, 2), calls_per_s: round(r.count / seconds, 1), max_ms: round(r.max_self_us / 1000, 1) }));

  return {
    seconds,
    tasks: tasks.length,
    busy_ms_per_s: round(busy / 1000 / seconds, 1),
    over_threshold: big.length,
    threshold_ms: thresholdMs,
    spikes_per_min: round((big.length / seconds) * 60, 1),
    spike_ms_total: round(big.reduce((a, k) => a + k.dur, 0) / 1000, 0),
    families,
    spikes: spikes.slice(0, 60),
    js_owners: owners,
    non_idle_sampled_ms_per_s: round(sampled / 1000 / seconds, 1),
    self_by_event: selfBy,
  };
}

module.exports = { capture, analyze, CATEGORIES };
