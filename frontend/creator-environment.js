/* The world outside the lodge: time, weather and atmosphere.
   Decorative only. It reads no work state and publishes none; the creator's
   choice is handed to an injected saver that writes the presentation store. */
((scope) => {
  "use strict";
  const TIMES = ["MORNING", "DAY", "AFTERNOON", "SUNSET", "NIGHT"];
  const TIME_MODES = ["AUTO", ...TIMES];
  const WEATHERS = [
    "CLEAR",
    "CLOUDY",
    "OVERCAST",
    "RAIN",
    "HEAVY_RAIN",
    "THUNDERSTORM",
    "SNOW",
    "HEAVY_SNOW",
    "FOG",
    "WINDY",
  ];
  /* A rainbow is a modifier on a sky that can actually hold one. */
  const RAINBOW_WEATHERS = ["CLEAR", "CLOUDY", "RAIN"];
  /* Atmosphere is its own layer: aurora is not a night theme. */
  const ATMOSPHERES = ["AURORA", "STARS", "METEOR", "FIREFLIES", "SPARKLES"];
  /* Complexity budget: one time, one weather (+ rainbow), at most two atmospheres. */
  const MAX_ATMOSPHERE = 2;
  const DEFAULTS = Object.freeze({
    time: "AUTO",
    weather: "CLEAR",
    rainbow: false,
    atmosphere: [],
  });
  const LABELS = {
    AUTO: "自動",
    MORNING: "早晨",
    DAY: "白天",
    AFTERNOON: "午後",
    SUNSET: "夕陽",
    NIGHT: "夜晚",
    CLEAR: "晴朗",
    CLOUDY: "多雲",
    OVERCAST: "陰天",
    RAIN: "下雨",
    HEAVY_RAIN: "大雨",
    THUNDERSTORM: "雷雨",
    SNOW: "下雪",
    HEAVY_SNOW: "大雪",
    FOG: "起霧",
    WINDY: "起風",
    RAINBOW: "彩虹",
    AURORA: "極光",
    STARS: "星空",
    METEOR: "流星",
    FIREFLIES: "螢火蟲",
    SPARKLES: "閃光",
  };
  const ICONS = {
    MORNING: "🌅",
    DAY: "☀️",
    AFTERNOON: "🌤️",
    SUNSET: "🌇",
    NIGHT: "🌙",
    CLEAR: "☀️",
    CLOUDY: "⛅",
    OVERCAST: "☁️",
    RAIN: "🌧️",
    HEAVY_RAIN: "🌧️",
    THUNDERSTORM: "⛈️",
    SNOW: "🌨️",
    HEAVY_SNOW: "❄️",
    FOG: "🌫️",
    WINDY: "🍃",
    RAINBOW: "🌈",
    AURORA: "🌌",
    STARS: "✨",
    METEOR: "☄️",
    FIREFLIES: "🪲",
    SPARKLES: "✦",
  };
  /* Presets are shortcuts into the same modular state, never a separate theme. */
  const PRESETS = [
    { id: "clear-day", label: "晴朗白天", time: "DAY", weather: "CLEAR", atmosphere: [] },
    { id: "day-aurora", label: "白晝極光", time: "DAY", weather: "CLEAR", atmosphere: ["AURORA"] },
    { id: "rainy-office", label: "雨天辦公室", time: "AFTERNOON", weather: "RAIN", atmosphere: [] },
    { id: "sunset-aurora", label: "夕陽極光", time: "SUNSET", weather: "CLEAR", atmosphere: ["AURORA"] },
    { id: "aurora-snow-night", label: "極光雪夜", time: "NIGHT", weather: "SNOW", atmosphere: ["AURORA", "STARS"] },
    { id: "storm-night", label: "雷雨夜", time: "NIGHT", weather: "THUNDERSTORM", atmosphere: [] },
  ];
  /* How visible each sky effect is at each time of day, before cloud cover. */
  const AURORA_LIGHT = { MORNING: 0.3, DAY: 0.34, AFTERNOON: 0.35, SUNSET: 0.48, NIGHT: 0.72 };
  const STAR_LIGHT = { MORNING: 0, DAY: 0, AFTERNOON: 0, SUNSET: 0.35, NIGHT: 1 };
  const COVER = {
    CLEAR: 0,
    WINDY: 1,
    FOG: 1,
    CLOUDY: 2,
    RAIN: 2,
    SNOW: 2,
    OVERCAST: 3,
    HEAVY_RAIN: 3,
    THUNDERSTORM: 3,
    HEAVY_SNOW: 3,
  };

  function normalize(value) {
    const v = value && typeof value === "object" ? value : {};
    const time = TIME_MODES.includes(v.time) ? v.time : DEFAULTS.time;
    const weather = WEATHERS.includes(v.weather) ? v.weather : DEFAULTS.weather;
    const chosen = [];
    for (const a of Array.isArray(v.atmosphere) ? v.atmosphere : [])
      if (ATMOSPHERES.includes(a) && !chosen.includes(a) && chosen.length < MAX_ATMOSPHERE)
        chosen.push(a);
    return {
      time,
      weather,
      rainbow: v.rainbow === true && RAINBOW_WEATHERS.includes(weather),
      atmosphere: ATMOSPHERES.filter((a) => chosen.includes(a)),
    };
  }
  function same(a, b) {
    const x = normalize(a),
      y = normalize(b);
    return (
      x.time === y.time &&
      x.weather === y.weather &&
      x.rainbow === y.rainbow &&
      x.atmosphere.join() === y.atmosphere.join()
    );
  }
  function resolveTime(mode, now = new Date()) {
    if (TIMES.includes(mode)) return mode;
    const h = now.getHours() + now.getMinutes() / 60;
    if (h < 5 || h >= 19) return "NIGHT";
    if (h < 9) return "MORNING";
    if (h < 14) return "DAY";
    if (h < 17) return "AFTERNOON";
    return "SUNSET";
  }
  function withWeather(state, weather) {
    return normalize({ ...normalize(state), weather });
  }
  /* Turning on a third atmosphere is refused, never silently swapped. */
  function withAtmosphere(state, id, on) {
    const s = normalize(state);
    if (!ATMOSPHERES.includes(id)) return { state: s, refused: false };
    if (!on)
      return {
        state: normalize({ ...s, atmosphere: s.atmosphere.filter((a) => a !== id) }),
        refused: false,
      };
    if (s.atmosphere.includes(id)) return { state: s, refused: false };
    if (s.atmosphere.length >= MAX_ATMOSPHERE) return { state: s, refused: true };
    return { state: normalize({ ...s, atmosphere: [...s.atmosphere, id] }), refused: false };
  }
  function preset(id) {
    const p = PRESETS.find((item) => item.id === id);
    return p ? normalize({ ...p, rainbow: false }) : null;
  }
  const round = (n) => Math.round(n * 100) / 100;
  /* The whole scene as data: what each layer shows for a state and a device. */
  function plan(state, context = {}) {
    const s = normalize(state);
    const time = TIMES.includes(context.time) ? context.time : resolveTime(s.time, context.now);
    const motion = !context.reduced;
    const cover = COVER[s.weather];
    const clear = cover >= 3 ? 0.45 : cover === 2 ? 0.75 : 1;
    const has = (a) => s.atmosphere.includes(a);
    const dark = time === "NIGHT" || time === "SUNSET";
    const precipitation = (level) => (motion ? level : Math.min(level, 1));
    return {
      time,
      weather: s.weather,
      motion,
      clouds: [2, 3, 5, 6][cover],
      rain: precipitation(
        s.weather === "RAIN" ? 1 : ["HEAVY_RAIN", "THUNDERSTORM"].includes(s.weather) ? 2 : 0,
      ),
      snow: precipitation(s.weather === "SNOW" ? 1 : s.weather === "HEAVY_SNOW" ? 2 : 0),
      fog: s.weather === "FOG",
      wind: s.weather === "WINDY",
      lightning: s.weather === "THUNDERSTORM" && motion,
      rainbow: s.rainbow,
      aurora: has("AURORA") ? round(AURORA_LIGHT[time] * clear) : 0,
      stars: has("STARS") ? round(STAR_LIGHT[time] * clear) : 0,
      meteor: has("METEOR") && motion && dark && cover < 3,
      fireflies: has("FIREFLIES") && motion ? (context.narrow ? 5 : dark ? 10 : 6) : 0,
      sparkles: has("SPARKLES") ? (context.narrow ? 4 : 8) : 0,
    };
  }
  function summary(state, now) {
    const s = normalize(state);
    const time = resolveTime(s.time, now);
    return {
      icon: ICONS[time],
      text:
        LABELS[time] +
        " · " +
        LABELS[s.weather] +
        (s.rainbow ? " · 彩虹" : "") +
        (s.atmosphere.length ? " · " + s.atmosphere.map((a) => LABELS[a]).join("、") : ""),
      auto: s.time === "AUTO",
    };
  }
  /* A small deterministic sequence keeps every reload identical. */
  function noise(seed) {
    let value = (seed * 2654435761) >>> 0;
    return () => {
      value ^= value << 13;
      value ^= value >>> 17;
      value ^= value << 5;
      value >>>= 0;
      return value / 4294967296;
    };
  }
  function scatter(count, seed) {
    const random = noise(seed);
    return Array.from({ length: count }, () => ({
      x: round(4 + random() * 92),
      y: round(8 + random() * 78),
      size: round(0.6 + random() * 0.8),
      duration: round(9 + random() * 11),
      delay: round(-random() * 20),
    }));
  }
  /* The lodge is the mother island; every other section is an island of its own
     region, floating in the shared sky. */
  const ISLANDS = {
    decision: { region: "japan", name: "和風櫻花島" },
    work: { region: "nordic", name: "北歐雪松島" },
    short: { region: "tropic", name: "熱帶椰林島" },
    result: { region: "desert", name: "沙漠綠洲島" },
    "short-result": { region: "aegean", name: "地中海白屋島" },
    history: { region: "castle", name: "月夜古城島" },
  };
  const island = (zone) => ISLANDS[zone] || null;
  const api = {
    ISLANDS,
    island,
    TIMES,
    TIME_MODES,
    WEATHERS,
    RAINBOW_WEATHERS,
    ATMOSPHERES,
    MAX_ATMOSPHERE,
    DEFAULTS,
    PRESETS,
    LABELS,
    normalize,
    same,
    resolveTime,
    withWeather,
    withAtmosphere,
    preset,
    plan,
    summary,
    scatter,
  };
  if (typeof module !== "undefined") module.exports = api;
  if (typeof document === "undefined") {
    scope.CreatorEnvironment = api;
    return;
  }

  /* ------------------------------------------------------------ renderer */
  const STORE_KEY = "co-environment";
  const media = (q) => scope.matchMedia?.(q) || { matches: false, addEventListener() {} };
  const reducedQuery = media("(prefers-reduced-motion: reduce)");
  const narrowQuery = media("(max-width: 700px)");
  let state = normalize(readMirror());
  let current = plan(state, { reduced: reducedQuery.matches, narrow: narrowQuery.matches });
  let env = null,
    panel = null,
    trigger = null,
    saver = null,
    saveToken = 0,
    pending = false,
    dirty = false,
    lightningTimer = 0,
    meteorTimer = 0;
  const buttons = new Set();

  function readMirror() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    } catch {
      return null;
    }
  }
  function mirror() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch {}
  }
  const el = (cls, host, tag = "div") => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    host?.append(node);
    return node;
  };
  const vars = (node, values) => {
    for (const [key, value] of Object.entries(values)) node.style.setProperty("--" + key, value);
  };
  function build() {
    if (env) return env;
    env = el("co-env");
    env.id = "co-env";
    env.setAttribute("aria-hidden", "true");
    el("co-env-sky", env);
    el("co-env-sun", env);
    const stars = el("co-env-stars", env);
    el("co-env-starfield", stars);
    el("co-env-starfield is-far", stars);
    const aurora = el("co-env-aurora", env);
    for (let i = 0; i < 3; i++) el("co-env-ribbon", aurora);
    el("co-env-meteor", env);
    el("co-env-veil", env);
    el("co-env-rainbow", env);
    const clouds = el("co-env-clouds", env);
    scatter(6, 61).forEach((c, i) => {
      const cloud = el("co-env-cloud", clouds);
      vars(cloud, {
        y: 4 + (i % 3) * 7 + c.size * 4 + "vh",
        scale: 0.7 + c.size * 0.5,
        duration: 150 + i * 23 + "s",
        delay: -(i * 41 + c.duration * 3) + "s",
      });
    });
    el("co-env-flash", env);
    el("co-env-ridge is-far", env);
    el("co-env-ridge is-near", env);
    const fog = el("co-env-fog", env);
    for (let i = 0; i < 3; i++) el("co-env-bank", fog);
    const flies = el("co-env-fireflies", env);
    for (const f of scatter(10, 83)) {
      const fly = el("co-env-firefly", flies);
      vars(fly, {
        x: f.x + "vw",
        y: 40 + f.y * 0.55 + "vh",
        duration: f.duration + "s",
        delay: f.delay + "s",
      });
    }
    for (const kind of ["rain", "snow"]) {
      const host = el("co-env-" + kind, env);
      for (let i = 0; i < (kind === "rain" ? 3 : 4); i++) el("co-env-fall", el("co-env-sheet", host));
    }
    const wind = el("co-env-wind", env);
    for (const leaf of scatter(6, 97)) {
      const node = el("co-env-leaf", wind);
      vars(node, { y: leaf.y * 0.8 + "vh", duration: leaf.duration * 0.7 + "s", delay: leaf.delay + "s" });
    }
    const sparkles = el("co-env-sparkles", env);
    for (const s of scatter(8, 113)) {
      const node = el("co-env-sparkle", sparkles);
      vars(node, { x: s.x + "vw", y: s.y * 0.7 + "vh", delay: s.delay * 0.25 + "s" });
    }
    document.body.prepend(env);
    return env;
  }
  /* The map keeps its art; the environment only lights it and falls past the windows. */
  function mountMap() {
    const host = document.getElementById("game-container");
    if (!host || host.querySelector(".co-env-maptint")) return;
    el("co-env-maptint", host).setAttribute("aria-hidden", "true");
    el("co-env-maphaze", host).setAttribute("aria-hidden", "true");
  }
  function apply() {
    if (!env) return;
    current = plan(state, { reduced: reducedQuery.matches, narrow: narrowQuery.matches });
    const root = document.documentElement;
    Object.assign(root.dataset, {
      envTime: current.time,
      envTimeMode: state.time,
      envWeather: current.weather,
      envRainbow: String(current.rainbow),
      envAtmos: state.atmosphere.join(" "),
    });
    Object.assign(env.dataset, {
      clouds: current.clouds,
      rain: current.rain,
      snow: current.snow,
      fog: String(current.fog),
      wind: String(current.wind),
      motion: current.motion ? "full" : "reduced",
    });
    vars(env, { "env-aurora": current.aurora, "env-stars": current.stars });
    env.querySelectorAll(".co-env-firefly").forEach((f, i) => f.classList.toggle("is-on", i < current.fireflies));
    env.querySelectorAll(".co-env-sparkle").forEach((f, i) => f.classList.toggle("is-on", i < current.sparkles));
    schedule();
    for (const button of buttons) label(button);
    refreshPanel();
  }
  /* Lightning and meteors are rare, irregular and never while motion is reduced. */
  function schedule() {
    clearTimeout(lightningTimer);
    clearTimeout(meteorTimer);
    if (current.lightning)
      lightningTimer = setTimeout(() => {
        if (!document.hidden) strike();
        schedule();
      }, 7000 + Math.random() * 15000);
    if (current.meteor)
      meteorTimer = setTimeout(() => {
        if (!document.hidden) shoot();
        schedule();
      }, 12000 + Math.random() * 26000);
  }
  function strike() {
    const flash = env.querySelector(".co-env-flash");
    flash.style.setProperty("--x", 12 + Math.random() * 76 + "%");
    flash.animate?.(
      [
        { opacity: 0 },
        { opacity: 0.3, offset: 0.06 },
        { opacity: 0.05, offset: 0.16 },
        { opacity: 0.2, offset: 0.27 },
        { opacity: 0 },
      ],
      { duration: 1100, easing: "ease-out" },
    );
  }
  function shoot() {
    const meteor = env.querySelector(".co-env-meteor");
    meteor.style.left = 34 + Math.random() * 56 + "vw";
    meteor.style.top = 3 + Math.random() * 16 + "vh";
    meteor.animate?.(
      [
        { opacity: 0, transform: "rotate(-32deg) translateX(0)" },
        { opacity: 1, offset: 0.14 },
        { opacity: 0, transform: "rotate(-32deg) translateX(-34vw)" },
      ],
      { duration: 1400, easing: "cubic-bezier(.3,.1,.6,1)" },
    );
  }
  function set(next, { persist = true } = {}) {
    const value = normalize(next);
    const changed = !same(value, state);
    state = value;
    mirror();
    apply();
    if (persist && (changed || dirty)) save();
    return state;
  }
  async function save() {
    if (!saver) {
      dirty = true;
      status("local");
      return;
    }
    const token = ++saveToken;
    pending = true;
    status("saving");
    let ok = false;
    try {
      ok = (await saver(state)) === true;
    } catch {}
    if (token !== saveToken) return;
    pending = false;
    dirty = !ok;
    status(ok ? "saved" : "local");
  }
  /* The store is the authority; a local change the store has not taken yet wins. */
  function adopt(stored) {
    if (pending) return;
    if (dirty) {
      save();
      return;
    }
    if (!stored || same(stored, state)) return;
    state = normalize(stored);
    mirror();
    apply();
  }

  /* --------------------------------------------------------- the selector */
  function label(button) {
    const s = summary(state);
    button.replaceChildren(
      el("co-env-button-icon", null, "span"),
      el("co-env-button-text", null, "span"),
    );
    button.firstChild.textContent = s.icon;
    button.firstChild.setAttribute("aria-hidden", "true");
    button.lastChild.textContent = s.text;
    button.setAttribute("aria-label", "辦公室環境：" + s.text + (s.auto ? "（時間自動）" : "") + "，按下調整");
    button.setAttribute("aria-expanded", String(!!panel?.open));
    button.setAttribute("aria-controls", "co-env-panel");
  }
  function bindButton(button) {
    buttons.add(button);
    button.classList.add("co-env-button");
    button.addEventListener("click", () => (panel?.open ? closePanel() : openPanel(button)));
    label(button);
    return button;
  }
  function status(kind, text) {
    const line = panel?.querySelector(".co-env-status");
    if (!line) return;
    line.dataset.kind = kind;
    line.textContent =
      text ||
      {
        saving: "正在儲存…",
        saved: "已儲存 · 重新整理後會保持這個樣子",
        local: "暫存在這台電腦，辦公室連線後會自動儲存",
        idle: "時間、天氣與氣氛只改變辦公室的樣子，不影響任何工作紀錄。",
        refused: "氣氛效果最多同時 " + MAX_ATMOSPHERE + " 種，請先取消其中一種。",
      }[kind];
  }
  function choice(type, name, value, text, checked) {
    const wrap = el("co-env-choice", null, "label");
    const input = el("", wrap, "input");
    input.type = type;
    input.name = name;
    input.value = value;
    input.checked = checked;
    const icon = el("co-env-choice-icon", wrap, "span");
    icon.textContent = ICONS[value] || "🕰️";
    icon.setAttribute("aria-hidden", "true");
    el("", wrap, "span").textContent = text;
    return wrap;
  }
  function group(legend, hint) {
    const box = el("co-env-group", null, "fieldset");
    el("", box, "legend").textContent = legend;
    if (hint) el("co-env-hint", box, "p").textContent = hint;
    return box;
  }
  function buildPanel() {
    panel = el("co-env-panel co-dialog", null, "dialog");
    panel.id = "co-env-panel";
    panel.setAttribute("aria-labelledby", "co-env-title");
    const title = el("", panel, "h2");
    title.id = "co-env-title";
    title.textContent = "辦公室環境";
    const close = el("co-button quiet co-close", panel, "button");
    close.type = "button";
    close.textContent = "✕";
    close.setAttribute("aria-label", "關閉辦公室環境");
    close.addEventListener("click", closePanel);
    const presets = group("快速情境");
    presets.classList.add("co-env-presets");
    for (const p of PRESETS) {
      const b = el("co-button", presets, "button");
      b.type = "button";
      b.dataset.preset = p.id;
      b.textContent = p.label;
      b.addEventListener("click", () => set(preset(p.id)));
    }
    const times = group("時間");
    for (const t of TIME_MODES) times.append(choice("radio", "co-env-time", t, LABELS[t], false));
    const weathers = group("天氣");
    for (const w of WEATHERS) weathers.append(choice("radio", "co-env-weather", w, LABELS[w], false));
    const rainbow = choice("checkbox", "co-env-rainbow", "RAINBOW", "加上彩虹", false);
    rainbow.classList.add("co-env-modifier");
    weathers.append(rainbow);
    el("co-env-hint co-env-rainbow-hint", weathers, "p");
    const atmos = group("氣氛", "最多同時 " + MAX_ATMOSPHERE + " 種；白天星星與流星會自動隱藏。");
    for (const a of ATMOSPHERES) atmos.append(choice("checkbox", "co-env-atmos", a, LABELS[a], false));
    const line = el("co-env-status", panel, "p");
    line.role = "status";
    panel.append(presets, times, weathers, atmos, line);
    panel.addEventListener("change", (event) => {
      const input = event.target;
      if (input.name === "co-env-time") set({ ...state, time: input.value });
      else if (input.name === "co-env-weather") set(withWeather(state, input.value));
      else if (input.name === "co-env-rainbow") set({ ...state, rainbow: input.checked });
      else if (input.name === "co-env-atmos") {
        const result = withAtmosphere(state, input.value, input.checked);
        if (result.refused) {
          input.checked = false;
          status("refused");
          return;
        }
        set(result.state);
      }
    });
    panel.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePanel();
      }
    });
    document.body.append(panel);
    status("idle");
    return panel;
  }
  function refreshPanel() {
    if (!panel) return;
    const s = summary(state);
    for (const input of panel.querySelectorAll("input")) {
      if (input.name === "co-env-time") input.checked = input.value === state.time;
      if (input.name === "co-env-weather") input.checked = input.value === state.weather;
      if (input.name === "co-env-atmos") input.checked = state.atmosphere.includes(input.value);
      if (input.name === "co-env-rainbow") {
        input.checked = state.rainbow;
        input.disabled = !RAINBOW_WEATHERS.includes(state.weather);
      }
    }
    const auto = panel.querySelector('input[value="AUTO"] + span + span');
    if (auto) auto.textContent = "自動 · 現在是" + LABELS[resolveTime("AUTO")];
    panel.querySelector(".co-env-rainbow-hint").textContent = RAINBOW_WEATHERS.includes(state.weather)
      ? ""
      : "彩虹只在晴朗、多雲或下雨時出現。";
    for (const b of panel.querySelectorAll("[data-preset]"))
      b.setAttribute("aria-pressed", String(same(preset(b.dataset.preset), state)));
    panel.dataset.summary = s.text;
  }
  function outside(event) {
    if (!panel?.open || panel.contains(event.target) || trigger?.contains(event.target)) return;
    closePanel(false);
  }
  function openPanel(anchor) {
    trigger = anchor || trigger;
    if (!panel) buildPanel();
    refreshPanel();
    panel.show();
    for (const b of buttons) b.setAttribute("aria-expanded", "true");
    (panel.querySelector("input:checked") || panel.querySelector("input"))?.focus();
    document.addEventListener("pointerdown", outside, true);
  }
  function closePanel(returnFocus = true) {
    if (!panel?.open) return;
    panel.close();
    document.removeEventListener("pointerdown", outside, true);
    for (const b of buttons) b.setAttribute("aria-expanded", "false");
    if (returnFocus) trigger?.focus();
  }

  /* ------------------------------------------------------- sky islands */
  const PEBBLES = 3;
  function scene(zone) {
    const room = el("co-zone-scene");
    room.setAttribute("aria-hidden", "true");
    // HOME keeps its lodge band: a wall with windows onto the shared sky.
    const parts = ISLANDS[zone]
      ? ["props", "shade", "light", "crest"]
      : ["wall", "glass", "mullions", "snowcap", "props", "shade", "light"];
    for (const part of parts) {
      const layer = el((ISLANDS[zone] ? "co-isle-" : "co-zone-") + part, room);
      if (part === "glass") el("co-zone-drops", layer);
    }
    return room;
  }
  /* The rock an island hangs from, a waterfall where the region has water, and a
     few loose stones drifting beside it. */
  function under(zone) {
    const base = el("co-isle-under");
    base.setAttribute("aria-hidden", "true");
    base.dataset.zone = zone;
    el("co-isle-rock", base);
    el("co-isle-fall", base);
    for (let i = 0; i < PEBBLES; i++) vars(el("co-isle-pebble", base), { i });
    return base;
  }
  const zoneWatch =
    typeof IntersectionObserver === "function"
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries) entry.target.classList.toggle("is-zone-live", entry.isIntersecting);
          },
          { rootMargin: "80px" },
        )
      : null;
  function watch(section) {
    zoneWatch?.observe(section);
  }

  function mount() {
    build();
    mountMap();
    apply();
    reducedQuery.addEventListener?.("change", apply);
    narrowQuery.addEventListener?.("change", apply);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) schedule();
    });
    setInterval(() => {
      if (state.time === "AUTO" && resolveTime("AUTO") !== current.time) apply();
    }, 60000);
  }
  Object.assign(api, {
    mount,
    set,
    adopt,
    current: () => ({ ...state, atmosphere: [...state.atmosphere] }),
    rendered: () => ({ ...current }),
    onSave(fn) {
      saver = fn;
    },
    bindButton,
    openPanel,
    closePanel,
    scene,
    under,
    watch,
  });
  scope.CreatorEnvironment = api;
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})(typeof window === "undefined" ? globalThis : window);
