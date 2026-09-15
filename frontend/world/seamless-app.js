/* Renguin World · seamless side-view slice page. Loaded only by /world/seamless.
 *
 * The world is the page: native vertical scroll walks from the Star Office
 * sky island through the clouds to one street of Renguin City, and the street
 * pans sideways. Budget: one state request, layers that move by transform in
 * one animation frame per scroll burst, work only for sections near the
 * viewport, CSS motion only while a section is on screen, and everything
 * released on pagehide.
 */
(() => {
  "use strict";
  const Art = window.RenguinSeamlessArt;
  const Cam = window.RenguinWorldCamera;
  const $ = (id) => document.getElementById(id);
  const G = Art.GEOMETRY;
  const TIMES = ["auto", "day", "dusk", "night"];
  const TIME_LABEL = { auto: "自動", day: "白天", dusk: "黃昏", night: "夜晚" };
  const ZOOMS = [1, 1.25, 1.5];
  const POSE = { WALKING: "散步中", IDLE: "待命中", CELEBRATING: "慶祝中", NAPPING: "打盹中", WORKING: "工作中", FILMING: "拍攝中", EDITING: "剪輯中", REVIEWING: "檢查中", ENGINEERING: "修東西" };
  const TYPE = { long: "長片", short: "短影音", member: "會員影片", special: "特別企劃", series: "系列完結" };

  const W = {
    running: false,
    paused: false,
    state: null,
    aborts: new Set(),
    listeners: [],
    disposers: [],
    observer: null,
    near: new Set(),
    zone: "island",
    zoom: 0,
    time: "auto",
    ws: 1,
    sections: [],
    layers: [],
    street: null,
    streetLayers: [],
    cable: null,
    cityFar: null,
    gondola: null,
    wheels: null,
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
  const date = (value) => {
    const d = value ? new Date(value) : null;
    return d && !Number.isNaN(d.getTime()) ? `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}` : "日期未知";
  };

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
    if (!q.has("sim")) return { url: "/api/world/state", mock: false };
    const n = (key, hi) => Math.max(0, Math.min(hi, parseInt(q.get(key), 10) || 0));
    return { url: `/api/world/simulate?contents=${n("sim", 150)}&idle=${n("idle", 365)}&gap=${n("gap", 120)}`, mock: true, contents: n("sim", 150) };
  }

  function daypart() {
    if (W.time !== "auto") return W.time;
    const h = new Date().getHours();
    return h >= 6 && h < 17 ? "day" : h >= 17 && h < 19 ? "dusk" : "night";
  }

  // One world scale for every section: characters stay readable on a phone, full size on a desktop.
  function worldScale() {
    const base = Cam.clamp(0.45 + window.innerWidth / 2600, 0.7, 1);
    return +(base * ZOOMS[W.zoom]).toFixed(3);
  }

  // ---------- mount ----------
  function layer(svg, depth, z, cls = "") {
    const el = node("div", undefined, "sw-layer " + cls);
    el.style.zIndex = z;
    el.dataset.depth = depth;
    el.innerHTML = svg;
    return el;
  }

  function thumb(c) {
    const need = G.character * W.ws * (window.devicePixelRatio || 1);
    return `/api/world/character-thumb/${encodeURIComponent(c.character_id)}?s=${need > 170 ? 256 : 160}`;
  }

  function actor(c, x, y) {
    const b = node("button", undefined, `sw-actor is-${String(c.state || "IDLE").toLowerCase()}`);
    b.type = "button";
    b.style.setProperty("--x", x);
    b.style.setProperty("--y", y);
    b.style.setProperty("--delay", `-${(Scene().hash(c.character_id) * 3).toFixed(2)}s`);
    b.dataset.character = c.character_id;
    b.dataset.resolution = c.resolution || "CANONICAL_CHARACTER";
    b.setAttribute("aria-label", `${Art.nameOf(c)} · ${Art.roleOf(c)}`);
    const body = node("span", undefined, "sw-actor-body");
    const img = node("img");
    img.alt = "";
    img.decoding = "async";
    img.loading = "lazy";
    img.draggable = false;
    img.src = thumb(c);
    body.append(img);
    b.append(body, node("span", Art.nameOf(c), "sw-nametag"));
    b.addEventListener("click", () => openCard(c, b));
    return b;
  }

  const Scene = () => window.RenguinWorldScene;

  function section(id, zone, height, anchor) {
    const s = node("section", undefined, `sw-section sw-${zone}`);
    s.id = id;
    s.dataset.zone = zone;
    s.dataset.anchor = anchor;
    s.style.setProperty("--h", height);
    return s;
  }

  function mount(state) {
    const world = $("sw-world");
    $("sw-defs").innerHTML = Art.defs();
    world.replaceChildren();
    W.sections = [];
    W.layers = [];
    W.streetLayers = [];
    const cast = Art.cast(state);

    // A. Star Office sky island.
    const island = section("sw-island", "island", G.island.height, "top");
    island.append(layer(Art.islandSky(), 0.4, 1, "sw-center sw-cull"));
    const ground = layer(Art.island(state), 1, 3, "sw-center");
    const actors = node("div", undefined, "sw-actors");
    actors.classList.add("sw-island-actors");
    for (const c of cast.island) {
      const el = actor(c, c.spot + G.island.width / 2, G.island.ground);
      el.dataset.spot = c.spot;
      actors.append(el);
    }
    const office = node("a", undefined, "sw-hotspot sw-office-link");
    office.href = "/";
    office.setAttribute("aria-label", "進入 Star Office");
    const [ox, oy, ow, oh] = G.island.office;
    office.style.cssText = `--x:${ox + G.island.width / 2};--y:${oy};--w:${ow};--h:${oh}`;
    office.append(node("span", "進入 Star Office", "sw-hotspot-tip"));
    const beacon = node("i", undefined, "sw-fx sw-fx-beacon");
    beacon.style.cssText = `--x:${G.island.width / 2};--y:170`;
    ground.append(office, beacon, actors);
    const wheelIsland = node("i", undefined, "sw-wheel");
    wheelIsland.style.cssText = `--x:${G.island.wheel[0] + G.island.width / 2};--y:${G.island.wheel[1]}`;
    ground.append(wheelIsland);
    island.append(ground);
    const hint = node("button", "往下探索", "sw-descend");
    hint.type = "button";
    hint.addEventListener("click", () => goTo("descent"));
    island.append(hint);

    // B. Cloud descent.
    const descent = section("sw-descent", "descent", G.descent.height, "center");
    for (const l of Art.descent(state)) descent.append(layer(l.svg, l.depth, l.z, "sw-center " + (l.cls === "sw-near" || l.cls === "sw-far" ? "sw-cull" : "")));
    const balloon = node("div", undefined, "sw-balloon");
    balloon.innerHTML = `<svg viewBox="-60 -150 120 210" aria-hidden="true"><path d="M0-146C-54-146-58-84-40-50-28-28-10-12-8 0H8C10-12 28-28 40-50 58-84 54-146 0-146Z" fill="#f28c6d" stroke="#3a3150" stroke-opacity=".4" stroke-width="2"/><path d="M0-146C-22-146-26-80-16-48-10-26-4-10-4 0H4C4-10 10-26 16-48 26-80 22-146 0-146Z" fill="#fff4e0"/><path d="M-8 0L-14 26M8 0L14 26" stroke="#8a6848" stroke-width="2"/><rect x="-16" y="26" width="32" height="24" rx="4" fill="#b98a5a" stroke="#3a3150" stroke-opacity=".4"/></svg>`;
    descent.append(balloon);
    for (let k = 0; k < 3; k++) {
      const bird = node("i", undefined, "sw-bird");
      bird.style.cssText = `--bx:${[-420, 380, 120][k]};--by:${[260, 520, 1040][k]};--delay:-${k * 0.4}s`;
      descent.append(bird);
    }

    // C. Renguin City, one street.
    const city = section("sw-city", "city", G.city.height, "bottom");
    const scroller = node("div", undefined, "sw-street-scroll");
    scroller.tabIndex = 0;
    scroller.setAttribute("aria-label", "Renguin City 主城區街道，可左右移動");
    const street = node("div", undefined, "sw-street");
    const cityArt = Art.city(state);
    for (const l of cityArt.layers) {
      // The far background sits outside the scroller: it may rise into the clouds without being clipped.
      const el = layer(l.svg, l.depth, l.z, "sw-street-layer" + (l.name === "bg" || l.name === "front" ? " sw-cull" : ""));
      if (l.name === "bg") {
        el.classList.add("sw-city-far");
        city.append(el);
        W.cityFar = el;
      } else {
        street.append(el);
        if (l.depth !== 1) W.streetLayers.push(el);
      }
    }
    const residents = node("div", undefined, "sw-actors sw-street-actors");
    for (const c of cast.city) residents.append(actor(c, c.spot, G.city.feet));
    street.append(residents);
    const [px, py, pw, ph] = G.city.poster;
    const posterLink = node("button", undefined, "sw-hotspot sw-poster-link");
    posterLink.type = "button";
    posterLink.setAttribute("aria-label", "看精選影片");
    posterLink.style.cssText = `--x:${px - 34};--y:${py - 22};--w:${pw + 68};--h:${ph + 44}`;
    posterLink.append(node("span", "精選影片", "sw-hotspot-tip"));
    posterLink.addEventListener("click", () => openDrawer("videos"));
    street.append(posterLink);
    const wheelCity = node("i", undefined, "sw-wheel");
    wheelCity.style.cssText = `--x:${G.city.wheel[0]};--y:${G.city.wheel[1]}`;
    street.append(wheelCity);
    if ((state.activity?.event_flags || []).some((f) => f === "FIREWORKS" || f === "SMALL_FIREWORKS")) {
      for (let k = 0; k < 4; k++) {
        const fw = node("i", undefined, "sw-firework");
        fw.style.cssText = `--x:${900 + k * 260};--y:${180 + (k % 2) * 90};--c:${["#ffd35e", "#ff7fa8", "#7fd6c2", "#9db8f2"][k]};--delay:${k * 0.6}s`;
        street.append(fw);
      }
    }
    const fire = Art.eraIndex(state) < 3 ? node("i", undefined, "sw-fx sw-fx-flame") : null;
    if (fire) {
      fire.style.cssText = `--x:1270;--y:${G.city.ground - 24}`;
      street.append(fire);
    }
    scroller.append(street);
    city.append(scroller);
    city.append(node("p", "← 左右滑動，逛逛這條街 →", "sw-swipe-hint"));
    const end = node("footer", undefined, "sw-end");
    end.append(node("span", "這是 Renguin City 的第一條街。其他街區還在施工中。"));
    const top = node("button", "回到空島 ↑", "sw-chip");
    top.type = "button";
    top.addEventListener("click", () => goTo("island"));
    end.append(top);
    city.append(end);

    // The sky cable and its gondola live on the world itself, above both ends.
    W.cable = node("div", undefined, "sw-cable");
    W.gondola = node("div", undefined, "sw-gondola");
    W.gondola.innerHTML = `<svg viewBox="-40 -14 80 96" aria-hidden="true"><path d="M0-12V16" stroke="#4e4763" stroke-width="4"/><circle cx="0" cy="-10" r="6" fill="#4e4763"/><path d="M-34 16H34L30 76H-30Z" fill="#e07d4f" stroke="#3a3150" stroke-opacity=".45" stroke-width="2"/><rect x="-26" y="26" width="22" height="22" rx="3" fill="#ffe39a"/><rect x="4" y="26" width="22" height="22" rx="3" fill="#ffe39a"/><path d="M-32 58H32" stroke="#fff4e0" stroke-width="5"/></svg>`;

    world.append(island, descent, city, W.cable, W.gondola);
    W.sections = [island, descent, city];
    W.layers = [...world.querySelectorAll(".sw-section:not(.sw-city) .sw-layer")];
    W.street = scroller;
    W.wheels = [wheelIsland, wheelCity];

    W.zone = "island";
    $("sw-app").dataset.zone = "island";
    for (const b of $("sw-altimeter").querySelectorAll("button")) b.setAttribute("aria-current", String(b.dataset.zone === "island"));
    W.disposers.push(Cam.dragPan(scroller));
    listen(scroller, "scroll", W.streetScroll, { passive: true });
    observe();
    applyScale(true);
    return cast;
  }

  // ---------- motion: parallax, cable, gondola ----------
  function observe() {
    W.observer?.disconnect();
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
    for (const s of W.sections) W.observer.observe(s);
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
    return { x: r.left + r.width / 2 + window.scrollX, y: r.top + r.height / 2 + window.scrollY, top: r.top + window.scrollY, height: r.height };
  };

  function onScroll() {
    if (!W.running) return;
    const y = window.scrollY,
      vh = window.innerHeight,
      still = Cam.reducedMotion();
    for (const el of W.layers) {
      const s = el.parentElement;
      if (!W.near.has(s)) continue;
      const depth = +el.dataset.depth;
      if (depth === 1) continue;
      const offset = Cam.anchorOffset(s.dataset.anchor, s.offsetTop, s.offsetHeight, y, vh);
      move(el, still ? "" : `translate3d(0, ${Cam.parallax(offset, depth).toFixed(0)}px, 0)`);
    }
    const city = W.sections[2];
    if (city && W.near.has(city)) {
      const offset = Cam.anchorOffset("bottom", city.offsetTop, city.offsetHeight, y, vh);
      const left = W.street.scrollLeft;
      // Inside the scroller layers only slide sideways; the far layer also lags vertically.
      for (const el of W.streetLayers) move(el, still ? "" : `translate3d(${(left * (1 - +el.dataset.depth)).toFixed(0)}px, 0, 0)`);
      if (W.cityFar) {
        const depth = +W.cityFar.dataset.depth;
        move(W.cityFar, `translate3d(${(-left * (still ? 1 : depth)).toFixed(0)}px, ${still ? 0 : Cam.parallax(offset, depth).toFixed(0)}px, 0)`);
      }
    }
    placeGondola();
    // Which altitude are we at: the section holding the viewport's middle.
    const mid = y + vh * 0.5;
    const zone = W.sections.find((s) => mid >= s.offsetTop && mid < s.offsetTop + s.offsetHeight)?.dataset.zone || (mid < 0 ? "island" : "city");
    if (zone !== W.zone) {
      W.zone = zone;
      $("sw-app").dataset.zone = zone;
      for (const b of $("sw-altimeter").querySelectorAll("button")) b.setAttribute("aria-current", String(b.dataset.zone === zone));
      $("sw-street-nav").hidden = zone !== "city";
    }
  }

  function placeCable() {
    if (!W.cable || !W.wheels) return;
    const a = pageRect(W.wheels[0]),
      b = pageRect(W.wheels[1]);
    W.cableEnds = { a, b };
    const dx = b.x - a.x,
      dy = b.y - a.y;
    W.cable.style.cssText = `left:${a.x.toFixed(1)}px;top:${a.y.toFixed(1)}px;width:${Math.hypot(dx, dy).toFixed(1)}px;transform:rotate(${Math.atan2(dy, dx).toFixed(4)}rad)`;
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

  function applyScale(initial) {
    const zone = W.zone;
    const ratio = document.documentElement.scrollHeight > window.innerHeight ? window.scrollY / (document.documentElement.scrollHeight - window.innerHeight) : 0;
    W.ws = worldScale();
    document.documentElement.style.setProperty("--ws", W.ws);
    // On a narrow screen the island crew gathers toward the office so nobody stands off the edge.
    const reach = Math.max(...G.island.spots.map(Math.abs));
    const half = window.innerWidth / (2 * W.ws) - 76;
    const squeeze = Math.min(1, half / reach);
    for (const el of document.querySelectorAll(".sw-island-actors .sw-actor")) el.style.setProperty("--x", (+el.dataset.spot * squeeze + G.island.width / 2).toFixed(1));
    $("sw-zoom-out").disabled = W.zoom === 0;
    $("sw-zoom-in").disabled = W.zoom === ZOOMS.length - 1;
    for (const img of document.querySelectorAll(".sw-actor img")) {
      const c = img.closest(".sw-actor").dataset.character;
      const next = thumb({ character_id: c });
      if (next.endsWith("256") && !img.src.endsWith("256")) img.src = next;
    }
    if (!initial) window.scrollTo({ top: ratio * (document.documentElement.scrollHeight - window.innerHeight), behavior: "instant" });
    else if (zone === "island") window.scrollTo({ top: 0, behavior: "instant" });
    placeCable();
    W.scroll();
    W.streetScroll();
  }

  function goTo(zone) {
    const s = W.sections.find((x) => x.dataset.zone === zone);
    if (!s) return;
    const top = zone === "city" ? s.offsetTop + s.offsetHeight - window.innerHeight : zone === "descent" ? s.offsetTop - window.innerHeight * 0.1 : 0;
    Cam.scrollTo(window, { top });
  }

  // ---------- card and drawer (secondary) ----------
  let cardOwner = null;
  function openCard(c, owner) {
    cardOwner?.classList.remove("is-selected");
    cardOwner = owner;
    owner.classList.add("is-selected");
    const card = $("sw-card");
    $("sw-card-img").src = thumb(c).replace(/s=\d+/, "s=256");
    $("sw-card-img").alt = Art.nameOf(c);
    $("sw-card-name").textContent = Art.nameOf(c);
    $("sw-card-role").textContent = Art.roleOf(c);
    const facts = $("sw-card-facts");
    facts.replaceChildren();
    const fact = (k, v) => v && facts.append(node("dt", k), node("dd", v));
    const district = (W.state?.districts || []).find((d) => d.id === c.district);
    fact("所屬街區", district?.name);
    fact("現在", POSE[c.state]);
    fact("角色來源", Art.sourceOf(c) + (c.resolution === "PROFESSION_CHARACTER" ? " · 身分保密" : ""));
    card.hidden = false;
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
    const body = $("sw-drawer-body");
    body.replaceChildren();
    const card = (title, cls) => {
      const box = node("section", undefined, "sw-panel " + (cls || ""));
      box.append(node("h3", title));
      body.append(box);
      return box;
    };
    const era = card(`${s.current_era_name} · Lv.${s.world_level}`);
    era.append(node("p", `${s.era.name_en} · ${s.current_stage}`, "sw-note"));
    const bar = node("div", undefined, "sw-meter is-wide");
    bar.append(node("i"));
    bar.firstChild.style.width = Math.round(s.era_progress * 100) + "%";
    era.append(bar, node("p", s.next_era ? `成長值 ${s.world_score} · 再 ${s.score_to_next_era} 進入「${s.next_era_name}」` : `成長值 ${s.world_score} · 已抵達最後一個時代`, "sw-note"));
    const content = card("內容");
    content.append(node("p", `已完成 ${s.content.total} · 長片 ${s.content.long} · 短影音 ${s.content.short} · 會員影片 ${s.content.member}`, "sw-note"));
    const growth = card("最近的成長");
    const list = node("ol", undefined, "sw-list");
    for (const g of s.recent_growth) list.append(node("li", `+${g.points} ${TYPE[g.content_type] || g.content_type}「${g.title}」 ${date(g.at)}`));
    if (!s.recent_growth.length) list.append(node("li", "尚無成長紀錄"));
    growth.append(list);
    const videos = card("精選影片", "sw-videos");
    const counts = s.popularity?.resolution_counts;
    if (s.source === "LIVE" && counts) videos.append(node("p", `YouTube：${counts.FULLY_VERIFIED} 筆完整資料；${counts.IDENTITY_VERIFIED} 筆觀看次數未提供（unavailable）；${counts.IDENTITY_UNRESOLVED} 筆身份未確認。`, "sw-note"));
    if (!s.featured_contents.length) videos.append(node("p", "還沒有完成的內容。", "sw-note"));
    for (const f of s.featured_contents) {
      const item = node("article", undefined, "sw-video");
      item.append(node("strong", f.title), node("p", `${TYPE[f.content_type] || f.content_type} · ${f.status === "PUBLISHED" ? "上映紀錄" : "完成紀錄"} · ${date(f.date)}`, "sw-note"));
      if (Number.isInteger(f.view_count) && f.view_count >= 0) item.append(node("p", `觀看次數：${f.view_count.toLocaleString("zh-TW")}`, "sw-note"));
      else if (f.youtube_resolution_status === "IDENTITY_VERIFIED") item.append(node("p", "觀看次數：YouTube 未提供（unavailable）", "sw-note"));
      if (f.youtube_video_id && /^[A-Za-z0-9_-]{11}$/.test(f.youtube_video_id)) {
        const a = node("a", "在 YouTube 觀看", "sw-link");
        a.href = "https://www.youtube.com/watch?v=" + encodeURIComponent(f.youtube_video_id);
        a.target = "_blank";
        a.rel = "noopener";
        item.append(a);
      }
      videos.append(item);
    }
    const sources = card("資料來源");
    sources.append(node("p", (s.sources || []).map((x) => `${x.id}：${x.status}`).join(" · "), "sw-note"));
    $("sw-drawer").dataset.built = "1";
  }

  // ---------- lifecycle ----------
  function render(state) {
    const p = params();
    const app = $("sw-app");
    app.dataset.daypart = daypart();
    setTimeLabel();
    $("sw-level").hidden = false;
    $("sw-level-text").textContent = `Lv.${state.world_level} · ${state.current_era_name}`;
    $("sw-level-fill").style.width = Math.round(state.era_progress * 100) + "%";
    $("sw-level").querySelector("[role=progressbar]").setAttribute("aria-valuenow", String(Math.round(state.era_progress * 100)));
    const banner = $("sw-banner");
    const warnings = [];
    if (p.mock) warnings.push(`模擬 ${p.contents} 支內容（非正式資料）`);
    for (const s of state.sources || []) if (["SYNC_ERROR", "ERROR", "UNAVAILABLE"].includes(s.status)) warnings.push(`${s.id} 無法確認，世界只使用可確認的資料。`);
    banner.hidden = !warnings.length;
    banner.textContent = warnings.join(" ");
    const cast = mount(state);
    app.dataset.residents = String(cast.island.length + cast.city.length);
    delete $("sw-drawer").dataset.built;
  }

  async function load() {
    const app = $("sw-app");
    app.dataset.status = "loading";
    try {
      const state = await getJSON(params().url);
      if (!W.running) return;
      W.state = state;
      render(state);
      app.dataset.status = "ready";
    } catch (error) {
      if (error.name === "AbortError" || !W.running) return;
      app.dataset.status = "error";
      const box = node("div", undefined, "sw-loading");
      box.append(node("h2", "世界暫時無法讀取"), node("p", "不會用猜的資料代替。稍後再試一次。"));
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
        if (!$("sw-card").hidden) closeCard();
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
    const step = (dir) => W.street && Cam.scrollTo(W.street, { left: W.street.scrollLeft + dir * W.street.clientWidth * 0.6 });
    listen($("sw-street-left"), "click", () => step(-1));
    listen($("sw-street-right"), "click", () => step(1));
    for (const b of $("sw-altimeter").querySelectorAll("button")) listen(b, "click", () => goTo(b.dataset.zone));
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
    for (const d of W.disposers) d();
    W.disposers = [];
    W.observer?.disconnect();
    W.observer = null;
    W.near.clear();
    $("sw-world")?.replaceChildren();
    W.sections = [];
    W.layers = [];
    W.streetLayers = [];
    W.street = W.cable = W.gondola = W.wheels = W.cableEnds = W.cityFar = null;
    W.state = null;
  }

  window.RenguinSeamlessWorld = {
    start,
    stop,
    pause,
    resume,
    goTo,
    debug: () => ({
      running: W.running,
      paused: W.paused,
      listeners: W.listeners.length,
      disposers: W.disposers.length,
      pendingRequests: W.aborts.size,
      observing: Boolean(W.observer),
      near: [...W.near].map((s) => s.dataset.zone),
      zone: W.zone,
      ws: W.ws,
      residents: document.querySelectorAll(".sw-actor").length,
      layers: document.querySelectorAll(".sw-layer").length,
      nodes: document.getElementsByTagName("*").length,
    }),
  };
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) start();
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
