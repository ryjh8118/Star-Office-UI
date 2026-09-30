"use strict";
// Before / after, same environment, same scenarios:
//   node tests/perf/compare.cjs before.json after.json [--md out.md] [--title "..."]
// Both files are outputs of office-perf.cjs (or merge.cjs); medians are compared.
const fs = require("node:fs");
const argv = process.argv.slice(2);
const files = argv.filter((a, i) => !a.startsWith("--") && !["--md", "--title"].includes(argv[i - 1]));
const opt = (n) => (argv.includes("--" + n) ? argv[argv.indexOf("--" + n) + 1] : null);
const [A, B] = files.map((f) => JSON.parse(fs.readFileSync(f, "utf8")).median);
const get = (o, p) => p.split(".").reduce((x, k) => (x === undefined || x === null ? undefined : x[k]), o);

// [label, path, unit, better: "low" | "high"]
const ROWS = [
  ["## Office idle (top of the desk, 30 s)"],
  ["Average FPS", "desk.idle.frames.fps", "", "high"],
  ["Frame time P95", "desk.idle.frames.p95_ms", "ms", "low"],
  ["Frame time P99", "desk.idle.frames.p99_ms", "ms", "low"],
  ["Frame time P99.9", "desk.idle.frames.p999_ms", "ms", "low"],
  ["Worst frame", "desk.idle.frames.worst_ms", "ms", "low"],
  ["Frames > 16.7 ms", "desk.idle.frames.gt_16_67", "", "low"],
  ["Hitches / min (frame > 1.5x budget)", "desk.idle.frames.hitches_per_min", "", "low"],
  ["Missed-frame ratio", "desk.idle.frames.missed_ratio", "", "low"],
  ["Long tasks > 50 ms", "desk.idle.long_tasks.count", "", "low"],
  ["Main thread busy", "desk.idle.main.task_ms_per_s", "ms/s", "low"],
  ["  script", "desk.idle.main.script_ms_per_s", "ms/s", "low"],
  ["  style recalcs", "desk.idle.main.style_recalcs_per_s", "/s", "low"],
  ["  style time", "desk.idle.main.style_ms_per_s", "ms/s", "low"],
  ["  layouts", "desk.idle.main.layouts_per_s", "/s", "low"],
  ["CPU (renderer+GPU+browser)", "desk.idle.cpu_pct_of_one_core.total", "% core", "low"],
  ["  renderer", "desk.idle.cpu_pct_of_one_core.renderer", "% core", "low"],
  ["  GPU process", "desk.idle.cpu_pct_of_one_core.gpu", "% core", "low"],
  ["Polling traffic", "desk.idle.network.kb_per_s", "KB/s", "low"],
  ["JS heap", "desk.idle.main.heap_mb", "MB", "low"],
  ["Main thread busy (nothing of the harness in the page)", "desk.idle_quiet.main.task_ms_per_s", "ms/s", "low"],
  ["  style recalcs (same window)", "desk.idle_quiet.main.style_recalcs_per_s", "/s", "low"],
  ["  CPU of the whole browser (same window)", "desk.idle_quiet.cpu_pct_of_one_core.total", "% core", "low"],
  ["## Entry film (a returning reader: held at the airlock while the desk loads underneath)"],
  ["Held: frame time P99", "intro.quick.hold.frames.p99_ms", "ms", "low"],
  ["Held: worst frame", "intro.quick.hold.frames.worst_ms", "ms", "low"],
  ["Held: frames > 50 ms", "intro.quick.hold.frames.gt_50", "", "low"],
  ["Held: missed-frame ratio", "intro.quick.hold.frames.missed_ratio", "", "low"],
  ["Held: long tasks", "intro.quick.hold.long_tasks.count", "", "low"],
  ["The way in: worst frame", "intro.quick.the_way_in.frames.worst_ms", "ms", "low"],
  ["First visit, the way in: worst frame", "intro.full.the_way_in.frames.worst_ms", "ms", "low"],
  ["## What each part of the page costs at rest (main thread ms/s)"],
  ["top of the page", "regions.y0.task_ms_per_s", "ms/s", "low"],
  ["y = 800", "regions.y800.task_ms_per_s", "ms/s", "low"],
  ["y = 1600", "regions.y1600.task_ms_per_s", "ms/s", "low"],
  ["y = 2600 (decks)", "regions.y2600.task_ms_per_s", "ms/s", "low"],
  ["y = 3600", "regions.y3600.task_ms_per_s", "ms/s", "low"],
  ["y = 4900 (timeline)", "regions.y4900.task_ms_per_s", "ms/s", "low"],
  ["y = 5900 (world gate)", "regions.y5900.task_ms_per_s", "ms/s", "low"],
  ["y = 6600 (world)", "regions.y6600.task_ms_per_s", "ms/s", "low"],
  ["CPU of the whole browser at y = 1600", "regions.y1600.cpu_pct_of_one_core.total", "% core", "low"],
  ["CPU of the whole browser at y = 2600", "regions.y2600.cpu_pct_of_one_core.total", "% core", "low"],
  ["CPU of the whole browser at y = 4900", "regions.y4900.cpu_pct_of_one_core.total", "% core", "low"],
  ["Running animations at y = 2600", "regions.y2600.running_animations", "", "low"],
  ["Running animations at y = 4900", "regions.y4900.running_animations", "", "low"],
  ["## Office first scroll of a fresh page (1500 px/s, down and up once: its tiles have never been drawn)"],
  ["Average FPS", "desk.scroll_first.frames.fps", "", "high"],
  ["Frame time P95", "desk.scroll_first.frames.p95_ms", "ms", "low"],
  ["Frame time P99", "desk.scroll_first.frames.p99_ms", "ms", "low"],
  ["Worst frame", "desk.scroll_first.frames.worst_ms", "ms", "low"],
  ["Frames > 33.3 ms", "desk.scroll_first.frames.gt_33_3", "", "low"],
  ["Frames > 50 ms", "desk.scroll_first.frames.gt_50", "", "low"],
  ["Missed-frame ratio", "desk.scroll_first.frames.missed_ratio", "", "low"],
  ["CPU (renderer+GPU+browser)", "desk.scroll_first.cpu_pct_of_one_core.total", "% core", "low"],
  ["## Office normal scroll, warm (1500 px/s)"],
  ["Average FPS", "desk.scroll_normal.frames.fps", "", "high"],
  ["Frame time P95", "desk.scroll_normal.frames.p95_ms", "ms", "low"],
  ["Frame time P99", "desk.scroll_normal.frames.p99_ms", "ms", "low"],
  ["Worst frame", "desk.scroll_normal.frames.worst_ms", "ms", "low"],
  ["Frames > 16.7 ms", "desk.scroll_normal.frames.gt_16_67", "", "low"],
  ["Frames > 33.3 ms", "desk.scroll_normal.frames.gt_33_3", "", "low"],
  ["Missed-frame ratio", "desk.scroll_normal.frames.missed_ratio", "", "low"],
  ["Long tasks > 50 ms", "desk.scroll_normal.long_tasks.count", "", "low"],
  ["Main thread busy", "desk.scroll_normal.main.task_ms_per_s", "ms/s", "low"],
  ["  style recalcs", "desk.scroll_normal.main.style_recalcs_per_s", "/s", "low"],
  ["CPU (renderer+GPU+browser)", "desk.scroll_normal.cpu_pct_of_one_core.total", "% core", "low"],
  ["## Office fast scroll (6000 px/s)"],
  ["Average FPS", "desk.scroll_fast.frames.fps", "", "high"],
  ["Frame time P95", "desk.scroll_fast.frames.p95_ms", "ms", "low"],
  ["Frame time P99", "desk.scroll_fast.frames.p99_ms", "ms", "low"],
  ["Worst frame", "desk.scroll_fast.frames.worst_ms", "ms", "low"],
  ["Missed-frame ratio", "desk.scroll_fast.frames.missed_ratio", "", "low"],
  ["## Project list (deck expanded to every project)"],
  ["Expand latency", "desk.projects.expand_latency_ms", "ms", "low"],
  ["Scroll: frame time P99", "desk.projects.scroll_through_expanded.frames.p99_ms", "ms", "low"],
  ["Scroll: worst frame", "desk.projects.scroll_through_expanded.frames.worst_ms", "ms", "low"],
  ["Scroll: missed-frame ratio", "desk.projects.scroll_through_expanded.frames.missed_ratio", "", "low"],
  ["## Panels / drawers"],
  ["env panel open", "desk.panels.per_toggle.env-panel.open_ms.median_ms", "ms", "low"],
  ["work-history toggle", "desk.panels.per_toggle.work-history-zone.open_ms.median_ms", "ms", "low"],
  ["office collapse", "desk.panels.per_toggle.office-collapse.open_ms.median_ms", "ms", "low"],
  ["Heap growth over 24 toggles", "desk.panels.growth.heap_mb", "MB", "low"],
  ["Listener growth over 24 toggles", "desk.panels.growth.listeners", "", "low"],
  ["## Office -> Renguin World"],
  ["Descent: frame time P99", "world.descent.frames.p99_ms", "ms", "low"],
  ["Descent: worst frame", "world.descent.frames.worst_ms", "ms", "low"],
  ["Descent: missed-frame ratio", "world.descent.frames.missed_ratio", "", "low"],
  ["Descent: long tasks > 50 ms", "world.descent.long_tasks.count", "", "low"],
  ["World assets loaded", "world.world_asset_total_kb", "KB", "low"],
  ["City idle: frame time P99", "world.city_idle.frames.p99_ms", "ms", "low"],
  ["City idle: main thread", "world.city_idle.main.task_ms_per_s", "ms/s", "low"],
  ["City idle: CPU", "world.city_idle.cpu_pct_of_one_core.total", "% core", "low"],
  ["City interactions: worst frame", "world.city_interactions.frames.worst_ms", "ms", "low"],
  ["Ascent: frame time P99", "world.ascent.frames.p99_ms", "ms", "low"],
  ["Ascent: missed-frame ratio", "world.ascent.frames.missed_ratio", "", "low"],
  ["Back at the desk: world animations still running", "world.back_at_desk.world_running_animations", "", "low"],
  ["Desk idle after the trip: main thread", "world.desk_idle_after.task_ms_per_s", "ms/s", "low"],
  ["## Load"],
  ["Time to usable UI (cold)", "load.cold.time_to_usable_ms", "ms", "low"],
  ["Time to usable UI (warm)", "load.warm.time_to_usable_ms", "ms", "low"],
  ["Cold: long tasks total", "load.cold.long_tasks.sum_ms", "ms", "low"],
  ["Cold: longest task", "load.cold.long_tasks.max_ms", "ms", "low"],
  ["Cold: main-thread script at usable", "load.cold.main_at_usable.script_ms", "ms", "low"],
  ["Cold: transferred", "load.cold.transferred_kb", "KB", "low"],
  ["Warm: transferred", "load.warm.transferred_kb", "KB", "low"],
  ["## Soak (repeated Office -> World -> Office)"],
  ["Heap growth / cycle", "soak.growth_per_cycle.heap_mb", "MB", "low"],
  ["DOM nodes / cycle", "soak.growth_per_cycle.nodes", "", "low"],
  ["Listeners / cycle", "soak.growth_per_cycle.listeners", "", "low"],
  ["## Backend (P50 / P95 ms per request)"],
  ["/api/renguin/projects P50", "backend./api/renguin/projects.median_ms", "ms", "low"],
  ["/api/renguin/projects P95", "backend./api/renguin/projects.p95_ms", "ms", "low"],
  ["/api/renguin/projects size", "backend./api/renguin/projects.kb", "KB", "low"],
  ["/api/creator/presentation P50", "backend./api/creator/presentation.median_ms", "ms", "low"],
  ["/api/creator/presentation P95", "backend./api/creator/presentation.p95_ms", "ms", "low"],
  ["/api/creator/event-statuses P50", "backend./api/creator/event-statuses.median_ms", "ms", "low"],
  ["/api/renguin/operations P50", "backend./api/renguin/operations.median_ms", "ms", "low"],
  ["/status P95", "backend./status.p95_ms", "ms", "low"],
  ["## Main-thread spikes at idle (trace + profile, 30 s)"],
  ["Tasks > 8 ms / min", "spikes.spikes_per_min", "", "low"],
  ["Time in those tasks", "spikes.spike_ms_total", "ms", "low"],
];

