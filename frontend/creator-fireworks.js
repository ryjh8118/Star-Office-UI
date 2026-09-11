/* Fireworks for the moment the creator marks post-production done.
   Decoration only: it reads no progress, writes nothing, and removes itself. */
((scope) => {
  "use strict";
  const PALETTE = ["#ffd36b", "#ff9a52", "#ff6f91", "#c9a2ff", "#7cc7ff", "#8ef0b5", "#fff3d6"];
  const SHAPES = ["peony", "ring", "willow", "crackle"];
  const LIMITS = { shells: 8, sparks: 84, particles: 720, duration: 6500 };
  const RISE = 760;
  const GRAVITY = 0.045;
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(",");
  function random(seed) {
    let s = seed >>> 0 || 1;
    return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  }

  // The show is planned up front, so its shape can be checked without a canvas.
  // The lead shell rises from the step that was just checked, when it is on screen.
  function plan(width, height, origin, seed = 1) {
    const rand = random(seed);
    const pick = () => PALETTE[Math.floor(rand() * PALETTE.length)];
    const fromStep =
      !!origin && Number.isFinite(origin.x) && origin.y > 160 && origin.y <= height;
    return Array.from({ length: LIMITS.shells }, (_, i) => {
      const finale = i >= LIMITS.shells - 3;
      const lead = i === 0 && fromStep;
      return {
        delay: lead ? 0 : finale ? 2100 + rand() * 240 : 240 + i * 420 + rand() * 160,
        x: clamp(
          lead ? origin.x : width * (0.12 + (0.76 * (((i * 3) % 5) + rand())) / 5),
          24,
          Math.max(24, width - 24),
        ),
        from: lead ? origin.y : height + 12,
        y: lead
          ? clamp(origin.y - height * 0.34, 40, origin.y - 80)
          : height * (0.1 + rand() * (finale ? 0.16 : 0.26)),
        color: pick(),
        accent: pick(),
        sparks: Math.round(52 + rand() * (LIMITS.sparks - 52)),
        shape: finale ? "peony" : SHAPES[i % SHAPES.length],
      };
    });
  }

  function banner(title, detail) {
    if (!title) return;
    document.querySelector(".co-fireworks-banner")?.remove();
    const box = document.createElement("div");
    box.className = "co-fireworks-banner";
    box.setAttribute("aria-hidden", "true");
    const heading = document.createElement("strong");
    heading.textContent = title;
    box.append(heading);
    if (detail) {
      const line = document.createElement("span");
      line.textContent = detail;
      box.append(line);
    }
    document.body.append(box);
    setTimeout(() => box.remove(), 4200);
  }

  let running = false;
  function launch({ origin = null, title = "", detail = "" } = {}) {
    if (typeof document === "undefined" || !document.body) return false;
    banner(title, detail);
    if (running || scope.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches)
      return false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext?.("2d");
    if (!ctx) return false;
    running = true;
    canvas.className = "co-fireworks";
    canvas.setAttribute("aria-hidden", "true");
    document.body.append(canvas);
    let width = 0,
      height = 0;
    const fit = () => {
      const ratio = Math.min(scope.devicePixelRatio || 1, 2);
      width = scope.innerWidth;
      height = scope.innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    fit();
    scope.addEventListener("resize", fit);
    const seed = Date.now();
    const rand = random(seed ^ 0x9e3779b9);
    const shells = plan(width, height, origin, seed);
    const rockets = [],
      sparks = [],
      flashes = [];
    const start = performance.now();
    let last = start,
      launched = 0;

    const spark = (props) => {
      if (sparks.length < LIMITS.particles) sparks.push({ trail: [], life: 0, ...props });
    };
    function burst(shell, x, y) {
      flashes.push({ x, y, age: 0, rgb: rgb(shell.color) });
      const willow = shell.shape === "willow";
      for (let i = 0; i < shell.sparks; i++) {
        const angle = (i / shell.sparks) * Math.PI * 2 + rand() * 0.2;
        const speed =
          (shell.shape === "ring" ? 3.2 : willow ? 2.2 : 1.1 + rand() * 2.6) *
          (0.92 + rand() * 0.16);
        spark({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          max: (willow ? 2100 : 1250) + rand() * 500,
          rgb: rgb(willow ? "#ffd36b" : i % 3 ? shell.color : shell.accent),
          size: willow ? 1.5 : 2 + rand() * 1.2,
          drag: willow ? 0.976 : 0.962,
          gravity: willow ? GRAVITY * 0.75 : GRAVITY,
          crackle: shell.shape === "crackle" || rand() < 0.16,
        });
      }
    }
    function finish() {
      scope.removeEventListener("resize", fit);
      canvas.remove();
      running = false;
    }
    function frame(now) {
      const step = Math.min(now - last, 48);
      const dt = step / 16.667;
      last = now;
      const t = now - start;
      while (launched < shells.length && shells[launched].delay <= t)
        rockets.push({ shell: shells[launched++], age: 0, trail: [] });
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";

      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.age += step;
        const k = Math.min(r.age / RISE, 1);
        const x = r.shell.x + Math.sin(r.age / 60) * 1.4;
        const y = r.shell.from + (r.shell.y - r.shell.from) * (1 - (1 - k) ** 3);
        r.trail.push([x, y]);
        if (r.trail.length > 12) r.trail.shift();
        ctx.strokeStyle = `rgba(${rgb(r.shell.color)},0.55)`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(r.trail[0][0], r.trail[0][1]);
        for (const [tx, ty] of r.trail) ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.fillStyle = "rgba(255,248,230,0.95)";
        ctx.beginPath();
        ctx.arc(x, y, 2.6, 0, Math.PI * 2);
        ctx.fill();
        if (rand() < 0.5)
          spark({
            x,
            y,
            vx: (rand() - 0.5) * 0.6,
            vy: 0.4 + rand() * 0.6,
            max: 380 + rand() * 260,
            rgb: "255,214,140",
            size: 1.2,
            drag: 0.94,
            gravity: GRAVITY * 0.5,
            crackle: false,
          });
        if (k >= 1) {
          rockets.splice(i, 1);
          burst(r.shell, x, y);
        }
      }

      for (let i = flashes.length - 1; i >= 0; i--) {
        const f = flashes[i];
        f.age += step;
        const a = 1 - f.age / 280;
        if (a <= 0) {
          flashes.splice(i, 1);
          continue;
        }
        const glow = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 110);
        glow.addColorStop(0, `rgba(${f.rgb},${0.5 * a})`);
        glow.addColorStop(1, `rgba(${f.rgb},0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(f.x, f.y, 110, 0, Math.PI * 2);
        ctx.fill();
      }

      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        p.life += step;
        const left = 1 - p.life / p.max;
        if (left <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        p.trail.push([p.x, p.y]);
        if (p.trail.length > 5) p.trail.shift();
        const drag = p.drag ** dt;
        p.vx *= drag;
        p.vy = p.vy * drag + p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        let alpha = Math.min(1, left * 1.6);
        if (p.crackle && left < 0.4) alpha *= rand() < 0.5 ? 1 : 0.12;
        ctx.strokeStyle = `rgba(${p.rgb},${alpha})`;
        ctx.lineWidth = p.size * (0.45 + left * 0.55);
        ctx.beginPath();
        ctx.moveTo(p.trail[0][0], p.trail[0][1]);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }

      const busy = launched < shells.length || rockets.length || sparks.length || flashes.length;
      if (busy && t < LIMITS.duration) requestAnimationFrame(frame);
      else finish();
    }
    requestAnimationFrame(frame);
    return true;
  }

  scope.CreatorFireworks = { launch, plan, LIMITS, PALETTE };
  if (typeof module !== "undefined") module.exports = { launch, plan, LIMITS, PALETTE };
})(typeof window === "undefined" ? globalThis : window);
