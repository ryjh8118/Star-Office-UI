const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const T = require("../frontend/creator-transitions.js");

const read = (name) => fs.readFileSync(path.join(__dirname, "../frontend", name), "utf8");
const box = (top, height) => ({ top, height, bottom: top + height });

test("a room is on stage only once it clears the edge strips", () => {
  const vh = 1000;
  assert.equal(T.EDGE, 0.1);
  assert.equal(T.onStage(box(200, 300), vh), true);
  assert.equal(T.onStage(box(920, 400), vh), false, "still inside the bottom strip");
  assert.equal(T.onStage(box(880, 400), vh), true, "its top has crossed the line");
  assert.equal(T.onStage(box(-500, 580), vh), false, "only its foot is left in the top strip");
  assert.equal(T.onStage(box(-3000, 5000), vh), true, "a room taller than the screen stays on stage");
});

test("off stage, a room knows which way it went", () => {
  assert.equal(T.side(box(950, 800), 1000), "below");
  assert.equal(T.side(box(-900, 950), 1000), "above");
  assert.equal(T.side(box(-4000, 4050), 1000), "above", "a tall room scrolled past sits above");
});

test("only the compositor moves, and reduced motion stands everything still", () => {
  const css = read("creator-transitions.css");
  for (const [, list] of css.matchAll(/transition:\s*([^;]+);/g))
    for (const part of list.split(/,(?![^(]*\))/).map((s) => s.trim()))
      assert.match(part, /^(opacity|translate|none)\b/, "transitions only opacity and translate: " + part);
  assert.ok(!/\bscale\s*:|transform\s*:/.test(css), "no scale or transform: large rooms stay crisp");
  const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduced, /opacity:\s*1/);
  assert.match(reduced, /translate:\s*none/);
});

test("every room and the footer are staged, and a jump lands on a settled room", () => {
  const office = read("creator-office.js");
  assert.match(office, /window\.CreatorEnvironment\?\.watch\(s\);\s*window\.CreatorTransitions\?\.watch\(s\);/);
  assert.match(office, /CreatorTransitions\?\.watch\(footer\)/);
  assert.match(office, /CreatorTransitions\?\.show\(section\);\s*section\.scrollIntoView/);
  assert.match(office, /CreatorTransitions\?\.show\(card\);\s*card\.scrollIntoView/);
  const page = read("index.html");
  for (const file of ["creator-transitions.css", "creator-transitions.js"]) assert.ok(page.includes("/static/" + file), file);
  assert.ok(page.indexOf("creator-transitions.js") < page.indexOf("creator-office.js"), "loaded before the office uses it");
});

test("the archipelago reads todo, then long and short side by side, working then finished", () => {
  const office = read("creator-office.js");
  const order = ["human-inbox", "active-projects", "short-videos", "recently-completed", "short-completed", "work-history"]
    .map((id) => office.search(new RegExp(`section\\(\\s*"${id}",`)));
  assert.ok(order.every((at) => at > 0), "every island is built");
  assert.deepEqual([...order].sort((a, b) => a - b), order, "islands are built in reading order");
  for (const [id, side] of [["active-projects", "left"], ["short-videos", "right"], ["recently-completed", "left"], ["short-completed", "right"]])
    assert.match(office, new RegExp(`"${id}",[^;]*?"${side}",\\s*\\)`), `${id} floats on the ${side}`);
  const islands = read("creator-islands.css");
  assert.match(islands, /#creator-office\s*\{[^}]*grid-template-columns:\s*repeat\(2,/);
  assert.match(islands, /@media \(max-width: 1000px\)\s*\{\s*#creator-office > \.co-isle-half\s*\{\s*grid-column: 1 \/ -1;/);
});

test("the transitions never read or publish work state", () => {
  const source = read("creator-transitions.js");
  for (const forbidden of ["RenguinOperations", "CreatorOffice", "fetch(", "/api/", "localStorage"])
    assert.ok(!source.includes(forbidden), "transitions must not touch " + forbidden);
});
