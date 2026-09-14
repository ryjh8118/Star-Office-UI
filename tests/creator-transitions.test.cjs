const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const T = require("../frontend/creator-transitions.js");
const W = T.World;

const read = (name) => fs.readFileSync(path.join(__dirname, "../frontend", name), "utf8");
const box = (top, height) => ({ top, height, bottom: top + height });
const view = W.viewport(1440, 900);
const pairs = W.ISLAND_IDS.flatMap((a) => W.ISLAND_IDS.filter((b) => b !== a).map((b) => [a, b]));

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

test("only the compositor moves rooms, and reduced motion stands them still", () => {
  const css = read("creator-transitions.css");
  for (const [, list] of css.matchAll(/transition:\s*([^;]+);/g))
    for (const part of list.split(/,(?![^(]*\))/).map((s) => s.trim()))
      assert.match(part, /^(opacity|translate|none)\b/, "transitions only opacity and translate: " + part);
  assert.ok(!/\bscale\s*:|transform\s*:/.test(css), "no scale or transform: large rooms stay crisp");
  const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduced, /opacity:\s*1/);
  assert.match(reduced, /translate:\s*none/);
});

test("rooms below the world are staged, and the page loads the world before the office", () => {
  const office = read("creator-office.js");
  assert.match(office, /window\.CreatorEnvironment\?\.watch\(s\);\s*window\.CreatorTransitions\?\.watch\(s\);/);
  assert.match(office, /CreatorTransitions\?\.watch\(footer\)/);
  const page = read("index.html");
  for (const file of ["creator-transitions.css", "creator-transitions.js", "creator-islands.css"]) assert.ok(page.includes("/static/" + file), file);
  assert.ok(page.indexOf("creator-transitions.js") < page.indexOf("creator-office.js"), "loaded before the office uses it");
  assert.ok(page.indexOf("creator-yard.js") < page.indexOf("creator-transitions.js"), "the resting islets can be built");
});

test("four islands lie in one sky, in the order the dock lists them", () => {
  assert.deepEqual([...W.ISLAND_IDS], ["work", "result", "short", "short-result"]);
  const xs = W.ISLAND_IDS.map((id) => W.WORLD[id].x);
  assert.deepEqual([...xs].sort((a, b) => a - b), xs, "further along the dock is further right");
  for (const id of W.ISLAND_IDS) for (const k of ["x", "y", "z"]) assert.ok(Number.isFinite(W.WORLD[id][k]), `${id}.${k}`);
  assert.ok(Object.isFrozen(W.WORLD) && Object.isFrozen(W.WORLD.work), "world positions are fixed");
  // A landed camera draws its island at natural size, centred.
  for (const id of W.ISLAND_IDS) {
    const p = W.project(W.WORLD[id], W.settledCamera(id), view);
    assert.equal(p.x, view.cx);
    assert.equal(p.scale, 1);
  }
  const office = read("creator-office.js");
  for (const [id, section] of [["work", "active-projects"], ["result", "recently-completed"], ["short", "short-videos"], ["short-result", "short-completed"]])
    assert.match(office, new RegExp(`id: "${id}", section: "${section}"`), `${id} carries ${section}`);
});

