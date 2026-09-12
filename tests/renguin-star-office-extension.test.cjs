// Root cause: a live bridge process restamps its own poll time forever, even
// when the session underneath it has not moved. Staleness must be judged
// against the session's own last reported update, never the bridge's liveness.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

const base = path.join(__dirname, "../frontend");
function load() {
  const window = { fetch: async () => ({ ok: false }) };
  const document = { body: null, addEventListener() {} };
  const context = vm.createContext({ window, document, Date, Number, String, JSON, console });
  for (const name of ["renguin-freshness.js", "renguin-star-office-extension.js"])
    vm.runInContext(fs.readFileSync(path.join(base, name), "utf8"), context);
  return window.RenguinOfficeExtension;
}
const E = load();

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
const secondsAgo = (n) => new Date(Date.now() - n * 1000).toISOString();

test("a session stuck for days reads as stuck/overdue, never as still thinking", () => {
  const stuck = {
    working: true,
    work_state: "THINKING_TOO_LONG",
    action: "思考過久",
    session_updated_at: daysAgo(12),
    thinking_seconds: 12 * 86400,
  };
  assert.equal(E.isStale(stuck), true);
  assert.equal(E.roleState(stuck), "卡住／逾時");
  assert.doesNotMatch(E.roleDetail(stuck), /思考過久/);
  assert.match(E.roleDetail(stuck), /最後回報/);
  assert.doesNotMatch(E.workerStatus(stuck), /思考過久/);
});
test("a bridge that keeps restamping generated_at does not by itself count as fresh", () => {
  // The bridge's own poll time is recent; the underlying session is not.
  const stuck = {
    working: true,
    updated_at: secondsAgo(1), // bridge just polled
    session_updated_at: daysAgo(12), // session has not moved
  };
  assert.equal(E.isStale(stuck), true);
});
test("genuinely recent work is not flagged stale", () => {
  const active = {
    working: true,
    action: "整理素材",
    updated_at: secondsAgo(1),
    session_updated_at: secondsAgo(5),
    elapsed_seconds: 5,
  };
  assert.equal(E.isStale(active), false);
  assert.equal(E.roleState(active), "收到活動回報");
  assert.match(E.roleDetail(active), /整理素材/);
});
test("not working at all is never mistaken for stuck", () => {
  const idle = { working: false, updated_at: secondsAgo(1), session_updated_at: daysAgo(12) };
  assert.equal(E.isStale(idle), false);
  assert.equal(E.roleState(idle), "上次活動已結束");
});
test("missing status is unknown, not stuck", () => {
  assert.equal(E.isStale(undefined), false);
  assert.equal(E.roleState(undefined), "目前無法確認");
  assert.equal(E.roleDetail(undefined), "等待活動來源回報");
});
