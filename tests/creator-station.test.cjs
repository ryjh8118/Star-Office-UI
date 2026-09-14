const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const S = require("../frontend/creator-station.js");

const read = (name) => fs.readFileSync(path.join(__dirname, "../frontend", name), "utf8");
const now = Date.parse("2026-09-14T10:00:00+08:00");

test("the first entry is the whole film, a return is the short one", () => {
  assert.equal(S.introMode({ now }), "full");
  assert.equal(S.introMode({ now, sessionSeen: true }), "quick", "same session");
  assert.equal(S.introMode({ now, lastFull: now - 3600e3 }), "quick", "a new tab an hour after the film");
  assert.equal(S.introMode({ now, lastFull: now - 7 * 3600e3 }), "full", "the next working session");
  assert.equal(S.introMode({ now, lastFull: now + 60e3 }), "full", "a clock from the future proves nothing");
  assert.equal(S.introMode({ now, lastFull: NaN }), "full");
});

test("reduced motion gets one still frame, then nothing; skip and hidden tabs win", () => {
  assert.equal(S.introMode({ now, reduced: true }), "reduced");
  assert.equal(S.introMode({ now, reduced: true, sessionSeen: true }), "off");
  assert.equal(S.introMode({ now, reduced: true, override: "full" }), "reduced", "an override never forces motion");
  assert.equal(S.introMode({ now, override: "off" }), "off");
  assert.equal(S.introMode({ now, hidden: true }), "off", "no film nobody can see");
  assert.equal(S.introMode({ now, sessionSeen: true, override: "full" }), "full");
  assert.ok(S.DURATION.full <= 5000, "the whole film stays under five seconds");
  assert.ok(S.DURATION.quick <= 1500, "the return stays short");
});

test("the five shots happen in order: galaxy, approach, doors, through, arrival", () => {
  const seen = [];
  for (let t = 0; t <= 1.0001; t += 0.01) {
    const f = S.frame("full", t);
    if (seen.at(-1) !== f.shot) seen.push(f.shot);
  }
  assert.deepEqual(seen, ["galaxy", "approach", "doors", "through", "arrive"]);
  const start = S.frame("full", 0),
    doors = S.frame("full", S.SHOTS.full.doors[1]),
    end = S.frame("full", 1);
  assert.ok(start.scale < 0.2 && start.door === 0 && start.veil === 1, "it starts far out, closed and covered");
  assert.equal(doors.door, 1, "the airlock is fully open before the camera goes through");
  assert.ok(S.frame("full", 0.85).scale > 3, "the camera passes through the door");
  assert.equal(end.veil, 0, "and the office is revealed");
  let last = 1;
  for (let t = 0; t <= 1; t += 0.02) {
    const v = S.frame("full", t).veil;
    assert.ok(v <= last + 1e-9, "the veil only ever lifts");
    last = v;
  }
});

test("the reduced film does not move", () => {
  for (const t of [0, 0.3, 0.6, 1]) {
    const f = S.frame("reduced", t);
    assert.equal(f.warp, 0);
    assert.equal(f.door, 1);
    assert.equal(f.scale, 1);
    assert.equal(f.flash, 0);
  }
});

test("the station is decoration scoped to itself, and still for reduced motion", () => {
  const css = read("creator-station.css");
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const chunk of plain.split("}")) {
    const selector = chunk.slice(0, chunk.indexOf("{")).replace(/^[\s\S]*;/, "").trim();
    if (!selector || selector.startsWith("@") || /^(to|from|\d+%)$/.test(selector) || !chunk.includes("{")) continue;
    const own = selector.replace(/^@[^{]*$/, "");
    assert.match(own, /so-|html\.so-station/, "unscoped rule: " + own);
  }
  assert.doesNotMatch(css, /#game-container canvas|\.co-member\b|\.co-amb/, "the office interior is never restyled");
  const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduced, /animation: none/);
  assert.match(css, /\.so-galaxy\.is-live \.so-twinkle/, "twinkles run only while on screen");
  assert.match(css, /\.so-hull\.is-live \.so-thruster::after/, "engines run only while on screen");
  const js = read("creator-station.js");
  assert.doesNotMatch(js, /fetch\(|\/api\//, "the station reads and writes no work state");
  assert.match(js, /cancelAnimationFrame\(raf\)/, "the film's frame loop stops when it ends");
  assert.match(js, /removeEventListener\("keydown", onKey, true\)/);
  assert.match(js, /overlay\.remove\(\)/, "and leaves nothing behind");
});

test("the new layers arrive without editing the page shell", () => {
  const office = read("creator-office.js");
  for (const file of ["creator-station.css", "creator-timeline.css", "creator-station.js", "creator-timeline.js"])
    assert.ok(office.includes(`"${file}"`), file + " is attached by the office script");
  assert.match(office, /setTimeout\(\(\) => cover\.remove\(\), 6000\)/, "a missing station never leaves the cover up");
  const html = read("index.html");
  assert.doesNotMatch(html, /creator-station|creator-timeline/);
});
