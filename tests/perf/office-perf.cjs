"use strict";
// Star Office performance harness: frame pacing, main-thread spikes, interaction latency,
// polling load, memory — measured in a real Chrome at the size and refresh rate it is used at.
//
//   node tests/perf/office-perf.cjs --base http://127.0.0.1:19391 --label baseline \
//        [--scenarios load,intro,idle,scroll,regions,projects,panels,character,world,soak,backend,spikes,audit]
//        [--viewport ultrawide|desktop|mobile] [--runs 3] [--out file.json] [--headed]
//
// Average frames per second is reported but is not the measure: p95/p99/worst frame time,
// hitches per minute, long tasks and main-thread spikes are. Nothing here writes user data:
// requests are GETs, interactions are toggles, and any non-GET request is reported.
const fs = require("node:fs");
const path = require("node:path");
const S = require("./lib/session.cjs");
const { launchChrome } = require("./lib/cdp.cjs");
const { capture } = require("./lib/attribute.cjs");
const { round, median, distribution, frameStats } = require("./lib/stats.cjs");

const { sleep } = S;
const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf("--" + name);
  return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : true) : dflt;
};
// A fresh Chrome profile has no GPU shader cache, so its first scroll pays about a second of one-time shader compiles that a
// reader's profile does not. The harness therefore keeps one profile between runs (sequential runs only: a profile is one
// browser); --fresh-profile measures that first-ever visit instead.
if (!process.env.SO_PERF_PROFILE && !argv.includes("--fresh-profile")) process.env.SO_PERF_PROFILE = path.join(require("node:os").tmpdir(), "so-perf-profile");
const BASE = String(arg("base", "http://127.0.0.1:19391")).replace(/\/$/, "");
const LABEL = arg("label", "run");
const VIEWPORT = arg("viewport", "ultrawide");
const RUNS = Number(arg("runs", 1));
const HEADLESS = !arg("headed", false);
const PATH = arg("path", "/?intro=off");
const IDLE_S = Number(arg("idle-seconds", 30));
const OUT = arg("out", null);
const ALL = ["load", "intro", "idle", "scroll", "regions", "projects", "panels", "character", "world", "soak", "backend"];
const WANT = new Set(String(arg("scenarios", ALL.join(","))).split(",").map((x) => x.trim()).filter(Boolean));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const guard = async (name, fn) => {
  try {
    return await fn();
  } catch (e) {
    log(`  ${name} FAILED: ${String(e && e.message ? e.message : e).slice(0, 240)}`);
    return { error: String(e && e.message ? e.message : e).slice(0, 400) };
  }
};

// ------------------------------------------------------------------ helpers
async function deskGeometry(s) {
  return s.json(`(function(){var g=document.getElementById('ow-gate'); var top=g? Math.round(g.getBoundingClientRect().top+scrollY):null;
    return {gate: top, height: document.documentElement.scrollHeight, vh: innerHeight, vw: innerWidth};})()`);
}
const toTop = async (s) => {
  await s.ev(`window.scrollTo({top:0,behavior:'instant'});1`);
  await sleep(700);
};
const pointerX = (s) => (s.vp.mobile ? 195 : 100);
const source = (s) => (s.vp.mobile ? "touch" : "mouse");
const counters = async (s) => {
  await s.c.send("HeapProfiler.collectGarbage").catch(() => {});
  await sleep(300);
  const m = await s.metrics();
  const dom = await s.c.send("Memory.getDOMCounters").catch(() => ({}));
  return { heap_mb: round(m.JSHeapUsedSize / 1048576, 1), nodes: m.Nodes, listeners: m.JSEventListeners, documents: m.Documents, dom_counters: dom };
};

