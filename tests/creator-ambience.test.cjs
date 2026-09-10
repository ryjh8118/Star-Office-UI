const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { LIMITS, SOURCES, WINDOWS, plan } = require("../frontend/creator-ambience.js");

const source = fs.readFileSync(
  path.join(__dirname, "../frontend/creator-ambience.js"),
  "utf8",
);

test("ambience particle budgets stay bounded", () => {
  const counts = Object.values(LIMITS);
  assert.equal(counts.length, 4);
  for (const [kind, count] of Object.entries(LIMITS)) {
    assert.ok(Number.isInteger(count) && count > 0, kind + " must be a positive count");
    assert.ok(count <= 24, kind + " exceeds its per-effect budget");
  }
  assert.ok(
    counts.reduce((a, b) => a + b, 0) <= 48,
    "total decorative particles exceed the scene budget",
  );
  assert.ok(SOURCES.length + WINDOWS.length <= 20, "too many light layers");
  assert.ok(
    SOURCES.filter((s) => s.motion).length <= 6,
    "too many animated light sources",
  );
});

test("layouts are deterministic and stay inside the map box", () => {
  for (const kind of ["dust", "snow"]) {
    const first = plan(kind, 8, 17);
    assert.deepEqual(plan(kind, 8, 17), first, kind + " must render identically on reload");
    assert.notDeepEqual(plan(kind, 8, 18), first, kind + " must vary with its seed");
    for (const p of first) {
      assert.ok(p.x >= 0 && p.x <= 100, "x stays within the map");
      assert.ok(p.size > 0 && p.size < 12, "particle stays small");
      assert.ok(p.duration >= 8, "particle drifts slowly");
      assert.ok(p.delay <= 0, "particles start mid-flight, never in a burst");
    }
  }
  for (const p of plan("steam", 3, 43))
    assert.ok(p.duration >= 4 && p.size > 0, "steam wisps stay slow and small");
  for (const s of [...SOURCES, ...WINDOWS]) {
    assert.ok(s.x >= -10 && s.x <= 110, "light source stays near the map");
    assert.ok(s.y >= -10 && s.y <= 110, "light source stays near the map");
  }
});

test("ambience never reads or publishes work state", () => {
  for (const key of Object.keys(module.exports || {}))
    assert.ok(!/state|status|job/i.test(key));
  for (const forbidden of [
    "RenguinOperations",
    "RenguinFreshness",
    "CreatorOffice",
    "effective(",
    "last_heartbeat",
    "lease",
    "visual_activity",
    "fetch(",
  ])
    assert.ok(
      !source.includes(forbidden),
      "ambience must not touch " + forbidden,
    );
  for (const entry of [...SOURCES, ...WINDOWS])
    for (const key of Object.keys(entry))
      assert.ok(
        !/agent|running|status|state|project/i.test(key),
        "decorative light carries no work identity",
      );
});
