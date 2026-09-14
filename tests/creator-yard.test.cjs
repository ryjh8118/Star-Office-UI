const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Y = require("../frontend/creator-yard.js");

const read = (name) => fs.readFileSync(path.join(__dirname, "../frontend", name), "utf8");
const seeds = [1, 2, 7, 2166136261, 3735928559, 123456789];

test("a resident's day is the same every time for the same house", () => {
  for (const seed of seeds) {
    let a = { x: 40, play: null },
      b = { x: 40, play: null };
    for (let step = 0; step < 30; step++) {
      const one = Y.plan(seed, step, a.x, false, a.play),
        two = Y.plan(seed, step, b.x, false, b.play);
      assert.deepEqual(one, two);
      a = one;
      b = two;
    }
  }
});

test("a resident stays on the grass, never plays the same game twice running, and uses every game", () => {
  for (const seed of seeds) {
    let x = 50,
      last = null;
    const seen = new Set();
    for (let step = 0; step < 200; step++) {
      const next = Y.plan(seed, step, x, false, last);
      assert.ok(Y.PLAYS.includes(next.play), next.play);
      assert.ok(next.x >= Y.MIN_X && next.x <= Y.MAX_X, "off the island: " + next.x);
      assert.notEqual(next.play, last, "the same game twice in a row");
      assert.ok(next.duration > next.walk, "a game lasts beyond the walk to it");
      assert.ok([1, -1].includes(next.facing) && [1, -1].includes(next.face));
      if (next.play === "swing") assert.equal(next.x, Y.swingX(seed), "the swing is where the branch holds it");
      if (["ball", "kite"].includes(next.play))
        assert.equal(next.face, next.x < 50 ? 1 : -1, "the ball and the kite go over the grass");
      seen.add(next.play);
      last = next.play;
      x = next.x;
    }
    assert.deepEqual([...seen].sort(), [...Y.PLAYS].sort());
  }
});

test("a perched resident plays where it stands", () => {
  for (const seed of seeds)
    for (let step = 0, last = null; step < 60; step++) {
      const next = Y.plan(seed, step, 55, true, last);
      assert.notEqual(next.play, last);
      last = next.play;
      assert.ok(Y.PERCHED.includes(next.play));
      assert.equal(next.x, 55);
      assert.equal(next.walk, 0);
    }
});

test("the tree and its swing sit on the grass, on either side", () => {
  const sides = new Set();
  for (const seed of seeds) {
    const tree = Y.treeX(seed),
      swing = Y.swingX(seed);
    assert.ok(Math.abs(swing - tree) === 10 && Math.abs(swing - 50) < Math.abs(tree - 50), "the branch reaches inward");
    assert.ok(swing >= Y.MIN_X && swing <= Y.MAX_X);
    sides.add(tree < 50);
  }
  assert.equal(sides.size, 2);
});

test("the island rests off screen and stands still for reduced motion", () => {
  const css = read("creator-yard.css");
  assert.match(css, /\.co-yard:not\(\.is-on-screen\) \*[\s\S]*?animation-play-state: paused/);
  const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduced, /animation: none !important/);
  assert.match(reduced, /transition: none !important/);
  const yard = read("creator-yard.js");
  assert.match(yard, /prefers-reduced-motion: reduce\)"\)\.matches\) return;/, "no schedule runs for reduced motion");
  assert.match(yard, /if \(!yard\.isConnected\) return;/, "a replaced island stops its schedule");
  assert.match(yard, /!yard\.classList\.contains\("is-on-screen"\)/, "an island off screen waits");
});

test("every project is a crystal, and the swings live on each island's resting islet", () => {
  const office = read("creator-office.js");
  const crystal = office.slice(office.indexOf("function projectCrystal"), office.indexOf("function residentOf"));
  assert.match(crystal, /face\.append\(cover\)/, "the cover sits in the crystal's face");
  assert.doesNotMatch(crystal, /CreatorYard|co-yard|co-house/, "a crystal keeps no yard and no house frame");
  assert.doesNotMatch(office, /projectYard|projectHouse|\.co-house\b/, "no card still builds a house or a yard");
  assert.match(office, /card\.append\(projectCrystal\(p, cover\)\);/);
  assert.match(office, /previous\.querySelector\("\.co-crystal"\)\.replaceWith\(fresh\.querySelector\("\.co-crystal"\)\)/, "a live update swaps the crystal, never a playing video");
  assert.match(office, /querySelectorAll\("\.co-crystal, \.co-yard"\)/, "crystals and islets are watched on screen themselves");
  // The islets beside the title platforms are built once by the world, and a
  // visitor lands only on an empty one.
  const world = read("creator-transitions.js");
  assert.match(world, /scope\.CreatorYard\.build\(\{ seed:/);
  assert.match(world, /scope\.CreatorYard\.visit\(r\.yard, character,/);
  assert.match(world, /scope\.CreatorYard\.leave\(r\.yard\)/);
  const yard = read("creator-yard.js");
  assert.match(yard, /if \(!isle \|\| !character \|\| yard\.querySelector\("\.co-yard-actor"\)\) return null;/);
  assert.match(yard, /if \(!actor\.isConnected\) return;/, "a visitor that has flown off stops its schedule");
  const css = read("creator-yard.css");
  assert.doesNotMatch(css, /has-yard|--yard-rise/, "no yard hangs under a card any more");
  assert.doesNotMatch(office, /co-resident-track/);
  const html = read("index.html");
  assert.ok(html.indexOf("creator-yard.js") > html.indexOf("creator-residents.js"));
  assert.ok(html.indexOf("creator-yard.js") < html.indexOf("creator-office.js"));
  assert.match(html, /creator-yard\.css\?v=/);
});

test("a long-form card copies onto the short-video island, and only long-form cards do", () => {
  const office = read("creator-office.js");
  assert.match(office, /save\("project-copy", \{ project_id: p\.project_id, format: "SHORT" \}\)/);
  assert.match(office, /const copies = shelf === "active";/);
  assert.match(office, /hovered\?\.closest\(`#\$\{shelves\.short\.section\}, \.co-short-drop, \.cw-beacon\[data-island="short"\]`\)/, "the short-video island, its pad or its beacon takes the copy");
  assert.match(office, /if \(copy\) await copyToShort\(p\);\s*else if \(finish\) await finishShort\(p\);\s*else await moveProject/);
  // 短影音完成 takes a long-form card as a finished short copy, and a short video as itself.
  assert.match(office, /const finishes = copies \|\| shelf === "short";/);
  assert.match(office, /hovered\?\.closest\(`#\$\{shelves\.shortCompleted\.section\}, \.co-done-drop, \.cw-beacon\[data-island="short-result"\]`\)/);
  assert.match(office, /save\("project-copy", \{ project_id: p\.project_id, format: "SHORT", done: true \}\)/);
  assert.doesNotMatch(office, /"co-short-drop co-done-drop"/, "the done pad is never mistaken for the copy pad");
  assert.match(office, /\["projects", "project-source", "project-copy"\]\.includes\(path\)/);
  assert.match(office, /if \(!isShort\(p\) && !projectDone\(p\)\) \{/, "the copy button is for unfinished long-form cards");
});