// ------------------------------------------------------------------ scenarios
async function load(ctx) {
  const vp = S.VIEWPORTS[VIEWPORT];
  const chrome = await launchChrome({ headless: HEADLESS, width: vp.width, height: vp.height, dpr: vp.dpr });
  const out = {};
  try {
    const one = async (mode) => {
      const s = await S.open({ base: BASE, urlPath: PATH, viewport: VIEWPORT, chrome, cache: mode === "warm", waitUsable: false });
      const usableMs = await s.waitUsable();
      const mAtUsable = await s.metrics();
      await sleep(3000);
      const t = await s.json(`(function(){var n=performance.getEntriesByType('navigation')[0]; var pt=performance.getEntriesByType('paint');
        var f=function(x){var e=pt.filter(function(p){return p.name===x})[0]; return e?Math.round(e.startTime):null};
        return {ttfb: Math.round(n.responseStart), dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), fcp: f('first-contentful-paint'),
          lcp: (window.__so.lcp.slice(-1)[0]||{}).s||null, marks: window.__so.marks, longtasks: window.__so.longtasks, loaf: window.__so.loaf, shifts: window.__so.shifts.reduce(function(a,b){return a+b.v},0)};})()`);
      const reqs = s.reqOrder.filter((r) => r.finished || r.status);
      const byType = {};
      for (const r of reqs) {
        const k = /\.(js)(\?|$)/.test(r.url) ? "js" : /\.css(\?|$)/.test(r.url) ? "css" : /\.(png|webp|jpe?g|gif|svg)(\?|$)/.test(r.url) ? "image" : /\.json|^\/api|^\/status|^\/agents/.test(r.url) ? "json" : r.type || "other";
        byType[k] = byType[k] || { n: 0, kb: 0 };
        byType[k].n++;
        byType[k].kb += (r.bytes || 0) / 1024;
      }
      for (const k of Object.keys(byType)) byType[k].kb = round(byType[k].kb, 0);
      const longs = t.longtasks.map((l) => l.d);
      const res = {
        time_to_usable_ms: t.marks.usable ? Math.round(t.marks.usable) : usableMs,
        first_card_ms: t.marks.card && Math.round(t.marks.card),
        canvas_ms: t.marks.canvas && Math.round(t.marks.canvas),
        ttfb_ms: t.ttfb,
        dcl_ms: t.dcl,
        load_ms: t.load,
        fcp_ms: t.fcp,
        lcp_ms: t.lcp,
        cls: round(t.shifts, 4),
        main_at_usable: {
          task_ms: round(mAtUsable.TaskDuration * 1000, 0),
          script_ms: round(mAtUsable.ScriptDuration * 1000, 0),
          layout_ms: round(mAtUsable.LayoutDuration * 1000, 0),
          style_ms: round(mAtUsable.RecalcStyleDuration * 1000, 0),
          recalcs: mAtUsable.RecalcStyleCount,
          layouts: mAtUsable.LayoutCount,
        },
        long_tasks: { count: longs.length, sum_ms: round(longs.reduce((a, b) => a + b, 0), 0), max_ms: longs.length ? Math.max(...longs) : 0, list: t.longtasks.slice(0, 12) },
        loaf_worst: t.loaf.slice().sort((a, b) => b.d - a.d).slice(0, 4),
        requests: reqs.length,
        transferred_kb: round(reqs.reduce((a, r) => a + (r.bytes || 0), 0) / 1024, 0),
        by_type: byType,
        biggest: reqs.slice().sort((a, b) => (b.bytes || 0) - (a.bytes || 0)).slice(0, 8).map((r) => `${r.url.split("?")[0]} ${round((r.bytes || 0) / 1024, 0)}KB`),
        errors: s.errors.slice(0, 5),
      };
      await s.close();
      return res;
    };
    out.cold = await one("cold");
    // one load with the cache on to fill it, then the one a returning reader gets
    const prime = await S.open({ base: BASE, urlPath: PATH, viewport: VIEWPORT, chrome, cache: true, waitUsable: true });
    await prime.close();
    out.warm = await one("warm");
    out.headline = { time_to_usable_ms_cold: out.cold.time_to_usable_ms, time_to_usable_ms_warm: out.warm.time_to_usable_ms };
  } finally {
    await chrome.close();
  }
  return out;
}

