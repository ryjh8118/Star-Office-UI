// Renguin World data parity: V1 (/world) and the seamless world (/world/seamless) must say the same
// thing about the same world_state, and the seamless world must place what the state says.
//
//   node tests/visual/world-parity-check.cjs http://127.0.0.1:19131 [--state <world_state.json>] [--out <dir>]
//
// Simulated worlds by default (?sim=), so it never depends on anyone's data. With --state, both pages
// are served that saved public world_state instead of /api/world/state (for example a read-only copy of
// Production's), so real data can be checked in Preview without touching Production.
const { spawn } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

const BASE = (process.argv[2] || "http://127.0.0.1:19119").replace(/\/$/, "");
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(BASE)) throw Error("LOCAL_ONLY");
const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null);
const STATE = arg("--state") ? fs.readFileSync(arg("--state"), "utf8") : null;
const OUT = arg("--out");
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9200 + Math.floor(Math.random() * 90);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass: Boolean(pass), detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail === undefined ? "" : "  " + JSON.stringify(detail)}`);
};
const SCENARIOS = STATE
  ? [["saved state", "", "?time=day"]]
  : [
      ["empty world", "sim=0", "&time=day"],
      ["camp", "sim=5", "&time=day"],
      ["riverside", "sim=20", "&time=day"],
      ["kingdom", "sim=50", "&time=night"],
      ["starport", "sim=100", "&time=day"],
      ["deep dormant", "sim=50&idle=45", "&time=day"],
      ["revival", "sim=50&idle=1&gap=20", "&time=dusk"],
    ];

// What V1 shows, read from its DOM.
const V1 = `(()=>{const t=(s,r=document)=>[...r.querySelectorAll(s)].map(e=>e.textContent.trim());
  return {
    era: document.querySelector('.rw-era-card h1 span')?.textContent, level: document.querySelector('.rw-level')?.textContent,
    stage: document.querySelector('.rw-stage-name')?.textContent, tagline: document.querySelector('.rw-tagline')?.textContent,
    progress: document.querySelector('.rw-progress-note')?.textContent,
    stats: Object.fromEntries([...document.querySelectorAll('.rw-stat')].map(s=>[s.querySelector('span').textContent, +s.querySelector('strong').textContent])),
    unpublished: t('.rw-stats-card .rw-note').join(' '),
    activity: document.querySelector('.rw-activity-chip')?.textContent, description: document.querySelector('.rw-activity-text')?.textContent,
    facts: t('.rw-activity-card .rw-facts dd'), events: t('.rw-events li'), replay: !!document.querySelector('.rw-activity-card .rw-chip-button'),
    featured: t('.rw-poster-card h3'), featuredMeta: t('.rw-poster-card .rw-meta'), youtube: t('.rw-featured-card > .rw-note').join(' '),
    growth: t('.rw-growth li').filter(x=>!x.includes('尚無成長紀錄')).length, currentEra: document.querySelector('.rw-eras li.is-current span')?.textContent, reached: t('.rw-eras li.is-reached span, .rw-eras li.is-current span'),
    districts: [...document.querySelectorAll('.rw-district')].map(d=>[d.querySelector('strong').textContent, d.querySelector('span').textContent, d.querySelector('small').textContent]),
    sources: [...document.querySelectorAll('.rw-sources li')].map(l=>[l.querySelector('span').textContent, l.querySelector('b').textContent]),
    roster: document.querySelector('.rw-roster-card .rw-note')?.textContent,
  };})()`;

// What the seamless world shows: its drawer, and what stands on its street.
const SEAMLESS = `(()=>{const t=(s,r=document)=>[...r.querySelectorAll(s)].map(e=>e.textContent.trim()); const panel=(title)=>[...document.querySelectorAll('#sw-drawer .sw-panel')].find(p=>(p.querySelector('h3')||{}).textContent===title);
  const era=document.querySelector('#sw-drawer .sw-era'); const act=panel('城市狀態'); const content=panel('內容'); const growth=panel('最近的成長');
  return {
    eraTitle: era.querySelector('h3').textContent, eraNote: t('.sw-note', era), tagline: era.querySelector('.sw-tagline')?.textContent || null,
    content: t('.sw-note', content),
    activity: act.querySelector('.sw-activity-chip').textContent, description: act.querySelector('.sw-note').textContent,
    facts: t('.sw-facts dd', act), events: t('.sw-list li', act), replay: !!act.querySelector('button'),
    featured: t('#sw-drawer .sw-video strong'), featuredMeta: [...document.querySelectorAll('#sw-drawer .sw-video')].flatMap(v=>t('.sw-note', v).slice(1)), youtube: t('#sw-drawer .sw-videos > .sw-note').join(' '),
    growth: t('li', growth).filter(x=>x!=='尚無成長紀錄').length, currentEra: document.querySelector('#sw-drawer .sw-eras li.is-current span')?.textContent, reached: t('#sw-drawer .sw-eras li.is-reached span, #sw-drawer .sw-eras li.is-current span'),
    districts: [...document.querySelectorAll('#sw-drawer .sw-district-row')].map(r=>[r.querySelector('strong').textContent, r.querySelector('.sw-district-status').textContent.trim(), r.querySelector('.sw-note').textContent]),
    sources: [...document.querySelectorAll('#sw-drawer .sw-source-list li')].map(l=>[l.querySelector('span').textContent, l.querySelector('b').textContent]),
    roster: t('#sw-drawer .sw-roster-panel > .sw-note')[0],
    street: window.RenguinSeamlessWorld.districts().map(d=>[d.name, d.status]),
    actors: [...document.querySelectorAll('.sw-actor')].map(a=>({id: a.dataset.character, res: a.dataset.resolution, district: a.dataset.district || 'ISLAND', name: a.querySelector('.sw-nametag').textContent})),
    pawns: document.querySelectorAll('.sw-pawn').length, talks: document.querySelectorAll('.sw-talk').length,
    banner: document.getElementById('sw-banner').hidden ? '' : document.getElementById('sw-banner').textContent,
  };})()`;

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "rw-parity-"));
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
    let served = null;
    let lastStateUrl = null;
    const send = (method, params = {}) => new Promise((resolve) => { const n = ++id; pending.set(n, resolve); ws.send(JSON.stringify({ id: n, method, params })); });
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg.result || msg);
        pending.delete(msg.id);
      } else if (msg.method === "Fetch.requestPaused") {
        // Only the world state is replaced; everything else (pages, assets, character images) is the Preview's own.
        const url = new URL(msg.params.request.url);
        if (STATE && url.pathname === "/api/world/state") {
          served = (served || 0) + 1;
          lastStateUrl = url.search;
          send("Fetch.fulfillRequest", { requestId: msg.params.requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "application/json" }], body: Buffer.from(STATE).toString("base64") });
        } else send("Fetch.continueRequest", { requestId: msg.params.requestId });
      } else if (msg.method) events.push(msg);
    };
    const js = async (expression) => { const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); return r.exceptionDetails ? { error: r.exceptionDetails.exception?.description } : r.result?.value; };
    const errors = () => events.filter((e) => e.method === "Runtime.exceptionThrown" || (e.method === "Log.entryAdded" && e.params.entry.level === "error")).map((e) => e.params.entry?.text || e.params.exceptionDetails?.exception?.description);
    const open = async (url, wait) => { events = []; await send("Page.navigate", { url }); await sleep(wait); };
    for (const domain of ["Page", "Runtime", "Log"]) await send(domain + ".enable");
    if (STATE) await send("Fetch.enable", { patterns: [{ urlPattern: "*/api/world/state*" }] });
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

    for (const [label, query, extra] of SCENARIOS) {
      const q = query ? `?${query}${extra}` : extra;
      await open(`${BASE}/world${q}`, 3500);
      const v1 = await js(V1);
      const v1Errors = errors();
      await open(`${BASE}/world/seamless${q}`, 4000);
      await js("document.getElementById('sw-data').click()");
      await sleep(600);
      const sw = await js(SEAMLESS);
      const state = await js(`fetch(${JSON.stringify(query ? `/api/world/simulate?${query.replace("sim=", "contents=")}` : "/api/world/state")}).then(r=>r.json())`);
      if (OUT) fs.writeFileSync(path.join(OUT, `parity-${label.replace(/\W+/g, "-")}.json`), JSON.stringify({ v1, seamless: sw }, null, 1));
      if (v1.error || sw.error) {
        check(`${label}: both pages render`, false, { v1: v1.error, seamless: sw.error });
        continue;
      }
      const num = (text) => (String(text).match(/\d+/g) || []).map(Number);
      check(`${label}: era, level, stage and progress agree`, sw.eraTitle === `${v1.era} · ${v1.level}` && sw.eraNote.some((n) => n.includes(v1.stage)) && (sw.tagline || "") === (v1.tagline || "") && sw.eraNote.includes(v1.progress), { v1: [v1.era, v1.level, v1.stage, v1.progress], seamless: [sw.eraTitle, sw.eraNote] });
      const counts = num(sw.content[0]);
      check(`${label}: content counts agree`, counts[0] === v1.stats["已完成內容"] && counts[1] === v1.stats["長片"] && counts[2] === v1.stats["短影音"] && counts[3] === v1.stats["會員影片"] && (v1.stats["特別企劃"] || 0) === (counts[4] || 0) && (v1.unpublished || "") === (sw.content[1] || ""), { v1: v1.stats, seamless: sw.content });
      check(`${label}: city status, facts and events agree`, v1.activity === sw.activity && v1.description === sw.description && JSON.stringify(v1.facts) === JSON.stringify(sw.facts) && JSON.stringify(v1.events) === JSON.stringify(sw.events) && v1.replay === sw.replay, { v1: [v1.activity, v1.facts, v1.events], seamless: [sw.activity, sw.facts, sw.events] });
      check(`${label}: featured videos and YouTube data status agree`, JSON.stringify(v1.featured) === JSON.stringify(sw.featured) && JSON.stringify(v1.featuredMeta) === JSON.stringify(sw.featuredMeta) && v1.youtube === sw.youtube, { v1: [v1.featured, v1.featuredMeta], seamless: [sw.featured, sw.featuredMeta] });
      check(`${label}: growth list and era road agree`, v1.growth === sw.growth && v1.currentEra === sw.currentEra && JSON.stringify(v1.reached) === JSON.stringify(sw.reached), { v1: [v1.growth, v1.currentEra], seamless: [sw.growth, sw.currentEra] });
      const v1Districts = v1.districts.map(([name, status, line]) => [name, status, line]);
      check(`${label}: every district, its status and its line agree, and each is a stretch of the street`, JSON.stringify(v1Districts) === JSON.stringify(sw.districts) && JSON.stringify(sw.street) === JSON.stringify(state.districts.map((d) => [d.name, d.status])), { v1: v1Districts, seamless: sw.districts });
      check(`${label}: data sources agree`, JSON.stringify(v1.sources) === JSON.stringify(sw.sources), { v1: v1.sources, seamless: sw.sources });
      // What stands in the world follows the state and the authority rules.
      const shown = (state.characters || []).filter((c) => c.render_mode === "IMAGE" && (!c.resolution || ["CANONICAL_CHARACTER", "PROFESSION_CHARACTER"].includes(c.resolution)));
      const open_ = new Set(state.districts.filter((d) => d.status === "UNLOCKED").map((d) => d.id));
      const cap = state.residents.render_cap?.desktop ?? 28;
      const byId = Object.fromEntries(state.characters.map((c) => [c.character_id, c]));
      check(
        `${label}: residents are authority characters from the state, in their own open district, profession residents by profession`,
        sw.actors.every((a) => byId[a.id] && ["CANONICAL_CHARACTER", "PROFESSION_CHARACTER"].includes(a.res) && (a.district === "ISLAND" || a.district === "MAIN_CITY" || (a.district === byId[a.id].district && open_.has(a.district))) && (a.res !== "PROFESSION_CHARACTER" || a.name === byId[a.id].world_role)) && sw.actors.length <= shown.length && new Set(sw.actors.map((a) => a.id)).size === sw.actors.length,
        { shown: shown.length, placed: sw.actors.length, districts: [...new Set(sw.actors.map((a) => a.district))] },
      );
      check(`${label}: the crowd matches the engine's visible residents (render cap applied)`, sw.pawns === Math.min(cap, state.residents.visible) || (sw.pawns === 0 && !state.districts.some((d) => d.status === "UNLOCKED" && d.crowd_density !== "EMPTY")), { pawns: sw.pawns, visible: state.residents.visible, cap });
      check(`${label}: one gossip bubble per open district`, sw.talks === open_.size, { talks: sw.talks, open: open_.size, gossip: (state.gossip || []).length });
      check(`${label}: zero console errors on both pages`, v1Errors.length === 0 && errors().length === 0, { v1: v1Errors, seamless: errors() });
      if (STATE) {
        check(`${label}: both pages were served the saved state (no live request reached the server)`, served >= 2, { served });
        // Real data sync from the page: 重新整理 asks the server to rebuild (refresh=1) and remounts the same world.
        const before = served;
        await js("document.querySelector('#sw-drawer .sw-tools-panel button').click()");
        await sleep(2500);
        const after = await js("({residents: window.RenguinSeamlessWorld.debug().residents, status: document.getElementById('sw-app').dataset.status})");
        check(`${label}: 重新整理 requests a rebuilt state (refresh=1) and remounts the world`, served === before + 1 && lastStateUrl === "?refresh=1" && after.status === "ready" && after.residents === sw.actors.length, { lastStateUrl, after });
      }
    }
    ws.close();
  } finally {
    chrome.kill();
  }
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (OUT) fs.writeFileSync(path.join(OUT, "parity-check.json"), JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
