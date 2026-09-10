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


console.log(
  JSON.stringify({
    result: "PASS",
    checks: 40,
    scope:
      "Creator historical state, never observed, native activity, lease distinction, display tiers and completed-project bucketing",
  }),
);