async function desk(ctx) {
  // idle, scroll, projects, panels and the character share one page in that order: each one leaves the desk
  // as it found it, at the top.
  const s = await S.open({ base: BASE, urlPath: PATH, viewport: VIEWPORT, headless: HEADLESS });
  const out = { usable_ms: s.usableAfterMs };
  try {
    out.refresh_hz = await S.refreshRate(s);
    await sleep(3000);
    if (WANT.has("idle")) {
      log("  idle", IDLE_S + "s");
      out.idle = await guard("idle", async () => {
        await toTop(s);
        const m = await S.measure(s, () => sleep(IDLE_S * 1000), { label: "idle" });
        m.animations = await s.json(`(function(){var a=document.getAnimations(); return {total:a.length, running:a.filter(function(x){return x.playState==='running'}).length};})()`);
        m.layers_note = "see spikes/audit for attribution";
        return m;
      });
      // The frame recorder is itself a requestAnimationFrame loop with a scroll read in it; the cost of the page alone
      // is this window, taken with nothing of the harness running in the page.
      out.idle_quiet = await guard("idle-quiet", async () => {
        await toTop(s);
        return S.measure(s, () => sleep(10000), { label: "idle-quiet", frames: false });
      });
    }
    if (WANT.has("scroll")) {
      const g = await deskGeometry(s);
      const limit = g.gate ? Math.round(g.gate - 1.4 * g.vh) : g.height - g.vh - 100;
      out.scroll_range_px = limit;
      // The pixel office's canvas swallows the wheel: a reader whose pointer is over it does not scroll at all.
      out.wheel_over_canvas_scrolls = await guard("wheel-over-canvas", async () => {
        await toTop(s);
        const box = await s.json(`(function(){var r=document.querySelector('#game-container canvas').getBoundingClientRect(); return {x:r.left+r.width/2,y:Math.min(r.top+r.height/2, innerHeight/2)};})()`);
        for (let i = 0; i < 6; i++) {
          await s.c.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: box.x, y: box.y, deltaX: 0, deltaY: 100 });
          await sleep(30);
        }
        await sleep(700);
        const y = await s.ev("Math.round(scrollY)");
        await toTop(s);
        return y > 0;
      });
      // The first scroll of a page is not the tenth: its tiles have never been drawn. Measured alone (down and up once),
      // then the warm ones.
      out.scroll_first = await guard("scroll-first", async () => {
        await toTop(s);
        log("  scroll first pass 1500px/s");
        const m = await S.measure(
          s,
          async () => {
            await S.scrollGesture(s, { x: pointerX(s), y: g.vh / 2, distance: limit, speed: 1500, source: source(s) });
            await S.scrollGesture(s, { x: pointerX(s), y: g.vh / 2, distance: -limit, speed: 1500, source: source(s) });
          },
          { label: "scroll-first" }
        );
        await toTop(s);
        return m;
      });
      for (const [name, speed] of [["normal", 1500], ["fast", 6000]]) {
        log("  scroll", name, speed + "px/s");
        out["scroll_" + name] = await guard("scroll-" + name, async () => {
          await toTop(s);
          const m = await S.measure(
            s,
            async () => {
              for (let i = 0; i < 2; i++) {
                await S.scrollGesture(s, { x: pointerX(s), y: g.vh / 2, distance: limit, speed, source: source(s) });
                await S.scrollGesture(s, { x: pointerX(s), y: g.vh / 2, distance: -limit, speed, source: source(s) });
              }
            },
            { label: "scroll-" + name }
          );
          await toTop(s);
          return m;
        });
      }
    }
    if (WANT.has("projects")) {
      log("  projects");
      out.projects = await guard("projects", async () => {
        await toTop(s);
        const r = {};
        r.before = await s.json(`{cards: document.querySelectorAll('article.co-project[data-project-id]').length, nodes: document.getElementsByTagName('*').length}`);
        const deck = await s.json(`(function(){var e=document.getElementById('active-projects'); if(!e) return null; var r=e.getBoundingClientRect(); return {top:Math.round(r.top+scrollY), h:Math.round(r.height)};})()`);
        if (!deck) return { error: "NO_ACTIVE_PROJECTS_SECTION" };
        await s.ev(`window.scrollTo({top:${deck.top - 60},behavior:'instant'});1`);
        await sleep(1200);
        const bridge = 'button.cw-bridge[aria-controls="active-projects-deck"]';
        const has = await s.ev(`!!document.querySelector(${JSON.stringify(bridge)})`);
        if (has) {
          r.expand_latency_ms = round(await S.paintLatency(s, () => S.click(s, bridge)), 1);
          await sleep(1800);
          r.after_expand = await s.json(`{cards: document.querySelectorAll('article.co-project[data-project-id]').length, nodes: document.getElementsByTagName('*').length}`);
          const d2 = await s.json(`(function(){var e=document.getElementById('active-projects'); var r=e.getBoundingClientRect(); return {top:Math.round(r.top+scrollY), h:Math.round(r.height)};})()`);
          r.deck_after_expand = d2;
          r.scroll_through_expanded = await S.measure(
            s,
            async () => {
              await s.ev(`window.scrollTo({top:${d2.top - 60},behavior:'instant'});1`);
              await sleep(300);
              await S.scrollGesture(s, { x: pointerX(s), y: 400, distance: Math.min(d2.h, 6000), speed: 1200, source: source(s) });
            },
            { label: "projects-scroll" }
          );
          r.collapse_latency_ms = round(await S.paintLatency(s, () => S.click(s, bridge)), 1);
          await sleep(800);
        } else r.note = "no deck bridge (fewer projects than the deck shows)";
        await toTop(s);
        return r;
      });
    }
    if (WANT.has("panels")) {
      log("  panels");
      out.panels = await guard("panels", async () => {
        await toTop(s);
        const toggles = [
          { name: "env-panel", sel: "button.co-env-button" },
          { name: "work-history-zone", sel: "#work-history button.co-zone-toggle" },
          { name: "timeline-node", sel: "button.tl-node-button" },
          { name: "office-collapse", sel: "header.co-map-header button.co-zone-toggle" },
        ];
        const before = await counters(s);
        const res = {};
        const CYCLES = 6;
        const w = await S.measure(
          s,
          async () => {
            for (const t of toggles) {
              const lat = { open: [], close: [], ok: 0 };
              for (let i = 0; i < CYCLES; i++) {
                const exists = await s.ev(`!!document.querySelector(${JSON.stringify(t.sel)})`);
                if (!exists) break;
                const st0 = await s.ev(`document.querySelector(${JSON.stringify(t.sel)}).getAttribute('aria-expanded')`);
                lat.open.push(await S.paintLatency(s, () => S.click(s, t.sel)));
                await sleep(500);
                const st1 = await s.ev(`document.querySelector(${JSON.stringify(t.sel)}).getAttribute('aria-expanded')`);
                if (st0 !== st1) lat.ok++;
                lat.close.push(await S.paintLatency(s, () => S.click(s, t.sel)));
                await sleep(500);
              }
              res[t.name] = { cycles: lat.open.length, toggled: lat.ok, open_ms: distribution(lat.open), close_ms: distribution(lat.close) };
              await toTop(s);
            }
          },
          { label: "panels" }
        );
        const after = await counters(s);
        return { per_toggle: res, window: w, before, after, growth: { heap_mb: round(after.heap_mb - before.heap_mb, 1), nodes: after.nodes - before.nodes, listeners: after.listeners - before.listeners } };
      });
    }
    if (WANT.has("character")) {
      log("  character");
      out.character = await guard("character", async () => {
        await toTop(s);
        const has = await s.ev(`!!document.getElementById('renguin-scene-renguin')`);
        if (!has) return { note: "no DOM characters on this desk" };
        // The extension walks a character by stepping left/top every 440 ms under a 0.42 s transition.
        const idle = await S.measure(s, () => sleep(6000), { label: "characters-as-they-are" });
        const walk = await S.measure(
          s,
          async () => {
            await s.ev(`(function(){var n=document.getElementById('renguin-scene-renguin'); window.__walkPrev={l:n.style.left,t:n.style.top,c:n.className}; n.classList.add('is-walking');
              var pts=[['22%','40%'],['38%','62%'],['60%','52%'],['78%','32%'],['48%','46%']]; var i=0;
              window.__walk=setInterval(function(){var p=pts[i++%pts.length]; n.style.left=p[0]; n.style.top=p[1];},440); return 1;})()`);
            await sleep(8000);
            await s.ev(`(function(){clearInterval(window.__walk); var n=document.getElementById('renguin-scene-renguin'); n.style.left=window.__walkPrev.l; n.style.top=window.__walkPrev.t; n.className=window.__walkPrev.c; return 1;})()`);
          },
          { label: "one-character-walking" }
        );
        return { as_found: idle, walking: walk };
      });
    }
  } finally {
    out.errors = s.errors.slice(0, 8);
    out.non_get = [...new Set(s.reqOrder.filter((r) => r.method !== "GET").map((r) => `${r.method} ${r.url.split("?")[0]}`))];
    await s.shutdown();
  }
  return out;
}

