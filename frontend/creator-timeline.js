/* 系統年表: how RENGUIN's STAR OFFICE and its content system grew, one proven
   first at a time. The history lives in creator-milestones.json; this file only
   validates, orders and draws it, so a new milestone never needs a new layout.
   It reads no work state and writes nothing. */
((scope) => {
  "use strict";
  const TRACKS = Object.freeze({
    star_office: { label: "星辦里程碑", icon: "🚀", kicker: "STAR OFFICE 的功能怎麼一步步誕生" },
    content_system: { label: "內容里程碑", icon: "🧠", kicker: "Content OS、BIONIC 與 Premiere 的真正突破" },
  });
  const TRACK_IDS = Object.keys(TRACKS);
  const CONFIDENCE = Object.freeze({
    VERIFIED: { label: "已查證", note: "有機器寫下的紀錄（commit、執行檢查點或驗收檔）直接證明這件事與時間。" },
    HIGH: { label: "高度可信", note: "有報告或自動產生的測試報告記錄日期，但不是那個動作本身的時間戳。" },
    PARTIAL: { label: "部分證據", note: "確定發生過，但找不到可信的日期。" },
  });
  const SOURCES = Object.freeze({
    git: "Git 提交紀錄",
    changelog: "版本更新紀錄",
    test_report: "自動測試報告",
    report: "驗收報告",
    runtime_record: "執行紀錄",
  });
  const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

  // A milestone the page can stand behind, or null. A date must be a real,
  // past calendar day; an unproven one is kept but only as PARTIAL.
  function validMilestone(m, today = new Date()) {
    if (!m || typeof m !== "object") return null;
    if (typeof m.id !== "string" || !m.id) return null;
    if (!TRACK_IDS.includes(m.category)) return null;
    if (typeof m.title !== "string" || !m.title.trim()) return null;
    if (typeof m.summary !== "string" || !m.summary.trim()) return null;
    if (!Object.hasOwn(CONFIDENCE, m.confidence)) return null;
    let date = null;
    if (m.date !== null && m.date !== undefined) {
      const match = DAY.exec(String(m.date));
      if (!match) return null;
      const [, y, mo, d] = match.map(Number);
      const parsed = new Date(Date.UTC(y, mo - 1, d));
      if (parsed.getUTCMonth() !== mo - 1 || parsed.getUTCDate() !== d) return null;
      if (m.date > isoDay(today)) return null;
      date = m.date;
    }
    // Without a date nothing is verified; with one, a verified claim names its source.
    if (!date && m.confidence !== "PARTIAL") return null;
    if (m.confidence === "VERIFIED" && !(m.commit_sha || m.source_ref)) return null;
    const importance = [1, 2, 3].includes(m.importance) ? m.importance : 2;
    return {
      id: m.id,
      category: m.category,
      date,
      title: m.title.trim(),
      summary: m.summary.trim(),
      what: typeof m.what === "string" ? m.what : "",
      why: typeof m.why === "string" ? m.why : "",
      systems: Array.isArray(m.systems) ? m.systems.filter((s) => typeof s === "string") : [],
      importance,
      source: typeof m.source === "string" ? m.source : "",
      source_ref: typeof m.source_ref === "string" ? m.source_ref : "",
      commit_sha: typeof m.commit_sha === "string" && /^[0-9a-f]{7,40}$/.test(m.commit_sha) ? m.commit_sha : null,
      confidence: m.confidence,
    };
  }
  function isoDay(d) {
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  // Oldest first; undated milestones after every dated one, in file order.
  function normalize(data, today = new Date()) {
    const list = Array.isArray(data?.milestones) ? data.milestones : [];
    const seen = new Set();
    const kept = [];
    list.forEach((raw, index) => {
      const m = validMilestone(raw, today);
      if (!m || seen.has(m.id)) return;
      seen.add(m.id);
      kept.push({ ...m, index });
    });
    kept.sort((a, b) => {
      if (!a.date !== !b.date) return a.date ? -1 : 1;
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return a.index - b.index;
    });
    return kept.map(({ index, ...m }) => m);
  }
  function track(list, id) {
    return list.filter((m) => m.category === id);
  }
  // Month stations along a route: 2026 / 08, 2026 / 09 … then 日期待確認.
  function stations(list) {
    const groups = [];
    for (const m of list) {
      const key = m.date ? m.date.slice(0, 7) : "pending";
      let group = groups.at(-1);
      if (!group || group.key !== key) {
        group = { key, label: key === "pending" ? "日期待確認" : key.replace("-", " / "), items: [] };
        groups.push(group);
      }
      group.items.push(m);
    }
    return groups;
  }
  function dayLabel(m) {
    return m.date ? m.date.slice(5).replace("-", "/") : "日期待確認";
  }
  function fullDate(m) {
    return m.date ? m.date.replaceAll("-", "/") : "日期待確認";
  }
  const api = { TRACKS, TRACK_IDS, CONFIDENCE, SOURCES, validMilestone, normalize, track, stations, dayLabel, fullDate, isoDay };
  if (typeof module !== "undefined") module.exports = api;
  if (typeof document === "undefined" || typeof document.createElement !== "function") {
    scope.CreatorTimeline = api;
    return;
  }

  /* ------------------------------------------------------------ renderer */
  const VIEW_KEY = "co-timeline-view";
  const narrow = scope.matchMedia?.("(max-width: 760px)");
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  let host = null,
    data = [],
    state = "loading",
    view = readView(),
    onChange = null;
  function readView() {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      return ["both", ...TRACK_IDS].includes(v) ? v : "both";
    } catch {
      return "both";
    }
  }
  function effectiveView() {
    // A phone has room for one route at a time.
    return view === "both" && narrow?.matches ? "star_office" : view;
  }
  function setView(next) {
    view = next;
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {}
    draw();
  }
  function detail(m, id) {
    const box = el("div", "tl-detail");
    box.id = id;
    box.hidden = true;
    const facts = el("dl", "tl-facts");
    const row = (term, value) => {
      if (!value) return;
      facts.append(el("dt", "", term), el("dd", "", value));
    };
    row("發生什麼", m.what);
    row("為什麼重要", m.why);
    box.append(facts);
    if (m.systems.length) {
      const systems = el("p", "tl-systems");
      systems.append(el("span", "tl-label", "相關系統"));
      for (const s of m.systems) systems.append(el("span", "tl-chip", s));
      box.append(systems);
    }
    const proof = el("div", "tl-proof");
    proof.dataset.confidence = m.confidence;
    const badge = el("span", "tl-confidence", CONFIDENCE[m.confidence].label);
    badge.title = CONFIDENCE[m.confidence].note;
    const head = el("p", "tl-proof-head");
    head.append(el("span", "tl-label", "證據"), badge, el("span", "tl-proof-date", fullDate(m)));
    proof.append(head, el("p", "tl-proof-note", CONFIDENCE[m.confidence].note));
    if (m.source || m.source_ref) {
      const ref = el("p", "tl-proof-ref");
      if (m.source) ref.append(el("span", "tl-proof-kind", SOURCES[m.source] || m.source));
      if (m.source_ref) ref.append(el("code", "", m.source_ref));
      proof.append(ref);
    }
    if (m.commit_sha) {
      const commit = el("p", "tl-proof-ref");
      commit.append(el("span", "tl-proof-kind", "commit"), el("code", "", m.commit_sha));
      proof.append(commit);
    }
    box.append(proof);
    return box;
  }
  function node(m) {
    const li = el("li", "tl-node");
    li.dataset.importance = m.importance;
    li.dataset.confidence = m.confidence;
    li.dataset.milestone = m.id;
    const id = "tl-" + m.id;
    const toggle = el("button", "tl-node-button");
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", id);
    const dot = el("span", "tl-dot");
    dot.setAttribute("aria-hidden", "true");
    const when = el("time", "tl-date", dayLabel(m));
    if (m.date) when.dateTime = m.date;
    const text = el("span", "tl-text");
    text.append(el("strong", "tl-title", m.title), el("span", "tl-summary", m.summary));
    toggle.append(dot, when, text);
    if (m.confidence !== "VERIFIED") {
      const mark = el("span", "tl-uncertain", CONFIDENCE[m.confidence].label);
      toggle.append(mark);
    }
    const box = detail(m, id);
    toggle.addEventListener("click", () => {
      const open = toggle.getAttribute("aria-expanded") !== "true";
      toggle.setAttribute("aria-expanded", String(open));
      box.hidden = !open;
      li.classList.toggle("is-open", open);
    });
    li.append(toggle, box);
    return li;
  }
  function route(id) {
    const meta = TRACKS[id];
    const items = track(data, id);
    const section = el("section", "tl-track");
    section.dataset.track = id;
    section.setAttribute("aria-label", meta.label);
    const head = el("header", "tl-track-head");
    const icon = el("span", "tl-track-icon", meta.icon);
    icon.setAttribute("aria-hidden", "true");
    const titles = el("div", "tl-track-titles");
    titles.append(el("h3", "", meta.label), el("p", "", meta.kicker));
    head.append(icon, titles, el("span", "tl-track-count", items.length + " 個節點"));
    const list = el("ol", "tl-route");
    for (const station of stations(items)) {
      const stop = el("li", "tl-station");
      stop.dataset.station = station.key;
      stop.append(el("span", "tl-station-label", station.label));
      list.append(stop);
      for (const m of station.items) list.append(node(m));
    }
    // 現在 is computed, never stored: the route simply grows past it.
    const now = el("li", "tl-now");
    const dot = el("span", "tl-dot");
    dot.setAttribute("aria-hidden", "true");
    const today = isoDay(new Date());
    const when = el("time", "tl-date", today.slice(5).replace("-", "/"));
    when.dateTime = today;
    const text = el("span", "tl-text");
    text.append(el("strong", "tl-title", "現在"), el("span", "tl-summary", today.replaceAll("-", "/") + " · 航線還在延伸，下一個里程碑會接在這裡。"));
    now.append(dot, when, text);
    list.append(now);
    section.append(head, list);
    return section;
  }
  function draw() {
    if (!host) return;
    const shown = effectiveView();
    const wrap = el("div", "tl");
    const bar = el("div", "tl-bar");
    bar.append(el("p", "tl-lede", "RENGUIN AI System 是怎麼一步一步長大的：每個節點都是一件第一次真正成立的事，點開可以看到證據。"));
    const switcher = el("div", "tl-switch");
    switcher.setAttribute("role", "group");
    switcher.setAttribute("aria-label", "選擇航線");
    for (const [key, label] of [
      ["both", "兩條航線"],
      ["star_office", "🚀 " + TRACKS.star_office.label],
      ["content_system", "🧠 " + TRACKS.content_system.label],
    ]) {
      const b = el("button", "tl-switch-button", label);
      b.type = "button";
      b.dataset.view = key;
      b.setAttribute("aria-pressed", String(shown === key));
      b.addEventListener("click", () => setView(key));
      switcher.append(b);
    }
    bar.append(switcher);
    wrap.append(bar);
    if (state === "loading") wrap.append(el("p", "tl-status", "正在展開航線…"));
    else if (state === "error") wrap.append(el("p", "tl-status", "暫時讀不到系統年表，稍後重新整理再試。工作紀錄不受影響。"));
    else {
      const tracks = el("div", "tl-tracks");
      tracks.dataset.view = shown;
      for (const id of shown === "both" ? TRACK_IDS : [shown]) tracks.append(route(id));
      wrap.append(tracks);
    }
    host.replaceChildren(wrap);
  }
  async function load(url) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw Error(response.status);
      data = normalize(await response.json());
      state = "ready";
    } catch {
      data = [];
      state = "error";
    }
    draw();
    onChange?.(api.counts());
  }
  Object.assign(api, {
    mount(target, { url, changed } = {}) {
      host = target;
      onChange = changed || null;
      draw();
      load(url);
      narrow?.addEventListener?.("change", draw);
    },
    counts() {
      return state === "ready" ? Object.fromEntries(TRACK_IDS.map((id) => [id, track(data, id).length])) : null;
    },
  });
  scope.CreatorTimeline = api;
})(typeof window === "undefined" ? globalThis : window);
