const { test } = require("node:test");
const assert = require("node:assert/strict");
const { destination } = require("../frontend/creator-scene.js");
const { collect } = require("../frontend/creator-contexts.js");
test("observed work sends each member to a workstation; expiry returns to distinct rest places", () => {
  const agents = ["CHATGPT_WORK", "CLAUDE", "BIONIC", "ASTRA"];
  const rests = agents.map((key) => destination(key, { running: false }));
  assert.equal(new Set(rests.map((x) => x.point.join())).size, 4);
  for (const key of agents) {
    const working = destination(key, { running: true, contexts: [] });
    assert.equal(working.mode, "work");
    assert.notDeepEqual(
      working.point,
      destination(key, { running: false }).point,
    );
  }
  assert.equal(
    destination("CHATGPT_WORK", { running: true, contexts: [{ kind: "REPO" }] })
      .place,
    "工程桌",
  );
});
test("multiple browser planning contexts coexist and stale or idle pages never imply work", () => {
  const page = (id, state = "WORKING", timestamp = 100) => ({
    agent: "CHATGPT_WORK",
    native_id: id,
    source: "CHATGPT_BROWSER_UI",
    browser_context: { id, name: id },
    visual_activity: { state, timestamp, expires_after_seconds: 45 },
  });
  const rows = collect({
    observations: [
      page("企劃一"),
      page("企劃二"),
      page("已停止", "IDLE"),
      page("過期", "WORKING", 0),
    ],
    now: 110,
    effective: () => "",
  });
  assert.deepEqual(
    rows.map((x) => [x.kind, x.name]),
    [
      ["PROJECT", "企劃一"],
      ["PROJECT", "企劃二"],
    ],
  );
});