async function world(ctx) {
  const s = await S.open({ base: BASE, urlPath: PATH, viewport: VIEWPORT, headless: HEADLESS });
  const out = {};
  try {
    await sleep(3000);
    const has = await s.ev(`!!document.getElementById('ow-gate') && typeof window.RenguinOfficeWorld==='object'`);
    if (!has) return { note: "this desk has no way down into the world" };
    const g = await deskGeometry(s);
    const idleBefore = await S.measure(s, () => sleep(8000), { label: "desk-idle-before" });
    out.desk_idle_before = { fps: idleBefore.frames.fps, p99_ms: idleBefore.frames.p99_ms, task_ms_per_s: idleBefore.main.task_ms_per_s, running: await s.ev(`document.getAnimations().filter(function(a){return a.playState==='running'}).length`) };
    // ---- the way down, in one reader's scroll
    log("  descent");
    let bootMs = null;
    const speed = 2500;
    out.descent = await guard("descent", () =>
      S.measure(
        s,
        async () => {
          await S.scrollGesture(s, { x: pointerX(s), y: g.vh / 2, distance: g.gate - 250, speed, source: source(s) });
          const t0 = Date.now();
          for (let i = 0; i < 200; i++) {
            const st = await s.json(`{b: window.RenguinOfficeWorld.booted(), s: (document.getElementById('sw-app')||{dataset:{}}).dataset.status}`).catch(() => ({}));
            if (st.b && st.s === "ready") {
              bootMs = Date.now() - t0;
              break;
            }
            await sleep(100);
          }
          await sleep(600);
          const g2 = await deskGeometry(s);
          const cur = await s.ev(`Math.round(scrollY)`);
          await S.scrollGesture(s, { x: pointerX(s), y: g.vh / 2, distance: Math.max(0, g2.height - g2.vh - cur), speed, source: source(s) });
          await sleep(1500);
        },
        { label: "descent" }
      )
    );
    out.world_boot_wait_ms = bootMs;
    out.world_assets = await s.json(`(function(){return performance.getEntriesByType('resource').filter(function(r){return r.name.indexOf('/static/world/')>=0 || r.name.indexOf('/api/world/')>=0}).map(function(r){return {u:r.name.replace(location.origin,'').split('?')[0], kb:Math.round((r.encodedBodySize||0)/1024), ms:Math.round(r.duration)}}).sort(function(a,b){return b.kb-a.kb}).slice(0,10);})()`);
    out.world_asset_total_kb = out.world_assets.reduce((a, x) => a + x.kb, 0);
    const arrived = await s.json(`(function(){var d=window.RenguinSeamlessWorld&&window.RenguinSeamlessWorld.debug(); return {zone:d&&d.zone, paused:d&&d.paused, residents:document.querySelectorAll('.sw-city .sw-actor').length, docH:document.documentElement.scrollHeight};})()`);
    out.arrived = arrived;
    log("  city idle");
    out.city_idle = await guard("city-idle", () => S.measure(s, () => sleep(15000), { label: "city-idle" }));
    out.city_animations = await s.json(`(function(){var a=document.getAnimations(); return {total:a.length, running:a.filter(function(x){return x.playState==='running'}).length};})()`);
    // ---- what the world lets the reader do
    log("  city interactions");
    const lat = {};
    out.city_interactions = await guard("city-interactions", () =>
      S.measure(
        s,
        async () => {
          const step = async (name, fn) => {
            lat[name] = round(await S.paintLatency(s, fn), 1);
            await sleep(700);
          };
          const clickId = (id) => async () => s.ev(`(function(){var e=document.getElementById(${JSON.stringify(id)}); if(e) e.click(); return !!e;})()`);
          await step("open_data_drawer", clickId("sw-data"));
          await step("close_data_drawer", clickId("sw-drawer-close"));
          await step("open_resident_card", () => s.ev(`(function(){var a=document.querySelector('.sw-city .sw-actor'); if(a) a.click(); return !!a;})()`));
          await step("close_resident_card", clickId("sw-card-close"));
          await step("zoom_in", clickId("sw-zoom-in"));
          await sleep(900);
          await step("zoom_out", clickId("sw-zoom-out"));
          await sleep(900);
          await step("time_of_day", clickId("sw-time"));
          await step("district_menu", clickId("sw-district"));
          await sleep(500);
          await s.ev(`(function(){var b=document.querySelectorAll('#sw-district-list button[data-district]'); var t=b[b.length-1]; if(t) t.click(); return b.length;})()`);
          await sleep(2600);
        },
        { label: "city-interactions" }
      )
    );
    out.city_interaction_latency_ms = lat;
    // ---- and back
    log("  ascent");
    out.ascent = await guard("ascent", () =>
      S.measure(
        s,
        async () => {
          const cur = await s.ev(`Math.round(scrollY)`);
          await S.scrollGesture(s, { x: pointerX(s), y: g.vh / 2, distance: -cur, speed, source: source(s) });
          await sleep(1500);
        },
        { label: "ascent" }
      )
    );
    await sleep(2500);
    out.back_at_desk = await s.json(`(function(){var d=window.RenguinSeamlessWorld&&window.RenguinSeamlessWorld.debug(); var running=document.getAnimations().filter(function(a){var t=a.effect&&a.effect.target; return a.playState==='running' && t && t.closest && t.closest('#sw-world');}).length;
      return {scrollY: Math.round(scrollY), world_booted: !!d, paused: d&&d.paused, near: d&&d.near, world_running_animations: running, all_running: document.getAnimations().filter(function(a){return a.playState==='running'}).length};})()`);
    log("  desk idle after");
    const idleAfter = await S.measure(s, () => sleep(8000), { label: "desk-idle-after" });
    out.desk_idle_after = { fps: idleAfter.frames.fps, p99_ms: idleAfter.frames.p99_ms, task_ms_per_s: idleAfter.main.task_ms_per_s, running: out.back_at_desk.all_running };
    out.world_heap_mb = round((await s.metrics()).JSHeapUsedSize / 1048576, 1);
  } finally {
    out.errors = s.errors.slice(0, 8);
    await s.shutdown();
  }
  return out;
}

