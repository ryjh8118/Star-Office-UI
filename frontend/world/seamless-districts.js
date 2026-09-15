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
  const { OUT, r1, shade, poly, rect, use, facade } = Art.kit;

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

  function surfaceOf(roads) {
    return roads === "asphalt" ? "#7d8591" : roads === "glow" ? "#a9c3cf" : roads === "stone" ? "url(#sw-slab)" : roads === "cobble" ? "url(#sw-cobble)" : "#dcc7a0";
  }

  // Grass, road and soil for one stretch. Band edges meet the main street's (base+114, base+218), so stretches join without a seam.
  function ground(c, skip = []) {
    const { x0, w, base, H, roads } = c;
    const x1 = x0 + w;
    const surface = surfaceOf(roads);
    const open = (x) => !skip.some(([a, b]) => x > a && x < b);
    let g = `<path d="M${x0} ${base - 6}H${x1}V${H}H${x0}Z" fill="#8fbd78"/>`;
    let from = x0;
    for (const [a, b] of [...skip, [x1, x1]]) {
      if (a > from) g += `<rect x="${from}" y="${base}" width="${a - from}" height="64" fill="${surface}"/><path d="M${from} ${base}H${a}" stroke="#f4ead2" stroke-width="5"/><path d="M${from} ${base + 64}H${a}" stroke="#8e6f52" stroke-width="4"/>`;
      from = b;
    }
    if (roads === "trail" || roads === "dirt")
      for (let k = 0; k < w / 50; k++) {
        const px = x0 + rnd(c.seed + "peb", k) * w;
        if (open(px)) g += `<ellipse cx="${r1(px)}" cy="${r1(base + 10 + rnd(c.seed + "peby", k) * 44)}" rx="${r1(3 + rnd(c.seed + "pebr", k) * 5)}" ry="2.5" fill="#bda27a" opacity=".7"/>`;
      }
    if (roads === "asphalt") g += `<path d="M${x0} ${base + 32}H${x1}" stroke="#f4efe4" stroke-width="4" stroke-dasharray="40 30"/>`;
    if (roads === "glow") g += `<path d="M${x0} ${base + 4}H${x1}" stroke="#9fe6f2" stroke-width="4"/>`;
    g += `<path d="M${x0} ${base + 66}H${x1}V${H}H${x0}Z" fill="#b58e63"/>`;
    g += `<path d="M${x0} ${base + 114}Q${r1(x0 + w * 0.25)} ${base + 98} ${r1(x0 + w * 0.5)} ${base + 120}T${x1} ${base + 114}V${H}H${x0}Z" fill="#9d7a57"/>`;
    g += `<path d="M${x0} ${base + 218}Q${r1(x0 + w * 0.3)} ${base + 200} ${r1(x0 + w * 0.6)} ${base + 224}T${x1} ${base + 218}V${H}H${x0}Z" fill="#86664b"/>`;
    for (let k = 0; k < w / 70; k++) g += `<ellipse cx="${r1(x0 + rnd(c.seed + "stone", k) * w)}" cy="${r1(base + 90 + rnd(c.seed + "stoney", k) * 240)}" rx="${r1(6 + rnd(c.seed + "stoner", k) * 14)}" ry="${r1(4 + rnd(c.seed + "stoneh", k) * 8)}" fill="${k % 2 ? "#c9a57a" : "#6f5443"}" opacity=".55"/>`;
    return g;
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

  // ---------- a district that is not open yet ----------
  function lot(c) {
    const { x0, w, base } = c;
    const preview = c.status === "PREVIEW";
    let back = "",
      mid = "",
      fg = "";
    for (const [x, sc, id] of [[140, 0.7, "sw-pine"], [520, 0.62, "sw-tree"], [860, 0.75, "sw-pine"]]) back += use(id, x0 + x, base - 30, sc);
    // A board fence round the lot, with a gap the signboard stands in.
    for (let x = x0 + 170; x < x0 + w - 60; x += 34) {
      if (x > x0 + 360 && x < x0 + 660) continue;
      mid += rect(x, base - 96 - rnd(c.seed + "fence", x) * 14, 28, 96 + rnd(c.seed + "fence", x) * 14, x % 68 < 34 ? "#d6b98c" : "#c9aa7a", ` rx="3"`);
    }
    mid += `<path d="M${x0 + 170} ${base - 60}H${x0 + 360}M${x0 + 660} ${base - 60}H${x0 + w - 60}" stroke="#a98458" stroke-width="6"/>`;
    if (preview) {
      for (let k = 0; k < 4; k++) mid += `<path d="M${x0 + 700 + k * 70} ${base}V${base - 300}" stroke="#c98c3a" stroke-width="6"/>`;
      for (const y of [100, 200, 300]) mid += `<path d="M${x0 + 690} ${base - y}H${x0 + 920}" stroke="#c98c3a" stroke-width="6"/>`;
      mid += `<path d="M${x0 + 700} ${base - 300}L${x0 + 910} ${base - 100}" stroke="#c98c3a" stroke-width="4" opacity=".7"/>`;
    } else {
      mid += `<g class="sw-crates">` + rect(x0 + 720, base - 60, 70, 60, "#c79a68") + rect(x0 + 800, base - 44, 54, 44, "#b98a5a") + rect(x0 + 740, base - 110, 52, 50, "#d2a878") + `</g>`;
    }
    // The signboard: name, status, and what unlocks it (the engine's own hint).
    const bx = x0 + 380;
    const hint = c.row?.unlock_hint || c.row?.summary || "";
    mid += `<g class="sw-lot-board" data-status="${esc(c.status)}"><path d="M${bx + 30} ${base}V${base - 150}M${bx + 250} ${base}V${base - 150}" stroke="#8a6848" stroke-width="8"/>`;
    mid += rect(bx, base - 330, 280, 190, "#fff8ea", ` rx="10"`) + rect(bx + 10, base - 320, 260, 44, preview ? "#f2b33d" : "#9d8f78", ` rx="6"`);
    mid += `<text x="${bx + 140}" y="${base - 290}" class="sw-sign">${esc(c.name)}</text><text x="${bx + 140}" y="${base - 244}" class="sw-sign-dark">${STATUS_LABEL[c.status] || c.status}</text>`;
    const lines = String(hint).match(/.{1,11}/g) || [];
    lines.slice(0, 3).forEach((line, i) => (mid += `<text x="${bx + 140}" y="${base - 210 + i * 24}" class="sw-sign-small">${esc(line)}</text>`));
    mid += `</g>`;
    fg += tufts(c, [60, 300, 640, 900]) + use("sw-bush", x0 + 120, base + 96, 1.2) + use("sw-bush", x0 + w - 120, base + 96, 1.3);
    return {
      backdrop: back,
      buildings: mid,
      street: ground(c),
      foreground: fg,
      effects: [],
      hotspots: [hotspot(c, "LOT", [bx, base - 330, 280, 190], { tip: `${c.name} · ${STATUS_LABEL[c.status] || c.status}`, label: `${c.name}（${STATUS_LABEL[c.status] || c.status}）` })],
      stats: { kind: "lot", status: c.status },
    };
  }

  // ---------- 創作者街區: the studio and offices under the Star Office's light ----------
  function creator(c) {
    const { x0, base, st, lit } = c;
    let back = "",
      mid = "",
      fg = "";
    for (const [x, w, kind] of [[260, 170, "house"], [560, 150, "cabin"], [1500, 180, "house"]]) back += `<g transform="translate(${x0 + x} ${base - 34}) scale(.6) translate(${-(x0 + x)} ${-base})">${facade(st.kind === "tent" ? "hut" : kind, st, x0 + x, base, w, 1, c.seed + "cb" + x, lit)}</g>`;
    back += use("sw-tree", x0 + 900, base - 30, 0.7) + use("sw-pine", x0 + 1720, base - 30, 0.8);
    mid += signpost(c, { text: "Star Office 的燈", fill: "#f3e3c3" });
    if (c.landmarks.has("CREATOR_TOTEM")) {
      const tx = x0 + 330;
      mid += `<g class="sw-totem">` + rect(tx - 22, base - 250, 44, 250, "#b98a5a") + rect(tx - 34, base - 290, 68, 50, "#5b6f8f", ` rx="8"`) + `<circle cx="${tx}" cy="${base - 265}" r="15" fill="#ffe39a" stroke="${OUT}" stroke-opacity=".5"/>`;
      mid += poly([[tx - 60, base - 200], [tx - 22, base - 214], [tx - 22, base - 186]], "#e07d4f") + poly([[tx + 60, base - 200], [tx + 22, base - 214], [tx + 22, base - 186]], "#e07d4f") + `</g>`;
    }
    // Studio: a clapperboard on the roof, an ON AIR lamp, a camera on a tripod by the door.
    const sx = x0 + 420,
      sw = 330,
      stop = base - 290;
    mid += `<g class="sw-studio">` + poly([[sx + sw, stop], [sx + sw + 16, stop - 10], [sx + sw + 16, base - 10], [sx + sw, base]], shade("#e9dcc6", -0.24)) + rect(sx, stop, sw, 290, "#e9dcc6");
    mid += rect(sx + 30, base - 120, 120, 120, "#6b5a4c", ` rx="4"`) + `<path d="M${sx + 90} ${base - 120}V${base}" stroke="#4f4238" stroke-width="3"/>`;
    for (const wx of [sx + 190, sx + 250]) mid += rect(wx, stop + 50, 44, 60, lit ? "#ffe39a" : "#a9bfd0", ` rx="4" class="sw-win${lit ? " is-lit" : ""}"`);
    mid += `<g transform="translate(${sx + 60} ${stop - 70}) rotate(-8)">` + rect(0, 20, 210, 56, "#3a3150", ` rx="4"`) + rect(0, 0, 210, 22, "#fff8ea", ` rx="3"`);
    for (let k = 0; k < 6; k++) mid += `<path d="M${10 + k * 34} 0l20 22h-14l-20-22Z" fill="#3a3150"/>`;
    mid += `<text x="105" y="58" class="sw-sign">STUDIO</text></g>`;
    mid += rect(sx + sw - 110, stop + 14, 90, 30, c.row?.active_hotspots?.includes("STUDIO") ? "#e05a4f" : "#9d8f78", ` rx="15" class="sw-onair"`) + `<text x="${sx + sw - 65}" y="${stop + 35}" class="sw-sign">ON AIR</text>`;
    mid += `<g class="sw-camera"><path d="M${sx + sw + 50} ${base}L${sx + sw + 74} ${base - 90}L${sx + sw + 98} ${base}M${sx + sw + 74} ${base}V${base - 90}" stroke="#4e4763" stroke-width="5" stroke-linecap="round"/>` + rect(sx + sw + 40, base - 130, 70, 44, "#4e4763", ` rx="8"`) + `<circle cx="${sx + sw + 118}" cy="${base - 108}" r="14" fill="#8fc8e8" stroke="#4e4763" stroke-width="5"/></g>`;
    mid += `</g>`;
    // The Star Office's light: a tall star lamp pointing up at the island.
    const lx = x0 + 880;
    mid += `<g class="sw-starlamp"><path d="M${lx} ${base}V${base - 360}" stroke="#4e4763" stroke-width="9"/><circle cx="${lx}" cy="${base - 380}" r="30" fill="#fff8e8" stroke="${OUT}" stroke-opacity=".4"/><path d="M${lx} ${base - 404}l7 15 16 2-12 11 3 16-14-8-14 8 3-16-12-11 16-2Z" fill="#f2b33d"/></g>`;
    // Offices: two to four floors with lit desks.
    const floors = Math.max(2, Math.min(4, c.floors + 1));
    const ox = x0 + 1100;
    mid += `<g class="sw-offices">` + facade(st.kind === "tent" || st.kind === "hut" ? "cabin" : st.kind === "cabin" ? "house" : st.kind, st, ox, base, 300, floors, c.seed + "office", lit, { shop: "#5b6f8f", icon: `<path d="M${ox + 270} ${base - 124}h16v10h-16Z" fill="#5b6f8f"/>` });
    mid += rect(ox + 70, base - floors * 88 - 70, 160, 34, "#3a3150", ` rx="6"`) + `<text x="${ox + 150}" y="${base - floors * 88 - 46}" class="sw-sign">OFFICES</text></g>`;
    mid += lamps(c, [700, 1560]) + use("sw-bench", x0 + 1460, base, 0.9) + use("sw-tree", x0 + 1780, base, 1);
    fg += tufts(c, [80, 380, 700, 1000, 1300, 1600]) + use("sw-flowers", x0 + 820, base + 72, 1.1) + use("sw-flowers", x0 + 1520, base + 72, 1);
    const effects = [{ kind: "beacon", x: lx, y: base - 380 }];
    if (c.row?.active_hotspots?.includes("STUDIO")) effects.push({ kind: "glow", x: sx + sw - 65, y: stop + 29 });
    return {
      backdrop: back,
      buildings: mid,
      street: ground(c),
      foreground: fg,
      effects,
      hotspots: [hotspot(c, "STUDIO", [sx, stop - 80, sw, 200]), hotspot(c, "OFFICES", [ox, base - floors * 88 - 90, 300, floors * 88 - 60])],
      stats: { kind: "creator", totem: c.landmarks.has("CREATOR_TOTEM"), office_floors: floors },
    };
  }

  // ---------- 旅行港區: the street crosses the river on a bridge; one boat per trip ----------
  function travel(c) {
    const { x0, w, base, H, st, lit } = c;
    const r0 = x0 + 380,
      r1x = x0 + 1420;
    const boats = Math.max(0, Math.min(6, c.row?.content_count || 0));
    const stoneBridge = c.idx >= 3;
    let back = "",
      mid = "",
      street = ground(c, [[r0, r1x]]),
      fg = "";
    back += `<path class="sw-hill-near" d="M${x0 + 300} ${base - 20}Q${x0 + 900} ${base - 140} ${x0 + 1500} ${base - 20}Z" opacity=".7"/>`;
    back += use("sw-pine", x0 + 1650, base - 30, 0.8) + use("sw-tree", x0 + 2080, base - 30, 0.75);
    mid += signpost(c, { text: `碼頭 ${boats} 艘船`, fill: "#cfe6ee" });
    // Harbor master's board on the far bank, before the hotel: the harbor hotspot, above head height.
    const hx = x0 + 1490;
    mid += `<g class="sw-harbor-board"><path d="M${hx} ${base}V${base - 250}" stroke="#8a6848" stroke-width="8"/>` + rect(hx - 70, base - 330, 140, 90, "#fff8ea", ` rx="8"`) + `<path d="M${hx - 40} ${base - 300}q20-16 40 0t40 0M${hx - 40} ${base - 276}q20-16 40 0t40 0" stroke="#6f9fae" stroke-width="5" fill="none"/><text x="${hx}" y="${base - 250}" class="sw-sign-small">HARBOR</text></g>`;
    // Hotel on the far bank.
    const hotelX = x0 + 1560,
      hotelFloors = Math.max(2, Math.min(4, c.floors + 1));
    mid += `<g class="sw-hotel">` + facade(st.kind === "tent" || st.kind === "hut" ? "cabin" : st.kind, st, hotelX, base, 320, hotelFloors, c.seed + "hotel", lit, { shop: "#6fae9a", icon: `<path d="M${hotelX + 290} ${base - 126}h-16v10h16Z" fill="#6fae9a"/>` });
    mid += rect(hotelX + 90, base - hotelFloors * 88 - 70, 140, 36, "#3a3150", ` rx="6"`) + `<text x="${hotelX + 160}" y="${base - hotelFloors * 88 - 45}" class="sw-sign">HOTEL</text>`;
    mid += `<g class="sw-luggage">` + rect(hotelX + 350, base - 56, 44, 56, "#e07d4f", ` rx="6"`) + rect(hotelX + 400, base - 40, 36, 40, "#6fae9a", ` rx="6"`) + `<path d="M${hotelX + 362} ${base - 56}v-10h20v10" stroke="#4e4763" stroke-width="3" fill="none"/></g></g>`;
    // Lighthouse at the far end of the bank.
    const lh = x0 + w - 170;
    mid += `<g class="sw-lighthouse">` + poly([[lh - 40, base], [lh - 24, base - 300], [lh + 24, base - 300], [lh + 40, base]], "#fff8ea") + rect(lh - 30, base - 210, 60, 26, "#e05a4f") + rect(lh - 26, base - 110, 52, 26, "#e05a4f");
    mid += rect(lh - 30, base - 350, 60, 50, lit ? "#ffe39a" : "#a9bfd0", ` rx="6"`) + poly([[lh - 40, base - 350], [lh, base - 392], [lh + 40, base - 350]], "#5b6f8f") + `</g>`;
    mid += lamps(c, [1500, 1980]);
    // The river cut, the harbor pier, boats on the water, then the bridge deck over it all.
    const water = base + 150;
    street += `<path d="M${r0} ${base + 40}Q${r0 + 30} ${base + 330} ${r0 + 220} ${base + 340}H${r1x - 220}Q${r1x - 30} ${base + 330} ${r1x} ${base + 40}Z" fill="#7a5c45"/>`;
    street += `<path d="M${r0 + 18} ${water}H${r1x - 18}Q${r1x - 40} ${base + 320} ${r1x - 220} ${base + 326}H${r0 + 220}Q${r0 + 40} ${base + 320} ${r0 + 18} ${water}Z" fill="#6f9fae"/><path d="M${r0 + 18} ${water}H${r1x - 18}V${water + 14}H${r0 + 18}Z" fill="#8cc0cb"/>`;
    for (let k = 0; k < 6; k++) street += `<path d="M${r0 + 120 + k * 150} ${water + 60 + (k % 2) * 40}q24 7 48 0t48 0" stroke="#d8eef0" stroke-width="4" fill="none" stroke-linecap="round"/>`;
    street += `<g class="sw-pier">` + rect(r0 + 30, water - 30, 300, 16, "#b98a5a") + `<path d="M${r0 + 50} ${water - 14}V${water + 60}M${r0 + 180} ${water - 14}V${water + 60}M${r0 + 310} ${water - 14}V${water + 60}" stroke="#7b5a40" stroke-width="9"/></g>`;
    for (let k = 0; k < boats; k++) {
      const bx = r0 + 400 + k * 100 + rnd(c.seed + "boat", k) * 20,
        color = ["#e07d4f", "#6fae9a", "#f2b33d", "#5b6f8f", "#c9b8f2", "#f28c6d"][k];
      street += `<g class="sw-boat" data-boat="${k}"><path d="M${bx - 44} ${water - 6}H${bx + 44}L${bx + 30} ${water + 20}H${bx - 30}Z" fill="${color}" stroke="${OUT}" stroke-opacity=".45" stroke-width="1.5"/><path d="M${bx} ${water - 6}V${water - 70}" stroke="#6f5646" stroke-width="3"/><path d="M${bx + 2} ${water - 66}L${bx + 34} ${water - 16}H${bx + 2}Z" fill="#fff8ea" stroke="${OUT}" stroke-opacity=".3"/></g>`;
    }
    // Bridge deck: planks early, stone arches from the town era.
    street += stoneBridge ? rect(r0 - 10, base - 4, r1x - r0 + 20, 52, "url(#sw-slab)") : rect(r0 - 10, base - 4, r1x - r0 + 20, 48, "#b98a5a", ` rx="3"`);
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
    fg += tufts(c, [60, 260, 1450, 1700, 1950, 2140]) + use("sw-bush", x0 + 1480, base + 96, 1.2);
    return {
      backdrop: back,
      buildings: mid,
      street,
      foreground: fg,
      effects: [{ kind: "beacon", x: lh, y: base - 325 }],
      hotspots: [hotspot(c, "HARBOR", [hx - 80, base - 340, 160, 110]), hotspot(c, "HOTEL", [hotelX, base - hotelFloors * 88 - 90, 320, hotelFloors * 88 - 60])],
      stats: { kind: "travel", boats, bridge: stoneBridge ? "stone" : "wood" },
    };
  }

  // ---------- 影片大廳: the premiere hall, its marquee and the featured posters ----------
  function hall(c) {
    const { x0, base, lit } = c;
    let back = "",
      mid = "",
      fg = "";
    back += use("sw-pine", x0 + 120, base - 30, 0.7) + use("sw-tree", x0 + 1620, base - 30, 0.8);
    mid += signpost(c, { text: "首映中", fill: "#f6d6d0" });
    const hx = x0 + 380,
      hw = 900,
      top = base - 420;
    mid += `<g class="sw-hall">` + poly([[hx + hw, top], [hx + hw + 18, top - 12], [hx + hw + 18, base - 12], [hx + hw, base]], "#b9a6c2") + rect(hx, top, hw, 420, "#e8dcef");
    if (c.landmarks.has("VIDEO_HALL_DOME")) mid += `<path d="M${hx + 200} ${top}A250 150 0 0 1 ${hx + 700} ${top}Z" fill="#c9b8f2" stroke="${OUT}" stroke-opacity=".4" stroke-width="1.5"/>`;
    mid += poly([[hx - 30, top + 10], [hx + hw / 2, top - 90], [hx + hw + 30, top + 10]], "#8a6fa8");
    mid += rect(hx + 180, top + 40, 540, 90, "#3a3150", ` rx="10"`) + `<text x="${hx + 450}" y="${top + 100}" class="sw-sign sw-sign-big">RENGUIN HALL</text>`;
    for (let k = 0; k < 18; k++) mid += `<circle cx="${hx + 196 + k * 30}" cy="${top + 36}" r="6" class="sw-bulb${lit ? " is-lit" : ""}" fill="#ffe39a"/>`;
    // Posters: the featured contents, newest first; empty frames while there are none.
    const posters = (c.state?.featured_contents || []).slice(0, 3);
    for (let k = 0; k < 3; k++) {
      const px = hx + 90 + k * 290,
        py = top + 170;
      mid += rect(px - 8, py - 8, 156, 206, "#b98a5a", ` rx="6"`);
      if (posters[k]) mid += rect(px, py, 140, 190, ["#fff8ea", "#fde8c8", "#e3f1ea"][k], ` rx="3"`) + `<path d="M${px + 58} ${py + 70}l34 20-34 20Z" fill="#e05a4f"/>` + (posters[k].is_new ? `<path d="M${px + 96} ${py + 6}h40v20h-40Z" fill="#e05a4f"/><text x="${px + 116}" y="${py + 21}" class="sw-tag">NEW</text>` : "");
      else mid += rect(px, py, 140, 190, "#f1e8d6", ` rx="3" stroke-dasharray="6 5"`);
    }
    // Doors, red carpet, velvet ropes, ticket booth.
    mid += rect(hx + 380, base - 110, 140, 110, "#6f5140", ` rx="6"`) + `<path d="M${hx + 450} ${base - 110}V${base}" stroke="#4f3a2e" stroke-width="3"/>`;
    mid += `<path d="M${hx + 330} ${base}L${hx + 360} ${base - 8}H${hx + 540}L${hx + 570} ${base}Z" fill="#c9453d"/>`;
    for (const px of [hx + 310, hx + 590]) mid += `<path d="M${px} ${base}V${base - 50}" stroke="#d9b44a" stroke-width="6"/><circle cx="${px}" cy="${base - 54}" r="7" fill="#d9b44a"/>`;
    mid += `<path d="M${hx + 310} ${base - 42}Q${hx + 340} ${base - 20} ${hx + 370} ${base - 42}M${hx + 530} ${base - 42}Q${hx + 560} ${base - 20} ${hx + 590} ${base - 42}" stroke="#8e2f2a" stroke-width="5" fill="none"/>`;
    mid += `<g class="sw-booth">` + rect(x0 + 1360, base - 170, 130, 170, "#f3e3c3") + rect(x0 + 1380, base - 150, 90, 60, lit ? "#ffe39a" : "#a9bfd0", ` rx="6"`) + poly([[x0 + 1350, base - 170], [x0 + 1425, base - 220], [x0 + 1500, base - 170]], "#e05a4f") + `<text x="${x0 + 1425}" y="${base - 70}" class="sw-sign-small">TICKET</text></g>`;
    mid += `</g>` + lamps(c, [1320, 1580]);
    fg += tufts(c, [60, 300, 1320, 1560]) + use("sw-flowers", x0 + 1300, base + 72, 1);
    const effects = [];
    if (c.row?.active_hotspots?.includes("PREMIERE")) for (const [x, r] of [[hx + 120, -18], [hx + hw - 120, 18]]) effects.push({ kind: "spotlight", x, y: top - 10, r });
    return {
      backdrop: back,
      buildings: mid,
      street: ground(c),
      foreground: fg,
      effects,
      hotspots: [hotspot(c, "PREMIERE", [hx + 180, top - 40, 540, 170]), hotspot(c, "POSTERS", [hx + 82, top + 162, 736, 150], { tip: "精選影片", label: "影片大廳 · 精選影片", action: "videos" })],
      stats: { kind: "hall", posters: posters.length, dome: c.landmarks.has("VIDEO_HALL_DOME") },
    };
  }

  // ---------- 鵝寶會員區: the hatchery, the tier banners (aggregate counts only), the playground ----------
  function member(c) {
    const { x0, base, lit } = c;
    const population = c.state?.goosebaby?.population || null;
    let back = "",
      mid = "",
      fg = "";
    back += use("sw-tree", x0 + 700, base - 30, 0.75) + use("sw-pine", x0 + 1500, base - 30, 0.7);
    mid += signpost(c, population && Number.isInteger(population.total) ? { text: `鵝寶人口 ${population.total}`, fill: "#fbe6b8" } : null);
    // Hatchery: an egg-shaped house on a straw nest.
    const ex = x0 + 480;
    mid += `<g class="sw-hatchery"><ellipse cx="${ex}" cy="${base - 6}" rx="190" ry="26" fill="#d8b56a"/><path d="M${ex - 200} ${base - 10}q40-30 80-6t80-6 80-6 80 6 80 6" stroke="#b9913f" stroke-width="5" fill="none"/>`;
    mid += `<path d="M${ex} ${base - 400}C${ex + 150} ${base - 400} ${ex + 170} ${base - 150} ${ex + 150} ${base - 50}Q${ex} ${base + 10} ${ex - 150} ${base - 50}C${ex - 170} ${base - 150} ${ex - 150} ${base - 400} ${ex} ${base - 400}Z" fill="#fff4de" stroke="${OUT}" stroke-opacity=".4" stroke-width="2"/>`;
    mid += `<path d="M${ex - 150} ${base - 190}l40 26 40-30 40 30 40-30 40 30 40-26" stroke="#e7c98f" stroke-width="7" fill="none"/>`;
    mid += `<path d="M${ex - 44} ${base - 30}V${base - 110}A44 44 0 0 1 ${ex + 44} ${base - 110}V${base - 30}Z" fill="#8a6848"/><circle cx="${ex}" cy="${base - 270}" r="34" fill="${lit ? "#ffe39a" : "#a9bfd0"}" stroke="#b9913f" stroke-width="5"/>`;
    for (const [dx, dy, s] of [[-150, -20, 1], [150, -18, 0.9], [-110, -8, 0.7]]) mid += `<ellipse cx="${ex + dx}" cy="${base + dy - 22 * s}" rx="${18 * s}" ry="${24 * s}" fill="#fffaf0" stroke="${OUT}" stroke-opacity=".35"/>`;
    mid += `</g>`;
    // Tier banners: flag heights follow the aggregate count per tier; no member row reaches the world.
    const tiers = population?.by_tier || {};
    const tierOrder = [["BRONZE", "#c98a55"], ["SILVER", "#b9c1cc"], ["GOLD", "#f2c14e"], ["PLATINUM", "#9fd6d2"]];
    const peak = Math.max(1, ...tierOrder.map(([k]) => tiers[k] || 0));
    tierOrder.forEach(([key, color], k) => {
      const px = x0 + 820 + k * 70,
        n = tiers[key] || 0;
      const h = 90 + Math.round((Math.log1p(n) / Math.log1p(peak)) * 140);
      mid += `<g class="sw-tier" data-tier="${key}"><path d="M${px} ${base}V${base - h - 40}" stroke="#6f5646" stroke-width="5"/><path d="M${px + 3} ${base - h - 40}h46l-12 20 12 20h-46Z" fill="${color}" stroke="${OUT}" stroke-opacity=".4"/></g>`;
    });
    // Member homes and a small playground.
    mid += facade(c.st.kind === "tent" ? "hut" : c.st.kind, c.st, x0 + 1160, base, 200, Math.max(1, c.floors), c.seed + "mhome", lit);
    mid += `<g class="sw-playground"><path d="M${x0 + 1450} ${base}L${x0 + 1500} ${base - 130}H${x0 + 1540}L${x0 + 1640} ${base}" stroke="#e07d4f" stroke-width="10" fill="none" stroke-linecap="round"/><path d="M${x0 + 1500} ${base}V${base - 130}" stroke="#6f5646" stroke-width="6"/>`;
    mid += `<path d="M${x0 + 1680} ${base}V${base - 150}M${x0 + 1780} ${base}V${base - 150}M${x0 + 1670} ${base - 150}H${x0 + 1790}" stroke="#6f5646" stroke-width="7"/><path d="M${x0 + 1712} ${base - 150}V${base - 60}M${x0 + 1748} ${base - 150}V${base - 60}" stroke="#4e4763" stroke-width="3"/>` + rect(x0 + 1702, base - 64, 56, 10, "#f2b33d", ` rx="3"`) + `</g>`;
    mid += lamps(c, [760, 1420]);
    fg += tufts(c, [80, 300, 720, 1100, 1400, 1700]) + use("sw-flowers", x0 + 1080, base + 72, 1.1);
    return {
      backdrop: back,
      buildings: mid,
      street: ground(c),
      foreground: fg,
      effects: [{ kind: "glow", x: ex, y: base - 270 }],
      hotspots: [hotspot(c, "HATCHERY", [ex - 150, base - 410, 300, 200])],
      stats: { kind: "member", population: population?.total ?? null, tiers: tierOrder.map(([k]) => tiers[k] || 0) },
    };
  }

  // ---------- 娛樂夜市區: the open-air stage and the night market ----------
  function entertainment(c) {
    const { x0, base, lit, shops } = c;
    let back = "",
      mid = "",
      fg = "";
    // A paper Ferris wheel behind the market.
    const fx = x0 + 1380,
      fy = base - 330;
    back += `<g class="sw-ferris" transform="translate(${fx} ${fy})"><circle r="220" fill="none" stroke="#b9a6c2" stroke-width="10"/>`;
    for (let k = 0; k < 8; k++) back += `<path d="M0 0L${r1(Math.cos((k * Math.PI) / 4) * 220)} ${r1(Math.sin((k * Math.PI) / 4) * 220)}" stroke="#b9a6c2" stroke-width="5"/><rect x="${r1(Math.cos((k * Math.PI) / 4) * 220 - 22)}" y="${r1(Math.sin((k * Math.PI) / 4) * 220)}" width="44" height="34" rx="8" fill="${["#f28c6d", "#7fc6c2", "#ffd35e", "#c9b8f2"][k % 4]}"/>`;
    back += `<path d="M-120 330L0 0L120 330" stroke="#8a6fa8" stroke-width="12" fill="none"/></g>`;
    mid += signpost(c, { text: "晚上最熱鬧", fill: "#e6d6f2" });
    // Stage.
    const sx = x0 + 300,
      sw = 520;
    mid += `<g class="sw-stage">` + rect(sx, base - 90, sw, 90, "#8a6848") + rect(sx - 20, base - 380, 40, 380, "#6f5140") + rect(sx + sw - 20, base - 380, 40, 380, "#6f5140") + rect(sx - 30, base - 420, sw + 60, 50, "#c9453d", ` rx="8"`);
    mid += `<text x="${sx + sw / 2}" y="${base - 386}" class="sw-sign">STAGE</text>`;
    mid += `<path d="M${sx + 20} ${base - 370}Q${sx + 120} ${base - 250} ${sx + 90} ${base - 90}H${sx + 20}Z" fill="#e05a4f"/><path d="M${sx + sw - 20} ${base - 370}Q${sx + sw - 120} ${base - 250} ${sx + sw - 90} ${base - 90}H${sx + sw - 20}Z" fill="#e05a4f"/>`;
    for (let k = 0; k < 6; k++) mid += `<circle cx="${sx + 60 + k * 80}" cy="${base - 360}" r="9" class="sw-bulb${lit ? " is-lit" : ""}" fill="#ffe39a"/>`;
    mid += `</g>`;
    // Night market stalls under a lantern string.
    const mx = x0 + 950;
    mid += `<path class="sw-lantern-string" d="M${mx - 40} ${base - 250}Q${mx + 330} ${base - 190} ${mx + 700} ${base - 250}" stroke="${OUT}" stroke-opacity=".4" stroke-width="2" fill="none"/>`;
    for (let k = 0; k < 9; k++) {
      const lxk = mx - 10 + k * 80;
      const ly = base - 250 + Math.sin((k / 8) * Math.PI) * 44;
      mid += `<ellipse cx="${lxk}" cy="${r1(ly + 22)}" rx="16" ry="20" class="sw-lantern${lit ? " is-lit" : ""}" fill="${k % 2 ? "#f28c6d" : "#ffd35e"}" stroke="${OUT}" stroke-opacity=".35"/>`;
    }
    for (let k = 0; k < 4; k++) {
      const x = mx + k * 170,
        open = rnd(c.seed + "stall", k) < Math.max(0.2, shops);
      mid += `<g class="sw-stall${open ? "" : " is-closed"}"><path d="M${x} ${base}V${base - 130}M${x + 140} ${base}V${base - 130}" stroke="#8a6848" stroke-width="6"/>` + rect(x - 4, base - 56, 148, 56, "#c79a68");
      for (let s = 0; s < 6; s++) mid += `<path d="M${x - 10 + s * 27} ${base - 150}h27l-3 26h-27Z" fill="${s % 2 ? "#fff4e0" : open ? ["#e07d4f", "#6fae9a", "#8a6fa8", "#e3a93d"][k] : "#a9a3b5"}" stroke="${OUT}" stroke-opacity=".25"/>`;
      mid += `</g>`;
    }
    mid += lamps(c, [880, 1800]);
    fg += tufts(c, [60, 260, 860, 1640, 1840]) + use("sw-bush", x0 + 1860, base + 96, 1.2);
    const effects = [];
    if (c.row?.active_hotspots?.includes("STAGE")) for (const [x, r] of [[sx + 40, -20], [sx + sw - 40, 20]]) effects.push({ kind: "spotlight", x, y: base - 400, r });
    return {
      backdrop: back,
      buildings: mid,
      street: ground(c),
      foreground: fg,
      effects,
      hotspots: [hotspot(c, "STAGE", [sx - 30, base - 430, sw + 60, 150]), hotspot(c, "NIGHT_MARKET", [mx - 20, base - 290, 720, 100])],
      stats: { kind: "entertainment", ferris: true },
    };
  }

  // ---------- 星港之門: the street's last stop ----------
  function gate(c) {
    const { x0, w, base } = c;
    let back = "",
      mid = "",
      fg = "";
    back += `<path class="sw-hill-near" d="M${x0 + 200} ${base - 20}Q${x0 + 700} ${base - 180} ${x0 + 1200} ${base - 20}Z" opacity=".6"/>`;
    mid += signpost(c, { text: "下一站：星星", fill: "#dfe5fb" });
    const gx = x0 + 720,
      gy = base - 330;
    mid += `<g class="sw-gate">` + rect(gx - 260, base - 50, 520, 50, "#c4bcad", ` rx="6"`) + rect(gx - 200, base - 90, 400, 40, "#d6cfc2", ` rx="6"`);
    mid += `<circle cx="${gx}" cy="${gy}" r="230" fill="none" stroke="#5b6f8f" stroke-width="44"/><circle cx="${gx}" cy="${gy}" r="230" fill="none" stroke="#9db8f2" stroke-width="12" stroke-dasharray="30 22"/>`;
    mid += `<circle cx="${gx}" cy="${gy}" r="186" class="sw-gate-core" fill="#1f2758"/>`;
    for (let k = 0; k < 14; k++) mid += `<circle cx="${r1(gx + (rnd(c.seed + "star", k) - 0.5) * 300)}" cy="${r1(gy + (rnd(c.seed + "stary", k) - 0.5) * 300)}" r="${r1(2 + rnd(c.seed + "starr", k) * 3)}" fill="#fff8e8"/>`;
    mid += `</g>` + lamps(c, [300, 1140]);
    fg += tufts(c, [80, 360, 1100, w - 120]) + use("sw-fence", x0 + w - 200, base + 70, 1);
    return {
      backdrop: back,
      buildings: mid,
      street: ground(c),
      foreground: fg,
      effects: [{ kind: "gate", x: gx, y: gy }],
      hotspots: [hotspot(c, "GATE", [gx - 240, gy - 240, 480, 220])],
      stats: { kind: "gate" },
    };
  }

  // ---------- a district the registry added later: a plain stretch with its name ----------
  function generic(c) {
    const { x0, base, st, lit } = c;
    let mid = signpost(c, null);
    for (const [x, wd] of [[320, 220], [860, 240]]) mid += facade(st.kind, st, x0 + x, base, wd, c.floors, c.seed + x, lit);
    mid += lamps(c, [700, 1240]);
    return { backdrop: use("sw-tree", x0 + 600, base - 30, 0.7), buildings: mid, street: ground(c), foreground: tufts(c, [80, 540, 1100]), effects: [], hotspots: [hotspot(c, "DISTRICT", [x0 + 320, base - 360, 780, 200], { tip: c.name })], stats: { kind: "generic" } };
  }

  const PAINT = { CREATOR_DISTRICT: creator, TRAVEL_DISTRICT: travel, VIDEO_HALL: hall, MEMBER_DISTRICT: member, ENTERTAINMENT_DISTRICT: entertainment, FUTURE_GATE: gate };

  // Every district after the main street, as layer chunks in street coordinates.
  function paint(state, plan = layout(state)) {
    const G = Art.GEOMETRY.city;
    const idx = Art.eraIndex(state);
    const variant = Scene.VARIANTS[idx];
    const visual = state?.visual || {};
    const activity = state?.activity || {};
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

  // ---------- the anonymous crowd: neutral pawns, counted by the engine, spread by district crowd ----------
  const WEIGHT = { EMPTY: 0, QUIET: 1, NORMAL: 2, BUSY: 3, FESTIVAL: 4 };
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
    for (const s of shares)
      for (let k = 0; k < s.n; k++) {
        const x = s.d.x + 120 + rnd("crowd:" + s.d.id, k) * (s.d.width - 240);
        out.push({ district: s.d.id, x: Math.round(x), y: Art.GEOMETRY.city.ground + 18 + Math.round(rnd("crowdy:" + s.d.id, k) * 8), run: Math.round((rnd("run:" + s.d.id, k) - 0.5) * 360), dur: +(7 + rnd("dur:" + s.d.id, k) * 7).toFixed(1), delay: +(rnd("delay:" + s.d.id, k) * 9).toFixed(1) });
      }
    return out;
  }

  const api = { ORDER, OPEN_WIDTH, CLOSED_WIDTH, SPOTS, STATUS_LABEL, HOTSPOT_LABEL, layout, at, paint, crowd, ground };
  root.RenguinSeamlessDistricts = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