test("every one of the 12 flights leaves, crosses and lands the right way", () => {
  assert.equal(pairs.length, 12);
  const signatures = new Set();
  for (const [a, b] of pairs) {
    const flight = W.plan(W.settledCamera(a), b);
    const dir = Math.sign(W.WORLD[b].x - W.WORLD[a].x);
    assert.equal(flight.direction, dir, `${a}>${b} direction`);
    assert.ok(flight.duration >= 1000 && flight.duration <= 1600, `${a}>${b} lasts ${flight.duration}ms`);
    signatures.add(Math.round(flight.duration) + ":" + Math.round(flight.dist));
    // Phases in order, and the same moment always gives the same camera.
    const phases = [];
    for (let i = 0; i <= 100; i++) {
      const phase = W.phaseAt(flight, i / 100);
      if (phases.at(-1) !== phase) phases.push(phase);
    }
    assert.deepEqual(phases, ["DEPART", "TRAVEL", "APPROACH", "LAND", "SETTLED"], `${a}>${b} phases`);
    assert.deepEqual(W.sample(flight, 0.37), W.sample(flight, 0.37));
    // The island left behind slides against the flight and shrinks.
    const s0 = W.project(W.WORLD[a], W.sample(flight, 0), view);
    const s1 = W.project(W.WORLD[a], W.sample(flight, 0.3), view);
    assert.ok((s1.x - s0.x) * dir < -60, `${a}>${b}: the source leaves against the flight`);
    assert.ok(s1.scale < s0.scale * 0.75, `${a}>${b}: the source shrinks`);
    // The destination first shows on the side the camera is heading to, then grows.
    let first = null;
    for (let i = 0; i <= 100 && !first; i++) {
      const p = W.project(W.WORLD[b], W.sample(flight, i / 100), view);
      if (p && p.x > -300 && p.x < view.width + 300 && p.scale * 1600 * view.u > 80) first = p;
    }
    assert.ok(first && (first.x - view.cx) * dir > 0, `${a}>${b}: the destination enters from the flight's side`);
    const late = W.project(W.WORLD[b], W.sample(flight, 0.85), view);
    assert.ok(late.scale > first.scale * 1.4, `${a}>${b}: the destination grows as it nears`);
    // It lands exactly, after the slightest overshoot.
    const land = W.settledCamera(b),
      end = W.sample(flight, 1),
      peak = W.sample(flight, 0.9);
    for (const k of ["x", "y", "z", "yaw", "roll"]) assert.ok(Math.abs(end[k] - land[k]) < 1e-6, `${a}>${b} lands on ${k}`);
    const zoom = W.project(W.WORLD[b], peak, view).scale;
    assert.ok(zoom > 1 && zoom < 1.04, `${a}>${b}: overshoot is slight (${zoom})`);
    // No step of the camera jumps: a hundredth of the flight never carries it far.
    let worst = 0;
    for (let i = 1; i <= 100; i++) {
      const p = W.sample(flight, (i - 1) / 100),
        q = W.sample(flight, i / 100);
      worst = Math.max(worst, Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z));
    }
    assert.ok(worst < flight.dist * 0.08 + 120, `${a}>${b}: largest step ${Math.round(worst)}`);
  }
  assert.ok(signatures.size >= 5, "flights are planned from their places, not one canned move");
});

test("the destination rises out of the mist before its colours come", () => {
  const flight = W.plan(W.settledCamera("work"), "result");
  const at = (tau) => W.reveal(flight, tau);
  const firstMist = [...Array(101).keys()].find((i) => at(i / 100).mist > 0.05);
  const firstBeam = [...Array(101).keys()].find((i) => at(i / 100).beam > 0.2);
  const firstLit = [...Array(101).keys()].find((i) => at(i / 100).lit > 0.05);
  assert.ok(firstMist < firstBeam && firstBeam < firstLit, `silhouette → mist ${firstMist} → beam ${firstBeam} → colour ${firstLit}`);
  assert.equal(at(1).lit, 1);
  assert.ok(at(1).mist < 0.01);
});

// A clock and a frame queue the test drives by hand.
function rig({ start = "work", reduced = false } = {}) {
  let now = 0;
  const frames = [];
  const events = [];
  const c = W.controller({
    start,
    now: () => now,
    schedule: (fn) => {
      frames.push(fn);
      return frames.length;
    },
    cancel: () => frames.splice(0),
    reduced: () => reduced,
    onPhase: (phase) => events.push(["phase", phase]),
    onDepart: (from, to) => events.push(["depart", from, to]),
    onRetarget: (to) => events.push(["retarget", to]),
    onSettle: (id, from) => events.push(["settle", id, from]),
  });
  const advance = (ms, step = 16) => {
    for (let t = 0; t < ms; t += step) {
      now += step;
      const run = frames.splice(0);
      for (const fn of run) fn();
    }
  };
  return { c, events, advance, pending: () => frames.length };
}

test("a flight settles once, and no frame runs after it lands", () => {
  const { c, events, advance, pending } = rig();
  assert.equal(c.go("work"), false, "already there");
  assert.equal(c.go("short"), true);
  assert.equal(c.flying, true);
  advance(2000);
  assert.equal(c.flying, false);
  assert.equal(c.current, "short");
  assert.equal(c.state, "SETTLED");
  assert.equal(pending(), 0, "no animation loop is left behind");
  assert.deepEqual(events.filter((e) => e[0] === "settle"), [["settle", "short", "work"]]);
  assert.deepEqual(
    events.filter((e) => e[0] === "phase").map((e) => e[1]),
    ["DEPART", "TRAVEL", "APPROACH", "LAND", "SETTLED"],
  );
});