/** What each part of the page costs while nobody touches it, as a reader has it (nothing of the harness in the page). */
async function regions() {
  const ys = String(arg("regions", "0,800,1600,2600,3600,4900,5900,6600")).split(",").map(Number);
  const s = await S.open({ base: BASE, urlPath: PATH, viewport: VIEWPORT, headless: HEADLESS });
  const out = {};
  try {
    await sleep(4500);
    const g = await deskGeometry(s);
    out.page_height = g.height;
    for (const y of ys) {
      if (y > g.height - g.vh + 60) continue;
      log("  region y =", y);
      out["y" + y] = await guard("region-" + y, async () => {
        await s.ev(`window.scrollTo({top:${y},behavior:'instant'});1`);
        await sleep(2500);
        const m = await S.measure(s, () => sleep(6000), { label: "y" + y, frames: false });
        const running = await s.ev(`document.getAnimations().filter(function(a){return a.playState==='running'}).length`);
        return { task_ms_per_s: m.main.task_ms_per_s, script_ms_per_s: m.main.script_ms_per_s, style_ms_per_s: m.main.style_ms_per_s, style_recalcs_per_s: m.main.style_recalcs_per_s, cpu_pct_of_one_core: m.cpu_pct_of_one_core, running_animations: running };
      });
    }
  } finally {
    out.errors = s.errors.slice(0, 5);
    await s.shutdown();
  }
  return out;
}

