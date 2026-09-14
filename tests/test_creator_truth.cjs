// Isolated display fixtures. No runtime producer or canonical data is written.
const assert = require("node:assert/strict"),
  vm = require("node:vm"),
  fs = require("node:fs"),
  path = require("node:path");
const base = path.join(__dirname, "../frontend");
const window = {};
const document = { body: null, addEventListener() {} };
const context = vm.createContext({
  window,
  document,
  Date,
  Number,
  String,
  Object,
  Array,
  Set,
  Map,
  JSON,
  console,
  IntersectionObserver: class {
    observe() {}
    disconnect() {}
  },
});
for (const name of [
  "renguin-freshness.js",
  "renguin-control-semantics.js",
  "creator-contexts.js",
  "creator-scene.js",
  "creator-office.js",
])
  vm.runInContext(fs.readFileSync(path.join(base, name), "utf8"), context);
const C = window.CreatorOffice;
const past = new Date(Date.now() - 900000).toISOString(),
  fresh = new Date(Date.now() - 1000).toISOString();
const p = {
  project_id: "fixture",
  current_stage_id: "AI_ROUGH_CUT",
  current_status: "DONE",
  timeline: [
    {
      id: "AI_ROUGH_CUT",
      status: "DONE",
      ledger_entry_id: "event",
      updated_at: past,
    },
  ],
};
assert.equal(C.timeline(p)[0].status, "DONE");
assert.equal(C.timeline(p)[0].updated_at, past);
assert.equal(C.lastState(p).status, "DONE");
assert.equal(C.timeline({ ...p, timeline: [] }).length, 0);
assert.equal(
  C.timeline({ ...p, timeline: [{ ...p.timeline[0], ledger_entry_id: null }] })
    .length,
  0,
);
assert.equal(
  C.timeline({
    ...p,
    timeline: [
      {
        ...p.timeline[0],
        updated_at: new Date(Date.now() + 60000).toISOString(),
      },
    ],
  }).length,
  0,
);
assert.equal(
  C.lastState({
    ...p,
    current_status: "ACTIVE",
    timeline: [{ ...p.timeline[0], status: "ACTIVE" }],
  }).status,
  "ACTIVE",
);
window.RenguinOperations = {
  current: {
    jobs: [],
    native_coverage: {
      observations: [
        { agent: "CHATGPT_WORK", last_native_event: { timestamp: past } },
      ],
    },
  },
  effective: (j) => j.effective_status,
};
assert.match(C.memberView("CHATGPT_WORK").text, /最近活動/);
assert.equal(C.memberView("CHATGPT_WORK").running, false);
assert.equal(C.memberView("CLAUDE").text, "○ 尚無同步紀錄");
assert.equal(C.celebrates("AI_POST", true), true);
assert.equal(
  C.celebrates("AI_POST", false),
  false,
  "unchecking post-production is not a celebration",
);
assert.equal(C.celebrates("HUMAN_FINAL_CUT", true), false);
window.RenguinOperations.current = {
  jobs: [],
  native_coverage: {
    observations: [
      {
        agent: "CLAUDE",
        source: "CLAUDE_NATIVE_SESSION",
        native_id: "claude-session",
        last_native_event: { type: "tool_use", timestamp: fresh },
        last_work_event: { timestamp: fresh, action: "正在使用工具" },
        visual_activity: {
          state: "WORKING",
          timestamp: fresh,
          expires_after_seconds: 90,
          action: "正在使用工具",
        },
      },
    ],
  },
};
assert.equal(
  C.memberView("CLAUDE").running,
  true,
  "a live Claude session lights its member card",
);
assert.match(C.memberView("CLAUDE").summary, /Claude/);
assert.doesNotMatch(
  C.memberView("CLAUDE").summary,
  /Codex/,
  "Claude work is never credited to Codex",
);
window.RenguinOperations.current = {
  jobs: [
    {
      agent: "ASTRA",
      effective_status: "RUNNING",
      last_heartbeat: Date.now() / 1000,
      project_name: "Star Office",
      task: "Creator Office UX v2",
    },
  ],
};
assert.equal(C.memberView("ASTRA").text, "● 正在處理 Star Office");
assert.equal(C.memberView("ASTRA").running, true);
window.RenguinOperations.current.jobs[0].effective_status = "STALE";
assert.equal(C.memberView("ASTRA").running, false);
assert.match(C.memberView("ASTRA").text, /最近活動/);
window.RenguinOperations.current = {
  jobs: [],
  native_coverage: {
    observations: [
      {
        agent: "ASTRA",
        last_native_event: { timestamp: past },
        last_work_event: { timestamp: fresh },
      },
    ],
  },
};
assert.equal(C.memberView("ASTRA").stamp, fresh);
assert.equal(C.memberView("ASTRA").running, false);
assert.equal(
  C.displayStatus(p, p.timeline[0], {
    event: { project_id: "fixture", timestamp: past, status: "FAILED" },
  }),
  "FAILED",
);
assert.equal(
  C.displayStatus(p, p.timeline[0], {
    event: { project_id: "different", timestamp: past, status: "FAILED" },
  }),
  "DONE",
);
assert.equal(
  C.displayStatus(p, p.timeline[0], {
    event: { project_id: "fixture", timestamp: fresh, status: "FAILED" },
  }),
  "DONE",
);
// Display tiers and the lit project house must never outlive the evidence.
const lease = (seconds) => ({
  agent: "ASTRA",
  effective_status: "ACTIVE",
  project_id: "fixture",
  last_heartbeat: new Date(Date.now() - seconds * 1000).toISOString(),
  lease_expires_at: new Date(Date.now() - (seconds - 120) * 1000).toISOString(),
});
window.RenguinOperations = {
  current: { jobs: [lease(5)] },
  effective: (job) =>
    window.RenguinFreshness.lease(job).fresh ? "RUNNING" : "STALE",
};
assert.equal(C.memberTier(C.memberView("ASTRA")), "working");
assert.equal(C.projectLive(p), "running");
window.RenguinOperations.current = { jobs: [lease(4000)] };
assert.equal(C.memberTier(C.memberView("ASTRA")), "recent");
assert.equal(C.projectLive(p), "idle");
window.RenguinOperations.current = { jobs: [] };
assert.equal(C.memberTier(C.memberView("ASTRA")), "quiet");
assert.equal(C.projectLive(p), "idle");
assert.equal(C.memberTier({ running: false, stamp: past }), "recent");
assert.equal(C.memberTier({ running: false, stamp: undefined }), "quiet");

