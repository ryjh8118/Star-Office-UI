"use strict";
// Turn a merged result file into the report a person reads:
//   node tests/perf/report.cjs merged.json out.md [--title "..."]
const fs = require("node:fs");
const argv = process.argv.slice(2);
const [input, output] = argv.filter((a) => !a.startsWith("--"));
const titleAt = argv.indexOf("--title");
const title = titleAt >= 0 ? argv[titleAt + 1] : "Star Office performance";
const data = JSON.parse(fs.readFileSync(input, "utf8"));
const m = data.median;
const meta = data.meta;
const n = (v, d = 1) => (v === undefined || v === null ? "–" : typeof v === "number" ? (Math.round(v * 10 ** d) / 10 ** d).toString() : String(v));
const pct = (v) => (v === undefined || v === null ? "–" : (v * 100).toFixed(1) + "%");
const L = [];
const table = (head, rows) => {
  L.push("| " + head.join(" | ") + " |", "|" + head.map((h, i) => (i ? "---:" : "---")).join("|") + "|");
  for (const r of rows) L.push("| " + r.join(" | ") + " |");
  L.push("");
};

L.push(`# ${title}`, "");
L.push(`- label: \`${meta.label}\` · target: \`${meta.base}\` · viewport: \`${meta.viewport}\` (${meta.viewport_css.width}x${meta.viewport_css.height} CSS px at DPR ${meta.viewport_css.dpr}) · runs: ${meta.runs} (medians) · headless: ${meta.headless} · ${meta.when}`);
if (m.desk && m.desk.refresh_hz) L.push(`- display refresh measured in the page: **${m.desk.refresh_hz} Hz** (frame budget ${n(1000 / m.desk.refresh_hz, 2)} ms)`);
if (meta.office && meta.office.office_revision) L.push(`- Office revision on that server: \`${meta.office.office_revision}\``);
L.push("");

const frameRows = [];
const add = (label, x) => {
  if (!x || !x.frames || x.frames.error) return;
  const f = x.frames;
  frameRows.push([label, n(f.fps), n(f.median_ms, 2), n(f.p95_ms, 2), n(f.p99_ms, 2), n(f.p999_ms, 1), n(f.worst_ms, 1), n(f.gt_8_33, 0), n(f.gt_16_67, 0), n(f.gt_33_3, 0), n(f.gt_50, 0), n(f.hitches_per_min, 0), pct(f.missed_ratio)]);
};
const d = m.desk || {};
const w = m.world || {};
const film = m.intro || {};
add("Entry film (returning reader): held at the airlock while the desk loads", film.quick && film.quick.hold);
add("Entry film (returning reader): the way in", film.quick && film.quick.the_way_in);
add("Entry film (first visit): held at the airlock", film.full && film.full.hold);
add("Entry film (first visit): the way in", film.full && film.full.the_way_in);
add("Office idle (30 s)", d.idle);
add("Office first scroll of a fresh page (1500 px/s)", d.scroll_first);
add("Office scroll, warm, normal (1500 px/s)", d.scroll_normal);
add("Office scroll, warm, fast (6000 px/s)", d.scroll_fast);
add("Project list: expanded deck scroll", d.projects && d.projects.scroll_through_expanded);
add("Character walking (DOM)", d.character && d.character.walking);
add("Office → World descent", w.descent);
add("World: city idle", w.city_idle);
add("World: panels / zoom / district", w.city_interactions);
add("World → Office ascent", w.ascent);
L.push("## Frame pacing", "", "Frame time is the interval between animation frames as the page sees them. Average FPS is a secondary number: the tail is what is felt.", "");
table(["scenario", "avg FPS", "median ms", "P95 ms", "P99 ms", "P99.9 ms", "worst ms", ">8.33", ">16.7", ">33.3", ">50", "hitches/min", "missed frames"], frameRows);

const cpuRows = [];
const addc = (label, x) => {
  if (!x || !x.main) return;
  cpuRows.push([label, n(x.main.task_ms_per_s, 0), n(x.main.script_ms_per_s, 0), n(x.main.style_ms_per_s, 0), n(x.main.style_recalcs_per_s, 0), n(x.main.layouts_per_s, 1), n(x.long_tasks && x.long_tasks.count, 0), n(x.long_tasks && x.long_tasks.max_ms, 0), n(x.cpu_pct_of_one_core && x.cpu_pct_of_one_core.renderer, 0), n(x.cpu_pct_of_one_core && x.cpu_pct_of_one_core.gpu, 0), n(x.cpu_pct_of_one_core && x.cpu_pct_of_one_core.total, 0), n(x.main.heap_mb, 1), n(x.main.dom_nodes, 0)]);
};
addc("Entry film held at the airlock (returning reader)", film.quick && film.quick.hold);
addc("Office idle (frame recorder running in the page)", d.idle);
addc("Office idle (nothing of the harness in the page)", d.idle_quiet);
addc("Office first scroll", d.scroll_first);
addc("Office scroll, warm, normal", d.scroll_normal);
addc("Office scroll, warm, fast", d.scroll_fast);
addc("Expanded deck scroll", d.projects && d.projects.scroll_through_expanded);
addc("Character walking", d.character && d.character.walking);
addc("Descent to the World", w.descent);
addc("City idle", w.city_idle);
addc("Ascent", w.ascent);
L.push("## Main thread and CPU", "", "Wall-clock main-thread time swings ±25% between identical runs on this machine (see the notes on measuring); style recalculations, layouts and script time are exact counters, frames are what is felt.", "");
table(["scenario", "main ms/s", "script", "style ms/s", "recalcs/s", "layouts/s", "long tasks", "longest", "renderer %", "GPU %", "total %", "heap MB", "nodes"], cpuRows);

