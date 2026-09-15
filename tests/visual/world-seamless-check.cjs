// Renguin World seamless slice in a real browser: exploration, residents, lifecycle, motion, performance.
//
//   node tests/visual/world-seamless-check.cjs http://127.0.0.1:19119 [--out <dir>]
//
// One headless Chrome tab over CDP, simulated worlds only (?sim=), so it never depends on
// anyone's data. Prints PASS/FAIL per check and a performance baseline as JSON.
const { spawn } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

const BASE = (process.argv[2] || "http://127.0.0.1:19119").replace(/\/$/, "");
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(BASE)) throw Error("LOCAL_ONLY");
const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : null;
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9300 + Math.floor(Math.random() * 90);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const baseline = {};
const check = (name, pass, detail) => {
  results.push({ name, pass: Boolean(pass), detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail === undefined ? "" : "  " + JSON.stringify(detail)}`);
};

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "rw-seamless-"));
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
    const viewport = async (width, height, mobile = false, dpr = 1) => {
      await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dpr, mobile });
      await send("Emulation.setTouchEmulationEnabled", { enabled: mobile, maxTouchPoints: mobile ? 5 : 0 });
    };
    const open = async (url, wait = 2500) => {
      events = [];
      await send("Page.navigate", { url });
      await sleep(wait);
    };
    const shot = async (name) => OUT && fs.writeFileSync(path.join(OUT, name), Buffer.from((await send("Page.captureScreenshot", { format: "png" })).data, "base64"));
    const errors = () =>
      events
        .filter((e) => e.method === "Runtime.exceptionThrown" || (e.method === "Log.entryAdded" && e.params.entry.level === "error") || (e.method === "Runtime.consoleAPICalled" && e.params.type === "error"))
        .map((e) => e.params.entry?.text || e.params.exceptionDetails?.exception?.description || "console.error");
    const requests = () => events.filter((e) => e.method === "Network.requestWillBeSent").map((e) => e.params.request.url.replace(BASE, ""));
    const metrics = async () => Object.fromEntries((await send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
    const cost = async (seconds, during) => {
      const a = await metrics();
      const started = Date.now();
      if (during) await during();
      const left = seconds * 1000 - (Date.now() - started);
      if (left > 0) await sleep(left);
      const b = await metrics();
      const span = Math.max(seconds, (Date.now() - started) / 1000);
      return {
        main_thread_ms_per_s: +(((b.TaskDuration - a.TaskDuration) * 1000) / span).toFixed(1),
        script_ms_per_s: +(((b.ScriptDuration - a.ScriptDuration) * 1000) / span).toFixed(1),
        layouts_per_s: +((b.LayoutCount - a.LayoutCount) / span).toFixed(2),
        style_recalcs_per_s: +((b.RecalcStyleCount - a.RecalcStyleCount) / span).toFixed(2),
        dom_nodes: b.Nodes,
        js_heap_mb: +(b.JSHeapUsedSize / 1048576).toFixed(1),
      };
    };
    const wheel = async (x, y, dy, steps, gap = 16) => {
      for (let k = 0; k < steps; k++) {
        await send("Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX: 0, deltaY: dy });
        await sleep(gap);
      }
    };
    const click = async (selector) => {
      const box = await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}); if(!e) return null; e.scrollIntoView({block:'center', inline:'center', behavior:'instant'}); const r=e.getBoundingClientRect(); return {x:r.left+r.width/2, y:r.top+r.height/2};})()`);
      if (!box) return false;
      await sleep(250);
      const again = await js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x:r.left+r.width/2, y:r.top+r.height/2};})()`);
      for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x: again.x, y: again.y, button: "left", clickCount: 1 });
      return true;
    };
    for (const domain of ["Page", "Runtime", "Log", "Network", "Performance"]) await send(domain + ".enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });

    // ---------- desktop ----------
    await viewport(1440, 900);
    await open(`${BASE}/world/seamless?sim=20&time=day`, 3500);
    const loaded = requests();
    check("Slice loads its own bundle and reads world state once", ["/static/world/seamless.css", "/static/world/world-camera.js", "/static/world/seamless-art.js", "/static/world/seamless-app.js"].every((f) => loaded.some((u) => u.startsWith(f))) && loaded.filter((u) => u.startsWith("/api/world/simulate") || u.startsWith("/api/world/state")).length === 1, loaded.filter((u) => u.startsWith("/api/")));
    check("Slice never loads the V1 app", !loaded.some((u) => u.startsWith("/static/world/world-app.js")));
    const start = await js("({dbg: window.RenguinSeamlessWorld.debug(), zone: document.getElementById('sw-app').dataset.zone || 'island', docked: document.querySelector('.sw-gondola').dataset.docked, overflow: document.documentElement.scrollWidth - innerWidth})");
    check("Opens at the Star Office sky island with the gondola docked there", start.dbg.zone === "island" && start.docked === "island", start);
    check("Desktop: no horizontal page overflow", start.overflow <= 0, start.overflow);
    const cast = await js("[...document.querySelectorAll('.sw-actor')].map(a=>({id:a.dataset.character, res:a.dataset.resolution, name:a.querySelector('.sw-nametag').textContent}))");
    check("5-10 residents, all official characters (canonical or profession)", cast.length >= 5 && cast.length <= 10 && cast.every((c) => ["CANONICAL_CHARACTER", "PROFESSION_CHARACTER"].includes(c.res)), cast);
    check("At least one profession resident is on the street", cast.some((c) => c.res === "PROFESSION_CHARACTER"));
    check("Culling: the city is not worked while the island is on screen", !start.dbg.near.includes("city"), start.dbg.near);
    baseline.desktop_idle_island = await cost(3);

    await click(".sw-descend");
    let descended;
    for (let k = 0; k < 20; k++) {
      await sleep(250);
      descended = await js("({zone: window.RenguinSeamlessWorld.debug().zone, docked: document.querySelector('.sw-gondola').dataset.docked, y: scrollY})");
      if (descended.zone === "descent") break;
    }
    check("往下探索 moves down into the clouds and the gondola rides along", descended.zone === "descent" && descended.docked === "moving", descended);
    await js("window.scrollTo({top: 0, behavior: 'instant'})");
    await sleep(400);
    baseline.desktop_scroll_wheel = await cost(0, () => wheel(720, 500, 120, 40));
    const afterWheel = await js("({zone: window.RenguinSeamlessWorld.debug().zone, y: scrollY})");
    check("Mouse wheel scrolls the world down (primary navigation)", afterWheel.y > 1500, afterWheel);
    await click('#sw-altimeter [data-zone="city"]');
    await sleep(2000);
    const city = await js("({dbg: window.RenguinSeamlessWorld.debug(), docked: document.querySelector('.sw-gondola').dataset.docked, nav: !document.getElementById('sw-street-nav').hidden, bottom: Math.abs(scrollY + innerHeight - document.documentElement.scrollHeight)})");
    check("Altimeter 城市 arrives at Renguin City; gondola docked at the street station", city.dbg.zone === "city" && city.docked === "city" && city.bottom < 4 && city.nav, city);
    check("Culling: the island is not worked while the city is on screen", !city.dbg.near.includes("island"), city.dbg.near);
    await shot("desktop-city.png");
    const sizes = await js("[...document.querySelectorAll('.sw-city [data-layer=residents] .sw-actor')].filter(a=>{const r=a.getBoundingClientRect(); return r.right>0&&r.left<innerWidth}).map(a=>Math.round(a.querySelector('img').getBoundingClientRect().height))");
    check("Street residents are readable size on desktop (>= 120 px)", sizes.length && sizes.every((h) => h >= 120), sizes);
    baseline.desktop_idle_city = await cost(3);

    const before = await js("document.querySelector('.sw-street-scroll').scrollLeft");
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: 900, y: 300, button: "left", clickCount: 1 });
    for (let k = 1; k <= 12; k++) {
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 900 - k * 40, y: 300, button: "left", buttons: 1 });
      await sleep(16);
    }
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 420, y: 300, button: "left", clickCount: 1 });
    await sleep(300);
    const dragged = await js("({left: document.querySelector('.sw-street-scroll').scrollLeft, card: !document.getElementById('sw-card').hidden})");
    check("Mouse drag pans the street sideways without opening anything", dragged.left > before + 300 && !dragged.card, { before, after: dragged });
    await js("document.querySelector('.sw-street-scroll').scrollLeft = 99999");
    await sleep(300);
    const edge = await js("(()=>{const s=document.querySelector('.sw-street-scroll'); return {left:s.scrollLeft, max:s.scrollWidth-s.clientWidth, width:s.scrollWidth, right: document.getElementById('sw-street-right').disabled}})()");
    check("Street pan is bounded to the street (no runaway scroll width)", edge.left === edge.max && Math.abs(edge.width - 2800) <= 2 && edge.right, edge);
    await js("document.querySelector('.sw-street-scroll').scrollLeft = 0");
    await sleep(300);

    const residentId = await js("document.querySelector('.sw-city [data-layer=residents] .sw-actor').dataset.character");
    await click(`.sw-city [data-layer=residents] .sw-actor[data-character="${residentId}"]`);
    await sleep(400);
    const card = await js("({open: !document.getElementById('sw-card').hidden, name: document.getElementById('sw-card-name').textContent, role: document.getElementById('sw-card-role').textContent, selected: document.querySelectorAll('.sw-actor.is-selected').length})");
    check("Clicking a resident opens its card with authority-only facts", card.open && card.name && card.role && card.selected === 1, card);
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await sleep(200);
    check("Escape closes the card", await js("document.getElementById('sw-card').hidden && !document.querySelector('.sw-actor.is-selected')"));
    await click(".sw-poster-link");
    await sleep(500);
    const drawer = await js("({open: !document.getElementById('sw-drawer').hidden, videos: !!document.querySelector('#sw-drawer .sw-videos'), panels: document.querySelectorAll('#sw-drawer .sw-panel').length})");
    check("The poster board opens the data drawer at the videos (dashboard is secondary)", drawer.open && drawer.videos && drawer.panels >= 4, drawer);
    await click("#sw-drawer-close");
    await sleep(200);

    const zoomBefore = await js("window.RenguinSeamlessWorld.debug().ws");
    await click("#sw-zoom-in");
    await sleep(500);
    const zoomed = await js("({ws: window.RenguinSeamlessWorld.debug().ws, overflow: document.documentElement.scrollWidth - innerWidth, zone: window.RenguinSeamlessWorld.debug().zone})");
    check("A+ enlarges the world (secondary zoom) without horizontal overflow", zoomed.ws > zoomBefore && zoomed.overflow <= 0, { zoomBefore, zoomed });
    await click("#sw-zoom-out");
    await sleep(400);
    const dayparts = [];
    for (let k = 0; k < 4; k++) {
      await click("#sw-time");
      await sleep(120);
      dayparts.push(await js("document.getElementById('sw-app').dataset.daypart"));
    }
    check("Time of day cycles and returns", new Set(dayparts).size >= 3, dayparts);
    await js("Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange'))");
    const hidden = await js("({paused: window.RenguinSeamlessWorld.debug().paused, cls: document.getElementById('sw-app').classList.contains('sw-paused'), anim: getComputedStyle(document.querySelector('.sw-actor-body')).animationPlayState})");
    check("Hidden tab pauses every animation", hidden.paused && hidden.cls && hidden.anim === "paused", hidden);
    baseline.desktop_hidden = await cost(2);
    await js("Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange'))");
    check("Zero console errors (desktop)", errors().length === 0, errors());
    await js("window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }))");
    const left = await js("window.RenguinSeamlessWorld.debug()");
    check("Leaving releases listeners, observers, requests and the world", !left.running && left.listeners === 0 && left.disposers === 0 && !left.observing && left.pendingRequests === 0 && left.residents === 0, left);

    // ---------- reduced motion ----------
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await open(`${BASE}/world/seamless?sim=20&time=day`, 3000);
    await js("window.scrollTo({top: 1400, behavior: 'instant'})");
    await sleep(500);
    const still = await js("({transforms: [...document.querySelectorAll('.sw-section:not(.sw-city) .sw-layer')].filter(l=>l.style.transform).length, anim: getComputedStyle(document.querySelector('.sw-actor-body')).animationName, gondola: !!document.querySelector('.sw-gondola').style.transform})");
    check("Reduced motion: no parallax and no animation, exploration still works", still.transforms === 0 && still.anim === "none" && still.gondola, still);
    await send("Emulation.setEmulatedMedia", { features: [] });

    // ---------- phone ----------
    await viewport(390, 844, true, 2);
    await open(`${BASE}/world/seamless?sim=20&time=day`, 3500);
    const phone = await js("({w: innerWidth, overflow: document.documentElement.scrollWidth - innerWidth, ws: window.RenguinSeamlessWorld.debug().ws, island: [...document.querySelectorAll('.sw-island [data-layer=residents] .sw-actor')].map(a=>{const r=a.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]})})");
    check("Phone: no horizontal overflow and island residents stay on screen", phone.w === 390 && phone.overflow <= 0 && phone.island.every(([l, r]) => l >= 0 && r <= 390), phone);
    baseline.phone_idle_island = await cost(3);
    await shot("phone-island.png");
    baseline.phone_scroll_touch = await cost(0, async () => {
      for (let k = 0; k < 6; k++) {
        await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 200, y: 700 }] });
        for (let j = 1; j <= 10; j++) {
          await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 200, y: 700 - j * 50 }] });
          await sleep(16);
        }
        await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await sleep(120);
      }
    });
    const touched = await js("({y: scrollY, zone: window.RenguinSeamlessWorld.debug().zone})");
    check("Phone: a vertical swipe scrolls the world down", touched.y > 400, touched);
    await js("window.scrollTo({top: document.documentElement.scrollHeight, behavior: 'instant'})");
    await sleep(1500);
    const phoneCity = await js("({zone: window.RenguinSeamlessWorld.debug().zone, sizes: [...document.querySelectorAll('.sw-city [data-layer=residents] .sw-actor')].filter(a=>{const r=a.getBoundingClientRect(); return r.right>0&&r.left<innerWidth}).map(a=>Math.round(a.querySelector('img').getBoundingClientRect().height)), left: document.querySelector('.sw-street-scroll').scrollLeft})");
    check("Phone: arrives in the city with readable residents (>= 95 px)", phoneCity.zone === "city" && phoneCity.sizes.length && phoneCity.sizes.every((h) => h >= 95), phoneCity);
    await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 330, y: 560 }] });
    for (let j = 1; j <= 12; j++) {
      await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 330 - j * 24, y: 560 }] });
      await sleep(16);
    }
    await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await sleep(800);
    const swiped = await js("({left: document.querySelector('.sw-street-scroll').scrollLeft, y: scrollY})");
    check("Phone: a sideways swipe pans the street", swiped.left > phoneCity.left + 100, swiped);
    await shot("phone-city.png");
    baseline.phone_idle_city = await cost(3);
    const imageBytes = events.filter((e) => e.method === "Network.loadingFinished").reduce((sum, e) => sum + e.params.encodedDataLength, 0);
    baseline.phone_transfer_kb_after_city = Math.round(imageBytes / 1024);
    check("Zero console errors (phone)", errors().length === 0, errors());

    // ---------- A. composition rule, measured in the real page ----------
    const frame = `(()=>{const c=window.RenguinSeamlessWorld.composition(); const band=(sel)=>[...document.querySelectorAll(sel)].map(a=>{const img=a.querySelector('img').getBoundingClientRect(); const tag=a.querySelector('.sw-nametag').getBoundingClientRect(); return {l:img.left, r:img.right, t:img.top, b:tag.bottom, h:img.height};}).filter(x=>x.r>0&&x.l<innerWidth); return {c, w: innerWidth, h: innerHeight, overflow: document.documentElement.scrollWidth-innerWidth, star: document.querySelector('.sw-fx-beacon').getBoundingClientRect().top + document.querySelector('.sw-fx-beacon').getBoundingClientRect().height/2, island: band('.sw-island [data-layer=residents] .sw-actor'), city: band('.sw-city [data-layer=residents] .sw-actor')};})()`;
    const matrix = [["desktop wide", 1920, 1080, false], ["laptop", 1440, 900, false], ["laptop 720p", 1280, 720, false], ["tablet landscape", 1024, 768, true], ["tablet portrait", 768, 1024, true], ["phone portrait", 390, 844, true], ["small phone", 360, 640, true], ["phone landscape", 844, 390, true], ["small phone landscape", 667, 375, true]];
    const composition = {};
    for (const [label, w, h, touch] of matrix) {
      await viewport(w, h, touch, touch ? 2 : 1);
      await open(`${BASE}/world/seamless?sim=20&time=day`, 2600);
      const top = await js(frame);
      await js("window.scrollTo({top: document.documentElement.scrollHeight, behavior: 'instant'})");
      await sleep(700);
      const bottom = await js(frame);
      const safeTop = top.c.safe.top - 2,
        safeBottom = h - top.c.safe.bottom + 2;
      const islandOk = top.star >= safeTop && top.island.length > 0 && top.island.every((a) => a.t >= safeTop && a.b <= safeBottom && a.l >= 0 && a.r <= w);
      const cityOk = bottom.city.length > 0 && bottom.city.every((a) => a.t >= safeTop && a.b <= safeBottom);
      const sizes = [...top.island, ...bottom.city].map((a) => Math.round(a.h));
      composition[label] = { ws: top.c.ws, compact: top.c.compact, resident_px: sizes, island_top: Math.round(top.star), island_bottom: Math.round(Math.max(...top.island.map((a) => a.b))), city_top: Math.round(Math.min(...bottom.city.map((a) => a.t))), city_bottom: Math.round(Math.max(...bottom.city.map((a) => a.b))), safe: [top.c.safe.top, h - top.c.safe.bottom] };
      check(`A. ${label} ${w}x${h}: island and street residents framed inside the safe area, no overflow`, islandOk && cityOk && top.overflow <= 0 && sizes.every((px) => px >= 80), composition[label]);
    }
    baseline.composition = composition;

    // ---------- B. every city layer can be controlled on its own ----------
    await viewport(1440, 900);
    await open(`${BASE}/world/seamless?sim=20&time=day`, 3000);
    await js("window.scrollTo({top: document.documentElement.scrollHeight, behavior: 'instant'})");
    await sleep(800);
    const stack = await js("window.RenguinSeamlessWorld.layers().filter(l=>l.zone==='city')");
    const required = ["sky", "distant", "backdrop", "buildings", "street", "foreground", "residents", "effects"];
    check("B. Renguin City mounts eight independent layers in z order", required.every((n) => stack.some((l) => l.name === n)) && stack.map((l) => l.z).every((z, i, a) => !i || z > a[i - 1]), stack.map((l) => `${l.name}@${l.z}/${l.host}/${l.depth}`));
    const isolated = [];
    for (const name of required) {
      if (OUT) {
        // Evidence image: this layer alone.
        await js(`(()=>{for (const n of ${JSON.stringify(required)}) window.RenguinSeamlessWorld.setLayer('city.'+n, n===${JSON.stringify(name)}); return true})()`);
        await sleep(150);
        await shot(`layer-${name}.png`);
      }
      const seen = await js(`(()=>{for (const n of ${JSON.stringify(required)}) window.RenguinSeamlessWorld.setLayer('city.'+n, true); window.RenguinSeamlessWorld.setLayer('city.${name}', false); const hidden = window.RenguinSeamlessWorld.layers().filter(l=>l.zone==='city'&&l.hidden).map(l=>l.name); const residents = [...document.querySelectorAll('.sw-city [data-layer=residents] .sw-actor')].filter(a=>a.getClientRects().length).length; for (const n of ${JSON.stringify(required)}) window.RenguinSeamlessWorld.setLayer('city.'+n, true); return {hidden, residents};})()`);
      isolated.push({ name, ...seen });
    }
    check("B. hiding one layer hides only that layer (residents stay unless the residents layer is hidden)", isolated.every((x) => x.hidden.length === 1 && x.hidden[0] === x.name && (x.name === "residents" ? x.residents === 0 : x.residents > 0)), isolated);
    await open(`${BASE}/world/seamless?sim=20&time=day&hide=city.foreground,city.effects`, 2800);
    const hiddenByQuery = await js("window.RenguinSeamlessWorld.layers().filter(l=>l.hidden).map(l=>l.zone+'.'+l.name)");
    check("B. ?hide= loads the world with chosen layers switched off (QA and future art passes)", hiddenByQuery.length === 2 && hiddenByQuery.includes("city.foreground") && hiddenByQuery.includes("city.effects"), hiddenByQuery);

    // ---------- C. seamless navigation ----------
    await open(`${BASE}/world/seamless?sim=20&time=day`, 3000);
    const journeyStart = await js("(()=>{window.__left=0; addEventListener('pagehide',()=>window.__left++); addEventListener('beforeunload',()=>window.__left++); return {href: location.href, history: history.length, navs: performance.getEntriesByType('navigation').length}})()");
    await wheel(720, 500, 120, 50);
    await sleep(600);
    await click('#sw-altimeter [data-zone="island"]');
    await sleep(2200);
    await click('#sw-altimeter [data-zone="city"]');
    await sleep(2200);
    const journeyEnd = await js("(()=>{const s=[...document.querySelectorAll('.sw-section')]; const seams=s.slice(1).map((x,i)=>Math.abs(x.offsetTop-(s[i].offsetTop+s[i].offsetHeight))); return {href: location.href, history: history.length, navs: performance.getEntriesByType('navigation').length, left: window.__left, zone: window.RenguinSeamlessWorld.debug().zone, seams, order: s.map(x=>x.dataset.zone), sameDocument: !!window.__left===false}})()");
    check("C. the whole island → clouds → city journey (wheel and altimeter) stays in one document on one route", journeyEnd.href === journeyStart.href && journeyEnd.history === journeyStart.history && journeyEnd.navs === 1 && journeyEnd.left === 0 && journeyEnd.zone === "city", { journeyStart, journeyEnd });
    check("C. the three sections touch with no gap: one continuous world", journeyEnd.seams.every((g) => g <= 1) && journeyEnd.order.join() === "island,descent,city", journeyEnd.seams);
    const seamColours = await js("(()=>{const s=[...document.querySelectorAll('.sw-section')].map(x=>getComputedStyle(x).backgroundImage.match(/rgba?\\([^)]*\\)/g)); return {islandEnd: s[0].at(-1), descentStart: s[1][0], descentEnd: s[1].at(-1), cityStart: s[2][0]}})()");
    check("C. the sky colour is identical on both sides of each seam", seamColours.islandEnd === seamColours.descentStart && seamColours.descentEnd === seamColours.cityStart, seamColours);
    const cable = await js("(()=>{const c=document.querySelector('.sw-cable'); const g=document.querySelector('.sw-gondola'); return {z: getComputedStyle(c).zIndex, parent: c.parentElement.id, docked: g.dataset.docked}})()");
    check("C. one cable belongs to the world itself and carries the gondola to the street", cable.parent === "sw-world" && cable.docked === "city", cable);

    // ---------- V1 still there ----------
    await viewport(1440, 900);
    await open(`${BASE}/world?sim=20&time=day`, 2500);
    const v1 = await js("({svg: !!document.querySelector('#rw-stage svg'), hud: document.querySelectorAll('.rw-card').length, seamless: typeof window.RenguinSeamlessWorld})");
    check("V1 /world still renders and does not load the slice", v1.svg && v1.hud >= 6 && v1.seamless === "undefined", v1);
    ws.close();
  } finally {
    chrome.kill();
  }
  const failed = results.filter((r) => !r.pass);
  console.log("\nperformance baseline: " + JSON.stringify(baseline, null, 1));
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (OUT) fs.writeFileSync(path.join(OUT, "seamless-check.json"), JSON.stringify({ results, baseline }, null, 2));
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
