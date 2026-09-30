"use strict";
// Does the desk still draw what it drew? A change made for speed must not change what is on the screen.
//
//   node tests/perf/desk-fingerprint.cjs http://127.0.0.1:19392 http://127.0.0.1:19393 [--shots dir]
//
// Loads each server's desk the same way, lets it settle, and compares what is there: the project cards and their
// text, the island headers, the members, the timeline, the ambient scenery's inventory, and (with --shots) screenshots
// of the top of the page and of each section, compared pixel by pixel with a small tolerance for animation.
const fs = require("node:fs");
const path = require("node:path");
const S = require("./lib/session.cjs");
const { sleep } = S;

const argv = process.argv.slice(2);
const bases = argv.filter((a) => /^http:/.test(a)).map((u) => u.replace(/\/$/, ""));
const shotsAt = argv.indexOf("--shots");
const SHOTS = shotsAt >= 0 ? argv[shotsAt + 1] : null;
if (bases.length !== 2) throw Error("USAGE: two Preview base URLs");
if (bases.some((b) => /:19000$/.test(b))) throw Error("NOT_AGAINST_PRODUCTION");
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

async function take(base, tag) {
  const s = await S.open({ base, urlPath: "/?intro=off", viewport: "ultrawide" });
  try {
    await sleep(9000);
    const inventory = await s.json(`(function(){
      var txt = function(e){ return (e.textContent||'').replace(/\\s+/g,' ').trim(); };
      var cards = [].map.call(document.querySelectorAll('article.co-project[data-project-id]'), function(c){ return { id: c.dataset.projectId, tier: c.dataset.tier||null, expanded: c.classList.contains('is-expanded'), text: txt(c).slice(0,240) }; });
      var sections = [].map.call(document.querySelectorAll('main#main-stage > section, #main-stage section'), function(e){ return { id: e.id, cls: String(e.className).split(' ')[0], h: Math.round(e.getBoundingClientRect().height/20)*20, text: txt(e).slice(0,120) }; });
      var members = [].map.call(document.querySelectorAll('button.co-member'), function(m){ return txt(m).slice(0,80); });
      var timeline = document.querySelectorAll('button.tl-node-button').length;
      var anims = {}; document.getAnimations().forEach(function(a){ var k=(a.animationName||a.transitionProperty||'?'); anims[k]=(anims[k]||0)+1; });
      var chars = [].map.call(document.querySelectorAll('.renguin-scene-character'), function(c){ return c.id+':'+String(c.className).replace(/\\s+/g,' '); });
      return { cards: cards, sections: sections, members: members, timeline: timeline, anims: anims, chars: chars, title: document.title, docH: Math.round(document.documentElement.scrollHeight/20)*20, nodes: document.getElementsByTagName('*').length };
    })()`);
    const shots = {};
    if (SHOTS) {
      const H = await s.ev(`innerHeight`);
      const total = await s.ev(`document.documentElement.scrollHeight`);
      for (let y = 0, i = 0; y < Math.min(total - H, 6400); y += H * 1.5, i++) {
        await s.ev(`window.scrollTo({top:${Math.round(y)},behavior:'instant'});1`);
        await sleep(1400);
        const r = await s.c.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
        const file = path.join(SHOTS, `${tag}-${String(i).padStart(2, "0")}.png`);
        fs.writeFileSync(file, Buffer.from(r.data, "base64"));
        shots[i] = file;
      }
    }
    return { inventory, shots, errors: s.errors.slice(0, 5) };
  } finally {
    await s.shutdown();
  }
}

(async () => {
  // A twice, B between them: the second look at A is the noise floor (animation phase, time of day).
  const a = await take(bases[0], "A1");
  const b = await take(bases[1], "B");
  const a2 = SHOTS ? await take(bases[0], "A2") : null;
  const ia = a.inventory, ib = b.inventory;
  const results = [];
  const check = (name, pass, detail) => {
    results.push(Boolean(pass));
    console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail === undefined ? "" : "  " + JSON.stringify(detail).slice(0, 300)}`);
  };
  check("Same cards, same order", JSON.stringify(ia.cards.map((c) => c.id)) === JSON.stringify(ib.cards.map((c) => c.id)), { a: ia.cards.length, b: ib.cards.length });
  const textDiff = ia.cards.filter((c, i) => ib.cards[i] && (c.text !== ib.cards[i].text || c.tier !== ib.cards[i].tier || c.expanded !== ib.cards[i].expanded)).length;
  check("Every card says the same and sits in the same tier", textDiff === 0, { differing: textDiff });
  check("Same sections, same headers", JSON.stringify(ia.sections) === JSON.stringify(ib.sections), { a: ia.sections.length, b: ib.sections.length });
  check("Same members", JSON.stringify(ia.members) === JSON.stringify(ib.members));
  check("Same timeline", ia.timeline === ib.timeline, { a: ia.timeline, b: ib.timeline });
  check("Same page height", ia.docH === ib.docH, { a: ia.docH, b: ib.docH });
  const keys = new Set([...Object.keys(ia.anims), ...Object.keys(ib.anims)]);
  const animDiff = [...keys].filter((k) => Math.abs((ia.anims[k] || 0) - (ib.anims[k] || 0)) > 1).map((k) => `${k}: ${ia.anims[k] || 0} vs ${ib.anims[k] || 0}`);
  check("The same animations are there (within one)", animDiff.length === 0, animDiff);
  check("No page errors on either", a.errors.length === 0 && b.errors.length === 0, { a: a.errors, b: b.errors });
  if (SHOTS) {
    const { execFileSync } = require("node:child_process");
    const py = "from PIL import Image, ImageChops\nimport sys\nA=Image.open(sys.argv[1]).convert('RGB');B=Image.open(sys.argv[2]).convert('RGB')\nd=ImageChops.difference(A,B).convert('L').point(lambda p:255 if p>28 else 0)\nprint(round(sum(1 for p in d.getdata() if p)/(A.width*A.height)*100,3))";
    const diff = (x, y) => Number(execFileSync(process.env.PYTHON || "E:/Renguin_AISystem/Star_Office_UI/.venv/Scripts/python.exe", ["-c", py, x, y]).toString().trim());
    for (const i of Object.keys(a.shots)) {
      if (!b.shots[i] || !a2.shots[i]) continue;
      const floor = diff(a.shots[i], a2.shots[i]);
      const changed = diff(a.shots[i], b.shots[i]);
      check(`Screenshot ${i}: ${changed}% of pixels differ from the reference (the reference differs from itself by ${floor}%)`, changed <= floor * 1.5 + 1.0, { floor, changed });
    }
  }
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
