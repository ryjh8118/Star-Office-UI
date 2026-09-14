/* Two kinds of arrival. Rooms below the world take the stage as they scroll in
   and leave it as they scroll out. Above them, the sky world holds four islands
   at fixed places in one sky, and a camera flies between them.
   Decoration only: it reads no work state and writes nothing. The office hands
   the world its decks and its task cloud; the world only carries them. */
((scope) => {
  "use strict";
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, v) => {
    const t = clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };

  /* ------------------------------------------------------------ staged rooms */
  // The stage is the viewport less a strip at the top and the bottom, so a room
  // has visibly arrived before it lights up and visibly goes as it leaves.
  const EDGE = 0.1;
  function onStage(rect, height, edge = EDGE) {
    return rect.bottom > height * edge && rect.top < height * (1 - edge);
  }
  // Off stage, a room is wholly past one edge; its middle says which.
  function side(rect, height) {
    return rect.top + rect.height / 2 > height / 2 ? "below" : "above";
  }

  /* --------------------------------------------------------------- the world */
  // Reference units are CSS pixels on a 1440 × 900 screen, seen from the landing
  // distance: an island the camera has landed on is drawn at its natural size.
  const FOCAL = 1000;
  const NEAR = 140;
  // A landed camera hangs a little above an island's deck, so the island sits
  // low on the screen: the task cloud floats over its sky and the title
  // platform stands at its feet.
  const LAND_DROP = -120;
  const YAW_MAX = (7 * Math.PI) / 180;
  const ISLAND_IDS = ["work", "result", "short", "short-result"];
  // The dock lists the islands left to right in the order they lie in the sky,
  // so a destination further along the dock is always further to the right.
  const WORLD = Object.freeze({
    work: Object.freeze({ x: 0, y: 0, z: 0 }),
    result: Object.freeze({ x: 3300, y: -560, z: 900 }),
    short: Object.freeze({ x: 6400, y: 300, z: -250 }),
    "short-result": Object.freeze({ x: 9500, y: -1020, z: 1500 }),
  });
  const NAMES = {
    work: "晨光水晶工坊",
    result: "黃昏金殿",
    short: "紫電光軌塔",
    "short-result": "月夜星河",
  };

  function viewport(width, height) {
    const w = Math.max(1, width),
      h = Math.max(1, height);
    return { width: w, height: h, u: clamp(Math.min(w / 1440, h / 900), 0.3, 2), cx: w / 2, cy: h / 2 };
  }
  function settledCamera(id) {
    const p = WORLD[id];
    return { x: p.x, y: p.y + LAND_DROP, z: p.z - FOCAL, yaw: 0, roll: 0 };
  }
  // A pinhole camera looking down +z, turned by yaw. Roll is applied to the whole
  // drawn world at once, so it is not part of a single point's projection.
  function project(point, cam, view) {
    const dx = point.x - cam.x,
      dy = point.y - cam.y,
      dz = point.z - cam.z;
    const c = Math.cos(cam.yaw || 0),
      s = Math.sin(cam.yaw || 0);
    const rx = dx * c - dz * s,
      rz = dx * s + dz * c;
    if (rz < NEAR) return null;
    const k = FOCAL / rz;
    return { x: view.cx + rx * k * view.u, y: view.cy + dy * k * view.u, scale: k, depth: rz };
  }
  function bezier(a, b, c, d, u) {
    const v = 1 - u,
      w0 = v * v * v,
      w1 = 3 * v * v * u,
      w2 = 3 * v * u * u,
      w3 = u * u * u;
    return {
      x: a.x * w0 + b.x * w1 + c.x * w2 + d.x * w3,
      y: a.y * w0 + b.y * w1 + c.y * w2 + d.y * w3,
      z: a.z * w0 + b.z * w1 + c.z * w2 + d.z * w3,
    };
  }
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  const easeOut = (t) => 1 - (1 - t) ** 3;
  const PEAK = 0.9;
  // A flight from wherever the camera is to the landing pose of an island. It
  // backs away and climbs, crosses the sky, and comes in to land from behind the
  // landing point, so the destination grows as it nears. `velocity` continues a
  // flight already under way when the destination changes mid-air.
  function plan(from, target, options = {}) {
    const to = settledCamera(target);
    const dx = to.x - from.x,
      dy = to.y - from.y,
      dz = to.z - from.z;
    const dist = Math.hypot(dx, dy, dz);
    const reduced = !!options.reduced,
      retarget = !!options.velocity;
    const back = reduced ? clamp(dist * 0.1 + 260, 260, 800) : clamp(dist * 0.3 + 950, 1300, 3600);
    const rise = back * (reduced ? 0.04 : 0.17);
    const lead = 0.2;
    const duration = reduced
      ? clamp(420 + dist * 0.015, 440, 620)
      : retarget
        ? clamp(760 + dist * 0.045, 820, 1400)
        : clamp(1100 + dist * 0.045, 1150, 1560);
    let c1 = { x: from.x + dx * lead, y: from.y - rise, z: from.z - back };
    if (retarget) {
      const k = duration * 0.1;
      c1 = {
        x: from.x + clamp(options.velocity.x * k, -2600, 2600),
        y: from.y + clamp(options.velocity.y * k, -900, 900),
        z: from.z + clamp(options.velocity.z * k, -2600, 2600),
      };
    }
    const c2 = { x: to.x - dx * lead, y: to.y - rise * 0.55, z: to.z - back };
    return {
      target,
      from: { x: from.x, y: from.y, z: from.z },
      c1,
      c2,
      to: { x: to.x, y: to.y, z: to.z },
      yaw0: from.yaw || 0,
      roll0: from.roll || 0,
      dist,
      duration,
      reduced,
      retarget,
      direction: Math.sign(dx),
      overshoot: reduced ? 0 : clamp(26 / (3 * back), 0.003, 0.02),
      turn: reduced ? 0 : Math.sign(dx) * Math.min(1, Math.abs(dx) / 3000) * YAW_MAX,
    };
  }
  // How far along its path the camera is at a moment of the flight: out slowly,
  // across quickly, past the landing point by a breath, and back to settle.
  function progress(flight, tau) {
    const t = clamp(tau, 0, 1);
    const curve = flight.retarget ? easeOut : easeInOut;
    if (t <= PEAK) return curve(t / PEAK) * (1 + flight.overshoot);
    return 1 + flight.overshoot * (1 - easeInOut((t - PEAK) / (1 - PEAK)));
  }
  function sample(flight, tau) {
    const t = clamp(tau, 0, 1);
    const at = bezier(flight.from, flight.c1, flight.c2, flight.to, progress(flight, t));
    const bank = Math.sin(Math.PI * smooth(0.06, 0.88, t));
    const settle = smooth(0, PEAK, t);
    return {
      x: at.x,
      y: at.y,
      z: at.z,
      yaw: lerp(flight.yaw0, 0, settle) + flight.turn * bank,
      roll: lerp(flight.roll0, 0, settle) - flight.turn * 0.6 * bank,
    };
  }
  function phaseAt(flight, tau) {
    if (tau >= 1) return "SETTLED";
    if (!flight.retarget && tau < 0.2) return "DEPART";
    if (tau < 0.6) return "TRAVEL";
    if (tau < 0.86) return "APPROACH";
    return "LAND";
  }
  // The destination is a silhouette, then an outline in the mist, then a pillar
  // of light, and only then the whole island in its own colours.
  function reveal(flight, tau) {
    if (flight.reduced) return { lit: smooth(0.25, 0.85, tau), mist: 0, beam: 0 };
    return {
      lit: smooth(0.62, 0.92, tau),
      mist: smooth(0.38, 0.62, tau) * (1 - smooth(0.9, 1, tau)),
      beam: Math.sin(Math.PI * smooth(0.5, 0.97, tau)),
    };
  }
  // Every island tints the sky around itself; the tint the camera sees is a blend
  // weighted by how near it is, so the sky never changes colour in a step.
  function tints(cam) {
    const raw = ISLAND_IDS.map((id) => Math.exp(-(((cam.x - WORLD[id].x) / 2300) ** 2)));
    const total = raw.reduce((a, b) => a + b, 0) || 1;
    return raw.map((w) => w / total);
  }
  // Where along the dock the camera is, from 0 (first island) to 3 (last).
  function dockPosition(cam) {
    const xs = ISLAND_IDS.map((id) => WORLD[id].x);
    if (cam.x <= xs[0]) return 0;
    for (let i = 1; i < xs.length; i++)
      if (cam.x <= xs[i]) return i - 1 + (cam.x - xs[i - 1]) / (xs[i] - xs[i - 1]);
    return xs.length - 1;
  }

  /* ------------------------------------------------------- the flight control */
  // One controller owns the camera. A new destination mid-flight never starts a
  // second flight: the one in the air turns toward it from where it is, so the
  // last destination chosen is where the camera lands, and exactly once.
  function controller({ start = "work", now, schedule, cancel, reduced = () => false, onFrame, onPhase, onDepart, onRetarget, onSettle }) {
    let settled = WORLD[start] ? start : "work",
      flight = null,
      source = null,
      t0 = 0,
      handle = 0,
      phase = "SETTLED",
      pose = settledCamera(settled),
      frames = 0;
    const tauNow = () => (flight ? clamp((now() - t0) / flight.duration, 0, 1) : 1);
    function velocity() {
      const tau = tauNow(),
        step = 1 / Math.max(1, flight.duration / 16);
      const a = sample(flight, Math.min(tau, 1 - step)),
        b = sample(flight, Math.min(tau, 1 - step) + step);
      const ms = step * flight.duration;
      return { x: (b.x - a.x) / ms, y: (b.y - a.y) / ms, z: (b.z - a.z) / ms };
    }
    function enter(next) {
      if (next === phase) return;
      phase = next;
      onPhase?.(phase, flight, source);
    }
    function tick() {
      handle = 0;
      if (!flight) return;
      const tau = tauNow();
      pose = sample(flight, tau);
      frames++;
      enter(phaseAt(flight, tau));
      onFrame?.(pose, flight, tau, source);
      if (tau >= 1) finish();
      else handle = schedule(tick);
    }
    function finish() {
      const done = flight;
      flight = null;
      settled = done.target;
      pose = settledCamera(settled);
      onFrame?.(pose, null, 1, source);
      enter("SETTLED");
      const from = source;
      source = null;
      onSettle?.(settled, from, done);
    }
    function go(id) {
      if (!WORLD[id]) return false;
      if (!flight) {
        if (id === settled) return false;
        source = settled;
        flight = plan(settledCamera(settled), id, { reduced: reduced() });
        t0 = now();
        phase = "IDLE";
        onDepart?.(source, id, flight);
        tick();
        return true;
      }
      if (id === flight.target) return false;
      const tau = tauNow();
      const here = sample(flight, tau);
      flight = plan(here, id, { reduced: reduced(), velocity: velocity() });
      t0 = now();
      onRetarget?.(id, flight, source);
      if (!handle) handle = schedule(tick);
      return true;
    }
    // A hidden tab gets no frames; land at once rather than hang in the air.
    function complete() {
      if (!flight) return;
      if (handle) cancel(handle);
      handle = 0;
      finish();
    }
    return {
      go,
      complete,
      get state() {
        return phase;
      },
      get current() {
        return settled;
      },
      get target() {
        return flight ? flight.target : null;
      },
      get flying() {
        return !!flight;
      },
      get frames() {
        return frames;
      },
      pose: () => ({ ...pose }),
    };
  }

  /* ---------------------------------------------------------------- the art */
  // Each island is painted once as an image; only its placement moves.
  const ART = {
    work: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000">
<defs>
<linearGradient id="rock" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe0a6"/><stop offset=".16" stop-color="#dba263"/><stop offset=".46" stop-color="#946468"/><stop offset=".78" stop-color="#434075"/><stop offset="1" stop-color="#1d2152"/></linearGradient>
<linearGradient id="shade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0d1640" stop-opacity=".62"/><stop offset=".45" stop-color="#0d1640" stop-opacity="0"/><stop offset=".8" stop-color="#fff3c8" stop-opacity="0"/><stop offset="1" stop-color="#fff3c8" stop-opacity=".26"/></linearGradient>
<linearGradient id="grass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9f59a"/><stop offset=".6" stop-color="#7fcf6f"/><stop offset="1" stop-color="#4b9a60"/></linearGradient>
<linearGradient id="gem" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6feff"/><stop offset=".42" stop-color="#86e6ff"/><stop offset="1" stop-color="#2d62ea"/></linearGradient>
<linearGradient id="fall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#effcff"/><stop offset=".55" stop-color="#86d8f5" stop-opacity=".9"/><stop offset="1" stop-color="#86d8f5" stop-opacity="0"/></linearGradient>
<linearGradient id="roof" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="1" stop-color="#dc8a2c"/></linearGradient>
<linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff4dc"/><stop offset="1" stop-color="#e2c79a"/></linearGradient>
<radialGradient id="glow"><stop offset="0" stop-color="#fffbe0"/><stop offset=".35" stop-color="#9eeaff" stop-opacity=".7"/><stop offset="1" stop-color="#9eeaff" stop-opacity="0"/></radialGradient>
<radialGradient id="warm"><stop offset="0" stop-color="#fff2b8"/><stop offset="1" stop-color="#ffc85a" stop-opacity="0"/></radialGradient>
<radialGradient id="vein"><stop offset="0" stop-color="#d8f8ff" stop-opacity=".7"/><stop offset="1" stop-color="#7fd8ff" stop-opacity="0"/></radialGradient>
<clipPath id="mass"><path d="M160 338C226 380 250 432 322 474C364 522 352 562 424 604C476 644 506 704 566 746C606 796 646 852 704 884C744 932 772 986 806 992C842 982 862 932 892 892C952 852 992 792 1042 744C1092 704 1132 654 1182 614C1242 574 1254 524 1304 484C1364 444 1384 392 1440 338Z"/></clipPath>
</defs>
<g fill="#1b2152" opacity=".55"><path d="M96 560l52-16 40 20-30 52-46-14z"/><path d="M1490 640l44-10 32 16-26 40-38-10z"/><path d="M1400 820l26-6 20 10-16 24-24-6z"/></g>
<g fill="url(#rock)"><path d="M100 548l50-14 38 18-28 48-44-12z"/><path d="M1494 628l42-9 30 15-24 37-36-9z"/><path d="M1404 810l24-5 18 9-14 22-22-5z"/></g>
<path fill="url(#rock)" d="M160 338C226 380 250 432 322 474C364 522 352 562 424 604C476 644 506 704 566 746C606 796 646 852 704 884C744 932 772 986 806 992C842 982 862 932 892 892C952 852 992 792 1042 744C1092 704 1132 654 1182 614C1242 574 1254 524 1304 484C1364 444 1384 392 1440 338Z"/>
<g clip-path="url(#mass)">
<g fill="none" stroke="#2b1a3a" stroke-opacity=".2" stroke-width="7"><path d="M140 430C380 462 600 408 800 448S1210 426 1460 408"/><path d="M140 540C420 578 640 514 820 556S1180 534 1460 520"/><path d="M140 664C420 686 650 642 830 684S1160 662 1460 652"/><path d="M140 800C430 820 660 778 840 820S1150 798 1460 788"/></g>
<path fill="url(#shade)" d="M0 300H1600V1000H0z"/>
<g fill="url(#vein)"><circle cx="588" cy="566" r="34"/><circle cx="1026" cy="646" r="28"/><circle cx="780" cy="796" r="22"/></g>
<g fill="url(#gem)"><path d="M578 584l11-30 10 31-11 15z"/><path d="M596 588l6-15 6 16-6 7z"/><path d="M1018 662l9-24 11 26-10 12z"/><path d="M774 810l8-21 9 22-8 10z"/></g>
</g>
<g fill="none" stroke="#5a4636" stroke-width="5" stroke-linecap="round" opacity=".6"><path d="M424 606c-12 42 6 74-8 118"/><path d="M1182 616c14 46-4 84 10 126"/><path d="M704 886c-6 32 8 54-2 86"/><path d="M1300 488c10 30-2 58 8 88"/></g>
<path fill="#3f7f52" d="M160 338Q800 456 1440 338V366Q800 486 160 366Z"/>
<ellipse cx="800" cy="336" rx="640" ry="62" fill="url(#grass)"/>
<path fill="#e9d3a0" opacity=".85" d="M720 388Q800 380 880 388L860 350Q800 346 740 350Z"/>
<ellipse cx="438" cy="336" rx="124" ry="22" fill="#9ae6ff"/>
<ellipse cx="438" cy="332" rx="96" ry="12" fill="#e9fbff" opacity=".7"/>
<path fill="url(#fall)" d="M392 372C388 468 384 570 396 720H474C462 570 462 468 468 372Z"/>
<path fill="#fff" opacity=".5" d="M406 372C404 450 402 530 408 640H420C416 530 416 450 418 372Z"/>
<ellipse cx="434" cy="372" rx="54" ry="10" fill="#f4fdff" opacity=".8"/>
<g><rect x="1110" y="286" width="12" height="52" fill="#6b4a33"/><circle cx="1116" cy="268" r="40" fill="#5fbf70"/><circle cx="1094" cy="284" r="26" fill="#4ea662"/><circle cx="1138" cy="288" r="24" fill="#6fd07c"/></g>
<g><rect x="266" y="292" width="10" height="46" fill="#6b4a33"/><circle cx="271" cy="276" r="32" fill="#63c273"/><circle cx="254" cy="290" r="20" fill="#4ea662"/></g>
<g fill="url(#gem)"><path d="M1236 340l22-84 22 84z"/><path d="M1270 340l14-50 14 50z"/><path d="M1212 340l12-40 12 40z"/><path d="M176 346l16-56 16 56z"/><path d="M204 346l10-34 10 34z"/></g>
<circle cx="706" cy="160" r="150" fill="url(#glow)"/>
<path fill="#d9b88a" d="M668 344L684 176H730L746 344Z"/>
<path fill="#b88f5e" d="M684 176H730L722 150H692Z"/>
<path fill="#f3dcb2" d="M684 176L668 344H690L700 176Z"/>
<rect x="696" y="220" width="22" height="34" rx="11" fill="#86e6ff"/>
<path fill="url(#gem)" d="M707 18L752 104L707 156L662 104Z"/>
<path fill="#fff" opacity=".45" d="M707 18V156L662 104Z"/>
<path fill="#1f4fc8" opacity=".25" d="M707 18L752 104L707 156Z"/>
<g fill="none" stroke="#bdf3ff" stroke-width="4" stroke-dasharray="8 12" opacity=".85"><path d="M712 150C790 196 870 196 960 160"/><path d="M700 160C620 200 540 214 470 206"/></g>
<rect x="846" y="226" width="236" height="118" fill="url(#wall)"/>
<rect x="846" y="304" width="236" height="40" fill="#c7a26c"/>
<path fill="#a4804f" d="M846 304H1082V312H846Z"/>
<path fill="url(#roof)" d="M824 236L964 150L1104 236Z"/>
<path fill="#fff3b8" opacity=".5" d="M824 236L964 150V164L842 240Z"/>
<rect x="1040" y="152" width="24" height="62" fill="#8a6a55"/>
<circle cx="1052" cy="140" r="16" fill="#fff" opacity=".35"/>
<circle cx="964" cy="196" r="20" fill="#ffe7a0"/>
<rect x="876" y="252" width="46" height="44" rx="7" fill="#86e6ff"/>
<rect x="1004" y="252" width="46" height="44" rx="7" fill="#ffd97a"/>
<path fill="#6b4a33" d="M944 344V294Q964 270 984 294V344Z"/>
<circle cx="990" cy="276" r="60" fill="url(#warm)" opacity=".55"/>
<g transform="translate(1146 318)"><circle r="30" fill="none" stroke="#d6a453" stroke-width="10" stroke-dasharray="9 8"/><circle r="10" fill="#d6a453"/></g>
</svg>`,
    result: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000">
<defs>
<linearGradient id="rock" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffc79a"/><stop offset=".18" stop-color="#d9837a"/><stop offset=".48" stop-color="#8e4c74"/><stop offset=".8" stop-color="#43285e"/><stop offset="1" stop-color="#1c1236"/></linearGradient>
<linearGradient id="shade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1a0c2c" stop-opacity=".6"/><stop offset=".5" stop-color="#1a0c2c" stop-opacity="0"/><stop offset="1" stop-color="#ffd9a0" stop-opacity=".3"/></linearGradient>
<linearGradient id="meadow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe39a"/><stop offset=".6" stop-color="#e0ad5c"/><stop offset="1" stop-color="#a8703e"/></linearGradient>
<linearGradient id="gold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b8782a"/><stop offset=".35" stop-color="#ffe7a0"/><stop offset=".6" stop-color="#f2b84c"/><stop offset="1" stop-color="#a86a22"/></linearGradient>
<linearGradient id="dome" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff2c0"/><stop offset=".5" stop-color="#f4bd52"/><stop offset="1" stop-color="#a8641e"/></linearGradient>
<radialGradient id="sun"><stop offset="0" stop-color="#fff4cf"/><stop offset=".4" stop-color="#ffc26e" stop-opacity=".75"/><stop offset="1" stop-color="#ff8a5c" stop-opacity="0"/></radialGradient>
<radialGradient id="inner"><stop offset="0" stop-color="#fff0b0"/><stop offset="1" stop-color="#ffb24a" stop-opacity="0"/></radialGradient>
<linearGradient id="goldfall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2bf"/><stop offset=".6" stop-color="#ffcc6e" stop-opacity=".75"/><stop offset="1" stop-color="#ffcc6e" stop-opacity="0"/></linearGradient>
<clipPath id="mass"><path d="M150 342C214 392 262 440 332 480C392 540 402 596 470 640C520 690 560 740 610 790C660 850 716 900 770 960C800 990 826 992 846 962C904 900 956 846 1002 790C1060 736 1110 690 1160 640C1226 590 1266 530 1320 480C1380 432 1410 390 1452 342Z"/></clipPath>
</defs>
<circle cx="800" cy="262" r="260" fill="url(#sun)"/>
<g fill="url(#rock)"><path d="M86 610l56-18 44 22-32 56-50-16z"/><path d="M1500 560l46-12 34 18-26 42-40-12z"/></g>
<path fill="url(#rock)" d="M150 342C214 392 262 440 332 480C392 540 402 596 470 640C520 690 560 740 610 790C660 850 716 900 770 960C800 990 826 992 846 962C904 900 956 846 1002 790C1060 736 1110 690 1160 640C1226 590 1266 530 1320 480C1380 432 1410 390 1452 342Z"/>
<g clip-path="url(#mass)">
<g fill="none" stroke="#2a0f2a" stroke-opacity=".22" stroke-width="8"><path d="M130 440C390 474 610 420 800 460S1210 438 1470 420"/><path d="M130 560C410 596 640 532 820 574S1180 552 1470 540"/><path d="M130 700C420 720 650 676 830 718S1160 696 1470 686"/></g>
<path fill="url(#shade)" d="M0 300H1600V1000H0z"/>
<g fill="#ffd27a" opacity=".55"><path d="M600 560l20-44 16 46-18 22z"/><path d="M980 640l16-40 18 44-16 20z"/></g>
</g>
<path fill="url(#goldfall)" d="M1188 376C1184 460 1180 560 1190 690H1238C1230 560 1230 460 1234 376Z"/>
<path fill="#8a5a36" d="M150 342Q800 460 1452 342V370Q800 492 150 370Z"/>
<ellipse cx="800" cy="340" rx="652" ry="64" fill="url(#meadow)"/>
<g fill="#2c3a2c"><ellipse cx="222" cy="262" rx="22" ry="80"/><ellipse cx="262" cy="282" rx="18" ry="62"/><ellipse cx="1368" cy="262" rx="22" ry="80"/><ellipse cx="1330" cy="284" rx="17" ry="58"/></g>
<g fill="#3e5236" opacity=".7"><ellipse cx="214" cy="250" rx="10" ry="60"/><ellipse cx="1360" cy="250" rx="10" ry="60"/></g>
<path fill="#e7b870" d="M500 344H1100L1070 318H530Z"/>
<path fill="#f3cd86" d="M540 318H1060L1034 294H566Z"/>
<path fill="#ffe0a2" d="M576 294H1024L1002 272H598Z"/>
<path fill="url(#dome)" d="M690 158Q690 92 800 86Q910 92 910 158Z"/>
<path fill="#fff6d0" opacity=".45" d="M712 154Q716 110 790 98Q736 118 732 154Z"/>
<rect x="794" y="52" width="12" height="40" fill="#f4bd52"/>
<path fill="#fff4c0" d="M800 6L808 24L828 25L812 37L818 56L800 45L782 56L788 37L772 25L792 24Z"/>
<rect x="606" y="196" width="388" height="76" fill="#5a2c24" opacity=".55"/>
<circle cx="800" cy="236" r="120" fill="url(#inner)"/>
<g fill="url(#gold)"><rect x="612" y="192" width="30" height="80"/><rect x="684" y="192" width="30" height="80"/><rect x="756" y="192" width="30" height="80"/><rect x="814" y="192" width="30" height="80"/><rect x="886" y="192" width="30" height="80"/><rect x="958" y="192" width="30" height="80"/></g>
<path fill="#f7c35c" d="M586 196H1014L990 178H610Z"/>
<path fill="url(#gold)" d="M598 178L800 118L1002 178Z"/>
<g stroke="#8a5a36" stroke-width="5"><path d="M450 344V190"/><path d="M1150 344V190"/></g>
<path fill="#e4574a" d="M452 194H510L494 214L510 234H452Z"/>
<path fill="#e4574a" d="M1148 194H1090L1106 214L1090 234H1148Z"/>
<g fill="#ffe7a0"><circle cx="520" cy="330" r="9"/><circle cx="1080" cy="330" r="9"/><path d="M330 330l12-26 12 26z"/><path d="M1258 330l12-26 12 26z"/></g>
</svg>`,
    short: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000">
<defs>
<linearGradient id="rock" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c7b8ff"/><stop offset=".18" stop-color="#8a6fe8"/><stop offset=".5" stop-color="#4b36a8"/><stop offset=".8" stop-color="#231a66"/><stop offset="1" stop-color="#0f0c34"/></linearGradient>
<linearGradient id="shade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#07061e" stop-opacity=".62"/><stop offset=".5" stop-color="#07061e" stop-opacity="0"/><stop offset="1" stop-color="#9fe8ff" stop-opacity=".28"/></linearGradient>
<linearGradient id="plaza" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9f8cf0"/><stop offset=".6" stop-color="#6a55c8"/><stop offset="1" stop-color="#3e2e8e"/></linearGradient>
<linearGradient id="spire" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5a3fd0"/><stop offset=".45" stop-color="#e9e2ff"/><stop offset=".62" stop-color="#9f86ff"/><stop offset="1" stop-color="#3a2a9e"/></linearGradient>
<linearGradient id="trail" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6ff0ff" stop-opacity="0"/><stop offset=".5" stop-color="#b8f8ff"/><stop offset="1" stop-color="#ff7ae6" stop-opacity="0"/></linearGradient>
<radialGradient id="orb"><stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="#e0b8ff" stop-opacity=".85"/><stop offset="1" stop-color="#a070ff" stop-opacity="0"/></radialGradient>
<clipPath id="mass"><path d="M170 344C236 396 290 444 350 496C410 548 440 604 500 650C556 700 590 760 640 810C690 862 730 910 772 972C798 1000 824 998 842 968C880 906 924 850 976 800C1030 750 1076 700 1128 652C1190 600 1236 548 1290 496C1350 446 1400 396 1430 344Z"/></clipPath>
</defs>
<circle cx="760" cy="270" r="260" fill="url(#orb)" opacity=".5"/>
<g fill="url(#rock)"><path d="M104 520l52-16 40 20-30 52-46-14z"/><path d="M1470 690l44-10 32 16-26 40-38-10z"/><path d="M1350 160l34-8 24 12-20 30-28-8z"/></g>
<path fill="url(#rock)" d="M170 344C236 396 290 444 350 496C410 548 440 604 500 650C556 700 590 760 640 810C690 862 730 910 772 972C798 1000 824 998 842 968C880 906 924 850 976 800C1030 750 1076 700 1128 652C1190 600 1236 548 1290 496C1350 446 1400 396 1430 344Z"/>
<g clip-path="url(#mass)">
<g fill="none" stroke="#05041a" stroke-opacity=".25" stroke-width="7"><path d="M140 450C380 480 600 426 800 468S1210 444 1460 428"/><path d="M140 580C420 616 640 552 820 594S1180 572 1460 560"/><path d="M140 720C420 740 650 696 830 738S1160 716 1460 706"/></g>
<path fill="url(#shade)" d="M0 300H1600V1000H0z"/>
<g fill="none" stroke-width="5" stroke-linecap="round"><path stroke="#ff7ae6" opacity=".7" d="M520 560l40-30 30 40 44-34"/><path stroke="#6ff0ff" opacity=".7" d="M980 660l30-40 34 30 30-36"/><path stroke="#d9c8ff" opacity=".5" d="M720 820l26-20 22 26"/></g>
</g>
<path fill="#2e2270" d="M170 344Q800 462 1430 344V372Q800 494 170 372Z"/>
<ellipse cx="800" cy="342" rx="632" ry="62" fill="url(#plaza)"/>
<g fill="none" stroke="#b8f8ff" stroke-opacity=".55" stroke-width="3"><ellipse cx="800" cy="342" rx="520" ry="46"/><ellipse cx="800" cy="342" rx="380" ry="32"/></g>
<g fill="none" stroke="url(#trail)" stroke-width="10" stroke-linecap="round"><path d="M230 300C420 200 640 250 800 180S1180 120 1380 190"/><path d="M280 250C470 150 700 190 860 120S1200 90 1400 140" stroke-width="6" opacity=".75"/></g>
<ellipse cx="760" cy="120" rx="190" ry="40" fill="none" stroke="#e0d4ff" stroke-width="6" opacity=".8" transform="rotate(-12 760 120)"/>
<ellipse cx="760" cy="220" rx="140" ry="28" fill="none" stroke="#6ff0ff" stroke-width="5" opacity=".7" transform="rotate(10 760 220)"/>
<path fill="url(#spire)" d="M734 344L760 10L786 344Z"/>
<path fill="#fff" opacity=".5" d="M760 10L752 344H742Z"/>
<circle cx="760" cy="60" r="26" fill="#ffffff"/>
<circle cx="760" cy="60" r="58" fill="url(#orb)"/>
<g transform="translate(1110 250)"><circle r="78" fill="none" stroke="#c9b8ff" stroke-width="16"/><circle r="78" fill="none" stroke="#3a2a9e" stroke-width="16" stroke-dasharray="22 18"/><circle r="46" fill="#1a1450"/><path d="M-14 -22L26 0L-14 22Z" fill="#6ff0ff"/></g>
<rect x="1104" y="326" width="12" height="20" fill="#3a2a9e"/>
<g fill="#6ff0ff"><path d="M360 344l16-70 16 70z"/><path d="M392 344l10-40 10 40z"/></g>
<g fill="#ff7ae6"><path d="M1236 344l18-80 18 80z"/><path d="M1270 344l10-44 10 44z"/></g>
<g fill="none" stroke="#e9e2ff" stroke-width="4" stroke-linecap="round" opacity=".8"><path d="M470 300h80"/><path d="M430 316h120"/><path d="M1200 290h-70"/><path d="M1240 306h-110"/></g>
</svg>`,
    "short-result": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000">
<defs>
<linearGradient id="rock" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b9c8f2"/><stop offset=".16" stop-color="#6d7fc4"/><stop offset=".48" stop-color="#33407e"/><stop offset=".8" stop-color="#161c48"/><stop offset="1" stop-color="#070a24"/></linearGradient>
<linearGradient id="shade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#02041a" stop-opacity=".65"/><stop offset=".5" stop-color="#02041a" stop-opacity="0"/><stop offset="1" stop-color="#e6eeff" stop-opacity=".3"/></linearGradient>
<linearGradient id="lawn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a9c4f0"/><stop offset=".6" stop-color="#5f80c0"/><stop offset="1" stop-color="#34508a"/></linearGradient>
<linearGradient id="river" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f8ff"/><stop offset=".5" stop-color="#9fc0ff" stop-opacity=".8"/><stop offset="1" stop-color="#9fc0ff" stop-opacity="0"/></linearGradient>
<linearGradient id="roof" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#48568e"/><stop offset="1" stop-color="#1e2656"/></linearGradient>
<radialGradient id="lamp"><stop offset="0" stop-color="#fff2c0"/><stop offset=".4" stop-color="#ffb65c" stop-opacity=".8"/><stop offset="1" stop-color="#ff9a3c" stop-opacity="0"/></radialGradient>
<radialGradient id="moonlight"><stop offset="0" stop-color="#eaf1ff" stop-opacity=".9"/><stop offset="1" stop-color="#9fb8ff" stop-opacity="0"/></radialGradient>
<clipPath id="mass"><path d="M164 340C232 388 270 440 340 486C396 536 420 590 486 636C540 686 580 740 626 796C676 850 724 904 770 968C798 996 826 996 846 964C890 902 940 846 990 792C1046 740 1092 690 1144 640C1206 590 1244 536 1300 486C1362 438 1398 390 1440 340Z"/></clipPath>
</defs>
<circle cx="1040" cy="232" r="220" fill="url(#moonlight)" opacity=".6"/>
<g fill="url(#rock)"><path d="M92 590l54-16 42 20-30 54-48-14z"/><path d="M1498 520l44-10 32 16-26 40-38-10z"/></g>
<path fill="url(#rock)" d="M164 340C232 388 270 440 340 486C396 536 420 590 486 636C540 686 580 740 626 796C676 850 724 904 770 968C798 996 826 996 846 964C890 902 940 846 990 792C1046 740 1092 690 1144 640C1206 590 1244 536 1300 486C1362 438 1398 390 1440 340Z"/>
<g clip-path="url(#mass)">
<g fill="none" stroke="#000" stroke-opacity=".22" stroke-width="7"><path d="M140 440C380 470 600 418 800 458S1210 436 1460 418"/><path d="M140 566C420 600 640 538 820 580S1180 558 1460 546"/><path d="M140 704C420 724 650 680 830 722S1160 700 1460 690"/></g>
<path fill="url(#shade)" d="M0 300H1600V1000H0z"/>
<g fill="#dfe8ff"><circle cx="560" cy="560" r="3"/><circle cx="640" cy="640" r="2.5"/><circle cx="1010" cy="600" r="3"/><circle cx="880" cy="760" r="2.5"/><circle cx="720" cy="700" r="2"/><circle cx="1100" cy="700" r="2"/></g>
</g>
<path fill="url(#river)" d="M556 372C540 440 590 500 560 580C534 650 590 720 572 820H622C640 720 590 650 612 580C640 500 592 440 606 372Z"/>
<g fill="#fff"><circle cx="578" cy="430" r="4"/><circle cx="572" cy="520" r="3.5"/><circle cx="590" cy="610" r="3"/><circle cx="584" cy="700" r="3"/><circle cx="596" cy="780" r="2.5"/></g>
<path fill="#253866" d="M164 340Q800 458 1440 340V368Q800 490 164 368Z"/>
<ellipse cx="800" cy="338" rx="638" ry="62" fill="url(#lawn)"/>
<ellipse cx="582" cy="344" rx="92" ry="18" fill="#cfe0ff"/>
<ellipse cx="582" cy="341" rx="64" ry="9" fill="#fff" opacity=".8"/>
<g><circle cx="300" cy="258" r="46" fill="#dfe8ff" opacity=".85"/><circle cx="276" cy="276" r="30" fill="#c3d3f6"/><rect x="294" y="284" width="10" height="56" fill="#3a4470"/><circle cx="1330" cy="262" r="42" fill="#dfe8ff" opacity=".85"/><circle cx="1354" cy="280" r="28" fill="#c3d3f6"/><rect x="1324" y="288" width="10" height="52" fill="#3a4470"/></g>
<g transform="translate(1080 230)"><circle r="92" fill="none" stroke="#dfe6f8" stroke-width="22"/><circle r="92" fill="none" stroke="#8a97c4" stroke-width="6"/><rect x="-104" y="92" width="208" height="20" fill="#8a97c4"/><path fill="#fff6d0" d="M0 -34L9 -10L34 -9L14 6L21 30L0 16L-21 30L-14 6L-34 -9L-9 -10Z"/></g>
<rect x="760" y="206" width="170" height="134" fill="#2c3a6e"/>
<g fill="url(#lamp)"><rect x="784" y="236" width="34" height="46" rx="5"/><rect x="872" y="236" width="34" height="46" rx="5"/></g>
<path fill="#1a2350" d="M826 340V290Q845 270 864 290V340Z"/>
<path fill="url(#roof)" d="M722 212Q845 150 968 212L948 190Q845 136 742 190Z"/>
<rect x="782" y="130" width="126" height="62" fill="#2c3a6e"/>
<path fill="url(#roof)" d="M752 136Q845 80 938 136L920 116Q845 70 770 116Z"/>
<path fill="#e6eeff" d="M845 40L852 80H838Z"/>
<g fill="url(#lamp)"><circle cx="742" cy="222" r="26"/><circle cx="948" cy="222" r="26"/><circle cx="770" cy="146" r="20"/><circle cx="920" cy="146" r="20"/></g>
<g fill="#ffcf7a"><circle cx="742" cy="222" r="7"/><circle cx="948" cy="222" r="7"/><circle cx="770" cy="146" r="6"/><circle cx="920" cy="146" r="6"/></g>
<g fill="url(#lamp)" opacity=".85"><circle cx="420" cy="310" r="18"/><circle cx="1210" cy="316" r="18"/></g>
</svg>`,
    islet: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 200">
<defs><linearGradient id="r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9c7b0"/><stop offset=".5" stop-color="#7a6680"/><stop offset="1" stop-color="#2a2548"/></linearGradient>
<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b6e88e"/><stop offset="1" stop-color="#5a9a62"/></linearGradient></defs>
<path fill="url(#r)" d="M30 92C54 110 70 126 90 150C108 172 124 190 136 196C150 188 164 168 178 146C196 124 214 108 232 92Z"/>
<ellipse cx="131" cy="92" rx="102" ry="16" fill="url(#g)"/>
<rect x="150" y="54" width="7" height="36" fill="#6b4a33"/><circle cx="153" cy="46" r="22" fill="#6cc47a"/><circle cx="140" cy="56" r="14" fill="#58ad67"/>
<path fill="#9eeaff" d="M92 92l10-34 10 34z"/>
</svg>`,
    flock: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 90"><g fill="none" stroke="#1c2448" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity=".7"><path d="M20 40q12-12 22 0q10-12 22 0"/><path d="M90 20q10-10 18 0q8-10 18 0"/><path d="M120 60q9-9 16 0q7-9 16 0"/><path d="M170 34q8-8 14 0q6-8 14 0"/></g></svg>`,
  };
  const svgUrl = (name) => 'url("data:image/svg+xml,' + encodeURIComponent(ART[name]) + '")';

  // A small deterministic sequence: every load builds the same sky.
  function noise(seed) {
    let value = (seed * 2654435761) >>> 0 || 1;
    return () => {
      value ^= value << 13;
      value ^= value >>> 17;
      value ^= value << 5;
      value >>>= 0;
      return value / 4294967296;
    };
  }
  // The cloud sea under the islands, a few high banks and loose clouds between.
  function clouds(seed = 29) {
    const r = noise(seed),
      list = [];
    for (let i = 0; i < 26; i++)
      list.push({ x: -3200 + r() * 16000, y: 900 + r() * 520, z: -900 + r() * 7200, w: 1300 + r() * 1500, alpha: 0.7 + r() * 0.3, sea: true });
    for (let i = 0; i < 10; i++)
      list.push({ x: -2400 + r() * 14400, y: -1900 + r() * 900, z: 1200 + r() * 6000, w: 900 + r() * 900, alpha: 0.45 + r() * 0.3 });
    for (let i = 0; i < 12; i++)
      list.push({ x: 900 + r() * 7800, y: -500 + r() * 1100, z: -1500 + r() * 2600, w: 520 + r() * 520, alpha: 0.55 + r() * 0.3 });
    return list;
  }
  function islets(seed = 71) {
    const r = noise(seed),
      list = [];
    for (let i = 0; i < 9; i++)
      list.push({ art: "islet", x: -1600 + r() * 12600, y: -900 + r() * 1300, z: 1800 + r() * 3800, w: 260, h: 200, ax: 131, ay: 92, flip: r() > 0.5 });
    for (let i = 0; i < 4; i++)
      list.push({ art: "flock", x: 800 + r() * 8000, y: -1100 + r() * 700, z: 600 + r() * 2400, w: 220, h: 90, ax: 110, ay: 45, flip: r() > 0.5 });
    return list;
  }

  // Residents live in the sky around the islands, and each island flies its own
  // way: brooms over the workshop, light birds over the temple, boards past the
  // speed tower and little star clouds under the moon.
  const RIDES = Object.freeze({ work: "broom", result: "bird", short: "board", "short-result": "cloud" });
  const FLYERS_PER_ISLAND = 3;
  // Where each island's residents cruise, relative to the island: out beside it
  // and behind it, in the air the decks leave open, never in front of the work.
  const FLIGHTS = {
    work: [{ x: -1320, y: -30, z: 900 }, { x: 1700, y: 130, z: 1500 }, { x: -420, y: -300, z: 2700 }],
    result: [{ x: 1380, y: -80, z: 1000 }, { x: -1700, y: 150, z: 1700 }, { x: 460, y: -330, z: 2900 }],
    short: [{ x: -1380, y: 30, z: 800 }, { x: 1650, y: -60, z: 1400 }, { x: -260, y: -280, z: 2500 }],
    "short-result": [{ x: 1320, y: -110, z: 900 }, { x: -1650, y: 70, z: 1600 }, { x: 560, y: -360, z: 3100 }],
  };
  // Hands each island up to three residents from its own projects, nobody twice.
  // An island with too few borrows from the residents others had no room for.
  function crew(pools, quota = FLYERS_PER_ISLAND) {
    const used = new Set(),
      out = {},
      spare = [];
    for (const id of ISLAND_IDS) {
      out[id] = [];
      for (const c of pools?.[id] || []) {
        if (!c?.name || used.has(c.name)) continue;
        if (out[id].length < quota) {
          out[id].push(c);
          used.add(c.name);
        } else spare.push(c);
      }
    }
    for (const id of ISLAND_IDS)
      while (out[id].length < Math.min(2, quota) && spare.length) {
        const c = spare.shift();
        if (used.has(c.name)) continue;
        out[id].push(c);
        used.add(c.name);
      }
    return out;
  }

  const api = {
    EDGE,
    onStage,
    side,
    World: {
      RIDES,
      FLIGHTS,
      FLYERS_PER_ISLAND,
      crew,
      FOCAL,
      NEAR,
      ISLAND_IDS,
      WORLD,
      NAMES,
      viewport,
      settledCamera,
      project,
      plan,
      progress,
      sample,
      phaseAt,
      reveal,
      tints,
      dockPosition,
      controller,
      clouds,
      islets,
      ART,
    },
  };
  scope.CreatorTransitions = api;
  scope.CreatorWorld = api.World;
  if (typeof module !== "undefined") module.exports = api;
  if (typeof document === "undefined") return;

  /* --------------------------------------------------- staged rooms, in page */
  if (typeof IntersectionObserver === "function") {
    const watched = new WeakSet();
    const height = () => window.innerHeight || document.documentElement.clientHeight;
    // The side is kept while on stage, so a room leaves the way it came until the
    // scroll direction says otherwise.
    const place = (el, where) => {
      if (where) el.dataset.stageSide = where;
      el.classList.toggle("is-on-stage", !where);
    };
    // Settle without animating: first paint, and jumps the page makes on purpose.
    const settle = (el, where) => {
      el.classList.add("is-stage-instant");
      place(el, where);
      void el.offsetHeight;
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove("is-stage-instant")));
    };
    // A fast fling or a jump can carry a hidden room clean past the stage with no
    // report in between, so it would come back from the side it left by. Before it
    // enters, turn it to face the way it is really coming from.
    const turn = (el, where) => {
      el.classList.add("is-stage-instant");
      el.dataset.stageSide = where;
      void el.offsetHeight;
      el.classList.remove("is-stage-instant");
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target,
            from = side(entry.boundingClientRect, height());
          if (!entry.isIntersecting) place(el, from);
          else {
            if (!el.classList.contains("is-on-stage") && el.dataset.stageSide !== from) turn(el, from);
            place(el, null);
          }
        }
      },
      { rootMargin: `-${EDGE * 100}% 0px -${EDGE * 100}% 0px` },
    );
    api.watch = (el) => {
      if (!el || watched.has(el)) return;
      watched.add(el);
      el.classList.add("co-stage");
      const rect = el.getBoundingClientRect();
      settle(el, onStage(rect, height()) ? null : side(rect, height()));
      observer.observe(el);
    };
    // Before scrolling to a room, bring it on stage at once: a scroll aimed at a
    // box still sliding in would land short by the length of the slide.
    api.show = (el) => {
      const room = el?.closest?.(".co-stage");
      if (room && !room.classList.contains("is-on-stage")) settle(room, null);
    };
  }

  /* ------------------------------------------------------ the world, in page */
  const make = (tag, cls, parent) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    parent?.append(e);
    return e;
  };
  const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)") || { matches: false, addEventListener() {} };

  function mount({ host, hud, decks, labels = {}, start = "work" }) {
    const stage = make("section", "cw-stage");
    stage.id = "co-world";
    stage.setAttribute("aria-label", "空島工作世界");
    // The sky holds still on the screen while the page scrolls the floor over
    // it, so nothing on the floor is ever cut off by a frame of its own. It
    // rides a track as tall as the stage, so where the stage ends the sky ends
    // with it, fading out, instead of spilling over the room below.
    const skyTrack = make("div", "cw-sky-track", stage);
    const sky = make("div", "cw-sky", skyTrack);
    sky.setAttribute("aria-hidden", "true");
    const view = make("div", "cw-view", sky);
    view.setAttribute("aria-hidden", "true");
    const backdrop = make("div", "cw-backdrop", view);
    const tintLayers = ISLAND_IDS.map((id) => {
      const t = make("div", "cw-tint", backdrop);
      t.dataset.island = id;
      return t;
    });
    make("div", "cw-horizon", backdrop);
    make("div", "cw-stardust", backdrop);
    const world = make("div", "cw-world", view);
    const canvas = make("canvas", "cw-dust", view);
    const ctx = canvas.getContext?.("2d") || null;
    // The task cloud leads the floor, ahead of every deck. It belongs to no
    // island, so a flight never takes it away; reading down an island's deck
    // simply scrolls past it.
    const floor = make("div", "cw-floor", stage);
    const top = make("div", "cw-hud", floor);
    if (hud) top.append(hud);
    // How far the page has scrolled into the world, and where the cloud ends.
    const into = () => -stage.getBoundingClientRect().top;
    const cloudEnd = () => top.getBoundingClientRect().bottom - stage.getBoundingClientRect().top;
    function scrollInto(offset, smooth = false) {
      // Narrow screens scroll the body rather than the window.
      const body = document.body,
        style = getComputedStyle(body);
      const target = /(auto|scroll)/.test(style.overflowY) && body.scrollHeight > body.clientHeight + 1 ? body : window;
      target.scrollBy({ top: offset - into(), behavior: smooth && !motionQuery.matches ? "smooth" : "auto" });
    }
    const dock = make("nav", "cw-dock", stage);
    dock.setAttribute("aria-label", "空島航標");
    // The floor scrolls past the task cloud; this brings it back into view.
    const up = make("button", "cw-dock-up", dock);
    up.type = "button";
    up.textContent = "☁";
    up.title = "回到任務雲";
    up.setAttribute("aria-label", "回到任務雲");
    up.addEventListener("click", () => scrollInto(0, true));
    const track = make("div", "cw-dock-track", dock);
    track.setAttribute("aria-hidden", "true");
    const ship = make("span", "cw-dock-ship", track);
    const live = make("p", "cw-live", stage);
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");

    let current = WORLD[start] ? start : "work";
    const objects = [];
    const isles = {};
    for (const id of ISLAND_IDS) {
      const el = make("div", "cw-isle", world);
      el.dataset.island = id;
      const float = make("div", "cw-isle-float", el);
      const aura = make("div", "cw-isle-aura", float);
      const beam = make("div", "cw-isle-beam", float);
      const mist = make("div", "cw-isle-mist", float);
      const art = make("div", "cw-isle-art", float);
      art.style.backgroundImage = svgUrl(id);
      const life = make("div", "cw-isle-life", float);
      for (let i = 0; i < 6; i++) make("span", "cw-life", life).style.setProperty("--i", i);
      make("div", "cw-isle-ripple", float);
      const obj = { el, kind: "isle", id, pos: WORLD[id], w: 1600, h: 1000, ax: 800, ay: 330, shown: false, z: 0 };
      isles[id] = { el, art, mist, beam, aura, obj };
      objects.push(obj);
    }
    for (const c of clouds()) {
      const el = make("div", "cw-puff" + (c.sea ? " is-sea" : ""), world);
      objects.push({ el, kind: "cloud", pos: c, w: c.w, h: c.w * 0.42, ax: c.w / 2, ay: c.w * 0.21, alpha: c.alpha, shown: false, z: 0 });
    }
    for (const s of islets()) {
      const el = make("div", "cw-islet is-" + s.art, world);
      el.style.backgroundImage = svgUrl(s.art);
      if (s.flip) el.classList.add("is-flipped");
      objects.push({ el, kind: s.art, pos: s, w: s.w, h: s.h, ax: s.ax, ay: s.ay, shown: false, z: 0 });
    }
    const moon = make("div", "cw-moon", world);
    objects.push({ el: moon, kind: "moon", pos: { x: WORLD["short-result"].x + 1400, y: WORLD["short-result"].y - 1500, z: WORLD["short-result"].z + 5200 }, w: 520, h: 520, ax: 260, ay: 260, shown: false, z: 0 });

    const beacons = {};
    ISLAND_IDS.forEach((id, index) => {
      const b = make("button", "cw-beacon", dock);
      b.type = "button";
      b.dataset.island = id;
      b.style.setProperty("--i", index);
      const gem = make("span", "cw-gem", b);
      gem.setAttribute("aria-hidden", "true");
      make("span", "cw-gem-core", gem);
      const text = make("span", "cw-beacon-text", b);
      make("strong", "", text).textContent = labels[id] || id;
      const count = make("small", "cw-beacon-count", text);
      b.addEventListener("click", () => go(id));
      b.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const next =
          event.key === "Home" ? 0 : event.key === "End" ? ISLAND_IDS.length - 1 : clamp(index + (event.key === "ArrowLeft" ? -1 : 1), 0, ISLAND_IDS.length - 1);
        beacons[ISLAND_IDS[next]].el.focus();
      });
      beacons[id] = { el: b, count, name: labels[id] || id };
    });
    for (const [id, deck] of Object.entries(decks || {})) {
      deck.classList.add("cw-deck");
      deck.dataset.island = id;
      deck.hidden = id !== current;
      floor.append(deck);
    }

    /* ------------------------------------------------ residents of the sky */
    // Beside each island's title platform floats a resting islet with a tree, a
    // swing and flowers, shared by all of the island's residents.
    const rests = {};
    ISLAND_IDS.forEach((id, index) => {
      const slot = decks?.[id]?.querySelector(".cw-rest-slot");
      if (!slot || !scope.CreatorYard?.build) return;
      const rest = make("div", "cw-rest", slot);
      rest.dataset.island = id;
      rest.setAttribute("aria-hidden", "true");
      // An odd seed plants the tree on the left, leaving the right for the props.
      const yard = scope.CreatorYard.build({ seed: (7919 * (index + 3)) | 1 });
      make("div", "cw-rest-props", yard.querySelector(".co-yard-isle") || yard);
      rest.append(yard);
      rests[id] = { yard, timer: 0, visitor: null, turn: 0 };
    });
    let flyers = [],
      crews = {},
      crewKey = "";
    const hash = (text) => {
      let h = 2166136261;
      for (const ch of String(text)) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
      return h;
    };
    function spriteOf(character) {
      const [x, y, w, h] = character.bounds;
      const box = make("div", "cw-flyer-sprite");
      box.style.aspectRatio = `${w} / ${h}`;
      const img = make("img", "", box);
      img.alt = "";
      img.decoding = "async";
      img.draggable = false;
      img.src = "/static/renguin-characters/residents/" + character.file;
      img.style.cssText = `width:${(character.size[0] / w) * 100}%;height:${(character.size[1] / h) * 100}%;left:${(-x / w) * 100}%;top:${(-y / h) * 100}%`;
      return box;
    }
    const restFor = (name, on) => {
      for (const f of flyers) if (f.el.dataset.resident === name) f.el.classList.toggle("is-resting", on);
    };
    function sendAway(r, animate) {
      clearTimeout(r.timer);
      if (!r.visitor) return;
      const name = r.visitor.name;
      r.visitor = null;
      const finish = () => {
        scope.CreatorYard.leave(r.yard);
        restFor(name, false);
      };
      const actor = r.yard.querySelector(".co-yard-actor");
      if (animate && actor) {
        actor.classList.remove("cw-arriving");
        actor.classList.add("cw-leaving");
        setTimeout(finish, 2100);
      } else finish();
    }
    function planVisit(id, delay) {
      const r = rests[id];
      if (!r) return;
      clearTimeout(r.timer);
      r.timer = setTimeout(() => visitStep(id), delay);
    }
    // Now and then a resident glides down to the islet, rests a while and takes
    // off again. Only on the island the camera is at, and never while it flies.
    function visitStep(id) {
      const r = rests[id];
      if (!r) return;
      if (id !== control.current || control.flying || document.hidden || !stage.classList.contains("is-live"))
        return planVisit(id, 6000);
      const reduced = motionQuery.matches;
      if (r.visitor) {
        if (reduced) return;
        sendAway(r, true);
        return planVisit(id, 16000 + (hash(id + r.turn) % 12000));
      }
      const pool = crews[id] || [];
      if (!pool.length) return planVisit(id, 20000);
      const character = pool[r.turn++ % pool.length];
      const actor = scope.CreatorYard.visit(r.yard, character, hash(character.name), reduced ? 0 : 2500);
      if (!actor) return planVisit(id, 9000);
      r.visitor = character;
      restFor(character.name, true);
      if (reduced) return; // a reduced-motion visitor simply stays
      const ride = make("div", "cw-ride");
      ride.dataset.ride = RIDES[id];
      actor.querySelector(".co-yard-rig")?.prepend(ride);
      actor.classList.add("cw-arriving");
      setTimeout(() => actor.classList.remove("cw-arriving"), 2600);
      planVisit(id, 22000 + (hash(character.name) % 10000));
    }
    function setResidents(pools) {
      const next = crew(pools);
      const key = ISLAND_IDS.map((id) => next[id].map((c) => c.name).join("|")).join(";");
      if (key === crewKey) return;
      crewKey = key;
      for (const r of Object.values(rests)) sendAway(r, false);
      for (const f of flyers) {
        f.el.remove();
        objects.splice(objects.indexOf(f), 1);
      }
      flyers = [];
      crews = next;
      for (const id of ISLAND_IDS)
        next[id].forEach((character, slot) => {
          const spot = FLIGHTS[id][slot];
          const el = make("div", "cw-flyer", world);
          Object.assign(el.dataset, { island: id, ride: RIDES[id], dir: slot % 2 ? "left" : "right", resident: character.name });
          el.style.setProperty("--slot", slot);
          const rig = make("div", "cw-flyer-rig", make("div", "cw-flyer-path", make("div", "cw-flyer-mirror", el)));
          make("div", "cw-ride", rig).dataset.ride = RIDES[id];
          rig.append(spriteOf(character));
          const obj = { el, kind: "flyer", island: id, w: 300, h: 240, ax: 150, ay: 120, shown: false, z: 0 };
          obj.pos = { x: WORLD[id].x + spot.x, y: WORLD[id].y + spot.y, z: WORLD[id].z + spot.z };
          objects.push(obj);
          flyers.push(obj);
        });
      size();
      scene(control.pose(), null, 1, null);
      planVisit(control.current, motionQuery.matches ? 300 : 4000);
    }

    /* ------------------------------------------------------------- drawing */
    let vp = viewport(1440, 900),
      lift = 0,
      liftFrom = 0,
      liftTo = 0,
      particles = [],
      lastPose = null,
      dpr = 1;
    function size() {
      const rect = sky.getBoundingClientRect();
      vp = viewport(rect.width, rect.height);
      stage.style.setProperty("--u", vp.u.toFixed(4));
      for (const o of objects) {
        o.el.style.width = (o.w * vp.u).toFixed(1) + "px";
        o.el.style.height = (o.h * vp.u).toFixed(1) + "px";
        o.el.style.left = (-o.ax * vp.u).toFixed(1) + "px";
        o.el.style.top = (-o.ay * vp.u).toFixed(1) + "px";
        o.el.style.transformOrigin = `${(o.ax * vp.u).toFixed(1)}px ${(o.ay * vp.u).toFixed(1)}px`;
      }
      dpr = Math.min(1.5, window.devicePixelRatio || 1);
      canvas.width = Math.round(vp.width * dpr);
      canvas.height = Math.round(vp.height * dpr);
    }
    function show(o, on) {
      if (o.shown === on) return;
      o.shown = on;
      o.el.style.visibility = on ? "visible" : "hidden";
    }
    function place(pose) {
      for (const o of objects) {
        const p = project(o.pos, pose, vp);
        if (!p) {
          show(o, false);
          continue;
        }
        const s = p.scale,
          wpx = o.w * vp.u * s,
          hpx = o.h * vp.u * s,
          left = p.x - o.ax * vp.u * s,
          topPx = p.y - o.ay * vp.u * s;
        const margin = 80;
        if (wpx < 3 || left > vp.width + margin || left + wpx < -margin || topPx > vp.height + margin || topPx + hpx < -margin) {
          show(o, false);
          continue;
        }
        show(o, true);
        o.el.style.transform = `translate3d(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px,0) scale(${s.toFixed(4)})`;
        const z = Math.round(30000 - p.depth);
        if (z !== o.z) o.el.style.zIndex = String((o.z = z));
        let alpha = 1;
        if (o.kind === "cloud")
          alpha = o.alpha * smooth(o.transit ? 420 : 260, o.transit ? 1500 : 1000, p.depth) * (1 - smooth(9000, 17000, p.depth));
        else if (o.kind !== "isle") alpha = smooth(300, 800, p.depth) * (1 - 0.55 * smooth(3500, 9000, p.depth));
        if (o.kind !== "isle") {
          const a = alpha.toFixed(3);
          if (o.alphaText !== a) o.el.style.opacity = o.alphaText = a;
        }
        o.depth = p.depth;
      }
    }
    // Far islands sink into the haze; the destination comes out of it in order.
    function light(flight, tau, source) {
      for (const id of ISLAND_IDS) {
        const isle = isles[id],
          o = isle.obj;
        const haze = o.shown ? smooth(2600, 11000, o.depth || 0) : 1;
        let lit = 1 - 0.72 * haze,
          mist = 0,
          beam = 0;
        if (flight && id === flight.target) {
          const r = reveal(flight, tau);
          lit = Math.min(lit, 0.16 + 0.84 * r.lit);
          mist = r.mist;
          beam = r.beam;
        } else if (flight && id === source) lit = Math.max(lit, 1 - tau * 1.4);
        const key = [lit.toFixed(2), mist.toFixed(2), beam.toFixed(2)].join();
        if (isle.key === key) continue;
        isle.key = key;
        isle.art.style.filter = lit > 0.995 ? "" : `brightness(${(0.08 + 0.92 * lit).toFixed(3)}) saturate(${lit.toFixed(3)})`;
        isle.mist.style.opacity = mist.toFixed(3);
        isle.beam.style.opacity = (0.12 + 0.88 * beam).toFixed(3);
      }
    }
    function tint(pose) {
      tints(pose).forEach((w, i) => {
        tintLayers[i].style.opacity = w.toFixed(3);
      });
      ship.style.setProperty("--at", dockPosition(pose).toFixed(4));
    }
    function scene(pose, flight, tau, source) {
      place(pose);
      light(flight, tau, source);
      tint(pose);
      const l = flight ? lerp(liftFrom, liftTo, smooth(0.08, 0.92, tau)) : lift;
      world.style.transform = `translate3d(0,${(-l).toFixed(1)}px,0) rotate(${((pose.roll * 180) / Math.PI).toFixed(3)}deg)`;
      backdrop.style.transform = `translate3d(${(-(pose.x - WORLD.work.x) * 0.012 * vp.u).toFixed(1)}px,${(-(l * 0.25) - (pose.y + 400) * 0.03 * vp.u).toFixed(1)}px,0) rotate(${((pose.roll * 90) / Math.PI).toFixed(3)}deg)`;
      dust(pose, flight, tau);
    }
    /* Stardust is drawn as streaks between where the camera saw each mote last
       frame and where it sees it now, so the streaks always run the true way. */
    function scatter(flight) {
      placeTransit(flight);
      if (!ctx || flight.reduced) {
        particles = [];
        return;
      }
      const r = noise(Math.round(flight.dist) + 7),
        count = vp.width < 700 ? 34 : 80;
      particles = Array.from({ length: count }, () => {
        const at = bezier(flight.from, flight.c1, flight.c2, flight.to, r());
        return {
          x: at.x + (r() - 0.5) * 3600,
          y: at.y + (r() - 0.5) * 1800,
          z: at.z + 300 + r() * 2600,
          hue: ["#ffffff", "#fff1b8", "#ffe0f0", "#c8f4ff"][Math.floor(r() * 4)],
          size: 0.8 + r() * 1.6,
        };
      });
    }
    // Clouds the camera flies through: set out along the path, off to either side
    // and a little below, so they rush past the edges the way the world really
    // moves and never close over the middle of the screen.
    const transit = Array.from({ length: 6 }, (_, i) => {
      const el = make("div", "cw-puff is-transit", world);
      const o = { el, kind: "cloud", transit: true, pos: { x: 0, y: 0, z: -1e6 }, w: 1100, h: 460, ax: 550, ay: 230, alpha: 0, shown: false, z: 0 };
      objects.push(o);
      return o;
    });
    function placeTransit(flight) {
      const r = noise(Math.round(flight.dist) + 131);
      transit.forEach((o, i) => {
        if (flight.reduced) {
          o.pos = { x: 0, y: 0, z: -1e6 };
          return;
        }
        const at = bezier(flight.from, flight.c1, flight.c2, flight.to, 0.24 + i * 0.1);
        const side = i % 2 ? 1 : -1;
        o.pos = { x: at.x + side * (760 + r() * 520), y: at.y + 260 + r() * 360, z: at.z + 900 + r() * 700 };
        o.alpha = 0.42 + r() * 0.18;
      });
    }
    function dust(pose, flight, tau) {
      if (!ctx) return;
      if (!flight || !particles.length) {
        if (lastPose) ctx.clearRect(0, 0, canvas.width, canvas.height);
        lastPose = null;
        return;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!lastPose) {
        lastPose = pose;
        return;
      }
      const fade = smooth(0.04, 0.2, tau) * (1 - smooth(0.78, 0.95, tau));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.translate(vp.cx, vp.cy);
      ctx.rotate(pose.roll);
      ctx.translate(-vp.cx, -vp.cy);
      ctx.lineCap = "round";
      const reach = 38 * vp.u;
      for (const m of particles) {
        const a = project(m, lastPose, vp),
          b = project(m, pose, vp);
        if (!a || !b) continue;
        if (b.x < -40 || b.x > vp.width + 40 || b.y < -40 || b.y > vp.height + 40) continue;
        const alpha = fade * smooth(260, 900, b.depth) * (1 - smooth(4200, 9000, b.depth));
        if (alpha < 0.02) continue;
        // A mote of stardust with a short tail behind it, never a long streak.
        let dx = a.x - b.x,
          dy = a.y - b.y;
        const length = Math.hypot(dx, dy);
        if (length > reach) {
          dx *= reach / length;
          dy *= reach / length;
        }
        const width = clamp(m.size * b.scale * 2.4, 0.8, 3.6);
        ctx.globalAlpha = alpha * 0.5;
        ctx.strokeStyle = m.hue;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(b.x + dx, b.y + dy);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.globalAlpha = alpha * 0.9;
        ctx.fillStyle = m.hue;
        ctx.beginPath();
        ctx.arc(b.x, b.y, width * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      lastPose = pose;
    }

    /* ---------------------------------------------------------- the decks */
    const settleListeners = new Set();
    let exitTimer = 0,
      arriveTimer = 0,
      hideTimer = 0;
    const deckOf = (id) => decks?.[id] || null;
    function markBeacons(settledId, targetId) {
      for (const [id, b] of Object.entries(beacons)) {
        if (id === settledId && !targetId) b.el.setAttribute("aria-current", "page");
        else b.el.removeAttribute("aria-current");
        b.el.dataset.state = id === targetId ? "target" : id === settledId && !targetId ? "active" : "idle";
        isles[id]?.el.classList.toggle("is-home", id === settledId || id === targetId);
      }
      stage.dataset.island = settledId;
      if (targetId) stage.dataset.target = targetId;
      else delete stage.dataset.target;
    }
    function depart(source, target, flight) {
      clearTimeout(arriveTimer);
      clearTimeout(hideTimer);
      liftFrom = lift;
      liftTo = liftFor(Math.min(Math.max(0, into()), cloudEnd()));
      stage.classList.add("is-flying");
      stage.dataset.state = "DEPART";
      markBeacons(source, target);
      live.textContent = "正在飛往「" + (beacons[target]?.name || target) + "」";
      isles[source].el.classList.remove("is-departing");
      void isles[source].el.offsetWidth;
      isles[source].el.classList.add("is-departing");
      // The deck sinks away with its island but keeps its room on the floor, so
      // the task cloud above it holds still for the whole flight.
      const deck = deckOf(source);
      if (deck && !deck.hidden) {
        deck.classList.remove("is-arriving");
        deck.classList.add("is-leaving");
        exitTimer = setTimeout(() => {
          if (rests[source]) sendAway(rests[source], false);
        }, motionQuery.matches ? 120 : 260);
      }
      scatter(flight);
    }
    function retarget(target, flight) {
      markBeacons(control.current, target);
      live.textContent = "改為飛往「" + (beacons[target]?.name || target) + "」";
      scatter(flight);
    }
    function arrive(id, source) {
      clearTimeout(exitTimer);
      stage.classList.remove("is-flying");
      stage.dataset.state = "SETTLED";
      current = id;
      markBeacons(id, null);
      live.textContent = "已抵達「" + (beacons[id]?.name || id) + "」";
      // Land where the floor was: the task cloud stays as far out of view as it
      // was, and a reader deep in the old deck starts the new one at its title
      // platform. The old deck is already invisible, so the page can move.
      const scrolled = into();
      const keep = Math.min(scrolled, cloudEnd());
      for (const [key, deck] of Object.entries(decks || {})) {
        deck.classList.remove("is-leaving", "is-arriving");
        deck.hidden = key !== id;
      }
      if (scrolled > keep) scrollInto(keep);
      lift = liftFor(Math.max(0, keep));
      const isle = isles[id].el;
      isle.classList.remove("is-landing");
      void isle.offsetWidth;
      isle.classList.add("is-landing");
      const deck = deckOf(id);
      if (deck) {
        void deck.offsetWidth;
        deck.classList.add("is-arriving");
        arriveTimer = setTimeout(() => deck.classList.remove("is-arriving"), 1800);
      }
      hideTimer = setTimeout(() => {
        isles[source]?.el.classList.remove("is-departing");
        isle.classList.remove("is-landing");
      }, 1300);
      for (const [key, r] of Object.entries(rests)) if (key !== id) sendAway(r, false);
      planVisit(id, motionQuery.matches ? 300 : 5000);
      for (const fn of settleListeners) fn(id, source);
    }

    const control = controller({
      start: current,
      now: () => performance.now(),
      schedule: (fn) => requestAnimationFrame(fn),
      cancel: (h) => cancelAnimationFrame(h),
      reduced: () => motionQuery.matches,
      onFrame: (pose, flight, tau, source) => scene(pose, flight, tau, source),
      onPhase: (phase) => {
        stage.dataset.state = phase;
      },
      onDepart: depart,
      onRetarget: retarget,
      onSettle: arrive,
    });
    function go(id) {
      if (!WORLD[id]) return false;
      if (!control.flying && id === control.current) {
        const b = beacons[id].el;
        b.classList.remove("is-pulsing");
        void b.offsetWidth;
        b.classList.add("is-pulsing");
        return false;
      }
      return control.go(id);
    }

    // Scrolling down the deck lowers the camera a little along the island.
    function liftFor(scroll) {
      return Math.min(Math.max(0, scroll) * 0.22, 300 * vp.u);
    }
    let liftFrame = 0;
    const onScroll = () => {
      if (liftFrame) return;
      liftFrame = requestAnimationFrame(() => {
        liftFrame = 0;
        const scrolled = into();
        stage.classList.toggle("is-below-cloud", scrolled > cloudEnd() * 0.6);
        if (control.flying || !stage.classList.contains("is-live")) return;
        const next = liftFor(scrolled);
        if (Math.abs(next - lift) < 0.5) return;
        lift = next;
        scene(control.pose(), null, 1, null);
      });
    };
    // Narrow screens scroll the body instead of the window; listen to both.
    window.addEventListener("scroll", onScroll, { passive: true });
    document.body.addEventListener("scroll", onScroll, { passive: true });
    const redraw = () => {
      size();
      scene(control.pose(), null, 1, null);
    };
    if (typeof ResizeObserver === "function") new ResizeObserver(() => !control.flying && redraw()).observe(sky);
    else window.addEventListener("resize", redraw);
    document.addEventListener("visibilitychange", () => {
      stage.classList.toggle("is-hidden-tab", document.hidden);
      if (document.hidden) control.complete();
    });
    if (typeof IntersectionObserver === "function")
      new IntersectionObserver((entries) => stage.classList.toggle("is-live", entries.some((e) => e.isIntersecting))).observe(stage);
    else stage.classList.add("is-live");
    const syncMotion = () => (stage.dataset.motion = motionQuery.matches ? "reduced" : "full");
    motionQuery.addEventListener?.("change", syncMotion);
    syncMotion();

    host.append(stage);
    stage.dataset.state = "SETTLED";
    markBeacons(current, null);
    redraw();

    return {
      stage,
      floor,
      go,
      scrollToCloud: () => scrollInto(0, true),
      get current() {
        return control.current;
      },
      get target() {
        return control.target;
      },
      get state() {
        return control.state;
      },
      get flying() {
        return control.flying;
      },
      pose: () => control.pose(),
      frames: () => control.frames,
      onSettle(fn) {
        settleListeners.add(fn);
        return () => settleListeners.delete(fn);
      },
      setCount(id, text) {
        if (beacons[id] && beacons[id].count.textContent !== text) beacons[id].count.textContent = text;
      },
      setResidents,
      residents: () => Object.fromEntries(ISLAND_IDS.map((id) => [id, (crews[id] || []).map((c) => c.name)])),
      // Draws one moment of a flight without flying, so a transition can be
      // looked at frame by frame. `thaw` puts the landed view back.
      freeze(from, to, tau) {
        if (control.flying || !WORLD[from] || !WORLD[to] || from === to) return false;
        const flight = plan(settledCamera(from), to, { reduced: motionQuery.matches });
        const t = clamp(tau, 0, 1);
        if (!particles.length || particles.flight !== from + to) {
          scatter(flight);
          particles.flight = from + to;
        }
        stage.classList.toggle("is-flying", t > 0 && t < 1);
        const deck = deckOf(from);
        if (deck) deck.style.opacity = t <= 0 ? "" : String(1 - smooth(0, 0.18, t));
        lastPose = sample(flight, Math.max(0, t - 0.025));
        liftFrom = liftTo = 0;
        scene(sample(flight, t), flight, t, from);
        return { pose: sample(flight, t), phase: phaseAt(flight, t), duration: flight.duration };
      },
      thaw() {
        particles = [];
        stage.classList.remove("is-flying");
        for (const deck of Object.values(decks || {})) deck.style.opacity = "";
        scene(control.pose(), null, 1, null);
      },
      project: (id) => {
        const p = project(WORLD[id], control.pose(), vp);
        return p && { x: p.x, y: p.y, scale: p.scale };
      },
      islandOf(element) {
        const deck = element?.closest?.(".cw-deck");
        return deck?.dataset.island || null;
      },
    };
  }
  api.World.mount = mount;
})(typeof window === "undefined" ? globalThis : window);
