/* STAR OFFICE station. The lodge now sits in a module of a space station: the
   galaxy around it, the hull around the office, the atmosphere below it that the
   sky islands rise out of, and the entry through its airlock. Decorative only:
   it reads no work state and writes none, and the office interior is the map's
   own art, never redrawn here. */
((scope) => {
  "use strict";
  const DURATION = Object.freeze({ full: 4400, quick: 1200, reduced: 650, off: 0 });
  const RECENT_FULL_MS = 6 * 3600 * 1000;
  const SESSION_KEY = "so-intro-seen";
  const FULL_KEY = "so-intro-full-at";

  // Which entry to play. The first visit gets the whole film; a return in the
  // same session, or within hours of the last full one, the short one; reduced
  // motion a still frame once, then nothing. ?intro=full|quick|off overrides.
  function introMode({ override = "", sessionSeen = false, lastFull = NaN, now = Date.now(), reduced = false, hidden = false } = {}) {
    if (override === "off" || hidden) return "off";
    if (reduced) return ["full", "quick"].includes(override) || !sessionSeen ? "reduced" : "off";
    if (["full", "quick"].includes(override)) return override;
    if (sessionSeen) return "quick";
    if (Number.isFinite(lastFull) && lastFull <= now && now - lastFull < RECENT_FULL_MS) return "quick";
    return "full";
  }
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const span = (t, a, b) => clamp((t - a) / (b - a));
  const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const easeIn = (x) => x * x * x;
  // The five shots as fractions of the run.
  const SHOTS = Object.freeze({
    full: { galaxy: [0, 0.2], approach: [0.16, 0.55], doors: [0.55, 0.71], through: [0.69, 0.9], arrive: [0.86, 1] },
    quick: { galaxy: [0, 0], approach: [0, 0.22], doors: [0.1, 0.44], through: [0.4, 0.8], arrive: [0.72, 1] },
    reduced: { galaxy: [0, 0], approach: [0, 0], doors: [0, 0], through: [0, 0], arrive: [0.55, 1] },
  });
  // The whole film as a pure function of progress t in [0, 1].
  function frame(mode, t) {
    const s = SHOTS[mode] || SHOTS.reduced;
    t = clamp(t);
    const approach = mode === "reduced" ? 1 : easeInOut(span(t, ...s.approach));
    const from = mode === "full" ? 0.16 : 0.72;
    const through = mode === "reduced" ? 0 : easeIn(span(t, ...s.through));
    const arrive = span(t, ...s.arrive);
    const shot =
      t >= s.arrive[0] ? "arrive" : t >= s.through[0] && mode !== "reduced" ? "through" : t >= s.doors[0] && mode !== "reduced" ? "doors" : t >= s.approach[0] && t > s.galaxy[1] ? "approach" : "galaxy";
    return {
      shot,
      scale: (from + (1 - from) * approach) * (1 + through * 8),
      door: mode === "reduced" ? 1 : easeInOut(span(t, ...s.doors)),
      warp: mode === "reduced" ? 0 : 0.25 + span(t, ...s.approach) * 1.3 + through * 3.2,
      flash: mode === "reduced" ? 0 : Math.sin(Math.PI * clamp((t - s.through[0]) / (s.arrive[1] - s.through[0]))) * 0.9,
      veil: 1 - arrive,
      caption: mode === "full" && t > 0.03 && t < 0.3 ? "universe" : t > s.doors[0] && t < s.through[1] - 0.04 && mode !== "reduced" ? "welcome" : "",
    };
  }
  // The film waits at the closed airlock until the creator clicks to go in.
  const GATE = Object.freeze({ full: SHOTS.full.doors[0], quick: SHOTS.quick.doors[0], reduced: 0 });
  const api = { DURATION, RECENT_FULL_MS, introMode, frame, SHOTS, GATE };
  if (typeof module !== "undefined") module.exports = api;
  if (typeof document === "undefined" || typeof document.createElement !== "function") {
    scope.CreatorStation = api;
    return;
  }

  /* ---------------------------------------------------------------- helpers */
  const el = (cls, host, tag = "div") => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    host?.append(node);
    return node;
  };
  const reducedQuery = scope.matchMedia("(prefers-reduced-motion: reduce)");
  function noise(seed) {
    let v = (seed * 2654435761) >>> 0;
    return () => {
      v ^= v << 13;
      v ^= v >>> 17;
      v ^= v << 5;
      v >>>= 0;
      return v / 4294967296;
    };
  }
  // A tile of stars drawn once as an SVG picture; two tile sizes hide the repeat.
  function starTile(size, count, seed) {
    const r = noise(seed);
    let dots = "";
    for (let i = 0; i < count; i++) {
      const x = (r() * size).toFixed(1),
        y = (r() * size).toFixed(1),
        rad = (0.35 + r() * r() * 1.25).toFixed(2),
        o = (0.35 + r() * 0.65).toFixed(2),
        hue = r();
      const fill = hue > 0.86 ? "#ffe2b0" : hue > 0.72 ? "#bcd6ff" : "#ffffff";
      dots += `<circle cx='${x}' cy='${y}' r='${rad}' fill='${fill}' fill-opacity='${o}'/>`;
    }
    return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>${dots}</svg>`)}")`;
  }

  /* ------------------------------------------------ galaxy, hull, atmosphere */
  let galaxy = null,
    hull = null,
    queued = false;
  function buildGalaxy() {
    galaxy = el("so-galaxy");
    galaxy.id = "so-galaxy";
    galaxy.setAttribute("aria-hidden", "true");
    galaxy.style.setProperty("--stars-a", starTile(640, 150, 11));
    galaxy.style.setProperty("--stars-b", starTile(1024, 110, 29));
    el("so-galaxy-stars", galaxy);
    el("so-galaxy-nebula", galaxy);
    el("so-planet is-moon", galaxy);
    const giant = el("so-planet is-giant", galaxy);
    el("so-planet-ring", giant);
    const twinkles = el("so-twinkles", galaxy);
    const r = noise(47);
    for (let i = 0; i < 14; i++) {
      const star = el("so-twinkle", twinkles, "i");
      star.style.left = (3 + r() * 94).toFixed(1) + "%";
      star.style.top = (2 + r() * 60).toFixed(1) + "%";
      star.style.setProperty("--d", (2.6 + r() * 3.4).toFixed(2) + "s");
      star.style.setProperty("--delay", (-r() * 6).toFixed(2) + "s");
    }
    const limb = el("so-galaxy-limb", galaxy);
    el("so-limb-arc", limb);
    el("so-limb-air", limb);
    const clouds = el("so-limb-clouds", limb);
    for (let i = 0; i < 7; i++) el("so-limb-cloud", clouds).style.setProperty("--i", i);
    const env = document.getElementById("co-env");
    if (env) env.after(galaxy);
    else document.body.prepend(galaxy);
  }
  function buildHull() {
    hull = el("so-hull");
    hull.id = "so-hull";
    hull.setAttribute("aria-hidden", "true");
    const plate = el("so-hull-plate", hull);
    for (const corner of ["tl", "tr", "bl", "br"]) el("so-hull-light is-" + corner, plate, "i");
    el("so-hull-stencil", plate).textContent = "STAR OFFICE · CREATOR STATION · R-01";
    for (const side of ["left", "right"]) {
      const wing = el("so-hull-wing is-" + side, hull);
      el("so-wing-strut", wing);
      el("so-wing-panel", wing);
    }
    const belly = el("so-hull-belly", hull);
    el("so-belly-keel", belly);
    for (let i = 0; i < 3; i++) el("so-thruster", belly).style.setProperty("--i", i);
    galaxy.after(hull);
  }
  const rectOf = (node) => {
    if (!node) return null;
    const r = node.getBoundingClientRect();
    return r.height > 0 && r.width > 0 ? { top: r.top + scrollY, bottom: r.bottom + scrollY, left: r.left, right: r.right } : null;
  };
  function layout() {
    queued = false;
    const header = rectOf(document.querySelector(".co-map-header"));
    if (!header || !galaxy) return;
    const parts = [header, rectOf(document.getElementById("game-container")), rectOf(document.getElementById("office-members"))].filter(Boolean);
    const cabin = {
      top: Math.min(...parts.map((p) => p.top)),
      bottom: Math.max(...parts.map((p) => p.bottom)),
      left: Math.min(...parts.map((p) => p.left)),
      right: Math.max(...parts.map((p) => p.right)),
    };
    const stage = rectOf(document.querySelector(".cw-stage"));
    const width = document.documentElement.clientWidth;
    const skyTop = stage ? stage.top : cabin.bottom + 320;
    // Space holds until just past the station's engines; then the planet's edge,
    // the air thickening, high clouds, and the sky islands' own sky fading in.
    const height = Math.round(skyTop + 240);
    galaxy.style.height = height + "px";
    galaxy.style.setProperty("--limb-top", Math.round(Math.min(skyTop - 160, cabin.bottom + 110)) + "px");
    galaxy.style.setProperty("--fade-start", Math.round(Math.max(0, skyTop + 40)) + "px");
    const pad = width < 700 ? 6 : 14;
    const top = Math.max(0, cabin.top - pad);
    hull.style.top = top + "px";
    hull.style.height = Math.round(cabin.bottom - top + pad + 170) + "px";
    hull.style.setProperty("--plate-left", Math.max(0, cabin.left - pad) + "px");
    hull.style.setProperty("--plate-width", Math.min(width, cabin.right + pad) - Math.max(0, cabin.left - pad) + "px");
    hull.style.setProperty("--plate-height", Math.round(cabin.bottom - top + pad) + "px");
    const margin = Math.max(0, cabin.left - pad);
    hull.style.setProperty("--wing", Math.max(0, Math.min(380, margin - 10)) + "px");
    hull.dataset.wings = margin - 10 >= 70 ? "true" : "false";
    const game = rectOf(document.getElementById("game-container"));
    hull.style.setProperty("--wing-y", Math.round((game ? (game.top + game.bottom) / 2 : (cabin.top + cabin.bottom) / 2) - top) + "px");
  }
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(layout);
  }
  function mountStation() {
    document.documentElement.classList.add("so-station");
    buildGalaxy();
    buildHull();
    layout();
    addEventListener("resize", schedule);
    if (typeof ResizeObserver === "function") new ResizeObserver(schedule).observe(document.body);
    // The scenery only moves while it is on screen.
    if (typeof IntersectionObserver === "function") {
      const watch = new IntersectionObserver((entries) => {
        for (const entry of entries) entry.target.classList.toggle("is-live", entry.isIntersecting);
      });
      watch.observe(galaxy);
      watch.observe(hull);
    }
  }

  /* ------------------------------------------------------------------ entry */
  // The channel's own penguin looks out of the station's top window.
  const CHANNEL_ICON = "/static/renguin-characters/system/channel-icon.png";
  const STATION_SVG = `
<svg class="so-station-art" viewBox="-500 -350 1000 700" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="so-metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5c6689"/><stop offset=".55" stop-color="#394264"/><stop offset="1" stop-color="#252b47"/></linearGradient>
    <linearGradient id="so-metal-dark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a4264"/><stop offset="1" stop-color="#1b2038"/></linearGradient>
    <linearGradient id="so-panel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2d5fb0"/><stop offset="1" stop-color="#173a78"/></linearGradient>
    <radialGradient id="so-warm" cx=".5" cy=".62" r=".7"><stop offset="0" stop-color="#fff3c8"/><stop offset=".45" stop-color="#ffc977"/><stop offset="1" stop-color="#d9793d"/></radialGradient>
    <clipPath id="so-door-clip"><rect x="-72" y="-58" width="144" height="160" rx="12"/></clipPath>
    <clipPath id="so-channel-clip"><circle cx="0" cy="-162" r="42"/></clipPath>
  </defs>
  <g class="so-art-wings">
    <rect x="-430" y="-18" width="240" height="10" fill="#4a5374"/>
    <rect x="190" y="-18" width="240" height="10" fill="#4a5374"/>
    <g fill="url(#so-panel)" stroke="#9fc3ff" stroke-opacity=".35" stroke-width="2">
      <rect x="-470" y="-86" width="200" height="72" rx="4"/><rect x="-470" y="-4" width="200" height="72" rx="4"/>
      <rect x="270" y="-86" width="200" height="72" rx="4"/><rect x="270" y="-4" width="200" height="72" rx="4"/>
    </g>
    <g stroke="#bcd6ff" stroke-opacity=".22" stroke-width="1.5">
      <path d="M-420-86v154M-370-86v154M-320-86v154M320-86v154M370-86v154M420-86v154M-470-50h200M-470 32h200M270-50h200M270 32h200"/>
    </g>
  </g>
  <ellipse cx="0" cy="10" rx="330" ry="104" fill="none" stroke="url(#so-metal-dark)" stroke-width="30"/>
  <g fill="#ffd79a" fill-opacity=".85">
    <rect x="-300" y="-40" width="14" height="8" rx="3"/><rect x="-250" y="-72" width="14" height="8" rx="3"/><rect x="236" y="-72" width="14" height="8" rx="3"/><rect x="286" y="-40" width="14" height="8" rx="3"/>
    <rect x="-296" y="66" width="14" height="8" rx="3"/><rect x="282" y="66" width="14" height="8" rx="3"/>
  </g>
  <path d="M-150-200 Q0-300 150-200 Z" fill="url(#so-metal)"/>
  <rect x="-4" y="-300" width="8" height="70" fill="#7d88ad"/>
  <circle class="so-art-beacon" cx="0" cy="-306" r="9" fill="#ff7a8a"/>
  <rect x="-200" y="-205" width="400" height="330" rx="58" fill="url(#so-metal)" stroke="#1b2038" stroke-width="6"/>
  <path d="M-196-120H196M-196 60H196M-100-205V-120M100-205V-120" stroke="#1b2038" stroke-opacity=".5" stroke-width="3"/>
  <g fill="#9aa6c9"><circle cx="-172" cy="-178" r="5"/><circle cx="172" cy="-178" r="5"/><circle cx="-172" cy="98" r="5"/><circle cx="172" cy="98" r="5"/></g>
  <g>
    <rect x="-176" y="-184" width="64" height="48" rx="14" fill="url(#so-warm)"/>
    <rect x="112" y="-184" width="64" height="48" rx="14" fill="url(#so-warm)"/>
    <circle cx="0" cy="-162" r="45" fill="url(#so-warm)" stroke="#1b2038" stroke-width="6"/>
    <image class="so-art-channel" href="${CHANNEL_ICON}" x="-39" y="-199" width="78" height="71" preserveAspectRatio="xMidYMax meet" clip-path="url(#so-channel-clip)"/>
    <circle class="so-art-channel-ring" cx="0" cy="-162" r="45" fill="none" stroke="#ffd27a" stroke-width="4"/>
    <path d="M-150-172q12 18 26 0M126-172q12 18 26 0" stroke="#3b7a4a" stroke-width="5" fill="none"/>
  </g>
  <g class="so-art-sign">
    <rect x="-116" y="-116" width="232" height="40" rx="12" fill="#12162b" stroke="#ffd27a" stroke-opacity=".5" stroke-width="2"/>
    <text x="0" y="-88" text-anchor="middle" font-family="ArkPixel, system-ui, sans-serif" font-size="24" letter-spacing="3" fill="#ffd27a">STAR OFFICE</text>
  </g>
  <rect x="-86" y="-70" width="172" height="184" rx="20" fill="#151a2e" stroke="#7784ab" stroke-width="6"/>
  <g clip-path="url(#so-door-clip)">
    <rect x="-72" y="-58" width="144" height="160" fill="url(#so-warm)"/>
    <g fill="#8a4f2c" fill-opacity=".55"><rect x="-72" y="72" width="144" height="30"/><rect x="-44" y="30" width="36" height="24" rx="4"/><circle cx="34" cy="16" r="16"/></g>
    <path d="M-72 86h144" stroke="#5c341d" stroke-opacity=".5" stroke-width="3"/>
    <g class="so-art-door is-left"><rect x="-72" y="-58" width="72" height="160" fill="url(#so-metal)"/><path d="M-60-40l24 20-24 20M-60 20l24 20-24 20" stroke="#ffcf5a" stroke-width="6" fill="none" stroke-opacity=".8"/><rect x="-6" y="-58" width="6" height="160" fill="#1b2038"/></g>
    <g class="so-art-door is-right"><rect x="0" y="-58" width="72" height="160" fill="url(#so-metal)"/><path d="M60-40l-24 20 24 20M60 20l-24 20 24 20" stroke="#ffcf5a" stroke-width="6" fill="none" stroke-opacity=".8"/><rect x="0" y="-58" width="6" height="160" fill="#1b2038"/></g>
  </g>
  <circle class="so-art-status is-left" cx="-112" cy="-24" r="8"/><circle class="so-art-status is-right" cx="112" cy="-24" r="8"/>
  <path d="M-86 122h172" stroke="#ffcf5a" stroke-width="8" stroke-dasharray="14 10"/>
  <g fill="#7fd0ff" fill-opacity=".6"><ellipse cx="-110" cy="150" rx="22" ry="8"/><ellipse cx="0" cy="156" rx="26" ry="9"/><ellipse cx="110" cy="150" rx="22" ry="8"/></g>
</svg>`;
  function playIntro() {
    const cover = document.getElementById("so-intro-cover");
    let override = "";
    try {
      override = new URLSearchParams(location.search).get("intro") || "";
    } catch {}
    let sessionSeen = false,
      lastFull = NaN;
    try {
      sessionSeen = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {}
    try {
      lastFull = Number(localStorage.getItem(FULL_KEY));
    } catch {}
    const mode = introMode({ override, sessionSeen, lastFull, reduced: reducedQuery.matches, hidden: document.hidden });
    if (mode === "off") {
      cover?.remove();
      return;
    }
    const overlay = el("so-intro");
    overlay.dataset.mode = mode;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "進入 STAR OFFICE");
    el("so-intro-space", overlay);
    const canvas = el("so-intro-stars", overlay, "canvas");
    const scene = el("so-intro-scene", overlay);
    scene.innerHTML = STATION_SVG;
    const flash = el("so-intro-flash", overlay);
    const captions = {
      universe: Object.assign(el("so-intro-caption is-universe", overlay, "p"), { textContent: "RENGUIN · CREATOR UNIVERSE" }),
      welcome: Object.assign(el("so-intro-caption is-welcome", overlay, "p"), { textContent: "STAR OFFICE · 歡迎回來" }),
    };
    const enter = el("so-intro-enter", overlay, "button");
    enter.type = "button";
    enter.textContent = "點擊進入 STAR OFFICE";
    enter.hidden = true;
    const skip = el("so-intro-skip", overlay, "button");
    skip.type = "button";
    skip.textContent = "跳過 ›";
    skip.setAttribute("aria-label", "跳過進場動畫");
    document.body.append(overlay);
    cover?.remove();
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {}
    if (mode === "full")
      try {
        localStorage.setItem(FULL_KEY, String(Date.now()));
      } catch {}

    const doorL = scene.querySelector(".so-art-door.is-left"),
      doorR = scene.querySelector(".so-art-door.is-right");
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    const stars = [];
    const r = noise(5);
    for (let i = 0; i < 260; i++) stars.push({ x: r() * 2 - 1, y: r() * 2 - 1, z: 0.05 + r() * 0.95 });
    const size = () => {
      canvas.width = Math.round(innerWidth * dpr);
      canvas.height = Math.round(innerHeight * dpr);
    };
    size();
    addEventListener("resize", size);
    const total = DURATION[mode];
    const gateAt = GATE[mode];
    let start = performance.now(),
      last = start,
      raf = 0,
      done = false,
      skipTo = null,
      entered = false,
      waiting = false;
    function drawStars(f, dt) {
      const w = canvas.width,
        h = canvas.height,
        cx = w / 2,
        cy = h / 2,
        spread = Math.max(w, h) * 0.55;
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        const pz = s.z;
        if (f.warp > 0) {
          s.z -= f.warp * dt * 0.00032;
          if (s.z <= 0.02) {
            s.x = r() * 2 - 1;
            s.y = r() * 2 - 1;
            s.z = 1;
            continue;
          }
        }
        const x = cx + (s.x / s.z) * spread * 0.4,
          y = cy + (s.y / s.z) * spread * 0.4;
        if (x < 0 || y < 0 || x > w || y > h) continue;
        const px = cx + (s.x / pz) * spread * 0.4,
          py = cy + (s.y / pz) * spread * 0.4;
        const light = Math.min(1, (1 - s.z) * 1.4 + 0.15);
        ctx.strokeStyle = `rgba(255,248,230,${light.toFixed(3)})`;
        ctx.lineWidth = Math.max(0.6, (1 - s.z) * 2.4) * dpr;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(x + 0.01, y + 0.01);
        ctx.stroke();
      }
    }
    function paint(t, dt) {
      const f = frame(mode, t);
      // Holding at the door, the stars only drift.
      if (waiting) f.warp = mode === "reduced" ? 0 : 0.3;
      scene.style.transform = `translate(-50%, -50%) scale(${f.scale.toFixed(4)})`;
      doorL.style.transform = `translateX(${(-f.door * 70).toFixed(2)}px)`;
      doorR.style.transform = `translateX(${(f.door * 70).toFixed(2)}px)`;
      overlay.classList.toggle("is-open", f.door > 0.05);
      flash.style.opacity = f.flash.toFixed(3);
      overlay.style.opacity = f.veil.toFixed(3);
      overlay.dataset.shot = f.shot;
      for (const [key, node] of Object.entries(captions)) node.classList.toggle("is-shown", f.caption === key);
      drawStars(f, dt);
    }
    function finish() {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      removeEventListener("resize", size);
      removeEventListener("keydown", onKey, true);
      document.removeEventListener("visibilitychange", onHidden);
      overlay.remove();
      document.querySelector(".co-map-header")?.classList.add("so-arrived");
      setTimeout(() => document.querySelector(".co-map-header")?.classList.remove("so-arrived"), 1600);
      scope.dispatchEvent(new CustomEvent("star-office:entered", { detail: { mode } }));
    }
    function tick(now) {
      const dt = Math.min(64, now - last);
      last = now;
      let t = (now - start) / total;
      if (skipTo) t = skipTo.from + (now - skipTo.at) / skipTo.ms;
      else if (!entered && t >= gateAt) {
        t = gateAt;
        if (!waiting) {
          waiting = true;
          overlay.classList.add("is-waiting");
          enter.hidden = false;
          enter.focus({ preventScroll: true });
        }
      }
      if (t >= 1) {
        paint(1, dt);
        finish();
        return;
      }
      paint(t, dt);
      raf = requestAnimationFrame(tick);
    }
    // A click, a tap, Enter or Space goes in through the airlock; before the
    // film reaches the door it simply carries on through without stopping.
    function goIn() {
      if (done || entered) return;
      entered = true;
      if (waiting) start = performance.now() - gateAt * total;
      waiting = false;
      overlay.classList.remove("is-waiting");
      enter.hidden = true;
    }
    // 跳過 and Escape land at once and fade out quickly.
    function skipIntro() {
      if (done || skipTo) return;
      entered = true;
      waiting = false;
      enter.hidden = true;
      const now = performance.now();
      const t = Math.min(1, (now - start) / total);
      const from = Math.max(t, SHOTS[mode].arrive[0]);
      skipTo = { at: now, from, ms: 240 / (1 - from || 1) };
    }
    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        skipIntro();
      } else if (["Enter", " ", "Spacebar"].includes(e.key) && e.target !== skip) {
        e.preventDefault();
        goIn();
      }
    }
    overlay.addEventListener("pointerdown", (e) => {
      if (!skip.contains(e.target)) goIn();
    });
    enter.addEventListener("click", goIn);
    skip.addEventListener("click", skipIntro);
    addEventListener("keydown", onKey, true);
    // A tab hidden before going in waits at the door instead of running a film
    // nobody sees; hidden on the way in, it lands at once.
    function onHidden() {
      if (!document.hidden) return;
      if (entered) finish();
      else start = Math.min(start, performance.now() - gateAt * total);
    }
    document.addEventListener("visibilitychange", onHidden);
    skip.focus({ preventScroll: true });
    paint(0, 0);
    raf = requestAnimationFrame(tick);
    api.skip = skipIntro;
  }

  function mount() {
    try {
      mountStation();
    } catch (error) {
      console.warn("STAR OFFICE station layer unavailable", error);
    }
    try {
      playIntro();
    } catch (error) {
      document.getElementById("so-intro-cover")?.remove();
      console.warn("STAR OFFICE entry unavailable", error);
    }
  }
  Object.assign(api, { mount, layout: schedule });
  scope.CreatorStation = api;
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})(typeof window === "undefined" ? globalThis : window);
