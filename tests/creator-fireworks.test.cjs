const { test } = require("node:test");
const assert = require("node:assert/strict");
const { LIMITS, PALETTE, plan, launch } = require("../frontend/creator-fireworks.js");

test("a show stays inside its particle budget and on screen", () => {
  const shells = plan(1280, 720, null, 7);
  assert.equal(shells.length, LIMITS.shells);
  assert.ok(
    shells.reduce((n, s) => n + s.sparks, 0) <= LIMITS.particles,
    "every burst fits inside the particle budget at once",
  );
  for (const s of shells) {
    assert.ok(s.x >= 24 && s.x <= 1256, "shell stays inside the viewport");
    assert.ok(s.y > 0 && s.y < s.from, "every shell bursts above where it launched");
    assert.ok(s.sparks <= LIMITS.sparks);
    assert.ok(PALETTE.includes(s.color) && PALETTE.includes(s.accent));
    assert.ok(s.delay >= 0 && s.delay < LIMITS.duration / 2, "the show finishes well before its hard stop");
  }
  assert.deepEqual(plan(1280, 720, null, 7), shells, "a seed replays the same show");
});

test("the lead shell rises from the step that was just checked", () => {
  const [lead] = plan(1280, 720, { x: 400, y: 600 }, 3);
  assert.equal(lead.x, 400);
  assert.equal(lead.from, 600);
  assert.equal(lead.delay, 0);
  assert.ok(lead.y <= 600 - 80, "it bursts clearly above the step");
  const [top] = plan(1280, 720, { x: 400, y: 90 }, 3);
  assert.equal(top.from, 732, "a step near the top edge launches from below instead");
  const [offscreen] = plan(1280, 720, { x: 400, y: 2000 }, 3);
  assert.equal(offscreen.from, 732, "a scrolled-away step launches from below instead");
});

test("without a page there is nothing to draw", () => {
  assert.equal(launch({ title: "後製完成！" }), false);
});
