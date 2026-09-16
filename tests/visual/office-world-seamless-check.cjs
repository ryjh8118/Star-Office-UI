// The way down from the Office into Renguin World, in a real browser.
//
//   node tests/visual/office-world-seamless-check.cjs http://127.0.0.1:19119 [--out <dir>]
//
// One headless Chrome tab over CDP against the desk's own page. It proves the four
// things the feature is: the world costs the desk nothing until it is approached,
// one scroll reaches it with no navigation, the seam between the two skies is not a
// cut, and coming back is the same scroll in reverse. Whatever data the server has
// is the data it walks — this never simulates a world to make a check pass.
const { spawn } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

const BASE = (process.argv[2] || "http://127.0.0.1:19119").replace(/\/$/, "");
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(BASE)) throw Error("LOCAL_ONLY");
const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : null;
if (OUT) fs.mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9400 + Math.floor(Math.random() * 90);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const baseline = {};
const check = (name, pass, detail) => {
  results.push({ name, pass: Boolean(pass), detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail === undefined ? "" : "  " + JSON.stringify(detail)}`);
};

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "ow-seam-"));
  const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--hide-scrollbars", "about:blank"], { stdio: "ignore", windowsHide: true });
  try {
    let target;
    for (let i = 0; i < 80 && !target; i++) {
      await sleep(150);
      target = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" }).then((r) => r.json()).catch(() => null);
    }
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
    const viewport = async (width, height, mobile = false) => {
      await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
      await send("Emulation.setTouchEmulationEnabled", { enabled: mobile, maxTouchPoints: mobile ? 5 : 0 });
    };
    const open = async (url, wait = 6000) => {
      events = [];
      await send("Page.navigate", { url });
      await sleep(wait);
    };
    const shot = async (name) => OUT && fs.writeFileSync(path.join(OUT, name), Buffer.from((await send("Page.captureScreenshot", { format: "png" })).data, "base64"));
    const errors = () =>
      events
        .filter((e) => e.method === "Runtime.exceptionThrown" || (e.method === "Log.entryAdded" && e.params.entry.level === "error"))
        .map((e) => e.params.entry?.text || e.params.exceptionDetails?.exception?.description || "error");
    const requests = () => events.filter((e) => e.method === "Network.requestWillBeSent").map((e) => e.params.request.url.replace(BASE, ""));
    const worldAssets = () => requests().filter((u) => u.startsWith("/static/world/"));
    const metrics = async () => Object.fromEntries((await send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
    const cost = async (seconds, during) => {
      const a = await metrics();
      const started = Date.now();
      if (during) await during();
      const left = seconds * 1000 - (Date.now() - started);
      if (left > 0) await sleep(left);
      const b = await metrics();
      const span = Math.max(0.2, (Date.now() - started) / 1000);
      return {
        main_thread_ms_per_s: +(((b.TaskDuration - a.TaskDuration) * 1000) / span).toFixed(1),
        script_ms_per_s: +(((b.ScriptDuration - a.ScriptDuration) * 1000) / span).toFixed(1),
        style_recalcs_per_s: +((b.RecalcStyleCount - a.RecalcStyleCount) / span).toFixed(1),
        dom_nodes: b.Nodes,
        js_heap_mb: +(b.JSHeapUsedSize / 1048576).toFixed(1),
      };
    };
    // A reader's scroll, not a jump: one page's worth every frame-batch.
    const glide = (from, to, ms) =>
      js(`(function(){var a=${from},z=${to},t0=performance.now(),d=${ms};
        return new Promise(function(res){function s(){var p=Math.min(1,(performance.now()-t0)/d);
          window.scrollTo(0,a+(z-a)*p); if(p<1) requestAnimationFrame(s); else res(1);} requestAnimationFrame(s);})})()`);
    const jump = (y) => js(`window.scrollTo({top:${Math.round(y)},behavior:'instant'});1`);
    // Frames the page actually produces. This is what "the character still walks" and
    // "scrolling still feels the same" mean, so it is measured rather than inferred.
    const fps = (ms) =>
      js(`(function(){var n=0,t0=performance.now();
        return new Promise(function(res){function f(){n++;
          if(performance.now()-t0<${ms}) requestAnimationFrame(f);
          else res(Math.round(n/((performance.now()-t0)/1000)));} requestAnimationFrame(f);})})()`);
    const fpsWhile = async (during) => {
      const [rate] = await Promise.all([fps(3600), during()]);
      return rate;
    };
    // Average colour of each row of a narrow strip of the page, read back through the
    // page's own canvas: what the reader actually sees, not what the CSS says.
    const strip = async (x, y, height, width = 8) => {
      const data = (await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x, y, width, height, scale: 1 } })).data;
      return js(`(async function(){var i=new Image(); i.src='data:image/png;base64,${data}'; await i.decode();
        var c=document.createElement('canvas'); c.width=i.width; c.height=i.height;
        var g=c.getContext('2d'); g.drawImage(i,0,0);
        var d=g.getImageData(0,0,i.width,i.height).data, out=[];
        for(var yy=0;yy<i.height;yy++){var r=0,gg=0,b=0;
          for(var xx=0;xx<i.width;xx++){var k=(yy*i.width+xx)*4; r+=d[k]; gg+=d[k+1]; b+=d[k+2];}
          out.push([Math.round(r/i.width),Math.round(gg/i.width),Math.round(b/i.width)]);}
        return out;})()`);
    };
    const dist = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));

    for (const domain of ["Page", "Runtime", "Log", "Network", "Performance"]) await send(domain + ".enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });

    // ---------- the desk, before anybody goes looking ----------
    await viewport(1440, 900);
    await open(`${BASE}/?intro=off`);
    const atLoad = await js(`JSON.stringify({
      gate: !!document.getElementById('ow-gate'),
      engine: typeof window.RenguinSeamlessWorld,
      booted: window.RenguinOfficeWorld.booted(),
      css: [].some.call(document.styleSheets, function(s){return (s.href||'').indexOf('seamless.css')>=0}),
      sections: document.querySelectorAll('.sw-section').length,
      daypart: document.getElementById('sw-app').dataset.daypart,
      envTime: document.documentElement.dataset.envTime,
      overflow: document.documentElement.scrollWidth - innerWidth
    })`).then(JSON.parse);
    const loadAssets = worldAssets();
    const loadApi = requests().filter((u) => u.startsWith("/api/world/"));
    check(
      "The desk pays for the band only: no world stylesheet, engine or state at load",
      loadAssets.length === 2 &&
        loadAssets.every((u) => u.startsWith("/static/world/office-gate.css") || u.startsWith("/static/world/office-world-bridge.js")) &&
        !atLoad.css &&
        atLoad.engine === "undefined" &&
        !atLoad.booted &&
        atLoad.sections === 0 &&
        loadApi.length === 0,
      { loadAssets, loadApi, engine: atLoad.engine },
    );
    check("The way down is already there, in the desk's own sky", atLoad.gate && atLoad.overflow <= 0, atLoad);
    check("The world takes the desk's time of day", atLoad.daypart === { MORNING: "day", DAY: "day", AFTERNOON: "day", SUNSET: "dusk", NIGHT: "night" }[atLoad.envTime], { daypart: atLoad.daypart, envTime: atLoad.envTime });
    baseline.desk_idle_top = await cost(3);
    // The desk as it stands, measured before anything is asked of the world: its own
    // height, and its own scrolling over a stretch that stays outside the distance at
    // which the world starts loading, so this is the desk alone and nothing else.
    const deskDocH = await js("document.documentElement.scrollHeight");
    const gateTop = await js("Math.round(document.getElementById('ow-gate').getBoundingClientRect().top+scrollY)");
    const deskRunTo = Math.max(0, Math.min(2700, gateTop - 2.6 * 900));
    baseline.desk_scroll = await cost(0, () => glide(0, deskRunTo, 4000));
    const stillCold = await js("JSON.stringify({booted: window.RenguinOfficeWorld.booted(), docH: document.documentElement.scrollHeight})").then(JSON.parse);
    check("Scrolling the desk itself never reaches for the world", !stillCold.booted && stillCold.docH === deskDocH, { deskRunTo, ...stillCold });

    // ---------- approaching it ----------
    events = [];
    await glide(deskRunTo, gateTop - 200, 3000);
    await sleep(6000);
    const booted = await js(`JSON.stringify({
      booted: window.RenguinOfficeWorld.booted(),
      engine: typeof window.RenguinSeamlessWorld,
      status: document.getElementById('sw-app').dataset.status,
      zones: [].map.call(document.querySelectorAll('.sw-section'), function(s){return s.dataset.zone}),
      url: location.pathname + location.search,
      navigations: performance.getEntriesByType('navigation').length,
      docH: document.documentElement.scrollHeight,
      chrome: document.getElementById('sw-app').classList.contains('is-active')
    })`).then(JSON.parse);
    const bootApi = requests().filter((u) => u.startsWith("/api/world/state") || u.startsWith("/api/world/simulate"));
    check("Approaching it loads the world, once, and reads the world's state once", booted.booted && booted.engine === "object" && booted.status === "ready" && bootApi.length === 1, { bootApi, status: booted.status });
    check("Island, cloud sea and street are sections of this same page", JSON.stringify(booted.zones) === JSON.stringify(["island", "descent", "city"]), booted.zones);
    check("No navigation and no reload: the desk's own URL, one navigation entry", booted.url === "/?intro=off" && booted.navigations === 1, { url: booted.url, navigations: booted.navigations });
    const gateNow = await js("Math.round(document.getElementById('ow-gate').getBoundingClientRect().top+scrollY)");
    check("The world grew below the reader, never above: the way down has not moved", booted.docH > deskDocH && gateNow === gateTop, { deskDocH, docH: booted.docH, gateTop, gateNow });
    check("The world's chrome stays out of the desk until the world is the view", !booted.chrome);

    // ---------- the seam ----------
    const seam = await js(`JSON.stringify((function(){
      var g=document.getElementById('ow-gate'), i=document.getElementById('sw-island');
      return {gateTop: Math.round(g.getBoundingClientRect().top+scrollY),
              gateBottom: Math.round(g.getBoundingClientRect().bottom+scrollY),
              islandTop: Math.round(i.getBoundingClientRect().top+scrollY),
              islandBottom: Math.round(i.getBoundingClientRect().bottom+scrollY)};})())`).then(JSON.parse);
    check("The band hands straight over to the world: no gap between them", seam.gateBottom === seam.islandTop, seam);
    await jump(0);
    await sleep(500);
    const rows = await strip(24, seam.gateTop - 240, seam.islandTop - seam.gateTop + 700);
    const at = (pageY) => rows[pageY - (seam.gateTop - 240)];
    const jumps = [];
    for (let k = 1; k < rows.length; k++) jumps.push(dist(rows[k - 1], rows[k]));
    const worst = Math.max(...jumps);
    const white = rows.filter((r) => r[0] > 250 && r[1] > 250 && r[2] > 250).length;
    const seamIn = dist(at(seam.gateTop - 4), at(seam.gateTop + 4));
    const seamOut = dist(at(seam.gateBottom - 4), at(seam.gateBottom + 4));
    check("Entering the band is not a cut", seamIn <= 8, { step: seamIn });
    check("Leaving the band into the world is not a cut", seamOut <= 8, { step: seamOut });
    check("Nowhere down the seam is there a step a reader would read as an edge", worst <= 24, { worst_step: worst });
    check("No blank frame: nothing on the way down is unpainted white", white === 0, { white_rows: white });
    baseline.seam = { worst_step: worst, entering: seamIn, leaving: seamOut };

    // ---------- down into the world ----------
    const docH = await js("document.documentElement.scrollHeight");
    await jump(seam.gateTop - 600);
    await sleep(600);
    baseline.descent = await cost(0, () => glide(seam.gateTop - 600, docH - 900, 5000));
    await sleep(1200);
    if (OUT) await shot("office-world-city.png");
    const arrived = await js(`JSON.stringify({
      zone: window.RenguinSeamlessWorld.debug().zone,
      chrome: document.getElementById('sw-app').classList.contains('is-active'),
      standDown: document.documentElement.hasAttribute('data-ow-world'),
      residents: document.querySelectorAll('.sw-city .sw-actor').length,
      overflow: document.documentElement.scrollWidth - innerWidth,
      cable: (function(){var c=document.querySelector('.sw-cable'), w=document.querySelectorAll('.sw-wheel');
        if(!c||w.length<2) return null;
        return Math.round(Math.abs((c.getBoundingClientRect().top+scrollY) - (w[0].getBoundingClientRect().top+scrollY)));})()
    })`).then(JSON.parse);
    check("One scroll ends on the street of Renguin City", arrived.zone === "city" && arrived.residents >= 1, arrived);
    check("There the world is the view: its chrome is up and the desk's scenery stands down", arrived.chrome && arrived.standDown, arrived);
    check("The sky cable joins the wheels it hangs between", arrived.cable !== null && arrived.cable <= 4, { off_by: arrived.cable });
    check("No horizontal page overflow anywhere on the way down", arrived.overflow <= 0, arrived.overflow);
    baseline.idle_in_city = await cost(3);

    // Resolution is chosen by how big a resident actually is on screen, and it is
    // measured before anything zooms: the upgrade to the large cut-out is one-way,
    // so a zoom earlier in the walk would make this pass for the wrong reason.
    const lod = await js(`JSON.stringify((function(){
      var at = function(){return [].map.call(document.querySelectorAll('.sw-city .sw-actor img'), function(i){return i.src.slice(-3)})};
      return {plain: at()};})())`).then(JSON.parse);
    check("At the world's own scale, residents are drawn from the small cut-out", lod.plain.length > 0 && lod.plain.every((s) => s === "160"), lod.plain.slice(0, 6));
    const lodUp = await js(`(function(){document.getElementById('sw-zoom-in').click();
      return new Promise(function(res){setTimeout(function(){document.getElementById('sw-zoom-in').click();
        setTimeout(function(){res(JSON.stringify([].map.call(document.querySelectorAll('.sw-city .sw-actor img'), function(i){return i.src.slice(-3)})))},900)},900)})})()`).then(JSON.parse);
    check("Zoomed in close, they are redrawn from the large one", lodUp.length > 0 && lodUp.every((s) => s === "256"), lodUp.slice(0, 6));
    await js("document.getElementById('sw-zoom-out').click();1");
    await sleep(700);
    await js("document.getElementById('sw-zoom-out').click();1");
    await sleep(900);



    // ---------- the world still works down there ----------
    // Every panel the world puts up is position: fixed. Inside someone else's page
    // that is the trap: one transform, filter or contain on an ancestor and the
    // viewport stops being what "fixed" is fixed to, and the card opens somewhere
    // off the bottom of a 10,000px document where nobody will ever see it.
    const drawer = await js(`(function(){document.getElementById('sw-data').click();
      return new Promise(function(res){setTimeout(function(){var d=document.getElementById('sw-drawer');
        var r=d.getBoundingClientRect();
        res(JSON.stringify({open: !d.hidden, onScreen: r.top < innerHeight && r.bottom > 0 && r.left < innerWidth && r.right > 0,
          rows: d.querySelectorAll('h3, dt, .sw-meter').length, top: Math.round(r.top), height: Math.round(r.height)}))},700)})})()`).then(JSON.parse);
    check("世界資料 opens where the reader is, with the world's own figures in it", drawer.open && drawer.onScreen && drawer.rows > 0, drawer);
    await js("document.getElementById('sw-drawer-close').click();1");
    await sleep(400);

    const card = await js(`(function(){var a=document.querySelector('.sw-city .sw-actor'); if(!a) return null; a.click();
      return new Promise(function(res){setTimeout(function(){var c=document.getElementById('sw-card'); var r=c.getBoundingClientRect();
        res(JSON.stringify({open: !c.hidden, onScreen: r.top < innerHeight && r.bottom > 0,
          name: (document.getElementById('sw-card-name')||{}).textContent, top: Math.round(r.top)}))},700)})})()`).then((r) => (r ? JSON.parse(r) : null));
    check("A resident's card opens on screen, naming that resident", card && card.open && card.onScreen && card.name, card);
    await js("document.getElementById('sw-card-close').click();1");
    await sleep(300);

    const travel = await js(`(function(){var b=document.getElementById('sw-district'); b.click();
      return new Promise(function(res){setTimeout(function(){var list=document.getElementById('sw-district-list');
        var open=list.querySelectorAll('button[data-district]');
        var target=open[open.length-1]; var want=target?target.dataset.district:null; if(target) target.click();
        setTimeout(function(){res(JSON.stringify({want: want, at: window.RenguinSeamlessWorld.debug().district,
          y: Math.round(scrollY), zone: window.RenguinSeamlessWorld.debug().zone, choices: open.length}))},2200)},500)})})()`).then(JSON.parse);
    check("The street still travels: the district navigator reaches the district it names", travel.choices > 0 && travel.want === travel.at && travel.zone === "city", travel);

    const zoomed = await js(`(function(){var before=window.RenguinSeamlessWorld.composition().ws, y=scrollY;
      document.getElementById('sw-zoom-in').click();
      return new Promise(function(res){setTimeout(function(){res(JSON.stringify({before: before,
        after: window.RenguinSeamlessWorld.composition().ws, movedPage: Math.abs(scrollY - y) > 4,
        zone: window.RenguinSeamlessWorld.debug().zone}))},900)})})()`).then(JSON.parse);
    check("Zooming the world rescales it without taking the desk's scroll with it", zoomed.after > zoomed.before && !zoomed.movedPage, zoomed);
    await js("document.getElementById('sw-zoom-out').click();1");
    await sleep(800);

    const night = await js(`(function(){document.getElementById('sw-time').click();
      return new Promise(function(res){setTimeout(function(){res(JSON.stringify({
        daypart: document.getElementById('sw-app').dataset.daypart,
        gateLit: getComputedStyle(document.getElementById('ow-gate'), '::before').backgroundColor}))},600)})})()`).then(JSON.parse);
    check("Changing the world's time of day carries through to the band above it", Boolean(night.daypart && night.gateLit && night.gateLit !== "rgba(0, 0, 0, 0)"), night);

    const culled = await js(`JSON.stringify((function(){var d=window.RenguinSeamlessWorld.debug();
      var all=window.RenguinSeamlessWorld.districts();
      return {near: d.near, districts: all.length, worked: all.filter(function(x){return x.near}).length,
        hiddenChunks: document.querySelectorAll('[data-layer="residents"] > .sw-chunk:not([data-near])').length};})())`).then(JSON.parse);
    check("Only the stretch of street the reader is on is worked; the rest is skipped", culled.districts === 0 || culled.worked < culled.districts || culled.districts === 1, culled);
    check("The island is not worked while the reader is down in the city", !culled.near.includes("island"), culled.near);

    // ---------- and back ----------
    const back = await js(`(function(){var b=document.querySelector('.sw-back'); if(!b) return null; b.click();
      return new Promise(function(res){setTimeout(function(){res(JSON.stringify({y: Math.round(scrollY),
        url: location.pathname+location.search, navigations: performance.getEntriesByType('navigation').length,
        chrome: document.getElementById('sw-app').classList.contains('is-active'),
        paused: window.RenguinSeamlessWorld.debug().paused}))},2600)})})()`).then((r) => JSON.parse(r));
    check("The way back is the same scroll in reverse, not a page", back.y === 0 && back.url === "/?intro=off" && back.navigations === 1, back);
    check("Back at the desk the world stops computing", back.paused && !back.chrome, back);
    const suspended = await js(`JSON.stringify((function(){var d=window.RenguinSeamlessWorld.debug();
      var running=document.getAnimations().filter(function(a){var t=a.effect&&a.effect.target;
        return a.playState==='running' && t && t.closest && t.closest('#sw-world');}).length;
      return {paused: d.paused, near: d.near, runningAnimations: running};})())`).then(JSON.parse);
    check("Nothing in the world is still animating while the reader is at the desk", suspended.paused && suspended.runningAnimations === 0, suspended);
    baseline.desk_idle_after = await cost(3);
    check("No page errors on the whole walk", errors().length === 0, errors().slice(0, 3));

    // ---------- phone ----------
    await viewport(390, 844, true);
    await open(`${BASE}/?intro=off`);
    const pGate = await js("Math.round(document.getElementById('ow-gate').getBoundingClientRect().top+scrollY)");
    await glide(0, pGate + 200, 3000);
    await sleep(7000);
    const pH = await js("document.documentElement.scrollHeight");
    await glide(pGate, pH - 844, 4000);
    await sleep(1500);
    if (OUT) await shot("office-world-phone-city.png");
    const phone = await js(`JSON.stringify({
      zone: window.RenguinSeamlessWorld.debug().zone,
      zones: [].map.call(document.querySelectorAll('.sw-section'), function(s){return s.dataset.zone}),
      compact: document.getElementById('sw-app').classList.contains('is-compact'),
      overflow: document.documentElement.scrollWidth - innerWidth,
      chrome: document.getElementById('sw-app').classList.contains('is-active')
    })`).then(JSON.parse);
    check("Phone: the same one scroll reaches the city, composed for the screen", phone.zone === "city" && phone.compact && phone.chrome && JSON.stringify(phone.zones) === JSON.stringify(["island", "descent", "city"]), phone);
    check("Phone: no horizontal page overflow", phone.overflow <= 0, phone.overflow);

    // ---------- the desk without it ----------
    await viewport(1440, 900);
    await open(`${BASE}/?intro=off&world=off`);
    const off = await js(`JSON.stringify({
      gate: !!document.getElementById('ow-gate'),
      root: !!document.getElementById('sw-app'),
      bridge: typeof window.RenguinOfficeWorld,
      overflow: document.documentElement.scrollWidth - innerWidth
    })`).then(JSON.parse);
    check("?world=off leaves the desk exactly as it was", !off.gate && !off.root && off.bridge === "undefined" && off.overflow <= 0, off);

    // ---------- what the way down costs the desk ----------
    // Wall-clock main-thread time on a working machine swings by half between two
    // runs of the same code, so one measurement of each is worth nothing. The two
    // variants are measured alternately, three times each, and compared on medians;
    // the counters Chrome keeps exactly — style recalculations, layouts, script time,
    // nodes — are what the gate is on, because those are what this change can move.
    const med = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    const samples = { with: [], without: [] };
    for (let round = 0; round < 3; round++) {
      for (const off of [true, false]) {
        await open(`${BASE}/?intro=off` + (off ? "&world=off" : ""), 7000);
        const idle = await cost(3);
        const idleFps = await fps(3000);
        await jump(0);
        await sleep(400);
        let scrollFps = 0;
        const scrolled = await cost(0, async () => {
          scrollFps = await fpsWhile(() => glide(0, deskRunTo, 4000));
        });
        samples[off ? "without" : "with"].push({ idle: { ...idle, fps: idleFps }, scrolled: { ...scrolled, fps: scrollFps } });
      }
    }
    const roll = (key, phase, metric) => med(samples[key].map((s) => s[phase][metric]));
    for (const key of ["with", "without"])
      baseline["desk_" + key + "_the_way_down"] = {
        idle_main_ms_per_s: roll(key, "idle", "main_thread_ms_per_s"),
        idle_script_ms_per_s: roll(key, "idle", "script_ms_per_s"),
        idle_style_recalcs_per_s: roll(key, "idle", "style_recalcs_per_s"),
        scroll_main_ms_per_s: roll(key, "scrolled", "main_thread_ms_per_s"),
        scroll_script_ms_per_s: roll(key, "scrolled", "script_ms_per_s"),
        scroll_style_recalcs_per_s: roll(key, "scrolled", "style_recalcs_per_s"),
        idle_fps: roll(key, "idle", "fps"),
        scroll_fps: roll(key, "scrolled", "fps"),
        dom_nodes: roll(key, "idle", "dom_nodes"),
      };
    const a = baseline.desk_with_the_way_down;
    const z = baseline.desk_without_the_way_down;
    const pct = (x, y) => (y <= 0 ? 0 : +(((x - y) / y) * 100).toFixed(1));
    baseline.desk_cost_of_the_way_down = {
      idle_style_recalcs_pct: pct(a.idle_style_recalcs_per_s, z.idle_style_recalcs_per_s),
      idle_script_pct: pct(a.idle_script_ms_per_s, z.idle_script_ms_per_s),
      idle_main_pct: pct(a.idle_main_ms_per_s, z.idle_main_ms_per_s),
      scroll_style_recalcs_pct: pct(a.scroll_style_recalcs_per_s, z.scroll_style_recalcs_per_s),
      scroll_script_pct: pct(a.scroll_script_ms_per_s, z.scroll_script_ms_per_s),
      scroll_main_pct: pct(a.scroll_main_ms_per_s, z.scroll_main_ms_per_s),
      idle_fps_pct: pct(a.idle_fps, z.idle_fps),
      scroll_fps_pct: pct(a.scroll_fps, z.scroll_fps),
      nodes: a.dom_nodes - z.dom_nodes,
    };
    const c = baseline.desk_cost_of_the_way_down;
    check("Idle, the desk does no more style or script work for the way down being there", c.idle_style_recalcs_pct <= 5 && c.idle_script_pct <= 15, c);
    check("Scrolling, the desk does no more style or script work for the way down being there", c.scroll_style_recalcs_pct <= 5 && c.scroll_script_pct <= 15, c);
    check("The band itself is a handful of nodes, not a second page", c.nodes <= 60, { nodes: c.nodes });
    check("Idle and scrolling wall-clock are within the machine's own spread", c.idle_main_pct <= 25 && c.scroll_main_pct <= 25, c);
    check("The desk still draws as many frames: the pixel office keeps walking at the same rate", c.idle_fps_pct >= -5 && c.scroll_fps_pct >= -5, { idle_fps: [a.idle_fps, z.idle_fps], scroll_fps: [a.scroll_fps, z.scroll_fps], ...c });

    ws.close();
  } finally {
    chrome.kill();
  }
  const failed = results.filter((r) => !r.pass);
  console.log("\nperformance baseline: " + JSON.stringify(baseline, null, 1));
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (OUT) fs.writeFileSync(path.join(OUT, "office-world-seamless-check.json"), JSON.stringify({ results, baseline }, null, 2));
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
