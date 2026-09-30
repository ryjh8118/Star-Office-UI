"use strict";
// Median of several single-run result files: node tests/perf/merge.cjs --out merged.json run1.json run2.json ...
const fs = require("node:fs");
const { aggregate } = require("./office-perf.cjs");
const argv = process.argv.slice(2);
const oi = argv.indexOf("--out");
const out = oi >= 0 ? argv[oi + 1] : null;
const files = argv.filter((a, i) => !a.startsWith("--") && i !== oi + 1);
const parsed = files.map((f) => JSON.parse(fs.readFileSync(f, "utf8")));
const runs = parsed.flatMap((p) => p.runs);
const result = { meta: { ...parsed[0].meta, runs: runs.length, merged_from: files.map((f) => f.split(/[\/]/).pop()) }, runs, median: aggregate(runs.map((r) => JSON.parse(JSON.stringify(r)))) };
if (out) fs.writeFileSync(out, JSON.stringify(result, null, 1));
console.log(`merged ${runs.length} runs${out ? " -> " + out : ""}`);