if (m.regions) {
  L.push("## What each part of the page costs at rest", "", `Scrolled to each position and left alone for 6 s (the page is ${n(m.regions.page_height, 0)} px tall); nothing of the harness runs in the page. Main-thread time is wall-clock and noisy; the counters (style recalcs per second, running animations) are exact.`, "");
  const rows = Object.entries(m.regions)
    .filter(([k, v]) => /^y\d+$/.test(k) && v && !v.error)
    .map(([k, v]) => [k.slice(1), n(v.task_ms_per_s, 0), n(v.script_ms_per_s, 0), n(v.style_ms_per_s, 0), n(v.style_recalcs_per_s, 0), n(v.cpu_pct_of_one_core && v.cpu_pct_of_one_core.renderer, 0), n(v.cpu_pct_of_one_core && v.cpu_pct_of_one_core.gpu, 0), n(v.cpu_pct_of_one_core && v.cpu_pct_of_one_core.total, 0), n(v.running_animations, 0)]);
  table(["scroll y (px)", "main ms/s", "script", "style ms/s", "recalcs/s", "renderer %", "GPU %", "total %", "running animations"], rows);
}

if (d.idle && d.idle.network) {
  L.push("## What the desk asks for, at rest (30 s)", "", `Total: ${n(d.idle.network.kb_per_s, 0)} KB/s over ${d.idle.network.requests} requests. Non-GET requests: ${JSON.stringify(d.idle.network.non_get)}.`, "");
  table(["url", "requests/min", "KB per request", "KB/s", "interval s"], d.idle.network.top.map((r) => [`\`${r.url}\``, n(r.per_min, 0), n(r.kb_per_req, 1), n(r.kb_per_s, 1), n(r.interval_s, 2)]));
}

if (d.panels && d.panels.per_toggle) {
  L.push("## Interaction latency (mouse release → third painted frame)", "");
  const rows = Object.entries(d.panels.per_toggle).map(([k, v]) => [k, n(v.open_ms && v.open_ms.median_ms, 1), n(v.open_ms && v.open_ms.p95_ms, 1), n(v.open_ms && v.open_ms.max_ms, 1), n(v.close_ms && v.close_ms.median_ms, 1), n(v.close_ms && v.close_ms.max_ms, 1)]);
  if (d.projects) rows.push(["project deck expand / collapse", n(d.projects.expand_latency_ms, 1), "–", "–", n(d.projects.collapse_latency_ms, 1), "–"]);
  if (w.city_interaction_latency_ms) for (const [k, v] of Object.entries(w.city_interaction_latency_ms)) rows.push(["world: " + k, n(v, 1), "–", "–", "–", "–"]);
  table(["interaction", "open/first median ms", "P95", "max", "close median ms", "close max"], rows);
  if (d.panels.growth) L.push(`Panel cycles left ${n(d.panels.growth.nodes, 0)} DOM nodes, ${n(d.panels.growth.listeners, 0)} listeners and ${n(d.panels.growth.heap_mb, 1)} MB of heap behind (24 toggles).`, "");
}

if (m.load && m.load.cold) {
  L.push("## Load", "");
  const row = (label, x) => [label, n(x.time_to_usable_ms, 0), n(x.dcl_ms, 0), n(x.load_ms, 0), n(x.fcp_ms, 0), n(x.lcp_ms, 0), n(x.requests, 0), n(x.transferred_kb, 0), n(x.long_tasks && x.long_tasks.count, 0), n(x.long_tasks && x.long_tasks.sum_ms, 0), n(x.long_tasks && x.long_tasks.max_ms, 0), n(x.main_at_usable && x.main_at_usable.script_ms, 0)];
  table(["load", "usable ms", "DCL", "load", "FCP", "LCP", "requests", "KB", "long tasks", "sum ms", "longest ms", "script ms at usable"], [row("cold (no cache)", m.load.cold), row("warm (cache)", m.load.warm)]);
  L.push(`Cold load by type: ${JSON.stringify(m.load.cold.by_type)}. Largest: ${(m.load.cold.biggest || []).join("; ")}.`, "");
}

