/* Renguin World · seamless world page. Loaded only by /world/seamless.
 *
 * The world is the page: native vertical scroll walks from the Star Office
 * sky island through the clouds to Renguin City, and the city is one long
 * street of districts that pans sideways. Budget: one state request (the
 * roster only when its panel is opened), layers that move by transform in one
 * animation frame per scroll burst, work only for sections and districts near
 * the viewport, CSS motion only while they are on screen, no timers, and
 * everything released on pagehide.
 */
(() => {
  "use strict";
  const Art = window.RenguinSeamlessArt;
  const Districts = window.RenguinSeamlessDistricts;
  const Cam = window.RenguinWorldCamera;
  const Compose = window.RenguinWorldComposition;
  const $ = (id) => document.getElementById(id);
  const G = Art.GEOMETRY;
  const TIMES = ["auto", "day", "dusk", "night"];
  const TIME_LABEL = { auto: "自動", day: "白天", dusk: "黃昏", night: "夜晚" };
  const ZOOMS = [1, 1.25, 1.5];
  const POSE = { WALKING: "散步中", IDLE: "待命中", CELEBRATING: "慶祝中", NAPPING: "打盹中", WORKING: "工作中", FILMING: "拍攝中", EDITING: "剪輯中", REVIEWING: "檢查中", ENGINEERING: "修東西" };
  const TYPE = { long: "長片", short: "短影音", member: "會員影片", special: "特別企劃", series: "系列完結" };
  // Labels shared with V1 so both views say the same thing about the same state.
  const ACTIVITY = { EMPTY_WORLD: "等待開拓", ACTIVE: "活躍", NORMAL: "日常", QUIET: "安靜", DORMANT: "休眠", DEEP_DORMANT: "深度休眠", REVIVAL: "復甦", FESTIVAL: "慶典" };
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
    MEMBER_ICON_FOLDER: "鵝寶會員正式素材（只讀對照）",
    MOCK_CONTENTS: "模擬內容",
  };
  const STATUS = {
    OK: "正常",
    OK_WITH_DECLARED_UNAVAILABLE_DATA: "已同步，部分資料未提供",
    PARTIAL: "同步未完整完成",
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
  const DISTRICT_STATUS = Districts.STATUS_LABEL;

  const W = {
    running: false,
    paused: false,
    still: false,
    state: null,
    mock: null,
    aborts: new Set(),
    listeners: [],
    disposers: [],
    mounted: [],
    observer: null,
    onscreen: null,
    near: new Set(),
    zone: "island",
    zoom: 0,
    time: "auto",
    ws: 1,
    comp: null,
    hidden: new Set(),
    sections: [],
    layers: [],
    street: null,
    plan: null,
    district: null,
    nearDistricts: new Set(),
    districtEls: new Map(),
    cable: null,
    gondola: null,
    wheels: null,
    talks: [],
    roster: null,
    scroll: null,
    streetScroll: null,
    resize: null,
  };

  const node = (tag, text, cls) => {
    const e = document.createElement(tag);
    if (text !== undefined && text !== null) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  };
  const listen = (target, type, fn, options) => {
    target.addEventListener(type, fn, options);
    W.listeners.push([target, type, fn, options]);
  };
  // Bindings that belong to one mounted world; a refresh drops them with the old DOM.
  const bind = (target, type, fn, options) => {
    target.addEventListener(type, fn, options);
    W.mounted.push(() => target.removeEventListener(type, fn, options));
  };
  const unmount = () => {
    for (const d of W.mounted) d();
    W.mounted = [];
  };
  const date = (value) => {
    const d = value ? new Date(value) : null;
    return d && !Number.isNaN(d.getTime()) ? `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}` : "日期未知";
  };
  const compactScreen = () => Boolean(W.comp?.compact) || window.innerWidth <= 720;

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
    if (TIMES.includes(q.get("time"))) W.time = q.get("time");
    // QA: ?hide=foreground,city.effects hides layers by name to prove each one stands alone.
    W.hidden = new Set((q.get("hide") || "").split(",").map((x) => x.trim()).filter(Boolean));
    if (!q.has("sim")) return { url: "/api/world/state", mock: false };
    const n = (key, hi) => Math.max(0, Math.min(hi, parseInt(q.get(key), 10) || 0));
    return { url: `/api/world/simulate?contents=${n("sim", 150)}&idle=${n("idle", 365)}&gap=${n("gap", 120)}`, mock: true, contents: n("sim", 150), idle: n("idle", 365), gap: n("gap", 120) };
  }

  function daypart() {
    if (W.time !== "auto") return W.time;
    const h = new Date().getHours();
    return h >= 6 && h < 17 ? "day" : h >= 17 && h < 19 ? "dusk" : "night";
  }

  // ---------- mount: a generic walk over the scene's declared layer stacks ----------
  function thumb(c) {
    const need = G.character * W.ws * (window.devicePixelRatio || 1);
    return `/api/world/character-thumb/${encodeURIComponent(c.character_id)}?s=${need > 170 ? 256 : 160}`;
  }

  function actor(c, x, y) {
    const b = node("button", undefined, `sw-actor is-${String(c.state || "IDLE").toLowerCase()}`);
    b.type = "button";
    b.style.setProperty("--x", x);
    b.style.setProperty("--y", y);
    b.style.setProperty("--delay", `-${(window.RenguinWorldScene.hash(c.character_id) * 3).toFixed(2)}s`);
    b.dataset.character = c.character_id;
    b.dataset.resolution = c.resolution || "CANONICAL_CHARACTER";
    if (c.stand) b.dataset.district = c.stand;
    b.setAttribute("aria-label", `${Art.nameOf(c)} · ${Art.roleOf(c)}`);
    const body = node("span", undefined, "sw-actor-body");
    const img = node("img");
    img.alt = "";
    img.decoding = "async";
    img.loading = "lazy";
    img.draggable = false;
    // Motion starts once the image has pixels: Chrome decides at animation start whether it can run on the
    // compositor, and an empty lazy box is "no visible change", which would tick on the main thread forever.
    img.addEventListener("load", () => b.classList.add("is-ready"), { once: true });
    img.src = thumb(c);
    if (img.complete && img.naturalWidth) b.classList.add("is-ready");
    body.append(img);
    b.append(body, node("span", Art.nameOf(c), "sw-nametag"));
    b.addEventListener("click", () => openCard(c, b));
    return b;
  }

  // Townsfolk sprites come from the building kit: generic paper folk in their role's clothes, one data URL per role and tone.
  const FOLK = new Map();
  const folk = (role, tone) => {
    const key = `${role}:${tone}`;
    if (!FOLK.has(key)) FOLK.set(key, `url("data:image/svg+xml,${encodeURIComponent(window.RenguinSeamlessBuildings.townsfolk(role, tone))}")`);
    return FOLK.get(key);
  };

  // The anonymous crowd (NEUTRAL_PLACEHOLDER): style-safe townsfolk, never a likeness. The sprite is the element's own
  // background, so the walking element paints its box and runs on the compositor.
  function pawn(p, x) {
    const el = node("i", undefined, "sw-pawn");
    el.dataset.resolution = "NEUTRAL_PLACEHOLDER";
    el.dataset.role = p.role || "CITIZEN";
    el.style.cssText = `--x:${x};--y:${p.y};--run:${p.run};--dur:${p.dur}s;--delay:${p.delay};--folk:${folk(p.role || "CITIZEN", p.tone || 0)}`;
    return el;
  }

  const BALLOON = `<svg viewBox="-60 -150 120 210" aria-hidden="true"><path d="M0-146C-54-146-58-84-40-50-28-28-10-12-8 0H8C10-12 28-28 40-50 58-84 54-146 0-146Z" fill="#f28c6d" stroke="#3a3150" stroke-opacity=".4" stroke-width="2"/><path d="M0-146C-22-146-26-80-16-48-10-26-4-10-4 0H4C4-10 10-26 16-48 26-80 22-146 0-146Z" fill="#fff4e0"/><path d="M-8 0L-14 26M8 0L14 26" stroke="#8a6848" stroke-width="2"/><rect x="-16" y="26" width="32" height="24" rx="4" fill="#b98a5a" stroke="#3a3150" stroke-opacity=".4"/></svg>`;

  // Effects are descriptors from the art; each kind is one small compositor-only element.
  function effect(fx, x = fx.x) {
    const el = node("i", undefined, `sw-fx sw-fx-${fx.kind}`);
    el.style.setProperty("--x", x);
    el.style.setProperty("--y", fx.y);
    if (fx.color) el.style.setProperty("--c", fx.color);
    if (fx.r !== undefined) el.style.setProperty("--r", fx.r + "deg");
    if (fx.delay !== undefined) el.style.setProperty("--delay", (fx.kind === "bird" ? -fx.delay : fx.delay) + "s");
    if (fx.kind === "balloon") el.innerHTML = BALLOON;
    return el;
  }

  function hotspot(tag, cls, label, tip, [x, y, w, h]) {
    const el = node(tag, undefined, "sw-hotspot " + cls);
    el.setAttribute("aria-label", label);
    el.style.cssText = `--x:${x};--y:${y};--w:${w};--h:${h}`;
    el.append(node("span", tip, "sw-hotspot-tip"));
    return el;
  }

  // One wrapper per district inside a street layer: the unit that is culled and anchored.
  function chunk(layer, d) {
    const el = node("div", undefined, "sw-chunk");
    el.dataset.district = d.id;
    el.style.cssText = `--cx:${d.x};--cw:${d.width}`;
    layer.append(el);
    if (!W.districtEls.has(d.id)) W.districtEls.set(d.id, []);
    W.districtEls.get(d.id).push(el);
    return el;
  }

  function mount(state) {
    unmount();
    const world = $("sw-world");
    $("sw-defs").innerHTML = Art.defs();
    world.replaceChildren();
    W.sections = [];
    W.layers = [];
    W.talks = [];
    W.districtEls = new Map();
    W.nearDistricts = new Set();
    W.district = null;
    const scene = Art.scene(state, { crowdCap: compactScreen() ? state.residents?.render_cap?.mobile ?? 14 : state.residents?.render_cap?.desktop ?? 28 });
    const half = G.island.width / 2;
    let residents = 0;
    for (const spec of scene.sections) {
      const s = node("section", undefined, `sw-section sw-${spec.zone}`);
      s.id = "sw-" + spec.zone;
      s.dataset.zone = spec.zone;
      s.dataset.anchor = spec.anchor;
      s.style.setProperty("--h", spec.height);
      let street = null;
      const byName = {};
      const districtOf = new Map();
      if (spec.street) {
        W.plan = spec.street;
        for (const d of spec.street.districts) districtOf.set(d.id, d);
        s.style.setProperty("--w", spec.street.width);
        const scroller = node("div", undefined, "sw-street-scroll");
        scroller.tabIndex = 0;
        scroller.setAttribute("aria-label", "Renguin City 街道，可左右移動，經過各個街區");
        street = node("div", undefined, "sw-street");
        scroller.append(street);
        s.append(scroller);
        W.street = scroller;
      }
      for (const l of spec.layers) {
        const el = node("div", undefined, "sw-layer");
        el.dataset.layer = l.name;
        el.dataset.depth = l.depth;
        el.dataset.host = l.host;
        el.style.zIndex = l.z;
        el.classList.toggle("sw-cull", Boolean(l.cull));
        // Section layers of a street section span the street; the others are centred on the world axis.
        el.classList.add(spec.street ? "sw-span" : "sw-center");
        const entry = { el, name: l.name, zone: spec.zone, host: l.host, depth: l.depth, section: s, chunks: null };
        if (l.chunks) {
          entry.chunks = l.chunks.map((c) => {
            const wrap = chunk(el, { id: c.district, x: c.x, width: c.width });
            wrap.innerHTML = c.svg || "";
            return { el: wrap, district: c.district, x: c.x };
          });
        } else if (l.kind === "svg") el.innerHTML = l.svg || "";
        (l.host === "street" ? street : s).append(el);
        byName[l.name] = el;
        W.layers.push(entry);
        if (W.hidden.has(`${spec.zone}.${l.name}`) || W.hidden.has(l.name)) el.hidden = true;
      }
      // DOM layers on the street are grouped per district, so they cull with the district's art.
      const slot = (layerName, districtId) => {
        const layer = byName[layerName];
        const d = districtOf.get(districtId);
        if (!d) return { host: layer, dx: 0 };
        const entry = W.layers.find((l) => l.el === layer);
        entry.chunks = entry.chunks || [];
        let wrap = entry.chunks.find((c) => c.district === d.id);
        if (!wrap) {
          wrap = { el: chunk(layer, d), district: d.id, x: d.x };
          entry.chunks.push(wrap);
        }
        return { host: wrap.el, dx: d.x };
      };
      for (const p of spec.crowd || []) {
        const { host, dx } = slot("residents", p.district);
        host.append(pawn(p, p.x - dx));
      }
      for (const r of spec.residents) {
        const { host, dx } = spec.street ? slot("residents", r.district) : { host: byName.residents, dx: 0 };
        const el = actor(r.character, r.x - dx, r.y);
        el.dataset.spot = r.spot;
        host.append(el);
        residents += 1;
      }
      for (const fx of spec.effects) {
        const { host, dx } = spec.street ? slot("effects", fx.district) : { host: byName.effects, dx: 0 };
        host.append(effect(fx, fx.x - dx));
      }
      for (const h of spec.hotspots || []) {
        const { host, dx } = slot("buildings", h.district);
        const [x, y, w, hh] = h.box;
        const el = hotspot("button", "sw-place-link", h.label, h.tip, [x - dx, y, w, hh]);
        el.type = "button";
        el.dataset.hotspot = h.id;
        el.dataset.district = h.district;
        if (h.active) el.dataset.active = "true";
        el.addEventListener("click", () => (h.action === "videos" ? openDrawer("videos") : openPlace(h.district, h, el)));
        host.append(el);
      }
      for (const [k, t] of (spec.talk || []).entries()) {
        const { host, dx } = slot("effects", t.district);
        const bubble = node("button", undefined, "sw-talk");
        bubble.type = "button";
        bubble.dataset.district = t.district;
        bubble.style.cssText = `--x:${t.x - dx};--y:${t.y};--delay:${-(k * 1.3).toFixed(1)}s`;
        bubble.append(node("span", "", "sw-talk-text"), node("small", "", "sw-talk-who"));
        const talk = { el: bubble, step: k };
        bubble.addEventListener("animationiteration", () => say(talk, 1));
        bubble.addEventListener("click", () => say(talk, 1));
        host.append(bubble);
        W.talks.push(talk);
      }
      if (spec.zone === "island") {
        const office = hotspot("a", "sw-office-link", "進入 Star Office", "進入 Star Office", [G.island.office[0] + half, ...G.island.office.slice(1)]);
        office.href = "/";
        byName.buildings.append(office);
        const wheel = node("i", undefined, "sw-wheel");
        wheel.style.cssText = `--x:${G.island.wheel[0] + half};--y:${G.island.wheel[1]}`;
        byName.terrain.append(wheel);
        const hint = node("button", "往下探索", "sw-descend");
        hint.type = "button";
        hint.addEventListener("click", () => goTo("descent"));
        s.append(hint);
        W.wheels = [wheel];
      }
      if (spec.zone === "city") {
        const main = slot("buildings", "MAIN_CITY").host;
        const [px, py, pw, ph] = G.city.poster;
        const poster = hotspot("button", "sw-poster-link", "看精選影片", "精選影片", [px - 34, py - 22, pw + 68, ph + 44]);
        poster.type = "button";
        poster.addEventListener("click", () => openDrawer("videos"));
        main.append(poster);
        // The cable's street end stays outside any district chunk, so it can be measured while the main street is culled.
        const wheel = node("i", undefined, "sw-wheel");
        wheel.style.cssText = `--x:${G.city.wheel[0]};--y:${G.city.wheel[1]}`;
        byName.buildings.append(wheel);
        W.wheels.push(wheel);
        s.append(node("p", "← 左右滑動，逛逛各個街區 →", "sw-swipe-hint"));
        const end = node("footer", undefined, "sw-end");
        const open = spec.street.districts.filter((d) => d.status === "UNLOCKED").length;
        end.append(node("span", `Renguin City · ${open} / ${spec.street.districts.length} 個街區已開放，其他街區還在等新片。`));
        const top = node("button", "回到空島 ↑", "sw-chip");
        top.type = "button";
        top.addEventListener("click", () => goTo("island"));
        end.append(top);
        s.append(end);
      }
      world.append(s);
      W.sections.push(s);
    }

    // The sky cable and its gondola belong to the world, not to a section: one line from island to street.
    W.cable = node("div", undefined, "sw-cable");
    W.gondola = node("div", undefined, "sw-gondola");
    W.cable.style.zIndex = W.gondola.style.zIndex = scene.cable_z;
    W.gondola.innerHTML = `<svg viewBox="-40 -14 80 96" aria-hidden="true"><path d="M0-12V16" stroke="#4e4763" stroke-width="4"/><circle cx="0" cy="-10" r="6" fill="#4e4763"/><path d="M-34 16H34L30 76H-30Z" fill="#e07d4f" stroke="#3a3150" stroke-opacity=".45" stroke-width="2"/><rect x="-26" y="26" width="22" height="22" rx="3" fill="#ffe39a"/><rect x="4" y="26" width="22" height="22" rx="3" fill="#ffe39a"/><path d="M-32 58H32" stroke="#fff4e0" stroke-width="5"/></svg>`;
    world.append(W.cable, W.gondola);

    buildDistrictNav();
    for (const talk of W.talks) say(talk, 0);
    W.zone = "island";
    $("sw-app").dataset.zone = "island";
    for (const b of $("sw-altimeter").querySelectorAll("button[data-zone]")) b.setAttribute("aria-current", String(b.dataset.zone === "island"));
    W.mounted.push(Cam.dragPan(W.street));
    bind(W.street, "scroll", W.streetScroll, { passive: true });
    observe();
    applyScale(true);
    return residents;
  }

  // ---------- motion: culling, parallax, cable, gondola ----------
  function observe() {
    W.observer?.disconnect();
    W.onscreen?.disconnect();
    W.near.clear();
    W.observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          e.target.toggleAttribute("data-near", e.isIntersecting);
          if (e.isIntersecting) W.near.add(e.target);
          else W.near.delete(e.target);
        }
        W.scroll();
      },
      { rootMargin: "60% 0px" },
    );
    // Motion runs only where the viewer can see it: Chrome cannot composite an animation it judges invisible,
    // so an off-screen one would tick on the main thread. Culling and parallax keep the wider "near" margin.
    W.onscreen = new IntersectionObserver((entries) => {
      for (const e of entries) e.target.toggleAttribute("data-onscreen", e.isIntersecting);
    });
    for (const s of W.sections) {
      W.observer.observe(s);
      W.onscreen.observe(s);
    }
  }

  // Write a transform only when it changed: an unchanged inline style still costs a style recalc.
  const move = (el, value) => {
    if (el.__sw !== value) {
      el.__sw = value;
      el.style.transform = value;
    }
  };

  const pageRect = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2 + window.scrollX, y: r.top + r.height / 2 + window.scrollY };
  };

  // Districts within 60% of a screen of the street's view are worked; the rest are skipped by the browser.
  function cullStreet() {
    if (!W.street || !W.plan) return;
    const left = W.street.scrollLeft,
      vw = W.street.clientWidth,
      margin = vw * 0.6;
    for (const d of W.plan.districts) {
      const near = d.x * W.ws < left + vw + margin && (d.x + d.width) * W.ws > left - margin;
      if (near === W.nearDistricts.has(d.id)) continue;
      if (near) W.nearDistricts.add(d.id);
      else W.nearDistricts.delete(d.id);
      for (const el of W.districtEls.get(d.id) || []) el.toggleAttribute("data-near", near);
    }
    const here = Districts.at({ districts: W.plan.districts }, (left + vw / 2) / W.ws);
    if (here && here.id !== W.district) {
      W.district = here.id;
      $("sw-app").dataset.district = here.id;
      $("sw-district-name").textContent = here.name;
      $("sw-district").dataset.status = here.status;
      $("sw-district").setAttribute("aria-label", `目前街區：${here.name}（${DISTRICT_STATUS[here.status] || here.status}），選擇其他街區`);
      for (const b of $("sw-district-list").querySelectorAll("button")) b.setAttribute("aria-current", String(b.dataset.district === here.id));
    }
  }

  // One rule for every layer, decided by its host and depth:
  //   section layer          lags vertically by depth; in a street section it also lags sideways
  //   street layer           slides sideways by depth, anchored at the start of its own district
  function onScroll() {
    if (!W.running) return;
    const y = window.scrollY,
      vh = window.innerHeight,
      still = Cam.reducedMotion(),
      left = W.street ? W.street.scrollLeft : 0;
    cullStreet();
    for (const l of W.layers) {
      if (!W.near.has(l.section)) continue;
      const streetSection = l.section.dataset.zone === "city";
      if (l.depth === 1 && !(streetSection && l.host === "section")) continue;
      if (still) {
        move(l.el, streetSection && l.host === "section" ? `translate3d(${-left}px, 0, 0)` : "");
        if (l.chunks) for (const c of l.chunks) move(c.el, "");
        continue;
      }
      if (l.host === "street") {
        if (!l.chunks) move(l.el, `translate3d(${(left * (1 - l.depth)).toFixed(0)}px, 0, 0)`);
        else for (const c of l.chunks) if (W.nearDistricts.has(c.district)) move(c.el, `translate3d(${((left - c.x * W.ws) * (1 - l.depth)).toFixed(0)}px, 0, 0)`);
        continue;
      }
      const offset = Cam.anchorOffset(l.section.dataset.anchor, l.section.offsetTop, l.section.offsetHeight, y, vh);
      const x = streetSection ? (-left * l.depth).toFixed(0) : 0;
      move(l.el, `translate3d(${x}px, ${Cam.parallax(offset, l.depth).toFixed(0)}px, 0)`);
    }
    placeGondola();
    // Which altitude are we at: the section holding the viewport's middle.
    const mid = y + vh * 0.5;
    const zone = W.sections.find((s) => mid >= s.offsetTop && mid < s.offsetTop + s.offsetHeight)?.dataset.zone || (mid < 0 ? "island" : "city");
    if (zone !== W.zone) {
      W.zone = zone;
      $("sw-app").dataset.zone = zone;
      for (const b of $("sw-altimeter").querySelectorAll("button[data-zone]")) b.setAttribute("aria-current", String(b.dataset.zone === zone));
      $("sw-street-nav").hidden = zone !== "city";
      $("sw-district-nav").hidden = zone !== "city";
      if (zone !== "city") toggleDistrictList(false);
    }
  }

  function placeCable() {
    if (!W.cable || !W.wheels || W.wheels.length < 2) return;
    const a = pageRect(W.wheels[0]),
      b = pageRect(W.wheels[1]);
    W.cableEnds = { a, b };
    const dx = b.x - a.x,
      dy = b.y - a.y;
    W.cable.style.left = a.x.toFixed(1) + "px";
    W.cable.style.top = a.y.toFixed(1) + "px";
    W.cable.style.width = Math.hypot(dx, dy).toFixed(1) + "px";
    W.cable.style.transform = `rotate(${Math.atan2(dy, dx).toFixed(4)}rad)`;
    placeGondola();
  }

  function placeGondola() {
    if (!W.cableEnds) return;
    const { a, b } = W.cableEnds;
    const t = Cam.clamp((window.scrollY + window.innerHeight * 0.5 - a.y) / (b.y - a.y), 0, 1);
    const x = Cam.lerp(a.x, b.x, t),
      y = Cam.lerp(a.y, b.y, t);
    move(W.gondola, `translate3d(${x.toFixed(0)}px, ${y.toFixed(0)}px, 0) scale(${W.ws})`);
    const docked = t >= 1 ? "city" : t <= 0 ? "island" : "moving";
    if (W.gondola.dataset.docked !== docked) W.gondola.dataset.docked = docked;
  }

  function onStreetScroll() {
    if (!W.running || !W.street) return;
    const max = W.street.scrollWidth - W.street.clientWidth;
    $("sw-street-left").disabled = W.street.scrollLeft <= 2;
    $("sw-street-right").disabled = W.street.scrollLeft >= max - 2;
    placeCable();
    W.scroll();
  }

  // Composition rule A: one world scale and two composed views for every viewport ratio.
  function applyScale(initial) {
    const doc = document.documentElement;
    const ratio = doc.scrollHeight > window.innerHeight ? window.scrollY / (doc.scrollHeight - window.innerHeight) : 0;
    // Keep the same spot of the street in the middle when the scale changes.
    const centre = W.street && !initial ? (W.street.scrollLeft + W.street.clientWidth / 2) / W.ws : null;
    const comp = Compose.compose({ width: window.innerWidth, height: window.innerHeight, zoom: ZOOMS[W.zoom] });
    W.comp = comp;
    W.ws = comp.ws;
    doc.style.setProperty("--ws", W.ws);
    doc.style.setProperty("--island-lead", comp.island.lead + "px");
    $("sw-app").classList.toggle("is-compact", comp.compact);
    const city = W.sections.find((s) => s.dataset.zone === "city");
    if (city) city.style.setProperty("--h", comp.city.height);
    const squeeze = comp.island.squeeze(G.island.spots);
    for (const el of document.querySelectorAll('.sw-island [data-layer="residents"] .sw-actor')) el.style.setProperty("--x", (+el.dataset.spot * squeeze + G.island.width / 2).toFixed(1));
    $("sw-zoom-out").disabled = W.zoom === 0;
    $("sw-zoom-in").disabled = W.zoom === ZOOMS.length - 1;
    for (const img of document.querySelectorAll(".sw-actor img")) {
      const next = thumb({ character_id: img.closest(".sw-actor").dataset.character });
      if (next.endsWith("256") && !img.src.endsWith("256")) img.src = next;
    }
    if (initial) window.scrollTo({ top: 0, behavior: "instant" });
    else window.scrollTo({ top: ratio * (doc.scrollHeight - window.innerHeight), behavior: "instant" });
    if (centre !== null) W.street.scrollLeft = centre * W.ws - W.street.clientWidth / 2;
    // A new scale moves every district boundary: cull again from scratch.
    for (const id of W.nearDistricts) for (const el of W.districtEls.get(id) || []) el.removeAttribute("data-near");
    W.nearDistricts.clear();
    cullStreet();
    placeCable();
    W.scroll();
    W.streetScroll();
  }

  // Seamless navigation C: every jump is a scroll of the same page, never a page or a route.
  function goTo(zone) {
    const s = W.sections.find((x) => x.dataset.zone === zone);
    if (!s) return;
    const top = zone === "city" ? s.offsetTop + s.offsetHeight - window.innerHeight : zone === "descent" ? s.offsetTop - window.innerHeight * 0.1 : 0;
    Cam.scrollTo(window, { top });
  }

  // District travel is the same street scrolled sideways (and the page scrolled down to the city if needed).
  function goToDistrict(id) {
    const d = W.plan?.districts.find((x) => x.id === id);
    if (!d || !W.street) return false;
    if (W.zone !== "city") goTo("city");
    Cam.scrollTo(W.street, { left: Math.max(0, d.x * W.ws) });
    toggleDistrictList(false);
    return true;
  }

  function setLayer(name, visible) {
    let count = 0;
    for (const l of W.layers)
      if (l.name === name || `${l.zone}.${l.name}` === name) {
        l.el.hidden = !visible;
        count += 1;
      }
    return count;
  }

  // ---------- district navigator ----------
  function districtLine(d) {
    if (d.status === "UNLOCKED") return `${CROWD[d.crowd_density] || "—"} · ${d.content_count ?? 0} 支內容`;
    return d.unlock_hint || d.summary || "";
  }

  function buildDistrictNav() {
    const list = $("sw-district-list");
    list.replaceChildren();
    for (const d of W.plan?.districts || []) {
      const b = node("button", undefined, "sw-district-item");
      b.type = "button";
      b.dataset.district = d.id;
      b.dataset.status = d.status;
      b.append(node("strong", d.name), node("span", DISTRICT_STATUS[d.status] || d.status, "sw-district-status"), node("small", districtLine(d)));
      b.addEventListener("click", () => goToDistrict(d.id));
      list.append(b);
    }
  }

  function toggleDistrictList(open) {
    const list = $("sw-district-list");
    const next = open === undefined ? list.hidden : open;
    list.hidden = !next;
    $("sw-district").setAttribute("aria-expanded", String(next));
  }

  // ---------- gossip: CSS decides when a line has been shown long enough, so no timer runs ----------
  function say(talk, advance) {
    const lines = W.state?.gossip || [];
    talk.el.hidden = !lines.length;
    if (!lines.length) return;
    talk.step += advance;
    const line = lines[((talk.step % lines.length) + lines.length) % lines.length];
    talk.el.querySelector(".sw-talk-text").textContent = line.text;
    talk.el.querySelector(".sw-talk-who").textContent = "— " + (line.speaker?.label || "居民");
    talk.el.dataset.category = line.category;
    talk.el.setAttribute("aria-label", `居民八卦：${line.text}（${line.speaker?.label || "居民"}），按一下聽下一句`);
  }

  // ---------- cards and drawer (secondary) ----------
  let cardOwner = null;
  function showCard(owner, kind) {
    cardOwner?.classList.remove("is-selected");
    cardOwner = owner;
    owner?.classList.add("is-selected");
    const card = $("sw-card");
    card.dataset.kind = kind;
    $("sw-card-facts").replaceChildren();
    $("sw-card-actions").replaceChildren();
    return (k, v) => v !== undefined && v !== null && v !== "" && $("sw-card-facts").append(node("dt", k), node("dd", String(v)));
  }

  function openCard(c, owner) {
    const fact = showCard(owner, "resident");
    $("sw-card-img").hidden = false;
    $("sw-card-img").src = thumb(c).replace(/s=\d+/, "s=256");
    $("sw-card-img").alt = Art.nameOf(c);
    $("sw-card-name").textContent = Art.nameOf(c);
    $("sw-card-role").textContent = Art.roleOf(c);
    const districts = W.state?.districts || [];
    const home = districts.find((d) => d.id === c.district);
    const here = c.stand === "ISLAND" ? { name: "Star Office 空島" } : districts.find((d) => d.id === c.stand);
    fact("所屬街區", home?.name);
    if (here && here.name !== home?.name) fact("現在在", here.name);
    fact("現在", POSE[c.state]);
    fact("角色來源", Art.sourceOf(c) + (c.resolution === "PROFESSION_CHARACTER" ? " · 身分保密" : ""));
    $("sw-card").hidden = false;
    $("sw-card-close").focus({ preventScroll: true });
  }

  function openPlace(id, spot, owner) {
    const d = W.plan?.districts.find((x) => x.id === id);
    if (!d) return;
    const fact = showCard(owner, "place");
    $("sw-card-img").hidden = true;
    $("sw-card-name").textContent = spot && !["DISTRICT", "LOT"].includes(spot.key) ? `${d.name} · ${spot.tip}` : d.name;
    $("sw-card-role").textContent = d.summary || "";
    fact("狀態", DISTRICT_STATUS[d.status] || d.status);
    if (d.status === "UNLOCKED") {
      fact("街上人潮", CROWD[d.crowd_density]);
      fact("相關內容", d.content_count !== null ? `${d.content_count} 支` : null);
      fact("最近 30 天", d.recent_count !== null ? `${d.recent_count} 支` : null);
      const hot = (d.active_hotspots || []).map((k) => Districts.HOTSPOT_LABEL[k] || k);
      fact("正熱鬧", hot.length ? hot.join("、") : "目前沒有");
      if (id === "TRAVEL_DISTRICT") fact("碼頭的船", `${Math.min(6, d.content_count || 0)} 艘（一次出國一艘）`);
      if (id === "MEMBER_DISTRICT" && Number.isInteger(W.state?.goosebaby?.population?.total)) fact("鵝寶人口", `${W.state.goosebaby.population.total}（只取統計）`);
    } else fact("解鎖條件", d.unlock_hint);
    const actions = $("sw-card-actions");
    if (id === "VIDEO_HALL" || spot?.key === "PREMIERE") {
      const b = node("button", "看精選影片", "sw-chip");
      b.type = "button";
      b.addEventListener("click", () => openDrawer("videos"));
      actions.append(b);
    }
    if (id === "CREATOR_DISTRICT") {
      const a = node("a", "進入 Star Office", "sw-chip");
      a.href = "/";
      actions.append(a);
    }
    $("sw-card").hidden = false;
    $("sw-card-close").focus({ preventScroll: true });
  }

  function closeCard() {
    $("sw-card").hidden = true;
    cardOwner?.classList.remove("is-selected");
    cardOwner?.focus({ preventScroll: true });
    cardOwner = null;
  }

  function openDrawer(focus) {
    const drawer = $("sw-drawer");
    if (!drawer.dataset.built) buildDrawer();
    drawer.hidden = false;
    $("sw-data").setAttribute("aria-expanded", "true");
    if (focus === "videos") drawer.querySelector(".sw-videos")?.scrollIntoView({ block: "start" });
    $("sw-drawer-close").focus({ preventScroll: true });
  }

  function closeDrawer() {
    $("sw-drawer").hidden = true;
    $("sw-data").setAttribute("aria-expanded", "false");
  }

  function buildDrawer() {
    const s = W.state;
    const p = params();
    const body = $("sw-drawer-body");
    body.replaceChildren();
    const card = (title, cls) => {
      const box = node("section", undefined, "sw-panel " + (cls || ""));
      if (title) box.append(node("h3", title));
      body.append(box);
      return box;
    };
    const button = (text, fn, cls = "sw-chip") => {
      const b = node("button", text, cls);
      b.type = "button";
      b.addEventListener("click", fn);
      return b;
    };

    const tools = card(null, "sw-tools-panel");
    tools.append(node("span", s.source === "MOCK" ? "模擬資料" : "正式資料", "sw-source"));
    tools.lastChild.dataset.source = s.source;
    tools.append(button("重新整理", () => load({ refresh: true })));
    const motion = button(W.still ? "恢復動態" : "暫停動態", () => setStill(!W.still));
    motion.id = "sw-motion";
    motion.setAttribute("aria-pressed", String(W.still));
    tools.append(motion);

    const era = card(`${s.current_era_name} · Lv.${s.world_level}`, "sw-era");
    era.append(node("p", `${s.era.name_en} · ${s.current_era} · ${s.current_stage}`, "sw-note"));
    if (s.era.tagline) era.append(node("p", s.era.tagline, "sw-tagline"));
    const bar = node("div", undefined, "sw-meter is-wide");
    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-valuemin", "0");
    bar.setAttribute("aria-valuemax", "100");
    bar.setAttribute("aria-valuenow", String(Math.round(s.era_progress * 100)));
    bar.append(node("i"));
    bar.firstChild.style.width = Math.round(s.era_progress * 100) + "%";
    era.append(bar, node("p", s.next_era ? `成長值 ${s.world_score} · 再 ${s.score_to_next_era} 進入「${s.next_era_name}」` : `成長值 ${s.world_score} · 已抵達最後一個時代`, "sw-note"));

    const act = card("城市狀態", "sw-activity");
    const chip = node("span", ACTIVITY[s.activity.state] || s.activity.state, "sw-activity-chip");
    chip.dataset.state = s.activity.state;
    act.append(chip, node("p", s.activity.description, "sw-note"));
    const facts = node("dl", undefined, "sw-facts");
    const fact = (k, v) => facts.append(node("dt", k), node("dd", v));
    fact("距離最近內容紀錄", s.activity.days_since_publish === null ? "—" : `${s.activity.days_since_publish} 天`);
    fact("街上人潮", CROWD[s.activity.crowd_density] || s.activity.crowd_density);
    fact("城市燈光", `${s.activity.lights_level}%`);
    fact("居民", `${s.residents.visible} / ${s.residents.capacity}`);
    act.append(facts);
    const events = (s.activity.event_flags || []).map((f) => EVENTS[f] || (/^REVIVAL_AFTER_(\d+)D$/.test(f) ? `睽違 ${f.match(/\d+/)[0]} 天回歸` : null)).filter(Boolean);
    if (events.length) {
      const list = node("ul", undefined, "sw-list");
      for (const e of events) list.append(node("li", e));
      act.append(list);
    }
    if (s.activity.state === "REVIVAL" || s.activity.state === "FESTIVAL") act.append(button("再放一次煙火", replayCelebration));

    const content = card("內容", "sw-content");
    content.append(node("p", `已完成 ${s.content.total} · 長片 ${s.content.long} · 短影音 ${s.content.short} · 會員影片 ${s.content.member}${s.content.special ? ` · 特別企劃 ${s.content.special}` : ""}`, "sw-note"));
    if (s.content.completed_unpublished) content.append(node("p", `其中 ${s.content.completed_unpublished} 支已完成、尚未標記上映。`, "sw-note"));

    const districts = card("街區", "sw-districts");
    for (const d of W.plan?.districts || []) {
      const row = node("div", undefined, "sw-district-row");
      row.dataset.status = d.status;
      const text = node("div");
      text.append(node("strong", d.name), node("span", ` ${DISTRICT_STATUS[d.status] || d.status}`, "sw-district-status"), node("p", districtLine(d), "sw-note"));
      row.append(
        text,
        button(
          "前往",
          () => {
            closeDrawer();
            goToDistrict(d.id);
          },
          "sw-chip sw-go",
        ),
      );
      districts.append(row);
    }

    const videos = card("精選影片", "sw-videos");
    const counts = s.popularity?.resolution_counts;
    if (s.source === "LIVE" && counts) videos.append(node("p", `YouTube：${counts.FULLY_VERIFIED} 筆完整資料；${counts.IDENTITY_VERIFIED} 筆觀看次數未提供（unavailable）；${counts.IDENTITY_UNRESOLVED} 筆身份未確認。`, "sw-note"));
    if (!s.featured_contents.length) videos.append(node("p", "還沒有完成的內容。第一支片會掛在廣場上。", "sw-note"));
    for (const f of s.featured_contents) {
      const item = node("article", undefined, "sw-video");
      const head = node("p", `${TYPE[f.content_type] || f.content_type}`, "sw-note");
      if (f.is_new) head.append(node("span", "NEW", "sw-new"));
      item.append(head, node("strong", f.title), node("p", `${f.status === "PUBLISHED" ? "上映紀錄" : "完成紀錄"} · ${date(f.date)}${f.date_basis === "COMPLETED_AT" ? "（完成日）" : ""}`, "sw-note"));
      if (Number.isInteger(f.view_count) && f.view_count >= 0) item.append(node("p", `觀看次數：${f.view_count.toLocaleString("zh-TW")}`, "sw-note"));
      else if (f.youtube_resolution_status === "IDENTITY_VERIFIED") item.append(node("p", "觀看次數：YouTube 未提供（unavailable）", "sw-note"));
      else if (s.source === "LIVE") item.append(node("p", "YouTube 影片身份尚未確認", "sw-note"));
      if (f.youtube_video_id && /^[A-Za-z0-9_-]{11}$/.test(f.youtube_video_id)) {
        const a = node("a", "在 YouTube 觀看", "sw-link");
        a.href = "https://www.youtube.com/watch?v=" + encodeURIComponent(f.youtube_video_id);
        a.target = "_blank";
        a.rel = "noopener";
        item.append(a);
      }
      videos.append(item);
    }

    const growth = card("最近的成長");
    const list = node("ol", undefined, "sw-list");
    for (const g of s.recent_growth) list.append(node("li", `+${g.points} ${TYPE[g.content_type] || g.content_type}「${g.title}」 ${date(g.at)}`));
    if (!s.recent_growth.length) list.append(node("li", "尚無成長紀錄"));
    growth.append(list);

    const road = card("文明時代", "sw-road");
    const steps = node("ol", undefined, "sw-eras");
    for (const e of s.eras) {
      const li = node("li", undefined, e.id === s.current_era ? "is-current" : e.reached ? "is-reached" : "");
      li.append(node("span", e.name), node("small", ` ${e.min_score}`));
      steps.append(li);
    }
    road.append(steps);

    const gossip = card("居民八卦", "sw-gossip");
    const lines = node("ul", undefined, "sw-list");
    for (const g of s.gossip || []) lines.append(node("li", `「${g.text}」— ${g.speaker?.label || "居民"}`));
    if (!(s.gossip || []).length) lines.append(node("li", "……"));
    gossip.append(lines);

    const people = node("details", undefined, "sw-panel sw-roster-panel");
    people.append(node("summary", "世界居民名冊"));
    people.append(node("p", `今天在世界裡的角色 ${s.characters.length} 位 · 平民居民 ${s.residents.archetypes.length} 種職業`, "sw-note"));
    const population = s.goosebaby?.population;
    if (population)
      people.append(
        node(
          "p",
          `鵝寶人口 ${population.total}（${Object.entries(population.by_tier || {})
            .map(([k, v]) => `${k} ${v}`)
            .join(" · ")}）· 只取統計，不顯示會員名稱`,
          "sw-note",
        ),
      );
    const full = node("div", undefined, "sw-roster");
    people.append(full);
    people.addEventListener("toggle", () => {
      if (people.open && !W.roster) loadRoster(full);
    });
    body.append(people);

    const sim = node("details", undefined, "sw-panel sw-sim");
    sim.append(node("summary", "世界模擬器（QA）"));
    sim.open = p.mock;
    const link = (text, query, on) => {
      const a = node("a", text, "sw-chip" + (on ? " is-on" : ""));
      a.href = "/world/seamless?" + new URLSearchParams(query).toString();
      return a;
    };
    const row1 = node("div", undefined, "sw-sim-row");
    for (const n of [0, 5, 10, 20, 35, 50, 75, 100]) row1.append(link(String(n), { sim: n, idle: p.mock ? p.idle : 0, gap: 0 }, p.mock && p.contents === n));
    const row2 = node("div", undefined, "sw-sim-row");
    for (const [label, days, gap] of [["剛發片", 0, 0], ["安靜 10 天", 10, 0], ["休眠 20 天", 20, 0], ["深度休眠 45 天", 45, 0], ["睽違回歸", 1, 20]]) row2.append(link(label, { sim: p.mock ? p.contents : 50, idle: days, gap }, p.mock && p.idle === days && p.gap === gap));
    sim.append(node("p", "模擬內容數", "sw-note"), row1, node("p", "活躍度", "sw-note"), row2);
    if (p.mock) {
      const back = node("a", "回到正式世界", "sw-chip is-primary");
      back.href = "/world/seamless";
      sim.append(back);
    }
    body.append(sim);

    const sources = card("資料來源", "sw-sources");
    const srcList = node("ul", undefined, "sw-source-list");
    for (const x of s.sources || []) {
      const li = node("li");
      li.dataset.status = x.status;
      li.append(node("span", SOURCES[x.id] || x.id), node("b", `${STATUS[x.status] || x.status}${typeof x.count === "number" ? " · " + x.count : ""}`));
      srcList.append(li);
    }
    const stats = W.plan ? W.plan.districts.filter((d) => d.status === "UNLOCKED").length : 0;
    sources.append(srcList, node("p", `世界只讀已完成的內容與角色權威資料，不寫回 Content OS。安靜只會讓城市變安靜，成長值與建築不會倒退。建築 ${s.visual.buildings} 棟 · 地標 ${s.visual.landmark_count} 座 · 開放街區 ${stats} · ${new Date(s.generated_at).toLocaleString("zh-TW")} 更新`, "sw-note"));
    $("sw-drawer").dataset.built = "1";
  }

  function rosterFigure(c) {
    const box = node("figure", undefined, "sw-person");
    const img = node("img");
    img.loading = "lazy";
    img.decoding = "async";
    img.alt = "";
    img.width = 56;
    img.height = 56;
    img.src = `/api/world/character-thumb/${encodeURIComponent(c.character_id)}?s=96`;
    box.append(img, node("figcaption", Art.nameOf(c)));
    return box;
  }

  async function loadRoster(host) {
    host.replaceChildren(node("p", "讀取名冊…", "sw-note"));
    try {
      W.roster = await getJSON("/api/world/characters");
      if (!W.running || !host.isConnected) return;
    } catch (error) {
      if (error.name === "AbortError") return;
      host.replaceChildren(node("p", "名冊暫時無法讀取。", "sw-note"));
      return;
    }
    host.replaceChildren();
    // The roster follows the same authority rule as the street: public, with an authority image, resolved.
    const showable = (c) => c.public_visibility === true && Boolean(c.asset_ref) && ["CANONICAL_CHARACTER", "PROFESSION_CHARACTER"].includes(c.resolution || "CANONICAL_CHARACTER");
    for (const [type, label] of [["MAIN_CHARACTER", "主角"], ["SUPPORTING_CHARACTER", "主要配角"], ["SPECIAL_GUEST", "特別來賓"], ["GOOSEBABY", "鵝寶"]]) {
      const rows = W.roster.characters.filter((c) => c.character_type === type && showable(c));
      if (!rows.length) continue;
      host.append(node("h4", `${label} · ${rows.length}`));
      const grid = node("div", undefined, "sw-roster-grid");
      for (const c of rows) grid.append(rosterFigure(c));
      host.append(grid);
    }
    const civ = W.roster.civilians || [];
    if (civ.length) host.append(node("h4", `平民居民職業 · ${civ.length}`), node("p", civ.map((c) => c.label).join("、"), "sw-note"));
    host.append(node("p", "角色外型以角色聖經與會員角色庫為準；世界只引用，不重畫。職業居民只顯示職業，不顯示會員名稱。", "sw-note"));
  }

  // Restart celebration effects: a fresh node replays its CSS animation from the start.
  function replayCelebration() {
    for (const el of document.querySelectorAll(".sw-fx-firework, .sw-fx-confetti")) el.replaceWith(el.cloneNode(true));
  }

  function setStill(still) {
    W.still = still;
    $("sw-app").classList.toggle("sw-motion-static", still);
    const b = $("sw-motion");
    if (b) {
      b.textContent = still ? "恢復動態" : "暫停動態";
      b.setAttribute("aria-pressed", String(still));
    }
  }

  // ---------- lifecycle ----------
  function render(state) {
    const p = params();
    const app = $("sw-app");
    app.dataset.daypart = daypart();
    app.dataset.source = state.source;
    app.dataset.activity = state.activity?.state || "";
    setTimeLabel();
    $("sw-level").hidden = false;
    $("sw-level").title = state.source === "MOCK" ? "模擬資料" : "正式資料";
    $("sw-level-text").textContent = `Lv.${state.world_level} · ${state.current_era_name}`;
    $("sw-level-fill").style.width = Math.round(state.era_progress * 100) + "%";
    $("sw-level").querySelector("[role=progressbar]").setAttribute("aria-valuenow", String(Math.round(state.era_progress * 100)));
    const banner = $("sw-banner");
    const warnings = [];
    if (p.mock) warnings.push(`模擬 ${p.contents} 支內容${p.idle ? `、${p.idle} 天沒發片` : ""}${p.gap ? `、睽違 ${p.gap} 天後回歸` : ""}（非正式資料）`);
    for (const s of state.sources || []) if (["SYNC_ERROR", "ERROR", "UNAVAILABLE"].includes(s.status)) warnings.push(`${SOURCES[s.id] || s.id}${STATUS[s.status] ? "：" + STATUS[s.status] : ""}，世界只使用可確認的資料。`);
    banner.hidden = !warnings.length;
    banner.textContent = warnings.join(" ");
    banner.dataset.kind = p.mock ? "mock" : "warning";
    app.dataset.residents = String(mount(state));
    delete $("sw-drawer").dataset.built;
  }

  async function load(options = {}) {
    const app = $("sw-app");
    const p = params();
    app.dataset.status = "loading";
    closeCard();
    closeDrawer();
    try {
      const state = await getJSON(p.mock ? p.url : p.url + (options.refresh ? "?refresh=1" : ""));
      if (!W.running) return;
      W.state = state;
      W.roster = null;
      render(state);
      app.dataset.status = "ready";
    } catch (error) {
      if (error.name === "AbortError" || !W.running) return;
      app.dataset.status = "error";
      unmount();
      const box = node("div", undefined, "sw-loading");
      const retry = node("button", "再試一次", "sw-chip is-primary");
      retry.type = "button";
      retry.addEventListener("click", () => load());
      box.append(node("h2", "世界暫時無法讀取"), node("p", "不會用猜的資料代替。稍後再試一次。"), retry);
      $("sw-world").replaceChildren(box);
    }
  }

  function setTimeLabel() {
    const button = $("sw-time");
    button.replaceChildren(node("span", "時段：", "sw-wide"), document.createTextNode(TIME_LABEL[W.time]));
  }

  function pause() {
    if (W.paused) return;
    W.paused = true;
    $("sw-app").classList.add("sw-paused");
  }

  function resume() {
    if (!W.paused || !W.running) return;
    W.paused = false;
    $("sw-app").classList.remove("sw-paused");
  }

  function start() {
    if (W.running) return;
    W.running = true;
    W.paused = document.hidden;
    $("sw-app").classList.toggle("sw-paused", W.paused);
    W.scroll = Cam.frameBatch(onScroll);
    W.streetScroll = Cam.frameBatch(onStreetScroll);
    W.resize = Cam.frameBatch(() => applyScale(false));
    listen(window, "scroll", W.scroll, { passive: true });
    listen(window, "resize", W.resize, { passive: true });
    listen(document, "visibilitychange", () => (document.hidden ? pause() : resume()));
    listen(window, "pagehide", stop);
    listen(document, "keydown", (e) => {
      if (e.key === "Escape") {
        if (!$("sw-district-list").hidden) toggleDistrictList(false);
        else if (!$("sw-card").hidden) closeCard();
        else if (!$("sw-drawer").hidden) closeDrawer();
      }
    });
    listen($("sw-card-close"), "click", closeCard);
    listen($("sw-data"), "click", () => ($("sw-drawer").hidden ? openDrawer() : closeDrawer()));
    listen($("sw-drawer-close"), "click", closeDrawer);
    listen($("sw-time"), "click", () => {
      W.time = TIMES[(TIMES.indexOf(W.time) + 1) % TIMES.length];
      setTimeLabel();
      $("sw-app").dataset.daypart = daypart();
    });
    listen($("sw-zoom-in"), "click", () => {
      W.zoom = Math.min(ZOOMS.length - 1, W.zoom + 1);
      applyScale(false);
    });
    listen($("sw-zoom-out"), "click", () => {
      W.zoom = Math.max(0, W.zoom - 1);
      applyScale(false);
    });
    listen($("sw-district"), "click", () => toggleDistrictList());
    const step = (dir) => W.street && Cam.scrollTo(W.street, { left: W.street.scrollLeft + dir * W.street.clientWidth * 0.6 });
    listen($("sw-street-left"), "click", () => step(-1));
    listen($("sw-street-right"), "click", () => step(1));
    for (const b of $("sw-altimeter").querySelectorAll("button[data-zone]")) listen(b, "click", () => goTo(b.dataset.zone));
    params();
    load();
  }

  function stop() {
    if (!W.running) return;
    W.running = false;
    W.scroll?.cancel();
    W.streetScroll?.cancel();
    W.resize?.cancel();
    for (const c of W.aborts) c.abort();
    W.aborts.clear();
    for (const [target, type, fn, options] of W.listeners) target.removeEventListener(type, fn, options);
    W.listeners = [];
    unmount();
    for (const d of W.disposers) d();
    W.disposers = [];
    W.observer?.disconnect();
    W.onscreen?.disconnect();
    W.observer = W.onscreen = null;
    W.near.clear();
    W.nearDistricts.clear();
    W.districtEls = new Map();
    W.talks = [];
    $("sw-world")?.replaceChildren();
    $("sw-drawer-body")?.replaceChildren();
    $("sw-district-list")?.replaceChildren();
    if ($("sw-drawer")) delete $("sw-drawer").dataset.built;
    W.sections = [];
    W.layers = [];
    W.street = W.plan = W.cable = W.gondola = W.wheels = W.cableEnds = W.comp = null;
    W.state = null;
    W.roster = null;
  }

  window.RenguinSeamlessWorld = {
    start,
    stop,
    pause,
    resume,
    load,
    goTo,
    goToDistrict,
    setLayer,
    setStill,
    layers: () => W.layers.map((l) => ({ zone: l.zone, name: l.name, host: l.host, depth: l.depth, z: +l.el.style.zIndex, hidden: l.el.hidden, chunks: l.chunks ? l.chunks.length : 0 })),
    districts: () => (W.plan?.districts || []).map((d) => ({ id: d.id, name: d.name, status: d.status, x: d.x, width: d.width, near: W.nearDistricts.has(d.id) })),
    composition: () => W.comp && { ws: W.comp.ws, compact: W.comp.compact, safe: W.comp.safe, island_lead: W.comp.island.lead, city_height: W.comp.city.height, resident_px: W.comp.resident_px },
    debug: () => ({
      running: W.running,
      paused: W.paused,
      still: W.still,
      listeners: W.listeners.length,
      mounted: W.mounted.length,
      disposers: W.disposers.length,
      pendingRequests: W.aborts.size,
      observing: Boolean(W.observer || W.onscreen),
      near: [...W.near].map((s) => s.dataset.zone),
      zone: W.zone,
      district: W.district,
      nearDistricts: [...W.nearDistricts],
      ws: W.ws,
      residents: document.querySelectorAll(".sw-actor").length,
      pawns: document.querySelectorAll(".sw-pawn").length,
      talks: W.talks.length,
      layers: document.querySelectorAll(".sw-layer").length,
      chunks: document.querySelectorAll(".sw-chunk").length,
      nodes: document.getElementsByTagName("*").length,
    }),
  };
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) start();
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