// A completed project must always be reachable. A project whose completion time
// is missing or unreadable used to fail both the "recent" (<= 14 days) and the
// "older" (> 14 days) test, so it appeared in neither list and vanished.
const DAY = 86400;
const published = (stamp) => ({
  project_id: "published",
  timeline: stamp
    ? [
        {
          id: "PUBLISH",
          status: "DONE",
          ledger_entry_id: "publish-event",
          updated_at: stamp,
        },
      ]
    : [],
});
assert.equal(C.stampDone(published(fresh)), fresh);
assert.ok(C.completedAge(published(fresh)) <= 14 * DAY);
assert.ok(Number.isFinite(C.doneSortKey(published(fresh))));

const long_ago = new Date(Date.now() - 30 * DAY * 1000).toISOString();
assert.ok(C.completedAge(published(long_ago)) > 14 * DAY);

// No usable completion time at all: still bucketed, and always into 更早完成.
for (const bad of [undefined, "", "not-a-date"]) {
  const project = published(bad);
  const age = C.completedAge(project);
  assert.equal(Number.isNaN(age), false, `age is comparable for ${String(bad)}`);
  assert.equal(age <= 14 * DAY, false, `not filed as recent for ${String(bad)}`);
  assert.equal(age > 14 * DAY, true, `filed as older for ${String(bad)}`);
  assert.equal(C.doneSortKey(project), -Infinity, `sorts last for ${String(bad)}`);
}