/** The entry film a reader sees on every visit: held at the airlock while the desk loads underneath, then the way in. */
async function intro() {
  const out = {};
  for (const mode of ["quick", "full"]) {
    const s = await S.open({ base: BASE, urlPath: null, viewport: VIEWPORT, headless: HEADLESS });
    try {
      // record from the first script of the page: the film starts before the load event
      await s.c.send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__so && window.__so.startFrames && window.__so.startFrames();" });
      await s.navigate(BASE + "/?intro=" + mode, { wait: null });
      let held = false;
      for (let i = 0; i < 300 && !held; i++) {
        held = await s.ev(`!!document.querySelector('.so-intro.is-waiting')`).catch(() => false);
        if (!held) await sleep(50);
      }
      const holdFrom = await s.ev(`performance.now()`).catch(() => 0);
      await sleep(3500);
      const clickAt = await s.ev(`(function(){ var b=document.querySelector('.so-intro-enter'); if(b) b.click(); return performance.now(); })()`);
      let gone = false;
      for (let i = 0; i < 200 && !gone; i++) {
        gone = await s.ev(`!document.querySelector('.so-intro')`).catch(() => false);
        if (!gone) await sleep(50);
      }
      const endAt = await s.ev(`performance.now()`);
      await sleep(600);
      const rec = await s.json(`window.__so.stopFrames()`);
      const lt = await s.json(`window.__so.longtasks`);
      const window_ = (a, b) => {
        const t = rec.t.filter((x) => x >= a && x <= b);
        const longs = lt.filter((l) => l.s >= a && l.s <= b).map((l) => l.d);
        return { frames: t.length > 3 ? frameStats(t) : null, long_tasks: { count: longs.length, sum_ms: round(longs.reduce((x, y) => x + y, 0), 0), max_ms: longs.length ? Math.max(...longs) : 0 } };
      };
      out[mode] = {
        held_at_the_door: held,
        hold: window_(holdFrom, clickAt),
        the_way_in: window_(clickAt, endAt),
        the_way_in_ms: round(endAt - clickAt, 0),
        errors: s.errors.slice(0, 3),
      };
    } finally {
      await s.shutdown();
    }
  }
  return out;
}

