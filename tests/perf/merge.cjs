"use strict";
// Median of several single-run result files:
//   node tests/perf/merge.cjs --out merged.json [--slim] run1.json run2.json ...
// --slim keeps the medians whole and reduces each run to its headline numbers (lists of individual tasks, frames and
// call sites are what make a run file large; the medians already carry the shape of them).
const fs = require("node:fs");
const { aggregate } = require("./office-perf.cjs");
const argv = process.argv.slice(2);
const oi = argv.indexOf("--out");
const out = oi >= 0 ? argv[oi + 1] : null;
const slim = argv.includes("--slim");
const files = argv.filter((a, i) => !a.startsWith("--") && i !== oi + 1);
const parsed = files.map((f) => JSON.parse(fs.readFileSync(f, "utf8")));
const runs = parsed.flatMap((p) => p.runs);
const BULK = new Set(["list", "loaf", "top", "slow_events", "spikes", "sites", "fetchByUrl", "activeTimers", "activeRafs", "liveObservers", "biggest", "where", "extra"]);
const thin = (v) => {
  if (Array.isArray(v)) return v.length > 12 ? undefined : v.map(thin);
  if (v && typeof v === "object") {
    const o = {};
    for (const [k, x] of Object.entries(v)) if (!BULK.has(k)) o[k] = thin(x);
    return o;
  }
  return v;
};
const result = {
  meta: { ...parsed[0].meta, runs: runs.length, merged_from: files.map((f) => f.split(/[\/]/).pop()) },
  // the diagnostic reads (spikes, audit) are kept whole for the first run that has them: they are what the report explains from
  runs: slim ? runs.map((r, i) => Object.assign(thin(r), ["spikes", "audit"].reduce((keep, k) => (r[k] && runs.findIndex((x) => x[k]) === i ? { ...keep, [k]: r[k] } : keep), {}))) : runs,
  median: aggregate(runs.map((r) => JSON.parse(JSON.stringify(r)))),
};
if (out) fs.writeFileSync(out, JSON.stringify(result, null, 1));
console.log(`merged ${runs.length} runs${out ? " -> " + out : ""}${slim ? " (slim)" : ""}`);