if (w && w.descent) {
  L.push("## Office → Renguin World", "");
  L.push(`- world assets loaded on the way down: ${n(w.world_asset_total_kb, 0)} KB · engine ready ${n(w.world_boot_wait_ms, 0)} ms after the last gesture`);
  L.push(`- at the desk before / after the trip: main thread ${n(w.desk_idle_before && w.desk_idle_before.task_ms_per_s, 0)} → ${n(w.desk_idle_after && w.desk_idle_after.task_ms_per_s, 0)} ms/s; world animations still running at the desk: ${n(w.back_at_desk && w.back_at_desk.world_running_animations, 0)}; world paused: ${w.back_at_desk && w.back_at_desk.paused}`);
  if (w.descent.where) L.push(`- worst frames on the way down: ${w.descent.where.worst_frames.map((x) => `${x.ms} ms at scrollY ${x.scroll_y}`).join(", ")}`);
  L.push("");
}

const runsCount = (data.runs || []).length;
const spikes = (data.runs || []).map((r) => r.spikes).filter((s) => s && !s.error)[0];
if (spikes) {
  L.push("## Main-thread spikes at rest (trace + JS profile, first run)", "", `${spikes.over_threshold} tasks over ${spikes.threshold_ms} ms in ${spikes.seconds} s = **${n(spikes.spikes_per_min, 0)}/min**, ${n(spikes.spike_ms_total, 0)} ms in total.`, "");
  table(["family (what ran)", "count", "total ms", "longest ms", "period s"], (spikes.families || []).slice(0, 10).map((f) => [f.family.replace(/\|/g, "/"), n(f.count, 0), n(f.total_ms, 0), n(f.max_ms, 1), n(f.period_s, 2)]));
  L.push("Who owns the JavaScript time (sampled, ms per second):", "");
  table(["owner", "ms/s"], (spikes.js_owners || []).slice(0, 10).map((o) => [o.owner.replace(/\|/g, "/"), n(o.ms_per_s, 2)]));
}

const audit = (data.runs || []).map((r) => r.audit).filter((a) => a && !a.error)[0];
if (audit) {
  L.push("## Audit: timers, animation-frame loops, observers, listeners (20 s at rest)", "");
  L.push(`Counts in the window: ${JSON.stringify(audit.counts)}; live listeners in the page: ${audit.dom_listeners}. Passive-ness of listeners added: ${JSON.stringify(audit.passive)}.`, "");
  table(["kind @ interval — site", "live"], Object.entries(audit.activeTimers || {}).map(([k, v]) => [k.replace(/\|/g, "/").replace(/\?v=[^:)]+/g, ""), n(v, 0)]));
  table(["animation-frame loop", "live"], Object.entries(audit.activeRafs || {}).map(([k, v]) => [k.replace(/\|/g, "/").replace(/\?v=[^:)]+/g, ""), n(v, 0)]));
  table(["observer", "live"], Object.entries(audit.liveObservers || {}).map(([k, v]) => [k.replace(/\|/g, "/").replace(/\?v=[^:)]+/g, ""), n(v, 0)]));
  L.push("Work by call site while the desk is at rest:", "");
  table(["kind", "site", "calls", "total ms", "avg ms", "max ms"], (audit.sites || []).slice(0, 14).map((s) => [s.kind.replace(/\|/g, "/"), s.site.replace(/\|/g, "/").replace(/\?v=[^:)]+/g, "").slice(0, 96), n(s.calls, 0), n(s.total_ms, 1), n(s.avg_ms, 3), n(s.max_ms, 1)]));
  if (audit.fetchByUrl && audit.fetchByUrl.length) table(["fetch", "count in 20 s", "total ms", "max ms"], audit.fetchByUrl.map((f) => [`\`${f.url}\``, n(f.n, 0), n(f.total_ms, 0), n(f.max_ms, 0)]));
}

if (m.backend) {
  L.push("## Backend latency (sequential requests, no cache)", "");
  table(["endpoint", "status", "KB", "P50 ms", "P95 ms", "P99 ms", "max ms"], Object.entries(m.backend).filter(([, v]) => v.status !== 404).map(([k, v]) => [`\`${k}\``, n(v.status, 0), n(v.kb, 1), n(v.median_ms, 1), n(v.p95_ms, 1), n(v.p99_ms, 1), n(v.max_ms, 1)]));
}

if (m.soak && m.soak.cycles) {
  L.push("## Soak: Office → panels → World → interactions → Office, repeated", "");
  table(["cycle", "heap MB", "DOM nodes", "listeners", "documents"], m.soak.cycles.map((c, i) => [n(i + 1, 0), n(c.heap_mb, 1), n(c.nodes, 0), n(c.listeners, 0), n(c.documents, 0)]));
  L.push(`Growth per cycle: heap ${n(m.soak.growth_per_cycle.heap_mb, 2)} MB, nodes ${n(m.soak.growth_per_cycle.nodes, 0)}, listeners ${n(m.soak.growth_per_cycle.listeners, 1)}.`, "");
}
if (d.wheel_over_canvas_scrolls !== undefined) L.push(`Wheel with the pointer over the pixel office scrolls the page: **${d.wheel_over_canvas_scrolls}**.`, "");

fs.writeFileSync(output, L.join("\n") + "\n");
console.log("wrote", output, L.length, "lines");
