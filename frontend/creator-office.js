/* Creator Office UX. Canonical/executor inputs are read-only; user presentation is separate. */
(() => {
  "use strict";
  const routeLabels = {
    INDEX: "素材",
    CALIBRATION: "校正",
    LONGFORM_DIRECTOR: "導演",
    WORKORDER: "工單",
    GATE: "確認",
    AI_ROUGH_CUT: "粗剪",
    HUMAN_FINAL_CUT: "定剪",
    FINAL_CUT_LEARNING: "定剪學習",
    AI_POST: "後製",
    POST_LEARNING: "後製學習",
    PUBLISH: "上映",
    MEMBER_PUBLISH: "會員影片",
    SHORT_PUBLISH: "短影音",
  };
  const labels = {
    ...routeLabels,
    RAW: "素材就緒",
    PROJECT_CREATED: "企劃建立",
    AI_POST: "後製",
    SUBTITLES: "字幕",
    RELEASE_PREP: "發布準備",
    PUBLISH: "發布",
    ROUGH_CUT_LEARNING: "剪輯學習",
    POST_LEARNING: "後製學習",
    PROJECT_FINAL_LEARNING: "企劃學習",
    ARCHIVE: "歸檔",
  };
  const states = {
    DONE: "已完成",
    COMPLETED: "已完成",
    VERIFIED: "已驗證",
    ACTIVE: "正在進行",
    RUNNING: "正在進行",
    TODO: "尚未開始",
    NOT_STARTED: "尚未開始",
    REVIEW: "等待你確認",
    WAITING_INPUT: "等待你確認",
    BLOCKED: "等待處理",
    FAILED: "執行失敗",
    UNKNOWN: "尚無同步紀錄",
    NOT_REQUIRED: "不需要",
  };
  const agents = {
    CHATGPT_WORK: ["ChatGPT", "director/renguin.png"],
    ASTRA: ["ASTRA", "astra/eric.png"],
    CLAUDE: ["Claude", "editor/dola.png"],
    BIONIC: ["BIONIC", "scanner/xuebao.png"],
  };
  const node = (tag, text, cls) => {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  };
  const button = (text, fn, cls = "co-button") => {
    const e = node("button", text, cls);
    e.type = "button";
    e.addEventListener("click", async (event) => {
      if (e.disabled) return;
      const result = fn(event);
      if (result?.then) {
        e.disabled = true;
        e.setAttribute("aria-busy", "true");
        try {
          await result;
        } finally {
          e.disabled = false;
          e.removeAttribute("aria-busy");
        }
      }
    });
    return e;
  };
  const epoch = (value) => {
    if (typeof value === "number") return value > 1e12 ? value / 1000 : value;
    return window.RenguinFreshness.epoch(value);
  };
  const validTime = (value) =>
    Number.isFinite(epoch(value)) && epoch(value) <= Date.now() / 1000;
  const date = (value, short = false) =>
    validTime(value)
      ? new Date(epoch(value) * 1000).toLocaleString(
          "zh-TW",
          short
            ? { month: "numeric", day: "numeric" }
            : {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              },
        )
      : "尚無同步紀錄";
  const day = (value) =>
    validTime(value)
      ? new Date(epoch(value) * 1000).toLocaleDateString("sv-SE")
      : "";
  const clean = (value, fallback = "請查看完整紀錄") => {
    const s = String(value || "");
    return !s ||
      /\b[A-Z]+(?:_[A-Z0-9]+)+\b|[A-Z]:\\|lease|heartbeat|TTL/i.test(s)
      ? fallback
      : s.slice(0, 160);
  };
  let response = { status: "UNKNOWN", projection: null },
    lastGood = null,
    eventStatuses = {},
    presentation = { projects: {}, inbox: {}, order: [] },
    storeReady = false;
  let root,
    membersRoot,
    projectsRoot,
    otherProjectsRoot,
    otherProjectsToggle,
    inboxRoot,
    completedRoot,
    syncButton,
    dialog,
    signature = "",
    memberSignature = "",
    inboxSignature = "",
    dragId = null,
    dragging = false;
  let inboxItems = [],
    selectedAgent = null,
    mutationPending = false,
    mutationQueue = Promise.resolve(),
    editingName = false,
    loaded = false,
    polling = false,
    pollTimer = null,
    retryDelay = 5000;
  let activeProjectIds = [],
    projectDragId = null;
  let browserStatus = { connected: false, observations: [] };
  const houseObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries)
        entry.target.classList.toggle("is-on-screen", entry.isIntersecting);
    },
    { rootMargin: "60px" },
  );
  const projectName = (p) =>
    presentation.projects[p.project_id]?.display_name || p.project_name;
  const workflow = (p) => presentation.projects[p.project_id]?.workflow || {};
  const sourceId = (p) =>
    Object.hasOwn(p, "source_project_id") ? p.source_project_id : p.project_id;
  const enabledSteps = (p) =>
    Object.keys(routeLabels).filter(
      (id) =>
        !(presentation.projects[p.project_id]?.disabled_steps || []).includes(
          id,
        ),
    );
  const completedSteps = (p) =>
    enabledSteps(p).filter((id) => workflow(p)[id]?.status === "COMPLETED");

  function toast(text) {
    document.querySelector(".co-toast")?.remove();
    const t = node("div", text, "co-toast");
    t.role = "status";
    document.body.append(t);
    setTimeout(() => t.remove(), 5500);
  }
  async function json(url, options = {}) {
    const r = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
      ...options,
    });
    if (!r.ok)
      throw Error(
        r.status === 409
          ? "進度剛剛有更新，請重新確認後再操作。"
          : r.status === 415
            ? "封面格式不符，請選擇 JPG、PNG 或 WEBP 圖片。"
            : r.status === 413
              ? "封面超過 5 MB，請縮小後再試。"
              : "儲存或讀取失敗，請稍後再試。",
      );
    return r.json();
  }
  function save(path, value, form = false) {
    mutationQueue = mutationQueue.then(() => performSave(path, value, form));
    return mutationQueue;
  }
  async function performSave(path, value, form = false) {
    mutationPending = true;
    try {
      presentation = await json("/api/creator/" + path, {
        method: "POST",
        ...(form
          ? { body: value }
          : {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(value),
            }),
      });
      if (["projects", "project-source"].includes(path))
        presentation = await json("/api/creator/presentation");
      storeReady = true;
      signature = "";
      render();
      return true;
    } catch (e) {
      toast(e.message);
      return false;
    } finally {
      mutationPending = false;
    }
  }
  function technical(payload) {
    const d = node("details");
    d.append(
      node("summary", "技術資訊"),
      node("pre", JSON.stringify(payload, null, 2)),
    );
    return d;
  }
  function modal(title) {
    dialog?.remove();
    dialog = node("dialog", undefined, "co-dialog");
    dialog.setAttribute("aria-label", title);
    dialog.append(
      node("h2", title),
      button("✕", () => dialog.close(), "co-button quiet co-close"),
    );
    dialog.querySelector("button").setAttribute("aria-label", "關閉");
    dialog.addEventListener("close", () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
    return dialog;
  }
  function sourceProjects() {
    return (response.projection || lastGood)?.projects || [];
  }
  function allProjects() {
    const sources = sourceProjects();
    return [
      ...sources,
      ...Object.values(presentation.local_projects || {}),
    ].map((card) => {
      const meta = presentation.projects[card.project_id] || {};
      const sid = Object.hasOwn(meta, "source_project_id")
        ? meta.source_project_id
        : sources.some((p) => p.project_id === card.project_id)
          ? card.project_id
          : null;
      const source = sources.find((p) => p.project_id === sid);
      const empty = {
        classification: card.classification,
        project_type: card.project_type,
        timeline: [],
        workflow: [],
      };
      return {
        ...(source || empty),
        project_id: card.project_id,
        project_name: card.project_name,
        source_project_id: sid,
        source_name: source?.project_name || "",
      };
    });
  }
  function primary() {
    return allProjects().filter(
      (p) =>
        p.classification === "REGISTERED" &&
        ["YOUTUBE", "VIDEO_PROJECT"].includes(p.project_type) &&
        !presentation.projects[p.project_id]?.hidden,
    );
  }
  function rowKnown(row, p) {
    return (
      validTime(row.updated_at) &&
      !!(
        row.ledger_entry_id ||
        (row.evidence_provenance?.verified === true &&
          row.evidence_provenance.canonical_project_id === sourceId(p))
      )
    );
  }
  function displayStatus(p, row, events = eventStatuses) {
    const evidence = events[row.ledger_entry_id];
    return evidence?.project_id === sourceId(p) &&
      epoch(evidence.timestamp) === epoch(row.updated_at) &&
      evidence.status === "FAILED"
      ? "FAILED"
      : row.status;
  }
  function timeline(p) {
    return window.RenguinSemantics.view(p)
      .timeline.filter((row) => rowKnown(row, p) && row.status !== "UNKNOWN")
      .map((row) => ({ ...row, status: displayStatus(p, row) }));
  }
  function lastState(p) {
    const rows = timeline(p);
    const configured = rows.find(
      (r) =>
        r.id === p.current_stage_id &&
        (r.status === p.current_status ||
          (r.status === "FAILED" && p.current_status === "BLOCKED")),
    );
    return (
      configured ||
      [...rows].sort((a, b) => epoch(b.updated_at) - epoch(a.updated_at))[0]
    );
  }
  function lastStamp(p) {
    return (
      [
        ...timeline(p).map((r) => r.updated_at),
        p.source_ledger_entry_id ? p.updated_at : null,
      ]
        .filter(validTime)
        .sort((a, b) => epoch(b) - epoch(a))[0] || null
    );
  }
  function manual(p) {
    return presentation.projects[p.project_id]?.manual_done;
  }
  function canonicalDone(p) {
    return timeline(p).some(
      (r) => ["PUBLISH", "ARCHIVE"].includes(r.id) && r.status === "DONE",
    );
  }
  function projectDone(p) {
    return (
      manual(p)?.done === true ||
      completedSteps(p).length === enabledSteps(p).length
    );
  }
  function stampDone(p) {
    return manual(p)?.done
      ? manual(p).timestamp
      : workflow(p)[enabledSteps(p).at(-1)]?.completed_at ||
          timeline(p)
            .filter(
              (r) =>
                ["PUBLISH", "ARCHIVE"].includes(r.id) && r.status === "DONE",
            )
            .sort((a, b) => epoch(b.updated_at) - epoch(a.updated_at))[0]
            ?.updated_at;
  }
  function historical(p) {
    return !window.RenguinFreshness.project(response, p).fresh;
  }
  function rowText(row) {
    return (
      (labels[row.id] || clean(row.label, "其他階段")) +
      " · " +
      (states[row.status] || "已記錄")
    );
  }
  function isHuman(p) {
    const s = lastState(p);
    return (
      !!s &&
      s.status !== "DONE" &&
      (s.status === "REVIEW" ||
        (s.id === "GATE" && ["TODO", "ACTIVE", "BLOCKED"].includes(s.status)) ||
        (p.owner === "YOU" &&
          ["TODO", "ACTIVE", "BLOCKED"].includes(s.status)) ||
        s.status === "BLOCKED")
    );
  }
  function hasRunning(pid) {
    return (window.RenguinOperations?.current.jobs || []).some(
      (j) =>
        j.project_id === pid &&
        window.RenguinOperations.effective(j) === "RUNNING",
    );
  }

  function memberView(key) {
    const board = window.RenguinOperations?.current || {};
    const combinedObservations = [
      ...(board.native_coverage?.observations || []),
      ...(browserStatus.observations || []),
    ];
    const contexts = window.CreatorContexts.collect({
      jobs: board.jobs || [],
      observations: combinedObservations,
      projects: sourceProjects(),
      preferences: presentation.projects,
      effective: window.RenguinOperations.effective,
    }).filter((context) => context.agent === key);
    const jobs = (board.jobs || []).filter((j) => j.agent === key);
    const running = jobs.find(
      (j) => window.RenguinOperations.effective(j) === "RUNNING",
    );
    const waiting = jobs.find((j) =>
      ["WAITING_USER", "WAITING_AGENT", "STARTING", "BLOCKED"].includes(
        window.RenguinOperations.effective(j),
      ),
    );
    const observations = combinedObservations.filter((o) => o.agent === key);
    const nativeWorking = observations
      .filter(
        (o) =>
          o.visual_activity?.state === "WORKING" &&
          validTime(o.visual_activity.timestamp) &&
          Date.now() / 1000 - epoch(o.visual_activity.timestamp) <
            o.visual_activity.expires_after_seconds,
      )
      .sort(
        (a, b) =>
          epoch(b.visual_activity.timestamp) -
          epoch(a.visual_activity.timestamp),
      )[0];
    const times = [
      ...jobs.flatMap((j) => [j.finished_at, j.last_heartbeat]),
      ...observations.flatMap((o) => [
        o.last_work_event?.timestamp,
        o.last_native_event?.timestamp,
        o.last_native_event?.updated_timestamp,
      ]),
    ]
      .filter(validTime)
      .sort((a, b) => epoch(b) - epoch(a));
    const stamp = times[0];
    const current = running || waiting;
    const project =
      current &&
      (allProjects().find((p) => p.project_id === current.project_id)
        ?.project_name ||
        current.project_name);
    let text = running
      ? "● " + (project ? "正在處理 " + clean(project, "目前工作") : "正在工作")
      : nativeWorking
        ? "● " + nativeWorking.visual_activity.action
        : waiting
          ? {
              WAITING_USER: "◐ 等待你處理",
              WAITING_AGENT: "◐ 等待協作",
              STARTING: "◐ 正在啟動",
              BLOCKED: "◐ 等待處理",
            }[window.RenguinOperations.effective(waiting)]
          : stamp
            ? "○ 最近活動 " +
              new Date(epoch(stamp) * 1000).toLocaleTimeString("zh-TW", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })
            : "○ 尚無同步紀錄";
    const latestTerminal = jobs
      .filter((j) =>
        ["COMPLETED", "FAILED"].includes(window.RenguinOperations.effective(j)),
      )
      .sort((a, b) => b.finished_at - a.finished_at)[0];
    const lastObservation = [...observations].sort(
      (a, b) =>
        epoch(
          b.last_work_event?.timestamp ||
            b.last_native_event?.timestamp ||
            b.last_native_event?.updated_timestamp,
        ) -
        epoch(
          a.last_work_event?.timestamp ||
            a.last_native_event?.timestamp ||
            a.last_native_event?.updated_timestamp,
        ),
    )[0];
    const recentAction =
      lastObservation?.last_work_event?.action ||
      {
        task_complete: "工作已完成",
        task_failed: "工作未完成",
        task_started: "開始工作",
        forkPoint: "建立工作分支",
        error: "工作遇到問題",
      }[lastObservation?.last_native_event?.type] ||
      "更新工作紀錄";
    const summary =
      nativeWorking && !current
        ? nativeWorking.source === "CHATGPT_BROWSER_UI"
          ? "Chrome · " + nativeWorking.browser_context.name
          : "工作更新來自 " +
            (key === "ASTRA" ? "ASTRA" : "Codex") +
            " · 剛收到操作紀錄"
        : current
          ? clean(current.task, project ? "處理 " + project : "工作進行中")
          : latestTerminal && epoch(latestTerminal.finished_at) >= epoch(stamp)
            ? latestTerminal.effective_status === "FAILED"
              ? "上次工作未完成"
              : "上次工作已完成"
            : stamp
              ? "最近紀錄 · " + recentAction.replace("正在", "")
              : "尚未收到工作紀錄";
    return {
      key,
      text,
      stamp,
      summary,
      contexts,
      sourceLabel:
        lastObservation?.source === "CHATGPT_BROWSER_UI"
          ? "Chrome · ChatGPT"
          : key === "CHATGPT_WORK"
            ? "Codex 工作紀錄"
            : agents[key][0] + " 工作紀錄",
      running: !!running || !!nativeWorking,
      nativeWorking: !!nativeWorking,
      diagnostic: {
        jobs,
        observations,
        coverage_complete: board.coverage_complete,
      },
    };
  }
  function renderMembers() {
    if (!membersRoot) return;
    const views = Object.keys(agents).map(memberView);
    const hash = JSON.stringify(
      views.map((v) => [
        v.key,
        v.text,
        v.stamp,
        v.summary,
        v.contexts,
        browserStatus.connected,
      ]),
    );
    if (hash !== memberSignature) {
      memberSignature = hash;
      membersRoot.replaceChildren();
      for (const v of views) {
        const card = button(
          "",
          () => {
            selectedAgent = v.key;
            renderMemberSelection();
            const d = modal(agents[v.key][0]);
            d.append(
              node("p", v.text),
              node("p", v.summary),
              node("p", date(v.stamp) + " · " + v.sourceLabel, "co-muted"),
              technical(v.diagnostic),
            );
            if (v.key === "CHATGPT_WORK") browserConnection(d);
          },
          "co-member" + (v.running ? " is-running" : ""),
        );
        card.dataset.agent = v.key;
        card.append(
          node("h3", agents[v.key][0]),
          node("strong", v.text),
          node("p", v.summary),
          node("p", date(v.stamp), "co-muted"),
        );
        if (v.contexts.length) card.append(contextFrames(v.contexts));
        if (v.key === "CHATGPT_WORK")
          card.append(
            node(
              "p",
              browserStatus.connected
                ? "Chrome · ChatGPT 已連線"
                : "ChatGPT 網頁尚未連線",
              "co-muted co-browser-status",
            ),
          );
        membersRoot.append(card);
      }
      renderMemberSelection();
    }
    syncMap();
  }
  function contextFrames(contexts, compact = false) {
    const list = node(
      "span",
      undefined,
      "co-work-contexts" + (compact ? " is-compact" : ""),
    );
    for (const context of contexts) {
      const frame = node("span", undefined, "co-work-context");
      frame.dataset.kind = context.kind;
      frame.title =
        (context.kind === "REPO" ? "REPO · " : "") +
        context.name +
        " · " +
        context.action;
      frame.append(
        node(
          "small",
          context.kind === "REPO"
            ? "REPO"
            : context.kind === "PROJECT"
              ? "企劃"
              : "工作",
        ),
        node("span", context.name, "co-context-name"),
      );
      list.append(frame);
    }
    return list;
  }
  function renderMemberSelection() {
    membersRoot
      ?.querySelectorAll("[data-agent]")
      .forEach((e) =>
        e.classList.toggle("is-selected", e.dataset.agent === selectedAgent),
      );
  }
  function syncMap() {
    const layer = document.getElementById("renguin-office-layer");
    if (layer && !document.getElementById("renguin-scene-astra")) {
      const avatar = node(
        "div",
        undefined,
        "renguin-scene-character is-waiting",
      );
      avatar.id = "renguin-scene-astra";
      avatar.style.left = "80%";
      avatar.style.top = "74%";
      const img = node("img");
      img.src = "/static/renguin-characters/astra/eric.png";
      img.alt = "ASTRA";
      avatar.append(img, node("div", "", "rsc-label"));
      layer.append(avatar);
    }
    const mapping = {
      renguin: "CHATGPT_WORK",
      xuebao: "BIONIC",
      dola: "CLAUDE",
      astra: "ASTRA",
    };
    for (const [role, key] of Object.entries(mapping)) {
      const el = document.getElementById("renguin-scene-" + role);
      if (!el) continue;
      const v = memberView(key);
      const label = el.querySelector(".rsc-label");
      if (label) label.title = v.text;
      window.CreatorScene?.sync(el, key, v, agents[key][0]);
      const contextHash = JSON.stringify(v.contexts);
      if (el.dataset.contextHash !== contextHash) {
        el.dataset.contextHash = contextHash;
        el.querySelector(".co-work-contexts")?.remove();
        if (v.contexts.length) el.append(contextFrames(v.contexts, true));
      }
      el.classList.toggle("is-working", v.running);
      el.classList.toggle("is-waiting", !v.running);
      if (!el.dataset.creatorBound) {
        el.dataset.creatorBound = "true";
        el.setAttribute("role", "button");
        el.tabIndex = 0;
        el.style.pointerEvents = "auto";
        el.style.cursor = "pointer";
        el.setAttribute("aria-label", "查看 " + agents[key][0] + " 辦公室成員");
        const select = () => {
          selectedAgent = key;
          renderMemberSelection();
          membersRoot.querySelector(`[data-agent="${key}"]`)?.focus();
          membersRoot.scrollIntoView({ behavior: "smooth", block: "center" });
        };
        el.addEventListener("click", select);
        el.addEventListener("keydown", (e) => {
          if (["Enter", " "].includes(e.key)) {
            e.preventDefault();
            select();
          }
        });
      }
    }
  }
  function openProject(p) {
    const card = [...root.querySelectorAll(".co-project")].find(
      (e) => e.dataset.projectId === p.project_id,
    );
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "start" });
      card.tabIndex = -1;
      card.focus({ preventScroll: true });
    } else showDetails(p);
  }
  function showDetails(p) {
    const d = modal(projectName(p));
    const s = lastState(p);
    d.append(
      node("p", s ? rowText(s) : "尚無同步紀錄"),
      node("p", "最後更新 " + date(lastStamp(p)), "co-muted"),
      button("完整時間軸", () => showTimeline(p)),
    );
    if (p.classification === "REGISTERED") {
      const actions = node("div", undefined, "co-actions");
      actions.append(
        button(
          manual(p)?.done ? "取消完成" : "✓ 做好了",
          () => confirmDone(p),
          "co-button primary",
        ),
        button(
          presentation.projects[p.project_id]?.cover
            ? "更換封面"
            : "＋ 上傳封面",
          () => coverUpload(p),
        ),
      );
      if (presentation.projects[p.project_id]?.cover)
        actions.append(
          button("移除封面", async () => {
            if (await save("cover/remove", { project_id: p.project_id })) {
              d.close();
              showDetails(p);
            }
          }),
        );
      d.append(actions);
    }
    if (p.release_date) d.append(node("p", "預計上映 · " + p.release_date));
    d.append(button("移除專案", () => confirmRemove(p), "co-button danger"));
  }
  async function showTimeline(p, stageId) {
    const d = modal(
      stageId
        ? (labels[stageId] || "階段紀錄") + " · " + projectName(p)
        : "完整時間軸 · " + projectName(p),
    );
    const list = node("ol", undefined, "co-full-timeline");
    d.append(list);
    const original = timeline(p).filter(
      (r) =>
        !stageId || r.id === stageId || (stageId === "INDEX" && r.id === "RAW"),
    );
    let extra = [];
    const draw = () => {
      list.replaceChildren();
      const rows = [...original, ...extra];
      const seen = new Set();
      const valid = rows
        .filter((r) => {
          const key =
            r.ledger_entry_id || r.event_id || r.id + "|" + r.updated_at;
          if (seen.has(key) || !validTime(r.updated_at)) return false;
          seen.add(key);
          return true;
        })
        .sort((a, b) => epoch(b.updated_at) - epoch(a.updated_at));
      for (const r of valid) {
        const li = node("li");
        li.append(
          node("time", date(r.updated_at)),
          node("p", rowText(r)),
          node("small", "製作紀錄"),
        );
        list.append(li);
      }
      if (!valid.length) list.append(node("li", "尚無同步紀錄"));
    };
    draw();
    if (historical(p))
      d.append(
        node(
          "p",
          "資料已超過即時同步期限，已確認的歷史紀錄仍保留。",
          "co-muted",
        ),
      );
    const manualHistory = presentation.projects[p.project_id]?.history || [];
    if (!stageId)
      for (const entry of manualHistory)
        d.append(
          node(
            "p",
            (entry.text || (entry.done ? "✓ 你已標記完成" : "取消手動完成")) +
              " · " +
              date(entry.timestamp),
            "co-muted",
          ),
        );
    d.append(button("查看詳情", () => showDetails(p), "co-button quiet"));
    if (!sourceId(p)) return;
    try {
      const data = await json(
        "/api/creator/history?project_id=" +
          encodeURIComponent(sourceId(p) || ""),
      );
      extra = data.events
        .filter(
          (e) =>
            !stageId ||
            e.stage_id === stageId ||
            (stageId === "INDEX" && e.stage_id === "RAW"),
        )
        .map((e) => ({
          id: e.stage_id,
          label: e.stage_id,
          status:
            {
              COMPLETED: "DONE",
              VERIFIED: "DONE",
              RUNNING: "ACTIVE",
              WAITING_INPUT: "REVIEW",
            }[e.new_status] || e.new_status,
          updated_at: e.timestamp,
          ledger_entry_id: e.ledger_entry_id,
          event_id: e.event_id,
          source: "Content OS",
        }));
      draw();
    } catch {
      d.append(
        node("p", "完整歷史暫時無法連接；以上保留已驗證的紀錄。", "co-muted"),
      );
    }
  }
  function confirmDone(p) {
    const previous = manual(p)?.done === true;
    const d = modal(previous ? "取消完成" : "將此企劃標記為你已完成？");
    d.append(
      node("p", projectName(p)),
      node(
        "p",
        previous
          ? canonicalDone(p)
            ? "取消你的標記後，仍保留已發布或歸檔的製作紀錄。"
            : "企劃會回到正在製作。"
          : "這是你的完成標記，會保留時間與原有製作紀錄。",
      ),
    );
    d.append(
      button(
        previous ? "取消完成" : "✓ 標記完成",
        async () => {
          if (
            await save("done", { project_id: p.project_id, done: !previous })
          ) {
            d.close();
            toast(previous ? "已取消完成" : "已放入最近完成");
          }
        },
        "co-button primary",
      ),
    );
  }
  function coverUpload(p) {
    const input = node("input");
    input.type = "file";
    input.accept = ".jpg,.jpeg,.png,.webp";
    input.hidden = true;
    root.append(input);
    input.addEventListener(
      "change",
      async () => {
        const file = input.files[0];
        if (file) {
          const form = new FormData();
          form.append("project_id", p.project_id);
          form.append("cover", file);
          if (await save("cover", form, true)) toast("封面已儲存");
        }
        input.remove();
      },
      { once: true },
    );
    input.click();
  }
  async function toggleStep(p, id) {
    if (mutationPending || !storeReady) return;
    const ids = enabledSteps(p),
      index = ids.indexOf(id);
    const completed = completedSteps(p);
    const turningOn = !completed.includes(id);
    const downstream = completed.filter((s) => ids.indexOf(s) > index);
    const execute = async (confirmed = false) => {
      const ok = await save("workflow", {
        project_id: p.project_id,
        step_id: id,
        completed: turningOn,
        cascade_confirmed: confirmed,
        revision: presentation.revision,
      });
      if (ok) {
        const feedback = [...root.querySelectorAll(".co-project")]
          .find((e) => e.dataset.projectId === p.project_id)
          ?.querySelector(".co-save-status");
        if (feedback) feedback.textContent = "✓ 進度已儲存";
      } else await poll();
      return ok;
    };
    if (!turningOn && downstream.length) {
      const d = modal("取消「" + routeLabels[id] + "」？");
      d.append(
        node(
          "p",
          "將同時取消後續已完成的階段：" +
            downstream.map((s) => routeLabels[s]).join("、") +
            "。",
        ),
        node("p", "工作紀錄會保留，你隨時可以重新標記完成。", "co-muted"),
      );
      const actions = node("div", undefined, "co-actions");
      actions.append(
        button("保留進度", () => d.close()),
        button(
          "確認取消階段",
          async () => {
            if (await execute(true)) d.close();
          },
          "co-button danger",
        ),
      );
      d.append(actions);
    } else await execute();
  }
  function confirmRemove(p) {
    const d = modal("移除「" + projectName(p) + "」？");
    d.append(
      node(
        "p",
        "只會從 RENGUIN OFFICE 移除。不會刪除影片素材、Premiere 專案、Content OS 資料或硬碟檔案。",
      ),
      node("p", "需要時可從「已移除的專案」恢復。", "co-muted"),
    );
    const actions = node("div", undefined, "co-actions");
    actions.append(
      button("取消", () => d.close()),
      button(
        "移除專案",
        async () => {
          if (
            await save("project", {
              project_id: p.project_id,
              hidden: true,
              confirmed: true,
            })
          ) {
            d.close();
            toast("專案已移除，可從頁面下方恢復。");
          }
        },
        "co-button danger",
      ),
    );
    d.append(actions);
  }
  function renameProject(p, heading) {
    editingName = true;
    const form = node("form", undefined, "co-rename");
    const input = node("input");
    input.value = projectName(p);
    input.maxLength = 120;
    input.required = true;
    input.setAttribute("aria-label", "專案名稱");
    const feedback = node("span", "Enter 儲存 · Esc 取消", "co-save-status");
    feedback.role = "status";
    const cancel = () => {
      editingName = false;
      signature = "";
      render();
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    });
    const submit = node("button", "儲存", "co-button primary");
    submit.type = "submit";
    form.append(
      input,
      submit,
      button("取消", cancel, "co-button quiet"),
      feedback,
    );
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (submit.disabled || !input.value.trim()) return;
      submit.disabled = true;
      input.disabled = true;
      feedback.textContent = "正在儲存…";
      if (
        await save("project", {
          project_id: p.project_id,
          display_name: input.value.trim(),
        })
      ) {
        cancel();
        const card = [...root.querySelectorAll(".co-project")].find(
          (e) => e.dataset.projectId === p.project_id,
        );
        if (card)
          card.querySelector(".co-save-status").textContent = "✓ 名稱已儲存";
      } else {
        submit.disabled = false;
        input.disabled = false;
        feedback.textContent = "未儲存，請再試一次。";
      }
    });
    heading.replaceChildren(form);
    input.focus();
    input.select();
  }
  function recentRecords(p) {
    const saved = (presentation.projects[p.project_id]?.history || []).map(
      (e) => ({
        timestamp: e.timestamp,
        text: e.text || (e.done ? "你將專案標記完成" : "你取消專案完成標記"),
        source: e.source === "INFERENCE" ? "系統自動補齊" : "你手動更新",
      }),
    );
    const source = timeline(p).map((r) => ({
      timestamp: r.updated_at,
      text: rowText(r),
      source: "製作紀錄",
    }));
    return [...saved, ...source]
      .filter((e) => validTime(e.timestamp) && !e.text.includes("素材 → 素材"))
      .sort((a, b) => epoch(b.timestamp) - epoch(a.timestamp))
      .slice(0, 4);
  }
  function projectCard(p) {
    const card = node("article", undefined, "co-project");
    card.dataset.projectId = p.project_id;
    const cover = node("div", undefined, "co-cover");
    const coverState = presentation.projects[p.project_id]?.cover;
    if (coverState?.url) {
      const img = node("img");
      img.src = coverState.url;
      img.alt = projectName(p) + " 封面";
      img.loading = "lazy";
      cover.append(img);
    } else {
      const placeholder = node("div", undefined, "co-cover-placeholder");
      placeholder.append(
        node("span", "▧", "co-cover-icon"),
        node("span", "把故事放在這裡"),
        node("small", "16 : 9 · 企劃封面"),
      );
      cover.append(placeholder);
    }
    const coverActions = node("div", undefined, "co-cover-actions");
    const upload = button(coverState ? "更換封面" : "＋ 上傳封面", () =>
      coverUpload(p),
    );
    upload.disabled = !storeReady;
    coverActions.append(upload);
    if (coverState)
      coverActions.append(
        button(
          "移除封面",
          async () => {
            if (await save("cover/remove", { project_id: p.project_id }))
              toast("已移除封面");
          },
          "co-button quiet",
        ),
      );
    card.append(projectHouse(p, cover));
    const body = node("div", undefined, "co-project-body");
    const heading = node("div", undefined, "co-project-heading");
    const rename = button(
      "✎",
      () => renameProject(p, heading),
      "co-button quiet co-rename-trigger",
    );
    rename.setAttribute("aria-label", "修改專案名稱");
    rename.title = "修改專案名稱";
    rename.disabled = !storeReady;
    heading.append(node("h3", projectName(p)), rename);
    body.append(
      heading,
      coverActions,
      node(
        "p",
        "對應企劃 · " + (p.source_name || "尚未指定"),
        "co-source-name",
      ),
    );
    const completed = completedSteps(p);
    const next = enabledSteps(p).find((id) => !completed.includes(id));
    const statusBlock = node("div", undefined, "co-progress");
    statusBlock.append(
      node(
        "p",
        completed.length
          ? `已完成 ${completed.length} / ${enabledSteps(p).length} 階段`
          : "尚未開始",
        "co-state",
      ),
      node(
        "p",
        next ? "下一步 · " + routeLabels[next] : "所有階段已完成",
        "co-next",
      ),
    );
    const meter = node("div", undefined, "co-progress-track");
    const fill = node("span");
    fill.style.width = (completed.length / enabledSteps(p).length) * 100 + "%";
    meter.append(fill);
    statusBlock.append(meter);
    body.append(statusBlock);
    const route = node("nav", undefined, "co-route");
    route.setAttribute("aria-label", projectName(p) + " 製作流程");
    const rows = timeline(p);
    enabledSteps(p)
      .map((id) => [id, routeLabels[id]])
      .forEach(([id, label], i) => {
        const row =
          rows.find((r) => r.id === id) ||
          (id === "INDEX" ? rows.find((r) => r.id === "RAW") : null);
        const status = completed.includes(id) ? "DONE" : "TODO";
        const kind =
          status === "DONE"
            ? "done"
            : ["ACTIVE", "RUNNING"].includes(status) &&
                !historical(p) &&
                !row.historical
              ? "active"
              : ["REVIEW", "BLOCKED"].includes(status)
                ? "human"
                : status === "FAILED"
                  ? "failed"
                  : "todo";
        const b = button(
          (kind === "done" ? "✓ " : "○ ") + label,
          () => toggleStep(p, id),
          "is-" + kind,
        );
        b.dataset.stage = id;
        b.dataset.status = status;
        b.title =
          label +
          "：" +
          (states[status] || "已記錄") +
          (row && historical(p) ? "（上次同步）" : "");
        b.setAttribute("aria-label", b.title);
        b.setAttribute("aria-pressed", String(kind === "done"));
        b.disabled = !storeReady;
        b.title =
          label + (kind === "done" ? "：點擊取消完成" : "：點擊標記完成");
        route.append(b);
      });
    body.append(route);
    const feedback = node(
      "p",
      "點選階段即可更新；完成後段會自動補齊前面。",
      "co-save-status",
    );
    feedback.role = "status";
    body.append(feedback);
    if (manual(p)?.done)
      body.append(
        node("p", "✓ 你已標記完成 · " + date(manual(p).timestamp), "co-state"),
      );
    const milestones = node("ul", undefined, "co-milestones");
    const recent = recentRecords(p);
    if (recent.length) body.append(node("h4", "最近紀錄", "co-recent-heading"));
    for (const row of recent) {
      const li = node("li");
      li.append(
        node("time", date(row.timestamp)),
        node("span", row.text),
        node("small", row.source),
      );
      milestones.append(li);
    }
    if (recent.length) body.append(milestones);
    const actions = node("div", undefined, "co-actions");
    const done = button(
      manual(p)?.done ? "取消完成" : "✓ 做好了",
      () => confirmDone(p),
      "co-button primary",
    );
    done.disabled = !storeReady;
    actions.append(
      done,
      button("對應企劃", () => projectSource(p), "co-button quiet"),
      button("設定階段", () => stageSettings(p), "co-button quiet"),
      button("完整時間軸", () => showTimeline(p), "co-button quiet"),
      button("查看詳情", () => showDetails(p), "co-button quiet"),
      button("移除專案", () => confirmRemove(p), "co-button danger"),
    );
    body.append(actions);
    card.append(body);
    return card;
  }
  function projectSource(p) {
    const d = modal(p ? "對應企劃" : "新增專案");
    const name = node("input");
    name.maxLength = 120;
    name.placeholder = "專案名稱";
    name.setAttribute("aria-label", "專案名稱");
    if (!p) d.append(name);
    const select = node("select");
    select.setAttribute("aria-label", "對應企劃");
    const none = node("option", "尚未指定企劃");
    none.value = "";
    select.append(none);
    for (const source of sourceProjects().filter(
      (s) =>
        s.classification === "REGISTERED" &&
        ["YOUTUBE", "VIDEO_PROJECT"].includes(s.project_type),
    )) {
      const option = node("option", source.project_name);
      option.value = source.project_id;
      select.append(option);
    }
    select.value = p ? sourceId(p) || "" : "";
    d.append(
      select,
      node(
        "p",
        "選擇後會顯示該企劃的進度與來源紀錄。更換對應時，各企劃的進度分別保留；專案名稱與封面會保留。",
      ),
      button(
        "儲存",
        async () => {
          if (!p && !name.value.trim()) {
            name.focus();
            return;
          }
          if (
            await save(p ? "project-source" : "projects", {
              ...(p
                ? { project_id: p.project_id, revision: presentation.revision }
                : { display_name: name.value.trim() }),
              source_project_id: select.value || null,
            })
          ) {
            d.close();
            toast(p ? "已更新對應企劃" : "已新增專案");
          }
        },
        "co-button primary",
      ),
    );
  }
  function stageSettings(p) {
    const d = modal("設定階段");
    d.append(
      node(
        "p",
        "勾選此專案需要的階段。取消的階段會從流程移除，歷史紀錄仍會保留，也能再加回來。至少保留一個階段。",
      ),
    );
    const fields = [];
    const list = node("div", undefined, "co-stage-settings");
    for (const [id, title] of Object.entries(routeLabels)) {
      const label = node("label");
      const input = node("input");
      input.type = "checkbox";
      input.checked = enabledSteps(p).includes(id);
      input.value = id;
      label.append(input, node("span", title));
      list.append(label);
      fields.push(input);
    }
    d.append(
      list,
      button(
        "儲存階段",
        async () => {
          if (!fields.some((e) => e.checked)) {
            toast("請至少保留一個階段");
            return;
          }
          if (
            await save("workflow-settings", {
              project_id: p.project_id,
              revision: presentation.revision,
              disabled_steps: fields
                .filter((e) => !e.checked)
                .map((e) => e.value),
            })
          ) {
            d.close();
            toast("製作階段已更新");
          }
        },
        "co-button primary",
      ),
    );
  }
  function browserConnection(d) {
    d.append(
      node("h3", "連接 Chrome 裡的 ChatGPT"),
      node(
        "p",
        "只傳送回覆狀態、頁面標題與時間到這台電腦。頁面標題會顯示在企劃工作框，不讀取對話文字。",
      ),
    );
    const download = node("a", "下載本機連線工具", "co-button");
    download.href = "/api/creator/browser-bridge/download";
    download.download = "renguin-chatgpt-bridge.zip";
    d.append(
      download,
      node(
        "p",
        "解壓縮後，在 Chrome 的擴充功能頁面開啟開發人員模式，選擇「載入未封裝項目」。安裝後重新整理 Chrome 裡的 Star Office，再按下方連接；ChatGPT 對話不需要重新整理。",
        "co-muted",
      ),
    );
    d.append(
      button("連接 ChatGPT 網頁", async () => {
        const id = crypto.randomUUID();
        let listener;
        const pairing = new Promise((resolve) => {
          const timer = setTimeout(() => {
            window.removeEventListener("message", listener);
            resolve(false);
          }, 8000);
          listener = (event) => {
            if (
              event.source !== window ||
              event.origin !== location.origin ||
              event.data?.type !== "RENGUIN_PAIR_RESULT" ||
              event.data.request_id !== id
            )
              return;
            clearTimeout(timer);
            window.removeEventListener("message", listener);
            resolve(event.data.paired === true);
          };
          window.addEventListener("message", listener);
        });
        try {
          const value = await json("/api/creator/browser-bridge/pair", {
            method: "POST",
          });
          window.postMessage(
            { type: "RENGUIN_PAIR", token: value.token, request_id: id },
            location.origin,
          );
          if (await pairing) {
            toast("ChatGPT 連線工具已配對，等待網頁回報");
            poll();
          } else toast("尚未找到連線工具，請在 Chrome 安裝後重新整理本頁。");
        } catch {
          toast("連線未完成，請稍後再試。");
        }
      }),
    );
    if (browserStatus.paired)
      d.append(
        button(
          "中斷 ChatGPT 連線",
          async () => {
            try {
              await json("/api/creator/browser-bridge/disconnect", {
                method: "POST",
              });
              browserStatus = { connected: false, observations: [] };
              memberSignature = "";
              renderMembers();
              d.close();
              toast("已中斷 ChatGPT 網頁連線");
            } catch {
              toast("未能中斷連線，請稍後再試。");
            }
          },
          "co-button quiet",
        ),
      );
  }
  function projectHouse(p, cover) {
    const house = node("div", undefined, "co-house");
    const frame = node("div", undefined, "co-house-framebox");
    frame.append(cover);
    house.append(frame);
    if (!window.CreatorResidents?.length) return house;
    let hash = 2166136261;
    for (const char of p.project_id)
      hash = Math.imul(hash ^ char.codePointAt(0), 16777619) >>> 0;
    const character = window.CreatorResidents.find(
      (c) => c.name === presentation.projects[p.project_id]?.resident_character,
    );
    if (!character) return house;
    const track = node("div", undefined, "co-resident-track");
    track.setAttribute("aria-hidden", "true");
    const resident = node(
      "div",
      undefined,
      "co-resident" + (character.fixed ? " is-perched" : ""),
    );
    resident.dataset.character = character.name;
    resident.dataset.motion = character.fixed ? "fixed" : "roaming";
    const [x, y, w, h] = character.bounds;
    resident.style.aspectRatio = `${w} / ${h}`;
    resident.style.setProperty("--stroll-duration", `${24 + (hash % 17)}s`);
    resident.style.setProperty("--stroll-delay", `${-(hash % 19)}s`);
    const facing = node("div", undefined, "co-resident-facing");
    const sprite = node("div", undefined, "co-resident-sprite");
    const img = node("img");
    img.src = "/static/renguin-characters/residents/" + character.file;
    img.alt = "";
    img.loading = "lazy";
    img.draggable = false;
    img.style.cssText = `width:${(character.size[0] / w) * 100}%;height:${(character.size[1] / h) * 100}%;left:${(-x / w) * 100}%;top:${(-y / h) * 100}%`;
    sprite.append(img);
    facing.append(sprite);
    resident.append(facing);
    track.append(resident);
    house.append(track);
    return house;
  }
  function suggestions() {
    const items = [];
    for (const p of primary()) {
      if (projectDone(p) || !isHuman(p)) continue;
      const stage = lastState(p);
      const id =
        "ai:" +
        p.project_id +
        ":" +
        stage.id +
        ":" +
        (stage.ledger_entry_id || stage.event_id || "evidence");
      items.push({
        id,
        title: clean(
          p.next_action,
          (labels[stage.id] || stage.label) + "待確認",
        ),
        project_id: p.project_id,
        notes: historical(p)
          ? "上次同步的待處理事項，請確認目前是否仍需要。"
          : "",
        provenance: "製作流程建議",
        state: "today",
        source_at: stage.updated_at,
      });
    }
    return items;
  }
  function mergedInbox() {
    const data = new Map(
      suggestions().map((i) => [
        i.id,
        { ...i, ...presentation.inbox[i.id], provenance: i.provenance },
      ]),
    );
    for (const [id, item] of Object.entries(presentation.inbox))
      if (!data.has(id)) data.set(id, item);
    const rank = new Map(presentation.order.map((id, i) => [id, i]));
    return [...data.values()].sort(
      (a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9),
    );
  }
  function editInbox(item = {}) {
    const d = modal(item.id ? "編輯待辦" : "新增待辦");
    const form = node("form");
    const fields = {};
    for (const [key, label] of [
      ["title", "標題"],
      ["project_id", "關聯企劃"],
      ["notes", "備註"],
      ["date", "日期（選填）"],
      ["priority", "優先順序（選填）"],
    ]) {
      const wrap = node("label", label);
      let input;
      if (key === "project_id" || key === "priority") {
        input = node("select");
        const values =
          key === "project_id"
            ? [
                ["", "不指定企劃"],
                ...allProjects()
                  .filter(
                    (p) =>
                      p.classification === "REGISTERED" &&
                      !presentation.projects[p.project_id]?.hidden,
                  )
                  .map((p) => [p.project_id, projectName(p)]),
              ]
            : [
                ["", "一般"],
                ["high", "優先"],
                ["normal", "正常"],
                ["low", "有空再做"],
              ];
        for (const [v, l] of values) {
          const opt = node("option", l);
          opt.value = v;
          input.append(opt);
        }
      } else {
        input = node(key === "notes" ? "textarea" : "input");
        if (key === "date") input.type = "date";
      }
      input.name = key;
      input.setAttribute("aria-label", label);
      input.value = item[key] || "";
      if (key === "title") {
        input.required = true;
        input.maxLength = 240;
      }
      wrap.append(input);
      form.append(wrap);
      fields[key] = input;
    }
    const submit = node("button", "儲存待辦", "co-button primary");
    submit.type = "submit";
    form.append(submit);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      submit.disabled = true;
      const value = {
        id: item.id,
        ...Object.fromEntries(
          Object.entries(fields).map(([k, v]) => [k, v.value]),
        ),
      };
      if (await save("inbox", value)) {
        d.close();
        toast("待辦已儲存");
      }
      submit.disabled = false;
    });
    d.append(form);
  }
  async function updateInbox(item, patch) {
    return save("inbox", {
      id: item.id,
      title: item.title,
      project_id: item.project_id || "",
      notes: item.notes || "",
      ...patch,
    });
  }
  async function reorder(source, target) {
    if (!source || source === target) return;
    const ids = inboxItems.map((i) => i.id);
    const from = ids.indexOf(source),
      to = ids.indexOf(target);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, source);
    if (await save("order", { order: ids })) toast("待辦順序已儲存");
  }
  function renderInbox() {
    const nextItems = mergedInbox();
    const nextHash = JSON.stringify([nextItems, day(Date.now() / 1000)]);
    if (nextHash === inboxSignature) return;
    inboxSignature = nextHash;
    inboxItems = nextItems;
    inboxRoot.replaceChildren();
    const today = day(Date.now() / 1000);
    const groups = [
      ["today", "🔥 今天要做"],
      ["later", "⏳ 之後處理"],
      ["done", "✓ 今天完成"],
    ];
    for (const [state, label] of groups) {
      const group = node("section", undefined, "co-inbox-group");
      group.dataset.inboxGroup = state;
      group.append(node("h3", label));
      const items = inboxItems.filter((i) =>
        state === "done"
          ? i.state === "done" && day(i.completed_at) === today
          : state === "later"
            ? i.state === "later" || (i.state === "today" && i.date > today)
            : i.state === "today" && (!i.date || i.date <= today),
      );
      for (const item of items) {
        const row = node(
          "article",
          undefined,
          "co-inbox-item" + (state === "done" ? " is-done" : ""),
        );
        row.dataset.inboxId = item.id;
        row.draggable = true;
        row.addEventListener("dragstart", (e) => {
          if (e.target.closest("button") && !e.target.closest(".co-grip")) {
            e.preventDefault();
            return;
          }
          dragId = item.id;
          dragging = true;
          e.dataTransfer.setData("text/plain", item.id);
          row.classList.add("is-dragging");
        });
        row.addEventListener("dragend", () => {
          dragging = false;
          row.classList.remove("is-dragging");
        });
        row.addEventListener("dragover", (e) => e.preventDefault());
        row.addEventListener("drop", async (e) => {
          e.preventDefault();
          dragging = false;
          await reorder(
            dragId || e.dataTransfer.getData("text/plain"),
            item.id,
          );
          dragId = null;
        });
        const grip = button(
          "⠿",
          () => toast("拖曳可排序；鍵盤可按 Alt + 上下方向鍵。"),
          "co-grip",
        );
        grip.setAttribute("aria-label", "調整待辦順序");
        grip.addEventListener("keydown", async (e) => {
          if (e.altKey && ["ArrowUp", "ArrowDown"].includes(e.key)) {
            e.preventDefault();
            const index =
              inboxItems.findIndex((i) => i.id === item.id) +
              (e.key === "ArrowUp" ? -1 : 1);
            await reorder(item.id, inboxItems[index]?.id);
          }
        });
        grip.addEventListener("pointerdown", (e) => {
          if (e.pointerType === "touch") {
            e.preventDefault();
            dragId = item.id;
            dragging = true;
            grip.setPointerCapture(e.pointerId);
            row.classList.add("is-dragging");
          }
        });
        grip.addEventListener("pointerup", async (e) => {
          if (e.pointerType !== "touch" || !dragging) return;
          const target = document
            .elementFromPoint(e.clientX, e.clientY)
            ?.closest("[data-inbox-id]");
          dragging = false;
          row.classList.remove("is-dragging");
          await reorder(dragId, target?.dataset.inboxId);
          dragId = null;
        });
        grip.addEventListener("pointercancel", () => {
          dragging = false;
          dragId = null;
          row.classList.remove("is-dragging");
        });
        row.append(grip);
        const content = node("div", undefined, "co-inbox-content");
        const p = allProjects().find((p) => p.project_id === item.project_id);
        content.append(
          node("h4", item.title),
          node(
            "p",
            [
              p ? projectName(p) : null,
              item.provenance,
              item.date,
              item.priority === "high" ? "優先" : null,
            ]
              .filter(Boolean)
              .join(" · "),
          ),
        );
        if (item.notes) content.append(node("p", item.notes));
        row.append(content);
        const actions = node("div", undefined, "co-inbox-actions");
        actions.append(
          button(
            state === "done" ? "取消完成" : "完成",
            () =>
              updateInbox(item, { state: state === "done" ? "today" : "done" }),
            "co-button primary",
          ),
          button("編輯", () => editInbox(item), "co-button quiet"),
          button(
            state === "later" ? "今天處理" : "稍後",
            () =>
              updateInbox(item, {
                state: state === "later" ? "today" : "later",
                date: "",
              }),
            "co-button quiet",
          ),
        );
        if (p)
          actions.append(
            button("打開企劃", () => openProject(p), "co-button quiet"),
          );
        if (item.id.startsWith("ai:"))
          actions.append(
            button(
              "忽略",
              () => updateInbox(item, { state: "ignored" }),
              "co-button quiet",
            ),
          );
        row.append(actions);
        group.append(row);
      }
      if (!items.length)
        group.append(
          node(
            "p",
            state === "today"
              ? "桌面留白，留給今天的重要事情。"
              : state === "later"
                ? "想晚點處理的事，可以先放在這裡。"
                : "完成待辦後，會在這裡陪你到今天結束。",
            "co-empty",
          ),
        );
      inboxRoot.append(group);
    }
    const archived = inboxItems.filter(
      (i) =>
        i.state === "ignored" ||
        (i.state === "done" && day(i.completed_at) !== today),
    );
    if (archived.length) {
      const d = node("details");
      d.append(node("summary", "已收起的待辦 · " + archived.length));
      for (const item of archived) {
        const line = node(
          "p",
          item.title +
            " · " +
            (item.state === "ignored" ? "已忽略" : date(item.completed_at)),
        );
        line.append(
          button(
            "恢復",
            () => updateInbox(item, { state: "today" }),
            "co-button quiet",
          ),
        );
        d.append(line);
      }
      inboxRoot.append(d);
    }
  }
  async function moveProject(source, target) {
    if (!source || !target || source === target) return;
    const ids = [...activeProjectIds];
    const from = ids.indexOf(source),
      to = ids.indexOf(target);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, source);
    const retained = (presentation.project_order || []).filter(
      (id) => !ids.includes(id),
    );
    if (await save("project-order", { order: [...ids, ...retained] })) {
      toast("企劃順序已儲存，前兩個顯示在正在製作");
      root
        .querySelector(
          `[data-project-id="${CSS.escape(source)}"] .co-project-drag`,
        )
        ?.focus({ preventScroll: true });
    }
  }
  function projectSorting(card, p, index) {
    const bar = node("div", undefined, "co-project-sort");
    const handle = button(
      "⠿ 拖曳排序",
      () => {},
      "co-button quiet co-project-drag",
    );
    handle.title = "拖曳排序，或使用上、下方向鍵移動";
    handle.setAttribute("aria-label", "拖曳排序 " + projectName(p));
    handle.draggable = false;
    handle.disabled = !storeReady;
    const clearDrag = () => {
      dragging = false;
      projectDragId = null;
      root
        .querySelectorAll(".co-project.is-dragging,.co-project.is-drop-target")
        .forEach((e) => e.classList.remove("is-dragging", "is-drop-target"));
    };
    handle.addEventListener("keydown", async (e) => {
      if (!["ArrowUp", "ArrowDown"].includes(e.key)) return;
      e.preventDefault();
      await moveProject(
        p.project_id,
        activeProjectIds[index + (e.key === "ArrowUp" ? -1 : 1)],
      );
    });
    // Pointer dragging works with mouse, touch and pen; other card controls remain independent.
    let touchTarget = null;
    handle.addEventListener("pointerdown", (e) => {
      if (!storeReady || e.button !== 0) return;
      e.preventDefault();
      projectDragId = p.project_id;
      dragging = true;
      touchTarget = null;
      handle.setPointerCapture(e.pointerId);
      card.classList.add("is-dragging");
    });
    handle.addEventListener("pointermove", (e) => {
      if (projectDragId !== p.project_id) return;
      e.preventDefault();
      if (e.clientY < 65) window.scrollBy(0, -24);
      else if (e.clientY > innerHeight - 65) window.scrollBy(0, 24);
      const hovered = document.elementFromPoint(e.clientX, e.clientY);
      if (hovered?.closest(".co-other-projects > summary"))
        otherProjectsToggle.open = true;
      const target = hovered?.closest("#active-projects .co-project");
      touchTarget = target?.dataset.projectId || null;
      root
        .querySelectorAll(".is-drop-target")
        .forEach((el) => el.classList.remove("is-drop-target"));
      target?.classList.add("is-drop-target");
    });
    handle.addEventListener("pointerup", async (e) => {
      if (projectDragId !== p.project_id) return;
      const target = touchTarget;
      clearDrag();
      await moveProject(p.project_id, target);
    });
    handle.addEventListener("pointercancel", clearDrag);
    bar.append(
      handle,
      node(
        "small",
        index < 2 ? "目前顯示 · " + (index + 1) : "已收起 · " + (index + 1),
      ),
    );
    if (index >= 2) {
      const promote = button(
        "移到前面",
        () => moveProject(p.project_id, activeProjectIds[0]),
        "co-button quiet",
      );
      promote.disabled = !storeReady;
      bar.append(promote);
    }
    card.querySelector(".co-project-body").prepend(bar);
  }
  function render() {
    if (!root || dragging || editingName) return;
    const payload = response.projection || lastGood;
    const high = payload?.source?.high_water_timestamp;
    const healthy = window.RenguinFreshness.envelope(response).fresh;
    const notice = root.querySelector(".co-connection");
    if (notice) {
      notice.hidden = !loaded || (response.projection && storeReady);
      notice.textContent = !response.projection
        ? "暫時無法讀取專案資料，正在重新連線。"
        : "暫時無法儲存變更，正在重新連線。";
    }
    syncButton.textContent =
      (healthy ? "● 部分來源同步 · " : "○ 最後同步 · ") +
      (validTime(high)
        ? new Date(epoch(high) * 1000).toLocaleTimeString("zh-TW", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })
        : "尚無紀錄");
    const hash = JSON.stringify([
      payload?.projects,
      eventStatuses,
      presentation,
      response.status,
      storeReady,
      (window.RenguinOperations?.current.jobs || []).map((j) => [
        j.project_id,
        window.RenguinOperations.effective(j),
      ]),
    ]);
    if (hash !== signature) {
      signature = hash;
      const projects = primary();
      const projectRank = new Map(
        (presentation.project_order || []).map((id, i) => [id, i]),
      );
      projects.sort(
        (a, b) =>
          (projectRank.get(a.project_id) ?? Infinity) -
            (projectRank.get(b.project_id) ?? Infinity) ||
          (hasRunning(sourceId(b)) ? 1 : 0) -
            (hasRunning(sourceId(a)) ? 1 : 0) ||
          (isHuman(b) ? 1 : 0) - (isHuman(a) ? 1 : 0) ||
          (epoch(lastStamp(b)) || 0) - (epoch(lastStamp(a)) || 0),
      );
      projectsRoot.replaceChildren();
      otherProjectsRoot.replaceChildren();
      completedRoot.replaceChildren();
      const activeProjects = projects.filter((p) => !projectDone(p));
      activeProjectIds = activeProjects.map((p) => p.project_id);
      activeProjects.forEach((p, index) => {
        const card = projectCard(p);
        projectSorting(card, p, index);
        (index < 2 ? projectsRoot : otherProjectsRoot).append(card);
      });
      otherProjectsToggle.hidden = activeProjects.length <= 2;
      otherProjectsToggle.querySelector("summary").textContent =
        "其他企劃 · " +
        Math.max(0, activeProjects.length - 2) +
        "　展開後可拖曳排序";
      const done = projects
        .filter((p) => projectDone(p))
        .sort((a, b) => epoch(stampDone(b)) - epoch(stampDone(a)));
      for (const p of done.filter(
        (p) => Date.now() / 1000 - epoch(stampDone(p)) <= 14 * 86400,
      ))
        completedRoot.append(projectCard(p));
      if (!projectsRoot.children.length)
        projectsRoot.append(
          node(
            "p",
            payload
              ? "目前還沒有正在追蹤的影片專案。"
              : loaded
                ? "暫時無法讀取專案資料，正在重新連線。"
                : "正在讀取專案資料…",
            "co-empty",
          ),
        );
      if (!completedRoot.children.length)
        completedRoot.append(
          node(
            "p",
            "完成一個故事，就在這裡留下足跡。保留最近 14 天的完成企劃。",
            "co-empty",
          ),
        );
      const older = done.filter(
        (p) => Date.now() / 1000 - epoch(stampDone(p)) > 14 * 86400,
      );
      if (older.length) {
        const d = node("details");
        d.className = "co-empty";
        d.append(node("summary", "更早完成的企劃 · " + older.length));
        for (const p of older)
          d.append(button(projectName(p), () => showDetails(p)));
        completedRoot.append(d);
      }
      houseObserver.disconnect();
      root
        .querySelectorAll(".co-house")
        .forEach((house) => houseObserver.observe(house));
      renderInbox();
    }
    renderMembers();
  }
  async function poll() {
    if (polling) return;
    polling = true;
    clearTimeout(pollTimer);
    try {
      browserStatus = await json("/api/creator/browser-bridge/status");
    } catch {
      browserStatus = { connected: false, observations: [] };
    }
    try {
      const r = await json("/api/renguin/projects");
      if (
        ![
          "LIVE",
          "FRESH",
          "STALE",
          "UNKNOWN",
          "UNAVAILABLE",
          "SYNC_ERROR",
        ].includes(r.status) ||
        (r.projection &&
          (r.projection.profile_id !==
            "renguin://star-office/projection-profile/1.0.0" ||
            !Array.isArray(r.projection.projects)))
      )
        throw Error();
      response = r;
      if (r.projection) lastGood = r.projection;
      window.RenguinReadiness?.projects(r);
    } catch {
      response = { status: "SYNC_ERROR", projection: null };
    }
    try {
      eventStatuses = (await json("/api/creator/event-statuses")).events || {};
    } catch {}
    try {
      if (!mutationPending) {
        const next = await json("/api/creator/presentation");
        if ((next.revision || 0) >= (presentation.revision || 0))
          presentation = next;
        storeReady = true;
      }
    } catch {
      storeReady = false;
    }
    loaded = true;
    render();
    retryDelay =
      response.projection && storeReady
        ? 5000
        : Math.min(retryDelay * 2, 30000);
    polling = false;
    pollTimer = setTimeout(poll, retryDelay);
  }
  function setup() {
    const game = document.getElementById("game-container");
    const header = node("header", undefined, "co-map-header");
    const title = node("div");
    title.append(
      node("h1", "RENGUIN OFFICE"),
      node("p", "CREATOR OFFICE · 讓好故事，在這裡發生"),
    );
    syncButton = button("○ 連接辦公室…", () => {
      const d = modal("辦公室同步");
      for (const key of Object.keys(agents)) {
        const v = memberView(key);
        d.append(node("h3", agents[key][0]), node("p", v.text));
      }
      d.append(
        technical({
          canonical: response,
          operations: window.RenguinOperations?.current,
        }),
      );
    });
    const shortcuts = node("div", undefined, "co-map-actions");
    shortcuts.append(
      button("影片專案", () =>
        document
          .getElementById("active-projects")
          .scrollIntoView({ block: "start" }),
      ),
      button("我的待辦", () =>
        document
          .getElementById("human-inbox")
          .scrollIntoView({ block: "start" }),
      ),
      syncButton,
    );
    header.append(title, shortcuts);
    document.getElementById("main-stage").before(header);
    root = node("main");
    root.id = "creator-office";
    game.after(root);
    const notice = node("p", "", "co-connection");
    notice.role = "status";
    notice.hidden = true;
    root.append(notice);
    const loading = document.getElementById("loading-overlay");
    if (loading) game.append(loading);
    function section(id, title, subtitle, cls) {
      const s = node("section", undefined, "co-section");
      s.id = id;
      const h = node("div", undefined, "co-section-header");
      const text = node("div");
      text.append(node("h2", title), node("p", subtitle, "co-kicker"));
      h.append(text);
      s.append(h);
      const body = node("div", undefined, cls);
      s.append(body);
      root.append(s);
      return [body, h];
    }
    [membersRoot] = section(
      "office-members",
      "辦公室成員",
      "一起讓故事成形的夥伴",
      "co-members",
    );
    [projectsRoot] = section(
      "active-projects",
      "正在製作",
      "先專注兩個企劃 · 拖曳調整順序，前兩位留在這裡",
      "co-grid co-featured-projects",
    );
    projectsRoot.previousElementSibling.append(
      button("＋ 新增專案", () => projectSource()),
    );
    otherProjectsToggle = node("details", undefined, "co-other-projects");
    otherProjectsToggle.append(node("summary", "其他企劃"));
    otherProjectsRoot = node("div", undefined, "co-grid");
    otherProjectsToggle.append(otherProjectsRoot);
    projectsRoot.after(otherProjectsToggle);
    let inboxHeader;
    [inboxRoot, inboxHeader] = section(
      "human-inbox",
      "等我處理",
      "留給企鵝的工作桌 · 依照你的步調安排",
      "co-inbox",
    );
    inboxHeader.append(button("＋ 新增待辦", () => editInbox()));
    [completedRoot] = section(
      "recently-completed",
      "最近完成",
      "把做好的故事，好好收藏",
      "co-grid",
    );
    const footer = node("footer", undefined, "co-technical-footer");
    footer.append(
      button(
        "已移除的專案",
        () => {
          const d = modal("已移除的專案");
          const removed = allProjects().filter(
            (p) => presentation.projects[p.project_id]?.hidden,
          );
          if (!removed.length) d.append(node("p", "沒有已移除的專案。"));
          for (const p of removed) {
            const row = node("div", undefined, "co-actions");
            row.append(
              node("p", projectName(p)),
              button("恢復專案", async () => {
                if (
                  await save("project", {
                    project_id: p.project_id,
                    hidden: false,
                  })
                ) {
                  d.close();
                  toast("專案已恢復");
                }
              }),
            );
            d.append(row);
          }
        },
        "co-button quiet",
      ),
      button(
        "查看詳情",
        () => {
          const d = modal("辦公室詳情");
          const board = node("div");
          board.id = "rc-agent-board";
          d.append(
            technical({
              canonical: response,
              presentation_kind: presentation.kind,
            }),
            node("h3", "技術資訊 · 工作來源與範圍"),
            board,
          );
          window.RenguinOperations?.render(board);
        },
        "co-button quiet",
      ),
      button(
        "其他企劃",
        () => {
          const d = modal("其他企劃");
          for (const p of allProjects().filter(
            (p) =>
              !primary().some((card) => card.project_id === p.project_id) &&
              !presentation.projects[p.project_id]?.hidden,
          ))
            d.append(
              button(projectName(p), () => showDetails(p), "co-button quiet"),
            );
        },
        "co-button quiet",
      ),
      button(
        "裝修辦公室",
        () => window.toggleAssetDrawer?.(true),
        "co-button quiet",
      ),
    );
    root.append(footer);
    render();
    poll();
    setInterval(renderMembers, 1000);
  }
  window.CreatorOffice = {
    poll,
    render,
    syncMap,
    memberView,
    timeline,
    lastState,
    displayStatus,
  };
  window.RenguinControlRoom = {
    poll,
    render: () => {},
    refreshAgentNames: renderMembers,
  };
  if (document.body) setup();
  else document.addEventListener("DOMContentLoaded", setup);
})();