async function soak(ctx) {
  const CYCLES = Number(arg("cycles", 5));
  const s = await S.open({ base: BASE, urlPath: PATH, viewport: VIEWPORT, headless: HEADLESS });
  const out = { cycles: [] };
  try {
    await sleep(3000);
    const has = await s.ev(`!!document.getElementById('ow-gate') && typeof window.RenguinOfficeWorld==='object'`);
    const g = await deskGeometry(s);
    out.start = await counters(s);
    for (let i = 0; i < CYCLES; i++) {
      const t0 = Date.now();
      await toTop(s);
      for (const sel of ["button.co-env-button", "#work-history button.co-zone-toggle"]) {
        await S.click(s, sel);
        await sleep(400);
        await S.click(s, sel);
        await sleep(400);
      }
      await toTop(s);
      if (has) {
        await S.scrollGesture(s, { x: pointerX(s), y: g.vh / 2, distance: g.gate - 250, speed: 3500, source: source(s) });
        for (let k = 0; k < 120; k++) {
          const ok = await s.ev(`window.RenguinOfficeWorld.booted() && (document.getElementById('sw-app')||{dataset:{}}).dataset.status==='ready'`).catch(() => false);
          if (ok) break;
          await sleep(100);
        }
        const g2 = await deskGeometry(s);
        const cur = await s.ev(`Math.round(scrollY)`);
        await S.scrollGesture(s, { x: pointerX(s), y: g.vh / 2, distance: Math.max(0, g2.height - g2.vh - cur), speed: 3500, source: source(s) });
        await sleep(1200);
        for (const id of ["sw-data", "sw-drawer-close", "sw-zoom-in", "sw-zoom-out"]) {
          await s.ev(`(function(){var e=document.getElementById(${JSON.stringify(id)}); if(e) e.click(); return 1;})()`);
          await sleep(900);
        }
        const cur2 = await s.ev(`Math.round(scrollY)`);
        await S.scrollGesture(s, { x: pointerX(s), y: g.vh / 2, distance: -cur2, speed: 3500, source: source(s) });
      }
      await sleep(2500);
      const c = await counters(s);
      out.cycles.push({ n: i + 1, seconds: round((Date.now() - t0) / 1000, 1), ...c });
      log("  soak cycle", i + 1, JSON.stringify({ heap: c.heap_mb, nodes: c.nodes, listeners: c.listeners }));
    }
    const last = out.cycles[out.cycles.length - 1];
    const first = out.cycles[0];
    out.growth_per_cycle = {
      heap_mb: round((last.heap_mb - first.heap_mb) / Math.max(1, out.cycles.length - 1), 2),
      nodes: round((last.nodes - first.nodes) / Math.max(1, out.cycles.length - 1), 0),
      listeners: round((last.listeners - first.listeners) / Math.max(1, out.cycles.length - 1), 1),
    };
    out.growth_total = { heap_mb: round(last.heap_mb - out.start.heap_mb, 1), nodes: last.nodes - out.start.nodes, listeners: last.listeners - out.start.listeners };
    out.final_idle = await S.measure(s, () => sleep(8000), { label: "idle-after-soak" });
  } finally {
    out.errors = s.errors.slice(0, 8);
    await s.shutdown();
  }
  return out;
}