// Pinned projects lead 正在製作 in the order they were pinned. Everything else
// keeps its own order, and a tie on pin time falls back to the project id.
const rows = ["a", "b", "c", "d", "e"].map((project_id) => ({ project_id }));
const pinTimes = { c: "2026-09-01T00:00:02Z", e: "2026-09-01T00:00:01Z" };
const byName = (x, y) => (x.project_id < y.project_id ? -1 : 1);
// Spread into this realm: arrays built inside the vm carry its own prototype.
const ids = (list) => [...list].map((p) => p.project_id);
assert.deepEqual(ids(C.arrange(rows, (p) => pinTimes[p.project_id] || "", byName)), ["e", "c", "a", "b", "d"]);
assert.deepEqual(
  ids(C.arrange(rows, (p) => (["d", "b"].includes(p.project_id) ? "same" : ""), (x, y) => -byName(x, y))),
  ["b", "d", "e", "c", "a"],
);
assert.deepEqual(ids(C.arrange(rows, () => "", byName)), ["a", "b", "c", "d", "e"]);
// Each island shows six crystals at a time on its ACTIVE DECK; the rest wait,
// folded, on the PROJECT DECK. Ten pins are allowed, so pins beyond six lead the
// PROJECT DECK in pin order rather than pushing anyone off the desk.
assert.equal(C.PIN_LIMIT, 10);
assert.equal(C.DECK_HERO, 6);
const many = Array.from({ length: 23 }, (_, i) => ({ project_id: "p" + i }));
const [hero, rest] = C.deckSplit(many);
assert.deepEqual(ids(hero), ids(many.slice(0, 6)));
assert.deepEqual(ids(rest), ids(many.slice(6)));
assert.deepEqual([...C.deckSplit(many.slice(0, 4))[1]], [], "a small island has no lower deck");
assert.deepEqual([...C.deckSplit(many.slice(0, 6))[1]], [], "exactly six still fit on the ACTIVE DECK");
assert.equal([...hero, ...rest].length, many.length, "nobody is dropped between the decks");
const pinned = Object.fromEntries(many.slice(0, 10).map((p, i) => [p.project_id, "2026-09-14T00:00:0" + i]));
const [pinHero, pinRest] = C.deckSplit(C.arrange([...many].reverse(), (p) => pinned[p.project_id] || "", () => 0));
assert.deepEqual(ids(pinHero), ids(many.slice(0, 6)), "the first six pins stand on the ACTIVE DECK");
assert.deepEqual(ids(pinRest).slice(0, 4), ids(many.slice(6, 10)), "the other four pins lead the PROJECT DECK");

// 任務雲: four columns in a fixed order, and the same filing rule as the store.
assert.deepEqual([...C.TODO_COLUMNS].map((c) => c.label), ["REPO", "企劃", "STAR OFFICE", "其他"]);
const filing = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/todo-categories.json"), "utf8"));
assert.ok(filing.length >= 12);
for (const { item, key, category } of filing)
  assert.equal(C.todoCategory(item, key || ""), category, JSON.stringify(item));

// 最近完成 opens newest first. Once the user arranges the shelf their order holds,
// and anything finished since leads it, newest first.
const finishedAt = { a: 10, b: 30, c: 20, d: 40 };
const finishStamp = (p) => finishedAt[p.project_id] ?? -Infinity;
const shelf = ["a", "b", "c", "d"].map((project_id) => ({ project_id }));
assert.deepEqual(ids(C.shelve(shelf, [], finishStamp)), ["d", "b", "c", "a"]);
assert.deepEqual(ids(C.shelve(shelf, ["a", "c", "b"], finishStamp)), ["d", "a", "c", "b"]);
assert.deepEqual(ids(C.shelve(shelf, ["b", "gone", "a"], finishStamp)), ["d", "c", "b", "a"]);
assert.deepEqual(
  ids(C.shelve([{ project_id: "u" }, { project_id: "v" }], undefined, () => -Infinity)),
  ["u", "v"],
  "unreadable completion times still sort",
);

// A short video runs 素材 → 後製 → 上映 only; long form honours its disabled steps.
assert.deepEqual([...C.stepsFor({ format: "SHORT", disabled_steps: ["AI_POST"] })], ["INDEX", "AI_POST", "PUBLISH"]);
assert.deepEqual([...C.SHORT_STEPS], ["INDEX", "AI_POST", "PUBLISH"]);
assert.equal(C.stepsFor(undefined).length, 13);
assert.equal(C.stepsFor({ disabled_steps: ["GATE"] }).includes("GATE"), false);

// Office Members wear canonical character art; unknown members get the placeholder.
for (const key of ["CHATGPT_WORK", "ASTRA", "CLAUDE", "BIONIC"]) {
  const who = C.memberIdentity(key);
  assert.match(who.asset, /^\/static\/renguin-characters\/(director|astra|editor|scanner)\/[a-z]+\.png$/);
  assert.ok(who.role && who.character, key + " has a role and a character");
  assert.equal(who.bounds.length, 6, key + " crops to its figure");
}
assert.equal(C.memberIdentity("UNKNOWN").asset, null);

console.log(
  JSON.stringify({
    result: "PASS",
    checks: 75 + filing.length,
    scope:
      "Creator historical state, never observed, native activity, lease distinction, display tiers, completed-project bucketing, pin order, island decks, task-cloud filing, completed shelf order, short-video steps and member identity",
  }),
);
