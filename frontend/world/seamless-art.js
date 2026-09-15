/* Renguin World · seamless side-view slice: world_state -> layered SVG strings.
 *
 * Pure: no DOM, no timers, no network, so Node tests can check it. One vertical
 * world in three sections that share a sky: the Star Office sky island, the
 * cloud descent, and one street of Renguin City.
 *
 * `scene(state)` is the world's layer architecture: every section declares its
 * stack (LAYER_STACKS) and each layer is independent — its own name, depth
 * (parallax factor), z order, host (the section, or the street that pans
 * sideways), kind (painted SVG, or DOM the page fills: residents, effects) and
 * whether it may be culled. The page moves layers, never redraws them, so a
 * layer can later be re-painted, animated or swapped for richer art alone.
 *
 * Art is code-native paper craft (shapes, offset paper shadows, one outline
 * colour) and reuses the V1 era palette. Characters are never drawn here: the
 * page places the authority's own images on the anchors this file returns.
 */
(function (root) {
  "use strict";
  const Scene = root.RenguinWorldScene || (typeof require === "function" ? require("./world-scene.js") : null);
  const { hash, esc, VARIANTS, STYLES } = Scene;
  const OUT = "#3a3150";
  const r1 = (n) => Math.round(n * 10) / 10;
  const shade = (hex, f) => {
    const n = parseInt(hex.slice(1), 16);
    const mix = (c) => Math.round(f >= 0 ? c + (255 - c) * f : c * (1 + f));
    return "#" + [n >> 16, (n >> 8) & 255, n & 255].map((c) => mix(c).toString(16).padStart(2, "0")).join("");
  };
  const pts = (list) => list.map(([x, y]) => r1(x) + "," + r1(y)).join(" ");
  const poly = (list, fill, extra = "") => `<polygon points="${pts(list)}" fill="${fill}" stroke="${OUT}" stroke-opacity=".38" stroke-width="1.5" stroke-linejoin="round"${extra}/>`;
  const rect = (x, y, w, h, fill, extra = "") => `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" fill="${fill}" stroke="${OUT}" stroke-opacity=".38" stroke-width="1.5"${extra}/>`;
  const use = (id, x, y, s = 1, extra = "") => `<use href="#${id}" transform="translate(${r1(x)} ${r1(y)})${s === 1 ? "" : ` scale(${r1(s * 100) / 100})`}"${extra}/>`;

  // World units: one unit is one CSS pixel at world scale 1 (a 1440 px desktop).
  const GEOMETRY = {
    character: 150,
    island: { width: 2200, height: 1000, ground: 552, wheel: [550, 470], spots: [-232, 286, -372], office: [-130, 238, 260, 314] },
    descent: { width: 2200, height: 1500 },
    city: { width: 2800, height: 1080, ground: 740, feet: 782, wheel: [300, 486], spots: [360, 640, 900, 1430, 1640, 1860, 2050, 2290, 2540], poster: [1130, 598, 64, 78] },
  };
  // z steps of ten leave room for layers added later (weather, lighting, particles).
  const LAYER_STACKS = {
    island: [
      { name: "sky", depth: 0.4, z: 10, host: "section", kind: "svg", cull: true },
      { name: "terrain", depth: 1, z: 30, host: "section", kind: "svg" },
      { name: "buildings", depth: 1, z: 40, host: "section", kind: "svg" },
      { name: "residents", depth: 1, z: 70, host: "section", kind: "dom" },
      { name: "effects", depth: 1, z: 80, host: "section", kind: "dom", cull: true },
    ],
    descent: [
      { name: "distant", depth: 0.3, z: 10, host: "section", kind: "svg", cull: true },
      { name: "clouds-far", depth: 0.5, z: 15, host: "section", kind: "svg", cull: true },
      { name: "clouds-mid", depth: 0.78, z: 20, host: "section", kind: "svg" },
      { name: "effects", depth: 0.85, z: 25, host: "section", kind: "dom", cull: true },
      { name: "cloud-sea", depth: 1, z: 40, host: "section", kind: "svg" },
      { name: "clouds-near", depth: 1.2, z: 60, host: "section", kind: "svg", cull: true },
    ],
    city: [
      { name: "sky", depth: 0.15, z: 10, host: "section", kind: "svg", cull: true },
      { name: "distant", depth: 0.35, z: 20, host: "section", kind: "svg", cull: true },
      { name: "backdrop", depth: 0.7, z: 30, host: "street", kind: "svg" },
      { name: "buildings", depth: 1, z: 40, host: "street", kind: "svg" },
      { name: "street", depth: 1, z: 50, host: "street", kind: "svg" },
      { name: "foreground", depth: 1.18, z: 60, host: "street", kind: "svg", cull: true },
      { name: "residents", depth: 1, z: 70, host: "street", kind: "dom" },
      { name: "effects", depth: 1, z: 80, host: "street", kind: "dom", cull: true },
    ],
  };
  // The sky cable sits between the cloud sea and the near clouds, above street buildings.
  const CABLE_Z = 55;
  const depthOf = (zone, name) => LAYER_STACKS[zone].find((l) => l.name === name).depth;
  const TYPE_LABEL = { MAIN_CHARACTER: "主角", SUPPORTING_CHARACTER: "主要配角", SPECIAL_GUEST: "特別來賓", GOOSEBABY: "鵝寶" };
  const SOURCE_LABEL = { "ASSET-01": "角色聖經", "ASSET-08": "會員角色庫" };

  function eraIndex(state) {
    const i = VARIANTS.indexOf(state?.visual?.era_variant);
    return i < 0 ? 0 : i;
  }

  // ---------- who stands where (references only; never a drawn likeness) ----------
  const shown = (c) => c.render_mode === "IMAGE" && (!c.resolution || c.resolution === "CANONICAL_CHARACTER" || c.resolution === "PROFESSION_CHARACTER");
  const Districts = () => root.RenguinSeamlessDistricts || (typeof require === "function" ? require("./seamless-districts.js") : null);

  // The island holds up to three Star Office crew. Everyone else stands in the district the
  // engine placed them in when that district is open on the street, otherwise on the main street.
  function cast(state, plan = Districts().layout(state)) {
    const rows = (state?.characters || []).filter(shown);
    const crew = rows
      .filter((c) => c.district === "CREATOR_DISTRICT" && (c.character_type === "MAIN_CHARACTER" || c.character_type === "SUPPORTING_CHARACTER"))
      .sort((a, b) => (a.character_type === "MAIN_CHARACTER" ? -1 : 0) - (b.character_type === "MAIN_CHARACTER" ? -1 : 0))
      .slice(0, 3);
    const rank = (c) => (c.resolution === "PROFESSION_CHARACTER" ? 0 : c.character_type === "GOOSEBABY" ? 1 : c.character_type === "SUPPORTING_CHARACTER" ? 2 : 3);
    const rest = rows
      .filter((c) => !crew.includes(c))
      .map((c, i) => [c, i])
      .sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1])
      .map(([c]) => c);
    const open = new Map(plan.districts.filter((d) => d.status === "UNLOCKED").map((d) => [d.id, d]));
    // The main street keeps the slice's density; a district holds as many as it has spots.
    const limit = (id) => (id === "MAIN_CITY" ? Math.min(7, 10 - crew.length) : open.get(id).spots.length);
    // Spread the main-street cast over its spots, keeping the arrival platform and the plaza lively.
    const order = [0, 3, 5, 1, 7, 4, 6, 2, 8];
    const used = new Map();
    const city = [];
    for (const c of rest) {
      let id = c.district !== "MAIN_CITY" && open.has(c.district) ? c.district : "MAIN_CITY";
      if ((used.get(id) || 0) >= limit(id)) {
        if (id === "MAIN_CITY" || (used.get("MAIN_CITY") || 0) >= limit("MAIN_CITY")) continue;
        id = "MAIN_CITY";
      }
      const n = used.get(id) || 0;
      used.set(id, n + 1);
      city.push({ ...c, stand: id, spot: id === "MAIN_CITY" ? GEOMETRY.city.spots[order[n]] : open.get(id).spots[n] });
    }
    return {
      island: crew.map((c, i) => ({ ...c, stand: "ISLAND", spot: GEOMETRY.island.spots[i] })),
      city,
    };
  }

  function nameOf(c) {
    return c.resolution === "PROFESSION_CHARACTER" && c.world_role ? c.world_role : c.display_name;
  }

  function roleOf(c) {
    if (c.resolution === "PROFESSION_CHARACTER") return "鵝寶居民 · 正式職業角色";
    if (c.character_type === "GOOSEBABY") return c.world_role ? `鵝寶 · ${c.world_role}` : "鵝寶";
    return TYPE_LABEL[c.character_type] || "居民";
  }

  function sourceOf(c) {
    return SOURCE_LABEL[c.source_authority] || c.source_authority || "";
  }

  // ---------- shared paper kit, defined once and reused with <use> ----------
  function defs() {
    const cloud = (id, blobs, hi) =>
      `<symbol id="${id}" overflow="visible">` +
      `<g class="sw-c-sh" transform="translate(7 11)">${blobs.map(([x, y, rx, ry]) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}"/>`).join("")}</g>` +
      `<g class="sw-c-body">${blobs.map(([x, y, rx, ry]) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}"/>`).join("")}</g>` +
      `<g class="sw-c-hi">${hi.map(([x, y, rx, ry]) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}"/>`).join("")}</g></symbol>`;
    return (
      `<svg class="sw-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>` +
      `<linearGradient id="sw-fall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d7f0f6"/><stop offset=".7" stop-color="#bfe3ee" stop-opacity=".6"/><stop offset="1" stop-color="#bfe3ee" stop-opacity="0"/></linearGradient>` +
      `<radialGradient id="sw-glow"><stop offset="0" stop-color="#ffe7a8" stop-opacity=".95"/><stop offset="1" stop-color="#ffe7a8" stop-opacity="0"/></radialGradient>` +
      `<pattern id="sw-cobble" width="46" height="26" patternUnits="userSpaceOnUse"><rect width="46" height="26" fill="#cdbf9f"/><rect x="2" y="2" width="20" height="10" rx="4" fill="#e1d6bd"/><rect x="25" y="2" width="19" height="10" rx="4" fill="#d9cdb1"/><rect x="-9" y="14" width="20" height="10" rx="4" fill="#d9cdb1"/><rect x="13" y="14" width="20" height="10" rx="4" fill="#e4dac2"/><rect x="36" y="14" width="20" height="10" rx="4" fill="#dcd0b5"/></pattern>` +
      `<pattern id="sw-slab" width="70" height="30" patternUnits="userSpaceOnUse"><rect width="70" height="30" fill="#c4bcad"/><rect x="2" y="2" width="31" height="12" rx="2" fill="#ddd6c8"/><rect x="36" y="2" width="32" height="12" rx="2" fill="#d4ccbd"/><rect x="-16" y="16" width="31" height="12" rx="2" fill="#d4ccbd"/><rect x="18" y="16" width="32" height="12" rx="2" fill="#e0d9cc"/><rect x="53" y="16" width="32" height="12" rx="2" fill="#d8d0c2"/></pattern>` +
      cloud("sw-cloud-a", [[70, -38, 70, 38], [135, -70, 70, 62], [205, -60, 62, 52], [262, -34, 58, 34], [160, -22, 150, 24]], [[118, -98, 34, 16], [192, -86, 26, 12], [60, -56, 26, 10]]) +
      cloud("sw-cloud-b", [[60, -30, 60, 30], [130, -52, 64, 48], [210, -66, 74, 62], [292, -50, 60, 44], [362, -28, 60, 28], [210, -18, 205, 20]], [[196, -104, 36, 14], [120, -80, 26, 10], [290, -76, 22, 9]]) +
      cloud("sw-cloud-c", [[45, -26, 45, 26], [95, -50, 52, 46], [140, -28, 40, 28], [92, -14, 90, 16]], [[84, -80, 22, 9]]) +
      `<symbol id="sw-tree" overflow="visible"><ellipse cy="3" rx="42" ry="8" fill="#2c2340" opacity=".13"/>` +
      `<path d="M-8 2L-5-74L5-74L8 2Z" fill="#9b7652" stroke="${OUT}" stroke-opacity=".3"/><path d="M0-40L-22-62M1-54L20-78" stroke="#9b7652" stroke-width="4" stroke-linecap="round"/>` +
      `<g fill="#5f8a5d"><ellipse cx="-32" cy="-90" rx="40" ry="36"/><ellipse cx="28" cy="-96" rx="42" ry="40"/><ellipse cx="0" cy="-128" rx="46" ry="42"/><ellipse cx="-2" cy="-82" rx="56" ry="28"/></g>` +
      `<g fill="#7fab6e"><ellipse cx="-32" cy="-97" rx="36" ry="32"/><ellipse cx="28" cy="-103" rx="38" ry="36"/><ellipse cx="0" cy="-135" rx="42" ry="37"/><ellipse cx="-4" cy="-92" rx="50" ry="24"/></g>` +
      `<g fill="#b8d39a"><ellipse cx="-16" cy="-150" rx="17" ry="9"/><ellipse cx="26" cy="-122" rx="14" ry="8"/><ellipse cx="-40" cy="-110" rx="10" ry="6"/></g></symbol>` +
      `<symbol id="sw-pine" overflow="visible"><ellipse cy="3" rx="30" ry="6" fill="#2c2340" opacity=".13"/><rect x="-5" y="-30" width="10" height="32" fill="#8e6c4c"/>` +
      `<path d="M-40-26L0-92L40-26Z" fill="#5f8f68"/><path d="M-32-66L0-128L32-66Z" fill="#6d9f73"/><path d="M-22-104L0-160L22-104Z" fill="#82b384"/><path d="M-6-148L0-160L6-148" fill="#b9d8a8"/></symbol>` +
      `<symbol id="sw-bush" overflow="visible"><ellipse cy="2" rx="46" ry="7" fill="#2c2340" opacity=".12"/><g fill="#6f9a61"><ellipse cx="-24" cy="-18" rx="26" ry="20"/><ellipse cx="10" cy="-26" rx="30" ry="26"/><ellipse cx="34" cy="-14" rx="18" ry="15"/></g>` +
      `<g fill="#91bb7c"><ellipse cx="-22" cy="-24" rx="20" ry="14"/><ellipse cx="10" cy="-32" rx="22" ry="17"/></g><circle cx="-10" cy="-20" r="3.5" fill="#f4a9a0"/><circle cx="18" cy="-30" r="3.5" fill="#f4a9a0"/><circle cx="30" cy="-14" r="3" fill="#ffe08a"/></symbol>` +
      `<symbol id="sw-tuft" overflow="visible"><path d="M-14 0Q-12-18-6-26M-4 0Q-2-22 4-32M6 0Q10-16 16-22" fill="none" stroke="#6ea35a" stroke-width="3.5" stroke-linecap="round"/></symbol>` +
      `<symbol id="sw-flowers" overflow="visible"><path d="M-16 0V-18M0 0V-24M16 0V-16" stroke="#6ea35a" stroke-width="2.5"/><circle cx="-16" cy="-21" r="6" fill="#ffb3c7"/><circle cx="0" cy="-28" r="7" fill="#ffe08a"/><circle cx="16" cy="-19" r="6" fill="#c9b8f2"/><circle cx="-16" cy="-21" r="2" fill="#fff4e0"/><circle cx="0" cy="-28" r="2.4" fill="#fff4e0"/><circle cx="16" cy="-19" r="2" fill="#fff4e0"/></symbol>` +
      `<symbol id="sw-lamp" overflow="visible"><circle class="sw-lamp-glow" cx="0" cy="-148" r="46" fill="url(#sw-glow)"/><rect x="-3.5" y="-138" width="7" height="140" fill="#4e4763"/><rect x="-9" y="-6" width="18" height="8" rx="2" fill="#4e4763"/>` +
      `<path d="M-13-136H13L9-164H-9Z" class="sw-lamp-glass" stroke="${OUT}" stroke-opacity=".5" stroke-width="1.5"/><path d="M-15-164H15L0-178Z" fill="#4e4763"/></symbol>` +
      `<symbol id="sw-fence" overflow="visible"><path d="M0-34V2M60-34V2M120-34V2" stroke="#a98458" stroke-width="7" stroke-linecap="round"/><path d="M-6-24H126M-6-10H126" stroke="#c29c6b" stroke-width="6" stroke-linecap="round"/></symbol>` +
      `<symbol id="sw-bench" overflow="visible"><rect x="-40" y="-26" width="80" height="9" rx="3" fill="#b98a5a" stroke="${OUT}" stroke-opacity=".35"/><rect x="-40" y="-44" width="80" height="8" rx="3" fill="#c79a68" stroke="${OUT}" stroke-opacity=".35"/><path d="M-32-17V0M32-17V0M-34-36V-26M34-36V-26" stroke="#6f5646" stroke-width="5"/></symbol>` +
      `</defs></svg>`
    );
  }

  // ---------- era buildings, side view with a narrow 2.5D return ----------
  function facade(kind, st, x, base, w, floors, seed, lit, opts = {}) {
    const FH = 88,
      dep = 16;
    let s = `<g class="sw-house" data-kind="${kind}">`;
    s += `<ellipse cx="${r1(x + w / 2)}" cy="${base + 5}" rx="${r1(w * 0.6)}" ry="11" fill="#2c2340" opacity=".1"/>`;
    const win = (wx, wy, ww = 38, wh = 46) =>
      rect(wx, wy, ww, wh, lit && hash(seed + wx + wy) < 0.8 ? "#ffe39a" : "#a9bfd0", ` rx="4" class="sw-win${lit ? " is-lit" : ""}"`) +
      `<path d="M${r1(wx + ww / 2)} ${r1(wy + 2)}V${r1(wy + wh - 2)}M${r1(wx + 2)} ${r1(wy + wh / 2)}H${r1(wx + ww - 2)}" stroke="${shade(st.wall, -0.45)}" stroke-width="3" opacity=".7"/>` +
      rect(wx - 4, wy + wh, ww + 8, 8, shade(st.trim, -0.1), ` rx="2"`);
    if (kind === "tent") {
      const cx = x + w / 2,
        h = 150;
      s += poly([[x + 6, base], [cx, base - h], [x + w - 6, base]], st.roof);
      for (let k = 1; k < 4; k++) s += `<path d="M${r1(cx)} ${base - h}L${r1(x + 6 + ((w - 12) * k) / 4)} ${base}" stroke="${st.trim}" stroke-width="5" opacity=".75"/>`;
      s += `<path d="M${r1(cx - 22)} ${base}L${r1(cx)} ${base - 64}L${r1(cx + 22)} ${base}Z" fill="#6b4a3a"/><path d="M${r1(cx)} ${base - h}V${base - h - 26}" stroke="#8a5a36" stroke-width="4"/><path d="M${r1(cx)} ${base - h - 26}l20 7-20 7Z" fill="${st.trim}"/>`;
      return s + "</g>";
    }
    const wallH = kind === "hut" ? 78 : floors * FH + 26;
    const top = base - wallH;
    s += poly([[x + w, top], [x + w + dep, top - dep * 0.6], [x + w + dep, base - dep * 0.6], [x + w, base]], shade(st.wall, -0.24));
    s += rect(x, top, w, wallH, st.wall);
    if (kind === "hut" || kind === "cabin") for (let y = top + 14; y < base; y += 16) s += `<path d="M${x + 2} ${y}H${x + w - 2}" stroke="${shade(st.wall, -0.3)}" stroke-width="1.5" opacity=".45"/>`;
    if (kind === "house") for (let k = 0; k < 10; k++) s += `<rect x="${r1(x + 10 + hash(seed + "b" + k) * (w - 34))}" y="${r1(top + 12 + hash(seed + "by" + k) * (wallH - 30))}" width="20" height="9" rx="1.5" fill="${shade(st.wall, -0.14)}" opacity=".75"/>`;
    if (kind === "manor") for (let y = top + 22; y < base; y += 22) s += `<path d="M${x + 2} ${y}H${x + w - 2}" stroke="${shade(st.wall, -0.18)}" stroke-width="1.5"/>`;
    if (kind === "tower" || kind === "spire") for (let y = top + 18; y < base - 20; y += FH) s += rect(x + 6, y, w - 12, 10, st.trim, ` opacity=".5"`);
    // Windows per floor; the ground floor keeps room for the door.
    const cols = Math.max(1, Math.floor((w - 30) / 72));
    for (let f = kind === "hut" ? 1 : 0; f < (kind === "hut" ? 1 : floors); f++) {
      const wy = base - (f + 1) * FH + 12;
      for (let c = 0; c < cols; c++) {
        const wx = x + 18 + ((w - 36 - 38) * (cols === 1 ? 0.5 : c / (cols - 1)));
        if (f === 0 && Math.abs(wx + 19 - (x + w * 0.5)) < 44) continue;
        s += win(wx, wy);
      }
    }
    const dx = x + w * 0.5 - 26;
    s += `<path d="M${r1(dx)} ${base}V${base - 58}A26 26 0 0 1 ${r1(dx + 52)} ${base - 58}V${base}Z" fill="${shade(st.roof, -0.35)}" stroke="${OUT}" stroke-opacity=".4" stroke-width="1.5"/><circle cx="${r1(dx + 40)}" cy="${base - 36}" r="3.5" fill="#f2c46b"/>`;
    s += rect(dx - 8, base - 4, 68, 6, shade(st.trim, -0.2));
    if (opts.shop) {
      const ax = dx - 34,
        aw = 120;
      let stripes = "";
      for (let k = 0; k < 6; k++) stripes += `<path d="M${r1(ax + (aw * k) / 6)} ${base - 104}h${r1(aw / 6)}l-4 26h${r1(-aw / 6)}Z" fill="${k % 2 ? "#fff4e0" : opts.shop}"/>`;
      s += `<g class="sw-awning">${stripes}<path d="M${ax} ${base - 104}H${ax + aw}" stroke="${OUT}" stroke-opacity=".45" stroke-width="2"/></g>`;
      s += `<circle cx="${r1(x + w - 22)}" cy="${base - 118}" r="16" fill="#fff8ea" stroke="${OUT}" stroke-opacity=".45" stroke-width="1.5"/>` + (opts.icon || "");
    }
    // Roofs carry the era.
    if (kind === "hut") {
      s += `<path d="M${x - 16} ${top + 6}Q${r1(x + w / 2)} ${top - 118} ${x + w + 16 + dep} ${top + 6}Z" fill="${st.roof}" stroke="${OUT}" stroke-opacity=".4" stroke-width="1.5"/>`;
      for (let k = 0; k < 9; k++) s += `<path d="M${r1(x - 6 + ((w + 30) * k) / 8)} ${top + 4}l${r1((w / 2 - ((w + 30) * k) / 8) * 0.25)} -24" stroke="${shade(st.roof, -0.25)}" stroke-width="2"/>`;
    } else if (kind === "cabin" || kind === "house") {
      const rh = Math.min(120, w * 0.44);
      const L = [x - 16, top + 4],
        P = [x + w / 2, top - rh],
        R = [x + w + 16, top + 4];
      s += poly([P, [P[0] + dep, P[1] - dep * 0.6], [R[0] + dep, R[1] - dep * 0.6], R], shade(st.roof, -0.28));
      s += poly([L, P, R], st.roof);
      for (let row = 1; row < 4; row++) {
        const y = P[1] + (rh * row) / 4,
          half = ((w / 2 + 16) * row) / 4;
        s += `<path d="M${r1(P[0] - half)} ${r1(y)}H${r1(P[0] + half)}" stroke="${shade(st.roof, -0.22)}" stroke-width="2.5" stroke-dasharray="14 5" opacity=".8"/>`;
      }
      s += rect(x + w * 0.72, top - rh * 0.62, 22, rh * 0.5, shade(st.wall, -0.15));
      if (kind === "cabin") s += `<circle cx="${r1(P[0])}" cy="${r1(P[1] + rh * 0.55)}" r="13" fill="${lit ? "#ffe39a" : "#a9bfd0"}" stroke="${shade(st.wall, -0.45)}" stroke-width="3"/>`;
    } else if (kind === "manor") {
      const rh = 70;
      s += poly([[x - 10, top + 4], [x + 26, top - rh], [x + w - 26, top - rh], [x + w + 10, top + 4]], st.roof);
      s += poly([[x + w - 26, top - rh], [x + w - 26 + dep, top - rh - 9], [x + w + 10 + dep, top - 5], [x + w + 10, top + 4]], shade(st.roof, -0.28));
      if (hash(seed + "turret") < 0.6) s += rect(x + w - 58, top - rh - 54, 36, 58, st.wall) + poly([[x + w - 64, top - rh - 54], [x + w - 40, top - rh - 104], [x + w - 16, top - rh - 54]], st.roof);
    } else if (kind === "tower") {
      s += rect(x - 6, top - 14, w + 12 + dep, 16, shade(st.roof, -0.1)) + rect(x + w * 0.3, top - 44, w * 0.3, 30, st.roof) + `<path d="M${r1(x + w * 0.45)} ${top - 44}V${top - 84}" stroke="${OUT}" stroke-width="2.5"/><circle cx="${r1(x + w * 0.45)}" cy="${top - 88}" r="5" fill="#ff7b7b" class="sw-beacon"/>`;
    } else {
      s += `<path d="M${x - 8} ${top + 2}A${r1(w / 2 + 8)} ${r1(w * 0.36)} 0 0 1 ${x + w + 8} ${top + 2}Z" fill="${st.roof}" stroke="${OUT}" stroke-opacity=".4" stroke-width="1.5"/>` + `<path d="M${r1(x + w / 2)} ${r1(top - w * 0.36)}V${r1(top - w * 0.36 - 50)}" stroke="${OUT}" stroke-width="2.5"/><circle cx="${r1(x + w / 2)}" cy="${r1(top - w * 0.36 - 54)}" r="6" fill="${st.trim}" class="sw-beacon"/>`;
    }
    return s + "</g>";
  }

  const islandSvg = (body) => `<svg class="sw-art" viewBox="-1100 0 2200 1000" width="2200" height="1000" aria-hidden="true" focusable="false">${body}</svg>`;

  // ---------- A. Star Office sky island ----------
  function island(state) {
    const lit = (state?.activity?.lights_level ?? 60) > 30;
    let s = "";
    // Body: one rocky wedge; strata are clipped copies, so the cut edge stays one line.
    const body = "M-470 585C-460 560-430 552-380 552L380 552C430 552 462 560 472 585L440 640L400 662L385 722L330 748L300 822L220 852L170 926L90 952L40 994L-10 956L-90 930L-140 862L-220 832L-270 762L-345 736L-385 666L-440 640Z";
    s += `<defs><clipPath id="sw-island-clip"><path d="${body}"/></clipPath></defs>`;
    s += `<path d="${body}" transform="translate(12 14)" fill="#2c2340" opacity=".12"/>`;
    s += `<g clip-path="url(#sw-island-clip)"><rect x="-500" y="540" width="1000" height="470" fill="#8f6c4f"/>`;
    s += `<path d="M-500 540H500V650Q380 668 260 640T0 652T-260 636T-500 656Z" fill="#c6a47a"/>`;
    s += `<path d="M-500 650Q-260 636 0 652T260 640T500 650V770Q340 792 160 760T-180 778T-500 760Z" fill="#aa855f"/>`;
    s += `<path d="M-500 890Q-200 870 20 900T500 880V1010H-500Z" fill="#735647"/>`;
    for (let k = 0; k < 14; k++) {
      const x = -420 + hash("rock" + k) * 820,
        y = 610 + hash("rocky" + k) * 300;
      s += `<path d="M${r1(x)} ${r1(y)}l${r1(18 + hash("rw" + k) * 26)} ${r1(-8)}l10 16l-24 10Z" fill="${k % 2 ? "#d7b98f" : "#6f5343"}" opacity=".45"/>`;
    }
    s += `</g><path d="${body}" fill="none" stroke="${OUT}" stroke-opacity=".35" stroke-width="2"/>`;
    // Hanging roots and vines, and a few star crystals under the office.
    for (let k = 0; k < 9; k++) {
      const x = -360 + k * 88 + hash("root" + k) * 30,
        y = 700 + Math.abs(k - 4) * -18 + 70,
        len = 50 + hash("rl" + k) * 90;
      s += `<path d="M${r1(x)} ${r1(y)}C${r1(x + 8)} ${r1(y + len * 0.4)} ${r1(x - 10)} ${r1(y + len * 0.7)} ${r1(x + 4)} ${r1(y + len)}" fill="none" stroke="${k % 3 ? "#7b5a40" : "#6d9a5e"}" stroke-width="${k % 3 ? 3 : 4}" stroke-linecap="round"/>`;
      if (k % 3 === 0) for (let j = 1; j < 4; j++) s += `<ellipse cx="${r1(x + (j % 2 ? 7 : -7))}" cy="${r1(y + (len * j) / 4)}" rx="7" ry="4" fill="#8fbf74"/>`;
    }
    for (const [x, y, r] of [[-60, 880, 11], [70, 900, 8], [10, 945, 9], [-150, 830, 7]])
      s += `<path d="M${x} ${y - r}L${x + r * 0.3} ${y - r * 0.3}L${x + r} ${y}L${x + r * 0.3} ${y + r * 0.3}L${x} ${y + r}L${x - r * 0.3} ${y + r * 0.3}L${x - r} ${y}L${x - r * 0.3} ${y - r * 0.3}Z" class="sw-crystal" fill="#ffe39a" stroke="#f2b33d" stroke-width="1.5"/>`;
    // Waterfall off the west lip, fading into the clouds.
    s += `<path d="M-452 590C-470 640-478 760-470 1000H-420C-430 760-426 650-414 596Z" fill="url(#sw-fall)"/>`;
    for (let k = 0; k < 4; k++) s += `<path d="M${-452 + k * 9} ${620 + k * 30}V${760 + k * 40}" stroke="#ffffff" stroke-width="2.5" opacity=".55" stroke-linecap="round" stroke-dasharray="26 18"/>`;
    // Grass cap with a scalloped paper edge.
    let scallop = "M-472 585C-460 552-430 540-380 540L380 540C430 540 462 552 474 585";
    for (let x = 474; x > -472; x -= 38) scallop += `Q${r1(x - 19)} ${612 + (hash("sc" + x) - 0.5) * 8} ${r1(x - 38)} 588`;
    s += `<path d="${scallop}Z" fill="#8fbd78" stroke="${OUT}" stroke-opacity=".3" stroke-width="1.5"/><path d="M-440 552Q0 538 440 552" stroke="#c6e2a8" stroke-width="6" fill="none" stroke-linecap="round"/>`;
    // Porch, trees, telescope, mailbox.
    s += use("sw-pine", -300, 548, 0.85) + use("sw-tree", -420, 552, 1.15) + use("sw-tree", 210, 552, 0.9) + use("sw-bush", -168, 556, 0.8) + use("sw-flowers", 360, 552, 1.1) + use("sw-flowers", -120, 552, 1);
    s += `<g class="sw-telescope" transform="translate(620 0)"><path d="M-250 552L-236 470M-222 552L-236 470M-236 552V470" stroke="#6f5646" stroke-width="5" stroke-linecap="round"/><g transform="translate(-236 466) rotate(-32)"><rect x="-10" y="-11" width="86" height="22" rx="6" fill="#5b6f8f" stroke="${OUT}" stroke-opacity=".5" stroke-width="1.5"/><rect x="70" y="-15" width="16" height="30" rx="4" fill="#f2c46b" stroke="${OUT}" stroke-opacity=".5"/></g></g>`;
    s += `<path d="M-192 552V500" stroke="#8a6848" stroke-width="6"/>` + rect(-214, 470, 44, 32, "#e07d4f", ` rx="10"`) + `<path d="M-170 480h12v-18h-6" fill="none" stroke="#ffd35e" stroke-width="3"/>`;
    // Cable-car station on a deck that overhangs the east lip.
    s += `<g class="sw-station">` + rect(420, 540, 170, 14, "#b98a5a") + `<path d="M440 554L470 610M560 554L520 610" stroke="#8a6848" stroke-width="6"/>`;
    s += `<path d="M470 540L540 420M590 540L540 420M505 480H575" stroke="#8a6848" stroke-width="8" stroke-linecap="round"/><circle cx="550" cy="470" r="20" fill="#d8c3a0" stroke="#6f5646" stroke-width="5"/><circle cx="550" cy="470" r="5" fill="#6f5646"/>`;
    s += poly([[450, 420], [540, 380], [620, 420]], "#e07d4f") + `</g>`;
    const terrain = s;
    s = "";
    // The Star Office itself: cream walls, slate roof, a star in the gable window.
    const wall = "#f3e3c3",
      roof = "#5b6f8f";
    s += `<g class="sw-office">` + rect(-160, 540, 320, 16, "#b98a5a") + `<path d="M-150 556V588M150 556V588M-60 556V580M60 556V580" stroke="#8a6848" stroke-width="7"/>`;
    s += poly([[130, 360], [152, 346], [152, 540], [130, 552]], shade(wall, -0.2)) + rect(-130, 360, 260, 192, wall);
    s += rect(-130, 452, 260, 10, "#8a6848") + rect(-136, 360, 12, 192, "#b98a5a") + rect(124, 360, 12, 192, "#b98a5a");
    s += poly([[0, 238], [22, 226], [170, 354], [148, 368]], shade(roof, -0.3)) + poly([[-150, 368], [0, 238], [148, 368]], roof);
    for (let row = 1; row < 4; row++) s += `<path d="M${r1(-37 * row)} ${238 + row * 32}H${r1(37 * row)}" stroke="${shade(roof, -0.25)}" stroke-width="3" stroke-dasharray="16 6"/>`;
    s += `<circle cx="0" cy="318" r="31" fill="#8a6848"/><circle cx="0" cy="318" r="24" class="sw-win${lit ? " is-lit" : ""}" fill="${lit ? "#ffe39a" : "#a9bfd0"}"/><path d="M0 299L5.6 311.6L19 313L9 322.4L11.8 336L0 329L-11.8 336L-9 322.4L-19 313L-5.6 311.6Z" fill="#f2b33d"/>`;
    s += `<path d="M0 238V178" stroke="${OUT}" stroke-width="3"/><path d="M0 150L6.5 164L22 166L10.5 176L13.5 191L0 183L-13.5 191L-10.5 176L-22 166L-6.5 164Z" class="sw-beacon" fill="#ffd35e" stroke="#e59e2d" stroke-width="2"/>`;
    s += rect(84, 276, 26, 60, shade(wall, -0.12)) + rect(80, 270, 34, 10, "#8a6848");
    for (const [x, y] of [[-104, 380], [58, 380], [-104, 476], [58, 476]]) s += rect(x, y, 46, 50, lit ? "#ffe39a" : "#a9bfd0", ` rx="5" class="sw-win${lit ? " is-lit" : ""}"`) + `<path d="M${x + 23} ${y + 2}V${y + 48}M${x + 2} ${y + 25}H${x + 44}" stroke="#8a6848" stroke-width="3.5"/>` + rect(x - 4, y + 50, 54, 9, "#c97d5b", ` rx="2"`) + `<circle cx="${x + 10}" cy="${y + 49}" r="5" fill="#ffb3c7"/><circle cx="${x + 36}" cy="${y + 49}" r="5" fill="#ffe08a"/>`;
    s += `<path d="M-32 552V486A32 32 0 0 1 32 486V552Z" fill="#6f5140" stroke="${OUT}" stroke-opacity=".45" stroke-width="1.5"/><circle cx="18" cy="518" r="4" fill="#f2c46b"/>`;
    s += rect(-58, 424, 116, 24, "#3a3150", ` rx="6"`) + `<text x="0" y="441" class="sw-sign">STAR OFFICE</text>`;
    s += `</g>`;
    s += `<path d="M-300 470Q-220 500-150 470T0 470" fill="none" stroke="${OUT}" stroke-opacity=".35" stroke-width="1.5"/>`;
    for (let k = 0; k < 6; k++) s += `<circle cx="${-280 + k * 50}" cy="${r1(478 + Math.sin(k) * 8)}" r="6" class="sw-bulb" fill="#ffe39a"/>`;
    return { terrain: islandSvg(terrain), buildings: islandSvg(s) };
  }

  // Background sky over the island: high clouds and the sun/moon, all on one slow layer.
  function islandSky() {
    let s = `<circle class="sw-sun" cx="620" cy="190" r="70"/>`;
    for (const [x, y, id, sc] of [[-980, 260, "sw-cloud-b", 0.8], [-560, 150, "sw-cloud-c", 1], [-260, 330, "sw-cloud-a", 0.7], [260, 120, "sw-cloud-c", 0.8], [760, 360, "sw-cloud-a", 0.9], [-900, 640, "sw-cloud-a", 1.1], [700, 760, "sw-cloud-b", 1]])
      s += use(id, x, y, sc, ` class="sw-far"`);
    return islandSvg(s);
  }

  // ---------- B. cloud descent: four cloud layers at different depths ----------
  function descent() {
    const layer = (seed, n, band, scale) => {
      let s = `<svg class="sw-art" viewBox="-1100 0 2200 1500" width="2200" height="1500" aria-hidden="true" focusable="false">`;
      for (let k = 0; k < n; k++) {
        const id = ["sw-cloud-a", "sw-cloud-b", "sw-cloud-c"][Math.floor(hash(seed + "id" + k) * 3)];
        const x = -1150 + ((k + hash(seed + "x" + k) * 0.8) / n) * 2200;
        const y = band[0] + hash(seed + "y" + k) * (band[1] - band[0]);
        s += use(id, x, y, scale[0] + hash(seed + "s" + k) * (scale[1] - scale[0]));
      }
      return s + `</svg>`;
    };
    // The cloud sea: overlapping banks with gaps, so the sky shows through as the view passes.
    let sea = `<svg class="sw-art" viewBox="-1100 0 2200 1500" width="2200" height="1500" aria-hidden="true" focusable="false">`;
    for (let k = 0; k < 9; k++) {
      if (k === 3 || k === 7) continue;
      sea += use(k % 2 ? "sw-cloud-b" : "sw-cloud-a", -1180 + k * 250 + hash("sea" + k) * 60, 820 + hash("seay" + k) * 90, 1.15 + hash("seas" + k) * 0.35);
    }
    for (let k = 0; k < 6; k++) sea += use(k % 3 ? "sw-cloud-c" : "sw-cloud-a", -1100 + k * 380 + hash("wisp" + k) * 160, 1080 + hash("wispy" + k) * 360, 0.55 + hash("wisps" + k) * 0.6);
    sea += `</svg>`;
    // Distant paper islands: the sky world is bigger than this one street.
    let far = `<svg class="sw-art" viewBox="-1100 0 2200 1500" width="2200" height="1500" aria-hidden="true" focusable="false">`;
    for (const [x, y, sc] of [[-760, 520, 0.9], [640, 330, 0.7], [820, 1180, 0.55], [-420, 1320, 0.45]]) {
      far += `<g class="sw-distant" transform="translate(${x} ${y}) scale(${sc})"><path d="M-150 0C-140-18-110-24-60-24H70C120-24 146-16 152 0L120 30 90 36 70 80 20 96 0 130-30 92-80 70-100 34Z"/><path class="sw-distant-top" d="M-150 0C-140-18-110-24-60-24H70C120-24 146-16 152 0Q0 14-150 0Z"/><path d="M-40-24V-70L-10-96 20-70V-24Z"/><path d="M60-24V-54L80-70 100-54V-24Z"/></g>`;
    }
    far += `</svg>`;
    return {
      distant: far,
      "clouds-far": layer("far", 8, [80, 1450], [0.5, 0.8]),
      "clouds-mid": layer("mid", 6, [160, 1400], [0.8, 1.1]),
      "cloud-sea": sea,
      "clouds-near": layer("near", 4, [260, 1350], [1.1, 1.5]),
    };
  }

  // ---------- C. one street of Renguin City ----------
  // Far layers lag behind the street, so they only need to reach as far as the slowest pan shows.
  // Past the main street they repeat as mirrored copies: each copy's edge meets the previous one's.
  function tile(cls, body, total, depth) {
    const W = GEOMETRY.city.width,
      H = GEOMETRY.city.height;
    const need = Math.min(total, Math.ceil(total * depth + 3800));
    const copies = Math.max(0, Math.ceil(need / W) - 1);
    let s = copies ? `<g id="${cls}-seg">${body}</g>` : body;
    for (let k = 1; k <= copies; k++) s += `<use href="#${cls}-seg" transform="${k % 2 ? `translate(${W * (k + 1)} 0) scale(-1 1)` : `translate(${W * k} 0)`}"/>`;
    return `<svg class="sw-art ${cls}" viewBox="0 0 ${Math.max(W, total)} ${H}" width="${Math.max(W, total)}" height="${H}" aria-hidden="true" focusable="false">${s}</svg>`;
  }

  function city(state, streetWidth = GEOMETRY.city.width) {
    const idx = eraIndex(state);
    const variant = VARIANTS[idx];
    const st = STYLES[variant];
    const visual = state?.visual || {};
    const activity = state?.activity || {};
    const landmarks = new Set(visual.landmarks || []);
    const lit = (activity.lights_level ?? 60) > 30;
    const shops = visual.shops_open ?? 1;
    const G = GEOMETRY.city;
    const base = G.ground;
    const W = G.width;
    const floors = Math.max(1, Math.min(4, visual.building_height || 1));
    const total = Math.max(0, visual.buildings || 0);
    const front = [[470, 250], [760, 230], [2090, 250], [2380, 240]];
    const back = [[40, 190], [1010, 170], [1560, 180], [1870, 170], [2250, 160], [2600, 180], [640, 150], [2440, 150]];
    const frontCount = Math.min(front.length, Math.ceil(total / 3));
    const backCount = Math.min(back.length, Math.max(0, total - frontCount));
    const svg = (cls, body) => `<svg class="sw-art ${cls}" viewBox="0 0 ${W} ${G.height}" width="${W}" height="${G.height}" aria-hidden="true" focusable="false">${body}</svg>`;

    // Sky: clouds and kites, the slowest layer.
    let sky = "";
    for (const [x, y, id, sc] of [[80, 230, "sw-cloud-b", 0.9], [760, 140, "sw-cloud-c", 1], [1300, 260, "sw-cloud-a", 0.8], [1960, 170, "sw-cloud-b", 0.8], [2500, 250, "sw-cloud-c", 1.1]]) sky += use(id, x, y, sc, ` class="sw-far"`);
    for (const [x, y, c, r] of [[520, 250, "#f28c6d", -12], [1720, 150, "#7fc6c2", 10], [2380, 300, "#ffd35e", -6]])
      sky += `<g class="sw-kite" transform="translate(${x} ${y}) rotate(${r})"><path d="M0-34L22 0L0 40L-22 0Z" fill="${c}" stroke="${OUT}" stroke-opacity=".4" stroke-width="1.5"/><path d="M0-34V40M-22 0H22" stroke="#fff8ea" stroke-width="2"/><path d="M0 40C10 70-14 96 4 130S-6 180 10 214" fill="none" stroke="${OUT}" stroke-opacity=".35" stroke-width="1.5"/><path d="M-4 84l8 6-8 6ZM6 150l8 6-8 6Z" fill="${c}"/></g>`;
    // Distant background: mountains, hills, far houses, the era's skyline.
    let bg = "";
    bg += `<path class="sw-mountain" d="M0 560L220 390L360 470L560 330L760 480L980 360L1220 500L1420 380L1640 470L1880 340L2100 480L2340 370L2560 460L2800 360V1080H0Z"/><path class="sw-snow" d="M200 405L220 390L244 404L232 412ZM540 346L560 330L586 348L570 356ZM960 376L980 360L1002 374L988 382ZM1860 356L1880 340L1904 356L1890 364ZM2322 384L2340 370L2362 382L2348 390Z"/>`;
    bg += `<path class="sw-hill-far" d="M0 600Q180 520 400 560T820 540T1240 570T1680 530T2100 565T2520 535T2800 555V1080H0Z"/>`;
    if (idx >= 3) bg += `<g class="sw-skyline"><rect x="1210" y="330" width="96" height="260"/><circle cx="1258" cy="376" r="26" fill="#fff8e8" opacity=".75"/><path d="M1198 330L1258 258L1318 330Z"/></g>`;
    if (idx >= 4) bg += `<g class="sw-skyline"><rect x="1900" y="400" width="210" height="170"/><rect x="1880" y="330" width="46" height="240"/><rect x="2084" y="330" width="46" height="240"/><path d="M1872 330L1903 280L1934 330ZM2076 330L2107 280L2138 330Z"/></g>`;
    if (idx >= 5) bg += `<g class="sw-skyline"><rect x="600" y="220" width="22" height="360"/><circle cx="611" cy="240" r="26"/><rect x="2380" y="300" width="90" height="280"/><rect x="2490" y="360" width="70" height="220"/></g>`;
    for (let k = 0, x = 30; k < 22 && x < W; k++) {
      x += 70 + hash("farhouse" + k) * 190;
      const y = 548 + hash("farhy" + k) * 44,
        w = 26 + hash("farhw" + k) * 22,
        h = 18 + hash("farhh" + k) * 16;
      bg += `<path class="sw-far-house" d="M${r1(x)} ${r1(y + h)}V${r1(y)}L${r1(x + w / 2)} ${r1(y - w * 0.45)}L${r1(x + w)} ${r1(y)}V${r1(y + h)}Z"/>`;
    }
    bg += `<path class="sw-hill-near" d="M0 650Q240 590 520 630T1080 610T1620 640T2180 612T2800 630V1080H0Z"/>`;

    // Backdrop: older, smaller houses and trees behind the street.
    let backRow = "";
    const backStyle = STYLES[VARIANTS[Math.max(0, idx - 1)]];
    for (let k = 0; k < backCount; k++) {
      const [x, w] = back[k];
      backRow += `<g transform="translate(${x} ${base - 34}) scale(.62) translate(${-x} ${-base})">${facade(backStyle.kind, backStyle, x, base, w, Math.max(1, floors - 1), "back" + k, lit && hash("bl" + k) < shops)}</g>`;
    }
    for (const [x, sc, id] of [[330, 0.8, "sw-tree"], [1480, 0.7, "sw-pine"], [1830, 0.75, "sw-tree"], [2700, 0.9, "sw-pine"], [980, 0.6, "sw-pine"]]) backRow += use(id, x, base - 30, sc);
    if (idx >= 3 && landmarks.has("CLOCK_TOWER")) {
      backRow += `<g class="sw-clock">` + rect(1250, 300, 100, 410, "#e6dac4") + poly([[1238, 300], [1300, 218], [1362, 300]], STYLES.town.roof) + `<circle cx="1300" cy="360" r="30" fill="#fff8e8" stroke="${OUT}" stroke-opacity=".5" stroke-width="2"/><path d="M1300 360V338M1300 360H1318" stroke="${OUT}" stroke-width="3" stroke-linecap="round"/></g>`;
    }

    // Buildings: station, homes, plaza, market, construction.
    let mid = "";
    // Gondola station where the sky cable lands.
    mid += `<g class="sw-station">` + rect(160, base - 26, 290, 26, "#b98a5a") + `<path d="M184 ${base - 26}V${base - 190}M426 ${base - 26}V${base - 190}" stroke="#8a6848" stroke-width="9"/>`;
    mid += poly([[150, base - 186], [305, base - 250], [460, base - 186]], "#e07d4f") + rect(150, base - 190, 310, 12, "#c96a42");
    mid += `<path d="M258 ${base - 250}L300 ${G.wheel[1] - 20}M342 ${base - 250}L300 ${G.wheel[1] - 20}" stroke="#8a6848" stroke-width="7"/><circle cx="${G.wheel[0]}" cy="${G.wheel[1]}" r="22" fill="#d8c3a0" stroke="#6f5646" stroke-width="5"/><circle cx="${G.wheel[0]}" cy="${G.wheel[1]}" r="6" fill="#6f5646"/>`;
    mid += use("sw-bench", 250, base - 26, 0.9) + rect(360, base - 120, 56, 94, "#f3e3c3") + `<path d="M388 ${base - 104}l-14 18h9v14h10v-14h9Z" fill="#5b6f8f"/>` + `</g>`;
    // Homes on the street; a shop awning when the shop is open.
    const icons = [
      (cx, cy) => `<ellipse cx="${cx}" cy="${cy}" rx="10" ry="6" fill="#d8a15a"/><path d="M${cx - 6} ${cy - 2}l3 3M${cx} ${cy - 3}l3 3M${cx + 5} ${cy - 2}l2 3" stroke="#a86f35" stroke-width="1.5"/>`,
      (cx, cy) => `<path d="M${cx - 8} ${cy - 6}h14v10a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6Z" fill="#8fc8e8"/><path d="M${cx + 6} ${cy - 3}h3a3 3 0 0 1 0 6h-3" fill="none" stroke="#8fc8e8" stroke-width="2"/>`,
      (cx, cy) => `<path d="M${cx} ${cy - 9}l2.6 5.4 6 .8-4.3 4.1 1 5.9-5.3-2.8-5.3 2.8 1-5.9-4.3-4.1 6-.8Z" fill="#f2b33d"/>`,
    ];
    for (let k = 0; k < frontCount; k++) {
      const [x, w] = front[k];
      const open = hash("shop" + k) < shops;
      const icon = icons[k % icons.length](r1(x + w - 22), base - 118);
      mid += facade(st.kind, st, x, base, w, floors, "front" + k, lit && hash("fl" + k) < shops, k % 2 === 0 && open ? { shop: ["#e07d4f", "#6fae9a", "#e3a93d"][k % 3], icon } : {});
    }
    if (visual.construction && visual.construction !== "COMPLETE") {
      const [x, w] = front[frontCount] || [2600, 180];
      const mode = String(visual.construction).toLowerCase();
      mid += `<g class="sw-construction is-${esc(mode)}">` + rect(x + 10, base - 12, w - 20, 12, "#e9d9b5");
      for (let k = 0; k < 4; k++) mid += `<path d="M${x + 20 + k * ((w - 40) / 3)} ${base - 12}V${base - 190}" stroke="#c98c3a" stroke-width="6"/>`;
      for (const y of [60, 120, 180]) mid += `<path d="M${x + 14} ${base - y}H${x + w - 14}" stroke="#c98c3a" stroke-width="6"/>`;
      mid += `<path d="M${x + 20} ${base - 190}L${x + w - 20} ${base - 60}" stroke="#c98c3a" stroke-width="4" opacity=".7"/>`;
      if (idx >= 3) mid += `<path d="M${x + w - 30} ${base}V${base - 330}M${x - 40} ${base - 320}H${x + w + 20}M${x + 10} ${base - 320}V${base - 250}" stroke="#f2b33d" stroke-width="8" fill="none"/>`;
      mid += `</g>`;
    }
    // Plaza: campfire before the town era, fountain after.
    mid += `<ellipse cx="1300" cy="${base + 18}" rx="250" ry="26" fill="#f1e4c6" opacity=".7"/>`;
    if (idx < 3) {
      mid += `<g class="sw-campfire"><ellipse cx="1300" cy="${base - 4}" rx="56" ry="14" fill="#9a8a7a"/><ellipse cx="1300" cy="${base - 8}" rx="42" ry="10" fill="#6f5646"/><path d="M1264 ${base - 6}L1336 ${base - 22}M1266 ${base - 22}L1334 ${base - 6}" stroke="#8a5a36" stroke-width="10" stroke-linecap="round"/></g>`;
      mid += `<path d="M1370 ${base - 2}h70v-16h-70Z" fill="#9b7652" stroke="${OUT}" stroke-opacity=".3"/>`;
    } else {
      mid += `<g class="sw-fountain">` + `<path d="M1200 ${base}Q1200 ${base - 54} 1300 ${base - 54}Q1400 ${base - 54} 1400 ${base}Z" fill="${shade(st.wall, -0.1)}" stroke="${OUT}" stroke-opacity=".4" stroke-width="1.5"/>`;
      mid += `<ellipse cx="1300" cy="${base - 52}" rx="96" ry="12" fill="#8fd3ef"/>` + rect(1286, base - 140, 28, 90, shade(st.wall, -0.05)) + `<ellipse cx="1300" cy="${base - 140}" rx="46" ry="10" fill="${shade(st.wall, -0.1)}" stroke="${OUT}" stroke-opacity=".4"/>`;
      mid += `<path d="M1300 ${base - 146}Q1260 ${base - 200} 1230 ${base - 60}M1300 ${base - 146}Q1340 ${base - 200} 1370 ${base - 60}" fill="none" stroke="#bfe9f7" stroke-width="5" stroke-linecap="round"/></g>`;
    }
    const poster = (state?.featured_contents || [])[0];
    const [px, py, pw, ph] = G.poster;
    mid += `<g class="sw-board"><path d="M${px - 26} ${base}V${py - 12}M${px + pw + 26} ${base}V${py - 12}" stroke="#8a6848" stroke-width="8"/>` + rect(px - 34, py - 22, pw + 68, ph + 44, "#b98a5a", ` rx="6"`);
    if (poster && (state?.content?.total || 0) > 0) {
      mid += rect(px, py, pw, ph, "#fff8ea", ` rx="3"`) + `<path d="M${px + pw / 2 - 12} ${py + ph / 2 - 16}l30 16-30 16Z" fill="#e05a4f"/>`;
      if (poster.is_new) mid += `<path d="M${px + pw - 28} ${py - 8}h40v20h-40Z" fill="#e05a4f"/><text x="${px + pw - 8}" y="${py + 7}" class="sw-tag">NEW</text>`;
      mid += rect(px + pw + 8, py + 10, 20, 26, "#fffdf6", ` rx="2" transform="rotate(8 ${px + pw + 18} ${py + 22})"`);
    } else mid += rect(px, py, pw, ph, "#f1e8d6", ` rx="3" stroke-dasharray="6 5"`);
    mid += `</g>`;
    mid += use("sw-bench", 1480, base, 1);
    // Signpost: the only words on the street.
    mid += `<g class="sw-signpost"><path d="M1025 ${base}V${base - 170}" stroke="#8a6848" stroke-width="9"/>` + `<path d="M972 ${base - 162}h96l16 16-16 16h-96Z" fill="#e8d3a8" stroke="${OUT}" stroke-opacity=".45" stroke-width="1.5"/><text x="1022" y="${base - 140}" class="sw-sign-dark">主城區</text>` + `<path d="M1078 ${base - 116}h-96l-16 14 16 14h96Z" fill="#d9c49a" stroke="${OUT}" stroke-opacity=".45" stroke-width="1.5"/><text x="1032" y="${base - 97}" class="sw-sign-dark">↑ 空島</text></g>`;
    // Market: stalls from the town era, a single cart before it.
    if (landmarks.has("MARKET") || idx >= 3) {
      for (const [x, color, k] of [[1540, "#e07d4f", 0], [1680, "#6fae9a", 1]]) {
        const open = shops > k / 2;
        mid += `<g class="sw-stall${open ? "" : " is-closed"}"><path d="M${x} ${base}V${base - 120}M${x + 120} ${base}V${base - 120}" stroke="#8a6848" stroke-width="6"/>` + rect(x - 4, base - 52, 128, 52, "#c79a68");
        for (let s = 0; s < 6; s++) mid += `<path d="M${x - 10 + s * 23} ${base - 140}h23l-3 26h-23Z" fill="${s % 2 ? "#fff4e0" : open ? color : "#a9a3b5"}" stroke="${OUT}" stroke-opacity=".25"/>`;
        for (let f = 0; f < 7; f++) mid += `<circle cx="${x + 12 + f * 16}" cy="${base - 58}" r="7" fill="${["#f28c6d", "#ffd35e", "#9fd08a"][f % 3]}"/>`;
        mid += `</g>`;
      }
    } else {
      mid += `<g class="sw-cart"><circle cx="1600" cy="${base - 16}" r="16" fill="#8a6848"/><circle cx="1700" cy="${base - 16}" r="16" fill="#8a6848"/>` + rect(1570, base - 80, 160, 56, "#c79a68", ` rx="6"`) + `<path d="M1650 ${base - 80}V${base - 160}" stroke="#8a6848" stroke-width="5"/><path d="M1580 ${base - 150}Q1650 ${base - 210} 1720 ${base - 150}Z" fill="#e07d4f" stroke="${OUT}" stroke-opacity=".35"/></g>`;
    }
    // Lamps and trees along the street.
    for (const x of [130, 700, 1100, 1560, 2060, 2600]) mid += use("sw-lamp", x, base, 1);
    for (const [x, sc, id] of [[60, 1.2, "sw-tree"], [1850, 0.9, "sw-pine"], [2720, 1.25, "sw-tree"], [2780, 0.8, "sw-pine"]]) mid += use(id, x, base, sc);

    // Street: the road surface, the bridge over the stream and the soil cross-section.
    let ground = "";
    const roads = visual.roads || "trail";
    const surface = roads === "asphalt" ? "#7d8591" : roads === "glow" ? "#a9c3cf" : roads === "stone" ? "url(#sw-slab)" : roads === "cobble" ? "url(#sw-cobble)" : "#dcc7a0";
    const river = idx >= 2;
    ground += `<path d="M0 ${base - 6}H${W}V${G.height}H0Z" fill="#8fbd78"/>`;
    ground += `<rect x="0" y="${base}" width="${W}" height="64" fill="${surface}"/>`;
    if (roads === "trail" || roads === "dirt") for (let k = 0; k < 60; k++) ground += `<ellipse cx="${r1(hash("peb" + k) * W)}" cy="${r1(base + 10 + hash("peby" + k) * 44)}" rx="${r1(3 + hash("pebr" + k) * 5)}" ry="2.5" fill="#bda27a" opacity=".7"/>`;
    if (roads === "asphalt") ground += `<path d="M0 ${base + 32}H${W}" stroke="#f4efe4" stroke-width="4" stroke-dasharray="40 30"/>`;
    if (roads === "glow") ground += `<path d="M0 ${base + 4}H${W}" stroke="#9fe6f2" stroke-width="4"/>`;
    ground += `<path d="M0 ${base}H${W}" stroke="#f4ead2" stroke-width="5"/><path d="M0 ${base + 64}H${W}" stroke="#8e6f52" stroke-width="4"/>`;
    ground += `<path d="M0 ${base + 66}H${W}V${G.height}H0Z" fill="#b58e63"/>`;
    ground += `<path d="M0 ${base + 118}Q400 ${base + 100} 800 ${base + 124}T1600 ${base + 116}T2400 ${base + 126}T${W} ${base + 114}V${G.height}H0Z" fill="#9d7a57"/>`;
    ground += `<path d="M0 ${base + 214}Q500 ${base + 196} 1000 ${base + 220}T2000 ${base + 204}T${W} ${base + 218}V${G.height}H0Z" fill="#86664b"/>`;
    for (let k = 0; k < 40; k++) ground += `<ellipse cx="${r1(hash("stone" + k) * W)}" cy="${r1(base + 90 + hash("stoney" + k) * 240)}" rx="${r1(6 + hash("stoner" + k) * 14)}" ry="${r1(4 + hash("stoneh" + k) * 8)}" fill="${k % 2 ? "#c9a57a" : "#6f5443"}" opacity=".55"/>`;
    for (let k = 0; k < 14; k++) {
      const x = 80 + k * 200 + hash("rootx" + k) * 80;
      ground += `<path d="M${r1(x)} ${base + 66}C${r1(x + 10)} ${base + 110} ${r1(x - 20)} ${base + 140} ${r1(x + 6)} ${base + 190}" fill="none" stroke="#6f5443" stroke-width="3" opacity=".5" stroke-linecap="round"/>`;
    }
    if (river) {
      // The street crosses the stream on a wooden bridge; the water runs in a cut below.
      ground += `<path d="M1890 ${base + 30}Q1916 ${base + 176} 1990 ${base + 186}H2050Q2124 ${base + 176} 2150 ${base + 30}Z" fill="#6f9fae"/><path d="M1900 ${base + 44}Q2020 ${base + 64} 2140 ${base + 44}V${base + 30}H1900Z" fill="#8cc0cb"/>`;
      ground += `<path d="M1930 ${base + 96}q30 8 60 0t60 0M1972 ${base + 136}q24 6 48 0" stroke="#d8eef0" stroke-width="4" fill="none" stroke-linecap="round"/>`;
      ground += `<path d="M1924 ${base + 30}V${base + 120}M2116 ${base + 30}V${base + 120}" stroke="#7b5a40" stroke-width="12"/>`;
      ground += rect(1870, base - 6, 300, 36, "#b98a5a", ` rx="3"`);
      for (let k = 0; k < 15; k++) ground += `<path d="M${1880 + k * 20} ${base - 4}v32" stroke="#8a6848" stroke-width="2" opacity=".55"/>`;
      ground += `<path d="M1870 ${base - 44}H2170M1870 ${base - 24}H2170" stroke="#8a6848" stroke-width="5"/><path d="M1878 ${base - 4}V${base - 52}M1950 ${base - 4}V${base - 48}M2020 ${base - 4}V${base - 48}M2090 ${base - 4}V${base - 48}M2162 ${base - 4}V${base - 52}" stroke="#8a6848" stroke-width="7" stroke-linecap="round"/>`;
      ground += `<path d="M1892 ${base + 44}q-10-26 0-40M2150 ${base + 44}q10-26 0-36" stroke="#6ea35a" stroke-width="3.5" fill="none"/>`;
    }

    // Foreground: low, placed between residents so nobody is ever hidden.
    let fg = "";
    for (const x of [30, 500, 790, 1100, 1350, 1600, 1860, 2140, 2400, 2760]) fg += use("sw-tuft", x, base + 70, 1.2) + use("sw-tuft", x + 26, base + 72, 0.9);
    for (const x of [250, 1060, 1590, 2380]) fg += use("sw-flowers", x, base + 72, 1.1);
    fg += use("sw-bush", 20, base + 96, 1.5) + use("sw-bush", W - 30, base + 96, 1.6) + use("sw-fence", 2560, base + 70, 1);
    // A dormant city grows tall grass (V1's grass_level); nothing is taken away.
    const grass = visual.grass_level || 0;
    if (grass >= 2) for (let k = 0; k < W / 120; k++) fg += use("sw-tuft", 30 + k * 120 + hash(k + "|tallgrass") * 40, base + 66, 1.5 + grass * 0.25);

    // Effects: descriptors only; the page draws them in its own layer.
    const effects = [];
    if (idx < 3) effects.push({ kind: "flame", x: 1300, y: base - 24 });
    if ((activity.event_flags || []).some((f) => f === "FIREWORKS" || f === "SMALL_FIREWORKS"))
      for (let k = 0; k < 4; k++) effects.push({ kind: "firework", x: 900 + k * 260, y: 180 + (k % 2) * 90, color: ["#ffd35e", "#ff7fa8", "#7fd6c2", "#9db8f2"][k], delay: k * 0.6 });
    // Confetti over the plaza when the city celebrates (V1 shows it on CONFETTI or FIREWORKS).
    if ((activity.event_flags || []).some((f) => f === "CONFETTI" || f === "FIREWORKS"))
      for (let k = 0; k < 14; k++) effects.push({ kind: "confetti", x: Math.round(1040 + hash("cf" + k) * 520), y: 300 + Math.round(hash("cfy" + k) * 80), color: ["#ff7fa8", "#ffd35e", "#7fd6c2", "#9db8f2", "#ffb347"][k % 5], delay: +(hash("cfd" + k) * 2.4).toFixed(2) });
    return {
      layers: {
        sky: tile("sw-city-sky", sky, streetWidth, depthOf("city", "sky")),
        distant: tile("sw-city-distant", bg, streetWidth, depthOf("city", "distant")),
        backdrop: svg("sw-city-backdrop", backRow),
        buildings: svg("sw-city-buildings", mid),
        street: svg("sw-city-street", ground),
        foreground: svg("sw-city-foreground", fg),
      },
      effects,
      stats: { variant, grass, front_houses: frontCount, back_houses: backCount, river, market: landmarks.has("MARKET") || idx >= 3, fountain: idx >= 3, construction: visual.construction || null, poster: Boolean(poster) },
    };
  }

  function scene(state, options = {}) {
    const fill = (zone, painted) => LAYER_STACKS[zone].map((spec) => ({ ...spec, svg: spec.kind === "svg" ? painted[spec.name] : null }));
    const D = Districts();
    const plan = D.layout(state);
    const top = island(state);
    const town = city(state, plan.width);
    const people = cast(state, plan);
    const half = GEOMETRY.island.width / 2;
    const G = GEOMETRY.city;
    // The main street is the first stretch; every other district follows it on the same street.
    const main = {
      id: "MAIN_CITY",
      x: 0,
      width: G.width,
      layers: town.layers,
      effects: town.effects,
      hotspots: [{ id: "MAIN_CITY.DISTRICT", district: "MAIN_CITY", key: "DISTRICT", label: "主城區", tip: "主城區", box: [960, 570, 130, 56] }],
    };
    const stretches = [main, ...D.paint(state, plan)];
    const street = plan.districts.map((d) => ({
      id: d.id,
      name: d.name,
      status: d.status,
      x: d.x,
      width: d.width,
      crowd_density: d.row?.crowd_density || null,
      content_count: d.row?.content_count ?? null,
      recent_count: d.row?.recent_count ?? null,
      active_hotspots: d.row?.active_hotspots || [],
      unlock_hint: d.row?.unlock_hint || null,
      summary: d.row?.summary || null,
    }));
    // Street layers are painted per district (chunks), so each stretch can be culled and anchored on its own.
    const cityLayers = LAYER_STACKS.city.map((spec) => {
      if (spec.kind !== "svg") return { ...spec, svg: null };
      if (spec.host === "section") return { ...spec, svg: town.layers[spec.name] };
      return { ...spec, svg: null, chunks: stretches.map((d) => ({ district: d.id, x: d.x, width: d.width, svg: d.layers[spec.name] })) };
    });
    return {
      cable_z: CABLE_Z,
      sections: [
        {
          zone: "island",
          anchor: "top",
          height: GEOMETRY.island.height,
          layers: fill("island", { sky: islandSky(), terrain: top.terrain, buildings: top.buildings }),
          residents: people.island.map((c) => ({ character: c, x: c.spot + half, y: GEOMETRY.island.ground, spot: c.spot })),
          effects: [{ kind: "beacon", x: half, y: 170 }],
        },
        {
          zone: "descent",
          anchor: "center",
          height: GEOMETRY.descent.height,
          layers: fill("descent", descent(state)),
          residents: [],
          effects: [{ kind: "balloon", x: half - 640, y: 520 }, ...[[-420, 260], [380, 520], [120, 1040]].map(([x, y], k) => ({ kind: "bird", x: half + x, y, delay: k * 0.4 }))],
        },
        {
          zone: "city",
          anchor: "bottom",
          height: G.height,
          street: { width: plan.width, districts: street },
          layers: cityLayers,
          residents: people.city.map((c) => ({ character: c, district: c.stand, x: c.spot, y: G.feet, spot: c.spot })),
          effects: stretches.flatMap((d) => d.effects.map((fx) => ({ ...fx, district: d.id }))),
          hotspots: stretches.flatMap((d) => d.hotspots),
          crowd: D.crowd(state, plan, options.crowdCap ?? state?.residents?.render_cap?.desktop ?? 28),
          // Where residents' gossip is spoken: above each open district's signpost.
          talk: plan.districts.filter((d) => d.status === "UNLOCKED").map((d) => ({ district: d.id, x: d.id === "MAIN_CITY" ? 1025 : d.x + 60, y: 540 })),
          stats: { ...town.stats, street_width: plan.width, districts: stretches.map((d) => ({ id: d.id, status: d.status || "UNLOCKED", ...(d.stats || {}) })) },
        },
      ],
    };
  }

  const api = { GEOMETRY, LAYER_STACKS, CABLE_Z, kit: { OUT, r1, shade, pts, poly, rect, use, facade }, scene, cast, nameOf, roleOf, sourceOf, defs, island, islandSky, descent, city, facade, eraIndex };
  root.RenguinSeamlessArt = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
