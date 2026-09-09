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
    ASTRA: ["ASTRA", "director/renguin.png"],
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
    e.addEventListener("click", fn);
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
    mutationQueue = Promise.resolve();

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
        r.status === 415
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
  function allProjects() {
    return (response.projection || lastGood)?.projects || [];
  }
  function primary() {
    return allProjects().filter(
      (p) =>
        p.classification === "REGISTERED" &&
        ["YOUTUBE", "VIDEO_PROJECT"].includes(p.project_type),
    );
  }
  function rowKnown(row, p) {
    return (
      validTime(row.updated_at) &&
      !!(
        row.ledger_entry_id ||
        (row.evidence_provenance?.verified === true &&
          row.evidence_provenance.canonical_project_id === p.project_id)
      )
    );
  }
  function displayStatus(p, row, events = eventStatuses) {
    const evidence = events[row.ledger_entry_id];
    return evidence?.project_id === p.project_id &&
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
    return manual(p)?.done === true || canonicalDone(p);
  }
  function stampDone(p) {
    return manual(p)?.done
      ? manual(p).timestamp
      : timeline(p)
          .filter(
            (r) => ["PUBLISH", "ARCHIVE"].includes(r.id) && r.status === "DONE",
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
    const jobs = (board.jobs || []).filter((j) => j.agent === key);
    const running = jobs.find(
      (j) => window.RenguinOperations.effective(j) === "RUNNING",
    );
    const waiting = jobs.find((j) =>
      ["WAITING_USER", "WAITING_AGENT", "STARTING", "BLOCKED"].includes(
        window.RenguinOperations.effective(j),
      ),
    );
    const observations = (
      board.native_coverage?.observations ||
      jobs.flatMap((j) => j.native_observations || [])
    ).filter((o) => o.agent === key);
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
    const summary = current
      ? clean(current.task, project ? "處理 " + project : "工作進行中")
      : latestTerminal && epoch(latestTerminal.finished_at) >= epoch(stamp)
        ? latestTerminal.effective_status === "FAILED"
          ? "上次工作未完成"
          : "上次工作已完成"
        : stamp
          ? "已保留最近工作紀錄"
          : "尚未收到工作紀錄";
    return {
      key,
      text,
      stamp,
      summary,
      running: !!running,
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
      views.map((v) => [v.key, v.text, v.stamp, v.summary]),
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
              node("p", date(v.stamp), "co-muted"),
              technical(v.diagnostic),
            );
          },
          "co-member" + (v.running ? " is-running" : ""),
        );
        card.dataset.agent = v.key;
        const img = node("img");
        img.src = "/static/renguin-characters/" + agents[v.key][1];
        img.alt = "";
        card.append(
          img,
          node("h3", agents[v.key][0]),
          node("strong", v.text),
          node("p", v.summary),
          node("p", date(v.stamp), "co-muted"),
        );
        membersRoot.append(card);
      }
      renderMemberSelection();
    }
    syncMap();
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
      img.src = "/static/renguin-characters/director/renguin.png";
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
      if (label) label.textContent = agents[key][0] + "｜" + v.text;
      el.classList.toggle("is-working", v.running);
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
    const d = modal(p.project_name);
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
    d.append(
      technical({
        canonical: p,
        presentation: presentation.projects[p.project_id] || {},
        freshness: window.RenguinFreshness.project(response, p),
      }),
    );
  }
  async function showTimeline(p, stageId) {
    const d = modal(
      stageId
        ? (labels[stageId] || "階段紀錄") + " · " + p.project_name
        : "完整時間軸 · " + p.project_name,
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
          node("small", r.source || "Content OS"),
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
            (entry.done ? "✓ 你已標記完成" : "取消手動完成") +
              " · " +
              date(entry.timestamp),
            "co-muted",
          ),
        );
    d.append(button("查看詳情", () => showDetails(p), "co-button quiet"));
    try {
      const data = await json(
        "/api/creator/history?project_id=" + encodeURIComponent(p.project_id),
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
      d.append(technical(data));
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
      node("p", p.project_name),
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
  function projectCard(p) {
    const card = node("article", undefined, "co-project");
    card.dataset.projectId = p.project_id;
    const cover = node("div", undefined, "co-cover");
    const coverState = presentation.projects[p.project_id]?.cover;
    if (coverState?.url) {
      const img = node("img");
      img.src = coverState.url;
      img.alt = p.project_name + " 封面";
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
    cover.append(coverActions);
    card.append(cover);
    const body = node("div", undefined, "co-project-body");
    body.append(node("h3", p.project_name));
    const route = node("nav", undefined, "co-route");
    route.setAttribute("aria-label", p.project_name + " 製作路線");
    const rows = timeline(p);
    Object.entries(routeLabels).forEach(([id, label], i) => {
      const row =
        rows.find((r) => r.id === id) ||
        (id === "INDEX" ? rows.find((r) => r.id === "RAW") : null);
      const status = row?.status || "UNKNOWN";
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
      if (i)
        route.append(
          node(
            "span",
            undefined,
            "co-link" + (kind === "done" ? " is-done" : ""),
          ),
        );
      const b = button(
        (kind === "done" ? "✓ " : "") + label,
        () => showTimeline(p, id),
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
      route.append(b);
    });
    body.append(route);
    const current = lastState(p);
    body.append(
      node(
        "p",
        current ? rowText(current) : "尚無製作階段同步紀錄",
        "co-state",
      ),
      node("p", "最後更新 " + date(lastStamp(p)), "co-muted"),
    );
    if (historical(p) && lastStamp(p))
      body.append(node("p", "資料已超過即時同步期限", "co-muted"));
    if (manual(p)?.done)
      body.append(
        node("p", "✓ 你已標記完成 · " + date(manual(p).timestamp), "co-state"),
      );
    const milestones = node("ul", undefined, "co-milestones");
    const recent = [...rows]
      .sort((a, b) => epoch(b.updated_at) - epoch(a.updated_at))
      .slice(0, 3);
    for (const row of recent) {
      const li = node("li");
      li.append(
        node("time", date(row.updated_at, true)),
        node("span", rowText(row)),
      );
      milestones.append(li);
    }
    if (!recent.length)
      milestones.append(node("li", "尚無同步紀錄，故事從這裡開始。"));
    body.append(milestones);
    const actions = node("div", undefined, "co-actions");
    const done = button(
      manual(p)?.done ? "取消完成" : "✓ 做好了",
      () => confirmDone(p),
      "co-button primary",
    );
    done.disabled = !storeReady;
    actions.append(
      done,
      button("完整時間軸", () => showTimeline(p), "co-button quiet"),
      button("查看詳情", () => showDetails(p), "co-button quiet"),
    );
    body.append(actions);
    card.append(body);
    return card;
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
        provenance: stage.id === "GATE" ? "Human Gate" : "Content OS",
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
                  .filter((p) => p.classification === "REGISTERED")
                  .map((p) => [p.project_id, p.project_name]),
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
              p?.project_name,
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
  function render() {
    if (!root || dragging) return;
    const payload = response.projection || lastGood;
    const high = payload?.source?.high_water_timestamp;
    const healthy = window.RenguinFreshness.envelope(response).fresh;
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
      projects.sort(
        (a, b) =>
          (hasRunning(b.project_id) ? 1 : 0) -
            (hasRunning(a.project_id) ? 1 : 0) ||
          (isHuman(b) ? 1 : 0) - (isHuman(a) ? 1 : 0) ||
          (epoch(lastStamp(b)) || 0) - (epoch(lastStamp(a)) || 0),
      );
      projectsRoot.replaceChildren();
      completedRoot.replaceChildren();
      for (const p of projects.filter((p) => !projectDone(p)))
        projectsRoot.append(projectCard(p));
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
            payload ? "目前沒有製作中的企劃。" : "正在連接企劃紀錄…",
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
          d.append(button(p.project_name, () => showDetails(p)));
        completedRoot.append(d);
      }
      renderInbox();
    }
    renderMembers();
  }
  async function poll() {
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
    render();
  }
  function setup() {
    const game = document.getElementById("game-container");
    const header = node("header", undefined, "co-map-header");
    const title = node("div");
    title.append(
      node("h1", "STAR OFFICE"),
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
    header.append(title, syncButton);
    document.getElementById("main-stage").before(header);
    root = node("main");
    root.id = "creator-office";
    game.after(root);
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
      "每一條路線，都是一個正在成形的故事",
      "co-grid",
    );
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
          for (const p of allProjects().filter((p) => !primary().includes(p)))
            d.append(
              button(p.project_name, () => showDetails(p), "co-button quiet"),
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
    setInterval(poll, 5000);
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
