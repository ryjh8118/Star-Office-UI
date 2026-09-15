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
  const Buildings = () => root.RenguinSeamlessBuildings || (typeof require === "function" ? require("./seamless-buildings.js") : null);

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
      Buildings().defs() +
      `</defs></svg>`
    );
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
    // The sun stands upper left, where every building's light comes from (contact shadows fall to the right).
    let s = `<circle class="sw-sun-halo" cx="-700" cy="170" r="130"/><circle class="sw-sun" cx="-700" cy="170" r="70"/>`;
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

  // Main-street lots. `order` is the order the engine's building count fills them; `since` is the grade a
  // lot can first stand at, and how far the world has grown past it is how far that building has upgraded.
  // Lots sit a few units apart, so a grown street reads as blocks; the plaza keeps its opening to the landmark.
  const MAIN_LOTS = {
    front: [
      { x: 478, w: 205, since: 0, order: 0, shop: "#e07d4f", sign: 0 },
      { x: 2205, w: 200, since: 0, order: 1, shop: "#6fae9a", sign: 1 },
      { x: 697, w: 170, since: 1, order: 2, floors: -1 },
      { x: 2418, w: 175, since: 2, order: 3, shop: "#e3a93d", sign: 2, floors: -1 },
      { x: 880, w: 128, since: 3, order: 4, floors: -1 },
      { x: 2606, w: 190, since: 4, order: 5 },
    ],
    back: [
      { x: 590, w: 180, since: 1, order: 0 },
      { x: 2135, w: 165, since: 1, order: 1 },
      { x: 775, w: 200, since: 2, order: 2 },
      { x: 2325, w: 190, since: 2, order: 3 },
      { x: 1560, w: 210, since: 3, order: 4 },
      { x: 950, w: 150, since: 4, order: 5 },
      { x: 2520, w: 190, since: 4, order: 6 },
      { x: 1765, w: 170, since: 5, order: 7 },
      { x: 2700, w: 150, since: 6, order: 8 },
    ],
    skyline: [180, 345, 505, 670, 830, 985, 1575, 1735, 1895, 2055, 2215, 2375, 2535, 2690].map((x, i) => ({ x, w: 150 + Math.round(hash(i + "|skyw") * 50), since: [0, 1, 0, 2, 3, 1, 2, 0, 4, 3, 1, 5, 6, 2][i], order: i, floors: i % 3 === 1 ? 1 : 0 })),
  };
  const MAIN_LAMPS = [130, 700, 1100, 1560, 2060, 2600];

  // The main street's landmark behind the plaza: one building per era, rebuilt grander each time,
  // with wings and banners added as the era progresses.
  function townHall(idx, g, landmarks, lit, base) {
    const B = Buildings();
    const variant = VARIANTS[idx];
    const pal = B.palette(variant, "MAIN_CITY");
    const { flat, box, mix: blend } = B.kit;
    const step = Math.max(0, g - idx * 3);
    // The hero of the street: less air in front of it than the set-back row, so it reads first.
    const haze = 0.05;
    const tone = (c) => blend(c, B.HAZE, haze);
    const wall = pal.wall("hall"),
      roof = pal.roof("hall");
    const H = (o) => B.house({ base, lit, trim: pal.trim, stone: pal.stone, mat: pal.mat, wall, roof, haze, lvl: 0, parts: [], ...o });
    const cx = 1300;
    // A square tower with a lit face, a shaded return and a cap.
    const tower = (x, w, h, cap, face = wall) => {
      const top = base - h;
      let s = flat([[x + w, top], [x + w + 16, top - 9], [x + w + 16, base - 9], [x + w, base]], tone(shade(face, -0.32)), ` stroke="${OUT}" stroke-opacity=".36" stroke-width="1.5"`);
      s += rect(x, top, w, h, tone(face)) + box(x, top, w, h, `url(#swb-${pal.mat === "panel" || pal.mat === "glass" ? "panel" : pal.mat === "plank" ? "log" : "stone"})`) + box(x, top, w, h, "url(#swb-lightwall)") + box(x, base - 60, w, 60, "url(#swb-ao)");
      if (cap === "spire") s += poly([[x - 10, top + 2], [x + w / 2, top - w * 1.2], [x + w + 10, top + 2]], tone(roof)) + flat([[x + w / 2, top - w * 1.2], [x + w + 10, top + 2], [x + w / 2, top + 2]], "#2c2340", ` opacity=".16"`) + flat([[x - 10, top + 2], [x + w / 2, top - w * 1.2], [x + w / 2, top + 2]], "url(#swb-sheen)");
      else if (cap === "cone") s += poly([[x - 14, top + 4], [x + w / 2, top - w * 0.95], [x + w + 14, top + 4]], tone(roof)) + flat([[x + w / 2, top - w * 0.95], [x + w + 14, top + 4], [x + w / 2, top + 4]], "#2c2340", ` opacity=".16"`);
      else if (cap === "crenel") for (let k = 0; k < Math.floor(w / 22); k++) s += rect(x + k * 22 + 2, top - 18, 14, 18, tone(face));
      else s += rect(x - 6, top - 12, w + 12, 12, tone(pal.trim));
      return s;
    };
    const banner = (x, y, color) => `<path d="M${x} ${y}h26v54l-13-10-13 10Z" fill="${tone(color)}" stroke="${OUT}" stroke-opacity=".4"/><path d="M${x + 13} ${y + 14}l4 8h-8Z" fill="#fff4d6"/>`;
    let s = `<g class="sw-landmark" data-era="${variant}" data-step="${step}" transform="translate(${cx} ${base - 34}) scale(.82) translate(${-cx} ${-base})">`;
    if (idx === 0) {
      if (step >= 1) s += H({ kind: "tent", x: cx - 300, w: 150, lvl: 1, roof: "#6fae9a" }) + H({ kind: "tent", x: cx + 150, w: 150, lvl: 1, roof: "#e8a05a" });
      s += H({ kind: "tent", x: cx - 150, w: 300, lvl: 4 + step, parts: step >= 2 ? ["flowers", "sign"] : ["flowers"] });
    } else if (idx === 1) {
      for (const tx of [cx - 230, cx + 206]) s += `<g class="sw-totem-pole">${[0, 1, 2, 3].map((k) => rect(tx, base - 60 - k * 56, 26, 56, tone(["#c98a55", "#e6bb5e", "#8a5a36", "#6fae9a"][k]))).join("")}${poly([[tx - 28, base - 238], [tx + 13, base - 262], [tx + 54, base - 238]], tone("#e07d4f"))}</g>`;
      if (step >= 1) s += H({ kind: "hut", x: cx - 330, w: 120, lvl: 1 }) + H({ kind: "hut", x: cx + 230, w: 120, lvl: 1 });
      s += H({ kind: "hut", x: cx - 150, w: 290, lvl: 4 + step, parts: ["flowers", "sign"] });
    } else if (idx === 2) {
      s += tower(cx - 34, 68, 400, "spire") + `<path d="M${cx - 16} ${base - 330}v-34a16 16 0 0 1 32 0v34Z" fill="#3d3244"/><path d="M${cx - 10} ${base - 336}q10-22 20 0Z" fill="#f2c46b"/>`;
      if (step >= 1) s += H({ kind: "cabin", x: cx - 330, w: 150, floors: 1, lvl: 2, parts: ["flowers", "chimney"] }) + H({ kind: "cabin", x: cx + 190, w: 150, floors: 1, lvl: 2, parts: ["flowers"] });
      s += H({ kind: "cabin", x: cx - 165, w: 330, floors: 2, lvl: 5 + step, parts: ["flowers", "chimney", "dormer"] });
      if (step >= 2) s += banner(cx - 150, base - 176, "#e07d4f") + banner(cx + 124, base - 176, "#6fae9a");
    } else if (idx === 3) {
      s += H({ kind: "house", x: cx - 330, w: 200, floors: 2, lvl: 5, parts: ["flowers", "chimney", "dormer", "balcony"] }) + H({ kind: "house", x: cx + 130, w: 200, floors: 2, lvl: 5, parts: ["flowers", "balcony", "dormer"] });
      s += tower(cx - 70, 140, 470, "spire");
      s += `<circle cx="${cx}" cy="${base - 400}" r="40" fill="#fff8e8" stroke="${OUT}" stroke-opacity=".5" stroke-width="3"/><circle cx="${cx}" cy="${base - 400}" r="44" fill="none" stroke="${tone(pal.trim)}" stroke-width="6"/><path d="M${cx} ${base - 400}V${base - 428}M${cx} ${base - 400}H${cx + 20}" stroke="${OUT}" stroke-width="4" stroke-linecap="round"/>`;
      for (const k of [0, 1]) s += `<use href="#swb-win-arch" x="${cx - 44 + k * 54}" y="${base - 310}" color="${pal.trim}" class="swb-w${lit ? " is-lit" : ""}"/>`;
      s += `<path d="M${cx - 52} ${base}V${base - 110}A52 52 0 0 1 ${cx + 52} ${base - 110}V${base}Z" fill="${tone(pal.trim)}" stroke="${OUT}" stroke-opacity=".4"/><path d="M${cx - 38} ${base}V${base - 104}A38 38 0 0 1 ${cx + 38} ${base - 104}V${base}Z" fill="#3d3244"/>`;
      if (step >= 1) s += banner(cx - 110, base - 250, "#bb4d42") + banner(cx + 84, base - 250, "#5b6f8f");
      if (step >= 2) s += `<path d="M${cx - 330} ${base - 196}Q${cx - 170} ${base - 150} ${cx - 70} ${base - 220}M${cx + 70} ${base - 220}Q${cx + 170} ${base - 150} ${cx + 330} ${base - 196}" stroke="${OUT}" stroke-opacity=".4" stroke-width="2" fill="none"/>`;
    } else if (idx === 4) {
      s += tower(cx - 330, 96, 400, "cone") + tower(cx + 234, 96, 400, "cone");
      s += rect(cx - 240, base - 250, 480, 250, tone(wall)) + box(cx - 240, base - 250, 480, 250, "url(#swb-stone)") + box(cx - 240, base - 80, 480, 80, "url(#swb-ao)");
      for (let k = 0; k < 20; k++) s += rect(cx - 240 + k * 24 + 3, base - 268, 16, 18, tone(wall));
      s += H({ kind: "manor", x: cx - 140, w: 280, floors: 3, lvl: 8, parts: ["flowers", "chimney", "balcony", "turret"] });
      for (const bx of [cx - 318, cx + 246]) s += use("swb-flag", bx + 48, base - 480, 1.2, ` color="${tone("#e05a4f")}"`);
      if (step >= 1) s += banner(cx - 220, base - 230, "#5d72a6") + banner(cx + 194, base - 230, "#5d72a6");
      if (step >= 2) s += banner(cx - 170, base - 230, "#f2c14e") + banner(cx + 144, base - 230, "#f2c14e");
    } else if (idx === 5) {
      // The TV tower and a glass city hall.
      const tx = cx + 230;
      s += `<g class="sw-tv-tower"><path d="M${tx - 50} ${base}L${tx - 8} ${base - 560}H${tx + 8}L${tx + 50} ${base}Z" fill="${tone("#d6dde4")}" stroke="${OUT}" stroke-opacity=".4" stroke-width="1.5"/><path d="M${tx} ${base - 560}L${tx + 8} ${base - 560}L${tx + 50} ${base}H${tx}Z" fill="#2c2340" opacity=".14"/>`;
      s += `<ellipse cx="${tx}" cy="${base - 470}" rx="66" ry="26" fill="${tone("#a5bacb")}" stroke="${OUT}" stroke-opacity=".45" stroke-width="1.5"/><path d="M${tx - 60} ${base - 470}H${tx + 60}" stroke="url(#swb-neon)" stroke-width="6" class="swb-neon"/><path d="M${tx} ${base - 560}V${base - 660}" stroke="${OUT}" stroke-width="3"/><circle cx="${tx}" cy="${base - 664}" r="7" fill="#ff7b7b" class="sw-beacon"/></g>`;
      s += H({ kind: "tower", x: cx - 130, w: 230, floors: 5, lvl: 6, parts: ["sign", "roofgarden"] });
      if (step >= 1) s += H({ kind: "tower", x: cx - 300, w: 150, floors: 3, lvl: 3, parts: ["sign"] });
      if (step >= 2) s += `<path d="M${cx - 150} ${base - 380}H${tx - 40}" stroke="url(#swb-neon)" stroke-width="8" class="swb-neon"/>`;
    } else {
      // The sky spire and its floating garden ring; the starport adds a glowing dock ring.
      s += H({ kind: "spire", x: cx - 300, w: 120, floors: 4, lvl: 3 }) + H({ kind: "spire", x: cx + 190, w: 120, floors: 4, lvl: 3 });
      s += H({ kind: "spire", x: cx - 95, w: 190, floors: 6, lvl: 8, parts: ["turret"] });
      s += `<ellipse cx="${cx}" cy="${base - 660}" rx="240" ry="34" fill="none" stroke="${tone("#9fe6f2")}" stroke-width="10" class="swb-neon"/>`;
      if (step >= 1 || landmarks.has("SKY_GARDEN")) for (let k = 0; k < 7; k++) s += `<ellipse cx="${cx - 210 + k * 70}" cy="${base - 676 + Math.abs(3 - k) * 6}" rx="26" ry="18" fill="${tone(k % 2 ? "#7fab6e" : "#5f8a5d")}"/>`;
      if (idx === 7) s += `<circle cx="${cx}" cy="${base - 820}" r="70" fill="none" stroke="url(#swb-neon)" stroke-width="12" class="swb-neon"/><circle cx="${cx}" cy="${base - 820}" r="52" fill="#1f2758" opacity=".85"/>`;
    }
    return s + `</g>`;
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
    const B = Buildings();
    const g = B.grade(state);
    // The engine's building count fills the lots in order; the grade decides how grand each one has become.
    const frontCount = Math.min(MAIN_LOTS.front.length, Math.ceil(total / 2));
    const backCount = Math.min(MAIN_LOTS.back.length, Math.max(0, total - 2));
    const skyCount = total ? Math.min(MAIN_LOTS.skyline.length, total + 2) : 0;
    const rowOpts = { base, g, variant, district: "MAIN_CITY", lit, shops, height: floors };
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
    // A far town on the hills that thickens as the world grows: roofs, then towers.
    for (let k = 0, x = 0; k < Math.min(60, 12 + g * 3) && x < W; k++) {
      x += 30 + hash(k + "|fartown") * 70;
      const y = 574 + hash(k + "|fartowny") * 30,
        w = 30 + hash(k + "|fartownw") * 34,
        h = 26 + hash(k + "|fartownh") * (24 + g * 3);
      bg += idx >= 5 && k % 3 === 0 ? `<path class="sw-far-town" d="M${r1(x)} ${r1(y + 40)}V${r1(y - h)}h${r1(w * 0.7)}V${r1(y + 40)}Z"/>` : `<path class="sw-far-town" d="M${r1(x)} ${r1(y + 40)}V${r1(y - h * 0.5)}L${r1(x + w / 2)} ${r1(y - h * 0.5 - w * 0.4)}L${r1(x + w)} ${r1(y - h * 0.5)}V${r1(y + 40)}Z"/>`;
      if (lit && hash(k + "|farlit") < 0.5) bg += `<rect class="sw-far-light" x="${r1(x + w * 0.3)}" y="${r1(y - h * 0.3)}" width="5" height="6"/>`;
    }
    bg += `<path class="sw-hill-near" d="M0 650Q240 590 520 630T1080 610T1620 640T2180 612T2800 630V1080H0Z"/>`;

    // Backdrop: the town behind the street — a skyline row in haze, and the main street's landmark
    // behind the plaza, which is rebuilt grander every era and gains wings within one.
    let backRow = "";
    for (const [x, sc, id] of [[40, 0.9, "sw-tree"], [2740, 0.95, "sw-pine"], [2790, 0.8, "sw-tree"]]) backRow += use(id, x, base - 30, sc);
    const skyline = B.row(MAIN_LOTS.skyline, { ...rowOpts, rowId: "s", count: skyCount, scale: 0.62, lift: 48, haze: 0.32, height: floors + 1, maxFloors: 6 });
    backRow += skyline.svg;
    if (total) backRow += B.heroLight(1300, base - 330, 520, 430, true) + townHall(idx, g, landmarks, lit, base);
    for (const [x, sc] of [[1105, 0.75], [1495, 0.7]]) backRow += use("swb-cypress", x, base - 30, sc);
    if (skyCount && frontCount >= MAIN_LOTS.front.length && idx >= 3 && visual.construction && visual.construction !== "COMPLETE") backRow += B.crane(2650, base - 30, 0.95);

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
    const lots = (list) => list.map((lot) => (lot.sign === undefined ? lot : { ...lot, sign: icons[lot.sign] }));
    const back = B.row(MAIN_LOTS.back, { ...rowOpts, rowId: "b", count: backCount, scale: 0.8, lift: 22, haze: 0.12, height: floors + 1, maxFloors: 5 });
    const front = B.row(lots(MAIN_LOTS.front), { ...rowOpts, rowId: "f", count: frontCount, maxFloors: 4 });
    mid += back.svg + front.svg;
    // The construction site takes the next lot the street has not built yet; once every lot stands,
    // the street keeps building upward: scaffolding climbs the last front building for its next storey.
    if (visual.construction && visual.construction !== "COMPLETE") {
      const next = MAIN_LOTS.front.find((lot) => !front.lots.some((l) => l.x === lot.x));
      const mode = String(visual.construction).toLowerCase();
      const top = next ? base : base - (front.lots.at(-1)?.floors || 1) * 86 - 150;
      const { x, w } = next || MAIN_LOTS.front.at(-1);
      mid += `<g class="sw-construction is-${esc(mode)}${next ? "" : " is-upward"}">` + rect(x + 10, top - 12, w - 20, 12, "#e9d9b5");
      for (let k = 0; k < 4; k++) mid += `<path d="M${r1(x + 20 + k * ((w - 40) / 3))} ${top - 12}V${top - 190}" stroke="#c98c3a" stroke-width="6"/>`;
      for (const y of [60, 120, 180]) mid += `<path d="M${x + 14} ${top - y}H${x + w - 14}" stroke="#c98c3a" stroke-width="6"/>`;
      mid += `<path d="M${x + 20} ${top - 190}L${x + w - 20} ${top - 60}" stroke="#c98c3a" stroke-width="4" opacity=".7"/>`;
      if (idx >= 3) mid += `<path d="M${x + w - 30} ${top}V${top - 330}M${x - 40} ${top - 320}H${x + w + 20}M${x + 10} ${top - 320}V${top - 250}" stroke="#f2b33d" stroke-width="8" fill="none"/>`;
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
    for (const x of MAIN_LAMPS) mid += use("sw-lamp", x, base, 1);
    for (const [x, sc, id] of [[60, 1.2, "sw-tree"], [1850, 0.9, "sw-pine"], [2720, 1.25, "sw-tree"], [2780, 0.8, "sw-pine"]]) mid += use(id, x, base, sc);

    // Street: the road, curb, retaining wall and soil (shared with every district), then the stream and its bridge.
    const roads = visual.roads || "trail";
    const river = idx >= 2;
    let ground = B.ground({ x0: 0, w: W, base, H: G.height, roads, idx, seed: "main", lamps: MAIN_LAMPS });
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
    fg += B.frontEdge({ x0: 0, base }, [330, 1180, 1760, 2470], idx >= 3 ? "flowers" : "garden");
    fg += B.nearEdge(0, W, base, G.height, G.spots, "main");
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
      stats: { variant, grass, front_houses: front.lots.length, back_houses: back.lots.length + skyline.lots.length, grade: g, evolution: [...front.lots, ...back.lots, ...skyline.lots], river, market: landmarks.has("MARKET") || idx >= 3, fountain: idx >= 3, construction: visual.construction || null, poster: Boolean(poster) },
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

  const api = { GEOMETRY, LAYER_STACKS, CABLE_Z, kit: { OUT, r1, shade, pts, poly, rect, use }, scene, cast, nameOf, roleOf, sourceOf, defs, island, islandSky, descent, city, eraIndex };
  root.RenguinSeamlessArt = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
