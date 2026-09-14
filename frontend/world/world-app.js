/* Renguin World page. Loaded only by /world.
 *
 * Budget: one state request when the page opens (plus the character roster
 * only if its drawer is opened), CSS-only motion, one gossip timer. Nothing
 * polls. A hidden tab pauses every animation and timer; leaving the page
 * aborts requests, clears timers and drops the scene.
 */
(() => {
  "use strict";
  const Scene = window.RenguinWorldScene;
  const $ = (id) => document.getElementById(id);
  const TYPE = { long: "長片", short: "短影音", member: "會員影片", special: "特別企劃", series: "系列完結" };
  const ACTIVITY = {
    EMPTY_WORLD: "等待開拓",
    ACTIVE: "活躍",
    NORMAL: "日常",
    QUIET: "安靜",
    DORMANT: "休眠",
    DEEP_DORMANT: "深度休眠",
    REVIVAL: "復甦",
    FESTIVAL: "慶典",
  };
  const CROWD = { EMPTY: "空無一人", QUIET: "稀疏", NORMAL: "普通", BUSY: "熱鬧", FESTIVAL: "人山人海" };
  const EVENTS = {
    LIGHTS_ON: "燈光重新亮起",
    RESIDENTS_RETURN: "居民回流",
    CONSTRUCTION_RESTARTED: "工地重新開工",
    NEW_POSTER: "新片海報",
    CONFETTI: "彩帶",
    SMALL_FIREWORKS: "小煙火",
    FESTIVAL_BANNERS: "慶典彩旗",
    FIREWORKS: "煙火",
    FEATURED_POSTER: "精選海報",
    CITY_QUIET: "城市變安靜",
    CITY_DORMANT: "城市打盹",
    SHOPS_DIMMED: "部分店家熄燈",
    CONSTRUCTION_PAUSED: "工地暫停",
    TALL_GRASS: "草長高了",
    AWAITING_FIRST_CONTENT: "等待第一支片",
    CONTENT_BURST: "連續發片",
    ERA_UNLOCKED: "新時代開啟",
    VIEW_HYPE: "人氣爆發",
    POPULAR_CROWD: "人氣帶來人潮",
    NO_DATED_CONTENT: "缺少日期",
  };
  const SOURCES = {
    CONTENT_OS_LEDGER: "Content OS 正式帳本（已驗證發布）",
    OFFICE_USER_MARKS: "Star Office 完成標記",
    WORLD_OVERRIDES: "世界手動修正",
    YOUTUBE_POPULARITY: "YouTube 人氣",
    "ASSET-01_GENERAL_CANON_INDEX": "角色聖經 · 一般角色",
    "ASSET-08_MEMBER_CHARACTER_LIBRARY": "會員角色庫",
    RENGUIN_WORLD_MEMBER_REGISTRY: "鵝寶人口底冊（只取統計）",
    MOCK_CONTENTS: "模擬內容",
  };
  const STATUS = {
    OK: "正常",
    SYNC_ERROR: "無法確認",
    GATED: "待授權",
    NONE: "未設定",
    EMPTY: "無資料",
    ERROR: "讀取失敗",
    UNAVAILABLE: "無法讀取",
    STALE: "已過期",
    MOCK: "模擬",
    READY_TO_SYNC: "可同步",
    SKIPPED: "略過",
  };
  const DISTRICT_STATUS = { UNLOCKED: "已開放", PREVIEW: "施工預告", LOCKED: "未解鎖" };
  const TIMES = ["auto", "day", "dusk", "night"];
  const TIME_LABEL = { auto: "自動", day: "白天", dusk: "黃昏", night: "夜晚" };

  const W = {
    timers: new Set(),
    aborts: new Set(),
    listeners: [],
    state: null,
    gossip: 0,
    paused: false,
    running: false,
    time: "auto",
    roster: null,
  };

  const node = (tag, text, cls) => {
    const e = document.createElement(tag);
    if (text !== undefined && text !== null) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  };
  const later = (fn, ms) => {
    const id = setTimeout(() => {
      W.timers.delete(id);
      fn();
    }, ms);
    W.timers.add(id);
    return id;
  };
  const clearTimers = () => {
    for (const id of W.timers) clearTimeout(id);
    W.timers.clear();
  };
  const listen = (target, type, fn, options) => {
    target.addEventListener(type, fn, options);
    W.listeners.push([target, type, fn, options]);
  };
  const date = (value) => {
    if (!value) return "日期未知";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "日期未知" : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  };
  const mobile = () => window.matchMedia("(max-width: 720px)").matches;

  async function getJSON(url) {
    const controller = new AbortController();
    W.aborts.add(controller);
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("HTTP " + response.status);
      return await response.json();
    } finally {
      W.aborts.delete(controller);
    }
  }

  function params() {
    const q = new URLSearchParams(location.search);
    const time = q.get("time");
    if (TIMES.includes(time)) W.time = time;
    if (q.has("sim"))
      return {
        mode: "sim",
        contents: Math.max(0, Math.min(150, parseInt(q.get("sim"), 10) || 0)),
        idle: Math.max(0, Math.min(365, parseInt(q.get("idle"), 10) || 0)),
        gap: Math.max(0, Math.min(120, parseInt(q.get("gap"), 10) || 0)),
      };
    return { mode: "live" };
  }

  function daypart() {
    if (W.time !== "auto") return W.time;
    const h = new Date().getHours();
    return h >= 6 && h < 17 ? "day" : h >= 17 && h < 19 ? "dusk" : "night";
  }

  async function load(options = {}) {
    const p = params();
    const app = $("rw-app");
    app.dataset.status = "loading";
    const url =
      p.mode === "sim"
        ? `/api/world/simulate?contents=${p.contents}&idle=${p.idle}&gap=${p.gap}`
        : "/api/world/state" + (options.refresh ? "?refresh=1" : "");
    try {
      const state = await getJSON(url);
      if (!W.running) return;
      W.state = state;
      W.gossip = 0;
      render(state);
      app.dataset.status = "ready";
    } catch (error) {
      if (error.name === "AbortError" || !W.running) return;
      app.dataset.status = "error";
      const stage = $("rw-stage");
      stage.replaceChildren();
      const box = node("div", undefined, "rw-error");
      box.append(node("h2", "世界暫時無法讀取"), node("p", "不會用猜的資料代替。稍後再試一次。"));
      const retry = node("button", "再試一次", "rw-chip-button");
      retry.type = "button";
      retry.addEventListener("click", () => load());
      box.append(retry);
      stage.append(box);
    }
  }

  function renderScene(state) {
    const stage = $("rw-stage");
    const { svg, overlay, stats } = Scene.render(state, { mobile: mobile() });
    // The SVG is static; everything that moves is in the overlay (transform/opacity only).
    stage.innerHTML = svg + '<div class="rw-overlay">' + overlay + "</div>";
    stage.dataset.daypart = daypart();
    stage.dataset.activity = state.activity.state;
    stage.dataset.crowd = state.activity.crowd_density;
    stage.dataset.lights = String(Math.round((state.activity.lights_level || 0) / 10) * 10);
    stage.dataset.construction = String(state.visual.construction || "").toLowerCase();
    stage.dataset.era = state.visual.era_variant;
    const flags = new Set(state.activity.event_flags || []);
    if (flags.has("CONFETTI") || flags.has("FIREWORKS")) {
      const layer = node("div", undefined, "rw-confetti");
      layer.setAttribute("aria-hidden", "true");
      const colors = ["#ff7fa8", "#ffd35e", "#7fd6c2", "#9db8f2", "#ffb347"];
      for (let k = 0; k < (mobile() ? 16 : 30); k++) {
        const bit = node("i");
        bit.style.cssText = `left:${(Scene.hash("cf" + k) * 100).toFixed(1)}%;background:${colors[k % 5]};animation-delay:${(Scene.hash("cfd" + k) * 2.4).toFixed(2)}s;animation-duration:${(2.6 + Scene.hash("cfs" + k) * 2).toFixed(2)}s`;
        layer.append(bit);
      }
      stage.querySelector(".rw-overlay").append(layer);
    }
    if (W.paused) pauseScene();
    stage.dataset.walkers = String(stats.walkers);
    return stats;
  }

  function stat(label, value, cls) {
    const box = node("div", undefined, "rw-stat" + (cls ? " " + cls : ""));
    box.append(node("strong", String(value)), node("span", label));
    return box;
  }

  function card(title, cls) {
    const section = node("section", undefined, "rw-card" + (cls ? " " + cls : ""));
    if (title) section.append(node("h2", title));
    return section;
  }

  function render(state) {
    const p = params();
    const stats = renderScene(state);
    const banner = $("rw-banner");
    const source = $("rw-source");
    source.hidden = false;
    source.textContent = state.source === "MOCK" ? "模擬資料" : "正式資料";
    source.dataset.source = state.source;
    const warnings = [];
    if (state.source === "MOCK")
      warnings.push(`模擬 ${p.contents} 支內容${p.idle ? `、${p.idle} 天沒發片` : ""}${p.gap ? `、睽違 ${p.gap} 天後回歸` : ""}。這不是正式資料。`);
    for (const s of state.sources || [])
      if (["SYNC_ERROR", "ERROR", "UNAVAILABLE"].includes(s.status))
        warnings.push(`${SOURCES[s.id] || s.id}${STATUS[s.status] ? "：" + STATUS[s.status] : ""}，世界只使用可確認的資料。`);
    banner.hidden = !warnings.length;
    banner.textContent = warnings.join(" ");
    banner.dataset.kind = state.source === "MOCK" ? "mock" : "warning";

    const hud = $("rw-hud");
    hud.replaceChildren();

    const era = card(null, "rw-era-card");
    const kicker = node("p", `${state.era.name_en} · ${state.current_era}`, "rw-kicker");
    const title = node("h1");
    title.append(node("span", state.current_era_name), node("small", `Lv.${state.world_level}`, "rw-level"));
    era.append(kicker, title, node("p", state.current_stage, "rw-stage-name"), node("p", state.era.tagline, "rw-tagline"));
    const bar = node("div", undefined, "rw-progress");
    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-valuemin", "0");
    bar.setAttribute("aria-valuemax", "100");
    bar.setAttribute("aria-valuenow", String(Math.round(state.era_progress * 100)));
    const fill = node("i");
    fill.style.width = Math.round(state.era_progress * 100) + "%";
    bar.append(fill);
    era.append(bar);
    era.append(
      node(
        "p",
        state.next_era
          ? `成長值 ${state.world_score} · 再 ${state.score_to_next_era} 進入「${state.next_era_name}」`
          : `成長值 ${state.world_score} · 已抵達最後一個時代`,
        "rw-progress-note",
      ),
    );
    hud.append(era);

    const counts = card("內容", "rw-stats-card");
    const grid = node("div", undefined, "rw-stats");
    grid.append(
      stat("已完成內容", state.content.total, "is-main"),
      stat("長片", state.content.long),
      stat("短影音", state.content.short),
      stat("會員影片", state.content.member),
    );
    if (state.content.special) grid.append(stat("特別企劃", state.content.special));
    counts.append(grid);
    if (state.content.completed_unpublished)
      counts.append(node("p", `其中 ${state.content.completed_unpublished} 支已完成、尚未標記上映。`, "rw-note"));
    hud.append(counts);

    const act = card("城市狀態", "rw-activity-card");
    const chip = node("span", ACTIVITY[state.activity.state] || state.activity.state, "rw-activity-chip");
    chip.dataset.state = state.activity.state;
    act.append(chip, node("p", state.activity.description, "rw-activity-text"));
    const facts = node("dl", undefined, "rw-facts");
    const fact = (k, v) => facts.append(node("dt", k), node("dd", v));
    fact("距離上次發布", state.activity.days_since_publish === null ? "—" : `${state.activity.days_since_publish} 天`);
    fact("街上人潮", CROWD[state.activity.crowd_density] || state.activity.crowd_density);
    fact("城市燈光", `${state.activity.lights_level}%`);
    fact("居民", `${state.residents.visible} / ${state.residents.capacity}`);
    act.append(facts);
    const events = (state.activity.event_flags || [])
      .map((f) => EVENTS[f] || (/^REVIVAL_AFTER_(\d+)D$/.test(f) ? `睽違 ${f.match(/\d+/)[0]} 天回歸` : null))
      .filter(Boolean);
    if (events.length) {
      const list = node("ul", undefined, "rw-events");
      for (const e of events) list.append(node("li", e));
      act.append(list);
    }
    if (state.activity.state === "REVIVAL" || state.activity.state === "FESTIVAL") {
      const replay = node("button", "再放一次煙火", "rw-chip-button");
      replay.type = "button";
      replay.addEventListener("click", () => renderScene(W.state));
      act.append(replay);
    }
    hud.append(act);

    const featured = card("精選內容", "rw-featured-card");
    if (!state.featured_contents.length) featured.append(node("p", "還沒有完成的內容。第一支片會掛在廣場上。", "rw-note"));
    for (const f of state.featured_contents) {
      const item = node("article", undefined, "rw-poster-card");
      const head = node("div", undefined, "rw-poster-head");
      head.append(node("span", TYPE[f.content_type] || f.content_type, "rw-type"));
      if (f.is_new) head.append(node("span", "NEW", "rw-new"));
      item.append(head, node("h3", f.title));
      item.append(node("p", `${f.status === "PUBLISHED" ? "上映" : "完成"} · ${date(f.date)}`, "rw-meta"));
      if (f.youtube_video_id && /^[A-Za-z0-9_-]{11}$/.test(f.youtube_video_id)) {
        const link = node("a", "在 YouTube 觀看", "rw-link");
        link.href = "https://www.youtube.com/watch?v=" + encodeURIComponent(f.youtube_video_id);
        link.target = "_blank";
        link.rel = "noopener";
        item.append(link);
      }
      featured.append(item);
    }
    hud.append(featured);

    const growth = card("最近的成長", "rw-growth-card");
    const list = node("ol", undefined, "rw-growth");
    for (const g of state.recent_growth) {
      const li = node("li");
      li.append(node("b", `+${g.points}`), node("span", `${TYPE[g.content_type] || g.content_type}「${g.title}」`), node("time", date(g.at)));
      list.append(li);
    }
    if (!state.recent_growth.length) list.append(node("li", "尚無成長紀錄"));
    growth.append(list);
    hud.append(growth);

    const road = card("文明時代", "rw-road-card");
    const steps = node("ol", undefined, "rw-eras");
    for (const e of state.eras) {
      const li = node("li", undefined, e.id === state.current_era ? "is-current" : e.reached ? "is-reached" : "");
      li.append(node("span", e.name), node("small", `${e.min_score}`));
      steps.append(li);
    }
    road.append(steps);
    hud.append(road);

    const people = node("details", undefined, "rw-card rw-roster-card");
    const summary = node("summary", "世界居民名冊");
    people.append(summary);
    const castList = node("div", undefined, "rw-roster");
    for (const c of state.characters) castList.append(characterCard(c));
    people.append(node("p", `今天在街上的角色 ${state.characters.length} 位 · 平民居民 ${state.residents.archetypes.length} 種職業`, "rw-note"), castList);
    const population = state.goosebaby?.population;
    if (population)
      people.append(
        node(
          "p",
          `鵝寶人口 ${population.total}（${Object.entries(population.by_tier || {})
            .map(([k, v]) => `${k} ${v}`)
            .join(" · ")}）· 只取統計，不顯示會員名稱`,
          "rw-note",
        ),
      );
    const full = node("div", undefined, "rw-roster-full");
    people.append(full);
    people.addEventListener("toggle", () => {
      if (people.open && !W.roster) loadRoster(full);
    });
    hud.append(people);

    const sim = node("details", undefined, "rw-card rw-sim-card");
    sim.append(node("summary", "世界模擬器（QA）"));
    sim.open = p.mode === "sim";
    const buttons = node("div", undefined, "rw-sim-row");
    for (const n of [0, 5, 10, 20, 35, 50, 75, 100]) {
      const b = node("button", String(n), "rw-chip-button" + (p.mode === "sim" && p.contents === n ? " is-on" : ""));
      b.type = "button";
      b.addEventListener("click", () => navigate({ sim: n, idle: p.mode === "sim" ? p.idle : 0, gap: 0 }));
      buttons.append(b);
    }
    const idle = node("div", undefined, "rw-sim-row");
    for (const [label, days, gap] of [
      ["剛發片", 0, 0],
      ["安靜 10 天", 10, 0],
      ["休眠 20 天", 20, 0],
      ["深度休眠 45 天", 45, 0],
      ["睽違回歸", 1, 20],
    ]) {
      const b = node("button", label, "rw-chip-button" + (p.mode === "sim" && p.idle === days && p.gap === gap ? " is-on" : ""));
      b.type = "button";
      b.addEventListener("click", () => navigate({ sim: p.mode === "sim" ? p.contents : 50, idle: days, gap }));
      idle.append(b);
    }
    sim.append(node("p", "模擬內容數", "rw-note"), buttons, node("p", "活躍度", "rw-note"), idle);
    if (p.mode === "sim") {
      const back = node("button", "回到正式世界", "rw-chip-button is-primary");
      back.type = "button";
      back.addEventListener("click", () => navigate(null));
      sim.append(back);
    }
    hud.append(sim);

    const districts = $("rw-districts");
    districts.replaceChildren();
    for (const d of state.districts) {
      const chipBox = node("div", undefined, "rw-district");
      chipBox.dataset.status = d.status;
      chipBox.append(node("strong", d.name), node("span", DISTRICT_STATUS[d.status]));
      chipBox.append(node("small", d.unlocked ? `${CROWD[d.crowd_density]} · ${d.content_count} 支內容` : d.unlock_hint || d.summary));
      chipBox.title = d.summary;
      districts.append(chipBox);
    }

    const footer = $("rw-footer");
    footer.replaceChildren();
    const sources = node("ul", undefined, "rw-sources");
    for (const s of state.sources || []) {
      const li = node("li");
      li.dataset.status = s.status;
      li.append(node("span", SOURCES[s.id] || s.id), node("b", `${STATUS[s.status] || s.status}${typeof s.count === "number" ? " · " + s.count : ""}`));
      sources.append(li);
    }
    footer.append(
      node("h2", "資料來源"),
      sources,
      node(
        "p",
        `世界只讀已完成的內容與角色權威資料，不寫回 Content OS。安靜只會讓城市變安靜，成長值與建築不會倒退。建築 ${stats.buildings} 棟 · 地標 ${stats.landmarks} 座 · ${new Date(state.generated_at).toLocaleString("zh-TW")} 更新`,
        "rw-note",
      ),
    );

    scheduleGossip(true);
  }

  function characterCard(c) {
    const box = node("figure", undefined, "rw-person");
    if (c.has_image) {
      const img = node("img");
      img.loading = "lazy";
      img.decoding = "async";
      img.alt = c.display_name;
      img.width = 64;
      img.height = 64;
      img.src = `/api/world/character-thumb/${encodeURIComponent(c.character_id)}?s=160`;
      box.append(img);
    } else box.append(node("span", "🐧", "rw-token"));
    box.append(node("figcaption", c.display_name));
    return box;
  }

  async function loadRoster(host) {
    host.replaceChildren(node("p", "讀取名冊…", "rw-note"));
    try {
      W.roster = await getJSON("/api/world/characters");
    } catch (error) {
      if (error.name === "AbortError") return;
      host.replaceChildren(node("p", "名冊暫時無法讀取。", "rw-note"));
      return;
    }
    host.replaceChildren();
    const groups = [
      ["MAIN_CHARACTER", "主角"],
      ["SUPPORTING_CHARACTER", "主要配角"],
      ["SPECIAL_GUEST", "特別來賓"],
      ["GOOSEBABY", "鵝寶"],
    ];
    for (const [type, label] of groups) {
      const rows = W.roster.characters.filter((c) => c.character_type === type && c.public_visibility);
      if (!rows.length) continue;
      host.append(node("h3", `${label} · ${rows.length}`));
      const grid = node("div", undefined, "rw-roster");
      for (const c of rows) grid.append(characterCard({ ...c, has_image: Boolean(c.asset_ref) }));
      host.append(grid);
    }
    const civ = W.roster.civilians || [];
    if (civ.length) {
      host.append(node("h3", `平民居民職業 · ${civ.length}`));
      host.append(node("p", civ.map((c) => c.label).join("、"), "rw-note"));
    }
    host.append(node("p", "角色外型以角色聖經與會員角色庫為準；世界只引用，不重畫。", "rw-note"));
  }

  function navigate(sim) {
    const url = new URL(location.href);
    for (const key of ["sim", "idle", "gap"]) url.searchParams.delete(key);
    if (sim) for (const [k, v] of Object.entries(sim)) url.searchParams.set(k, String(v));
    history.replaceState(null, "", url);
    load();
  }

  function showGossip() {
    const lines = W.state?.gossip || [];
    const bubble = $("rw-gossip");
    if (!lines.length) {
      bubble.querySelector("blockquote").textContent = "……";
      bubble.querySelector("figcaption").textContent = "";
      return;
    }
    const line = lines[((W.gossip % lines.length) + lines.length) % lines.length];
    bubble.querySelector("blockquote").textContent = line.text;
    bubble.querySelector("figcaption").textContent = "— " + (line.speaker?.label || "居民");
    bubble.dataset.category = line.category;
  }

  function scheduleGossip(reset) {
    clearTimers();
    if (reset) showGossip();
    if (W.paused || !W.running || !(W.state?.gossip || []).length) return;
    later(() => {
      W.gossip += 1;
      showGossip();
      scheduleGossip(false);
    }, 6500);
  }

  function pauseScene() {
    $("rw-stage").classList.add("rw-paused");
  }

  function pause() {
    if (W.paused) return;
    W.paused = true;
    clearTimers();
    pauseScene();
  }

  function resume() {
    if (!W.paused || !W.running) return;
    W.paused = false;
    $("rw-stage").classList.remove("rw-paused");
    scheduleGossip(false);
  }

  function start() {
    if (W.running) return;
    W.running = true;
    W.paused = document.hidden;
    listen(document, "visibilitychange", () => (document.hidden ? pause() : resume()));
    listen(window, "pagehide", stop);
    listen($("rw-refresh"), "click", () => load({ refresh: true }));
    listen($("rw-gossip-prev"), "click", () => {
      W.gossip -= 1;
      scheduleGossip(true);
    });
    listen($("rw-gossip-next"), "click", () => {
      W.gossip += 1;
      scheduleGossip(true);
    });
    listen($("rw-time"), "click", () => {
      W.time = TIMES[(TIMES.indexOf(W.time) + 1) % TIMES.length];
      $("rw-time").textContent = "時段：" + TIME_LABEL[W.time];
      $("rw-stage").dataset.daypart = daypart();
    });
    const query = window.matchMedia("(max-width: 720px)");
    listen(query, "change", () => W.state && renderScene(W.state));
    params();
    $("rw-time").textContent = "時段：" + TIME_LABEL[W.time];
    load();
  }

  function stop() {
    if (!W.running) return;
    W.running = false;
    clearTimers();
    for (const controller of W.aborts) controller.abort();
    W.aborts.clear();
    for (const [target, type, fn, options] of W.listeners) target.removeEventListener(type, fn, options);
    W.listeners = [];
    const stage = $("rw-stage");
    if (stage) stage.replaceChildren();
  }

  window.RenguinWorld = {
    start,
    stop,
    pause,
    resume,
    load,
    debug: () => ({
      running: W.running,
      paused: W.paused,
      timers: W.timers.size,
      pendingRequests: W.aborts.size,
      listeners: W.listeners.length,
      walkers: document.querySelectorAll("#rw-stage .rw-walker").length,
      animationsPaused: $("rw-stage")?.classList.contains("rw-paused") || false,
    }),
  };
  // Restored from the back/forward cache: the page was stopped on pagehide, so start again.
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) start();
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
