/* Display contexts are not execution leases or collision-safety claims. */
((scope) => {
  "use strict";
  const path = (value) =>
    String(value || "")
      .replace(/^\\\\\?\\/, "")
      .replace(/\\/g, "/")
      .replace(/\/+$/, "")
      .toLowerCase();
  const basename = (value) =>
    String(value || "")
      .replace(/\\/g, "/")
      .replace(/\/+$/, "")
      .split("/")
      .pop();
  const stamp = (value) =>
    typeof value === "number" ? value : Date.parse(value) / 1000;
  function collect({
    jobs = [],
    observations = [],
    projects = [],
    preferences = {},
    effective,
    now = Date.now() / 1000,
  }) {
    const output = new Map();
    const describe = (item) => {
      const registered = projects.filter(
        (p) => p.classification === "REGISTERED",
      );
      const project =
        registered.find((p) => p.project_id === item.project_id) ||
        registered.find(
          (p) => p.workspace && path(p.workspace) === path(item.worktree),
        );
      if (project) {
        const meta = preferences[project.project_id] || {};
        const matches =
          !Object.hasOwn(meta, "source_project_id") ||
          meta.source_project_id === project.project_id;
        return {
          kind: "PROJECT",
          id: project.project_id,
          name: (matches && meta.display_name) || project.project_name,
        };
      }
      if (item.source === "CHATGPT_BROWSER_UI" && item.browser_context)
        return {
          kind: "PROJECT",
          id: item.browser_context.id,
          name: item.browser_context.name,
        };
      const repo =
        item.repo_context ||
        (item.repo ? { id: path(item.repo), name: basename(item.repo) } : null);
      if (repo) return { kind: "REPO", id: repo.id, name: repo.name };
      return {
        kind: "WORK",
        id: item.native_id || item.job_id,
        name: "尚未對應企劃",
      };
    };
    const add = (item, action) => {
      const context = describe(item);
      const key = item.agent + ":" + context.kind + ":" + context.id;
      if (!output.has(key))
        output.set(key, { ...context, agent: item.agent, action });
    };
    for (const job of jobs)
      if (effective(job) === "RUNNING") add(job, "正在工作");
    for (const observation of observations) {
      const activity = observation.visual_activity;
      const age = now - stamp(activity?.timestamp);
      if (
        activity?.state !== "WORKING" ||
        !Number.isFinite(age) ||
        age < 0 ||
        age >= Math.min(90, activity.expires_after_seconds || 0)
      )
        continue;
      const owner = jobs.find(
        (j) => j.provenance?.native_thread_id === observation.native_id,
      );
      add(
        {
          ...observation,
          project_id: observation.project_id || owner?.project_id,
          repo: observation.repo || owner?.repo,
        },
        activity.action || "正在工作",
      );
    }
    return [...output.values()];
  }
  scope.CreatorContexts = { collect };
  if (typeof module !== "undefined") module.exports = { collect };
})(typeof window === "undefined" ? globalThis : window);
