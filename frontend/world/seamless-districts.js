/* Renguin World · seamless districts: the rest of Renguin City as further stretches of one street.
 *
 * Pure: state in, layout and layered SVG chunks out. The street grows outward in
 * unlock order, so a young city ends early and an old one keeps going:
 *
 *   主城區 → 創作者街區 → 旅行港區 → 影片大廳 → 鵝寶會員區 → 娛樂夜市區 → 星港之門
 *
 * A district the engine has not unlocked is a short fenced lot that says what
 * opens it (PREVIEW adds scaffolding). A district id the registry adds later and
 * this file does not know yet still gets a street stretch and a signpost, so the
 * JSON registry stays the place to grow the city.
 *
 * Every district paints the same street-hosted layers as the main street
 * (backdrop, buildings, street, foreground) in its own coordinates, and returns
 * resident spots, hotspots and effect descriptors. Characters are never drawn here.
 */
(function (root) {
  "use strict";
  const Art = root.RenguinSeamlessArt || (typeof require === "function" ? require("./seamless-art.js") : null);
  const Scene = root.RenguinWorldScene || (typeof require === "function" ? require("./world-scene.js") : null);
  const { hash, esc } = Scene;
  // The scene hash mixes a changing suffix poorly, so the counter leads the key.
  const rnd = (key, k) => hash(`${k}|${key}`);
  const { OUT, r1, shade, poly, rect, use } = Art.kit;
  const B = root.RenguinSeamlessBuildings || (typeof require === "function" ? require("./seamless-buildings.js") : null);
  const { flat, box } = B.kit;

  const ORDER = ["MAIN_CITY", "CREATOR_DISTRICT", "TRAVEL_DISTRICT", "VIDEO_HALL", "MEMBER_DISTRICT", "ENTERTAINMENT_DISTRICT", "FUTURE_GATE"];
  const OPEN_WIDTH = { MAIN_CITY: 2800, CREATOR_DISTRICT: 1800, TRAVEL_DISTRICT: 2200, VIDEO_HALL: 1700, MEMBER_DISTRICT: 1800, ENTERTAINMENT_DISTRICT: 1900, FUTURE_GATE: 1400 };
  const GENERIC_WIDTH = 1400;
  const CLOSED_WIDTH = 1000;
  // Resident spots relative to the district start; each keeps 180 units from the next and
  // stays clear of the district's hotspots, which sit above head height.
  const SPOTS = {
    CREATOR_DISTRICT: [140, 760, 1000, 1260, 1660],
    TRAVEL_DISTRICT: [150, 560, 900, 1240, 1700],
    VIDEO_HALL: [180, 520, 1180, 1520],
    MEMBER_DISTRICT: [170, 560, 920, 1330, 1640],
    ENTERTAINMENT_DISTRICT: [150, 640, 1000, 1360, 1720],
    FUTURE_GATE: [220, 1180],
    GENERIC: [260, 700, 1140],
  };
  const STATUS_LABEL = { UNLOCKED: "已開放", PREVIEW: "施工預告", LOCKED: "未解鎖" };
  const HOTSPOT_LABEL = { PLAZA: "廣場", MARKET: "市集", GYM: "健身角落", STUDIO: "拍攝棚", OFFICES: "辦公室", HARBOR: "碼頭", HOTEL: "旅館", PREMIERE: "首映廳", HATCHERY: "孵蛋所", STAGE: "舞台", NIGHT_MARKET: "夜市", GATE: "星港之門" };

  // ---------- layout: where every district sits on the street ----------
  function layout(state) {
    const rows = state?.districts || [];
    const byId = new Map(rows.map((d) => [d.id, d]));
    const ids = [...ORDER.filter((id) => id === "MAIN_CITY" || byId.has(id)), ...rows.map((d) => d.id).filter((id) => !ORDER.includes(id))];
    let x = 0;
    const districts = ids.map((id) => {
      const row = byId.get(id) || null;
      const status = id === "MAIN_CITY" ? "UNLOCKED" : row.status || "LOCKED";
      const open = status === "UNLOCKED";
      const width = open ? OPEN_WIDTH[id] || GENERIC_WIDTH : CLOSED_WIDTH;
      const spots = id === "MAIN_CITY" ? Art.GEOMETRY.city.spots : open ? SPOTS[id] || SPOTS.GENERIC : [];
      const d = { id, name: row?.name || "主城區", status, x, width, row, known: ORDER.includes(id), spots: spots.map((s) => (id === "MAIN_CITY" ? s : x + s)) };
      x += width;
      return d;
    });
    return { width: x, districts };
  }

  function at(plan, worldX) {
    return plan.districts.find((d) => worldX >= d.x && worldX < d.x + d.width) || plan.districts[plan.districts.length - 1];
  }

  // ---------- shared pieces ----------
  const svg = (layer, x0, w, H, body) => `<svg class="sw-art sw-city-${layer}" viewBox="${x0} 0 ${w} ${H}" width="${w}" height="${H}" aria-hidden="true" focusable="false">${body}</svg>`;

  // Grass, road, curb, retaining wall and soil for one stretch: the building kit's, the same as the main street's.
  function ground(c, skip = []) {
    return B.ground(c, skip);
  }

  function lamps(c, xs) {
    return xs.map((x) => use("sw-lamp", c.x0 + x, c.base, 1)).join("");
  }

  function tufts(c, xs) {
    let fg = "";
    for (const x of xs) fg += use("sw-tuft", c.x0 + x, c.base + 70, 1.2) + use("sw-tuft", c.x0 + x + 26, c.base + 72, 0.9);
    if (c.grass >= 2) for (let k = 0; k < c.w / 120; k++) fg += use("sw-tuft", c.x0 + 30 + k * 120 + rnd(c.seed + "tall", k) * 40, c.base + 66, 1.5 + c.grass * 0.25);
    return fg;
  }

  // A district's blocks: a hazy skyline behind (backdrop), a set-back row and the street front (buildings).
  // Lots are in district units; each appears at its grade and keeps upgrading as the world grows.
  function blocks(c, spec) {
    const o = { base: c.base, g: c.g, variant: c.variant, district: c.id, lit: c.lit, shops: c.shops, height: c.floors };
    const at = (list) => (list || []).map((l) => ({ ...l, x: c.x0 + l.x }));
    const sky = B.row(at(spec.sky), { ...o, rowId: "s", scale: 0.62, lift: 48, haze: 0.32, height: c.floors + 1, maxFloors: 6 });
    const back = B.row(at(spec.back), { ...o, rowId: "b", scale: 0.8, lift: 22, haze: 0.12, height: c.floors + 1, maxFloors: 5 });
    const front = B.row(at(spec.front), { ...o, rowId: "f", maxFloors: 4 });
    return { sky: sky.svg, back: back.svg, front: front.svg, lots: [...front.lots, ...back.lots, ...sky.lots] };
  }
  const skyline = (xs, since = []) => xs.map((x, i) => ({ x, w: 140 + Math.round(rnd("skyw", i) * 50), since: since[i] ?? i % 4, floors: i % 3 === 1 ? 1 : 0 }));
  // How far the world has grown past the grade a district's own building first stands at.
  const level = (c, since = 0) => Math.max(0, c.g - since);

  // A signpost at the start of every district: the district's own name, the only words on the street.
  function signpost(c, sub) {
    const x = c.x0 + 60;
    const b = c.base;
    return (
      `<g class="sw-signpost" data-district="${esc(c.id)}"><path d="M${x} ${b}V${b - 188}" stroke="#8a6848" stroke-width="9"/>` +
      `<path d="M${x - 50} ${b - 182}h150l18 18-18 18h-150Z" fill="#e8d3a8" stroke="${OUT}" stroke-opacity=".45" stroke-width="1.5"/><text x="${x + 22}" y="${b - 158}" class="sw-sign-dark">${esc(c.name)}</text>` +
      (sub ? `<path d="M${x - 44} ${b - 136}h128v26h-128Z" fill="${sub.fill}" stroke="${OUT}" stroke-opacity=".4" stroke-width="1.5"/><text x="${x + 20}" y="${b - 118}" class="sw-sign-small">${esc(sub.text)}</text>` : "") +
      `</g>`
    );
  }

  const hotspot = (c, key, box, extra = {}) => ({ id: `${c.id}.${key}`, district: c.id, key, label: `${c.name} · ${HOTSPOT_LABEL[key] || key}`, tip: HOTSPOT_LABEL[key] || key, box, active: (c.row?.active_hotspots || []).includes(key), ...extra });

  // A lit wall for a district's own building: side return, material, light edge, eave shadow, ground occlusion.
  function litWall(x, top, w, h, fill, mat = "swb-plank", dep = 18) {
    return (
      flat([[x + w, top], [x + w + dep, top - dep * 0.55], [x + w + dep, top + h - dep * 0.55], [x + w, top + h]], shade(fill, -0.3), ` stroke="${OUT}" stroke-opacity=".36" stroke-width="1.5"`) +
      rect(x, top, w, h, fill) + box(x, top, w, h, `url(#${mat})`) + box(x, top, w, h, "url(#swb-lightwall)") + box(x, top, w, 18, "#2c2340", ` opacity=".15"`) + box(x, top + h - 60, w, 60, "url(#swb-ao)")
    );
  }
  const contact = (x, base, w) => `<ellipse cx="${r1(x + w * 0.56)}" cy="${base + 3}" rx="${r1(w * 0.68)}" ry="14" fill="url(#swb-contact)"/>`;

  // ---------- a district that is not open yet: a fenced lot, and the city it will become as a faint skyline ----------
  const PREVIEW_SKY = {
    CREATOR_DISTRICT: [{ x: 160, w: 170 }, { x: 430, w: 300, kind: "tower" }, { x: 760, w: 170 }],
    TRAVEL_DISTRICT: [{ x: 160, w: 200 }, { x: 460, w: 90, kind: "tower" }, { x: 720, w: 220 }],
    VIDEO_HALL: [{ x: 180, w: 150 }, { x: 380, w: 420, kind: "manor" }, { x: 820, w: 140 }],
    MEMBER_DISTRICT: [{ x: 150, w: 160, kind: "hut" }, { x: 420, w: 200, kind: "hut" }, { x: 740, w: 180 }],
    ENTERTAINMENT_DISTRICT: [{ x: 160, w: 180 }, { x: 440, w: 160 }, { x: 700, w: 240, kind: "tent" }],
    FUTURE_GATE: [{ x: 160, w: 150, kind: "spire" }, { x: 420, w: 220, kind: "spire" }, { x: 760, w: 150, kind: "spire" }],
  };
  function lot(c) {
    const { x0, w, base } = c;
    const preview = c.status === "PREVIEW";
    let back = "",
      mid = "",
      fg = "";
    // The district's future skyline, faint like a plan, so a closed lot already hints at what is coming.
    const ghost = B.row((PREVIEW_SKY[c.id] || PREVIEW_SKY.CREATOR_DISTRICT).map((l) => ({ ...l, x: x0 + l.x })), { base, g: c.g + 6, variant: c.variant, district: c.id, lit: false, rowId: "p", scale: 0.66, lift: 46, haze: preview ? 0.5 : 0.62, height: c.floors + 1, maxFloors: 5 });
    back += `<g class="sw-blueprint" opacity="${preview ? 0.85 : 0.7}">${ghost.svg}</g>`;
    for (const [x, sc, id] of [[60, 0.7, "sw-pine"], [940, 0.75, "sw-pine"]]) back += use(id, x0 + x, base - 30, sc);
    // A board fence round the lot, with a gap the signboard stands in.
    for (let x = x0 + 170; x < x0 + w - 60; x += 34) {
      if (x > x0 + 360 && x < x0 + 660) continue;
      const h = 96 + rnd(c.seed + "fence", x) * 14;
      mid += rect(x, base - h, 28, h, x % 68 < 34 ? "#d6b98c" : "#c9aa7a", ` rx="3"`) + box(x + 20, base - h, 8, h, "#2c2340", ` opacity=".12"`);
    }
    mid += `<path d="M${x0 + 170} ${base - 60}H${x0 + 360}M${x0 + 660} ${base - 60}H${x0 + w - 60}" stroke="#a98458" stroke-width="6"/>`;
    if (preview) {
      mid += B.crane(x0 + 820, base, 0.9);
      for (let k = 0; k < 4; k++) mid += `<path d="M${x0 + 700 + k * 70} ${base}V${base - 300}" stroke="#c98c3a" stroke-width="6"/>`;
      for (const y of [100, 200, 300]) mid += `<path d="M${x0 + 690} ${base - y}H${x0 + 920}" stroke="#c98c3a" stroke-width="6"/>`;
      mid += `<path d="M${x0 + 700} ${base - 300}L${x0 + 910} ${base - 100}" stroke="#c98c3a" stroke-width="4" opacity=".7"/>`;
    } else {
      mid += `<g class="sw-crates">` + use("swb-crate", x0 + 720, base, 1.6) + use("swb-crate", x0 + 800, base, 1.1) + use("swb-crate", x0 + 740, base - 58, 1.2) + use("swb-barrel", x0 + 870, base, 1.2) + `</g>`;
    }
    // The signboard: name, status, and what unlocks it (the engine's own hint).
    const bx = x0 + 380;
    const hint = c.row?.unlock_hint || c.row?.summary || "";
    mid += `<g class="sw-lot-board" data-status="${esc(c.status)}"><path d="M${bx + 30} ${base}V${base - 150}M${bx + 250} ${base}V${base - 150}" stroke="#8a6848" stroke-width="8"/>`;
    mid += `<rect x="${bx + 8}" y="${base - 322}" width="280" height="190" rx="10" fill="#2c2340" opacity=".14"/>` + rect(bx, base - 330, 280, 190, "#fff8ea", ` rx="10"`) + rect(bx + 10, base - 320, 260, 44, preview ? "#f2b33d" : "#9d8f78", ` rx="6"`);
    mid += `<text x="${bx + 140}" y="${base - 290}" class="sw-sign">${esc(c.name)}</text><text x="${bx + 140}" y="${base - 244}" class="sw-sign-dark">${STATUS_LABEL[c.status] || c.status}</text>`;
    const lines = String(hint).match(/.{1,11}/g) || [];
    lines.slice(0, 3).forEach((line, i) => (mid += `<text x="${bx + 140}" y="${base - 210 + i * 24}" class="sw-sign-small">${esc(line)}</text>`));
    mid += `</g>`;
    fg += tufts(c, [60, 300, 640, 900]) + use("sw-bush", x0 + 120, base + 96, 1.2) + use("sw-bush", x0 + w - 120, base + 96, 1.3);
    return {
      backdrop: back,
      buildings: mid,
      street: ground({ ...c, lamps: [] }),
      foreground: fg,
      effects: [],
      hotspots: [hotspot(c, "LOT", [bx, base - 330, 280, 190], { tip: `${c.name} · ${STATUS_LABEL[c.status] || c.status}`, label: `${c.name}（${STATUS_LABEL[c.status] || c.status}）` })],
      stats: { kind: "lot", status: c.status, preview_lots: ghost.lots.length },
    };
  }

  // ---------- 創作者街區: the studio lot, creator lofts and the offices under the Star Office's light ----------
  function creator(c) {
    const { x0, base, st, lit } = c;
    const lv = level(c, 3);
    const k = blocks(c, {
      sky: skyline([150, 300, 460, 620, 780, 940, 1100, 1260, 1420, 1580, 1720], [0, 1, 3, 0, 2, 4, 1, 5, 2, 6, 3]),
      back: [{ x: 150, w: 170, since: 0 }, { x: 990, w: 150, since: 1 }, { x: 1290, w: 170, since: 3 }, { x: 1470, w: 180, since: 2 }, { x: 1650, w: 150, since: 5 }],
      front: [{ x: 918, w: 150, since: 4, shop: "#8a6fa8", floors: -1 }, { x: 1430, w: 160, since: 2, shop: "#5b6f8f" }, { x: 1608, w: 170, since: 6 }],
    });
    let back = k.sky,
      mid = k.back + k.front,
      fg = "";
    // An antenna mast rises behind the studio as the district grows.
    if (lv >= 2) back += `<g class="sw-mast"><path d="M${x0 + 700} ${base - 30}L${x0 + 730} ${base - 520}L${x0 + 760} ${base - 30}M${x0 + 712} ${base - 280}H${x0 + 748}M${x0 + 720} ${base - 400}H${x0 + 740}" stroke="#8a8f99" stroke-width="6" fill="none"/><circle cx="${x0 + 730}" cy="${base - 530}" r="8" fill="#ff7b7b" class="sw-beacon"/></g>`;
    mid += signpost(c, { text: "Star Office 的燈", fill: "#f3e3c3" });
    if (c.landmarks.has("CREATOR_TOTEM")) {
      const tx = x0 + 330;
      mid += `<g class="sw-totem">` + litWall(tx - 22, base - 250, 44, 250, "#b98a5a", "swb-log", 10) + rect(tx - 34, base - 290, 68, 50, "#5b6f8f", ` rx="8"`) + `<circle cx="${tx}" cy="${base - 265}" r="15" fill="#ffe39a" stroke="${OUT}" stroke-opacity=".5"/>`;
      mid += poly([[tx - 60, base - 200], [tx - 22, base - 214], [tx - 22, base - 186]], "#e07d4f") + poly([[tx + 60, base - 200], [tx + 22, base - 214], [tx + 22, base - 186]], "#e07d4f") + `</g>`;
    }
    // Studio: a soundstage that grows an arched roof; the clapperboard stays its sign.
    const sx = x0 + 420,
      sw = 330,
      stop = base - 290;
    mid += contact(sx, base, sw) + `<g class="sw-studio">`;
    if (lv >= 1) mid += `<path d="M${sx - 10} ${stop + 6}Q${sx + sw / 2} ${stop - 90} ${sx + sw + 26} ${stop + 6}Z" fill="#8a93a8" stroke="${OUT}" stroke-opacity=".4" stroke-width="1.5"/><path d="M${sx + sw / 2} ${stop - 42}Q${sx + sw * 0.8} ${stop - 40} ${sx + sw + 26} ${stop + 6}H${sx + sw / 2}Z" fill="#2c2340" opacity=".15"/>`;
    mid += litWall(sx, stop, sw, 290, "#e9dcc6", "swb-panel", 16);
    mid += rect(sx + 30, base - 120, 120, 120, "#6b5a4c", ` rx="4"`) + `<path d="M${sx + 90} ${base - 120}V${base}" stroke="#4f4238" stroke-width="3"/>` + box(sx + 30, base - 120, 120, 12, "#2c2340", ` opacity=".25"`);
    for (const wx of [sx + 190, sx + 250]) mid += `<use href="#swb-win-tall" x="${wx}" y="${stop + 50}" color="#d6cfc2" class="swb-w${lit ? " is-lit" : ""}"/>`;
    mid += `<g transform="translate(${sx + 60} ${stop - 70}) rotate(-8)">` + rect(0, 20, 210, 56, "#3a3150", ` rx="4"`) + rect(0, 0, 210, 22, "#fff8ea", ` rx="3"`);
    for (let j = 0; j < 6; j++) mid += `<path d="M${10 + j * 34} 0l20 22h-14l-20-22Z" fill="#3a3150"/>`;
    mid += `<text x="105" y="58" class="sw-sign">STUDIO</text></g>`;
    mid += rect(sx + sw - 110, stop + 14, 90, 30, c.row?.active_hotspots?.includes("STUDIO") ? "#e05a4f" : "#9d8f78", ` rx="15" class="sw-onair"`) + `<text x="${sx + sw - 65}" y="${stop + 35}" class="sw-sign">ON AIR</text>`;
    mid += `<g class="sw-camera"><path d="M${sx + sw + 50} ${base}L${sx + sw + 74} ${base - 90}L${sx + sw + 98} ${base}M${sx + sw + 74} ${base}V${base - 90}" stroke="#4e4763" stroke-width="5" stroke-linecap="round"/>` + rect(sx + sw + 40, base - 130, 70, 44, "#4e4763", ` rx="8"`) + `<circle cx="${sx + sw + 118}" cy="${base - 108}" r="14" fill="#8fc8e8" stroke="#4e4763" stroke-width="5"/></g>`;
    mid += `</g>`;
    // The Star Office's light: a tall star lamp pointing up at the island.
    const lx = x0 + 880;
    mid += `<g class="sw-starlamp"><path d="M${lx} ${base}V${base - 360}" stroke="#4e4763" stroke-width="9"/><circle cx="${lx}" cy="${base - 380}" r="30" fill="#fff8e8" stroke="${OUT}" stroke-opacity=".4"/><path d="M${lx} ${base - 404}l7 15 16 2-12 11 3 16-14-8-14 8 3-16-12-11 16-2Z" fill="#f2b33d"/></g>`;
    // Offices: two to four floors with lit desks; the building upgrades with the world.
    const floors = Math.max(2, Math.min(4, c.floors + 1));
    const ox = x0 + 1100;
    const ev = B.evolve({ w: 300, since: 3 }, c.g, { kind: st.kind === "tent" || st.kind === "hut" ? "cabin" : st.kind === "cabin" ? "house" : st.kind, height: floors, maxFloors: floors });
    mid += `<g class="sw-offices">` + B.house({ x: ox, base, w: 300, floors, kind: ev.kind, lvl: ev.lvl, parts: ev.parts, seed: c.seed + "office", lit, wall: c.pal.wall(c.seed + "office"), roof: c.pal.roof(c.seed + "office"), trim: c.pal.trim, stone: c.pal.stone, mat: c.pal.mat, shop: "#5b6f8f" });
    mid += rect(ox + 70, base - floors * 88 - 70, 160, 34, "#3a3150", ` rx="6"`) + `<text x="${ox + 150}" y="${base - floors * 88 - 46}" class="sw-sign">OFFICES</text></g>`;
    mid += lamps(c, [700, 1560]) + use("sw-bench", x0 + 1460, base, 0.9) + use("sw-tree", x0 + 1780, base, 1);
    fg += tufts(c, [80, 380, 700, 1000, 1300, 1600]) + use("sw-flowers", x0 + 820, base + 72, 1.1) + use("sw-flowers", x0 + 1520, base + 72, 1) + B.frontEdge(c, [260, 1000, 1540], "flowers");
    const effects = [{ kind: "beacon", x: lx, y: base - 380 }];
    if (c.row?.active_hotspots?.includes("STUDIO")) effects.push({ kind: "glow", x: sx + sw - 65, y: stop + 29 });
    return {
      backdrop: back,
      buildings: mid,
      street: ground({ ...c, lamps: [700, 1560].map((x) => x0 + x) }),
      foreground: fg,
      effects,
      hotspots: [hotspot(c, "STUDIO", [sx, stop - 80, sw, 200]), hotspot(c, "OFFICES", [ox, base - floors * 88 - 90, 300, floors * 88 - 60])],
      stats: { kind: "creator", totem: c.landmarks.has("CREATOR_TOTEM"), office_floors: floors, lots: k.lots.length },
    };
  }

  // ---------- 旅行港區: a waterfront row across the river, the warehouse quay, the hotel and a lighthouse ----------
  function travel(c) {
    const { x0, w, base, st, lit } = c;
    const r0 = x0 + 380,
      r1x = x0 + 1420;
    const boats = Math.max(0, Math.min(6, c.row?.content_count || 0));
    const stoneBridge = c.idx >= 3;
    const lv = level(c, 3);
    const k = blocks(c, {
      sky: skyline([120, 280, 440, 600, 760, 920, 1080, 1240, 1400, 1700, 1860, 2020], [0, 2, 1, 3, 0, 4, 2, 5, 1, 3, 6, 2]),
      back: [{ x: 420, w: 160, since: 0 }, { x: 590, w: 180, since: 1 }, { x: 790, w: 160, since: 0 }, { x: 960, w: 190, since: 2 }, { x: 1160, w: 170, since: 3 }, { x: 1335, w: 140, since: 5 }, { x: 2095, w: 105, since: 6 }],
      front: [{ x: 150, w: 215, since: 0, shop: "#4f7fa3", floors: -1 }, { x: 2090, w: 105, since: 4, floors: -1 }],
    });
    let back = k.sky,
      mid = k.back + k.front,
      street = ground({ ...c, lamps: [1500, 1980].map((x) => x0 + x) }, [[r0, r1x]]),
      fg = "";
    back += `<path class="sw-hill-near" d="M${x0 + 300} ${base - 20}Q${x0 + 900} ${base - 140} ${x0 + 1500} ${base - 20}Z" opacity=".7"/>`;
    back += use("sw-pine", x0 + 1650, base - 30, 0.8) + use("sw-tree", x0 + 2080, base - 30, 0.75);
    if (lv >= 3) back += `<g class="sw-dock-crane"><path d="M${x0 + 1240} ${base - 30}L${x0 + 1260} ${base - 300}L${x0 + 1280} ${base - 30}M${x0 + 1246} ${base - 120}H${x0 + 1274}M${x0 + 1252} ${base - 210}H${x0 + 1268}" stroke="#e05a4f" stroke-width="8" fill="none"/><path d="M${x0 + 1260} ${base - 300}L${x0 + 1440} ${base - 380}M${x0 + 1260} ${base - 300}L${x0 + 1200} ${base - 290}" stroke="#e05a4f" stroke-width="9"/><rect x="${x0 + 1238}" y="${base - 318}" width="44" height="30" rx="4" fill="#fff8ea" stroke="${OUT}" stroke-opacity=".4"/><path d="M${x0 + 1430} ${base - 376}V${base - 250}" stroke="#5e5570" stroke-width="2"/><rect x="${x0 + 1414}" y="${base - 250}" width="32" height="24" fill="#6fae9a" stroke="${OUT}" stroke-opacity=".4"/></g>`;
    mid += signpost(c, { text: `碼頭 ${boats} 艘船`, fill: "#cfe6ee" });
    // Harbor master's board on the far bank, before the hotel: the harbor hotspot, above head height.
    const hx = x0 + 1490;
    mid += `<g class="sw-harbor-board"><path d="M${hx} ${base}V${base - 250}" stroke="#8a6848" stroke-width="8"/>` + rect(hx - 70, base - 330, 140, 90, "#fff8ea", ` rx="8"`) + `<path d="M${hx - 40} ${base - 300}q20-16 40 0t40 0M${hx - 40} ${base - 276}q20-16 40 0t40 0" stroke="#6f9fae" stroke-width="5" fill="none"/><text x="${hx}" y="${base - 250}" class="sw-sign-small">HARBOR</text></g>`;
    // Hotel on the far bank, upgrading with the world.
    const hotelX = x0 + 1560,
      hotelFloors = Math.max(2, Math.min(4, c.floors + 1));
    const ev = B.evolve({ w: 320, since: 3 }, c.g, { kind: st.kind === "tent" || st.kind === "hut" ? "cabin" : st.kind, height: hotelFloors, maxFloors: hotelFloors });
    mid += `<g class="sw-hotel">` + B.house({ x: hotelX, base, w: 320, floors: hotelFloors, kind: ev.kind, lvl: ev.lvl, parts: ev.parts, seed: c.seed + "hotel", lit, wall: c.pal.wall(c.seed + "hotel"), roof: c.pal.roof(c.seed + "hotel"), trim: c.pal.trim, stone: c.pal.stone, mat: c.pal.mat, shop: "#6fae9a" });
    mid += rect(hotelX + 90, base - hotelFloors * 88 - 70, 140, 36, "#3a3150", ` rx="6"`) + `<text x="${hotelX + 160}" y="${base - hotelFloors * 88 - 45}" class="sw-sign">HOTEL</text>`;
    mid += `<g class="sw-luggage">` + rect(hotelX + 350, base - 56, 44, 56, "#e07d4f", ` rx="6"`) + rect(hotelX + 400, base - 40, 36, 40, "#6fae9a", ` rx="6"`) + `<path d="M${hotelX + 362} ${base - 56}v-10h20v10" stroke="#4e4763" stroke-width="3" fill="none"/></g></g>`;
    // Lighthouse at the far end of the bank: taller, with a gallery, as the harbor grows.
    const lh = x0 + w - 170;
    const lhH = 300 + Math.min(4, lv) * 25;
    mid += contact(lh - 40, base, 80) + `<g class="sw-lighthouse">` + poly([[lh - 40, base], [lh - 24, base - lhH], [lh + 24, base - lhH], [lh + 40, base]], "#fff8ea") + flat([[lh, base], [lh, base - lhH], [lh + 24, base - lhH], [lh + 40, base]], "#2c2340", ` opacity=".12"`);
    mid += rect(lh - 31, base - lhH * 0.7, 62, 26, "#e05a4f") + rect(lh - 36, base - lhH * 0.37, 72, 26, "#e05a4f");
    if (lv >= 1) mid += rect(lh - 44, base - lhH - 6, 88, 10, "#5b6f8f") + `<path d="M${lh - 40} ${base - lhH - 6}v-14M${lh - 20} ${base - lhH - 6}v-14M${lh + 20} ${base - lhH - 6}v-14M${lh + 40} ${base - lhH - 6}v-14M${lh - 42} ${base - lhH - 20}H${lh + 42}" stroke="#5e5570" stroke-width="3"/>`;
    mid += `<rect x="${lh - 30}" y="${base - lhH - 50}" width="60" height="50" rx="6" fill="${lit ? "#ffe39a" : "#a9bfd0"}" stroke="${OUT}" stroke-opacity=".38" stroke-width="1.5" class="sw-win${lit ? " is-lit" : ""}"/>` + poly([[lh - 40, base - lhH - 50], [lh, base - lhH - 92], [lh + 40, base - lhH - 50]], "#5b6f8f");
    if (lit) mid += `<path class="swb-pool" d="M${lh} ${base - lhH - 26}L${lh - 420} ${base - lhH - 110}V${base - lhH + 40}Z" fill="url(#swb-halo)"/>`;
    mid += `</g>`;
    mid += lamps(c, [1500, 1980]);
    // The river cut, the harbor pier, boats on the water, then the bridge deck over it all.
    const water = base + 150;
    street += `<path d="M${r0} ${base + 40}Q${r0 + 30} ${base + 330} ${r0 + 220} ${base + 340}H${r1x - 220}Q${r1x - 30} ${base + 330} ${r1x} ${base + 40}Z" fill="#7a5c45"/>`;
    street += `<path d="M${r0 + 18} ${water}H${r1x - 18}Q${r1x - 40} ${base + 320} ${r1x - 220} ${base + 326}H${r0 + 220}Q${r0 + 40} ${base + 320} ${r0 + 18} ${water}Z" fill="url(#swb-water)"/><path d="M${r0 + 18} ${water}H${r1x - 18}V${water + 14}H${r0 + 18}Z" fill="#8cc0cb"/>`;
    for (let j = 0; j < 6; j++) street += `<path d="M${r0 + 120 + j * 150} ${water + 60 + (j % 2) * 40}q24 7 48 0t48 0" stroke="#d8eef0" stroke-width="4" fill="none" stroke-linecap="round"/>`;
    street += `<g class="sw-pier">` + rect(r0 + 30, water - 30, 300, 16, "#b98a5a") + `<path d="M${r0 + 50} ${water - 14}V${water + 60}M${r0 + 180} ${water - 14}V${water + 60}M${r0 + 310} ${water - 14}V${water + 60}" stroke="#7b5a40" stroke-width="9"/></g>`;
    for (let j = 0; j < boats; j++) {
      const bx = r0 + 400 + j * 100 + rnd(c.seed + "boat", j) * 20,
        color = ["#e07d4f", "#6fae9a", "#f2b33d", "#5b6f8f", "#c9b8f2", "#f28c6d"][j];
      street += `<g class="sw-boat" data-boat="${j}"><ellipse cx="${bx}" cy="${water + 24}" rx="48" ry="6" fill="#2c2340" opacity=".15"/><path d="M${bx - 44} ${water - 6}H${bx + 44}L${bx + 30} ${water + 20}H${bx - 30}Z" fill="${color}" stroke="${OUT}" stroke-opacity=".45" stroke-width="1.5"/><path d="M${bx} ${water - 6}H${bx + 44}L${bx + 30} ${water + 20}H${bx}Z" fill="#2c2340" opacity=".12"/><path d="M${bx} ${water - 6}V${water - 70}" stroke="#6f5646" stroke-width="3"/><path d="M${bx + 2} ${water - 66}L${bx + 34} ${water - 16}H${bx + 2}Z" fill="#fff8ea" stroke="${OUT}" stroke-opacity=".3"/></g>`;
    }
    // Bridge deck: planks early, stone arches from the town era.
    street += stoneBridge ? rect(r0 - 10, base - 4, r1x - r0 + 20, 52, "url(#sw-slab)") : rect(r0 - 10, base - 4, r1x - r0 + 20, 48, "#b98a5a", ` rx="3"`);
    street += box(r0 - 10, base + 36, r1x - r0 + 20, 12, "#2c2340", ` opacity=".18"`);
    // Piers into the water; a stone bridge also springs an arch between each pair.
    const piers = [];
    for (let x = r0 + 150; x < r1x - 100; x += 260) piers.push(x);
    for (const [i, x] of piers.entries()) {
      street += stoneBridge ? rect(x - 22, base + 44, 44, water - base - 30, "url(#sw-slab)") : `<path d="M${x} ${base + 44}V${water + 40}" stroke="#7b5a40" stroke-width="12"/>`;
      if (stoneBridge && piers[i + 1]) street += `<path d="M${x + 22} ${water - 40}Q${(x + piers[i + 1]) / 2} ${base + 40} ${piers[i + 1] - 22} ${water - 40}" fill="none" stroke="#a9a193" stroke-width="14"/>`;
    }
    if (!stoneBridge) for (let x = r0; x < r1x; x += 22) street += `<path d="M${x} ${base - 2}v44" stroke="#8a6848" stroke-width="2" opacity=".5"/>`;
    street += `<path d="M${r0 - 10} ${base - 44}H${r1x + 10}M${r0 - 10} ${base - 24}H${r1x + 10}" stroke="#8a6848" stroke-width="5"/>`;
    for (let x = r0 - 4; x <= r1x + 4; x += 130) street += `<path d="M${x} ${base - 4}V${base - 52}" stroke="#8a6848" stroke-width="7" stroke-linecap="round"/>`;
    if (lv >= 2) for (let x = r0 + 60; x < r1x; x += 130) street += use("swb-lantern", x, base - 44, 0.9, ` class="swb-w${lit ? " is-lit" : ""}"`);
    // Crates and barrels along the warehouse quay.
    mid += use("swb-crate", x0 + 262, base, 1) + use("swb-crate", x0 + 305, base, 0.8) + use("swb-barrel", x0 + 350, base, 0.9);
    fg += tufts(c, [60, 260, 1450, 1700, 1950, 2140]) + use("sw-bush", x0 + 1480, base + 96, 1.2) + B.frontEdge(c, [140, 1560, 1860], "harbor");
    return {
      backdrop: back,
      buildings: mid,
      street,
      foreground: fg,
      effects: [{ kind: "beacon", x: lh, y: base - lhH - 25 }],
      hotspots: [hotspot(c, "HARBOR", [hx - 80, base - 340, 160, 110]), hotspot(c, "HOTEL", [hotelX, base - hotelFloors * 88 - 90, 320, hotelFloors * 88 - 60])],
      stats: { kind: "travel", boats, bridge: stoneBridge ? "stone" : "wood", lots: k.lots.length },
    };
  }

  // ---------- 影片大廳: the premiere hall, its marquee and the featured posters ----------
  function hall(c) {
    const { x0, base, lit } = c;
    const lv = level(c, 6);
    const k = blocks(c, {
      sky: skyline([100, 250, 1330, 1480, 1600], [0, 2, 1, 3, 4]),
      back: [{ x: 140, w: 190, since: 0 }, { x: 1300, w: 150, since: 1 }, { x: 1470, w: 170, since: 2 }],
      front: [{ x: 150, w: 205, since: 8, shop: "#c9453d", floors: -1 }, { x: 1515, w: 165, since: 10 }],
    });
    let back = k.sky,
      mid = k.back + k.front,
      fg = "";
    back += use("sw-pine", x0 + 60, base - 30, 0.7) + use("sw-tree", x0 + 1660, base - 30, 0.8);
    mid += signpost(c, { text: "首映中", fill: "#f6d6d0" });
    const hx = x0 + 380,
      hw = 900,
      top = base - 420;
    // A fly tower rises behind the auditorium once the hall is established.
    if (lv >= 1) back += litWall(hx + 520, top - 200, 300, 620, "#d9c8e2", "swb-stone", 20);
    mid += contact(hx, base, hw) + `<g class="sw-hall">` + litWall(hx, top, hw, 420, "#e8dcef", "swb-stone", 18);
    if (c.landmarks.has("VIDEO_HALL_DOME")) mid += `<path d="M${hx + 200} ${top}A250 150 0 0 1 ${hx + 700} ${top}Z" fill="#c9b8f2" stroke="${OUT}" stroke-opacity=".4" stroke-width="1.5"/><path d="M${hx + 450} ${top - 150}A250 150 0 0 1 ${hx + 700} ${top}H${hx + 450}Z" fill="#2c2340" opacity=".14"/><path d="M${hx + 450} ${top - 150}V${top - 200}" stroke="${OUT}" stroke-width="3"/><circle cx="${hx + 450}" cy="${top - 206}" r="8" fill="#f2c14e" class="sw-beacon"/>`;
    mid += poly([[hx - 30, top + 10], [hx + hw / 2, top - 90], [hx + hw + 30, top + 10]], "#8a6fa8") + flat([[hx + hw / 2, top - 90], [hx + hw + 30, top + 10], [hx + hw / 2, top + 10]], "#2c2340", ` opacity=".16"`) + flat([[hx - 30, top + 10], [hx + hw / 2, top - 90], [hx + hw / 2, top + 10]], "url(#swb-sheen)");
    if (lv >= 3) mid += `<path d="M${hx + 330} ${top - 20}L${hx + 450} ${top - 70}L${hx + 570} ${top - 20}Z" fill="#f2c14e" stroke="${OUT}" stroke-opacity=".4"/><circle cx="${hx + 450}" cy="${top - 36}" r="10" fill="#fff8e8"/>`;
    // Columns between the posters; gilded as the world grows.
    for (const px of [hx + 34, hx + 300, hx + 590, hx + 866]) mid += rect(px - 14, top + 140, 28, 280, lv >= 4 ? "#f2e2b8" : "#f4eef6") + box(px + 6, top + 140, 8, 280, "#2c2340", ` opacity=".14"`) + rect(px - 20, top + 130, 40, 12, "#d9c8e2") + rect(px - 20, base - 16, 40, 16, "#d9c8e2");
    mid += rect(hx + 180, top + 40, 540, 90, "#3a3150", ` rx="10"`) + `<text x="${hx + 450}" y="${top + 100}" class="sw-sign sw-sign-big">RENGUIN HALL</text>`;
    for (let j = 0; j < 18; j++) mid += `<circle cx="${hx + 196 + j * 30}" cy="${top + 36}" r="6" class="sw-bulb${lit ? " is-lit" : ""}" fill="#ffe39a"/>`;
    // Posters: the featured contents, newest first; empty frames while there are none.
    const posters = (c.state?.featured_contents || []).slice(0, 3);
    for (let j = 0; j < 3; j++) {
      const px = hx + 90 + j * 290,
        py = top + 170;
      mid += box(px - 2, py - 2, 156, 206, "#2c2340", ` opacity=".16"`) + rect(px - 8, py - 8, 156, 206, "#b98a5a", ` rx="6"`);
      if (posters[j]) mid += rect(px, py, 140, 190, ["#fff8ea", "#fde8c8", "#e3f1ea"][j], ` rx="3"`) + `<path d="M${px + 58} ${py + 70}l34 20-34 20Z" fill="#e05a4f"/>` + (posters[j].is_new ? `<path d="M${px + 96} ${py + 6}h40v20h-40Z" fill="#e05a4f"/><text x="${px + 116}" y="${py + 21}" class="sw-tag">NEW</text>` : "");
      else mid += rect(px, py, 140, 190, "#f1e8d6", ` rx="3" stroke-dasharray="6 5"`);
    }
    // Doors, steps, red carpet, velvet ropes, ticket booth.
    mid += rect(hx + 360, base - 22, 180, 22, "#d9c8e2") + rect(hx + 380, base - 130, 140, 108, "#6f5140", ` rx="6"`) + `<path d="M${hx + 450} ${base - 130}V${base - 22}" stroke="#4f3a2e" stroke-width="3"/>` + box(hx + 380, base - 130, 140, 14, "#2c2340", ` opacity=".3"`);
    mid += `<path d="M${hx + 330} ${base}L${hx + 360} ${base - 8}H${hx + 540}L${hx + 570} ${base}Z" fill="#c9453d"/>`;
    for (const px of [hx + 310, hx + 590]) mid += `<path d="M${px} ${base}V${base - 50}" stroke="#d9b44a" stroke-width="6"/><circle cx="${px}" cy="${base - 54}" r="7" fill="#d9b44a"/>`;
    mid += `<path d="M${hx + 310} ${base - 42}Q${hx + 340} ${base - 20} ${hx + 370} ${base - 42}M${hx + 530} ${base - 42}Q${hx + 560} ${base - 20} ${hx + 590} ${base - 42}" stroke="#8e2f2a" stroke-width="5" fill="none"/>`;
    mid += `<g class="sw-booth">` + litWall(x0 + 1360, base - 170, 130, 170, "#f3e3c3", "swb-plank", 12) + `<use href="#swb-shopwin" transform="translate(${x0 + 1390} ${base - 150}) scale(.9 1)" color="#e8d3a8" class="swb-w${lit ? " is-lit" : ""}"/>` + poly([[x0 + 1350, base - 170], [x0 + 1425, base - 220], [x0 + 1500, base - 170]], "#e05a4f") + `<text x="${x0 + 1425}" y="${base - 70}" class="sw-sign-small">TICKET</text></g>`;
    mid += `</g>` + lamps(c, [1320, 1580]);
    fg += tufts(c, [60, 300, 1320, 1560]) + use("sw-flowers", x0 + 1300, base + 72, 1) + B.frontEdge(c, [220, 1380], "flowers");
    const effects = [];
    if (c.row?.active_hotspots?.includes("PREMIERE")) for (const [x, r] of [[hx + 120, -18], [hx + hw - 120, 18]]) effects.push({ kind: "spotlight", x, y: top - 10, r });
    return {
      backdrop: back,
      buildings: mid,
      street: ground({ ...c, lamps: [1320, 1580].map((x) => x0 + x) }),
      foreground: fg,
      effects,
      hotspots: [hotspot(c, "PREMIERE", [hx + 180, top - 40, 540, 170]), hotspot(c, "POSTERS", [hx + 82, top + 162, 736, 150], { tip: "精選影片", label: "影片大廳 · 精選影片", action: "videos" })],
      stats: { kind: "hall", posters: posters.length, dome: c.landmarks.has("VIDEO_HALL_DOME"), lots: k.lots.length },
    };
  }

  // ---------- 鵝寶會員區: the hatchery, nest cottages, the tier banners (aggregate counts only), the playground ----------
  function member(c) {
    const { x0, base, lit } = c;
    const population = c.state?.goosebaby?.population || null;
    const lv = level(c, 6);
    const k = blocks(c, {
      sky: skyline([120, 270, 700, 860, 1020, 1200, 1380, 1560, 1700], [0, 1, 2, 0, 3, 1, 4, 2, 5]),
      back: [{ x: 130, w: 150, since: 0 }, { x: 660, w: 150, since: 1 }, { x: 1040, w: 130, since: 2 }, { x: 1390, w: 150, since: 3 }, { x: 1570, w: 160, since: 4 }],
      front: [{ x: 1160, w: 200, since: 0 }, { x: 150, w: 130, since: 9, floors: -1 }],
    });
    let back = k.sky,
      mid = k.back + k.front,
      fg = "";
    back += use("sw-tree", x0 + 560, base - 30, 0.75) + use("sw-pine", x0 + 1760, base - 30, 0.7);
    mid += signpost(c, population && Number.isInteger(population.total) ? { text: `鵝寶人口 ${population.total}`, fill: "#fbe6b8" } : null);
    // Hatchery: an egg-shaped house on a straw nest; a second egg tower, bunting and a crown come later.
    const ex = x0 + 480;
    mid += `<g class="sw-hatchery">` + contact(ex - 170, base, 340);
    if (lv >= 2) mid += `<path d="M${ex + 190} ${base - 260}C${ex + 260} ${base - 260} ${ex + 268} ${base - 90} ${ex + 258} ${base - 30}Q${ex + 190} ${base + 4} ${ex + 122} ${base - 30}C${ex + 112} ${base - 90} ${ex + 120} ${base - 260} ${ex + 190} ${base - 260}Z" fill="#fbe3b6" stroke="${OUT}" stroke-opacity=".4" stroke-width="2"/><circle cx="${ex + 190}" cy="${base - 170}" r="20" fill="${lit ? "#ffe39a" : "#a9bfd0"}" stroke="#b9913f" stroke-width="4" class="sw-win${lit ? " is-lit" : ""}"/>`;
    mid += `<ellipse cx="${ex}" cy="${base - 6}" rx="190" ry="26" fill="#d8b56a"/><path d="M${ex - 200} ${base - 10}q40-30 80-6t80-6 80-6 80 6 80 6" stroke="#b9913f" stroke-width="5" fill="none"/>`;
    const egg = `M${ex} ${base - 400}C${ex + 150} ${base - 400} ${ex + 170} ${base - 150} ${ex + 150} ${base - 50}Q${ex} ${base + 10} ${ex - 150} ${base - 50}C${ex - 170} ${base - 150} ${ex - 150} ${base - 400} ${ex} ${base - 400}Z`;
    mid += `<path d="${egg}" fill="#fff4de" stroke="${OUT}" stroke-opacity=".4" stroke-width="2"/><path d="M${ex + 30} ${base - 398}C${ex + 150} ${base - 380} ${ex + 170} ${base - 150} ${ex + 150} ${base - 50}Q${ex + 80} ${base - 12} ${ex + 40} ${base - 14}C${ex + 110} ${base - 120} ${ex + 100} ${base - 320} ${ex + 30} ${base - 398}Z" fill="#2c2340" opacity=".1"/><path d="M${ex - 90} ${base - 330}Q${ex - 120} ${base - 250} ${ex - 110} ${base - 170}" stroke="#fff" stroke-width="14" opacity=".45" fill="none" stroke-linecap="round"/>`;
    mid += `<path d="M${ex - 150} ${base - 190}l40 26 40-30 40 30 40-30 40 30 40-26" stroke="#e7c98f" stroke-width="7" fill="none"/>`;
    mid += `<path d="M${ex - 44} ${base - 30}V${base - 110}A44 44 0 0 1 ${ex + 44} ${base - 110}V${base - 30}Z" fill="#8a6848"/><circle cx="${ex}" cy="${base - 270}" r="34" fill="${lit ? "#ffe39a" : "#a9bfd0"}" stroke="#b9913f" stroke-width="5"/>`;
    for (const [dx, dy, sc] of [[-150, -20, 1], [150, -18, 0.9], [-110, -8, 0.7]]) mid += `<ellipse cx="${ex + dx}" cy="${base + dy - 22 * sc}" rx="${18 * sc}" ry="${24 * sc}" fill="#fffaf0" stroke="${OUT}" stroke-opacity=".35"/>`;
    if (lv >= 4) mid += `<path d="M${ex - 60} ${base - 404}l20-40 20 26 20-34 20 34 20-26 20 40Z" fill="#f2c14e" stroke="${OUT}" stroke-opacity=".45" stroke-width="1.5"/>`;
    mid += `</g>`;
    if (lv >= 1) {
      mid += `<path d="M${ex + 150} ${base - 230}Q${ex + 420} ${base - 160} ${ex + 690} ${base - 250}" stroke="${OUT}" stroke-opacity=".4" stroke-width="2" fill="none"/>`;
      for (let j = 0; j < 9; j++) mid += `<path d="M${ex + 170 + j * 58} ${r1(base - 222 + Math.sin((j / 8) * Math.PI) * 30)}l12 22 12-22Z" fill="${["#f28c6d", "#ffd35e", "#9fd6d2", "#c9b8f2"][j % 4]}"/>`;
    }
    // Tier banners: flag heights follow the aggregate count per tier; no member row reaches the world.
    const tiers = population?.by_tier || {};
    const tierOrder = [["BRONZE", "#c98a55"], ["SILVER", "#b9c1cc"], ["GOLD", "#f2c14e"], ["PLATINUM", "#9fd6d2"]];
    const peak = Math.max(1, ...tierOrder.map(([key]) => tiers[key] || 0));
    tierOrder.forEach(([key, color], j) => {
      const px = x0 + 820 + j * 70,
        n = tiers[key] || 0;
      const h = 90 + Math.round((Math.log1p(n) / Math.log1p(peak)) * 140);
      mid += `<g class="sw-tier" data-tier="${key}"><path d="M${px} ${base}V${base - h - 40}" stroke="#6f5646" stroke-width="5"/><path d="M${px + 3} ${base - h - 40}h46l-12 20 12 20h-46Z" fill="${color}" stroke="${OUT}" stroke-opacity=".4"/><path d="M${px + 3} ${base - h - 30}h36" stroke="#fff" stroke-opacity=".35" stroke-width="3"/></g>`;
    });
    mid += `<g class="sw-playground"><path d="M${x0 + 1450} ${base}L${x0 + 1500} ${base - 130}H${x0 + 1540}L${x0 + 1640} ${base}" stroke="#e07d4f" stroke-width="10" fill="none" stroke-linecap="round"/><path d="M${x0 + 1500} ${base}V${base - 130}" stroke="#6f5646" stroke-width="6"/>`;
    mid += `<path d="M${x0 + 1680} ${base}V${base - 150}M${x0 + 1780} ${base}V${base - 150}M${x0 + 1670} ${base - 150}H${x0 + 1790}" stroke="#6f5646" stroke-width="7"/><path d="M${x0 + 1712} ${base - 150}V${base - 60}M${x0 + 1748} ${base - 150}V${base - 60}" stroke="#4e4763" stroke-width="3"/>` + rect(x0 + 1702, base - 64, 56, 10, "#f2b33d", ` rx="3"`) + `</g>`;
    mid += lamps(c, [760, 1420]);
    fg += tufts(c, [80, 300, 720, 1100, 1400, 1700]) + use("sw-flowers", x0 + 1080, base + 72, 1.1) + B.frontEdge(c, [320, 1010, 1560], "flowers");
    return {
      backdrop: back,
      buildings: mid,
      street: ground({ ...c, lamps: [760, 1420].map((x) => x0 + x) }),
      foreground: fg,
      effects: [{ kind: "glow", x: ex, y: base - 270 }],
      hotspots: [hotspot(c, "HATCHERY", [ex - 150, base - 410, 300, 200])],
      stats: { kind: "member", population: population?.total ?? null, tiers: tierOrder.map(([key]) => tiers[key] || 0), lots: k.lots.length },
    };
  }

  // ---------- 娛樂夜市區: the open-air stage, shophouses behind the night market, the big top and the wheel ----------
  function entertainment(c) {
    const { x0, base, lit, shops } = c;
    const lv = level(c, 9);
    const k = blocks(c, {
      sky: skyline([120, 260, 1660, 1790], [0, 2, 1, 3]),
      back: [{ x: 930, w: 160, since: 0 }, { x: 1100, w: 150, since: 1 }, { x: 1260, w: 170, since: 0 }, { x: 1440, w: 150, since: 2 }, { x: 1600, w: 170, since: 3 }, { x: 110, w: 150, since: 1 }],
      front: [{ x: 1660, w: 200, since: 9, shop: "#7d5aa8" }],
    });
    let back = k.sky,
      mid = k.back + k.front,
      fg = "";
    // The big top behind the stage, and a paper Ferris wheel behind the market.
    const tx = x0 + 560;
    back += `<g class="sw-bigtop"><path d="M${tx - 260} ${base - 30}L${tx - 230} ${base - 230}L${tx} ${base - 380}L${tx + 230} ${base - 230}L${tx + 260} ${base - 30}Z" fill="#f4e6d8" stroke="${OUT}" stroke-opacity=".4" stroke-width="1.5"/>`;
    for (let j = 0; j < 5; j++) back += `<path d="M${tx} ${base - 380}L${tx - 230 + j * 115} ${base - 230}L${tx - 260 + j * 130} ${base - 30}L${tx - 200 + j * 115} ${base - 30}L${tx - 172 + j * 100} ${base - 230}Z" fill="#c9453d" opacity=".85"/>`;
    back += `<path d="M${tx} ${base - 380}L${tx + 230} ${base - 230}L${tx + 260} ${base - 30}H${tx}Z" fill="#2c2340" opacity=".14"/><path d="M${tx} ${base - 380}V${base - 430}" stroke="#5e5570" stroke-width="4"/>` + use("swb-flag", tx, base - 380, 0.7, ` color="#f2c14e"`) + `</g>`;
    const fx = x0 + 1380,
      fy = base - 330;
    back += `<g class="sw-ferris" transform="translate(${fx} ${fy})"><circle r="220" fill="none" stroke="#b9a6c2" stroke-width="10"/><circle r="206" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="3"/>`;
    for (let j = 0; j < 8; j++) back += `<path d="M0 0L${r1(Math.cos((j * Math.PI) / 4) * 220)} ${r1(Math.sin((j * Math.PI) / 4) * 220)}" stroke="#b9a6c2" stroke-width="5"/><rect x="${r1(Math.cos((j * Math.PI) / 4) * 220 - 22)}" y="${r1(Math.sin((j * Math.PI) / 4) * 220)}" width="44" height="34" rx="8" fill="${["#f28c6d", "#7fc6c2", "#ffd35e", "#c9b8f2"][j % 4]}" stroke="${OUT}" stroke-opacity=".35"/>`;
    if (lv >= 2) for (let j = 0; j < 16; j++) back += `<circle cx="${r1(Math.cos((j * Math.PI) / 8) * 220)}" cy="${r1(Math.sin((j * Math.PI) / 8) * 220)}" r="6" class="sw-bulb${lit ? " is-lit" : ""}" fill="#ffe39a"/>`;
    back += `<path d="M-120 330L0 0L120 330" stroke="#8a6fa8" stroke-width="12" fill="none"/></g>`;
    mid += signpost(c, { text: "晚上最熱鬧", fill: "#e6d6f2" });
    // Stage.
    const sx = x0 + 300,
      sw = 520;
    mid += contact(sx, base, sw) + `<g class="sw-stage">` + litWall(sx, base - 90, sw, 90, "#8a6848", "swb-plank", 14) + rect(sx - 20, base - 380, 40, 380, "#6f5140") + rect(sx + sw - 20, base - 380, 40, 380, "#6f5140") + box(sx + 8, base - 380, 12, 380, "#2c2340", ` opacity=".2"`) + box(sx + sw + 8, base - 380, 12, 380, "#2c2340", ` opacity=".2"`);
    mid += rect(sx - 30, base - 420, sw + 60, 50, "#c9453d", ` rx="8"`) + box(sx - 30, base - 380, sw + 60, 10, "#2c2340", ` opacity=".2"`) + `<text x="${sx + sw / 2}" y="${base - 386}" class="sw-sign">STAGE</text>`;
    mid += `<path d="M${sx + 20} ${base - 370}Q${sx + 120} ${base - 250} ${sx + 90} ${base - 90}H${sx + 20}Z" fill="#e05a4f"/><path d="M${sx + sw - 20} ${base - 370}Q${sx + sw - 120} ${base - 250} ${sx + sw - 90} ${base - 90}H${sx + sw - 20}Z" fill="#b8423a"/>`;
    for (let j = 0; j < 6; j++) mid += `<circle cx="${sx + 60 + j * 80}" cy="${base - 360}" r="9" class="sw-bulb${lit ? " is-lit" : ""}" fill="#ffe39a"/>`;
    mid += `</g>`;
    // Night market stalls under a lantern string.
    const mx = x0 + 950;
    mid += `<path class="sw-lantern-string" d="M${mx - 40} ${base - 250}Q${mx + 330} ${base - 190} ${mx + 700} ${base - 250}" stroke="${OUT}" stroke-opacity=".4" stroke-width="2" fill="none"/>`;
    for (let j = 0; j < 9; j++) {
      const lxk = mx - 10 + j * 80;
      const ly = base - 250 + Math.sin((j / 8) * Math.PI) * 44;
      mid += `<ellipse cx="${lxk}" cy="${r1(ly + 22)}" rx="16" ry="20" class="sw-lantern${lit ? " is-lit" : ""}" fill="${j % 2 ? "#f28c6d" : "#ffd35e"}" stroke="${OUT}" stroke-opacity=".35"/>`;
    }
    for (let j = 0; j < 4; j++) {
      const x = mx + j * 170,
        open = rnd(c.seed + "stall", j) < Math.max(0.2, shops);
      mid += `<g class="sw-stall${open ? "" : " is-closed"}"><path d="M${x} ${base}V${base - 130}M${x + 140} ${base}V${base - 130}" stroke="#8a6848" stroke-width="6"/>` + rect(x - 4, base - 56, 148, 56, "#c79a68") + box(x - 4, base - 56, 148, 10, "#2c2340", ` opacity=".18"`);
      for (let t = 0; t < 6; t++) mid += `<path d="M${x - 10 + t * 27} ${base - 150}h27l-3 26h-27Z" fill="${t % 2 ? "#fff4e0" : open ? ["#e07d4f", "#6fae9a", "#8a6fa8", "#e3a93d"][j] : "#a9a3b5"}" stroke="${OUT}" stroke-opacity=".25"/>`;
      mid += `<path d="M${x - 6} ${base - 122}H${x + 146}L${x + 140} ${base - 106}H${x}Z" fill="#2c2340" opacity=".14"/>`;
      for (let f = 0; f < 6; f++) mid += `<circle cx="${x + 14 + f * 22}" cy="${base - 64}" r="7" fill="${["#f28c6d", "#ffd35e", "#9fd08a"][(f + j) % 3]}"/>`;
      mid += `</g>`;
    }
    mid += lamps(c, [880, 1800]);
    fg += tufts(c, [60, 260, 860, 1640, 1840]) + use("sw-bush", x0 + 1860, base + 96, 1.2) + B.frontEdge(c, [200, 900, 1520], "lantern");
    const effects = [];
    if (c.row?.active_hotspots?.includes("STAGE")) for (const [x, r] of [[sx + 40, -20], [sx + sw - 40, 20]]) effects.push({ kind: "spotlight", x, y: base - 400, r });
    return {
      backdrop: back,
      buildings: mid,
      street: ground({ ...c, lamps: [880, 1800].map((x) => x0 + x) }),
      foreground: fg,
      effects,
      hotspots: [hotspot(c, "STAGE", [sx - 30, base - 430, sw + 60, 150]), hotspot(c, "NIGHT_MARKET", [mx - 20, base - 290, 720, 100])],
      stats: { kind: "entertainment", ferris: true, lots: k.lots.length },
    };
  }

  // ---------- 星港之門: the street's last stop — the gate, its pylons and the launch tower ----------
  function gate(c) {
    const { x0, w, base } = c;
    const k = blocks(c, {
      sky: skyline([100, 260, 1120, 1260], [0, 1, 0, 2]),
      back: [{ x: 110, w: 150, since: 0, kind: "spire" }, { x: 1040, w: 150, since: 1, kind: "spire" }, { x: 1220, w: 140, since: 2 }],
      front: [{ x: 1010, w: 130, since: 22, kind: "spire", floors: -1 }],
    });
    let back = k.sky,
      mid = k.back + k.front,
      fg = "";
    back += `<path class="sw-hill-near" d="M${x0 + 200} ${base - 20}Q${x0 + 700} ${base - 180} ${x0 + 1200} ${base - 20}Z" opacity=".6"/>`;
    back += `<g class="sw-launch"><path d="M${x0 + 300} ${base - 30}V${base - 620}M${x0 + 340} ${base - 30}V${base - 620}" stroke="#8a93a8" stroke-width="10"/>` + [0, 1, 2, 3, 4, 5, 6].map((j) => `<path d="M${x0 + 300} ${base - 60 - j * 80}L${x0 + 340} ${base - 120 - j * 80}" stroke="#8a93a8" stroke-width="4"/>`).join("") + `<path d="M${x0 + 370} ${base - 30}V${base - 480}Q${x0 + 400} ${base - 580} ${x0 + 430} ${base - 480}V${base - 30}Z" fill="#f4f6fc" stroke="${OUT}" stroke-opacity=".4"/><path d="M${x0 + 400} ${base - 555}Q${x0 + 418} ${base - 520} ${x0 + 430} ${base - 480}V${base - 30}H${x0 + 400}Z" fill="#2c2340" opacity=".12"/><circle cx="${x0 + 400}" cy="${base - 400}" r="12" fill="url(#swb-glass)"/></g>`;
    mid += signpost(c, { text: "下一站：星星", fill: "#dfe5fb" });
    const gx = x0 + 720,
      gy = base - 330;
    mid += `<g class="sw-gate">` + rect(gx - 260, base - 50, 520, 50, "#c4bcad", ` rx="6"`) + rect(gx - 200, base - 90, 400, 40, "#d6cfc2", ` rx="6"`) + box(gx - 260, base - 50, 520, 14, "#2c2340", ` opacity=".16"`);
    for (const px of [gx - 290, gx + 250]) mid += litWall(px, base - 360, 40, 360, "#b7bfd6", "swb-panel", 10) + `<path d="M${px + 20} ${base - 340}V${base - 40}" stroke="url(#swb-neon)" stroke-width="6" class="swb-neon"/>`;
    mid += `<circle cx="${gx}" cy="${gy}" r="230" fill="none" stroke="#5b6f8f" stroke-width="44"/><path d="M${gx - 230} ${gy}A230 230 0 0 1 ${gx} ${gy - 230}" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="16"/><circle cx="${gx}" cy="${gy}" r="230" fill="none" stroke="#9db8f2" stroke-width="12" stroke-dasharray="30 22"/>`;
    mid += `<circle cx="${gx}" cy="${gy}" r="186" class="sw-gate-core" fill="#1f2758"/>`;
    for (let j = 0; j < 14; j++) mid += `<circle cx="${r1(gx + (rnd(c.seed + "star", j) - 0.5) * 300)}" cy="${r1(gy + (rnd(c.seed + "stary", j) - 0.5) * 300)}" r="${r1(2 + rnd(c.seed + "starr", j) * 3)}" fill="#fff8e8"/>`;
    mid += `</g>` + lamps(c, [300, 1140]);
    fg += tufts(c, [80, 360, 1100, w - 120]) + use("sw-fence", x0 + w - 200, base + 70, 1) + B.frontEdge(c, [140, 1120, 1290], "crystal");
    return {
      backdrop: back,
      buildings: mid,
      street: ground({ ...c, lamps: [300, 1140].map((x) => x0 + x) }),
      foreground: fg,
      effects: [{ kind: "gate", x: gx, y: gy }],
      hotspots: [hotspot(c, "GATE", [gx - 240, gy - 240, 480, 220])],
      stats: { kind: "gate", lots: k.lots.length },
    };
  }

  // ---------- a district the registry added later: a plain block with its name ----------
  function generic(c) {
    const { x0, base } = c;
    const k = blocks(c, { sky: skyline([200, 420, 640, 860, 1080]), back: [{ x: 560, w: 180, since: 0 }, { x: 1120, w: 170, since: 0 }], front: [{ x: 320, w: 220, since: 0 }, { x: 860, w: 240, since: 0 }] });
    let mid = k.back + k.front + signpost(c, null);
    mid += lamps(c, [700, 1240]);
    return { backdrop: k.sky + use("sw-tree", x0 + 600, base - 30, 0.7), buildings: mid, street: ground({ ...c, lamps: [700, 1240].map((x) => x0 + x) }), foreground: tufts(c, [80, 540, 1100]), effects: [], hotspots: [hotspot(c, "DISTRICT", [x0 + 320, base - 360, 780, 200], { tip: c.name })], stats: { kind: "generic", lots: k.lots.length } };
  }

  const PAINT = { CREATOR_DISTRICT: creator, TRAVEL_DISTRICT: travel, VIDEO_HALL: hall, MEMBER_DISTRICT: member, ENTERTAINMENT_DISTRICT: entertainment, FUTURE_GATE: gate };

  // Every district after the main street, as layer chunks in street coordinates.
  function paint(state, plan = layout(state)) {
    const G = Art.GEOMETRY.city;
    const idx = Art.eraIndex(state);
    const variant = Scene.VARIANTS[idx];
    const visual = state?.visual || {};
    const activity = state?.activity || {};
    const g = B.grade(state);
    return plan.districts
      .filter((d) => d.id !== "MAIN_CITY")
      .map((d) => {
        const c = {
          id: d.id,
          name: d.name,
          status: d.status,
          row: d.row,
          state,
          x0: d.x,
          w: d.width,
          base: G.ground,
          H: G.height,
          idx,
          g,
          variant,
          pal: B.palette(variant, d.id),
          st: Scene.STYLES[variant],
          lit: (activity.lights_level ?? 60) > 30,
          shops: visual.shops_open ?? 1,
          floors: Math.max(1, Math.min(4, visual.building_height || 1)),
          roads: visual.roads || "trail",
          grass: visual.grass_level || 0,
          landmarks: new Set(visual.landmarks || []),
          seed: "d:" + d.id,
        };
        const art = d.status !== "UNLOCKED" ? lot(c) : (PAINT[d.id] || generic)(c);
        const chunk = (layer) => svg(layer, d.x, d.width, G.height, art[layer]);
        return {
          id: d.id,
          x: d.x,
          width: d.width,
          status: d.status,
          layers: { backdrop: chunk("backdrop"), buildings: chunk("buildings"), street: chunk("street"), foreground: chunk("foreground") },
          effects: art.effects,
          hotspots: art.hotspots,
          spots: d.spots,
          stats: art.stats,
        };
      });
  }

  // ---------- the anonymous crowd: style-safe townsfolk, counted by the engine, spread by district crowd ----------
  const WEIGHT = { EMPTY: 0, QUIET: 1, NORMAL: 2, BUSY: 3, FESTIVAL: 4 };
  // Only roles without an authority character walk in the crowd (profession roles already stand as their one character).
  const ROLE = { VILLAGER: "VILLAGER", TRAVELER: "TRAVELER", VENDOR: "VENDOR", FESTIVAL_GOER: "FESTIVAL" };
  const DISTRICT_ROLES = {
    MAIN_CITY: ["VILLAGER", "VENDOR", "CITIZEN"],
    CREATOR_DISTRICT: ["CITIZEN", "VILLAGER"],
    TRAVEL_DISTRICT: ["TRAVELER", "TRAVELER", "CITIZEN"],
    VIDEO_HALL: ["FESTIVAL", "CITIZEN"],
    MEMBER_DISTRICT: ["VILLAGER", "FESTIVAL", "CITIZEN"],
    ENTERTAINMENT_DISTRICT: ["VENDOR", "FESTIVAL", "FESTIVAL"],
    FUTURE_GATE: ["TRAVELER", "CITIZEN"],
  };
  function rolesFor(state, id) {
    const engine = (state?.residents?.archetypes || []).filter((a) => a.resolution === "NEUTRAL_PLACEHOLDER" && ROLE[a.profession]);
    const here = engine.filter((a) => a.district === id).map((a) => ROLE[a.profession]);
    return [...here, ...(DISTRICT_ROLES[id] || ["CITIZEN"])];
  }
  function crowd(state, plan, cap) {
    const visible = Math.max(0, Math.min(cap, state?.residents?.visible || 0));
    const open = plan.districts.filter((d) => d.status === "UNLOCKED");
    const rows = open.map((d) => ({ d, weight: WEIGHT[d.id === "MAIN_CITY" ? d.row?.crowd_density || state?.activity?.crowd_density : d.row?.crowd_density] ?? 0 }));
    const total = rows.reduce((s, r) => s + r.weight, 0);
    if (!visible || !total) return [];
    // Largest remainder, so the counts add up to exactly what the engine says is visible.
    const shares = rows.map((r) => ({ ...r, exact: (visible * r.weight) / total }));
    shares.forEach((s) => (s.n = Math.floor(s.exact)));
    let left = visible - shares.reduce((s, r) => s + r.n, 0);
    for (const s of [...shares].sort((a, b) => b.exact - b.n - (a.exact - a.n))) if (left-- > 0) s.n += 1;
    const out = [];
    for (const s of shares) {
      const roles = rolesFor(state, s.d.id);
      for (let k = 0; k < s.n; k++) {
        const x = s.d.x + 120 + rnd("crowd:" + s.d.id, k) * (s.d.width - 240);
        out.push({
          district: s.d.id,
          x: Math.round(x),
          y: Art.GEOMETRY.city.ground + 18 + Math.round(rnd("crowdy:" + s.d.id, k) * 8),
          run: Math.round((rnd("run:" + s.d.id, k) - 0.5) * 360),
          dur: +(7 + rnd("dur:" + s.d.id, k) * 7).toFixed(1),
          delay: +(rnd("delay:" + s.d.id, k) * 9).toFixed(1),
          role: roles[Math.floor(rnd("role:" + s.d.id, k) * roles.length)],
          tone: Math.floor(rnd("tone:" + s.d.id, k) * B.TONES.length),
        });
      }
    }
    return out;
  }

  const api = { ORDER, OPEN_WIDTH, CLOSED_WIDTH, SPOTS, STATUS_LABEL, HOTSPOT_LABEL, layout, at, paint, crowd, ground };
  root.RenguinSeamlessDistricts = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
