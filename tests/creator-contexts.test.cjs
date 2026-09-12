const { test } = require("node:test");
const assert = require("node:assert/strict");
const { collect, layer } = require("../frontend/creator-contexts.js");
const project = {
  project_id: "film",
  classification: "REGISTERED",
  project_name: "原名",
  workspace: "E:/film",
};
const repo = { id: "e:/star_office_ui", name: "Star_Office_UI" };
const observation = (id, extra = {}) => ({
  agent: "ASTRA",
  native_id: id,
  repo_context: repo,
  visual_activity: {
    state: "WORKING",
    timestamp: 100,
    expires_after_seconds: 90,
  },
  ...extra,
});
const run = (extra) =>
  collect({
    now: 110,
    projects: [project],
    effective: (j) => j.state,
    ...extra,
  });

test("exact source identity wins over shared workspace and rebound card names", () => {
  const result = run({
    projects: [
      project,
      { ...project, project_id: "other", project_name: "正確來源" },
    ],
    jobs: [
      {
        agent: "ASTRA",
        state: "RUNNING",
        project_id: "other",
        worktree: "E:/film",
      },
    ],
    preferences: {
      other: { display_name: "另一張卡", source_project_id: "different" },
    },
  });
  assert.deepEqual(
    result.map((x) => [x.id, x.name]),
    [["other", "正確來源"]],
  );
});
test("same agent can work on repository and multiple named projects simultaneously", () => {
  const result = run({
    observations: [observation("repo")],
    jobs: [
      { agent: "ASTRA", state: "RUNNING", project_id: "film" },
      { agent: "ASTRA", state: "RUNNING", project_id: "second" },
    ],
    projects: [
      project,
      { ...project, project_id: "second", project_name: "第二企劃" },
    ],
    preferences: { film: { display_name: "自訂企劃" } },
  });
  assert.deepEqual(
    result.map((x) => [x.kind, x.name]),
    [
      ["PROJECT", "自訂企劃"],
      ["PROJECT", "第二企劃"],
      ["REPO", "Star_Office_UI"],
    ],
  );
});
test("terminal, expired, future and malformed signals never highlight", () => {
  for (const [state, timestamp] of [
    ["RECENT", 100],
    ["WORKING", 20],
    ["WORKING", 120],
    ["WORKING", "bad"],
  ])
    assert.equal(
      run({
        observations: [
          observation("a", {
            visual_activity: { state, timestamp, expires_after_seconds: 90 },
          }),
        ],
      }).length,
      0,
    );
  assert.equal(
    run({ jobs: [{ agent: "ASTRA", state: "COMPLETED", project_id: "film" }] })
      .length,
    0,
  );
});
test("only exact project identity or workspace matches; same agent does not imply a project", () => {
  const result = run({
    observations: [observation("unrelated")],
    jobs: [
      {
        agent: "ASTRA",
        state: "COMPLETED",
        project_id: "film",
        native_observations: [observation("unrelated")],
      },
    ],
  });
  assert.equal(result[0].kind, "REPO");
  assert.equal(
    run({
      observations: [observation("a", { worktree: "\\\\?\\E:\\film" })],
    })[0].kind,
    "PROJECT",
  );
  assert.equal(
    run({ observations: [observation("a", { worktree: "E:/film-other" })] })[0]
      .kind,
    "REPO",
  );
});
test("matching explicit native task identity joins project; duplicate source signals yield one frame", () => {
  const job = {
    agent: "ASTRA",
    state: "RUNNING",
    project_id: "film",
    provenance: { native_thread_id: "native" },
  };
  const result = run({ jobs: [job], observations: [observation("native")] });
  assert.equal(result.length, 1);
  assert.equal(result[0].kind, "PROJECT");
});
test("unmapped source remains visibly unmapped, never falsely assigned a repo or plan", () => {
  assert.equal(
    run({ observations: [observation("a", { repo_context: null })] })[0].kind,
    "WORK",
  );
  const folder = run({
    observations: [
      observation("a", {
        repo_context: null,
        worktree: "\\\\?\\E:\\20260908_生日",
      }),
    ],
  })[0];
  assert.deepEqual([folder.kind, folder.name], ["FOLDER", "20260908_生日"]);
});
test("every working layer is named: 企劃, REPO and STAR OFFICE side by side", () => {
  const result = run({
    observations: [
      observation("plan", { repo_context: null, worktree: "\\\\?\\E:\\film" }),
      observation("os", {
        repo_context: { id: "e:/content_os", name: "Content_OS" },
      }),
      observation("office", {
        repo_context: { ...repo, layer: "STAR_OFFICE" },
      }),
    ],
  });
  assert.deepEqual(
    result.map((x) => [layer(x.kind), x.name]),
    [
      ["企劃", "原名"],
      ["REPO", "Content_OS"],
      ["STAR OFFICE", "Star_Office_UI"],
    ],
  );
  assert.equal(layer("WORK"), "工作");
  assert.equal(layer(undefined), "工作");
});
test("using another agent's process is its own frame, never merged into or replacing the project/repo identity", () => {
  const result = run({
    observations: [
      observation("a", {
        agent: "ASTRA",
        visual_activity: {
          state: "WORKING",
          timestamp: 100,
          expires_after_seconds: 90,
          process: { ref: "BIONIC", label: "使用 BIONIC 粗剪流程" },
        },
      }),
    ],
  });
  assert.deepEqual(
    result.map((x) => [x.kind, layer(x.kind), x.name]),
    [
      ["REPO", "REPO", "Star_Office_UI"],
      ["PROCESS", "流程", "使用 BIONIC 粗剪流程"],
    ],
  );
  // The process frame belongs to the agent that used it, not to BIONIC.
  assert.equal(result[1].agent, "ASTRA");
});
test("a process reference without live work never surfaces a frame", () => {
  const result = run({
    observations: [
      observation("a", {
        visual_activity: {
          state: "RECENT",
          timestamp: 100,
          expires_after_seconds: 90,
          process: { ref: "BIONIC", label: "使用 BIONIC 粗剪流程" },
        },
      }),
    ],
  });
  assert.equal(result.length, 0);
});
