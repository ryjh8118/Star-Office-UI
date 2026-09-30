"use strict";
// The desk's poll, end to end in a real browser: what it asks for, what it does with "nothing changed",
// and that a real change and a failure still reach the screen.
//
//   node tests/perf/poll-protocol-check.cjs http://127.0.0.1:19393
//
// Against a Preview only (it rewrites what the server answers with, through the browser's own network
// layer; the server and the data are never touched).
const S = require("./lib/session.cjs");
const { sleep } = S;

const BASE = (process.argv[2] || "http://127.0.0.1:19393").replace(/\/$/, "");
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(BASE)) throw Error("LOCAL_ONLY");
if (/:19000$/.test(BASE)) throw Error("NOT_AGAINST_PRODUCTION");
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass: Boolean(pass) });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail === undefined ? "" : "  " + JSON.stringify(detail)}`);
};

(async () => {
  const s = await S.open({ base: BASE, urlPath: "/?intro=off", viewport: "desktop" });
  const c = s.c;
  try {
    const full = await fetch(BASE + "/api/renguin/projects").then((r) => r.json());
    const digest = full.projection_stable_digest;
    check("The server names the projection's content", typeof digest === "string" && digest.length === 64, digest && digest.slice(0, 12));
    const target = full.projection.projects.find((p) => p.classification === "REGISTERED" && p.project_type !== "OTHER") || full.projection.projects[0];

    // What the page asked for, and what came back, as the browser saw it
    const asked = [];
    let plan = () => null; // (requestId, url) -> {status, body} to answer with, or null to let the server answer
    await c.send("Fetch.enable", { patterns: [{ urlPattern: "*/api/renguin/projects*", requestStage: "Request" }] });
    c.on("Fetch.requestPaused", async (p) => {
      const url = new URL(p.request.url);
      asked.push({ known: url.searchParams.get("known"), at: Date.now() });
      const answer = plan(asked.length, url);
      if (!answer) return c.send("Fetch.continueRequest", { requestId: p.requestId });
      await c.send("Fetch.fulfillRequest", {
        requestId: p.requestId,
        responseCode: answer.status,
        responseHeaders: [{ name: "Content-Type", value: "application/json" }, { name: "Cache-Control", value: "no-store" }],
        body: Buffer.from(JSON.stringify(answer.body)).toString("base64"),
      });
    });
    const cards = () => s.json(`(function(){var all=[].map.call(document.querySelectorAll('article.co-project[data-project-id]'),function(c){return c.dataset.projectId});
      var card=document.querySelector('article.co-project[data-project-id=${JSON.stringify(target.project_id)}]');
      var sync=[].filter.call(document.querySelectorAll('button'),function(b){return /同步/.test(b.textContent)})[0];
      var note=document.querySelector('.co-connection');
      return {n:all.length, text: card ? card.textContent.replace(/\s+/g,' ').trim().slice(0,160) : null, sync: sync && sync.textContent.trim(), notice: !!(note && !note.hidden)};})()`);
    const nextPoll = async (from) => {
      for (let i = 0; i < 400; i++) {
        if (asked.length > from) return true;
        await sleep(100);
      }
      return false;
    };

    // 1. a reload: the first ask has nothing to name, the ones after it name what the desk holds
    asked.length = 0;
    await s.navigate(BASE + "/?intro=off");
    await s.waitUsable();
    await nextPoll(1);
    await nextPoll(asked.length);
    check("The first ask holds nothing, so it names nothing", asked.length >= 2 && asked[0].known === null, asked.slice(0, 2).map((a) => a.known && a.known.slice(0, 8)));
    check("Once it holds a projection, every ask names it", asked.slice(1).every((a) => a.known === digest), asked.slice(1).map((a) => a.known && a.known.slice(0, 8)));
    const before = await cards();
    check("The desk drew its cards", before.n > 0 && before.text, before);

    // 2. "nothing changed" answers: the desk keeps what it holds and keeps saying so
    const unchanged = (n, url) => ({ status: 200, body: { status: "FRESH", message: "ok", projection: null, projection_unchanged: true, projection_stable_digest: digest, projection_meta: { generated_at: new Date().toISOString(), projection_digest: full.projection.projection_digest }, checked_at: Date.now() / 1000, error: null, transport_age_seconds: 1, canonical_age_seconds: full.canonical_age_seconds, project_ages_seconds: full.project_ages_seconds } });
    plan = unchanged;
    const m1 = asked.length;
    await nextPoll(m1);
    await sleep(1500);
    const kept = await cards();
    check("A 'nothing changed' answer leaves every card where it was", kept.n === before.n && kept.text === before.text && !kept.notice, kept);
    const m2 = asked.length;
    await nextPoll(m2);
    await sleep(1500);
    const kept2 = await cards();
    check("...and again, and again", kept2.n === before.n && kept2.text === before.text && !kept2.notice, kept2);
    check("...while it keeps naming the projection it holds", asked.slice(m1).every((a) => a.known === digest), asked.slice(m1).map((a) => (a.known || "").slice(0, 8)));

    // 3. a real change reaches the screen, and becomes what is named next
    const changed = JSON.parse(JSON.stringify(full));
    const renamed = "校準改名 " + Date.now();
    const row = changed.projection.projects.find((p) => p.project_id === target.project_id);
    row.project_name = renamed;
    changed.projection_stable_digest = "CHANGED-" + Date.now();
    plan = () => ({ status: 200, body: changed });
    const m3 = asked.length;
    await nextPoll(m3);
    await sleep(2500);
    const moved = await cards();
    check("A changed projection reaches the screen", (moved.text || "").includes("校準改名"), { was: before.text, now: moved.text });
    plan = (n, url) => (url.searchParams.get("known") === changed.projection_stable_digest ? unchangedFor(changed) : null);
    function unchangedFor(base) {
      return { status: 200, body: { ...base, projection: null, projection_unchanged: true, projection_meta: { generated_at: new Date().toISOString(), projection_digest: base.projection.projection_digest } } };
    }
    const m4 = asked.length;
    await nextPoll(m4);
    await sleep(2000);
    const named = asked.slice(m4);
    check("The next ask names the projection it just received", named.length > 0 && named[0].known === changed.projection_stable_digest, named.map((a) => (a.known || "").slice(0, 14)));
    const stillMoved = await cards();
    check("...and a 'nothing changed' answer to that keeps the change", (stillMoved.text || "").includes("校準改名"), stillMoved);

    // 4. a failure is shown as a failure, and recovery brings the desk back
    plan = () => ({ status: 503, body: { status: "SYNC_ERROR", message: "x", projection: null, error: { code: "DELIVERY_UNAVAILABLE", detail: "fixture" } } });
    const m5 = asked.length;
    await nextPoll(m5);
    await sleep(2500);
    const failing = await cards();
    check("A failed read says so and keeps the last verified cards", failing.notice && failing.n > 0, failing);
    plan = () => null;
    const m6 = asked.length;
    await nextPoll(m6);
    await nextPoll(asked.length);
    await sleep(2500);
    const back = await cards();
    check("When the server answers again the notice goes and the real projection is back", !back.notice && back.n === before.n && back.text === before.text, back);

    // the 503 the browser logs is the one this check feeds it on purpose; anything else is a real error
    const real = s.errors.filter((e) => !/^log:Failed to load resource: the server responded with a status of 503/.test(e));
    check("No page errors (other than the 503 this check itself injects)", real.length === 0, real.slice(0, 3));
  } finally {
    await s.shutdown();
  }
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