async function backend() {
  const endpoints = String(arg("endpoints", "/status,/api/renguin/projects,/api/creator/event-statuses,/api/renguin/operations,/api/world/state,/api/creator/presentation,/agents,/static/bionic_activity.json,/static/codex_activity.json,/static/renguin-projects-v2.json,/static/creator-office.js,/")).split(",");
  const N = Number(arg("samples", 12));
  const out = {};
  for (const ep of endpoints) {
    const times = [];
    let bytes = 0;
    let status = 0;
    for (let i = 0; i < N + 1; i++) {
      const t0 = performance.now();
      try {
        const r = await fetch(BASE + ep + (ep.includes("?") ? "&" : "?") + "_=" + Date.now() + i, { headers: { "Cache-Control": "no-cache" } });
        const b = await r.arrayBuffer();
        status = r.status;
        bytes = b.byteLength;
        if (i > 0) times.push(performance.now() - t0);
      } catch (e) {
        status = String(e.message || e).slice(0, 60);
        break;
      }
      await sleep(120);
    }
    if (status === 404) {
      out[ep] = { status };
      continue;
    }
    out[ep] = { status, kb: round(bytes / 1024, 1), ...(times.length ? distribution(times) : {}) };
  }
  return out;
}

// ------------------------------------------------------------------ attribution / audit (diagnosis, not gates)
async function spikes() {
  const s = await S.open({ base: BASE, urlPath: PATH, viewport: VIEWPORT, headless: HEADLESS });
  try {
    await sleep(4000);
    const secs = Number(arg("seconds", 30));
    log("  spikes: trace+profile", secs + "s");
    return await capture(s, secs, { thresholdMs: Number(arg("threshold", 8)) });
  } finally {
    await s.shutdown();
  }
}

async function audit() {
  const s = await S.open({ base: BASE, urlPath: PATH, viewport: VIEWPORT, headless: HEADLESS, audit: true });
  try {
    await sleep(4000);
    await s.ev(`window.__so.reset(); 1`);
    const secs = Number(arg("seconds", 20));
    await sleep(secs * 1000);
    const snap = await s.json(`window.__so.snapshot(70)`);
    snap.seconds = secs;
    snap.dom_listeners = (await s.metrics()).JSEventListeners;
    return snap;
  } finally {
    await s.shutdown();
  }
}

// ------------------------------------------------------------------ run and aggregate
function aggregate(list) {
  if (list.length === 1) return list[0];
  const walk = (vals) => {
    const first = vals.find((v) => v !== undefined && v !== null);
    if (typeof first === "number") return round(median(vals.filter((v) => typeof v === "number")), 3);
    if (Array.isArray(first)) return first;
    if (first && typeof first === "object") {
      const out = {};
      for (const k of Object.keys(first)) out[k] = walk(vals.map((v) => (v && typeof v === "object" ? v[k] : undefined)));
      return out;
    }
    return first;
  };
  return walk(list);
}

async function main() {
  const meta = {
    label: LABEL,
    base: BASE,
    when: new Date().toISOString(),
    viewport: VIEWPORT,
    viewport_css: S.VIEWPORTS[VIEWPORT],
    runs: RUNS,
    headless: HEADLESS,
    scenarios: [...WANT],
    node: process.version,
  };
  try {
    meta.office = await fetch(BASE + "/api/renguin/preview-info").then((r) => (r.ok ? r.json() : null)).catch(() => null);
  } catch {}
  const runs = [];
  for (let r = 0; r < RUNS; r++) {
    log(`run ${r + 1}/${RUNS}`);
    const one = {};
    if (WANT.has("load")) one.load = await guard("load", load);
    if (WANT.has("intro")) one.intro = await guard("intro", intro);
    if (["idle", "scroll", "projects", "panels", "character"].some((k) => WANT.has(k))) one.desk = await guard("desk", desk);
    if (WANT.has("regions")) one.regions = await guard("regions", regions);
    if (WANT.has("world")) one.world = await guard("world", world);
    if (WANT.has("soak")) one.soak = await guard("soak", soak);
    if (WANT.has("backend")) one.backend = await guard("backend", backend);
    if (WANT.has("spikes")) one.spikes = await guard("spikes", spikes);
    if (WANT.has("audit")) one.audit = await guard("audit", audit);
    runs.push(one);
  }
  const result = { meta, runs, median: aggregate(runs.map((r) => JSON.parse(JSON.stringify(r)))) };
  if (OUT) {
    fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
    log("wrote", OUT);
  }
  return result;
}

if (require.main === module) {
  main()
    .then((r) => {
      const d = r.median.desk;
      if (d && d.idle && d.idle.frames) console.log("idle:", JSON.stringify(d.idle.frames));
      process.exit(0);
    })
    .catch((e) => {
      console.error("FAILED", e);
      process.exit(2);
    });
}

module.exports = { load, intro, desk, regions, world, soak, backend, spikes, audit, aggregate };
