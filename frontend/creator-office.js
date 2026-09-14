/* Creator Office UX. Canonical/executor inputs are read-only; user presentation is separate. */
(() => {
  "use strict";
  // The station, its entry and the system timeline ship as files of their own,
  // attached here at this script's version so the page shell never changes for them.
  const layers = (() => {
    if (typeof document.createElement !== "function" || !document.head) return false;
    let version = "";
    try {
      version = new URL(document.currentScript.src).searchParams.get("v") || "";
    } catch {}
    const at = (file) => "/static/" + file + (version ? "?v=" + encodeURIComponent(version) : "");
    if (!document.querySelector('link[rel="icon"]')) {
      const icon = document.createElement("link");
      icon.rel = "icon";
      icon.href =
        "data:image/svg+xml," +
        encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><circle cx='32' cy='32' r='30' fill='#141a3d'/><path d='M32 10l6 16 16 6-16 6-6 16-6-16-16-6 16-6z' fill='#ffd27a'/></svg>");
      document.head.append(icon);
    }
    // The entry covers the page from the first frame; the station lifts it, and
    // if the station never arrives the cover lifts itself.
    let intro = "";
    try {
      intro = new URLSearchParams(location.search).get("intro") || "";
    } catch {}
    if (intro !== "off" && !document.hidden && document.body) {
      const cover = document.createElement("div");
      cover.id = "so-intro-cover";
      cover.setAttribute("aria-hidden", "true");
      cover.style.cssText = "position:fixed;inset:0;z-index:2147483000;background:radial-gradient(120% 90% at 50% 40%,#1b1a4a,#070919 60%,#03040c);transition:opacity .3s ease";
      document.body.append(cover);
      setTimeout(() => cover.remove(), 6000);
    }
    for (const file of ["creator-station.css", "creator-timeline.css"]) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = at(file);
      document.head.append(link);
    }
    const scripts = {};
    for (const file of ["creator-station.js", "creator-timeline.js"]) {
      const script = document.createElement("script");
      script.src = at(file);
      script.async = false;
      document.head.append(script);
      scripts[file] = script;
    }
    // Run fn with the layer's global once its file has run; never if it fails.
    const when = (file, global, fn) => {
      if (window[global]) return fn(window[global]);
      scripts[file]?.addEventListener("load", () => window[global] && fn(window[global]), { once: true });
    };
    return { at, when };
  })();
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
  // [member name, canonical character art, character, role]
  const agents = {
    CHATGPT_WORK: ["ChatGPT", "director/renguin.png", "企鵝 Renguin", "主控／導演"],
    ASTRA: ["ASTRA", "astra/eric.png", "Eric", "工程／程式"],
    CLAUDE: ["Claude", "editor/dola.png", "哆啦 Dola", "剪輯／同步"],
    BIONIC: ["BIONIC", "scanner/xuebao.png", "雪寶 Xuebao", "檢查／挑錯"],
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
    todoSummary,
    todoArchive,
    inboxRoot,
    historyRoot,
    historyNote = null,
    world = null,
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
    shortProjectIds = [],
    completedProjectIds = [],
    shortCompletedIds = [],
    projectDragId = null,
    pinnedCount = 0,
    homeToggle = null,
    freshIds = new Set();
  // Folded PROJECT DECK cards are not drawn; this says which island each waits on.
  const foldedDeckOf = new Map();
  const zones = new Map();
  // The four islands of the sky world, in the order they lie along the dock.
  const ISLANDS = [
    { id: "work", section: "active-projects", zone: "work", icon: "▶", title: "正在製作", note: "長片" },
    { id: "result", section: "recently-completed", zone: "result", icon: "★", title: "完成", note: "長片" },
    { id: "short", section: "short-videos", zone: "short", icon: "▮", title: "短影音正在製作", note: "短影音" },
    { id: "short-result", section: "short-completed", zone: "short-result", icon: "✦", title: "短影音完成", note: "短影音" },
  ];
  const islands = {};
  // Each island shows six crystals at a time on its ACTIVE DECK; the rest wait,
  // folded, on the PROJECT DECK below the cloud bridge. Pins beyond six lead the
  // PROJECT DECK. Pure, so the rule can be tested.
  const DECK_HERO = 6;
  const deckSplit = (list) => [list.slice(0, DECK_HERO), list.slice(DECK_HERO)];
  const expanded = new Set();
  const todoColumns = {};
  // The PROJECT DECK stays folded until opened, and remembers being opened.
  const DECK_OPEN_KEY = "co-decks-open";
  const openDecks = (() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(DECK_OPEN_KEY) || "[]"));
    } catch {
      return new Set();
    }
  })();
  function setDeckOpen(id, open, remember = true) {
    if (open) openDecks.add(id);
    else openDecks.delete(id);
    if (remember)
      try {
        localStorage.setItem(DECK_OPEN_KEY, JSON.stringify([...openDecks]));
      } catch {}
    const isle = islands[id];
    if (!isle) return;
    isle.floor.hidden = !open || isle.bridge.hidden;
    isle.bridge.setAttribute("aria-expanded", String(open));
    isle.bridgeAction.textContent = open ? "收合" : "展開";
    // A folded deck keeps no cards on the page; opening it draws them.
    if (remember) render();
  }
  let browserStatus = { connected: false, observations: [] };
  const playingLinks = new Map();
  // Crystals and resting islets only glow and play while they are on screen.
  const sceneryObserver = new IntersectionObserver(
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
  // A short video runs 素材 → 後製 → 上映 and nothing else; its disabled steps are moot.
  const SHORT_STEPS = ["INDEX", "AI_POST", "PUBLISH"];
  const stepsFor = (meta) =>
    meta?.format === "SHORT"
      ? [...SHORT_STEPS]
      : Object.keys(routeLabels).filter(
          (id) => !(meta?.disabled_steps || []).includes(id),
        );
  const isShort = (p) => presentation.projects[p.project_id]?.format === "SHORT";
  const enabledSteps = (p) => stepsFor(presentation.projects[p.project_id]);
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
    if (r.status === 400) {
      const error = await r.json().catch(() => null);
      throw Error(error?.error || "輸入內容無效，請確認後再試。");
    }
    const refusal = r.status === 409 ? await r.json().catch(() => null) : null;
    if (refusal?.error) throw Error(refusal.error);
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
      if (["projects", "project-source", "project-copy"].includes(path))
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
  // The member cards ask for this every second, so it is worked out once per
  // poll or save instead of once per question.
  let projectMemo = { sources: null, presentation: null, all: [], primary: [], folded: new Map(), behind: new Map() };
  function remembered() {
    const sources = sourceProjects();
    if (projectMemo.sources === sources && projectMemo.presentation === presentation) return projectMemo;
    const byId = new Map(sources.map((p) => [p.project_id, p]));
    const all = [
      ...sources,
      ...Object.values(presentation.local_projects || {}),
    ].map((card) => {
      const meta = presentation.projects[card.project_id] || {};
      const sid = Object.hasOwn(meta, "source_project_id")
        ? meta.source_project_id
        : byId.has(card.project_id)
          ? card.project_id
          : null;
      const source = byId.get(sid);
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
    const cards = all.filter(
      (p) =>
        p.classification === "REGISTERED" &&
        ["YOUTUBE", "VIDEO_PROJECT"].includes(p.project_type) &&
        !presentation.projects[p.project_id]?.hidden,
    );
    const local = presentation.local_projects || {};
    const folded = foldDuplicates(
      cards,
      (p) => presentation.projects[p.project_id],
      (p) => Object.hasOwn(local, p.project_id),
    );
    const behind = new Map();
    for (const [id, keeper] of folded) behind.set(keeper, [...(behind.get(keeper) || []), id]);
    projectMemo = {
      sources,
      presentation,
      all,
      folded,
      behind,
      primary: cards.filter((p) => !folded.has(p.project_id)),
    };
    return projectMemo;
  }
  function allProjects() {
    return remembered().all;
  }
  function primary() {
    return remembered().primary;
  }
  // Content OS has registered some folders more than once: each rescan minted a
  // new project id for the same folder, so one video stood on the desk as two,
  // three or six crystals. The desk shows each project once. A card the user
  // made, or has put anything of their own on, is theirs and always stays; the
  // untouched system copies fold behind the one with the most evidence and wait
  // in 工作紀錄 under 系統重複登記, so no canonical record loses its way in.
  // Nothing is written anywhere. Pure, so the rule can be tested.
  const USER_FIELDS = ["cover", "display_name", "manual_done", "disabled_steps", "link", "pinned_at", "format", "copied_from", "workflow_user_at"];
  function userTouched(meta) {
    if (!meta) return false;
    return (
      USER_FIELDS.some((key) => (Array.isArray(meta[key]) ? meta[key].length > 0 : meta[key] != null && meta[key] !== "")) ||
      (meta.history || []).some((entry) => entry?.source === "USER")
    );
  }
  // Premiere's auto-save beside a project ("…~recover") is the same project too,
  // and never the one that stands for it.
  const RECOVERY = /\s*~recover(?:ed)?\d*\s*$/i;
  const duplicateKey = (name) =>
    String(name ?? "")
      .normalize("NFKC")
      .replace(RECOVERY, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  const evidenceOrder = (a, b) =>
    RECOVERY.test(a.project_name) - RECOVERY.test(b.project_name) ||
    !!b.workspace - !!a.workspace ||
    (b.evidence_file_count || 0) - (a.evidence_file_count || 0) ||
    !!b.production_evidence - !!a.production_evidence ||
    /^WORKSPACE-/.test(b.project_id) - /^WORKSPACE-/.test(a.project_id) ||
    (a.project_id < b.project_id ? -1 : a.project_id > b.project_id ? 1 : 0);
  // Returns folded project id → the id of the card it folds behind.
  function foldDuplicates(cards, metaOf, isLocal) {
    const groups = new Map();
    for (const p of cards) {
      const key = duplicateKey(p.project_name);
      if (!key || isLocal(p)) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    }
    const folded = new Map();
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const touched = group.filter((p) => userTouched(metaOf(p)));
      const keeper = [...(touched.length ? touched : group)].sort(evidenceOrder)[0];
      for (const p of group)
        if (p !== keeper && !touched.includes(p)) folded.set(p.project_id, keeper.project_id);
    }
    return folded;
  }
  // The card grid above deliberately shows only registered video projects. Everything
  // else the ledger remembers used to be listed in the old office panel, grouped by
  // where the work happened; without somewhere to put it, most of the user's own work
  // history has no route into the page at all.
  const scratchName = /^(tests?|測試|demo|sample|範例|untitled|未命名)$/iu;
  function isScratch(p) {
    const name = String(p.project_name || "").trim();
    return (
      ["WINDOWS_E2E", "CONTENT_OS_SYSTEM"].includes(p.project_type) ||
      scratchName.test(name) ||
      /guardian|snapshot|native copy test|premiere mcp.*test|\bE2E\b/iu.test(
        name,
      )
    );
  }
  function isYTish(p) {
    const raw = [p.project_name, p.workspace, p.project_id]
      .filter(Boolean)
      .join(" ");
    return (
      Boolean(p.release_date) ||
      ["VIDEO_PROJECT", "YOUTUBE"].includes(p.project_type) ||
      /(^|[\s｜|_-])YT(?:[\s｜|_-]|鵝)/iu.test(raw)
    );
  }
  function historyGroup(p) {
    if (remembered().folded.has(p.project_id)) return "duplicate";
    if (isScratch(p)) return "scratch";
    if (isYTish(p)) return "yt";
    return /(CODEX|CHATGPT|OPENAI)/iu.test(
      `${p.source_event_id || ""} ${p.owner || ""}`,
    )
      ? "cloud"
      : "local";
  }
  const openHistoryGroups = new Set();
  const historyMeta = {
    yt: ["▶", "YT 企劃"],
    local: ["▣", "本地執行・系統"],
    cloud: ["☁", "雲端工作"],
    scratch: ["⚙", "測試與系統紀錄"],
    duplicate: ["⧉", "系統重複登記・已合併到卡片"],
  };
  function archived() {
    const shown = new Set(primary().map((p) => p.project_id));
    return allProjects().filter(
      (p) =>
        !shown.has(p.project_id) && !presentation.projects[p.project_id]?.hidden,
    );
  }
  function historyRow(p) {
    const row = node("div", undefined, "co-history-row");
    row.dataset.projectId = p.project_id;
    const meta = node("div", undefined, "co-history-meta");
    const keeper = remembered().folded.get(p.project_id);
    if (keeper)
      meta.append(node("span", "與卡片「" + (projectName(allProjects().find((c) => c.project_id === keeper) || {}) || "同名專案") + "」重複", "co-history-badge"));
    if (p.classification === "NEEDS_CLASSIFICATION")
      meta.append(node("span", "等待分類", "co-history-badge"));
    meta.append(node("span", clean(p.current_stage, "尚無進度紀錄")));
    meta.append(node("span", date(p.updated_at), "co-history-time"));
    row.append(
      node("div", projectName(p) || "未命名紀錄", "co-history-name"),
      meta,
    );
    return row;
  }
  function renderHistory() {
    const grouped = new Map(Object.keys(historyMeta).map((k) => [k, []]));
    const records = archived();
    for (const p of records) grouped.get(historyGroup(p)).push(p);
    const kinds = [...grouped.values()].filter((list) => list.length).length;
    const milestones = window.CreatorTimeline?.counts?.();
    zoneSummary("history", [
      ...(milestones ? [Object.values(milestones).reduce((a, b) => a + b, 0) + " 個里程碑"] : []),
      records.length + " 筆工作紀錄",
    ]);
    if (historyNote) historyNote.textContent = records.length + " 筆 · " + kinds + " 個分類";
    for (const list of grouped.values())
      list.sort(
        (a, b) => (epoch(b.updated_at) || 0) - (epoch(a.updated_at) || 0),
      );
    historyRoot.replaceChildren();
    for (const [key, [icon, label]] of Object.entries(historyMeta)) {
      const list = grouped.get(key);
      if (!list.length) continue;
      const box = node(
        "details",
        undefined,
        "co-other-projects co-history-group",
      );
      box.dataset.historyGroup = key;
      // Activity polling re-renders this section, so a group the user opened has to
      // stay open; otherwise it collapses under them mid-read.
      // A closed group keeps no rows on the page; they are drawn when it opens.
      const rows = node("div", undefined, "co-history-rows");
      const fill = () => {
        if (!rows.childElementCount) for (const p of list) rows.append(historyRow(p));
      };
      box.open = openHistoryGroups.has(key);
      if (box.open) fill();
      box.addEventListener("toggle", () => {
        if (box.open) {
          openHistoryGroups.add(key);
          fill();
        } else openHistoryGroups.delete(key);
      });
      box.append(node("summary", `${icon} ${label} · ${list.length} 筆`), rows);
      historyRoot.append(box);
    }
    if (!historyRoot.children.length)
      historyRoot.append(node("p", "目前還沒有其他工作紀錄。"));
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
  // A finished project whose completion time is missing or unreadable still has
  // to land somewhere. Treating it as infinitely old files it under 更早完成
  // instead of failing both the recent and the older test and disappearing.
  function completedAge(p) {
    const age = Date.now() / 1000 - epoch(stampDone(p));
    return Number.isFinite(age) ? age : Infinity;
  }
  function doneSortKey(p) {
    const stamp = epoch(stampDone(p));
    return Number.isFinite(stamp) ? stamp : -Infinity;
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
  // 最新加入: when each project joined, so a new one is easy to find. A card the
  // user made carries its own creation stamp; a system project dates from the
  // first canonical event about it or about any registration folded behind it.
  // Each island calls out only its newest few from the past week.
  const FRESH_WINDOW_S = 7 * 86400,
    FRESH_SHOWN = 3;
  let firstEvents = { from: null, at: new Map() };
  function firstEventAt(id) {
    if (firstEvents.from !== eventStatuses) {
      const at = new Map();
      for (const e of Object.values(eventStatuses || {})) {
        const t = epoch(e?.timestamp);
        if (e?.project_id && Number.isFinite(t) && !(at.get(e.project_id) <= t)) at.set(e.project_id, t);
      }
      firstEvents = { from: eventStatuses, at };
    }
    return firstEvents.at.get(id);
  }
  function addedStamp(meta, local, eventTimes) {
    if (local) {
      const made = (meta?.history || []).find((e) => ["PROJECT_CREATED", "PROJECT_COPIED"].includes(e?.type));
      return epoch(made?.timestamp || meta?.copied_from?.timestamp);
    }
    const times = eventTimes.filter(Number.isFinite);
    return times.length ? Math.min(...times) : NaN;
  }
  function addedAt(p) {
    const local = Object.hasOwn(presentation.local_projects || {}, p.project_id);
    const ids = [p.project_id, ...(remembered().behind.get(p.project_id) || [])];
    return addedStamp(presentation.projects[p.project_id], local, ids.map(firstEventAt));
  }
  // The newest of a list that joined within the window, newest first. Pure.
  function freshest(list, stampOf, now = Date.now() / 1000, limit = FRESH_SHOWN) {
    return list
      .map((p) => [p, stampOf(p)])
      .filter(([, t]) => Number.isFinite(t) && t <= now + 60 && now - t <= FRESH_WINDOW_S)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([p]) => p);
  }
  function joinedText(p) {
    const t = addedAt(p);
    if (!Number.isFinite(t)) return "";
    const at = new Date(t * 1000),
      today = new Date();
    const days = Math.round((new Date(today.toDateString()) - new Date(at.toDateString())) / 86400000);
    const clock = at.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
    return (days === 0 ? "今天 " + clock : days === 1 ? "昨天 " + clock : date(t, true)) + " 加入";
  }

  // Pinned projects lead 正在製作 in the order they were pinned; the rest keep
  // their own order. Pure, so the display rule can be tested on its own. Ten
  // pins fill the island's ACTIVE DECK, so every pin stays in view.
  const PIN_LIMIT = 10;
  const PIN_LIMIT_TEXT = "最多可置頂 " + PIN_LIMIT + " 個專案";
  const pinnedAt = (p) => presentation.projects[p.project_id]?.pinned_at || "";
  function arrange(list, pinOf, rest) {
    const byId = (a, b) =>
      a.project_id < b.project_id ? -1 : a.project_id > b.project_id ? 1 : 0;
    return [...list].sort((a, b) => {
      const pa = pinOf(a),
        pb = pinOf(b);
      if (!pa !== !pb) return pa ? -1 : 1;
      if (pa) return pa < pb ? -1 : pa > pb ? 1 : byId(a, b);
      return rest(a, b);
    });
  }
  // 最近完成 opens newest first. Once the user arranges the shelf their order
  // holds, and anything finished since leads it, newest first.
  function shelve(list, order, stamp) {
    const rank = new Map((order || []).map((id, i) => [id, i]));
    return [...list].sort((a, b) => {
      const ra = rank.get(a.project_id),
        rb = rank.get(b.project_id);
      if ((ra === undefined) !== (rb === undefined)) return ra === undefined ? -1 : 1;
      if (ra !== undefined) return ra - rb;
      return stamp(b) - stamp(a) || 0;
    });
  }
  async function togglePin(p) {
    if (mutationPending || !storeReady) return;
    const pinned = !!pinnedAt(p);
    const cardOf = () =>
      root.querySelector(`.co-project[data-project-id="${CSS.escape(p.project_id)}"]`);
    if (!pinned && pinnedCount >= PIN_LIMIT) {
      toast(PIN_LIMIT_TEXT);
      const feedback = cardOf()?.querySelector(".co-save-status");
      if (feedback) feedback.textContent = PIN_LIMIT_TEXT + "，請先取消其中一個置頂。";
      return;
    }
    if (await save("pin", { project_id: p.project_id, pinned: !pinned })) {
      toast((pinned ? "已取消置頂「" : "已置頂「") + projectName(p) + "」");
      cardOf()?.querySelector(".co-pin-toggle")?.focus();
    }
  }
  function saveEnvironment(value) {
    mutationQueue = mutationQueue.then(async () => {
      try {
        presentation = await json("/api/creator/environment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(value),
        });
        storeReady = true;
        return true;
      } catch {
        return false;
      }
    });
    return mutationQueue;
  }
  // Office Members wear their canonical character art, cropped to the figure
  // and framed identically; missing art gets the same frame with an initial.
  function memberIdentity(key) {
    const [name, asset, character, role] = agents[key] || [key];
    return {
      name,
      character: character || "",
      role: role || "",
      asset: asset ? "/static/renguin-characters/" + asset : null,
      bounds: window.CreatorScene?.bounds?.(key) || null,
    };
  }
  function memberAvatar(key) {
    const who = memberIdentity(key);
    const frame = node("span", undefined, "co-avatar");
    frame.dataset.initial = (who.character || who.name || "?").trim().slice(0, 1).toUpperCase();
    const missing = () => {
      frame.dataset.state = "missing";
      frame.replaceChildren();
    };
    if (!who.asset) {
      missing();
      return frame;
    }
    frame.dataset.state = "ready";
    const portrait = node("span", undefined, "co-avatar-portrait");
    const img = node("img");
    img.alt = "";
    img.decoding = "async";
    img.draggable = false;
    img.addEventListener("error", missing, { once: true });
    if (who.bounds) {
      const [w, h, x, y, right, bottom] = who.bounds,
        bw = right - x,
        bh = bottom - y;
      portrait.style.aspectRatio = `${bw} / ${bh}`;
      portrait.classList.add("is-cropped", bw >= bh ? "is-wide" : "is-tall");
      Object.assign(img.style, {
        width: (w / bw) * 100 + "%",
        height: (h / bh) * 100 + "%",
        left: (-x / bw) * 100 + "%",
        top: (-y / bh) * 100 + "%",
      });
    }
    img.src = who.asset;
    portrait.append(img);
    frame.append(portrait);
    return frame;
  }
  // Rooms fold down to their signboard. The floor below is revealed or hidden;
  // nothing is ever resized, so both states are the same picture.
  const ZONE_KEY = "co-zones-collapsed";
  function collapsedZones() {
    try {
      return new Set(JSON.parse(localStorage.getItem(ZONE_KEY) || "[]"));
    } catch {
      return new Set();
    }
  }
  function rememberZone(id, collapsed) {
    try {
      const stored = collapsedZones();
      if (collapsed) stored.add(id);
      else stored.delete(id);
      localStorage.setItem(ZONE_KEY, JSON.stringify([...stored]));
    } catch {}
  }
  const zoneTokens = new WeakMap();
  function setZone(section, collapsed, remember = true) {
    const fold = section.querySelector(":scope > .co-zone-fold");
    const toggle = section.querySelector(":scope > .co-section-header > .co-zone-toggle");
    const token = (zoneTokens.get(section) || 0) + 1;
    zoneTokens.set(section, token);
    section.classList.remove("is-settled");
    section.classList.toggle("is-collapsed", collapsed);
    fold.inert = collapsed;
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.setAttribute("aria-label", (collapsed ? "展開「" : "收合「") + toggle.dataset.title + "」");
    toggle.querySelector("span").textContent = collapsed ? "展開" : "收合";
    if (!collapsed) {
      const settle = () => {
        if (zoneTokens.get(section) === token) section.classList.add("is-settled");
      };
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) settle();
      else setTimeout(settle, 480);
    }
    if (remember) rememberZone(section.id, collapsed);
  }
  function setHome(collapsed, remember = true) {
    document.body.classList.toggle("co-home-collapsed", collapsed);
    if (homeToggle) {
      homeToggle.setAttribute("aria-expanded", String(!collapsed));
      homeToggle.setAttribute("aria-label", (collapsed ? "展開" : "收合") + " RENGUIN OFFICE");
      homeToggle.querySelector("span").textContent = collapsed ? "展開" : "收合";
    }
    if (remember) rememberZone("renguin-home", collapsed);
  }
  // Bring the sky world into view and fly to an island in it.
  function visitIsland(id) {
    world?.stage.scrollIntoView({ block: "start" });
    world?.go(id);
  }
  function zoneSummary(zone, parts) {
    const line = zones.get(zone)?.summary;
    if (!line || line.dataset.key === parts.join("|")) return;
    line.dataset.key = parts.join("|");
    line.replaceChildren(...parts.map((text) => node("span", text)));
  }

  // Display tiers restate an existing view; they observe nothing new.
  function memberTier(view) {
    return view.running ? "working" : view.stamp ? "recent" : "quiet";
  }
  function projectLive(p) {
    return hasRunning(sourceId(p))
      ? "running"
      : projectDone(p)
        ? "done"
        : "idle";
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
        end_turn: "工作已完成",
        tool_use: "使用工具",
        forkPoint: "建立工作分支",
        error: "工作遇到問題",
      }[lastObservation?.last_native_event?.type] ||
      "更新工作紀錄";
    const summary =
      nativeWorking && !current
        ? nativeWorking.source === "CHATGPT_BROWSER_UI"
          ? "Chrome · " + nativeWorking.browser_context.name
          : "工作更新來自 " +
            (key === "CHATGPT_WORK" ? "Codex" : agents[key][0]) +
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
        const tier = memberTier(v);
        card.dataset.tier = tier;
        const identity = memberIdentity(v.key);
        const names = node("span", undefined, "co-member-names");
        const role = node("small", undefined, "co-member-role");
        for (const part of [identity.character, identity.role].filter(Boolean))
          role.append(node("span", part));
        names.append(node("h3", identity.name), role);
        const head = node("span", undefined, "co-member-id");
        head.append(memberAvatar(v.key), names);
        card.append(
          node(
            "span",
            { working: "工作中", recent: "最近活動", quiet: "尚無紀錄" }[tier],
            "co-tier",
          ),
          head,
          node("strong", v.text),
          node("p", v.summary),
          node("p", date(v.stamp), "co-muted"),
        );
        if (v.contexts.length) card.append(contextFrames(v.contexts));
        if (v.key === "CHATGPT_WORK" && browserStatus.connected)
          card.append(
            node("p", "Chrome · ChatGPT 已連線", "co-muted co-browser-status"),
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
      const layer = window.CreatorContexts.layer(context.kind);
      frame.title = layer + " · " + context.name + " · " + context.action;
      frame.append(
        node("small", layer),
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
          if (document.body.classList.contains("co-home-collapsed")) setHome(false);
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
  // A card lives on one island. Opening it flies there first, and only once the
  // camera has landed does the deck scroll to the card.
  function openProject(p, spotlight = false) {
    const find = () => [...root.querySelectorAll(".co-project")].find((e) => e.dataset.projectId === p.project_id);
    let card = find();
    if (!card && foldedDeckOf.has(p.project_id)) {
      setDeckOpen(foldedDeckOf.get(p.project_id), true);
      card = find();
    }
    if (!card) return showDetails(p);
    if (spotlight) {
      card.classList.remove("is-spotlit");
      void card.offsetWidth;
      card.classList.add("is-spotlit");
      setTimeout(() => card.classList.remove("is-spotlit"), 3200);
    }
    const reveal = () => {
      if (card.dataset.tier === "compact") {
        const island = world?.islandOf(card);
        if (island && !openDecks.has(island)) setDeckOpen(island, true);
        expanded.add(p.project_id);
        card.classList.add("is-expanded");
      }
      world?.stage.scrollIntoView({ block: "start" });
      card.scrollIntoView({ behavior: "smooth", block: "start" });
      card.tabIndex = -1;
      card.focus({ preventScroll: true });
    };
    const island = world?.islandOf(card);
    if (!world || !island || (!world.flying && world.current === island)) return reveal();
    const off = world.onSettle((landed) => {
      off();
      if (landed === island) reveal();
    });
    visitIsland(island);
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
            : (isShort(p) ? "會回到「短影音正在製作」。" : "會回到「長片正在製作」。")
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
            toast(previous ? "已取消完成" : (isShort(p) ? "已放入短影音完成" : "已放入長片完成"));
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
  // Finishing post-production is the one step the desk celebrates. The show
  // starts only after the mark is saved, so it never outruns the record.
  const celebrates = (id, turningOn) => turningOn && id === "AI_POST";
  function celebrate(p, card) {
    const rect = card
      ?.querySelector('[data-stage="AI_POST"]')
      ?.getBoundingClientRect();
    window.CreatorFireworks?.launch({
      origin: rect
        ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        : null,
      title: "後製完成！",
      detail: projectName(p),
    });
    toast("🎆 「" + projectName(p) + "」後製完成，辛苦了！");
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
        const card = [...root.querySelectorAll(".co-project")].find(
          (e) => e.dataset.projectId === p.project_id,
        );
        const feedback = card?.querySelector(".co-save-status");
        if (feedback) feedback.textContent = "✓ 進度已儲存";
        if (celebrates(id, turningOn)) celebrate(p, card);
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
  // Removing asks nothing; it waits instead. A removed card leaves the desk at
  // once but nothing is written until the undo window closes, so 復原 is exact:
  // the pin, the order and the history stay as they were. Only then is the
  // project hidden in the presentation store, as 移除專案 always did, and it can
  // still come back from 已移除的專案. Content OS and the files are never touched.
  const UNDO_MS = 7000;
  const pendingRemoval = new Map();
  let removalTimer = null,
    undoBar = null;
  function removeProject(p) {
    if (!storeReady || pendingRemoval.has(p.project_id)) return;
    pendingRemoval.set(p.project_id, projectName(p));
    expanded.delete(p.project_id);
    signature = "";
    render();
    showUndo();
    clearTimeout(removalTimer);
    removalTimer = setTimeout(commitRemovals, UNDO_MS);
  }
  function showUndo() {
    document.querySelector(".co-toast")?.remove();
    undoBar?.remove();
    const names = [...pendingRemoval.values()];
    undoBar = node("div", undefined, "co-toast co-undo");
    undoBar.role = "status";
    const text = node(
      "span",
      names.length === 1 ? "已移除專案「" + names[0] + "」" : "已移除 " + names.length + " 個專案",
      "co-undo-text",
    );
    const undo = button("復原", undoRemovals, "co-undo-button");
    undo.setAttribute("aria-label", names.length === 1 ? "復原「" + names[0] + "」" : "復原這 " + names.length + " 個專案");
    const fuse = node("span", undefined, "co-undo-fuse");
    fuse.style.animationDuration = UNDO_MS + "ms";
    undoBar.append(text, node("span", "｜", "co-undo-sep"), undo, fuse);
    document.body.append(undoBar);
  }
  function undoRemovals() {
    clearTimeout(removalTimer);
    removalTimer = null;
    const ids = [...pendingRemoval.keys()];
    pendingRemoval.clear();
    undoBar?.remove();
    undoBar = null;
    signature = "";
    render();
    toast(ids.length === 1 ? "已復原，專案回到原本的位置" : "已復原 " + ids.length + " 個專案");
    root
      .querySelector(`.co-project[data-project-id="${CSS.escape(ids[0] || "")}"] .co-project-drag`)
      ?.focus({ preventScroll: true });
  }
  async function commitRemovals() {
    clearTimeout(removalTimer);
    removalTimer = null;
    undoBar?.remove();
    undoBar = null;
    for (const id of [...pendingRemoval.keys()]) {
      // The card stays hidden while its write is in flight, then the store decides.
      const ok = await save("project", { project_id: id, hidden: true, confirmed: true });
      const name = pendingRemoval.get(id);
      pendingRemoval.delete(id);
      if (!ok) toast("「" + name + "」沒有移除成功，已放回原處。");
    }
    signature = "";
    render();
  }
  // Leaving the page keeps a removal the user let go of.
  window.addEventListener?.("pagehide", () => {
    if (!pendingRemoval.size) return;
    clearTimeout(removalTimer);
    for (const id of pendingRemoval.keys())
      fetch("/api/creator/project", {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: id, hidden: true, confirmed: true }),
      }).catch(() => {});
    pendingRemoval.clear();
  });
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
  function editProjectLink(p) {
    const link = presentation.projects[p.project_id]?.link;
    const d = modal(link ? "修改連結" : "設定連結");
    const form = node("form", undefined, "co-link-form");
    const label = node("label", "專案網址");
    const input = node("input");
    input.type = "text";
    input.inputMode = "url";
    input.autocomplete = "url";
    input.maxLength = 4096;
    input.placeholder = "https://… 或 YouTube 影片連結";
    input.value = link?.url || "";
    input.setAttribute("aria-label", "專案網址");
    label.append(input);
    const hint = node("p", "YouTube 影片可在封面播放；其他網址會另開分頁。", "co-muted");
    const submit = button("儲存連結", () => {} , "co-button primary");
    submit.type = "submit";
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (submit.disabled) return;
      if (!input.value.trim()) {
        input.setCustomValidity("請貼上網址；要清除已存連結，請按移除連結。");
        input.reportValidity();
        return;
      }
      submit.disabled = true;
      if (await save("project-link", { project_id: p.project_id, url: input.value, revision: presentation.revision })) {
        d.close();
        toast("連結已儲存");
      }
      submit.disabled = false;
    });
    input.addEventListener("input", () => input.setCustomValidity(""));
    form.append(label, hint, submit);
    if (link) form.append(button("移除連結", async () => {
      if (await save("project-link", { project_id: p.project_id, url: "", revision: presentation.revision })) {
        d.close();
        toast("已移除連結，封面仍保留");
      }
    }, "co-button quiet"));
    d.append(form);
    input.focus();
  }
  function playProjectVideo(p) {
    const link = presentation.projects[p.project_id]?.link;
    if (!/^[A-Za-z0-9_-]{11}$/.test(link?.youtube_id || "")) return;
    const card = [...root.querySelectorAll(".co-project")].find(c => c.dataset.projectId === p.project_id);
    const cover = card?.querySelector(".co-cover");
    if (!cover) return;
    const frame = node("iframe", undefined, "co-video-player");
    const params = new URLSearchParams({ autoplay: "1", playsinline: "1", rel: "0", start: String(link.start || 0) });
    frame.src = "https://www.youtube-nocookie.com/embed/" + link.youtube_id + "?" + params;
    frame.title = projectName(p) + " · YouTube 影片";
    frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    frame.allowFullscreen = true;
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    cover.replaceChildren(frame);
    cover.classList.add("is-playing");
    playingLinks.set(p.project_id, link.url);
    signature = "";
    render();
  }
  function projectLinkActions(p) {
    const link = presentation.projects[p.project_id]?.link;
    const actions = node("div", undefined, "co-link-actions");
    const edit = button(link ? "修改連結" : "＋ 設定連結", () => editProjectLink(p));
    edit.disabled = !storeReady;
    if (link?.url) {
      const open = node("a", "↗ 開啟連結", "co-button");
      open.href = link.url;
      open.target = "_blank";
      open.rel = "noopener noreferrer";
      actions.append(open);
      if (link.youtube_id) {
        if (playingLinks.get(p.project_id) === link.url) {
          actions.append(button("返回封面", () => {
            playingLinks.delete(p.project_id);
            signature = "";
            render();
          }));
        } else actions.append(button("▶ 播放影片", () => playProjectVideo(p), "co-button primary"));
      }
    }
    actions.append(edit);
    const area = node("div", undefined, "co-project-link");
    area.append(actions);
    if (link?.youtube_id) area.append(node("small", "若影片限制嵌入，請使用「開啟連結」觀看。", "co-muted"));
    return area;
  }
  function projectCard(p) {
    const card = node("article", undefined, "co-project");
    card.dataset.projectId = p.project_id;
    // Only a verified running lease lights the crystal; completion is the user's own mark.
    const live = projectLive(p);
    card.dataset.live = live;
    const doneSteps = completedSteps(p);
    const nextStep = enabledSteps(p).find((id) => !doneSteps.includes(id));
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
      const note = node("div", undefined, "co-cover-note");
      note.append(
        node("span", "▧", "co-cover-icon"),
        node("span", "把故事放在這裡"),
        node(
          "span",
          nextStep ? "現在 · " + routeLabels[nextStep] : "所有階段已完成",
          "co-cover-stage",
        ),
        node("small", isShort(p) ? "短影音 · 封面" : "16 : 9 · 企劃封面"),
      );
      placeholder.append(note);
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
    const mediaActions = projectLinkActions(p);
    mediaActions.querySelector(".co-link-actions").prepend(...coverActions.children);
    card.append(projectCrystal(p, cover));
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
    // Progress and the route on one side, links, records and actions on the
    // other: a wide deck card reads across; a narrow one simply stacks them.
    const main = node("div", undefined, "co-body-main");
    const side = node("div", undefined, "co-body-side");
    const columns = node("div", undefined, "co-body-grid");
    columns.append(main, side);
    const fresh = freshIds.has(p.project_id);
    card.dataset.fresh = String(fresh);
    if (fresh) body.append(node("p", "✦ 最新加入 · " + joinedText(p), "co-fresh-badge"));
    body.append(heading, columns);
    side.append(mediaActions);
    // Everything marked co-more waits behind 展開 on a folded crystal: the
    // source, the records and the rarer actions. Progress, the route and the
    // two everyday actions stay in view.
    main.append(
      node(
        "p",
        "對應企劃 · " + (p.source_name || "尚未指定"),
        "co-source-name co-more",
      ),
    );
    const copiedFrom = presentation.projects[p.project_id]?.copied_from;
    if (copiedFrom?.name)
      main.append(node("p", "複製自長片「" + copiedFrom.name + "」", "co-source-name co-copied-from co-more"));
    const completed = doneSteps;
    const next = nextStep;
    const statusBlock = node("div", undefined, "co-progress");
    if (live === "running")
      statusBlock.append(node("p", "此刻有人正在這裡工作", "co-live-flag"));
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
    main.append(statusBlock);
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
    main.append(route);
    const feedback = node(
      "p",
      "點選階段即可更新；完成後段會自動補齊前面。",
      "co-save-status",
    );
    feedback.role = "status";
    main.append(feedback);
    if (manual(p)?.done)
      main.append(
        node("p", "✓ 你已標記完成 · " + date(manual(p).timestamp), "co-state co-more"),
      );
    const milestones = node("ul", undefined, "co-milestones co-more");
    const recent = recentRecords(p);
    if (recent.length) side.append(node("h4", "最近紀錄", "co-recent-heading co-more"));
    for (const row of recent) {
      const li = node("li");
      li.append(
        node("time", date(row.timestamp)),
        node("span", row.text),
        node("small", row.source),
      );
      milestones.append(li);
    }
    if (recent.length) side.append(milestones);
    const actions = node("div", undefined, "co-actions");
    const done = button(
      manual(p)?.done ? "取消完成" : "✓ 做好了",
      () => confirmDone(p),
      "co-button primary",
    );
    done.disabled = !storeReady;
    actions.append(done);
    // The same copy the drag makes, for keyboards and for phones where the
    // short-video island sits below rather than beside.
    if (!isShort(p) && !projectDone(p)) {
      const copy = button("⇢ 複製到短影音", () => copyToShort(p), "co-button quiet co-copy-short");
      copy.title = "在「短影音正在製作」複製一份（素材 → 後製 → 上映），長片保留在原處";
      copy.disabled = !storeReady;
      actions.append(copy);
    }
    actions.append(
      button("對應企劃", () => projectSource(p), "co-button quiet co-more"),
      button(isShort(p) ? "流程設定" : "設定階段", () => stageSettings(p), "co-button quiet co-more"),
      button("完整時間軸", () => showTimeline(p), "co-button quiet co-more"),
      button("查看詳情", () => showDetails(p), "co-button quiet co-more"),
      button("移除專案", () => removeProject(p), "co-button danger co-more"),
      expandToggle(card, p, "⋯ 更多"),
    );
    side.append(actions);
    card.append(body);
    return card;
  }
  function projectSource(p, format = "LONG") {
    const short = !p && format === "SHORT";
    const d = modal(p ? "對應企劃" : short ? "新增短影音" : "新增專案");
    const name = node("input");
    name.maxLength = 120;
    name.placeholder = short ? "短影音名稱" : "專案名稱";
    name.setAttribute("aria-label", name.placeholder);
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
    );
    if (short)
      d.append(node("p", "短影音的流程只有 素材 → 後製 → 上映。", "co-muted"));
    d.append(
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
                : { display_name: name.value.trim(), ...(short ? { format } : {}) }),
              source_project_id: select.value || null,
            })
          ) {
            d.close();
            toast(p ? "已更新對應企劃" : short ? "已新增短影音" : "已新增專案");
          }
        },
        "co-button primary",
      ),
    );
  }
  async function changeFormat(p, format, d) {
    if (
      await save("project-format", {
        project_id: p.project_id,
        format,
        revision: presentation.revision,
      })
    ) {
      d.close();
      toast(
        "「" + projectName(p) + "」" +
          (format === "SHORT" ? "已改為短影音流程" : "已改為長影片流程"),
      );
      openProject(p);
    }
  }
  function stageSettings(p) {
    const short = isShort(p);
    const d = modal(short ? "流程設定" : "設定階段");
    const kind = node("div", undefined, "co-format-switch");
    kind.append(
      node("h3", short ? "目前是短影音" : "目前是長影片"),
      node(
        "p",
        short
          ? "短影音的流程固定為 素材 → 後製 → 上映。改為長影片後會回到「長片正在製作」，可再自行勾選階段。"
          : "改為短影音後會移到「短影音正在製作」，流程只保留 素材 → 後製 → 上映。已完成到哪一步會跟著帶過去。",
        "co-muted",
      ),
    );
    const switchButton = button(
      short ? "改為長影片" : "改為短影音",
      () => changeFormat(p, short ? "LONG" : "SHORT", d),
      "co-button",
    );
    switchButton.disabled = !storeReady;
    kind.append(switchButton);
    d.append(kind);
    if (short) return;
    d.append(
      node("h3", "需要的階段"),
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
  // A project is a crystal of its island's colour: the cover sits in the cut
  // face, shards rise behind it, and its panel hangs from the base.
  function projectCrystal(p, cover) {
    const crystal = node("div", undefined, "co-crystal");
    const aura = node("div", undefined, "co-crystal-aura");
    const crown = node("div", undefined, "co-crystal-crown");
    for (let i = 0; i < 7; i++) crown.append(node("span", undefined, "co-shard"));
    const core = node("div", undefined, "co-crystal-core");
    const glint = node("span", undefined, "co-crystal-glint");
    const face = node("div", undefined, "co-crystal-face");
    face.append(cover);
    const gem = node("div", undefined, "co-crystal-gem");
    gem.append(face, glint);
    const edge = node("div", undefined, "co-crystal-edge");
    edge.append(gem);
    for (const part of [aura, crown, core, glint]) part.setAttribute("aria-hidden", "true");
    crystal.append(aura, crown, core, edge);
    if (projectDone(p))
      for (const [left, top, delay] of [
        ["16%", "30%", "0s"],
        ["80%", "22%", "1.5s"],
        ["62%", "70%", "2.9s"],
      ]) {
        const spark = node("span", undefined, "co-spark");
        spark.setAttribute("aria-hidden", "true");
        spark.style.left = left;
        spark.style.top = top;
        spark.style.setProperty("--delay", delay);
        crystal.append(spark);
      }
    return crystal;
  }
  // A project's resident flies the sky around the project's island, and now and
  // then rests on the islet beside the island's title platform, where the swing
  // and the tree stand.
  function residentOf(p) {
    const name = presentation.projects[p.project_id]?.resident_character;
    return (name && window.CreatorResidents?.find((c) => c.name === name)) || null;
  }
  // 任務雲 files every todo under one of four columns. A todo from before the
  // columns has no category and is filed by this rule, word for word the one in
  // creator_presentation.py; whatever it cannot place goes to 其他.
  const TODO_COLUMNS = [
    { id: "REPO", label: "REPO", icon: "⌘" },
    { id: "PROJECT", label: "企劃", icon: "✎" },
    { id: "OFFICE", label: "STAR OFFICE", icon: "✦" },
    { id: "OTHER", label: "其他", icon: "☁" },
  ];
  const TODO_IDS = TODO_COLUMNS.map((c) => c.id);
  const TODO_WORDS = [
    ["OFFICE", /star\s*office|辦公室|(?<![A-Za-z0-9])office(?![A-Za-z0-9])/i],
    ["REPO", /(?<![A-Za-z0-9])(?:repos?|repository|git|github|gitlab|commits?|branch|pull request)(?![A-Za-z0-9])|儲存庫|程式碼|原始碼/i],
    ["PROJECT", /企劃|短影音|長片|影片|影音|剪輯|後製|上映|拍攝|腳本|字幕|(?<![A-Za-z0-9])(?:youtube|yt)(?![A-Za-z0-9])/i],
  ];
  function todoCategory(item, key = "") {
    if (TODO_IDS.includes(item?.category)) return item.category;
    if (String(key || item?.id || "").startsWith("ai:") || item?.project_id) return "PROJECT";
    const text = `${item?.title || ""} ${item?.notes || ""}`;
    return TODO_WORDS.find(([, words]) => words.test(text))?.[0] || "OTHER";
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
        category: "PROJECT",
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
    return [...data.values()]
      .map((item) => ({ ...item, category: todoCategory(item, item.id) }))
      .sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9));
  }
  function editInbox(item = {}) {
    const d = modal(item.id ? "編輯待辦" : "新增待辦");
    const form = node("form");
    const fields = {};
    for (const [key, label] of [
      ["title", "標題"],
      ["category", "分類"],
      ["project_id", "關聯企劃"],
      ["notes", "備註"],
      ["date", "日期（選填）"],
      ["priority", "優先順序（選填）"],
    ]) {
      const wrap = node("label", label);
      let input;
      if (["project_id", "priority", "category"].includes(key)) {
        input = node("select");
        const values =
          key === "category"
            ? TODO_COLUMNS.map((c) => [c.id, c.label])
            : key === "project_id"
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
      input.value = key === "category" ? todoCategory(item) : item[key] || "";
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
      category: todoCategory(item),
      ...patch,
    });
  }
  // Dropped into another column, a todo changes its category first and then
  // takes the place it was dropped on.
  async function moveTodo(source, target, category) {
    const item = inboxItems.find((i) => i.id === source);
    if (!item || !TODO_IDS.includes(category)) return;
    if (item.category !== category) {
      if (!(await updateInbox(item, { category }))) return;
      if (!target) toast("已移到「" + TODO_COLUMNS.find((c) => c.id === category).label + "」");
    }
    if (target && target !== source) await reorder(source, target);
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
  // 任務雲 is one cloud over the sky world, four columns of equal width. ＋ in a
  // column writes straight into that column, every item has a box of its own,
  // and ticking it off or back on is one click. Dragging a todo reorders its
  // column or carries it into another. The add rows are built once, so a live
  // refresh never swallows what is being typed.
  function buildTodo() {
    const head = node("header", undefined, "cw-cloud-head");
    const title = node("h2", undefined, "cw-cloud-title");
    const glyph = node("span", "✦", "cw-cloud-glyph");
    glyph.setAttribute("aria-hidden", "true");
    title.append(glyph, "任務雲");
    todoSummary = node("p", undefined, "cw-cloud-summary");
    todoArchive = button("已收起的待辦", () => showArchive(), "co-button quiet cw-cloud-archive");
    todoArchive.hidden = true;
    head.append(title, todoSummary, todoArchive);
    const columns = node("div", undefined, "cw-cloud-cols");
    for (const col of TODO_COLUMNS) {
      const box = node("section", undefined, "cw-cloud-col");
      box.dataset.category = col.id;
      box.setAttribute("aria-label", col.label + " 待辦");
      const top = node("header", undefined, "cw-col-head");
      const gem = node("span", col.icon, "cw-col-gem");
      gem.setAttribute("aria-hidden", "true");
      const count = node("span", "0", "cw-col-count");
      count.setAttribute("aria-label", "未完成");
      top.append(gem, node("h3", col.label), count);
      const form = node("form", undefined, "co-todo-add");
      const input = node("input");
      input.type = "text";
      input.maxLength = 240;
      input.placeholder = "寫下" + col.label + "的事，按 Enter";
      input.setAttribute("aria-label", "新增「" + col.label + "」待辦");
      const add = node("button", "＋", "co-button primary cw-todo-plus");
      add.type = "submit";
      add.setAttribute("aria-label", "加入「" + col.label + "」待辦");
      form.append(input, add);
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text || add.disabled) return;
        if (!storeReady) {
          toast("暫時無法儲存，請稍後再試。");
          return;
        }
        add.disabled = true;
        if (await save("inbox", { title: text, category: col.id })) input.value = "";
        add.disabled = false;
        input.focus();
      });
      const list = node("ul", undefined, "co-todo-items");
      list.addEventListener("dragover", (e) => {
        if (dragId) e.preventDefault();
      });
      list.addEventListener("drop", async (e) => {
        if (e.target.closest?.("[data-inbox-id]")) return;
        e.preventDefault();
        const id = dragId || e.dataTransfer.getData("text/plain");
        dragging = false;
        dragId = null;
        await moveTodo(id, null, col.id);
      });
      box.append(top, form, list);
      columns.append(box);
      todoColumns[col.id] = { box, list, input, count };
    }
    inboxRoot.append(head, columns);
  }
  function focusTodo(category = "OTHER") {
    world?.stage.scrollIntoView({ block: "start" });
    todoColumns[category]?.input.focus({ preventScroll: true });
  }
  function showArchive() {
    const d = modal("已收起的待辦");
    const today = day(Date.now() / 1000);
    const archived = inboxItems.filter(
      (i) => i.state === "ignored" || (i.state === "done" && day(i.completed_at) !== today),
    );
    if (!archived.length) d.append(node("p", "沒有已收起的待辦。"));
    for (const item of archived) {
      const line = node("p", undefined, "co-actions");
      const label = TODO_COLUMNS.find((c) => c.id === item.category)?.label || "其他";
      line.append(
        node(
          "span",
          label + " · " + item.title + " · " + (item.state === "ignored" ? "已移除" : "完成於 " + date(item.completed_at)),
        ),
        button(
          "恢復",
          async () => {
            if (await updateInbox(item, { state: "today" })) {
              d.close();
              toast("已恢復「" + item.title + "」");
            }
          },
          "co-button quiet",
        ),
      );
      d.append(line);
    }
  }
  function todoRow(item, today) {
    const done = item.state === "done";
    const row = node("li", undefined, "co-todo" + (done ? " is-done" : ""));
    row.dataset.inboxId = item.id;
    row.dataset.category = item.category;
    row.draggable = true;
    const drop = async (source) => {
      if (!source || source === item.id) return;
      const moving = inboxItems.find((i) => i.id === source);
      if (moving && moving.category !== item.category) await moveTodo(source, item.id, item.category);
      else await reorder(source, item.id);
    };
    row.addEventListener("dragstart", (e) => {
      if (!e.target.closest?.(".co-grip") && e.target !== row) {
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
      await drop(dragId || e.dataTransfer.getData("text/plain"));
      dragId = null;
    });
    const grip = button("⠿", () => toast("拖曳可排序或移到其他欄；鍵盤可按 Alt + 上下方向鍵。"), "co-grip");
    grip.setAttribute("aria-label", "調整「" + item.title + "」的順序");
    grip.addEventListener("keydown", async (e) => {
      if (e.altKey && ["ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        const column = inboxItems.filter(
          (i) => i.category === item.category && (["today", "later"].includes(i.state) || (i.state === "done" && day(i.completed_at) === today)),
        );
        const index = column.findIndex((i) => i.id === item.id) + (e.key === "ArrowUp" ? -1 : 1);
        await reorder(item.id, column[index]?.id);
        todoColumns[item.category]?.list.querySelector(`[data-inbox-id="${CSS.escape(item.id)}"] .co-grip`)?.focus();
      }
    });
    grip.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "touch") return;
      e.preventDefault();
      dragId = item.id;
      dragging = true;
      grip.setPointerCapture(e.pointerId);
      row.classList.add("is-dragging");
    });
    grip.addEventListener("pointerup", async (e) => {
      if (e.pointerType !== "touch" || !dragging) return;
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const target = under?.closest("[data-inbox-id]"),
        column = under?.closest(".cw-cloud-col");
      dragging = false;
      row.classList.remove("is-dragging");
      if (target) await drop(dragId);
      else if (column) await moveTodo(dragId, null, column.dataset.category);
      dragId = null;
    });
    grip.addEventListener("pointercancel", () => {
      dragging = false;
      dragId = null;
      row.classList.remove("is-dragging");
    });
    const check = node("label", undefined, "co-todo-check");
    const box = node("input");
    box.type = "checkbox";
    box.checked = done;
    box.disabled = !storeReady;
    box.setAttribute("aria-label", (done ? "取消完成「" : "完成「") + item.title + "」");
    box.addEventListener("change", async () => {
      box.disabled = true;
      if (!(await updateInbox(item, { state: box.checked ? "done" : "today", date: "" })))
        box.checked = !box.checked;
      box.disabled = !storeReady;
    });
    const p = allProjects().find((p) => p.project_id === item.project_id);
    const text = node("span", undefined, "co-todo-text");
    text.append(node("span", item.title, "co-todo-title"));
    const meta = [
      validTime(item.created_at) ? date(item.created_at, true) : null,
      p ? projectName(p) : null,
      item.id.startsWith("ai:") ? item.provenance : null,
      !done && (item.state === "later" || (item.date && item.date > today))
        ? "之後" + (item.date ? " · " + item.date : "")
        : null,
      item.priority === "high" ? "優先" : null,
    ].filter(Boolean);
    if (meta.length) text.append(node("small", meta.join(" · "), "co-todo-meta"));
    if (item.notes) text.append(node("small", item.notes, "co-todo-notes"));
    check.append(box, text);
    const actions = node("div", undefined, "co-todo-actions");
    const edit = button("✎", () => editInbox(item), "co-button quiet");
    edit.title = "編輯";
    edit.setAttribute("aria-label", "編輯「" + item.title + "」");
    actions.append(edit);
    if (p) {
      const open = button("↗", () => openProject(p), "co-button quiet");
      open.title = "打開企劃";
      open.setAttribute("aria-label", "打開企劃「" + projectName(p) + "」");
      actions.append(open);
    }
    const remove = button(
      "✕",
      async () => {
        if (await updateInbox(item, { state: "ignored" }))
          toast("已收起「" + item.title + "」，可在「已收起的待辦」恢復。");
      },
      "co-button quiet co-todo-remove",
    );
    remove.title = "移除";
    remove.setAttribute("aria-label", "移除「" + item.title + "」");
    actions.append(remove);
    row.append(grip, check, actions);
    return row;
  }
  function renderInbox() {
    const nextItems = mergedInbox();
    const nextHash = JSON.stringify([nextItems, day(Date.now() / 1000), storeReady]);
    if (nextHash === inboxSignature) return;
    inboxSignature = nextHash;
    inboxItems = nextItems;
    const today = day(Date.now() / 1000);
    let open = 0,
      doneToday = 0;
    // Open items first in the user's order; what was ticked today stays in view,
    // struck through, until the day ends.
    for (const col of TODO_COLUMNS) {
      const { list, count, box } = todoColumns[col.id];
      const mine = inboxItems.filter((i) => i.category === col.id);
      const waiting = mine.filter((i) => ["today", "later"].includes(i.state));
      const ticked = mine.filter((i) => i.state === "done" && day(i.completed_at) === today);
      open += waiting.length;
      doneToday += ticked.length;
      list.replaceChildren(...[...waiting, ...ticked].map((item) => todoRow(item, today)));
      if (!waiting.length && !ticked.length) list.append(node("li", "還沒有待辦", "cw-col-empty"));
      count.textContent = String(waiting.length);
      box.classList.toggle("is-empty", !waiting.length && !ticked.length);
    }
    todoSummary.replaceChildren(
      node("span", open + " 件待辦"),
      ...(doneToday ? [node("span", doneToday + " 件今天完成")] : []),
    );
    const archived = inboxItems.filter(
      (i) => i.state === "ignored" || (i.state === "done" && day(i.completed_at) !== today),
    ).length;
    todoArchive.hidden = !archived;
    todoArchive.textContent = "已收起的待辦 · " + archived;
  }
  // Four shelves are arranged by hand. The two working shelves never share a
  // card, so they write one working order between them; the two finished shelves
  // share a completed order of their own.
  const shelves = {
    active: {
      section: "active-projects",
      scope: "active",
      field: "project_order",
      ids: () => activeProjectIds,
      saved: "企劃順序已儲存",
    },
    short: {
      section: "short-videos",
      scope: "active",
      field: "project_order",
      ids: () => shortProjectIds,
      saved: "短影音順序已儲存",
    },
    completed: {
      section: "recently-completed",
      scope: "completed",
      field: "completed_order",
      ids: () => completedProjectIds,
      saved: "完成順序已儲存",
    },
    shortCompleted: {
      section: "short-completed",
      scope: "completed",
      field: "completed_order",
      ids: () => shortCompletedIds,
      saved: "完成順序已儲存",
    },
  };
  async function moveProject(source, target, shelf = "active") {
    if (!source || !target || source === target) return;
    if (shelf === "active") {
      const pinnedIds = new Set(activeProjectIds.slice(0, pinnedCount));
      if (pinnedIds.has(source) || pinnedIds.has(target)) {
        toast("置頂企劃固定排在最前面；取消置頂後才能拖曳排序。");
        return;
      }
    }
    const { scope, field, ids: current, saved } = shelves[shelf];
    const ids = [...current()];
    const from = ids.indexOf(source),
      to = ids.indexOf(target);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, source);
    // Keep the rest of the stored order, less anything the source no longer lists.
    const known = new Set(
      allProjects()
        .filter((p) => p.classification === "REGISTERED")
        .map((p) => p.project_id),
    );
    const retained = (presentation[field] || []).filter(
      (id) => !ids.includes(id) && known.has(id),
    );
    if (await save("project-order", { order: [...ids, ...retained], scope })) {
      toast(saved);
      root
        .querySelector(
          `[data-project-id="${CSS.escape(source)}"] .co-project-drag`,
        )
        ?.focus({ preventScroll: true });
    }
  }
  // A long-form card dropped on 短影音正在製作 is copied there; the original stays put.
  async function copyToShort(p) {
    if (!(await save("project-copy", { project_id: p.project_id, format: "SHORT" }))) return;
    const copy = Object.entries(presentation.projects).find(
      ([, meta]) => meta.copied_from?.project_id === p.project_id && !meta.hidden,
    );
    toast("已複製「" + projectName(p) + "」到短影音 · 長片仍保留在原處");
    const card = copy && root.querySelector(`[data-project-id="${CSS.escape(copy[0])}"]`);
    if (!card) return;
    card.classList.remove("is-just-copied");
    void card.offsetWidth;
    card.classList.add("is-just-copied");
    setTimeout(() => card.classList.remove("is-just-copied"), 2600);
  }
  // The short copy a long-form card already has, if any.
  function shortCopyOf(p) {
    const found = Object.entries(presentation.projects).find(
      ([id, meta]) => meta.copied_from?.project_id === p.project_id && !meta.hidden && Object.hasOwn(presentation.local_projects || {}, id),
    );
    return found && { project_id: found[0] };
  }
  // A card dropped on 短影音完成 lands there finished: a long-form card as a
  // finished short copy of itself (the long card stays where it is), a short
  // video as itself. A long card already copied finishes that copy instead of
  // making a second one.
  async function finishShort(p) {
    const copy = isShort(p) ? p : shortCopyOf(p);
    if (copy && projectDone(copy)) {
      toast("「" + projectName(p) + "」已經在短影音完成了");
      return;
    }
    const saved = copy
      ? await save("done", { project_id: copy.project_id, done: true })
      : await save("project-copy", { project_id: p.project_id, format: "SHORT", done: true });
    if (!saved) return;
    toast(isShort(p) ? "已放入短影音完成" : "已把「" + projectName(p) + "」放入短影音完成 · 長片仍保留在原處");
    const landed = isShort(p) ? p : shortCopyOf(p);
    const card = landed && root.querySelector(`[data-project-id="${CSS.escape(landed.project_id)}"]`);
    if (!card) return;
    card.classList.remove("is-just-copied");
    void card.offsetWidth;
    card.classList.add("is-just-copied");
    setTimeout(() => card.classList.remove("is-just-copied"), 2600);
  }
  // One card is carried at a time: from its ⠿ handle at once, or from the card
  // itself after a short move with a mouse or a long press with a finger, so a
  // swipe that scrolls the page never lifts anything. While carried, a card on
  // its own shelf reorders, the short-video island copies a long-form card, and
  // the stardust recycler at the bottom of the screen removes it — only when the
  // card is let go inside the recycler's core. Dragged out again, it is safe.
  const dragPlans = new WeakMap();
  const LONG_PRESS_MS = 420,
    PRESS_SLOP = 10,
    MOUSE_SLOP = 6;
  const CARD_CONTROLS =
    "button, a, input, textarea, select, label, summary, iframe, video, form, [contenteditable], .co-video-player";
  let drag = null;
  function bindCardDrag(card) {
    if (card.dataset.dragBound) return;
    card.dataset.dragBound = "true";
    card.addEventListener("pointerdown", (e) => {
      if (drag || !storeReady || editingName || e.button !== 0 || !dragPlans.has(card)) return;
      if (e.target.closest(CARD_CONTROLS)) return;
      const touch = e.pointerType !== "mouse";
      const press = { x: e.clientX, y: e.clientY, id: e.pointerId, timer: 0 };
      const off = () => {
        clearTimeout(press.timer);
        card.classList.remove("is-pressing");
        removeEventListener("pointermove", move);
        removeEventListener("pointerup", off);
        removeEventListener("pointercancel", off);
      };
      const move = (ev) => {
        if (ev.pointerId !== press.id) return;
        const far = Math.hypot(ev.clientX - press.x, ev.clientY - press.y);
        if (touch) {
          if (far > PRESS_SLOP) off();
        } else if (far > MOUSE_SLOP) {
          off();
          startDrag(card, ev, card);
        }
      };
      addEventListener("pointermove", move);
      addEventListener("pointerup", off);
      addEventListener("pointercancel", off);
      if (!touch) return;
      card.classList.add("is-pressing");
      card.style.setProperty("--press-ms", LONG_PRESS_MS + "ms");
      press.timer = setTimeout(() => {
        off();
        // Chrome refuses (and logs) a buzz before the page has had a tap.
        if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(12);
        startDrag(card, { clientX: press.x, clientY: press.y, pointerId: press.id }, card);
      }, LONG_PRESS_MS);
    });
    // A long press must not open the phone's own menu.
    card.addEventListener("contextmenu", (e) => {
      if (card.classList.contains("is-pressing") || drag?.card === card) e.preventDefault();
    });
  }
  // The recycler: a small black hole that wakes when a card heads down, pulls
  // harder as the card nears, and swallows it only on release inside its core.
  function stardustRecycler() {
    const el = node("div", undefined, "co-trash");
    el.setAttribute("aria-hidden", "true");
    const hole = node("div", undefined, "co-trash-hole");
    for (let i = 0; i < 8; i++) {
      const mote = node("i", undefined, "co-trash-mote");
      mote.style.setProperty("--i", i);
      hole.append(mote);
    }
    hole.append(node("span", undefined, "co-trash-disk"), node("span", undefined, "co-trash-core"));
    const label = node("div", undefined, "co-trash-label");
    const hint = node("small", "拖到這裡移除 · 可以復原");
    label.append(node("strong", "星塵回收艙"), hint);
    // The box stays put and takes the drop; only the body inside rises and glows,
    // so where it pulls never lags behind where it is drawn.
    const body = node("div", undefined, "co-trash-body");
    body.append(hole, label);
    el.append(body);
    let geometry = null,
      armed = false;
    const measure = () => {
      // It floats above the island dock whenever the dock is on screen.
      const dock = document.querySelector(".cw-dock")?.getBoundingClientRect();
      const lift = dock?.width && dock.top < innerHeight && dock.bottom > 0 ? innerHeight - dock.top + 8 : 0;
      el.style.setProperty("--lift", Math.max(0, lift) + "px");
      const r = el.getBoundingClientRect();
      const size = hole.offsetWidth;
      geometry = { x: r.left + r.width / 2, y: r.top + size / 2, r: size / 2 };
    };
    return {
      el,
      measure,
      // 0 far away, rising to 0.95 at the rim; 1 only inside the core.
      pull(x, y) {
        if (!geometry) measure();
        const d = Math.hypot(x - geometry.x, y - geometry.y);
        const core = geometry.r * 1.1,
          reach = geometry.r * 3.4;
        const pull = d <= core ? 1 : Math.max(0, Math.min(0.95, 1 - (d - core) / (reach - core)));
        el.style.setProperty("--pull", pull.toFixed(3));
        if ((pull >= 1) !== armed) {
          armed = pull >= 1;
          el.classList.toggle("is-armed", armed);
          hint.textContent = armed ? "放開即移除" : "拖到這裡移除 · 可以復原";
        }
        return pull;
      },
      wake() {
        el.classList.add("is-awake");
      },
      center: () => geometry,
    };
  }
  function startDrag(card, e, capture) {
    const plan = dragPlans.get(card);
    if (!plan || drag) return;
    const { p, shelf } = plan;
    const copies = shelf === "active";
    // A long-form card can land on 短影音完成 as a finished short; a short video
    // in the making can simply be finished there.
    const finishes = copies || shelf === "short";
    projectDragId = p.project_id;
    dragging = true;
    try {
      capture.setPointerCapture(e.pointerId);
    } catch {}
    getSelection?.()?.removeAllRanges();
    card.classList.add("is-dragging");
    document.body.classList.add("co-card-dragging");
    // The card's name travels with the pointer, so wherever it goes it is
    // visibly carrying something.
    const ghost = node("div", undefined, "co-drag-ghost");
    ghost.setAttribute("aria-hidden", "true");
    const cover = presentation.projects[p.project_id]?.cover?.url;
    if (cover) {
      const img = node("img");
      img.src = cover;
      img.alt = "";
      ghost.append(img);
    }
    const hint = copies
      ? "拖到右邊「短影音正在製作」或「短影音完成」"
      : finishes
        ? "放到其他卡片上排序，或拖到右邊「短影音完成」"
        : "放到其他卡片上排序";
    ghost.append(node("strong", projectName(p)), node("small", hint));
    // The short-video islands are far shorter than the long-form column, so from
    // most cards they are out of sight; pads in view always take the drop.
    let pad = null,
      donePad = null,
      rail = null;
    if (finishes) {
      rail = node("div", undefined, "co-drop-rail");
      rail.setAttribute("aria-hidden", "true");
    }
    if (copies) {
      pad = node("div", undefined, "co-short-drop");
      pad.append(node("span", "▮", "co-short-drop-icon"), node("strong", "短影音正在製作"), node("small", "拖到這裡 · 複製一份"));
      rail.append(pad);
      document.body.classList.add("co-copying-short");
    }
    if (finishes) {
      donePad = node("div", undefined, "co-done-drop");
      donePad.dataset.idle = copies ? "拖到這裡 · 複製一份並標記完成" : "拖到這裡 · 標記完成";
      donePad.append(node("span", "✦", "co-short-drop-icon"), node("strong", "短影音完成"), node("small", donePad.dataset.idle));
      rail.append(donePad);
    }
    const recycler = stardustRecycler();
    document.body.append(...[rail, recycler.el, ghost].filter(Boolean));
    recycler.measure();
    drag = { card, p, shelf, copies, finishes, ghost, pad, donePad, rail, recycler, hint, pointerId: e.pointerId, startY: e.clientY, target: null, overShort: false, overDone: false, overTrash: false };
    addEventListener("pointermove", onDragMove, { passive: false });
    addEventListener("pointerup", onDragEnd);
    addEventListener("pointercancel", cancelDrag);
    addEventListener("keydown", dragKey, true);
    addEventListener("touchmove", holdPage, { passive: false });
    addEventListener("resize", recycler.measure);
    onDragMove(e);
  }
  // Once a finger has lifted a card, the page must not scroll under it.
  function holdPage(e) {
    if (drag && e.cancelable) e.preventDefault();
  }
  function dragKey(e) {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    cancelDrag();
  }
  function onDragMove(e) {
    if (!drag || (e.pointerId !== undefined && e.pointerId !== drag.pointerId)) return;
    e.preventDefault?.();
    const { p, shelf, copies, finishes, ghost, pad, donePad, recycler } = drag;
    const hovered = document.elementFromPoint(e.clientX, e.clientY);
    const pull = recycler.pull(e.clientX, e.clientY);
    if (pull > 0 || e.clientY - drag.startY > 24) recycler.wake();
    const overTrash = pull >= 1;
    // A card is ordered on its own shelf; a long-form card may also be copied
    // onto the short-video island, anywhere on it, onto its beacon, or the pad.
    const overShort =
      !overTrash && copies && !!hovered?.closest(`#${shelves.short.section}, .co-short-drop, .cw-beacon[data-island="short"]`);
    // …and it, or a short video in the making, may land on 短影音完成 finished.
    const overDone =
      !overTrash && !overShort && finishes && !!hovered?.closest(`#${shelves.shortCompleted.section}, .co-done-drop, .cw-beacon[data-island="short-result"]`);
    // Holding still on a pad, the dock or near the recycler must not scroll the page away.
    if (!hovered?.closest(".co-drop-rail, .cw-dock") && pull === 0) {
      if (e.clientY < 65) window.scrollBy(0, -24);
      else if (e.clientY > innerHeight - 65) window.scrollBy(0, 24);
    }
    // Near the core the card shrinks and is drawn toward it.
    const hole = recycler.center();
    const tow = overTrash ? 0.6 : pull * 0.35;
    const x = e.clientX + (hole.x - e.clientX) * tow,
      y = e.clientY + (hole.y - e.clientY) * tow;
    ghost.style.translate = `${x}px ${y}px`;
    ghost.style.setProperty("--pull", pull.toFixed(3));
    ghost.classList.toggle("is-trash", overTrash);
    drag.card.classList.toggle("is-trash-armed", overTrash);
    document.getElementById(shelves.short.section)?.classList.toggle("is-copy-target", overShort);
    document.querySelector('.cw-beacon[data-island="short"]')?.classList.toggle("is-copy-target", overShort);
    pad?.classList.toggle("is-copy-target", overShort);
    if (pad) pad.querySelector("small").textContent = overShort ? "放開 · 複製一份，長片保留" : "拖到這裡 · 複製一份";
    document.getElementById(shelves.shortCompleted.section)?.classList.toggle("is-copy-target", overDone);
    document.querySelector('.cw-beacon[data-island="short-result"]')?.classList.toggle("is-copy-target", overDone);
    donePad?.classList.toggle("is-copy-target", overDone);
    if (donePad)
      donePad.querySelector("small").textContent = overDone ? (copies ? "放開 · 放入短影音完成，長片保留" : "放開 · 標記完成") : donePad.dataset.idle;
    ghost.classList.toggle("is-copy", overShort || overDone);
    ghost.querySelector("small").textContent = overTrash
      ? "放開 → 移除，可以復原"
      : overShort
        ? "放開 → 複製到短影音，長片保留"
        : overDone
          ? copies
            ? "放開 → 放入短影音完成，長片保留"
            : "放開 → 放入短影音完成"
          : drag.hint;
    const target = overShort || overDone || overTrash ? null : hovered?.closest(`#${shelves[shelf].section} .co-project`);
    drag.target = target && target.dataset.projectId !== p.project_id ? target.dataset.projectId : null;
    root.querySelectorAll(".is-drop-target").forEach((el) => el.classList.remove("is-drop-target"));
    if (drag.target) target.classList.add("is-drop-target");
    drag.overShort = overShort;
    drag.overDone = overDone;
    drag.overTrash = overTrash;
  }
  function endDrag(swallowed) {
    const { card, ghost, rail, recycler } = drag;
    removeEventListener("pointermove", onDragMove, { passive: false });
    removeEventListener("pointerup", onDragEnd);
    removeEventListener("pointercancel", cancelDrag);
    removeEventListener("keydown", dragKey, true);
    removeEventListener("touchmove", holdPage, { passive: false });
    removeEventListener("resize", recycler.measure);
    drag = null;
    dragging = false;
    projectDragId = null;
    rail?.remove();
    document.body.classList.remove("co-copying-short", "co-card-dragging");
    for (const [section, island] of [[shelves.short.section, "short"], [shelves.shortCompleted.section, "short-result"]]) {
      document.getElementById(section)?.classList.remove("is-copy-target");
      document.querySelector(`.cw-beacon[data-island="${island}"]`)?.classList.remove("is-copy-target");
    }
    card.classList.remove("is-trash-armed");
    root
      .querySelectorAll(".co-project.is-dragging,.co-project.is-drop-target")
      .forEach((e) => e.classList.remove("is-dragging", "is-drop-target"));
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!swallowed || still) {
      ghost.remove();
      recycler.el.remove();
      return;
    }
    // The card spirals into the core, and the hole closes after it.
    ghost.classList.add("is-swallowed");
    recycler.el.classList.add("is-closing");
    setTimeout(() => {
      ghost.remove();
      recycler.el.remove();
    }, 520);
  }
  function cancelDrag() {
    if (drag) endDrag(false);
  }
  async function onDragEnd(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const { p, shelf, target, overShort: copy, overDone: finish, overTrash: trash } = drag;
    endDrag(trash);
    if (trash) removeProject(p);
    else if (copy) await copyToShort(p);
    else if (finish) await finishShort(p);
    else await moveProject(p.project_id, target, shelf);
  }
  function projectSorting(card, p, index, shelf = "active") {
    const bar = node("div", undefined, "co-project-sort");
    const ids = shelves[shelf].ids;
    const copies = shelf === "active";
    const handle = button(
      copies ? "⠿ 拖曳" : "⠿ 拖曳排序",
      () => {},
      "co-button quiet co-project-drag",
    );
    handle.title =
      (copies
        ? "拖曳排序；拖到右邊「短影音正在製作」會複製一份過去，拖到「短影音完成」會複製並標記完成，長片保留在原處"
        : shelf === "short"
          ? "拖曳排序；拖到右邊「短影音完成」標記完成"
          : "拖曳排序，或使用上、下方向鍵移動") + "；拖到下方星塵回收艙或按 Delete 移除（可復原）";
    handle.setAttribute("aria-label", (copies ? "拖曳排序或複製到短影音 " : "拖曳排序 ") + projectName(p));
    handle.draggable = false;
    handle.disabled = !storeReady;
    let pin = null,
      pinned = false;
    if (shelf === "active") {
      pinned = !!pinnedAt(p);
      card.dataset.pinned = String(pinned);
      pin = button(
        pinned ? "取消置頂" : "📌 置頂",
        () => togglePin(p),
        "co-button quiet co-pin-toggle",
      );
      pin.setAttribute("aria-pressed", String(pinned));
      pin.setAttribute("aria-label", (pinned ? "取消置頂 " : "置頂 ") + projectName(p));
      pin.title = pinned
        ? "取消置頂，回到一般排序"
        : "置頂到長片正在製作最前面（" + PIN_LIMIT_TEXT + "）";
      pin.disabled = !storeReady;
    } else delete card.dataset.pinned;
    handle.setAttribute("aria-keyshortcuts", "ArrowUp ArrowDown Delete");
    handle.addEventListener("keydown", async (e) => {
      // The keyboard's way to the recycler, without opening the card.
      if (["Delete", "Backspace"].includes(e.key)) {
        e.preventDefault();
        removeProject(p);
        return;
      }
      if (!["ArrowUp", "ArrowDown"].includes(e.key)) return;
      e.preventDefault();
      await moveProject(
        p.project_id,
        ids()[index + (e.key === "ArrowUp" ? -1 : 1)],
        shelf,
      );
    });
    dragPlans.set(card, { p, shelf });
    handle.addEventListener("pointerdown", (e) => {
      if (!storeReady || e.button !== 0) return;
      e.preventDefault();
      startDrag(card, e, handle);
    });
    bindCardDrag(card);
    const recycle = button("🗑", () => removeProject(p), "co-button quiet co-trash-button");
    recycle.setAttribute("aria-label", "移除「" + projectName(p) + "」（" + UNDO_MS / 1000 + " 秒內可復原）");
    recycle.title = "移除專案，" + UNDO_MS / 1000 + " 秒內可復原 · 也可以把卡片拖到下方的星塵回收艙";
    recycle.disabled = !storeReady;
    if (pinned) {
      const badge = node("span", "📌 置頂 " + (index + 1) + " / " + PIN_LIMIT, "co-pin-badge");
      badge.title = "置頂企劃依置頂的先後固定排在最前面";
      bar.append(badge, handle, node("small", "固定在最前面"), pin, recycle);
      card.querySelector(".co-project-body").prepend(bar);
      return;
    }
    const place = (index < DECK_HERO ? "ACTIVE DECK · #" : "#") + (index + 1);
    if (shelf !== "active") {
      const finished = shelves[shelf].scope === "completed" && validTime(stampDone(p));
      bar.append(
        handle,
        node("small", place + (finished ? " · 完成於 " + date(stampDone(p), true) : "")),
        recycle,
      );
      if (index >= DECK_HERO) bar.append(expandToggle(card, p));
      card.querySelector(".co-project-body").prepend(bar);
      return;
    }
    bar.append(handle, node("small", place), pin, recycle);
    if (index >= DECK_HERO) {
      const promote = button(
        "移到前面",
        () => moveProject(p.project_id, activeProjectIds[pinnedCount]),
        "co-button quiet",
      );
      promote.disabled = !storeReady;
      bar.append(promote, expandToggle(card, p));
    }
    card.querySelector(".co-project-body").prepend(bar);
  }
  // A folded crystal keeps its progress in view; opening it shows the rest. On
  // the PROJECT DECK the toggle rides the sort bar, on the ACTIVE DECK the
  // actions row; only one of the two is ever shown.
  function expandToggle(card, p, closed = "展開") {
    const open = expanded.has(p.project_id);
    const toggle = button(
      open ? "收起" : closed,
      () => {
        const next = !expanded.has(p.project_id);
        if (next) expanded.add(p.project_id);
        else expanded.delete(p.project_id);
        card.classList.toggle("is-expanded", next);
        for (const t of card.querySelectorAll(".cw-expand")) {
          t.textContent = next ? "收起" : t.dataset.closed;
          t.setAttribute("aria-expanded", String(next));
        }
      },
      "co-button quiet cw-expand",
    );
    toggle.dataset.closed = closed;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", "展開「" + projectName(p) + "」的完整內容");
    return toggle;
  }
  function reconcileProjectCards(groups) {
    const existing = new Map([...root.querySelectorAll(".co-project")].map(card => [card.dataset.projectId, card]));
    const desired = new Map();
    for (const [target, cards] of groups) {
      desired.set(target, cards.map(fresh => {
        const id = fresh.dataset.projectId;
        const previous = existing.get(id);
        if (previous) {
          // The retained card must carry the fresh card's live and pinned state.
          Object.assign(previous.dataset, fresh.dataset);
          if (!previous.querySelector(".co-video-player") || playingLinks.get(id) !== presentation.projects[id]?.link?.url) {
            previous.querySelector(".co-crystal").replaceWith(fresh.querySelector(".co-crystal"));
            playingLinks.delete(id);
          }
          // Keep the card and any playing iframe connected during live updates.
          previous.querySelector(".co-project-body").replaceWith(fresh.querySelector(".co-project-body"));
          return previous;
        }
        playingLinks.delete(id);
        return fresh;
      }));
    }
    const retained = new Set([...desired.values()].flat());
    for (const target of groups.keys()) for (const child of [...target.children]) {
      if (!retained.has(child)) child.remove();
    }
    for (const [target, cards] of desired) cards.forEach((card, index) => {
      if (target.children[index] === card) return;
      const before = target.children[index] || null;
      if (card.isConnected && typeof target.moveBefore === "function") target.moveBefore(card, before);
      else target.insertBefore(card, before);
    });
    for (const id of playingLinks.keys()) {
      if (![...retained].some(card => card.dataset.projectId === id)) playingLinks.delete(id);
    }
  }
  // Under an island's title, the projects that joined it most recently: one
  // click flies there, opens a folded deck if it has to, and lights the card.
  function showJoined(isle, list) {
    isle.joined.replaceChildren();
    isle.joined.hidden = !list.length;
    if (!list.length) return;
    isle.joined.append(node("span", "✦ 最新加入", "cw-joined-label"));
    for (const p of list) {
      const chip = button("", () => openProject(p, true), "cw-joined-chip");
      chip.append(node("strong", projectName(p)), node("small", joinedText(p)));
      chip.setAttribute("aria-label", "前往最新加入的專案「" + projectName(p) + "」，" + joinedText(p));
      isle.joined.append(chip);
    }
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
      // The environment is scenery and the revision a counter; neither changes a card.
      { ...presentation, revision: undefined, environment: undefined },
      response.status,
      storeReady,
      [...pendingRemoval.keys()],
      [...openDecks],
      (window.RenguinOperations?.current.jobs || []).map((j) => [
        j.project_id,
        window.RenguinOperations.effective(j),
      ]),
    ]);
    if (hash !== signature) {
      signature = hash;
      const projectRank = new Map(
        (presentation.project_order || []).map((id, i) => [id, i]),
      );
      const projects = arrange(
        primary().filter((p) => !pendingRemoval.has(p.project_id)),
        pinnedAt,
        (a, b) =>
          (projectRank.get(a.project_id) ?? Infinity) -
            (projectRank.get(b.project_id) ?? Infinity) ||
          (hasRunning(sourceId(b)) ? 1 : 0) -
            (hasRunning(sourceId(a)) ? 1 : 0) ||
          (isHuman(b) ? 1 : 0) - (isHuman(a) ? 1 : 0) ||
          (epoch(lastStamp(b)) || 0) - (epoch(lastStamp(a)) || 0),
      );
      const cardGroups = new Map(
        ISLANDS.flatMap(({ id }) => [
          [islands[id].hero, []],
          [islands[id].rest, []],
        ]),
      );
      const unfinished = projects.filter((p) => !projectDone(p));
      const activeProjects = unfinished.filter((p) => !isShort(p));
      const shortProjects = unfinished.filter(isShort);
      activeProjectIds = activeProjects.map((p) => p.project_id);
      shortProjectIds = shortProjects.map((p) => p.project_id);
      pinnedCount = activeProjects.filter(pinnedAt).length;
      const done = shelve(
        projects.filter((p) => projectDone(p)),
        presentation.completed_order,
        doneSortKey,
      );
      const recent = (p) => completedAge(p) <= 14 * 86400;
      const finishedShelves = [
        { id: "result", shelf: "completed", list: done.filter((p) => !isShort(p)), noun: "長片" },
        { id: "short-result", shelf: "shortCompleted", list: done.filter(isShort), noun: "短影音" },
      ];
      for (const f of finishedShelves) {
        f.recent = f.list.filter(recent);
        f.older = f.list.filter((p) => !recent(p));
      }
      completedProjectIds = finishedShelves[0].recent.map((p) => p.project_id);
      shortCompletedIds = finishedShelves[1].recent.map((p) => p.project_id);
      // Every island's first six stand on its ACTIVE DECK, the rest below; a
      // folded PROJECT DECK draws nothing until it is opened.
      const decks = [
        { id: "work", shelf: "active", list: activeProjects },
        { id: "result", shelf: "completed", list: finishedShelves[0].recent },
        { id: "short", shelf: "short", list: shortProjects },
        { id: "short-result", shelf: "shortCompleted", list: finishedShelves[1].recent },
      ];
      const joined = new Map(decks.map((d) => [d.id, freshest(d.list, addedAt)]));
      freshIds = new Set([...joined.values()].flat().map((p) => p.project_id));
      foldedDeckOf.clear();
      for (const d of decks) {
        const [top, others] = deckSplit(d.list);
        for (const p of top) cardGroups.get(islands[d.id].hero).push(projectCard(p));
        for (const p of others) {
          foldedDeckOf.set(p.project_id, d.id);
          if (openDecks.has(d.id)) cardGroups.get(islands[d.id].rest).push(projectCard(p));
        }
        showJoined(islands[d.id], joined.get(d.id));
      }
      reconcileProjectCards(cardGroups);
      for (const d of decks) {
        const isle = islands[d.id];
        isle.hero.querySelectorAll(":scope > .co-project").forEach((card, n) => {
          card.dataset.tier = "hero";
          card.style.setProperty("--n", n);
          card.classList.toggle("is-expanded", expanded.has(card.dataset.projectId));
        });
        isle.rest.querySelectorAll(":scope > .co-project").forEach((card) => {
          card.dataset.tier = "compact";
          card.style.removeProperty("--n");
          card.classList.toggle("is-expanded", expanded.has(card.dataset.projectId));
        });
        const waiting = Math.max(0, d.list.length - DECK_HERO);
        const pinsBelow = d.shelf === "active" ? deckSplit(d.list)[1].filter(pinnedAt).length : 0;
        isle.bridge.hidden = !waiting;
        isle.bridgeCount.textContent = "其他 " + waiting + " 個專案" + (pinsBelow ? " · 含 " + pinsBelow + " 個置頂" : "");
        setDeckOpen(d.id, openDecks.has(d.id), false);
        isle.label.textContent = "ACTIVE DECK · " + Math.min(DECK_HERO, d.list.length) + " / " + d.list.length;
        isle.older.replaceChildren();
      }
      zoneSummary("work", [
        activeProjects.length + " 個進行中",
        "置頂 " + pinnedCount + " / " + PIN_LIMIT,
      ]);
      zoneSummary("short", [
        shortProjects.length + " 支進行中",
        "素材 → 後製 → 上映",
      ]);
      renderHistory();
      const renderedCards = new Map([...root.querySelectorAll(".co-project")].map(card => [card.dataset.projectId, card]));
      const sortBar = (shelf) => (p, index) => {
        const card = renderedCards.get(p.project_id);
        if (card) projectSorting(card, p, index, shelf);
      };
      activeProjects.forEach(sortBar("active"));
      shortProjects.forEach(sortBar("short"));
      for (const f of finishedShelves) f.recent.forEach(sortBar(f.shelf));
      if (!islands.work.hero.children.length)
        islands.work.hero.append(
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
      if (!islands.short.hero.children.length)
        islands.short.hero.append(
          node(
            "p",
            payload || loaded
              ? "還沒有短影音。按「＋ 新增短影音」開始，或把長片的「⠿ 拖曳」拉到下方「短影音正在製作」航標複製一份。"
              : "正在讀取專案資料…",
            "co-empty",
          ),
        );
      for (const f of finishedShelves) {
        const isle = islands[f.id];
        if (!isle.hero.children.length)
          isle.hero.append(
            node(
              "p",
              "做好一支" + f.noun + "，就在這裡留下足跡。保留最近 14 天完成的" + f.noun + "。",
              "co-empty",
            ),
          );
        zoneSummary(f.id, [
          f.recent.length + " 個最近完成",
          ...(f.older.length ? [f.older.length + " 個更早完成"] : []),
        ]);
        if (f.older.length) {
          const d = node("details");
          d.className = "co-empty";
          d.append(node("summary", "更早完成的" + f.noun + " · " + f.older.length));
          for (const p of f.older)
            d.append(button(projectName(p), () => showDetails(p)));
          isle.older.append(d);
        }
      }
      const newly = (id) => (joined.get(id).length ? " · 新 " + joined.get(id).length : "");
      world?.setCount("work", activeProjects.length + " 個" + newly("work"));
      world?.setCount("result", finishedShelves[0].list.length + " 個" + newly("result"));
      world?.setCount("short", shortProjects.length + " 支" + newly("short"));
      world?.setCount("short-result", finishedShelves[1].list.length + " 支" + newly("short-result"));
      // The residents of each island's projects fly the sky around that island.
      const residents = (list) => list.map(residentOf).filter(Boolean);
      world?.setResidents({
        work: residents(activeProjects),
        result: residents(finishedShelves[0].list),
        short: residents(shortProjects),
        "short-result": residents(finishedShelves[1].list),
      });
      sceneryObserver.disconnect();
      root
        .querySelectorAll(".co-crystal, .co-yard")
        .forEach((scenery) => sceneryObserver.observe(scenery));
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
        window.CreatorEnvironment?.adopt(presentation.environment);
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
    header.dataset.zone = "home";
    const homeScene = window.CreatorEnvironment?.scene("home");
    if (homeScene) header.append(homeScene);
    const title = node("div", undefined, "co-zone-plaque");
    const brand = node("h1");
    const brandIcon = node("span", "⌂", "co-zone-icon");
    brandIcon.setAttribute("aria-hidden", "true");
    brand.append(brandIcon, "RENGUIN OFFICE");
    title.append(brand, node("p", "CREATOR OFFICE · 讓好故事，在這裡發生"));
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
    // Renguin World is a page of its own: a plain link, so the Office loads none of it.
    const worldLink = node("a", "Renguin World", "co-world-link");
    worldLink.href = "/world";
    worldLink.title = "打開 Renguin World：完成的內容讓城市長大";
    shortcuts.append(
      button("任務雲", () => focusTodo()),
      button("長片", () => visitIsland("work")),
      button("短影音", () => visitIsland("short")),
      worldLink,
    );
    if (window.CreatorEnvironment) {
      const envButton = node("button");
      envButton.type = "button";
      shortcuts.append(window.CreatorEnvironment.bindButton(envButton));
    }
    homeToggle = button(
      "",
      () => setHome(!document.body.classList.contains("co-home-collapsed")),
      "co-zone-toggle",
    );
    homeToggle.append(node("span", "收合"));
    homeToggle.setAttribute("aria-controls", "game-container office-members");
    homeToggle.setAttribute("aria-expanded", "true");
    homeToggle.setAttribute("aria-label", "收合 RENGUIN OFFICE");
    shortcuts.append(syncButton, homeToggle);
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
    // A zone below the world is a room of its own region floating in the shared
    // sky: a signboard over its scenery, the cliff face its work sits on, which
    // folds away, and the rock it hangs from.
    function section(id, title, subtitle, cls, zone, icon) {
      const s = node("section", undefined, "co-section" + (zone ? " co-zone is-settled" : ""));
      s.id = id;
      const h = node("div", undefined, "co-section-header");
      const text = node("div", undefined, zone ? "co-zone-plaque" : undefined);
      const heading = node("h2");
      if (icon) {
        const glyph = node("span", icon, "co-zone-icon");
        glyph.setAttribute("aria-hidden", "true");
        heading.append(glyph);
      }
      heading.append(title);
      text.append(heading, node("p", subtitle, "co-kicker"));
      h.append(text);
      s.append(h);
      const body = node("div", undefined, cls);
      if (!zone) {
        s.append(body);
        root.append(s);
        return [body, h];
      }
      s.dataset.zone = zone;
      const scene = window.CreatorEnvironment?.scene(zone);
      if (scene) h.prepend(scene);
      const place = window.CreatorEnvironment?.island?.(zone);
      if (place) heading.append(node("small", place.name, "co-isle-name"));
      const summaryLine = node("p", undefined, "co-zone-summary");
      text.append(summaryLine);
      const tools = node("div", undefined, "co-zone-tools");
      const fold = node("div", undefined, "co-zone-fold");
      fold.id = id + "-content";
      const floor = node("div", undefined, "co-zone-body");
      floor.append(body);
      fold.append(floor);
      const toggle = button(
        "",
        () => setZone(s, !s.classList.contains("is-collapsed")),
        "co-button co-zone-toggle",
      );
      toggle.append(node("span", "收合"));
      toggle.dataset.title = title;
      toggle.setAttribute("aria-controls", fold.id);
      toggle.setAttribute("aria-expanded", "true");
      toggle.setAttribute("aria-label", "收合「" + title + "」");
      h.append(tools, toggle);
      s.append(fold);
      const base = window.CreatorEnvironment?.under?.(zone);
      if (base) s.append(base);
      root.append(s);
      window.CreatorEnvironment?.watch(s);
      window.CreatorTransitions?.watch(s);
      zones.set(zone, { section: s, summary: summaryLine });
      return [body, tools];
    }
    [membersRoot] = section(
      "office-members",
      "辦公室成員",
      "一起讓故事成形的夥伴",
      "co-members",
    );
    // The lodge is the mother island: the rock it rests on hangs under its members.
    const homeBase = window.CreatorEnvironment?.under?.("home");
    if (homeBase) membersRoot.closest("section").append(homeBase);
    // Below the lodge lies the sky world: 任務雲 fixed over it, four islands in
    // one sky, and a dock of beacons to fly between them.
    inboxRoot = node("section", undefined, "cw-cloud");
    inboxRoot.id = "human-inbox";
    inboxRoot.setAttribute("aria-label", "任務雲");
    buildTodo();
    // An island's deck: its title platform with a resting islet beside it, the
    // ACTIVE DECK of the six that matter now, a bridge of cloud, and the PROJECT
    // DECK below it where the rest wait, smaller and closer together.
    for (const spec of ISLANDS) {
      const deck = node("section", undefined, "co-section cw-island-deck");
      deck.id = spec.section;
      deck.dataset.zone = spec.zone;
      deck.setAttribute("aria-label", spec.title);
      const head = node("header", undefined, "cw-deck-head");
      const platform = node("div", undefined, "cw-platform");
      const plaque = node("div", undefined, "cw-plaque");
      const heading = node("h2");
      const glyph = node("span", spec.icon, "cw-plaque-icon");
      glyph.setAttribute("aria-hidden", "true");
      heading.append(glyph, spec.title);
      const summary = node("p", undefined, "co-zone-summary");
      const name = window.CreatorWorld?.NAMES?.[spec.id];
      plaque.append(
        heading,
        node("p", spec.note + (name ? " · " + name : ""), "cw-isle-name"),
        summary,
      );
      const rock = node("div", undefined, "cw-platform-rock");
      rock.setAttribute("aria-hidden", "true");
      platform.append(plaque, rock);
      const tools = node("div", undefined, "co-zone-tools cw-deck-tools");
      head.append(platform, node("div", undefined, "cw-rest-slot"), tools);
      const sky = node("div", undefined, "cw-active-sky");
      const label = node("p", "ACTIVE DECK", "cw-deck-label");
      const hero = node("div", undefined, "cw-hero-grid");
      sky.append(label, hero);
      // The cloud bridge down to the PROJECT DECK folds and unfolds it.
      const bridge = node("button", undefined, "cw-bridge");
      bridge.type = "button";
      const bridgeCount = node("small", "", "cw-bridge-count");
      const bridgeAction = node("span", "展開", "cw-bridge-action");
      bridge.append(node("span", "PROJECT DECK", "cw-bridge-label"), bridgeCount, bridgeAction);
      bridge.setAttribute("aria-expanded", "false");
      bridge.addEventListener("click", () => setDeckOpen(spec.id, !openDecks.has(spec.id)));
      const floor = node("div", undefined, "cw-project-deck");
      floor.id = spec.section + "-deck";
      floor.hidden = true;
      bridge.setAttribute("aria-controls", floor.id);
      const rest = node("div", undefined, "cw-rest-grid");
      floor.append(rest);
      const older = node("div", undefined, "cw-older");
      const joined = node("nav", undefined, "cw-joined");
      joined.setAttribute("aria-label", spec.title + " · 最新加入");
      joined.hidden = true;
      deck.append(head, joined, sky, bridge, floor, older);
      islands[spec.id] = { deck, hero, rest, tools, summary, bridge, bridgeCount, bridgeAction, label, floor, older, joined };
      zones.set(spec.zone, { section: deck, summary });
    }
    islands.work.tools.append(button("＋ 新增長片", () => projectSource()));
    islands.short.tools.append(button("＋ 新增短影音", () => projectSource(null, "SHORT")));
    if (window.CreatorWorld?.mount)
      world = window.CreatorWorld.mount({
        host: root,
        hud: inboxRoot,
        decks: Object.fromEntries(ISLANDS.map(({ id }) => [id, islands[id].deck])),
        labels: Object.fromEntries(ISLANDS.map(({ id, title }) => [id, title])),
        start: "work",
      });
    else root.append(inboxRoot, ...ISLANDS.map(({ id }) => islands[id].deck));
    // 系統年表: the product's own history on top, and below it, folded, 工作紀錄 —
    // every record the card grid leaves out, so none of them loses its way in.
    const [chronicle] = section(
      "work-history",
      "系統年表",
      "RENGUIN AI System 的發展航線 · 每一個第一次都有證據",
      "co-chronicle",
      "history",
      "✦",
    );
    const timelineHost = node("div", undefined, "co-timeline");
    const records = node("details", undefined, "tl-archive");
    records.id = "work-records";
    const recordsSummary = node("summary");
    historyNote = node("span", "", "tl-archive-note");
    recordsSummary.append(node("span", "☾ 工作紀錄"), historyNote);
    historyRoot = node("div", undefined, "co-history");
    records.append(recordsSummary, historyRoot);
    chronicle.append(timelineHost, records);
    layers?.when("creator-timeline.js", "CreatorTimeline", (timeline) =>
      timeline.mount(timelineHost, {
        url: layers.at("creator-milestones.json"),
        changed: () => renderHistory(),
      }),
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
    window.CreatorTransitions?.watch(footer);
    const folded = collapsedZones();
    for (const { section: zone } of zones.values())
      if (folded.has(zone.id) && zone.classList.contains("co-zone")) setZone(zone, true, false);
    if (folded.has("renguin-home")) setHome(true, false);
    window.CreatorEnvironment?.onSave(saveEnvironment);
    render();
    poll();
    setInterval(renderMembers, 1000);
  }
  window.CreatorOffice = {
    poll,
    render,
    syncMap,
    memberView,
    memberTier,
    projectLive,
    timeline,
    lastState,
    displayStatus,
    stampDone,
    completedAge,
    doneSortKey,
    arrange,
    shelve,
    stepsFor,
    SHORT_STEPS,
    DECK_HERO,
    deckSplit,
    memberIdentity,
    celebrates,
    PIN_LIMIT,
    TODO_COLUMNS,
    todoCategory,
    foldDuplicates,
    userTouched,
    addedStamp,
    freshest,
    FRESH_WINDOW_S,
    world: () => world,
  };
  window.RenguinControlRoom = {
    poll,
    render: () => {},
    refreshAgentNames: renderMembers,
  };
  if (document.body) setup();
  else document.addEventListener("DOMContentLoaded", setup);
})();
