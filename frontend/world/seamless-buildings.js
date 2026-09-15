/* Renguin World · seamless building kit: lit paper buildings that grow with the world.
 *
 * Pure: no DOM, no timers, no network. Shared by the main street (seamless-art.js)
 * and every district (seamless-districts.js), so the whole street is lit the same way.
 *
 * Light comes from the upper left, as in V1. Every building is built from the same
 * parts: a contact shadow thrown to the right, a darker side return, a front wall
 * with its era's material, eave shadow and ground occlusion, recessed windows that
 * glow from dusk, a door in a frame, a roof with a lit and a shaded plane.
 *
 * Evolution: `grade(state)` turns the era and its progress into one number, and every
 * lot on the street has the grade it first appears at. A lot's level is how far the
 * world has grown past that point, so when the world grows the buildings already
 * standing gain floors, width, chimneys, balconies, signs, dormers, turrets and roof
 * gardens; the era swaps their material all at once. Nothing is ever taken away.
 */
(function (root) {
  "use strict";
  const Scene = root.RenguinWorldScene || (typeof require === "function" ? require("./world-scene.js") : null);
  const { hash, esc, VARIANTS, STYLES } = Scene;
  const OUT = "#3a3150";
  const INK = "#2c2340";
  const HAZE = "#dbe6ee";
  const r1 = (n) => Math.round(n * 10) / 10;
  const rnd = (key, k) => hash(`${k}|${key}`);
  const hex = (c) => {
    const n = parseInt(c.slice(1), 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  };
  const shade = (c, f) => "#" + hex(c).map((v) => Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f)).toString(16).padStart(2, "0")).join("");
  const mix = (a, b, t) => {
    if (!t) return a;
    const [x, y] = [hex(a), hex(b)];
    return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("");
  };
  const pts = (list) => list.map(([x, y]) => r1(x) + "," + r1(y)).join(" ");
  const line = ` stroke="${OUT}" stroke-opacity=".36" stroke-width="1.5" stroke-linejoin="round"`;
  const poly = (list, fill, extra = "") => `<polygon points="${pts(list)}" fill="${fill}"${line}${extra}/>`;
  const flat = (list, fill, extra = "") => `<polygon points="${pts(list)}" fill="${fill}"${extra}/>`;
  const rect = (x, y, w, h, fill, extra = "") => `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" fill="${fill}"${line}${extra}/>`;
  const box = (x, y, w, h, fill, extra = "") => `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" fill="${fill}"${extra}/>`;
  const use = (id, x, y, s = 1, extra = "") => `<use href="#${id}" transform="translate(${r1(x)} ${r1(y)})${s === 1 ? "" : ` scale(${r1(s * 100) / 100})`}"${extra}/>`;

  // ---------- era materials, and how far each district leans toward its own colours ----------
  const ERA = {
    camp: { walls: ["#ead2a2", "#e6c796", "#f0dcb4"], roofs: ["#e07d4f", "#d8694a", "#e8a05a", "#6fae9a"], trim: "#f4c26b", stone: "#b9a58a", mat: "canvas" },
    tribe: { walls: ["#c49766", "#b5875a", "#cfa472"], roofs: ["#e6bb5e", "#d9a94f", "#caa04f"], trim: "#8a5a36", stone: "#9d8a72", mat: "mud" },
    riverside: { walls: ["#b07c50", "#a8744a", "#c08d5e", "#9c6b44"], roofs: ["#8e4e3c", "#7d5a44", "#a35e44", "#6f6a5a"], trim: "#e8d3a8", stone: "#a39580", mat: "plank" },
    town: { walls: ["#e0967a", "#f0c9a0", "#eadcc4", "#d9a88c", "#f4dcc0"], roofs: ["#bb4d42", "#5b6f8f", "#a8543f", "#7a8a5a"], trim: "#fff1d6", stone: "#b8ab98", mat: "brick" },
    kingdom: { walls: ["#e6dac4", "#d9cbb0", "#efe5d2", "#cfc1a8"], roofs: ["#5d72a6", "#4f628f", "#7a5a8f", "#5b8a7a"], trim: "#f4e9d2", stone: "#aaa192", mat: "stone" },
    modern: { walls: ["#eaf0f4", "#dfe6ec", "#f3efe6", "#cfd8e0"], roofs: ["#a5bacb", "#8fa6ba", "#c0cdd6"], trim: "#8fc8e8", stone: "#a4adb6", mat: "panel" },
    future: { walls: ["#f5f8f9", "#e6f2f0", "#eef4fb"], roofs: ["#82d9c5", "#8fc8e8", "#b3a8f0"], trim: "#9fe6f2", stone: "#b5c3c8", mat: "glass" },
    starport: { walls: ["#f4f6fc", "#e8ecfa", "#f0eefc"], roofs: ["#a192f2", "#8fa8f2", "#82d9c5"], trim: "#bccbff", stone: "#b7bfd6", mat: "glass" },
  };
  const DISTRICT_TINT = {
    MAIN_CITY: { walls: ["#f2d8b4", "#e9b48f", "#f4e6cc"], roofs: ["#c9573f", "#d9824a", "#8a5a44"] },
    CREATOR_DISTRICT: { walls: ["#e9dcc6", "#d9d2ea", "#efe0cf"], roofs: ["#5b6f8f", "#4a4468", "#8a6fa8"] },
    TRAVEL_DISTRICT: { walls: ["#f4f1ea", "#dde9f0", "#ece3d0"], roofs: ["#4f7fa3", "#3f6d8f", "#6fae9a"] },
    VIDEO_HALL: { walls: ["#efe0ea", "#f3e2d6", "#e6d8ef"], roofs: ["#8a4f7a", "#c9453d", "#6d5a9a"] },
    MEMBER_DISTRICT: { walls: ["#fff2d8", "#fbe3b6", "#f8dccc"], roofs: ["#f0b43d", "#e99c8f", "#8fcfc9"] },
    ENTERTAINMENT_DISTRICT: { walls: ["#f3d6c6", "#e8d6f0", "#f6e2b6"], roofs: ["#c9453d", "#7d5aa8", "#e07d4f"] },
    FUTURE_GATE: { walls: ["#eef2fb", "#e2e8f7", "#eaeefa"], roofs: ["#5b6f8f", "#7d95e0", "#a192f2"] },
  };
  // Early eras build from what grows nearby; later eras paint each district in its own colours.
  const LEAN = [0.12, 0.16, 0.24, 0.5, 0.58, 0.7, 0.76, 0.78];

  function eraIndex(state) {
    const i = VARIANTS.indexOf(state?.visual?.era_variant);
    return i < 0 ? 0 : i;
  }

  // ---------- evolution ----------
  // One number for how grown the world is: three steps per era (0 … 23).
  function grade(state) {
    const p = Math.max(0, Math.min(0.999, Number(state?.era_progress) || 0));
    return eraIndex(state) * 3 + Math.floor(p * 3);
  }

  const MAX_FLOORS = { tent: 1, hut: 1, cabin: 2, house: 4, manor: 4, tower: 7, spire: 7 };

  // What a lot looks like at a grade: it appears at `since`, then keeps upgrading.
  function evolve(lot, g, style) {
    const lvl = Math.max(0, g - (lot.since || 0));
    const kind = lot.kind || style.kind;
    const floors = Math.max(1, Math.min(MAX_FLOORS[kind] || 4, style.maxFloors || 9, (lot.floors || 0) + (style.height || 1) + (lvl >= 3 ? 1 : 0) + (lvl >= 9 ? 1 : 0)));
    const width = Math.round(lot.w * Math.min(1, 0.8 + lvl * 0.04));
    const parts = [];
    if (lvl >= 1) parts.push("flowers");
    if (lvl >= 2) parts.push("chimney", "sign");
    if (lvl >= 4 && floors >= 2) parts.push("balcony");
    if (lvl >= 5) parts.push("dormer");
    if (lvl >= 6) parts.push("lanterns");
    if (lvl >= 7) parts.push("turret");
    if (lvl >= 8) parts.push("roofgarden");
    return { lvl, kind, floors, width, parts };
  }

  function palette(variant, district) {
    const e = ERA[variant] || ERA.camp;
    const d = DISTRICT_TINT[district] || DISTRICT_TINT.MAIN_CITY;
    const t = LEAN[Math.max(0, VARIANTS.indexOf(variant))] ?? 0.3;
    return {
      wall: (seed) => mix(e.walls[Math.floor(hash(seed + "w") * e.walls.length)], d.walls[Math.floor(hash(seed + "dw") * d.walls.length)], t),
      roof: (seed) => mix(e.roofs[Math.floor(hash(seed + "r") * e.roofs.length)], d.roofs[Math.floor(hash(seed + "dr") * d.roofs.length)], t + 0.12),
      trim: e.trim,
      stone: e.stone,
      mat: e.mat,
    };
  }

  // ---------- shared defs: gradients, textures and small parts, defined once ----------
  function defs() {
    const pattern = (id, w, h, body) => `<pattern id="${id}" width="${w}" height="${h}" patternUnits="userSpaceOnUse">${body}</pattern>`;
    return (
      `<linearGradient id="swb-ao" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${INK}" stop-opacity="0"/><stop offset="1" stop-color="${INK}" stop-opacity=".3"/></linearGradient>` +
      `<linearGradient id="swb-lightwall" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".26"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="${INK}" stop-opacity=".1"/></linearGradient>` +
      `<linearGradient id="swb-sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".32"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
      `<linearGradient id="swb-glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9ecf3"/><stop offset=".45" stop-color="#9fc1d4"/><stop offset="1" stop-color="#7a9db5"/></linearGradient>` +
      `<linearGradient id="swb-glass-lit" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0b0"/><stop offset=".55" stop-color="#ffc45a"/><stop offset="1" stop-color="#f59a3a"/></linearGradient>` +
      `<radialGradient id="swb-halo"><stop offset="0" stop-color="#ffcf6a" stop-opacity=".95"/><stop offset=".45" stop-color="#ffc45a" stop-opacity=".45"/><stop offset="1" stop-color="#ffc45a" stop-opacity="0"/></radialGradient>` +
      `<radialGradient id="swb-contact"><stop offset="0" stop-color="${INK}" stop-opacity=".34"/><stop offset=".7" stop-color="${INK}" stop-opacity=".12"/><stop offset="1" stop-color="${INK}" stop-opacity="0"/></radialGradient>` +
      `<radialGradient id="swb-pool" cy=".6"><stop offset="0" stop-color="#ffe7a8" stop-opacity=".8"/><stop offset="1" stop-color="#ffe7a8" stop-opacity="0"/></radialGradient>` +
      `<linearGradient id="swb-neon" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bff4ff"/><stop offset="1" stop-color="#7fd6f2"/></linearGradient>` +
      `<linearGradient id="swb-water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8cc0cb"/><stop offset="1" stop-color="#5d8fa3"/></linearGradient>` +
      pattern("swb-plank", 40, 16, `<path d="M0 15.5H40" stroke="${INK}" stroke-opacity=".2" stroke-width="1.6"/><path d="M${hash("pk") * 30 + 4} 0V16" stroke="${INK}" stroke-opacity=".12" stroke-width="1.2"/>`) +
      pattern("swb-log", 60, 18, `<path d="M0 17H60" stroke="${INK}" stroke-opacity=".22" stroke-width="2"/><path d="M0 2H60" stroke="#fff" stroke-opacity=".12" stroke-width="2"/>`) +
      pattern("swb-mud", 64, 40, `<ellipse cx="14" cy="10" rx="9" ry="4" fill="${INK}" fill-opacity=".07"/><ellipse cx="44" cy="30" rx="12" ry="5" fill="#fff" fill-opacity=".08"/>`) +
      pattern("swb-brick", 28, 14, `<path d="M0 13.5H28M14 0V7M0 7H28M0 7V14M28 7V14" stroke="${INK}" stroke-opacity=".13" stroke-width="1.3"/>`) +
      pattern("swb-stone", 48, 26, `<path d="M0 25.5H48M0 12.5H48M20 0V13M44 13V26M8 13V26" stroke="${INK}" stroke-opacity=".15" stroke-width="1.5"/><path d="M1 1H18M22 14H42" stroke="#fff" stroke-opacity=".16" stroke-width="1.5"/>`) +
      pattern("swb-panel", 32, 40, `<path d="M31.5 0V40M0 39.5H32" stroke="${INK}" stroke-opacity=".1" stroke-width="1.4"/><path d="M4 36L26 4" stroke="#fff" stroke-opacity=".14" stroke-width="3"/>`) +
      pattern("swb-glassy", 36, 30, `<path d="M35.5 0V30M0 29.5H36" stroke="#5b6f8f" stroke-opacity=".16" stroke-width="1.2"/><path d="M3 26L18 4" stroke="#fff" stroke-opacity=".22" stroke-width="4"/>`) +
      pattern("swb-canvas", 26, 60, `<path d="M13 0V60" stroke="#fff" stroke-opacity=".18" stroke-width="7"/>`) +
      pattern("swb-shingle", 22, 14, `<path d="M0 13Q5.5 5 11 13T22 13" fill="none" stroke="${INK}" stroke-opacity=".2" stroke-width="1.5"/>`) +
      pattern("swb-tile", 16, 20, `<path d="M8 0V20" stroke="${INK}" stroke-opacity=".16" stroke-width="3"/><path d="M3 0V20" stroke="#fff" stroke-opacity=".12" stroke-width="2"/><path d="M0 19.5H16" stroke="${INK}" stroke-opacity=".12"/>`) +
      pattern("swb-thatch", 12, 18, `<path d="M3 0L5 16M9 2L10 18" stroke="${INK}" stroke-opacity=".2" stroke-width="1.4"/>`) +
      pattern("swb-cobble2", 34, 18, `<rect width="34" height="18" fill="#9b8f80"/><rect x="1.5" y="1.5" width="14" height="6.5" rx="3" fill="#b8ab98"/><rect x="18" y="1.5" width="14" height="6.5" rx="3" fill="#aea190"/><rect x="-7" y="10" width="14" height="6.5" rx="3" fill="#aea190"/><rect x="9.5" y="10" width="14" height="6.5" rx="3" fill="#c0b3a0"/><rect x="26" y="10" width="14" height="6.5" rx="3" fill="#b4a794"/>`) +
      // A window with depth: frame (the building's trim colour via `color`), recess shadow, day glass,
      // lit glass and halo whose opacity CSS sets per daypart, a reflection stripe, mullions and a sill.
      `<symbol id="swb-win" overflow="visible"><rect x="-26" y="-22" width="86" height="92" rx="36" fill="url(#swb-halo)" style="opacity:var(--swb-halo,0)"/>` +
      `<rect x="-4" y="-4" width="42" height="52" rx="4" fill="currentColor" stroke="${OUT}" stroke-opacity=".4" stroke-width="1.5"/><rect x="0" y="0" width="34" height="44" rx="2" fill="#4a4058"/>` +
      `<rect x="3" y="4" width="31" height="40" fill="url(#swb-glass)"/><rect x="3" y="4" width="31" height="40" fill="url(#swb-glass-lit)" style="opacity:var(--swb-lit,0)"/>` +
      `<path d="M8 38L26 8" stroke="#fff" stroke-opacity=".35" stroke-width="4"/><path d="M18.5 4V44M3 23H34" stroke="currentColor" stroke-width="3"/><path d="M0 1H34" stroke="${INK}" stroke-opacity=".35" stroke-width="3"/>` +
      `<rect x="-7" y="46" width="48" height="7" rx="2" fill="currentColor" stroke="${OUT}" stroke-opacity=".4" stroke-width="1.2"/><path d="M-5 55H39" stroke="${INK}" stroke-opacity=".18" stroke-width="4"/></symbol>` +
      `<symbol id="swb-win-arch" overflow="visible"><rect x="-26" y="-26" width="86" height="98" rx="36" fill="url(#swb-halo)" style="opacity:var(--swb-halo,0)"/>` +
      `<path d="M-4 48V13A21 21 0 0 1 38 13V48Z" fill="currentColor" stroke="${OUT}" stroke-opacity=".4" stroke-width="1.5"/><path d="M0 44V14A17 17 0 0 1 34 14V44Z" fill="#4a4058"/>` +
      `<path d="M3 44V15A14 14 0 0 1 34 15V44Z" fill="url(#swb-glass)"/><path d="M3 44V15A14 14 0 0 1 34 15V44Z" fill="url(#swb-glass-lit)" style="opacity:var(--swb-lit,0)"/>` +
      `<path d="M9 38L25 10" stroke="#fff" stroke-opacity=".35" stroke-width="4"/><path d="M18.5 0V44M3 26H34" stroke="currentColor" stroke-width="3"/>` +
      `<rect x="-7" y="46" width="48" height="7" rx="2" fill="currentColor" stroke="${OUT}" stroke-opacity=".4" stroke-width="1.2"/><path d="M-5 55H39" stroke="${INK}" stroke-opacity=".18" stroke-width="4"/></symbol>` +
      // Set-back rows use a lighter window: frame, glass, lit glass and halo only.
      `<symbol id="swb-win-lite" overflow="visible"><rect x="-26" y="-22" width="86" height="92" rx="36" fill="url(#swb-halo)" style="opacity:var(--swb-halo,0)"/><rect x="-4" y="-4" width="42" height="56" rx="4" fill="currentColor" stroke="${OUT}" stroke-opacity=".4" stroke-width="1.5"/>` +
      `<rect x="2" y="2" width="30" height="42" fill="url(#swb-glass)"/><rect x="2" y="2" width="30" height="42" fill="url(#swb-glass-lit)" style="opacity:var(--swb-lit,0)"/></symbol>` +
      `<symbol id="swb-win-tall-lite" overflow="visible"><rect x="-22" y="-20" width="70" height="104" rx="30" fill="url(#swb-halo)" style="opacity:var(--swb-halo,0)"/><rect x="-2" y="-2" width="30" height="64" fill="currentColor" stroke="${OUT}" stroke-opacity=".35" stroke-width="1.3"/>` +
      `<rect x="3" y="3" width="22" height="56" fill="url(#swb-glass)"/><rect x="3" y="3" width="22" height="56" fill="url(#swb-glass-lit)" style="opacity:var(--swb-lit,0)"/></symbol>` +
      `<symbol id="swb-win-tall" overflow="visible"><rect x="-22" y="-20" width="70" height="104" rx="30" fill="url(#swb-halo)" style="opacity:var(--swb-halo,0)"/>` +
      `<rect x="-2" y="-2" width="30" height="64" fill="currentColor" stroke="${OUT}" stroke-opacity=".35" stroke-width="1.3"/><rect x="1" y="1" width="24" height="58" fill="#4a5870"/>` +
      `<rect x="3" y="3" width="22" height="56" fill="url(#swb-glass)"/><rect x="3" y="3" width="22" height="56" fill="url(#swb-glass-lit)" style="opacity:var(--swb-lit,0)"/><path d="M6 50L20 10" stroke="#fff" stroke-opacity=".32" stroke-width="3"/><path d="M1 30H25" stroke="currentColor" stroke-width="2"/></symbol>` +
      `<symbol id="swb-win-round" overflow="visible"><circle r="32" fill="url(#swb-halo)" style="opacity:var(--swb-halo,0)"/><circle r="17" fill="currentColor" stroke="${OUT}" stroke-opacity=".4" stroke-width="1.5"/><circle r="13" fill="#4a4058"/>` +
      `<circle cx="1" cy="1" r="11.5" fill="url(#swb-glass)"/><circle cx="1" cy="1" r="11.5" fill="url(#swb-glass-lit)" style="opacity:var(--swb-lit,0)"/><path d="M-6 6L6-6" stroke="#fff" stroke-opacity=".4" stroke-width="3"/><path d="M0-13V13M-13 0H13" stroke="currentColor" stroke-width="2.5"/></symbol>` +
      `<symbol id="swb-shopwin" overflow="visible"><rect x="-30" y="-20" width="130" height="92" rx="36" fill="url(#swb-halo)" style="opacity:var(--swb-halo,0)"/>` +
      `<rect x="-4" y="-4" width="78" height="56" rx="3" fill="currentColor" stroke="${OUT}" stroke-opacity=".4" stroke-width="1.5"/><rect x="0" y="0" width="70" height="48" fill="#4a4058"/>` +
      `<rect x="3" y="3" width="67" height="45" fill="url(#swb-glass)"/><rect x="3" y="3" width="67" height="45" fill="url(#swb-glass-lit)" style="opacity:var(--swb-lit,.35)"/>` +
      `<circle cx="18" cy="36" r="7" fill="#e8a05a"/><circle cx="34" cy="38" r="6" fill="#f2c46b"/><rect x="46" y="28" width="14" height="16" rx="2" fill="#e07d4f"/><path d="M10 44L40 6" stroke="#fff" stroke-opacity=".3" stroke-width="5"/><path d="M35 3V48" stroke="currentColor" stroke-width="3"/></symbol>` +
      `<symbol id="swb-flowerbox" overflow="visible"><circle cx="6" cy="-4" r="5" fill="#ff9fb8"/><circle cx="16" cy="-7" r="5.5" fill="#ffe08a"/><circle cx="27" cy="-4" r="5" fill="#c9b8f2"/><circle cx="36" cy="-6" r="4.5" fill="#ff9fb8"/><ellipse cx="21" cy="-1" rx="20" ry="4" fill="#6f9a61"/>` +
      `<rect x="0" y="0" width="42" height="10" rx="2" fill="#a0694a" stroke="${OUT}" stroke-opacity=".4" stroke-width="1.2"/><path d="M2 12H40" stroke="${INK}" stroke-opacity=".2" stroke-width="3"/></symbol>` +
      `<symbol id="swb-chimney" overflow="visible"><rect x="0" y="0" width="24" height="46" fill="currentColor" stroke="${OUT}" stroke-opacity=".4" stroke-width="1.5"/><rect x="0" y="0" width="7" height="46" fill="#fff" fill-opacity=".18"/><rect x="15" y="0" width="9" height="46" fill="${INK}" fill-opacity=".16"/>` +
      `<rect x="-4" y="-7" width="32" height="9" rx="1.5" fill="#6f6270" stroke="${OUT}" stroke-opacity=".45" stroke-width="1.2"/><path d="M0 12H24M0 26H24" stroke="${INK}" stroke-opacity=".14" stroke-width="1.5"/></symbol>` +
      `<symbol id="swb-balcony" overflow="visible"><path d="M-6 26H76" stroke="${INK}" stroke-opacity=".2" stroke-width="5"/><rect x="-6" y="16" width="82" height="8" fill="currentColor" stroke="${OUT}" stroke-opacity=".4" stroke-width="1.2"/>` +
      `<path d="M-4 0H74M2 0V16M14 0V16M26 0V16M38 0V16M50 0V16M62 0V16M72 0V16" stroke="#5e5570" stroke-width="3" fill="none"/></symbol>` +
      `<symbol id="swb-lantern" overflow="visible"><circle cy="12" r="20" fill="url(#swb-halo)" style="opacity:var(--swb-halo,0)"/><path d="M0-10V0" stroke="#5e5570" stroke-width="2"/><rect x="-7" y="0" width="14" height="22" rx="6" fill="#f28c6d" stroke="${OUT}" stroke-opacity=".45"/><rect x="-7" y="0" width="14" height="22" rx="6" fill="#ffe7a8" style="opacity:var(--swb-lit,0)"/><path d="M-5 0H5M-5 22H5" stroke="#5e5570" stroke-width="2.5"/></symbol>` +
      `<symbol id="swb-crate" overflow="visible"><rect x="0" y="-36" width="40" height="36" fill="#c79a68" stroke="${OUT}" stroke-opacity=".4" stroke-width="1.4"/><path d="M0-36L40 0M40-36L0 0" stroke="#8a6848" stroke-width="3" opacity=".6"/><rect x="0" y="-36" width="40" height="6" fill="#fff" fill-opacity=".2"/><rect x="30" y="-36" width="10" height="36" fill="${INK}" fill-opacity=".14"/></symbol>` +
      `<symbol id="swb-barrel" overflow="visible"><rect x="0" y="-40" width="30" height="40" rx="10" fill="#a8744a" stroke="${OUT}" stroke-opacity=".4" stroke-width="1.4"/><path d="M1-30H29M1-10H29" stroke="#5e5570" stroke-width="3"/><rect x="20" y="-39" width="9" height="38" rx="4" fill="${INK}" fill-opacity=".15"/></symbol>` +
      `<symbol id="swb-flag" overflow="visible"><path d="M0 0V-70" stroke="#5e5570" stroke-width="3"/><path d="M1.5-70H34L26-60L34-50H1.5Z" fill="currentColor" stroke="${OUT}" stroke-opacity=".4"/><path d="M1.5-60H30" stroke="#fff" stroke-opacity=".35" stroke-width="2"/></symbol>` +
      `<symbol id="swb-cypress" overflow="visible"><ellipse cx="6" cy="2" rx="26" ry="6" fill="${INK}" opacity=".14"/><rect x="-3" y="-20" width="6" height="22" fill="#7d5a44"/><path d="M0-150C22-120 24-50 16-18H-16C-24-50-22-120 0-150Z" fill="#5f8f68"/><path d="M0-150C-22-120-24-50-16-18H0Z" fill="#7fb07e"/></symbol>`
    );
  }

  // ---------- one lit building ----------
  // o: { x, base, w, floors, kind, lvl, parts, seed, lit, wall, roof, trim, stone, mat, haze, shop, sign, door }
  function house(o) {
    const { x, base, seed } = o;
    const haze = o.haze || 0;
    const tone = (c) => mix(c, HAZE, haze);
    const kind = o.kind;
    const parts = new Set(o.parts || []);
    const lvl = o.lvl || 0;
    const wall = tone(o.wall),
      roof = tone(o.roof),
      trim = tone(o.trim),
      stone = tone(o.stone || "#b8ab98");
    const w = o.w;
    const dep = Math.round(Math.min(26, 12 + w * 0.05));
    const lit = Boolean(o.lit);
    const winCls = (k) => {
      const on = lit && rnd(seed + "lit", k) < 0.72;
      return ` class="swb-w${on ? " is-lit" : ""}${on && rnd(seed + "warm", k) < 0.25 ? " is-warm" : ""}"`;
    };
    // Detail follows distance: the near row gets every part, the set-back row drops the small ones, and the hazy
    // skyline paints each window as one plain shape (a <use> window is a dozen nodes in its shadow tree).
    const detail = o.detail || "near";
    const far = detail === "far";
    const near = detail === "near";
    const SIZE = { "swb-win": [34, 48], "swb-win-arch": [34, 48], "swb-win-tall": [26, 58], "swb-shopwin": [70, 48] };
    const win = (id, wx, wy, k, sc = 1, place = false) => {
      if (detail === "mid") id = { "swb-win": "swb-win-lite", "swb-win-arch": "swb-win-lite", "swb-win-tall": "swb-win-tall-lite" }[id] || id;
      if (!far) return place ? `<use href="#${id}" transform="translate(${r1(wx)} ${r1(wy)}) scale(${sc})" color="${trim}"${winCls(k)}/>` : `<use href="#${id}" x="${r1(wx)}" y="${r1(wy)}" color="${trim}"${winCls(k)}/>`;
      const on = lit && rnd(seed + "lit", k) < 0.72;
      const cls = ` class="swb-farwin${on ? " is-lit" : ""}"`;
      if (id === "swb-win-round") return `<circle cx="${r1(wx)}" cy="${r1(wy)}" r="${r1(13 * sc)}" fill="${tone("#8fb0c6")}"${cls}/>`;
      const [ww, wh] = SIZE[id];
      return `<rect x="${r1(wx)}" y="${r1(wy)}" width="${r1(ww * sc)}" height="${r1(wh * sc)}" rx="2" fill="${tone("#8fb0c6")}"${cls}/>`;
    };
    let s = `<g class="sw-house" data-kind="${kind}" data-lvl="${lvl}">`;
    // Contact shadow, thrown to the right of a light from the upper left.
    s += `<ellipse cx="${r1(x + w * 0.56 + dep)}" cy="${base + 3}" rx="${r1(w * 0.66 + dep)}" ry="${r1(10 + w * 0.03)}" fill="url(#swb-contact)"/>`;

    if (kind === "tent") {
      const cx = x + w / 2,
        h = Math.min(190, 118 + lvl * 16);
      s += flat([[cx, base - h], [x + w + 14, base - 4], [x + w - 6, base]], tone(shade(o.roof, -0.35)));
      s += poly([[x + 4, base], [cx, base - h], [x + w - 4, base]], roof);
      s += flat([[x + 4, base], [cx, base - h], [cx - 2, base]], `url(#swb-canvas)`) + flat([[cx, base - h], [x + w - 4, base], [cx, base]], INK, ` opacity=".14"`);
      s += flat([[x + 4, base], [cx, base - h], [cx - w * 0.18, base]], "#fff", ` opacity=".14"`);
      s += `<path d="M${r1(cx - 26)} ${base}L${r1(cx)} ${base - 70}L${r1(cx + 26)} ${base}Z" fill="${tone("#5a4034")}"/><path d="M${r1(cx)} ${base - 70}L${r1(cx + 26)} ${base}L${r1(cx + 40)} ${base - 8}Z" fill="${tone(shade(o.roof, 0.2))}"${line}/>`;
      s += `<path d="M${r1(cx)} ${base - h}V${base - h - 30}" stroke="#8a5a36" stroke-width="4"/>` + use("swb-flag", cx, base - h + 2, 0.5, ` color="${trim}"`);
      if (near && parts.has("flowers")) s += use("swb-barrel", x + w - 10, base, 0.8) + use("swb-crate", x - 30, base, 0.8);
      if (near && parts.has("sign")) for (let k = 0; k < 3; k++) s += use("swb-lantern", r1(x + 14 + k * ((w - 28) / 2)), r1(base - 36 - Math.sin((k / 2) * Math.PI) * 14), 0.8);
      return s + `</g>`;
    }

    const FH = kind === "tower" || kind === "spire" ? 78 : kind === "hut" ? 0 : 86;
    const floors = Math.max(1, o.floors || 1);
    const wallH = kind === "hut" ? 74 + Math.min(3, lvl) * 6 : floors * FH + 24;
    const top = base - wallH;
    // Side return and its shadowed wall.
    s += flat([[x + w, top + 2], [x + w + dep, top - dep * 0.55], [x + w + dep, base - dep * 0.55], [x + w, base]], tone(shade(o.wall, -0.32)), line);
    s += flat([[x + w, top + 2], [x + w + dep, top - dep * 0.55], [x + w + dep, base - dep * 0.55], [x + w, base]], "url(#swb-ao)");
    // Front wall: colour, material, lit edge, eave shadow, ground occlusion.
    const mat = { mud: "swb-mud", plank: kind === "cabin" ? "swb-log" : "swb-plank", brick: "swb-brick", stone: "swb-stone", panel: "swb-panel", glass: "swb-glassy", canvas: "swb-canvas" }[o.mat] || "swb-plank";
    s += rect(x, top, w, wallH, wall) + box(x, top, w, wallH, `url(#${mat})`) + box(x, top, w, wallH, "url(#swb-lightwall)");
    s += box(x, top, w, 18, INK, ` opacity=".17"`) + box(x, base - 56, w, 56, "url(#swb-ao)");
    // Corner quoins or posts carry the era's craft.
    if (kind === "cabin" || kind === "hut") s += box(x - 3, top, 9, wallH, tone(shade(o.wall, -0.2)), line) + box(x + w - 6, top, 9, wallH, tone(shade(o.wall, -0.26)), line);
    if ((kind === "house" || kind === "manor") && !far) {
      let lq = "",
        rq = "";
      for (let y = top + 6; y < base - 20; y += 26) {
        lq += `M${r1(x - 2)} ${r1(y)}h12v16h-12Z`;
        rq += `M${r1(x + w - 10)} ${r1(y + 13)}h12v13h-12Z`;
      }
      s += `<path d="${lq}" fill="${tone(shade(o.stone || "#b8ab98", 0.15))}"${line}/><path d="${rq}" fill="${tone(shade(o.stone || "#b8ab98", -0.05))}"${line}/>`;
    }
    // Floor bands and a cornice from the town era on.
    if (floors > 1 && kind !== "hut") {
      let band = "",
        under = "";
      for (let f = 1; f < floors; f++) {
        band += `M${r1(x - 3)} ${base - f * FH - 8}h${r1(w + 6)}v8h${r1(-w - 6)}Z`;
        under += `M${r1(x)} ${base - f * FH}h${r1(w)}v6h${r1(-w)}Z`;
      }
      s += `<path d="${band}" fill="${trim}"${line}/><path d="${under}" fill="${INK}" opacity=".14"/>`;
    }
    if (kind === "house" || kind === "manor" || kind === "tower") s += rect(x - 8, top - 4, w + 16 + dep * 0.6, 12, trim) + box(x - 8, top + 8, w + 16, 7, INK, ` opacity=".16"`);
    // Plinth.
    s += rect(x - 4, base - 14, w + 8, 14, tone(shade(o.stone || "#b8ab98", -0.08))) + `<path d="M${r1(x - 2)} ${base - 13}H${r1(x + w + 2)}" stroke="#fff" stroke-opacity=".3" stroke-width="2"/>`;

    // Door, placed left of centre on wide fronts.
    const door = o.door || (w > 190 ? "left" : "centre");
    const dw = kind === "tower" || kind === "spire" ? 60 : 44;
    const dh = kind === "tower" || kind === "spire" ? 74 : 66;
    const dx = door === "left" ? x + Math.max(18, w * 0.2) : x + w / 2 - dw / 2;
    // Windows: ground floor keeps room for the door (and the shop window).
    const winId = kind === "tower" || kind === "spire" ? "swb-win-tall" : kind === "manor" || (kind === "house" && lvl >= 5) ? "swb-win-arch" : "swb-win";
    const ww = winId === "swb-win-tall" ? 26 : 34;
    let k = 0;
    if (kind === "hut") {
      s += win("swb-win-round", x + w * 0.74, base - 42, k++, 0.9, true);
    } else {
      const cols = Math.max(1, Math.floor((w - 20) / (winId === "swb-win-tall" ? 40 : 58)));
      for (let f = 0; f < floors; f++) {
        const wy = base - (f + 1) * FH + (winId === "swb-win-tall" ? 10 : 22);
        for (let c = 0; c < cols; c++) {
          const wx = x + 14 + (w - 28 - ww) * (cols === 1 ? 0.5 : c / (cols - 1));
          if (f === 0 && wx + ww > dx - 8 && wx < dx + dw + 8) continue;
          if (f === 0 && o.shop && wx > dx + dw) continue;
          s += win(winId, wx, wy, k++);
          if (near && parts.has("flowers") && winId !== "swb-win-tall" && f > 0 && rnd(seed + "fb", k) < 0.55) s += use("swb-flowerbox", wx - 4, wy + 60, 1);
        }
        if (f === 1 && !far && parts.has("balcony") && kind !== "tower" && kind !== "spire") s += use("swb-balcony", x + w / 2 - 36, base - FH - 26, 1, ` color="${trim}"`);
      }
    }
    // Shop front: window, awning with its shadow, hanging sign.
    if (o.shop && kind !== "hut") {
      const sx = dx + dw + 14;
      if (sx + 70 < x + w - 6) s += far ? win("swb-shopwin", sx, base - 72, 98) : `<use href="#swb-shopwin" x="${r1(sx)}" y="${base - 72}" color="${trim}" class="swb-w${lit ? " is-lit" : ""}"/>`;
      const ax = x + 6,
        aw = w - 12,
        ay = base - 106;
      s += flat([[ax + 4, ay + 24], [ax + aw - 4, ay + 24], [ax + aw - 10, ay + 44], [ax + 10, ay + 44]], INK, ` opacity=".16"`);
      let stripes = "";
      const n = Math.max(4, Math.round(aw / 22));
      for (let j = 0; j < n; j++) stripes += `<path d="M${r1(ax + (aw * j) / n)} ${ay}h${r1(aw / n)}l-2 24h${r1(-aw / n)}Z" fill="${j % 2 ? tone("#fff4e0") : tone(o.shop)}"/>`;
      let scallop = `M${r1(ax - 2)} ${ay + 24}`;
      for (let j = 0; j < n; j++) scallop += `q${r1(aw / n / 2)} 10 ${r1(aw / n)} 0`;
      s += `<g class="sw-awning">${stripes}<path d="${scallop}" fill="${tone(o.shop)}"${line}/><path d="M${r1(ax - 2)} ${ay}H${r1(ax + aw + 2)}" stroke="${OUT}" stroke-opacity=".45" stroke-width="2.5"/><path d="M${r1(ax)} ${ay + 2}H${r1(ax + aw)}" stroke="#fff" stroke-opacity=".3" stroke-width="2"/></g>`;
    }
    if (kind === "hut") {
      s += `<path d="M${r1(dx)} ${base}V${base - 40}A22 22 0 0 1 ${r1(dx + 44)} ${base - 40}V${base}Z" fill="${tone("#5a4034")}"${line}/>`;
    } else {
      s += `<path d="M${r1(dx - 6)} ${base}V${base - dh + 18}A${r1(dw / 2 + 6)} ${r1(dw / 2 + 6)} 0 0 1 ${r1(dx + dw + 6)} ${base - dh + 18}V${base}Z" fill="${trim}"${line}/>`;
      s += `<path d="M${r1(dx)} ${base}V${base - dh + 18}A${r1(dw / 2)} ${r1(dw / 2)} 0 0 1 ${r1(dx + dw)} ${base - dh + 18}V${base}Z" fill="#3d3244"/>`;
      s += `<path d="M${r1(dx + 4)} ${base}V${base - dh + 20}A${r1(dw / 2 - 4)} ${r1(dw / 2 - 4)} 0 0 1 ${r1(dx + dw - 4)} ${base - dh + 20}V${base}Z" fill="${kind === "tower" || kind === "spire" ? "url(#swb-glass)" : tone(shade(o.roof, -0.3))}"/>`;
      s += `<circle cx="${r1(dx + dw - 11)}" cy="${base - 30}" r="3.5" fill="#f2c46b"/>` + box(dx - 10, base - 5, dw + 20, 5, tone(shade(o.stone || "#b8ab98", -0.2)), line);
      if (near && lvl >= 1) s += use("swb-lantern", dx - 14, base - dh - 4, 0.8, winCls(99));
    }
    if (parts.has("sign") && o.sign) {
      const sx = x + w - 8;
      s += `<path d="M${r1(sx)} ${base - 128}h26" stroke="#5e5570" stroke-width="3"/><circle cx="${r1(sx + 24)}" cy="${base - 108}" r="17" fill="${tone("#fff8ea")}"${line}/>${o.sign(sx + 24, base - 108)}`;
    }

    // Roofs carry the era, each with a lit and a shaded plane.
    if (kind === "hut") {
      const rh = 88 + Math.min(4, lvl) * 10;
      const L = x - 20,
        R = x + w + 20 + dep;
      const cx = (L + R) / 2;
      const d = `M${r1(L)} ${top + 8}Q${r1(cx - w * 0.2)} ${r1(top - rh * 1.25)} ${r1(cx)} ${r1(top - rh)}Q${r1(cx + w * 0.2)} ${r1(top - rh * 1.25)} ${r1(R)} ${top + 8}Z`;
      s += `<path d="${d}" fill="${roof}"${line}/><path d="${d}" fill="url(#swb-thatch)"/>`;
      s += `<path d="M${r1(cx)} ${r1(top - rh)}Q${r1(cx + w * 0.2)} ${r1(top - rh * 1.25)} ${r1(R)} ${top + 8}H${r1(cx)}Z" fill="${INK}" opacity=".13"/><path d="${d}" fill="url(#swb-sheen)"/>`;
      s += `<path d="M${r1(L + 4)} ${top + 10}H${r1(R - 4)}" stroke="${INK}" stroke-opacity=".28" stroke-width="6" stroke-linecap="round"/>`;
      if (lvl >= 2) s += `<path d="M${r1(cx)} ${r1(top - rh - 4)}V${r1(top - rh - 34)}" stroke="#8a5a36" stroke-width="4"/>` + use("swb-flag", cx, top - rh - 2, 0.5, ` color="${trim}"`);
    } else if (kind === "cabin" || kind === "house") {
      const rh = Math.min(kind === "house" ? 140 : 120, w * 0.48);
      const L = [x - 18, top + 6],
        P = [x + w / 2, top - rh],
        R = [x + w + 18, top + 6];
      if (parts.has("chimney")) s += use("swb-chimney", x + w * 0.7, top - rh * 0.72, 1, ` color="${tone(shade(o.stone || "#b8ab98", -0.1))}"`);
      s += flat([P, [P[0] + dep, P[1] - dep * 0.55], [R[0] + dep, R[1] - dep * 0.55], R], tone(shade(o.roof, -0.4)), line);
      s += poly([L, P, R], roof);
      s += flat([L, P, R], `url(#${kind === "house" ? "swb-tile" : "swb-shingle"})`);
      s += flat([P, R, [P[0], R[1]]], INK, ` opacity=".16"`) + flat([L, P, [P[0], L[1]]], "url(#swb-sheen)");
      s += `<path d="M${r1(L[0])} ${r1(L[1])}L${r1(P[0])} ${r1(P[1])}" stroke="#fff" stroke-opacity=".38" stroke-width="3"/><path d="M${r1(L[0])} ${r1(L[1] + 4)}H${r1(R[0])}" stroke="${INK}" stroke-opacity=".3" stroke-width="7"/>`;
      // Gable window, dormer and weathervane come with the lot's level.
      if (w > 120) s += win("swb-win-round", P[0], P[1] + rh * 0.55, 50, Math.min(1, w / 220), true);
      if (parts.has("dormer") && w > 170) {
        const dxr = x + w * 0.18;
        s += rect(dxr, top - rh * 0.34, 38, 34, wall) + poly([[dxr - 8, top - rh * 0.34 + 2], [dxr + 19, top - rh * 0.34 - 26], [dxr + 46, top - rh * 0.34 + 2]], roof) + win("swb-win", dxr + 8, top - rh * 0.34 + 6, 51, 0.6, true);
      }
      if (parts.has("turret")) s += `<path d="M${r1(P[0])} ${r1(P[1])}V${r1(P[1] - 30)}M${r1(P[0] - 12)} ${r1(P[1] - 22)}H${r1(P[0] + 12)}" stroke="#5e5570" stroke-width="3"/><path d="M${r1(P[0])} ${r1(P[1] - 34)}l12 5-12 5Z" fill="#f2b33d"/>`;
    } else if (kind === "manor") {
      const rh = 62 + Math.min(3, lvl) * 6;
      s += flat([[x + w - 30, top - rh], [x + w - 30 + dep, top - rh - dep * 0.5], [x + w + 12 + dep, top + 4 - dep * 0.5], [x + w + 12, top + 4]], tone(shade(o.roof, -0.4)), line);
      s += poly([[x - 12, top + 4], [x + 30, top - rh], [x + w - 30, top - rh], [x + w + 12, top + 4]], roof);
      s += flat([[x - 12, top + 4], [x + 30, top - rh], [x + w - 30, top - rh], [x + w + 12, top + 4]], "url(#swb-shingle)") + flat([[x - 12, top + 4], [x + 30, top - rh], [x + w / 2, top - rh], [x + w / 2, top + 4]], "url(#swb-sheen)");
      s += `<path d="M${r1(x + 30)} ${top - rh}H${r1(x + w - 30)}" stroke="#fff" stroke-opacity=".35" stroke-width="3"/><path d="M${r1(x - 12)} ${top + 7}H${r1(x + w + 12)}" stroke="${INK}" stroke-opacity=".3" stroke-width="7"/>`;
      const dorm = Math.max(1, Math.floor((w - 60) / 70));
      for (let j = 0; j < dorm; j++) s += win("swb-win-arch", x + 40 + (w - 110) * (dorm === 1 ? 0.5 : j / (dorm - 1)), top - rh + 8, 60 + j, 0.62, true);
      if (parts.has("chimney")) s += use("swb-chimney", x + w * 0.22, top - rh - 28, 1, ` color="${stone}"`);
      if (parts.has("turret") || hash(seed + "turret") < 0.4) {
        const tx = x + w - 62;
        s += rect(tx, top - rh - 70, 44, 74, wall) + box(tx, top - rh - 70, 44, 74, `url(#${mat})`) + box(tx + 30, top - rh - 70, 14, 74, INK, ` opacity=".14"`);
        s += poly([[tx - 8, top - rh - 70], [tx + 22, top - rh - 132], [tx + 52, top - rh - 70]], roof) + flat([[tx + 22, top - rh - 132], [tx + 52, top - rh - 70], [tx + 22, top - rh - 70]], INK, ` opacity=".16"`);
        s += win("swb-win-arch", tx + 11, top - rh - 58, 70, 0.6, true) + use("swb-flag", tx + 22, top - rh - 128, 0.55, ` color="${tone("#e05a4f")}"`);
      }
    } else if (kind === "tower") {
      s += rect(x - 4, top - 18, w + 8 + dep * 0.6, 20, tone(shade(o.roof, -0.05))) + box(x - 4, top - 18, w + 8, 5, "#fff", ` opacity=".3"`);
      if (lvl >= 1) s += rect(x + w * 0.62, top - 58, 34, 40, tone("#b9c3cc")) + box(x + w * 0.62 + 24, top - 58, 10, 40, INK, ` opacity=".16"`) + `<path d="M${r1(x + w * 0.62 - 4)} ${top - 60}h42" stroke="${OUT}" stroke-opacity=".4" stroke-width="4"/>`;
      if (lvl >= 2) s += `<path d="M${r1(x + w * 0.3)} ${top - 18}V${top - 96}M${r1(x + w * 0.3 - 12)} ${top - 70}H${r1(x + w * 0.3 + 12)}M${r1(x + w * 0.3 - 8)} ${top - 84}H${r1(x + w * 0.3 + 8)}" stroke="#5e5570" stroke-width="3"/><circle cx="${r1(x + w * 0.3)}" cy="${top - 100}" r="5" fill="#ff7b7b" class="sw-beacon"/>`;
      if (parts.has("sign")) s += rect(x + 10, top - 64, w * 0.46, 40, tone("#3a3150"), ` rx="4"`) + `<path d="M${r1(x + 22)} ${top - 44}h${r1(w * 0.3)}" stroke="url(#swb-neon)" stroke-width="7" stroke-linecap="round" class="swb-neon"/>`;
      if (parts.has("roofgarden")) for (let j = 0; j < 3; j++) s += `<ellipse cx="${r1(x + 18 + j * 26)}" cy="${top - 22}" rx="16" ry="12" fill="${tone(j % 2 ? "#7fab6e" : "#5f8a5d")}"/>`;
    } else {
      // spire: a rounded crown with glowing bands.
      const rr = w / 2 + 6;
      s += `<path d="M${r1(x - 6)} ${top + 4}A${r1(rr)} ${r1(w * 0.42)} 0 0 1 ${r1(x + w + 6)} ${top + 4}Z" fill="${roof}"${line}/>`;
      s += `<path d="M${r1(x + w / 2)} ${r1(top + 4 - w * 0.42)}A${r1(rr)} ${r1(w * 0.42)} 0 0 1 ${r1(x + w + 6)} ${top + 4}H${r1(x + w / 2)}Z" fill="${INK}" opacity=".15"/><path d="M${r1(x - 6)} ${top + 4}A${r1(rr)} ${r1(w * 0.42)} 0 0 1 ${r1(x + w + 6)} ${top + 4}Z" fill="url(#swb-sheen)"/>`;
      s += `<path d="M${r1(x + 8)} ${top - 10}H${r1(x + w - 8)}" stroke="url(#swb-neon)" stroke-width="5" stroke-linecap="round" class="swb-neon"/>`;
      for (let f = 1; f < floors; f++) s += `<path d="M${r1(x + 2)} ${base - f * FH - 4}H${r1(x + w - 2)}" stroke="url(#swb-neon)" stroke-width="3" class="swb-neon" opacity=".8"/>`;
      s += `<path d="M${r1(x + w / 2)} ${r1(top - w * 0.42)}V${r1(top - w * 0.42 - 40 - lvl * 3)}" stroke="${OUT}" stroke-width="2.5"/><circle cx="${r1(x + w / 2)}" cy="${r1(top - w * 0.42 - 44 - lvl * 3)}" r="6" fill="${trim}" class="sw-beacon"/>`;
      if (parts.has("turret") && hash(seed + "ring") < 0.3) s += `<ellipse cx="${r1(x + w / 2)}" cy="${r1(top - w * 0.2)}" rx="${r1(w * 0.72)}" ry="10" fill="none" stroke="url(#swb-neon)" stroke-width="4" class="swb-neon"/>`;
    }
    return s + `</g>`;
  }

  // ---------- rows: a street's lots at one depth ----------
  // Lots appear in order (count) and are drawn back to front of their own row, left to right.
  // opts: { base, g, variant, district, lit, scale, lift, haze, count, shops }
  function row(lots, opts) {
    const variant = opts.variant;
    const pal = palette(variant, opts.district);
    const style = { kind: STYLES[variant].kind, height: opts.height || 1, maxFloors: opts.maxFloors };
    // Grown eras keep some of the previous era's buildings among the new ones, so a street never turns uniform.
    const keep = { kingdom: "house", modern: "manor", future: "tower", starport: "tower" }[variant];
    const scale = opts.scale || 1;
    const base = opts.base;
    const shown = [];
    let s = "";
    for (const [i, lot] of lots.entries()) {
      if (opts.count !== undefined && (lot.order ?? i) >= opts.count) continue;
      if (opts.g < (lot.since || 0)) continue;
      const seed = `${opts.district}:${opts.rowId}:${i}`;
      const e = evolve(lot, opts.g, style);
      const kind = lot.kind || (keep && !lot.shop && hash(seed + "keep") < 0.38 ? keep : e.kind);
      const shop = lot.shop && hash(seed + "open") < (opts.shops ?? 1) ? lot.shop : null;
      const body = house({
        x: lot.x,
        base,
        w: e.width,
        kind,
        floors: kind === e.kind ? e.floors : Math.min(MAX_FLOORS[kind], e.floors),
        lvl: e.lvl,
        parts: e.parts,
        seed,
        lit: opts.lit,
        wall: lot.wall || pal.wall(seed),
        roof: lot.roof || pal.roof(seed),
        trim: pal.trim,
        stone: pal.stone,
        mat: pal.mat,
        haze: opts.haze || 0,
        shop,
        sign: lot.sign,
        door: lot.door,
        detail: opts.detail || ((opts.haze || 0) >= 0.3 ? "far" : (opts.scale || 1) < 1 ? "mid" : "near"),
      });
      s += scale === 1 && !opts.lift ? body : `<g transform="translate(${lot.x} ${base - (opts.lift || 0)}) scale(${scale}) translate(${-lot.x} ${-base})">${body}</g>`;
      shown.push({ id: `${opts.rowId}${i}`, x: lot.x, since: lot.since || 0, lvl: e.lvl, floors: e.floors, width: e.width, kind, parts: e.parts.length });
    }
    return { svg: s, lots: shown };
  }

  // ---------- ground: grass verge, road, curb, retaining wall and soil, the same on every stretch ----------
  function surfaceOf(roads) {
    return roads === "asphalt" ? "#7d8591" : roads === "glow" ? "#a9c3cf" : roads === "stone" ? "url(#sw-slab)" : roads === "cobble" ? "url(#sw-cobble)" : "#dcc7a0";
  }

  function ground(c, skip = []) {
    const { x0, w, base, H, roads } = c;
    const idx = c.idx || 0;
    const x1 = x0 + w;
    const surface = surfaceOf(roads);
    const open = (x) => !skip.some(([a, b]) => x > a && x < b);
    let g = `<path d="M${x0} ${base - 6}H${x1}V${H}H${x0}Z" fill="#8fbd78"/>`;
    // Soil and strata first, so the road, curb and wall sit on top of them.
    g += `<path d="M${x0} ${base + 66}H${x1}V${H}H${x0}Z" fill="#b58e63"/>`;
    g += `<path d="M${x0} ${base + 114}Q${r1(x0 + w * 0.25)} ${base + 98} ${r1(x0 + w * 0.5)} ${base + 120}T${x1} ${base + 114}V${H}H${x0}Z" fill="#9d7a57"/>`;
    g += `<path d="M${x0} ${base + 218}Q${r1(x0 + w * 0.3)} ${base + 200} ${r1(x0 + w * 0.6)} ${base + 224}T${x1} ${base + 218}V${H}H${x0}Z" fill="#86664b"/>`;
    for (let k = 0; k < w / 90; k++) {
      const px = x0 + rnd(c.seed + "stone", k) * w;
      if (!open(px)) continue;
      const py = base + 150 + rnd(c.seed + "stoney", k) * 200,
        rx = 7 + rnd(c.seed + "stoner", k) * 13,
        ry = 4 + rnd(c.seed + "stoneh", k) * 7;
      g += `<ellipse cx="${r1(px)}" cy="${r1(py)}" rx="${r1(rx)}" ry="${r1(ry)}" fill="${k % 2 ? "#c9a57a" : "#6f5443"}" opacity=".55"/><ellipse cx="${r1(px - rx * 0.25)}" cy="${r1(py - ry * 0.35)}" rx="${r1(rx * 0.5)}" ry="${r1(ry * 0.35)}" fill="#fff" opacity=".12"/>`;
    }
    // Buried treasures of a grown city: roots early, pipes later, glowing cables at the end.
    for (let k = 0; k < w / 260; k++) {
      const px = x0 + 90 + k * 260 + rnd(c.seed + "rootx", k) * 90;
      if (!open(px)) continue;
      g += `<path d="M${r1(px)} ${base + 150}C${r1(px + 12)} ${base + 190} ${r1(px - 22)} ${base + 214} ${r1(px + 6)} ${base + 262}" fill="none" stroke="#6f5443" stroke-width="3" opacity=".45" stroke-linecap="round"/>`;
    }
    // Under the street the city grows too: a root cellar, then a timber mine gallery, brick vaults,
    // a subway and finally a glass tube — the same band, rebuilt every era, with lamps that light from dusk.
    if (idx >= 1) {
      const top = base + 196,
        bot = base + 292;
      let from = x0;
      for (const [a, b] of [...skip, [x1, x1]]) {
        if (a - from > 160) g += tunnel(c, from + 40, a - 40, top, bot);
        from = b;
      }
    }
    for (let k = 0; k < w / 520; k++) {
      const px = x0 + 200 + k * 520 + rnd(c.seed + "gem", k) * 200;
      if (!open(px)) continue;
      const py = base + 320 + rnd(c.seed + "gemy", k) * 40;
      g += `<path d="M${r1(px)} ${r1(py - 11)}l7 9-7 11-7-11Z" fill="${["#9fe6f2", "#ffe39a", "#c9b8f2"][k % 3]}" stroke="${OUT}" stroke-opacity=".3" opacity=".85"/>`;
    }
    // Road, curb and retaining wall, broken where the street crosses water.
    let from = x0;
    const wallFill = idx >= 5 ? "#b9c1c9" : idx >= 3 ? "#b8ab98" : idx >= 2 ? "#8a6848" : null;
    for (const [a, b] of [...skip, [x1, x1]]) {
      if (a > from) {
        const span = a - from;
        g += `<rect x="${from}" y="${base}" width="${span}" height="64" fill="${surface}"/><path d="M${from} ${base}H${a}" stroke="#f4ead2" stroke-width="5"/>`;
        g += `<rect x="${from}" y="${base}" width="${span}" height="18" fill="${INK}" opacity=".08"/>`;
        if (wallFill) {
          g += `<rect x="${from}" y="${base + 62}" width="${span}" height="12" fill="${shade(wallFill, 0.1)}"/><path d="M${from} ${base + 63}H${a}" stroke="#fff" stroke-opacity=".35" stroke-width="2"/>`;
          g += `<rect x="${from}" y="${base + 74}" width="${span}" height="70" fill="${wallFill}"/><rect x="${from}" y="${base + 74}" width="${span}" height="70" fill="url(#${idx >= 5 ? "swb-panel" : idx >= 3 ? "swb-stone" : "swb-log"})"/>`;
          g += `<rect x="${from}" y="${base + 74}" width="${span}" height="10" fill="${INK}" opacity=".2"/><rect x="${from}" y="${base + 130}" width="${span}" height="14" fill="url(#swb-ao)"/>`;
          for (let x = from + 30; x < a - 20; x += 150 + rnd(c.seed + "moss", x) * 60) g += `<path d="M${r1(x)} ${base + 74}q6 22 -2 38M${r1(x + 12)} ${base + 74}q4 14 0 24" stroke="#6ea35a" stroke-width="4" fill="none" stroke-linecap="round" opacity=".8"/>`;
        } else g += `<path d="M${from} ${base + 64}H${a}" stroke="#8e6f52" stroke-width="4"/>`;
      }
      from = b;
    }
    if (roads === "trail" || roads === "dirt")
      for (let k = 0; k < w / 50; k++) {
        const px = x0 + rnd(c.seed + "peb", k) * w;
        if (open(px)) g += `<ellipse cx="${r1(px)}" cy="${r1(base + 12 + rnd(c.seed + "peby", k) * 42)}" rx="${r1(3 + rnd(c.seed + "pebr", k) * 5)}" ry="2.5" fill="#bda27a" opacity=".7"/>`;
      }
    if (roads === "asphalt") g += `<path d="M${x0} ${base + 32}H${x1}" stroke="#f4efe4" stroke-width="4" stroke-dasharray="40 30"/>`;
    if (roads === "glow") g += `<path d="M${x0} ${base + 4}H${x1}" stroke="#9fe6f2" stroke-width="4" class="swb-neon"/>`;
    // Pools of lamplight on the road, shown from dusk.
    for (const lx of c.lamps || []) if (open(lx)) g += `<ellipse class="swb-pool" cx="${r1(lx)}" cy="${base + 26}" rx="110" ry="30" fill="url(#swb-pool)"/>`;
    return g;
  }

  // One stretch of the underground band, drawn in the era's own construction.
  function tunnel(c, a, b, top, bot) {
    const idx = c.idx || 0;
    const h = bot - top;
    const lit = c.lit !== false;
    const wall = idx >= 6 ? "#2f3a5c" : idx >= 5 ? "#5d6470" : idx >= 3 ? "#6a4c3a" : "#5e4535";
    let s = `<rect x="${r1(a)}" y="${top}" width="${r1(b - a)}" height="${h}" rx="${idx >= 6 ? h / 2 : 14}" fill="${wall}"/>`;
    s += `<rect x="${r1(a)}" y="${top}" width="${r1(b - a)}" height="18" rx="9" fill="${INK}" opacity=".35"/><rect x="${r1(a)}" y="${bot - 14}" width="${r1(b - a)}" height="14" fill="#fff" opacity=".08"/>`;
    s += `<rect x="${r1(a)}" y="${top}" width="${r1(b - a)}" height="${h}" rx="${idx >= 6 ? h / 2 : 14}" fill="none" stroke="${OUT}" stroke-opacity=".45" stroke-width="3"/>`;
    if (idx <= 2) {
      // Timber props, a lantern every third bay, a mine cart on its rails.
      for (let x = a + 60; x < b - 30; x += 150) s += `<path d="M${r1(x)} ${bot}V${top + 8}M${r1(x - 34)} ${top + 12}H${r1(x + 34)}" stroke="#a8744a" stroke-width="9"/><path d="M${r1(x + 3)} ${bot}V${top + 14}" stroke="${INK}" stroke-opacity=".25" stroke-width="3"/>`;
      s += `<path d="M${r1(a + 10)} ${bot - 8}H${r1(b - 10)}" stroke="#8f96a0" stroke-width="3"/>`;
      for (let x = a + 135; x < b - 30; x += 450) s += use("swb-lantern", x, top + 20, 0.9, ` class="swb-w${lit ? " is-lit" : ""}"`);
      if (b - a > 700) {
        const cx = a + 220 + rnd(c.seed + "cart", 0) * (b - a - 440);
        s += `<path d="M${r1(cx - 34)} ${bot - 44}H${r1(cx + 34)}L${r1(cx + 26)} ${bot - 16}H${r1(cx - 26)}Z" fill="#8a6848" stroke="${OUT}" stroke-opacity=".5" stroke-width="1.5"/><circle cx="${r1(cx - 16)}" cy="${bot - 12}" r="6" fill="#3a3150"/><circle cx="${r1(cx + 16)}" cy="${bot - 12}" r="6" fill="#3a3150"/><circle cx="${r1(cx - 10)}" cy="${bot - 48}" r="9" fill="#9fe6f2" opacity=".85"/><circle cx="${r1(cx + 8)}" cy="${bot - 50}" r="8" fill="#ffe39a" opacity=".85"/>`;
      }
    } else if (idx <= 4) {
      // Brick vaults: arches on piers, a lamp in each third vault.
      s += `<rect x="${r1(a)}" y="${top}" width="${r1(b - a)}" height="${h}" rx="14" fill="url(#swb-brick)"/>`;
      let n = 0;
      for (let x = a + 10; x < b - 90; x += 120, n++) {
        s += `<path d="M${r1(x)} ${bot}V${top + 44}A60 36 0 0 1 ${r1(x + 120)} ${top + 44}V${bot}" fill="none" stroke="#b8ab98" stroke-width="10"/>`;
        if (n % 3 === 1) s += use("swb-lantern", x + 60, top + 36, 0.9, ` class="swb-w${lit ? " is-lit" : ""}"`);
      }
      s += `<path d="M${r1(a + 6)} ${bot - 6}H${r1(b - 6)}" stroke="#6f9fae" stroke-width="7" opacity=".7"/>`;
    } else if (idx === 5) {
      // Subway: tiled wall, rails and a lit carriage.
      s += `<rect x="${r1(a)}" y="${top + 20}" width="${r1(b - a)}" height="${h - 34}" fill="url(#swb-panel)" opacity=".6"/><path d="M${r1(a)} ${top + 40}H${r1(b)}" stroke="#e3a93d" stroke-width="5"/><path d="M${r1(a + 8)} ${bot - 6}H${r1(b - 8)}" stroke="#c0c6ce" stroke-width="4"/>`;
      if (b - a > 700) {
        const tx = a + 120 + rnd(c.seed + "train", 0) * (b - a - 560);
        s += `<rect x="${r1(tx)}" y="${top + 26}" width="320" height="56" rx="18" fill="#eaf0f4" stroke="${OUT}" stroke-opacity=".5" stroke-width="2"/><rect x="${r1(tx)}" y="${top + 58}" width="320" height="10" fill="#6fae9a"/>`;
        for (let k = 0; k < 6; k++) s += `<use href="#swb-win-tall" transform="translate(${r1(tx + 22 + k * 50)} ${top + 32}) scale(.8 .38)" color="#b9c3cc" class="swb-w${lit ? " is-lit" : ""}"/>`;
      }
    } else {
      // Glass tube: a glowing rail and a capsule gliding in it.
      s += `<path d="M${r1(a + 30)} ${top + h / 2}H${r1(b - 30)}" stroke="url(#swb-neon)" stroke-width="6" class="swb-neon" opacity=".85"/><path d="M${r1(a + 20)} ${top + 16}H${r1(b - 20)}" stroke="#fff" stroke-opacity=".25" stroke-width="6" stroke-linecap="round"/>`;
      if (b - a > 600) {
        const tx = a + 100 + rnd(c.seed + "capsule", 0) * (b - a - 400);
        s += `<rect x="${r1(tx)}" y="${top + 20}" width="220" height="58" rx="29" fill="#f4f6fc" stroke="${OUT}" stroke-opacity=".5" stroke-width="2"/><rect x="${r1(tx + 24)}" y="${top + 32}" width="172" height="22" rx="11" fill="url(#swb-glass)"/><rect x="${r1(tx + 24)}" y="${top + 32}" width="172" height="22" rx="11" fill="url(#swb-glass-lit)" opacity="${lit ? 0.6 : 0}"/>`;
      }
    }
    return s;
  }

  // A tower crane over a street that is still building.
  function crane(x, base, s = 1) {
    return `<g class="sw-crane" transform="translate(${x} ${base}) scale(${s})"><path d="M0 0V-360M-14 0V-360M0-360L-14-340M-14-320L0-300M0-280L-14-260M-14-240L0-220M0-200L-14-180M-14-160L0-140M0-120L-14-100M-14-80L0-60" stroke="#e3a93d" stroke-width="5" fill="none"/><path d="M-110-360H150M-110-378H30" stroke="#e3a93d" stroke-width="7"/><path d="M-7-410L-110-360M-7-410L150-360" stroke="#5e5570" stroke-width="2"/><rect x="-120" y="-374" width="34" height="28" fill="#8a8f99"/><path d="M110-360V-270" stroke="#5e5570" stroke-width="2"/><rect x="94" y="-270" width="32" height="24" fill="#c79a68" stroke="${OUT}" stroke-opacity=".4"/></g>`;
  }

  // ---------- the near edge: planters and hedges in front of the curb (foreground layer) ----------
  function frontEdge(c, xs, flavor = "garden") {
    const { x0, base } = c;
    let s = "";
    for (const [i, x] of xs.entries()) {
      const px = x0 + x;
      const y = base + 150 + (i % 2) * 18;
      if (flavor === "harbor") {
        s += `<path d="M${px} ${y}V${y - 70}" stroke="#7b5a40" stroke-width="12" stroke-linecap="round"/><path d="M${px - 6} ${y - 70}h12" stroke="#5a4034" stroke-width="5"/><path d="M${px} ${y - 50}q60 30 120 0" stroke="#d8c3a0" stroke-width="5" fill="none"/>`;
        s += `<circle cx="${px + 60}" cy="${y - 14}" r="16" fill="#e05a4f" stroke="${OUT}" stroke-opacity=".4"/><path d="M${px + 45} ${y - 18}h30" stroke="#fff8ea" stroke-width="6"/>`;
      } else if (flavor === "lantern") {
        s += `<path d="M${px} ${y + 20}V${y - 110}" stroke="#4e4763" stroke-width="7"/><path d="M${px} ${y - 104}h40" stroke="#4e4763" stroke-width="4"/>` + use("swb-lantern", px + 36, y - 100, 1.4, ` class="swb-w is-lit"`);
        s += use("sw-bush", px + 70, y + 30, 1.1);
      } else if (flavor === "crystal") {
        for (let k = 0; k < 3; k++) s += `<path d="M${px + k * 26} ${y + 20}l12-${60 + k * 14} 12 ${60 + k * 14}Z" fill="${["#9db8f2", "#c9b8f2", "#9fe6f2"][k]}" stroke="${OUT}" stroke-opacity=".35" class="swb-neon" opacity=".9"/>`;
      } else {
        s += `<rect x="${px - 64}" y="${y - 30}" width="128" height="40" rx="6" fill="#b98a5a" stroke="${OUT}" stroke-opacity=".4" stroke-width="1.5"/><rect x="${px - 64}" y="${y - 30}" width="128" height="8" rx="3" fill="#fff" opacity=".2"/><rect x="${px + 30}" y="${y - 30}" width="34" height="40" fill="${INK}" opacity=".14"/>`;
        s += use("sw-bush", px - 30, y - 22, 1) + use("sw-bush", px + 34, y - 26, 0.9);
        if (flavor === "flowers" || i % 2) s += use("sw-flowers", px, y - 34, 1.2);
      }
    }
    return s;
  }

  // ---------- style-safe townsfolk: generic paper folk in their role's clothes, never a likeness ----------
  const TONES = [
    ["#e07d4f", "#fff1dc"],
    ["#6fae9a", "#fff4e0"],
    ["#5b6f8f", "#f3e3c3"],
    ["#e3a93d", "#fff8ea"],
    ["#8a6fa8", "#f6ecff"],
    ["#c9453d", "#fde8c8"],
  ];
  const SKIN = ["#ffe3c8", "#f6cfa8", "#e8b48a"];
  function townsfolk(role, tone) {
    const [coat, light] = TONES[tone % TONES.length];
    const skin = SKIN[tone % SKIN.length];
    const o = ` stroke="${OUT}" stroke-opacity=".55" stroke-width="1.6" stroke-linejoin="round"`;
    let s = `<ellipse cx="26" cy="85" rx="17" ry="4" fill="${INK}" opacity=".22"/>`;
    s += `<rect x="15" y="68" width="8" height="16" rx="3" fill="#4e4763"/><rect x="29" y="68" width="8" height="16" rx="3" fill="#4e4763"/>`;
    if (role === "TRAVELER") s += `<rect x="33" y="36" width="15" height="26" rx="5" fill="#a8744a"${o}/><path d="M36 42h9" stroke="#f2c46b" stroke-width="2"/>`;
    s += `<path d="M13 72Q10 50 17 40H35Q42 50 39 72Z" fill="${coat}"${o}/><path d="M17 40Q13 52 14 70H20Q18 54 21 40Z" fill="#fff" opacity=".22"/>`;
    if (role === "VENDOR") s += `<path d="M18 48H34V70H18Z" fill="${light}"${o}/><path d="M22 56h8" stroke="${coat}" stroke-width="2"/>`;
    else s += `<path d="M17 42Q26 50 35 42" fill="none" stroke="${light}" stroke-width="4" stroke-linecap="round"/>`;
    s += `<circle cx="26" cy="27" r="13" fill="${skin}"${o}/><circle cx="21.5" cy="28" r="1.6" fill="#3a3150"/><circle cx="30.5" cy="28" r="1.6" fill="#3a3150"/><ellipse cx="18.5" cy="32" rx="2.6" ry="1.6" fill="#f4a9a0" opacity=".7"/><ellipse cx="33.5" cy="32" rx="2.6" ry="1.6" fill="#f4a9a0" opacity=".7"/>`;
    if (role === "VILLAGER") s += `<ellipse cx="26" cy="18" rx="19" ry="5" fill="#e8c872"${o}/><path d="M17 17Q18 6 26 6T35 17Z" fill="#f2d98e"${o}/><path d="M17 15H35" stroke="${coat}" stroke-width="3"/>`;
    else if (role === "TRAVELER") s += `<path d="M13 20Q14 8 26 8T39 20Z" fill="${coat}"${o}/><path d="M34 19H45" stroke="${coat}" stroke-width="4" stroke-linecap="round"/><path d="M8 84L14 46" stroke="#8a6848" stroke-width="3" stroke-linecap="round"/>`;
    else if (role === "VENDOR") s += `<path d="M13 22Q14 10 26 10T39 22Q26 16 13 22Z" fill="${light}"${o}/><path d="M36 18l8 5-8 3Z" fill="${light}"${o}/><rect x="36" y="46" width="16" height="4" rx="2" fill="#b98a5a"/><circle cx="41" cy="44" r="3" fill="#f28c6d"/><circle cx="47" cy="44" r="3" fill="#ffd35e"/>`;
    else if (role === "FESTIVAL") s += `<path d="M18 16L27 -2L34 16Z" fill="${light}"${o}/><path d="M21 12L27 3L31 12" fill="none" stroke="${coat}" stroke-width="2.5"/><path d="M44 58V14" stroke="#8a6848" stroke-width="2"/><ellipse cx="44" cy="10" rx="8" ry="10" fill="${TONES[(tone + 2) % TONES.length][0]}"${o}/>`;
    else s += `<path d="M14 22Q14 11 26 11T38 22Z" fill="${coat}"${o}/><circle cx="26" cy="10" r="3.5" fill="${light}"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -4 54 94" width="54" height="94">${s}</svg>`;
  }

  const api = { ERA, DISTRICT_TINT, HAZE, grade, evolve, palette, defs, house, row, ground, surfaceOf, frontEdge, crane, townsfolk, TONES, kit: { OUT, INK, r1, rnd, shade, mix, pts, poly, flat, rect, box, use, esc, hash } };
  root.RenguinSeamlessBuildings = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
