/* Lodge ambience is decorative only: it reads no work state and never publishes one. */
((scope) => {
  "use strict";
  /* Bounded budgets keep the scene cheap on low-end machines. */
  const LIMITS = { dust: 10, snow: 14, steam: 3, bulbs: 11 };
  /* Warm sources traced from the Mountain Lodge map art, in percent of the map box. */
  const SOURCES = [
    { id: "hearth", x: 53, y: 28.5, size: 32, tone: "ember", motion: "flicker" },
    { id: "hearth-floor", x: 53, y: 40, size: 30, tone: "ember" },
    { id: "desk-lamp", x: 11, y: 51, size: 14, tone: "lamp" },
    { id: "screen", x: 17.5, y: 53, size: 12, tone: "screen", motion: "pulse" },
    { id: "coffee", x: 48.5, y: 53, size: 9, tone: "lamp" },
    { id: "server", x: 78.5, y: 25, size: 17, tone: "screen", motion: "pulse" },
    { id: "alarm", x: 86.7, y: 32, size: 8, tone: "alarm", motion: "flicker" },
    { id: "floor-lamp", x: 40.6, y: 66, size: 10, tone: "lamp" },
    { id: "bedside", x: 98, y: 35, size: 11, tone: "lamp" },
    { id: "sign", x: 87, y: 9, size: 12, tone: "lamp" },
  ];
  /* Cold daylight pooling on the snow, opposite the warm interior. */
  const WINDOWS = [
    { x: -4, y: 30, w: 34, h: 54, tilt: -9 },
    { x: 28, y: 56, w: 26, h: 42, tilt: 6 },
    { x: 63, y: 2, w: 14, h: 62, tilt: 4 },
    { x: 88, y: 52, w: 20, h: 44, tilt: -6 },
  ];
  /* A small deterministic sequence keeps every reload identical and test-checkable. */
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
  function plan(kind, count, seed) {
    const random = noise(seed);
    return Array.from({ length: count }, (_, i) => {
      const a = random(), b = random(), c = random();
      if (kind === "dust")
        return {
          x: +(a * 100).toFixed(2),
          y: +(12 + b * 76).toFixed(2),
          size: +(2 + c * 3.2).toFixed(2),
          duration: +(16 + a * 15).toFixed(2),
          delay: +(-a * 26).toFixed(2),
          drift: +(-14 + b * 28).toFixed(2),
          rise: +(-40 - c * 46).toFixed(2),
        };
      if (kind === "snow")
        return {
          x: +(a * 100).toFixed(2),
          size: +(2.6 + c * 2.9).toFixed(2),
          duration: +(13 + b * 12).toFixed(2),
          delay: +(-b * 25).toFixed(2),
          drift: +(-22 + c * 44).toFixed(2),
          opacity: +(0.3 + c * 0.34).toFixed(2),
        };
      return {
        size: +(6 + a * 5).toFixed(2),
        duration: +(4.6 + b * 2.4).toFixed(2),
        delay: +(-b * 5).toFixed(2),
        drift: +(-7 + c * 12).toFixed(2),
      };
    });
  }
  const el = (cls, host) => {
    const node = document.createElement("div");
    node.className = cls;
    host?.append(node);
    return node;
  };
  const px = (node, values) => {
    for (const [key, value] of Object.entries(values))
      node.style.setProperty("--" + key, value);
  };
  function build(host) {
    if (!host || host.querySelector(".co-amb")) return null;
    const back = el("co-amb co-amb-back", host);
    const front = el("co-amb co-amb-front", host);
    back.setAttribute("aria-hidden", "true");
    front.setAttribute("aria-hidden", "true");
    for (const w of WINDOWS) {
      const beam = el("co-amb-window", back);
      px(beam, {
        x: w.x + "%",
        y: w.y + "%",
        w: w.w + "%",
        h: w.h + "%",
        tilt: w.tilt + "deg",
      });
    }
    el("co-amb-warmth", back);
    for (const source of SOURCES) {
      const glow = el("co-amb-glow", back);
      glow.dataset.id = source.id;
      glow.dataset.tone = source.tone;
      if (source.motion) glow.dataset.motion = source.motion;
      px(glow, {
        x: source.x + "%",
        y: source.y + "%",
        size: source.size + "%",
        beat: (source.id.length % 5) + 3.5 + "s",
      });
    }
    const garland = el("co-amb-garland", front);
    for (let i = 0; i < LIMITS.bulbs; i++) {
      const bulb = el("co-amb-bulb", garland);
      px(bulb, {
        x: (i / (LIMITS.bulbs - 1)) * 100 + "%",
        sag: Math.sin((i / (LIMITS.bulbs - 1)) * Math.PI) * 22 + "px",
        beat: 2.6 + (i % 5) * 0.55 + "s",
        delay: -(i % 7) * 0.4 + "s",
      });
    }
    const dust = el("co-amb-dust", front);
    for (const p of plan("dust", LIMITS.dust, 17)) {
      const mote = el("co-amb-mote", dust);
      px(mote, {
        x: p.x + "%",
        y: p.y + "%",
        size: p.size + "px",
        duration: p.duration + "s",
        delay: p.delay + "s",
        drift: p.drift + "px",
        rise: p.rise + "px",
      });
    }
    const snow = el("co-amb-snow", front);
    for (const p of plan("snow", LIMITS.snow, 31)) {
      const flake = el("co-amb-flake", snow);
      px(flake, {
        x: p.x + "%",
        size: p.size + "px",
        duration: p.duration + "s",
        delay: p.delay + "s",
        drift: p.drift + "px",
        peak: p.opacity,
      });
    }
    const steam = el("co-amb-steam", front);
    for (const p of plan("steam", LIMITS.steam, 43)) {
      const wisp = el("co-amb-wisp", steam);
      px(wisp, {
        size: p.size + "px",
        duration: p.duration + "s",
        delay: p.delay + "s",
        drift: p.drift + "px",
      });
    }
    el("co-amb-depth", front);
    return { back, front };
  }
  /* Parallax is pointer-only and clamped; it never changes layout or hit areas. */
  function parallax(host, layers) {
    if (!host || !layers) return () => {};
    const reduced = scope.matchMedia?.("(prefers-reduced-motion: reduce)");
    const coarse = scope.matchMedia?.("(pointer: coarse)");
    let frame = 0,
      tx = 0,
      ty = 0;
    const apply = () => {
      frame = 0;
      host.style.setProperty("--co-amb-px", tx.toFixed(3));
      host.style.setProperty("--co-amb-py", ty.toFixed(3));
    };
    const move = (event) => {
      if (reduced?.matches || coarse?.matches) return;
      const box = host.getBoundingClientRect();
      if (!box.width || !box.height) return;
      tx = Math.max(-1, Math.min(1, (event.clientX - box.left) / box.width * 2 - 1));
      ty = Math.max(-1, Math.min(1, (event.clientY - box.top) / box.height * 2 - 1));
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const rest = () => {
      tx = 0;
      ty = 0;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    host.addEventListener("pointermove", move, { passive: true });
    host.addEventListener("pointerleave", rest, { passive: true });
    return () => {
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", rest);
      if (frame) cancelAnimationFrame(frame);
    };
  }
  /* Offscreen panels and hidden tabs stop paying for the animation. */
  function idleGuard(host) {
    let onScreen = true;
    const mark = () => host.classList.toggle("is-amb-live", onScreen && !document.hidden);
    const observer = new IntersectionObserver(
      (entries) => {
        onScreen = entries[entries.length - 1].isIntersecting;
        mark();
      },
      { rootMargin: "80px" },
    );
    observer.observe(host);
    document.addEventListener("visibilitychange", mark);
    mark();
    return observer;
  }
  function mount() {
    const host = document.getElementById("game-container");
    if (!host) return null;
    if (getComputedStyle(host).position === "static") host.style.position = "relative";
    const layers = build(host);
    if (!layers) return null;
    host.classList.add("has-ambience");
    parallax(host, layers);
    idleGuard(host);
    return layers;
  }
  scope.CreatorAmbience = { LIMITS, SOURCES, WINDOWS, plan, build, mount };
  if (typeof module !== "undefined") module.exports = { LIMITS, SOURCES, WINDOWS, plan };
  if (typeof document !== "undefined") {
    if (document.body) mount();
    else document.addEventListener("DOMContentLoaded", mount);
  }
})(typeof window === "undefined" ? globalThis : window);
