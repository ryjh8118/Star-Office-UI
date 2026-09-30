"use strict";
// Several merged result files (each a different set of scenarios, medians already taken) into one report input:
//   node tests/perf/combine.cjs --out all.json [--slim] kpi.json interactions.json diag.json soak.json
// Scenario keys are unioned; where two files share a key (the desk page holds both idle/scroll and projects/panels) the objects are merged.
const fs = require("node:fs");
const argv = process.argv.slice(2);
const oi = argv.indexOf("--out");
const out = oi >= 0 ? argv[oi + 1] : null;
const slim = argv.includes("--slim");
const files = argv.filter((a, i) => !a.startsWith("--") && i !== oi + 1);
const parsed = files.map((f) => JSON.parse(fs.readFileSync(f, "utf8")));
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const deep = (a, b) => {
  if (!isObj(a) || !isObj(b)) return b === undefined ? a : b;
  const r = { ...a };
  for (const [k, v] of Object.entries(b)) r[k] = k in a ? deep(a[k], v) : v;
  return r;
};
const median = parsed.reduce((acc, p) => deep(acc, p.median || {}), {});
const meta = { ...parsed[0].meta, scenarios: [...new Set(parsed.flatMap((p) => p.meta.scenarios || []))], runs: Math.max(...parsed.map((p) => p.meta.runs || 1)), combined_from: files.map((f) => f.split(/[\/]/).pop()), per_file_runs: parsed.map((p) => p.meta.runs) };
// diagnostic reads (the spike trace and the audit) are kept whole from whichever file has them: the report explains from them
const runs = parsed.flatMap((p) => p.runs || []);
const thin = (v) => (Array.isArray(v) ? (v.length > 12 ? undefined : v.map(thin)) : isObj(v) ? Object.fromEntries(Object.entries(v).filter(([k]) => !["list", "loaf", "top", "slow_events", "sites", "fetchByUrl", "activeTimers", "activeRafs", "liveObservers", "biggest", "where", "extra"].includes(k)).map(([k, x]) => [k, thin(x)])) : v);
const result = { meta, runs: slim ? runs.map((r) => Object.assign(thin(r), r.spikes && !r.spikes.error ? { spikes: r.spikes } : {}, r.audit && !r.audit.error ? { audit: r.audit } : {})) : runs, median };
if (out) {
  fs.writeFileSync(out, JSON.stringify(result, null, 1));
  console.log("combined", files.length, "files ->", out, Math.round(fs.statSync(out).size / 1024) + " KB");
} else console.log(JSON.stringify(result.meta));