test("rapid destinations: the last one chosen wins, in one flight", () => {
  const { c, events, advance, pending } = rig();
  const sequence = ["result", "short-result", "short", "work", "short-result", "result", "work", "short", "result", "short-result"];
  const gaps = [70, 140, 95, 210, 60, 180, 120, 85, 160];
  sequence.forEach((id, i) => {
    c.go(id);
    assert.ok(pending() <= 1, "never two loops at once");
    if (i < gaps.length) advance(gaps[i]);
  });
  let guard = 0;
  while (c.flying && guard++ < 400) advance(16);
  assert.equal(c.current, "short-result");
  assert.equal(c.target, null);
  assert.equal(pending(), 0);
  assert.equal(events.filter((e) => e[0] === "depart").length, 1, "one departure");
  assert.deepEqual(events.filter((e) => e[0] === "settle"), [["settle", "short-result", "work"]], "one landing, on the last choice");
  // Flying back to where it came from, mid-air, is just another destination.
  const back = rig();
  back.c.go("result");
  back.advance(200);
  back.c.go("work");
  while (back.c.flying) back.advance(16);
  assert.equal(back.c.current, "work");
});

test("a hidden tab lands the flight at once instead of hanging in the air", () => {
  const { c, advance, pending } = rig();
  c.go("short-result");
  advance(300);
  c.complete();
  assert.equal(c.flying, false);
  assert.equal(c.current, "short-result");
  assert.deepEqual(c.pose(), W.settledCamera("short-result"));
  assert.equal(pending(), 0);
});

test("reduced motion flies the same sky, quicker and without banking", () => {
  for (const [a, b] of pairs) {
    const flight = W.plan(W.settledCamera(a), b, { reduced: true });
    assert.ok(flight.duration <= 640, `${a}>${b} ${flight.duration}`);
    assert.equal(flight.overshoot, 0);
    assert.equal(flight.turn, 0);
    const mid = W.sample(flight, 0.5);
    assert.equal(mid.yaw, 0);
    assert.equal(mid.roll, 0);
    // Still a journey through the world: halfway lies between the two islands.
    const [lo, hi] = [W.settledCamera(a).x, W.settledCamera(b).x].sort((p, q) => p - q);
    assert.ok(mid.x > lo && mid.x < hi, `${a}>${b} passes between`);
  }
  const { c, advance } = rig({ reduced: true });
  c.go("result");
  advance(700);
  assert.equal(c.current, "result");
});

test("the sky tints and the dock marker follow the camera without steps", () => {
  let last = null;
  const flight = W.plan(W.settledCamera("work"), "short-result");
  for (let i = 0; i <= 200; i++) {
    const cam = W.sample(flight, i / 200);
    const tint = W.tints(cam);
    assert.ok(Math.abs(tint.reduce((s, x) => s + x, 0) - 1) < 1e-9);
    const at = W.dockPosition(cam);
    assert.ok(at >= 0 && at <= 3);
    if (last) assert.ok(tint.every((w, k) => Math.abs(w - last[k]) < 0.2), "no tint jumps");
    last = tint;
  }
  assert.equal(W.dockPosition(W.settledCamera("work")), 0);
  assert.equal(W.dockPosition(W.settledCamera("short-result")), 3);
});

test("residents are shared out across the islands, and nobody is in two places", () => {
  const who = (names) => names.map((name) => ({ name }));
  const crew = W.crew({
    work: who(["a", "b", "c", "d", "e"]),
    result: who(["b", "f"]),
    short: who([]),
    "short-result": who(["a"]),
  });
  const all = Object.values(crew).flat().map((c) => c.name);
  assert.equal(new Set(all).size, all.length, "no clones");
  assert.deepEqual(crew.work.map((c) => c.name), ["a", "b", "c"]);
  assert.deepEqual(crew.result.map((c) => c.name), ["f", "d"], "an island short of residents borrows one the others had no room for");
  assert.ok(crew.short.length <= 2 && crew["short-result"].length <= 2);
  for (const list of Object.values(crew)) assert.ok(list.length <= W.FLYERS_PER_ISLAND);
  assert.deepEqual(Object.values(W.crew({})).flat(), []);
  assert.deepEqual({ ...W.RIDES }, { work: "broom", result: "bird", short: "board", "short-result": "cloud" });
});