// dotted keys in the middle of a path (endpoint names) need a smarter getter
function pick(o, p) {
  if (!o) return undefined;
  const m = p.match(/^(backend)\.(\/[^ ]*?)\.(median_ms|p95_ms|kb)$/);
  if (m) return o.backend && o.backend[m[2]] ? o.backend[m[2]][m[3]] : undefined;
  const t = p.match(/^(desk\.panels\.per_toggle)\.([^.]+)\.(.*)$/);
  if (t) return get(get(o, t[1]), t[2] + "." + t[3]) ?? get(get(get(o, t[1]), t[2]), t[3]);
  return get(o, p);
}
const fmt = (v) => (v === undefined || v === null ? "n/a" : typeof v === "number" ? (Math.abs(v) >= 100 ? Math.round(v).toString() : String(Math.round(v * 1000) / 1000)) : String(v));
const lines = [];
const title = opt("title") || "Before / after";
lines.push(`# ${title}`, "", "| metric | before | after | change |", "|---|---:|---:|---:|");
for (const [label, path, unit, better] of ROWS) {
  if (!path) {
    lines.push(`| **${label.replace(/^## /, "")}** | | | |`);
    continue;
  }
  const a = pick(A, path);
  const b = pick(B, path);
  let change = "";
  if (typeof a === "number" && typeof b === "number") {
    if (a === 0 && b === 0) change = "same";
    else if (a === 0) change = `+${fmt(b)}`;
    else {
      const pct = ((b - a) / Math.abs(a)) * 100;
      const good = better === "low" ? pct < -2 : pct > 2;
      const bad = better === "low" ? pct > 2 : pct < -2;
      change = `${pct > 0 ? "+" : ""}${pct.toFixed(1)}% ${good ? "✅" : bad ? "⚠️" : ""}`.trim();
    }
  }
  lines.push(`| ${label} | ${fmt(a)}${a !== undefined && unit ? " " + unit : ""} | ${fmt(b)}${b !== undefined && unit ? " " + unit : ""} | ${change} |`);
}
const md = lines.join("\n");
console.log(md);
if (opt("md")) fs.writeFileSync(opt("md"), md + "\n");
