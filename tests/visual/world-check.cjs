// Renguin World in a real browser: lazy loading, lifecycle, main-thread cost, console, viewports.
//
//   node tests/visual/world-check.cjs http://127.0.0.1:19119 [--live]
//
// Drives one headless Chrome tab over CDP (Node 22+ WebSocket). Uses ?sim= worlds by
// default so it never depends on anyone's data; --live also opens the real world state.
// Keep to one tab: every Office tab polls projects, and several starve a Preview.
const { spawn } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

const BASE = (process.argv[2] || "http://127.0.0.1:19119").replace(/\/$/, "");
const LIVE = process.argv.includes("--live");
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9400 + Math.floor(Math.random() * 400);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass: Boolean(pass), detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail === undefined ? "" : "  " + JSON.stringify(detail)}`);
};

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "rw-check-"));
  const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
  try {
    let version;
    for (let i = 0; i < 60 && !version; i++) {
      await sleep(200);
      version = await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.json()).catch(() => null);
    }
    const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    let id = 0;
    const pending = new Map();
    let events = [];
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg.result || msg);
        pending.delete(msg.id);
      } else if (msg.method) events.push(msg);
    };
    const send = (method, params = {}) =>
      new Promise((resolve) => {
        const n = ++id;
        pending.set(n, resolve);
        ws.send(JSON.stringify({ id: n, method, params }));
      });
    const js = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.value;
    const viewport = (width, height, mobile = false) => send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
    const open = async (url, wait) => {
      events = [];
      await send("Page.navigate", { url });
      await sleep(wait);
      return events;
    };
    const requests = (list) => list.filter((e) => e.method === "Network.requestWillBeSent").map((e) => e.params.request.url.replace(BASE, ""));
    const errors = (list) =>
      list
        .filter((e) => e.method === "Runtime.exceptionThrown" || (e.method === "Log.entryAdded" && e.params.entry.level === "error") || (e.method === "Runtime.consoleAPICalled" && e.params.type === "error"))
        .map((e) => e.params.entry?.text || e.params.exceptionDetails?.exception?.description || "console.error");
    const metrics = async () => Object.fromEntries((await send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
    const cost = async (seconds) => {
      const a = await metrics();
      await sleep(seconds * 1000);
      const b = await metrics();
      return {
        main_thread_ms_per_s: +(((b.TaskDuration - a.TaskDuration) * 1000) / seconds).toFixed(1),
        layouts_per_s: +((b.LayoutCount - a.LayoutCount) / seconds).toFixed(2),
        style_recalcs_per_s: +((b.RecalcStyleCount - a.RecalcStyleCount) / seconds).toFixed(2),
        script_ms_per_s: +(((b.ScriptDuration - a.ScriptDuration) * 1000) / seconds).toFixed(1),
      };
    };
    for (const domain of ["Page", "Runtime", "Log", "Network", "Performance"]) await send(domain + ".enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await viewport(1440, 900);

    // TEST 03/04/30: the Office loads nothing of the world.
    const office = await open(`${BASE}/?intro=off`, 7000);
    const officeRequests = requests(office);
    check("Office loads no world bundle or world API", !officeRequests.some((u) => /\/static\/world\/|\/api\/world\/|\/world(\?|$)/.test(u)), officeRequests.filter((u) => /world/i.test(u)));
    check("Office has no world renderer or NPC system", (await js("typeof window.RenguinWorld === 'undefined' && typeof window.RenguinWorldScene === 'undefined' && !document.querySelector('.rw-walker, .rw-stage')")) === true);
    check("Office offers a plain link to /world", (await js("document.querySelector('a.co-world-link')?.getAttribute('href')")) === "/world");
    const officeCost = await cost(5);
    check("Office main-thread cost measured (baseline)", true, officeCost);

    // TEST 05: opening the world loads its bundle and state, once.
    const world = await open(`${BASE}/world?sim=100&time=day`, 4000);
    const worldRequests = requests(world);
    check("World page loads its bundle only on the route", ["/static/world/world.css", "/static/world/world-scene.js", "/static/world/world-app.js"].every((f) => worldRequests.some((u) => u.startsWith(f))), worldRequests.slice(0, 5));
    check("World reads state exactly once on open", worldRequests.filter((u) => u.startsWith("/api/world/simulate") || u.startsWith("/api/world/state")).length === 1);
    const debug = await js("window.RenguinWorld.debug()");
    check("World renderer and residents initialised", debug?.running && debug.walkers > 0 && (await js("!!document.querySelector('#rw-stage svg')")), debug);
    check("World: zero console errors", errors(world).length === 0, errors(world));
    const worldCost = await cost(5);
    check("World main-thread cost with a full 100-content festival city", worldCost.main_thread_ms_per_s < 120, worldCost);
    events = [];
    await sleep(8000);
    check("World does not poll while open", requests(events).filter((u) => u.startsWith("/api/")).length === 0, requests(events));

    // TEST 06: hidden tab pauses; leaving stops timers, requests and the scene.
    await js("Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange'))");
    const hidden = await js("window.RenguinWorld.debug()");
    check("Hidden tab pauses animations and clears timers", hidden.paused && hidden.timers === 0 && hidden.animationsPaused, hidden);
    const hiddenCost = await cost(3);
    check("Hidden world costs next to nothing", hiddenCost.main_thread_ms_per_s < 15, hiddenCost);
    await js("Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange'))");
    const back = await js("window.RenguinWorld.debug()");
    check("Visible again resumes", !back.paused && back.timers === 1 && !back.animationsPaused, back);
    await js("window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }))");
    const left = await js("window.RenguinWorld.debug()");
    check("Leaving stops timers, requests, listeners and drops the scene", !left.running && left.timers === 0 && left.pendingRequests === 0 && left.listeners === 0 && left.walkers === 0, left);

    // TEST 07-14, 19-21: milestones and activity render without errors.
    for (const [query, expect] of [
      ["sim=0", "EMPTY_WORLD"],
      ["sim=5", null],
      ["sim=10", null],
      ["sim=20", null],
      ["sim=35", null],
      ["sim=50", null],
      ["sim=75", null],
      ["sim=100", null],
      ["sim=50&idle=10", "QUIET"],
      ["sim=50&idle=20", "DORMANT"],
      ["sim=50&idle=45", "DEEP_DORMANT"],
      ["sim=50&idle=1&gap=20", "REVIVAL"],
    ]) {
      const page = await open(`${BASE}/world?${query}`, 1800);
      const seen = await js("({state: document.getElementById('rw-stage')?.dataset.activity, era: document.getElementById('rw-stage')?.dataset.era, svg: !!document.querySelector('#rw-stage svg'), hud: document.querySelectorAll('.rw-card').length})");
      check(`World ${query} renders${expect ? " as " + expect : ""}`, seen.svg && seen.hud >= 6 && (!expect || seen.state === expect) && errors(page).length === 0, seen);
    }

    // TEST 28/29: phone and desktop.
    await viewport(390, 844, true);
    await open(`${BASE}/world?sim=50`, 2000);
    const phone = await js("({width: innerWidth, scroll: document.documentElement.scrollWidth, svg: document.querySelector('#rw-stage svg').getBoundingClientRect().width, walkers: document.querySelectorAll('.rw-walker').length})");
    check("Phone viewport: no sideways scroll, scene fits, fewer residents", phone.width === 390 && phone.scroll <= 390 && phone.svg <= 390 && phone.walkers <= 14, phone);
    await viewport(1440, 900);
    await open(`${BASE}/world?sim=50`, 2000);
    const desk = await js("({scroll: document.documentElement.scrollWidth, svg: document.querySelector('#rw-stage svg').getBoundingClientRect().width, hud: document.getElementById('rw-hud').getBoundingClientRect().left})");
    check("Desktop viewport: scene and HUD side by side", desk.scroll <= 1440 && desk.svg > 700 && desk.hud > desk.svg, desk);

    if (LIVE) {
      const live = await open(`${BASE}/world`, 6000);
      const state = await js("fetch('/api/world/state').then(r => r.json()).then(s => ({era: s.current_era, total: s.content.total, score: s.world_score, sources: s.sources.map(x => x.id + ':' + x.status)}))");
      check("Live world renders from real sources", (await js("!!document.querySelector('#rw-stage svg')")) && errors(live).length === 0, state);
    }
    ws.close();
  } finally {
    chrome.kill();
  }
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