test("the world has no seams: the sky ends with the stage and the cloud has no cut ends", () => {
  const css = read("creator-islands.css");
  const world = read("creator-transitions.js");
  // A sticky sky with a negative margin hangs past the stage over the room below.
  const sky = css.match(/\n\.cw-sky \{([^}]*)\}/)[1];
  assert.match(sky, /position: sticky/);
  assert.doesNotMatch(sky, /margin-bottom/, "the sky may not escape its stage");
  assert.match(css, /\.cw-sky-track \{[^}]*position: absolute;[^}]*inset: 0;/);
  assert.match(world, /const skyTrack = make\("div", "cw-sky-track", stage\);\s*const sky = make\("div", "cw-sky", skyTrack\);/);
  assert.match(css, /\.cw-view \{[^}]*mask: linear-gradient\(180deg, #0000, #000 90px, #000 calc\(100% - 90px\), #0000\)/, "both ends of the sky melt away");
  // The billows along the task cloud thin out before its rounded corners.
  const billows = css.match(/\.cw-cloud::before,\s*\.cw-cloud::after \{([^}]*)\}/)[1];
  assert.match(billows, /mask: linear-gradient\(90deg, #0000, #000 \d+px, #000 calc\(100% - \d+px\), #0000\)/);
});

test("a project is drawn as a crystal that scales whole, never a stretched picture", () => {
  const css = read("creator-islands.css");
  const crystal = css.slice(css.indexOf("/* ------------------------------------------------------------------ crystal */"), css.indexOf("/* -------------------------------------------------------------------- panel */"));
  assert.ok(crystal.length > 1000, "the crystal section exists");
  assert.doesNotMatch(crystal, /border-image|url\(/, "no framed image to stretch or cut");
  // Its cuts and shards are measured in cqw of the card, so a larger card draws
  // the same crystal larger instead of stretching one part of it.
  const cuts = [...crystal.matchAll(/--(cut|base|face|face-in): ([^;]+);/g)];
  assert.ok(cuts.length >= 4);
  for (const [, name, value] of cuts) assert.match(value, /^[\d.]+cqw$/, `--${name} is ${value}`);
  const shards = [...crystal.matchAll(/\.co-shard:nth-child\(\d\) \{([^}]*)\}/g)];
  assert.equal(shards.length, 7);
  for (const [, body] of shards) for (const [, v] of body.matchAll(/(?:width|height): ([^;]+);/g)) assert.match(v, /^[\d.]+cqw$/);
  assert.match(read("creator-office.js"), /for \(let i = 0; i < 7; i\+\+\) crown\.append/);
  for (const zone of ["work", "result", "short", "short-result"]) {
    const palette = css.match(new RegExp(`\\.cw-island-deck\\[data-zone="${zone}"\\] \\{([^}]*--gem-hi[^}]*)\\}`));
    assert.ok(palette, zone + " has a crystal palette");
    for (const v of ["--gem-hi", "--gem-mid", "--gem-edge", "--gem-core", "--face-1", "--face-3"]) assert.ok(palette[1].includes(v), `${zone} sets ${v}`);
  }
  // Six on the ACTIVE DECK, and whatever is folded on a card is one click away.
  const office = read("creator-office.js");
  assert.match(office, /const DECK_HERO = 6;/);
  assert.match(css, /\.cw-island-deck \.co-project:not\(\.is-expanded\) \.co-more \{\s*display: none;/);
  assert.match(office, /expandToggle\(card, p, "⋯ 更多"\)/);
  const reduced = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduced, /\.co-crystal :is\(\.co-crystal-aura, \.co-crystal-core, \.co-crystal-glint, \.co-spark\) \{\s*animation: none !important;/);
});

test("the world never reads or publishes work state", () => {
  const source = read("creator-transitions.js");
  for (const forbidden of ["RenguinOperations", "CreatorOffice", "fetch(", "/api/", "localStorage"])
    assert.ok(!source.includes(forbidden), "transitions must not touch " + forbidden);
});
