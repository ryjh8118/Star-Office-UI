/* Renguin World city renderer: world_state -> one SVG string.
 *
 * Pure: no DOM, no timers, no network. The same state always draws the same
 * city, which is what lets Node tests check it and lets the page throw the
 * whole scene away when it leaves.
 *
 * Output is two layers: a static SVG city that never animates (so the browser
 * paints it once) and an HTML overlay whose motion is transform/opacity only,
 * which the compositor runs without repainting the city.
 *
 * One camera for every era: a 2:1 isometric floating island, 13x13 tiles,
 * light from the upper left, one outline colour. Eras swap materials, roofs,
 * heights and landmarks on the same tiles; they never swap the art style.
 */
(function (root) {
  "use strict";
  const TW = 64,
    TH = 32,
    ISLAND = 6,
    FLOOR = 14,
    OUTLINE = "#3a3150";
  const VARIANTS = ["camp", "tribe", "riverside", "town", "kingdom", "modern", "future", "starport"];
  const STYLES = {
    camp: { ground: "#dcc79d", road: "#c9a978", wall: "#ead2a2", roof: "#e07d4f", trim: "#f4c26b", kind: "tent" },
    tribe: { ground: "#d6c292", road: "#c1a072", wall: "#bf915f", roof: "#e6bb5e", trim: "#8a5a36", kind: "hut" },
    riverside: { ground: "#d0be92", road: "#bb9c72", wall: "#b07c50", roof: "#8e4e3c", trim: "#e8d3a8", kind: "cabin" },
    town: { ground: "#dccdac", road: "#cab393", wall: "#e0967a", roof: "#bb4d42", trim: "#fff1d6", kind: "house" },
    kingdom: { ground: "#d9d1bf", road: "#c2b8a6", wall: "#e6dac4", roof: "#5d72a6", trim: "#f4e9d2", kind: "manor" },
    modern: { ground: "#cdd3d7", road: "#848d98", wall: "#eaf0f4", roof: "#a5bacb", trim: "#8fc8e8", kind: "tower" },
    future: { ground: "#d9e8e4", road: "#a3bcc7", wall: "#f5f8f9", roof: "#82d9c5", trim: "#9fe6f2", kind: "spire" },
    starport: { ground: "#dbe3ef", road: "#91a8c4", wall: "#f4f6fc", roof: "#a192f2", trim: "#bccbff", kind: "spire" },
  };
  // Landmark and district tiles are fixed, so an era only ever upgrades a lot.
  const LOTS = {
    CLOCK_TOWER: [-2, -2],
    MARKET: [-2, 2],
    STAR_OFFICE: [-2, -1],
    HATCHERY: [-3, 2],
    STAGE: [2, -3],
    HOTEL: [3, 1],
    CASTLE_KEEP: [-3, -3],
    TV_TOWER: [3, -3],
    VIDEO_HALL_DOME: [3, 3],
    SKY_GARDEN: [-3, 3],
    SPACE_GATE: [-5, -5],
    WOODEN_BRIDGE: [0, 4],
    RIVER_DOCK: [5, 4],
    CREATOR_TOTEM: [-1, -1],
    POSTER: [1, 1],
  };
  const DISTRICT_ANCHORS = {
    MAIN_CITY: [0, 0],
    CREATOR_DISTRICT: [-2, -1],
    TRAVEL_DISTRICT: [4, 3],
    VIDEO_HALL: [3, 3],
    MEMBER_DISTRICT: [-3, 2],
    ENTERTAINMENT_DISTRICT: [2, -3],
    FUTURE_GATE: [-5, -5],
  };
  const SPECIALS = [
    ["STAR_OFFICE", "CREATOR_DISTRICT", "STAR OFFICE"],
    ["HATCHERY", "MEMBER_DISTRICT", "孵蛋所"],
    ["STAGE", "ENTERTAINMENT_DISTRICT", "夜市舞台"],
    ["HOTEL", "TRAVEL_DISTRICT", "HOTEL"],
  ];
  const SPOTS = [
    [0.55, -0.75],
    [-0.75, 0.55],
    [1.35, 0.35],
    [0.35, 1.35],
    [-1.35, -0.2],
    [-0.2, -1.4],
    [1.5, -1.3],
    [-1.3, 1.5],
    [2.2, 0.6],
    [0.6, 2.2],
  ];
  const BADGES = {
    NURSE: "#8fd9c0",
    FACTORY_WORKER: "#f2b66d",
    DELIVERY_COURIER: "#f28c6d",
    CONSTRUCTION_ASSISTANT: "#f5d45e",
    BAKERY_STAFF: "#f7a8c4",
    CALL_CENTER: "#9db8f2",
    HOTEL_STAFF: "#c7a3e8",
    VILLAGER: "#a9d27d",
    TRAVELER: "#7fc6e0",
    VENDOR: "#ef9a5a",
    FESTIVAL_GOER: "#ff7fa8",
  };

  const hash = (text) => {
    let h = 2166136261;
    for (const ch of String(text)) {
      h ^= ch.codePointAt(0);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967296;
  };
  const esc = (v) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const r1 = (n) => Math.round(n * 10) / 10;
  const iso = (i, j) => [(i - j) * (TW / 2), (i + j) * (TH / 2)];
  const pts = (list) => list.map(([x, y]) => r1(x) + "," + r1(y)).join(" ");
  const shade = (hex, f) => {
    const n = parseInt(hex.slice(1), 16);
    const mix = (c) => Math.round(f >= 0 ? c + (255 - c) * f : c * (1 + f));
    return "#" + [n >> 16, (n >> 8) & 255, n & 255].map((c) => mix(c).toString(16).padStart(2, "0")).join("");
  };
  const poly = (list, fill, extra = "") =>
    `<polygon points="${pts(list)}" fill="${fill}" stroke="${OUTLINE}" stroke-opacity=".45" stroke-width="1" stroke-linejoin="round"${extra}/>`;

  function eraIndex(state) {
    const i = VARIANTS.indexOf(state?.visual?.era_variant);
    return i < 0 ? 0 : i;
  }

  function tile(i, j, fill, cls = "") {
    const [x, y] = iso(i, j);
    return `<polygon class="${cls}" points="${pts([
      [x, y - TH / 2],
      [x + TW / 2, y],
      [x, y + TH / 2],
      [x - TW / 2, y],
    ])}" fill="${fill}"/>`;
  }

  function prism(x, y, s, h, wall) {
    const N = [x, y - (TH / 2) * s - h],
      E = [x + (TW / 2) * s, y - h],
      S = [x, y + (TH / 2) * s - h],
      W = [x - (TW / 2) * s, y - h];
    return {
      svg:
        poly([[x - (TW / 2) * s, y], [x, y + (TH / 2) * s], S, W], wall) +
        poly([[x, y + (TH / 2) * s], [x + (TW / 2) * s, y], E, S], shade(wall, -0.18)) +
        poly([N, E, S, W], shade(wall, 0.22)),
      N,
      E,
      S,
      W,
    };
  }

  function pyramidRoof(p, r, color) {
    const apex = [(p.W[0] + p.E[0]) / 2, (p.N[1] + p.S[1]) / 2 - r];
    return poly([p.W, p.S, apex], color) + poly([p.S, p.E, apex], shade(color, -0.2));
  }

  function gableRoof(p, r, color, wall) {
    const m1 = [(p.N[0] + p.W[0]) / 2, (p.N[1] + p.W[1]) / 2 - r];
    const m2 = [(p.S[0] + p.E[0]) / 2, (p.S[1] + p.E[1]) / 2 - r];
    return (
      poly([p.N, p.E, m2, m1], shade(color, -0.12)) +
      poly([p.W, p.S, m2, m1], color) +
      poly([p.S, p.E, m2], shade(wall, -0.25))
    );
  }

  function windows(p, x, y, s, floors, lit, gap = FLOOR) {
    let out = "";
    const cls = "rw-win" + (lit ? " is-lit" : "");
    for (let f = 0; f < floors; f++) {
      const yy = y - f * gap - gap * 0.55;
      out += `<line class="${cls}" x1="${r1(x - (TW / 2) * s + 5)}" y1="${r1(yy - 2)}" x2="${r1(x - 4)}" y2="${r1(yy + (TH / 2) * s - 4)}"/>`;
      out += `<line class="${cls}" x1="${r1(x + 4)}" y1="${r1(yy + (TH / 2) * s - 4)}" x2="${r1(x + (TW / 2) * s - 5)}" y2="${r1(yy - 2)}"/>`;
    }
    return out;
  }

  function building(kind, style, x, y, floors, seed, lit, shopOpen) {
    const s = 0.62 + hash(seed + "s") * 0.12;
    let out = `<g class="rw-building" data-kind="${kind}">`;
    out += `<ellipse cx="${r1(x)}" cy="${r1(y + 3)}" rx="${r1(26 * s)}" ry="${r1(10 * s)}" fill="#2c2340" opacity=".12"/>`;
    if (kind === "tent") {
      const p = prism(x, y, s, 0, style.wall);
      out += pyramidRoof(p, 26, style.roof);
      out += `<line x1="${r1(x)}" y1="${r1(y - 26)}" x2="${r1(x)}" y2="${r1(y + 8 * s)}" stroke="${style.trim}" stroke-width="2"/>`;
    } else if (kind === "hut") {
      const p = prism(x, y, s * 0.9, 11, style.wall);
      out += p.svg + pyramidRoof(p, 24, style.roof);
    } else if (kind === "cabin" || kind === "house") {
      const h = floors * FLOOR;
      const p = prism(x, y, s, h, style.wall);
      out += p.svg + windows(p, x, y, s, floors, lit) + gableRoof(p, 13, style.roof, style.wall);
      if (kind === "house" && hash(seed + "shop") < 0.45) {
        out += `<polygon class="rw-awning${shopOpen ? "" : " is-closed"}" points="${pts([
          [x + 3, y + (TH / 2) * s - 9],
          [x + (TW / 2) * s - 3, y - 9 + 2],
          [x + (TW / 2) * s + 2, y - 2],
          [x + 8, y + (TH / 2) * s - 1],
        ])}"/>`;
      }
    } else if (kind === "manor") {
      const h = floors * FLOOR;
      const p = prism(x, y, s, h, style.wall);
      out += p.svg + windows(p, x, y, s, floors, lit) + pyramidRoof(p, 16, style.roof);
      if (hash(seed + "turret") < 0.35) {
        const t = prism(x + 10, y - h + 2, 0.22, 12, style.wall);
        out += t.svg + pyramidRoof(t, 12, style.roof);
      }
    } else {
      const h = floors * 13;
      const p = prism(x, y, s, h, style.wall);
      out += p.svg + windows(p, x, y, s, floors, lit, 13);
      if (kind === "tower") {
        const cap = prism(x, y - h, 0.25, 6, style.roof);
        out += cap.svg;
      } else {
        out += `<ellipse cx="${r1(x)}" cy="${r1(y - h)}" rx="${r1(20 * s)}" ry="${r1(10 * s)}" fill="${style.roof}" stroke="${OUTLINE}" stroke-opacity=".45"/>`;
        out += `<line class="rw-glow" x1="${r1(x - (TW / 2) * s)}" y1="${r1(y - h * 0.5)}" x2="${r1(x)}" y2="${r1(y - h * 0.5 + (TH / 2) * s)}" stroke="${style.trim}" stroke-width="2.5"/>`;
        out += `<line x1="${r1(x)}" y1="${r1(y - h - 4)}" x2="${r1(x)}" y2="${r1(y - h - 18)}" stroke="${OUTLINE}" stroke-width="1.2"/>`;
        out += `<circle cx="${r1(x)}" cy="${r1(y - h - 19)}" r="2.2" fill="${style.trim}"/>`;
      }
    }
    return out + "</g>";
  }

  function tree(x, y, seed, grass) {
    const tall = 12 + hash(seed) * 8 + grass * 2;
    return (
      `<g class="rw-tree"><line x1="${r1(x)}" y1="${r1(y)}" x2="${r1(x)}" y2="${r1(y - tall * 0.5)}" stroke="#8a5a3c" stroke-width="2.4"/>` +
      `<ellipse cx="${r1(x)}" cy="${r1(y - tall * 0.75)}" rx="${r1(7 + hash(seed + "w") * 3)}" ry="${r1(tall * 0.42)}" fill="${hash(seed + "c") < 0.5 ? "#7cbf6a" : "#8fcb74"}" stroke="${OUTLINE}" stroke-opacity=".35"/></g>`
    );
  }

  function penguin(x, y, badge, extra = "") {
    return (
      `<g class="rw-penguin"${extra}><ellipse cx="0" cy="1" rx="4.5" ry="1.6" fill="#2c2340" opacity=".18"/>` +
      `<ellipse cx="0" cy="-6" rx="4.2" ry="6" fill="#343a56"/>` +
      `<ellipse cx="0" cy="-5" rx="2.6" ry="4.2" fill="#fff6e6"/>` +
      `<circle cx="0" cy="-12.5" r="3.4" fill="#343a56"/>` +
      `<path d="M-1.2 -12 L1.8 -11.3 L-1.2 -10.6 Z" fill="#f29a45"/>` +
      `<rect x="-3.6" y="-9.6" width="7.2" height="2" rx="1" fill="${badge}"/></g>`
    ).replace('<g class="rw-penguin"', `<g class="rw-penguin" transform="translate(${r1(x)} ${r1(y)})"`);
  }

  function landmark(id, idx, style, flags, fx) {
    const lot = LOTS[id];
    if (!lot) return null;
    const [x, y] = iso(lot[0], lot[1]);
    let svg = "";
    if (id === "CAMPFIRE") {
      const [cx, cy] = iso(0, 0);
      if (idx < 3) {
        svg =
          `<g class="rw-campfire"><ellipse cx="${cx}" cy="${cy}" rx="14" ry="6" fill="#8a6a4a"/>` +
          `<path d="M${cx - 6} ${cy} Q${cx} ${cy - 24} ${cx + 6} ${cy} Z" fill="#ffb347"/>` +
          `<path d="M${cx - 3} ${cy} Q${cx} ${cy - 14} ${cx + 3} ${cy} Z" fill="#ffe28a"/></g>`;
        fx.push(`<i class="rw-o rw-fx-flame" style="--x:${cx};--y:${cy - 10}"></i>`);
      } else {
        svg =
          `<g class="rw-fountain"><ellipse cx="${cx}" cy="${cy}" rx="22" ry="10" fill="${shade(style.wall, -0.1)}" stroke="${OUTLINE}" stroke-opacity=".4"/>` +
          `<ellipse cx="${cx}" cy="${cy - 2}" rx="17" ry="7" fill="#8fd3ef"/>` +
          `<line x1="${cx}" y1="${cy - 2}" x2="${cx}" y2="${cy - 20}" stroke="#bfe9f7" stroke-width="3" stroke-linecap="round"/></g>`;
      }
      return { depth: 0, svg };
    }
    if (id === "CREATOR_TOTEM") {
      svg =
        idx < 3
          ? `<g><line x1="${x}" y1="${y}" x2="${x}" y2="${y - 34}" stroke="#8a5a36" stroke-width="5"/><circle cx="${x}" cy="${y - 38}" r="7" fill="#343a56"/><circle cx="${x}" cy="${y - 37}" r="4" fill="#fff6e6"/><path d="M${x - 1} ${y - 39} l4 1 -4 1z" fill="#f29a45"/></g>`
          : `<g>${prism(x, y, 0.36, 10, style.wall).svg}<ellipse cx="${x}" cy="${y - 22}" rx="7" ry="10" fill="#343a56"/><ellipse cx="${x}" cy="${y - 20}" rx="4.5" ry="7" fill="#fff6e6"/><circle cx="${x}" cy="${y - 33}" r="5.5" fill="#343a56"/></g>`;
      return { depth: -2, svg };
    }
    if (id === "RIVER_DOCK") {
      svg =
        `<g>${poly([[x - 20, y - 2], [x + 6, y - 15], [x + 16, y - 10], [x - 10, y + 3]], "#b88a5a")}` +
        `<g><path d="M${x + 14} ${y + 10} q12 8 24 0 z" fill="#f4efe4" stroke="${OUTLINE}" stroke-opacity=".5"/><line x1="${x + 26}" y1="${y + 9}" x2="${x + 26}" y2="${y - 8}" stroke="${OUTLINE}"/><path d="M${x + 26} ${y - 8} l10 8 h-10z" fill="#f28c6d"/></g></g>`;
      return { depth: 9.2, svg };
    }
    if (id === "WOODEN_BRIDGE") {
      const color = idx >= 4 ? "#cfc5b2" : "#b98a5a";
      svg = poly([[x - 12, y - 14], [x + 20, y + 2], [x + 12, y + 14], [x - 20, y - 2]], color);
      return { depth: 4.1, svg };
    }
    if (id === "MARKET") {
      for (let k = 0; k < 3; k++) {
        const sx = x - 16 + k * 16,
          sy = y - 4 + k * 4;
        svg += `<rect x="${sx - 6}" y="${sy - 10}" width="12" height="10" fill="${style.wall}" stroke="${OUTLINE}" stroke-opacity=".4"/><path class="rw-awning${flags.shopsOpen > k / 3 ? "" : " is-closed"}" d="M${sx - 8} ${sy - 10} h16 l-2 -6 h-12 z"/>`;
      }
      return { depth: 0.1, svg: `<g>${svg}</g>` };
    }
    if (id === "CLOCK_TOWER") {
      const p = prism(x, y, 0.5, 62, style.wall);
      svg = p.svg + pyramidRoof(p, 22, style.roof) + `<circle cx="${x + 9}" cy="${y - 48}" r="6" fill="#fff8e8" stroke="${OUTLINE}"/><line x1="${x + 9}" y1="${y - 48}" x2="${x + 9}" y2="${y - 52}" stroke="${OUTLINE}" stroke-width="1.4"/>`;
      return { depth: lot[0] + lot[1], svg: `<g>${svg}</g>` };
    }
    if (id === "CITY_WALL") {
      const R = 5.5,
        c = [iso(-R, -R), iso(R, -R), iso(R, R), iso(-R, R)],
        wall = shade(style.wall, -0.08);
      svg = `<polyline points="${pts([...c, c[0]])}" fill="none" stroke="${shade(wall, -0.3)}" stroke-width="7" stroke-linejoin="round" transform="translate(0 3)" opacity=".7"/><polyline points="${pts([...c, c[0]])}" fill="none" stroke="${wall}" stroke-width="5" stroke-dasharray="26 6" stroke-linejoin="round"/>`;
      return { depth: -30, svg, back: true };
    }
    if (id === "CASTLE_KEEP") {
      const p = prism(x, y, 0.8, 54, style.wall);
      svg = p.svg + windows(p, x, y, 0.8, 3, flags.lit, 17) + pyramidRoof(p, 20, style.roof);
      for (const [dx, dy] of [[-22, -8], [22, -8]]) {
        const t = prism(x + dx, y + dy, 0.24, 64, style.wall);
        svg += t.svg + pyramidRoof(t, 14, style.roof);
      }
      svg += `<line x1="${x}" y1="${y - 74}" x2="${x}" y2="${y - 96}" stroke="${OUTLINE}" stroke-width="1.4"/><path d="M${x} ${y - 96} h16 l-4 5 4 5 h-16z" fill="#f28c6d"/>`;
      return { depth: lot[0] + lot[1], svg: `<g>${svg}</g>` };
    }
    if (id === "TV_TOWER") {
      const p = prism(x, y, 0.3, 104, shade(style.wall, -0.05));
      svg = p.svg + `<circle cx="${x}" cy="${y - 104}" r="9" fill="${style.trim}" stroke="${OUTLINE}" stroke-opacity=".5"/><line x1="${x}" y1="${y - 113}" x2="${x}" y2="${y - 138}" stroke="${OUTLINE}" stroke-width="1.5"/><circle cx="${x}" cy="${y - 139}" r="2.6" fill="#ff6b6b"/>`;
      fx.push(`<i class="rw-o rw-fx-beacon" style="--x:${x};--y:${y - 139}"></i>`);
      return { depth: lot[0] + lot[1], svg: `<g>${svg}</g>` };
    }
    if (id === "VIDEO_HALL_DOME") {
      const p = prism(x, y, 0.95, 16, style.wall);
      svg = p.svg + `<path d="M${x - 26} ${y - 16} a26 22 0 0 1 52 0 z" fill="${style.trim}" stroke="${OUTLINE}" stroke-opacity=".5"/><path d="M${x - 4} ${y - 30} l10 6 -10 6z" fill="#fff"/>`;
      return { depth: lot[0] + lot[1], svg: `<g>${svg}</g>` };
    }
    if (id === "MONORAIL") {
      const R = 4.5,
        H = 40,
        c = [iso(-R, -R), iso(R, -R), iso(R, R), iso(-R, R)].map(([a, b]) => [a, b - H]);
      const d = "M" + c.map((p) => r1(p[0]) + " " + r1(p[1])).join(" L") + " Z";
      for (const [a, b] of c) svg += `<line x1="${r1(a)}" y1="${r1(b)}" x2="${r1(a)}" y2="${r1(b + H)}" stroke="${shade(style.road, -0.2)}" stroke-width="3"/>`;
      svg += `<path d="${d}" fill="none" stroke="${shade(style.road, -0.25)}" stroke-width="4" stroke-linejoin="round"/>`;
      fx.push(
        `<i class="rw-o rw-fx-train" style="${c.map((p, k) => `--x${k}:${r1(p[0])};--y${k}:${r1(p[1])}`).join(";")};--x:${r1(c[0][0])};--y:${r1(c[0][1])};--train:${r1(style.trim === "#8fc8e8" ? 0 : 1)}"></i>`,
      );
      return { depth: 40, svg: `<g>${svg}</g>`, front: true };
    }
    if (id === "SKY_GARDEN") {
      let g = "";
      for (let k = 0; k < 3; k++) g += prism(x, y - k * 12, 0.8 - k * 0.2, 10, k % 2 ? "#9fd08a" : style.wall).svg;
      g += tree(x - 6, y - 36, "sg1", 0) + tree(x + 6, y - 34, "sg2", 0);
      return { depth: lot[0] + lot[1], svg: `<g>${g}</g>` };
    }
    if (id === "SPACE_GATE") return null;
    return null;
  }

  function gate(status, style) {
    if (status === "LOCKED") return "";
    const [x, y] = iso(...LOTS.SPACE_GATE);
    const preview = status === "PREVIEW";
    return (
      `<g class="rw-gate ${preview ? "is-preview" : "is-active"}">` +
      prism(x, y, 0.9, 8, shade(style.wall, -0.1)).svg +
      `<ellipse cx="${x}" cy="${y - 70}" rx="42" ry="62" fill="${preview ? "none" : "url(#rw-gate-glow)"}" stroke="${preview ? "#9d8cf0" : "#a192f2"}" stroke-width="${preview ? 3 : 9}"${preview ? ' stroke-dasharray="7 6"' : ""}/>` +
      (preview ? `<text x="${x}" y="${y + 22}" class="rw-gate-label">施工中</text>` : "") +
      "</g>"
    );
  }

  function specialBuilding(name, style, lot, lit, label) {
    const [x, y] = iso(...lot);
    const p = prism(x, y, 0.7, 26, style.wall);
    let svg = p.svg + windows(p, x, y, 0.7, 2, lit) + gableRoof(p, 12, style.roof, style.wall);
    if (name === "HATCHERY") {
      svg = `<ellipse cx="${x}" cy="${y - 14}" rx="18" ry="22" fill="#fff4dc" stroke="${OUTLINE}" stroke-opacity=".5"/><ellipse cx="${x}" cy="${y - 8}" rx="12" ry="8" fill="#ffe2a8" opacity=".8"/><path d="M${x - 14} ${y - 20} l6 5 5 -6 5 6 6 -5" fill="none" stroke="${OUTLINE}" stroke-opacity=".5"/>`;
    }
    if (name === "STAGE") {
      svg = prism(x, y, 0.9, 8, "#6b5b8f").svg + `<line x1="${x - 22}" y1="${y - 40}" x2="${x - 6}" y2="${y - 10}" stroke="#ffe28a" stroke-width="6" opacity=".45"/><line x1="${x + 22}" y1="${y - 40}" x2="${x + 6}" y2="${y - 10}" stroke="#ff9ad5" stroke-width="6" opacity=".45"/>`;
    }
    const sign = `<g class="rw-sign"><rect x="${x - 26}" y="${y - 58}" width="52" height="13" rx="4" fill="#2c2748"/><text x="${x}" y="${y - 48.5}" class="rw-sign-text">${esc(label)}</text></g>`;
    return { depth: lot[0] + lot[1], svg: `<g class="rw-special" data-special="${name}">${svg}${sign}</g>` };
  }

  function layout(state, opts = {}) {
    const idx = eraIndex(state);
    const variant = VARIANTS[idx];
    const visual = state?.visual || {};
    const radius = Math.max(1, Math.min(ISLAND, visual.city_radius || 2));
    const river = idx >= 2;
    const unlocked = new Set((state?.districts || []).filter((d) => d.unlocked).map((d) => d.id));
    const reserved = new Set(Object.values(LOTS).map(([i, j]) => i + "," + j));
    const slots = [];
    for (let ring = 1; ring <= ISLAND; ring++) {
      for (let i = -ring; i <= ring; i++)
        for (let j = -ring; j <= ring; j++) {
          if (Math.max(Math.abs(i), Math.abs(j)) !== ring) continue;
          if (i === 0 || j === 0 || (Math.abs(i) <= 1 && Math.abs(j) <= 1)) continue;
          if (river && j === 4) continue;
          if (reserved.has(i + "," + j)) continue;
          slots.push([i, j, ring]);
        }
    }
    slots.sort((a, b) => a[2] - b[2] || hash("slot" + a[0] + "," + a[1]) - hash("slot" + b[0] + "," + b[1]));
    const inside = slots.filter(([i, j]) => Math.max(Math.abs(i), Math.abs(j)) <= radius);
    const count = Math.min(inside.length, Math.max(0, visual.buildings || 0));
    const built = new Set(inside.slice(0, count + 1).map(([i, j]) => i + "," + j));
    const standing = new Set([...(visual.landmarks || []), ...SPECIALS.filter(([, d]) => unlocked.has(d)).map(([n]) => n)]);
    for (const [name, [i, j]] of Object.entries(LOTS)) if (standing.has(name)) built.add(i + "," + j);
    const crowd = state?.residents || {};
    const cap = opts.mobile ? crowd.render_cap?.mobile ?? 14 : crowd.render_cap?.desktop ?? 28;
    const walkers = Math.max(0, Math.min(cap, crowd.visible || 0));
    const shops = visual.shops_open ?? 1;
    const lit = inside.slice(0, count).filter(([i, j]) => hash("lit" + i + "," + j) < shops).length;
    const cast = (state?.characters || []).slice(0, opts.mobile ? 8 : 16);
    return { idx, variant, radius, river, unlocked, built, slots: inside.slice(0, count), next: inside[count] || null, walkers, lit, cast };
  }

  function render(state, opts = {}) {
    const L = layout(state, opts);
    const style = STYLES[L.variant];
    const visual = state?.visual || {};
    const activity = state?.activity || {};
    const flags = new Set(activity.event_flags || []);
    const grass = visual.grass_level || 0;
    const shops = visual.shops_open ?? 1;
    const back = [],
      items = [],
      front = [],
      overlay = [];
    const out = [];
    out.push(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-440 -330 880 600" class="rw-svg" role="img" aria-label="${esc((state?.current_era_name || "") + " · Lv." + (state?.world_level || 1))}">`,
    );
    out.push(
      `<defs><linearGradient id="rw-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="rw-sky-top"/><stop offset="1" class="rw-sky-bottom"/></linearGradient>` +
        `<radialGradient id="rw-gate-glow"><stop offset="0" stop-color="#e8e2ff" stop-opacity=".95"/><stop offset="1" stop-color="#8f7ff0" stop-opacity=".35"/></radialGradient>` +
        `<radialGradient id="rw-lamp"><stop offset="0" stop-color="#ffe3a3" stop-opacity=".9"/><stop offset="1" stop-color="#ffe3a3" stop-opacity="0"/></radialGradient></defs>`,
    );
    out.push(`<rect x="-440" y="-330" width="880" height="600" fill="url(#rw-sky)"/>`);
    out.push(`<g class="rw-stars">${[...Array(18)].map((_, k) => `<circle cx="${r1(-420 + hash("sx" + k) * 840)}" cy="${r1(-320 + hash("sy" + k) * 200)}" r="${r1(0.6 + hash("sr" + k) * 1.2)}"/>`).join("")}</g>`);
    const fx = [];
    for (let k = 0; k < 4; k++)
      fx.push(
        `<i class="rw-o rw-cloud" style="--x:${r1(-380 + hash("cloud" + k) * 760)};--y:${r1(-290 + hash("cloudy" + k) * 120)};--drift:${r1(18 + hash("cd" + k) * 22)}s"></i>`,
      );
    // Floating island slab: same size and angle in every era.
    const [nx, ny] = iso(-ISLAND - 0.5, -ISLAND - 0.5),
      [ex, ey] = iso(ISLAND + 0.5, -ISLAND - 0.5),
      [sx, sy] = iso(ISLAND + 0.5, ISLAND + 0.5),
      [wx, wy] = iso(-ISLAND - 0.5, ISLAND + 0.5);
    out.push(`<g class="rw-island">`);
    out.push(poly([[wx, wy], [sx, sy], [sx, sy + 34], [sx - 60, sy + 70], [wx + 40, wy + 44]], "#b98b5e"));
    out.push(poly([[sx, sy], [ex, ey], [ex - 30, ey + 40], [sx + 40, sy + 60], [sx, sy + 34]], "#9a6f4a"));
    out.push(poly([[nx, ny], [ex, ey], [sx, sy], [wx, wy]], "#9fd08a"));
    out.push("</g>");
    out.push(`<g class="rw-ground">`);
    for (let i = -ISLAND; i <= ISLAND; i++)
      for (let j = -ISLAND; j <= ISLAND; j++) {
        const inCity = Math.max(Math.abs(i), Math.abs(j)) <= L.radius;
        let fill = hash("g" + i + "," + j) < 0.5 ? "#9fd08a" : "#93c77f";
        let cls = "rw-tile";
        if (L.river && j === 4) {
          fill = "#8fcfe8";
          cls += " rw-water";
        } else if (inCity) {
          // Only lots in use are paved; the rest of the city stays park lawn in every era.
          const plaza = Math.abs(i) <= 1 && Math.abs(j) <= 1;
          const paved = i === 0 || j === 0 || plaza || L.built.has(i + "," + j);
          fill = i === 0 || j === 0 ? style.road : plaza ? shade(style.ground, 0.12) : paved ? style.ground : hash("g" + i + "," + j) < 0.5 ? "#acd997" : "#a3d38d";
          if (i === 0 || j === 0) cls += " rw-road";
        }
        out.push(tile(i, j, fill, cls));
      }
    out.push(`</g>`);
    // Wild edge: trees and grass outside the city; grass grows a little when the city naps.
    for (let i = -ISLAND; i <= ISLAND; i++)
      for (let j = -ISLAND; j <= ISLAND; j++) {
        const ring = Math.max(Math.abs(i), Math.abs(j));
        if (ring <= L.radius || (L.river && j === 4)) continue;
        if (hash("tree" + i + "," + j) < 0.33) {
          const [x, y] = iso(i, j);
          items.push({ depth: i + j, svg: tree(x + (hash("tx" + i + j) - 0.5) * 16, y, "t" + i + "," + j, grass) });
        }
      }
    if (grass > 0) {
      let tufts = "";
      const n = 10 + grass * 14;
      for (let k = 0; k < n; k++) {
        const i = Math.round((hash("gi" + k) - 0.5) * 2 * L.radius),
          j = Math.round((hash("gj" + k) - 0.5) * 2 * L.radius);
        if (i === 0 || j === 0) continue;
        const [x, y] = iso(i, j);
        const h = 3 + grass * 2;
        tufts += `<path d="M${r1(x - 3 + hash("gx" + k) * 20 - 10)} ${r1(y)} l2 -${h} l2 ${h} l2 -${h * 0.8} l2 ${h * 0.8}" />`;
      }
      out.push(`<g class="rw-grass" data-grass="${grass}">${tufts}</g>`);
    }
    // Homes: the first lots nearest the plaza carry the newest style; the outer
    // ring keeps the previous era's houses, so the city reads as grown, not swapped.
    L.slots.forEach(([i, j], k) => {
      const [x, y] = iso(i, j);
      const styleIdx = k < Math.ceil(L.slots.length * 0.6) ? L.idx : Math.max(0, L.idx - 1);
      const st = STYLES[VARIANTS[styleIdx]];
      const maxFloors = Math.max(1, visual.building_height || 1);
      const floors = Math.max(1, Math.round(maxFloors * (0.55 + 0.45 * hash("f" + i + "," + j)) - (k > L.slots.length * 0.6 ? 1 : 0)));
      const lit = hash("lit" + i + "," + j) < shops;
      items.push({ depth: i + j, svg: building(st.kind, st, x, y, floors, i + "," + j, lit, lit) });
    });
    if (L.next && visual.construction && visual.construction !== "COMPLETE") {
      const [x, y] = iso(L.next[0], L.next[1]);
      const mode = String(visual.construction).toLowerCase();
      let site = `<g class="rw-construction is-${mode}">${poly([[x - 20, y], [x, y + 10], [x + 20, y], [x, y - 10]], "#e9d9b5")}`;
      site += `<path d="M${x - 14} ${y} v-24 M${x + 14} ${y} v-24 M${x - 14} ${y - 12} h28 M${x - 14} ${y - 24} h28" stroke="#c98c3a" stroke-width="2" fill="none"/>`;
      if (L.idx >= 3)
        site += `<g class="rw-crane"><line x1="${x + 18}" y1="${y}" x2="${x + 18}" y2="${y - 50}" stroke="#f2b33d" stroke-width="3"/><line x1="${x - 16}" y1="${y - 48}" x2="${x + 34}" y2="${y - 48}" stroke="#f2b33d" stroke-width="3"/><line x1="${x - 10}" y1="${y - 48}" x2="${x - 10}" y2="${y - 30}" stroke="${OUTLINE}"/></g>`;
      if (mode === "paused" || mode === "waiting") site += `<text x="${x}" y="${y + 20}" class="rw-site-label">${mode === "waiting" ? "等待開工" : "暫停施工"}</text>`;
      else fx.push(`<i class="rw-o rw-fx-build is-${mode}" style="--x:${x};--y:${y - 26}"></i>`);
      items.push({ depth: L.next[0] + L.next[1] + 0.01, svg: site + "</g>" });
    }
    for (const id of visual.landmarks || []) {
      const lm = landmark(id, L.idx, style, { lit: activity.lights_level > 40, shopsOpen: shops }, fx);
      if (!lm) continue;
      (lm.back ? back : lm.front ? front : items).push(lm);
    }
    const gateSvg = gate(visual.future_gate || "LOCKED", style);
    if (gateSvg) items.push({ depth: -10, svg: gateSvg });
    for (const [name, district, label] of SPECIALS)
      if (L.unlocked.has(district)) items.push(specialBuilding(name, style, LOTS[name], true, label));
    // Lamps along the roads: torches early, street lights later.
    const lampCount = Math.min(12, 2 + L.radius * 2);
    let lamps = "";
    for (let k = 0; k < lampCount; k++) {
      const t = ((k % (L.radius * 2)) - L.radius + 0.5) | 0;
      const [x, y] = k % 2 ? iso(t, 0) : iso(0, t);
      const lx = x + (k % 2 ? 0 : 14),
        ly = y + (k % 2 ? 10 : 0);
      lamps += `<g class="rw-lamp"><circle class="rw-lamp-glow" cx="${r1(lx)}" cy="${r1(ly - 16)}" r="12" fill="url(#rw-lamp)"/><line x1="${r1(lx)}" y1="${r1(ly)}" x2="${r1(lx)}" y2="${r1(ly - 14)}" stroke="${L.idx < 3 ? "#8a5a36" : OUTLINE}" stroke-width="1.6"/><circle cx="${r1(lx)}" cy="${r1(ly - 16)}" r="2.4" class="rw-lamp-bulb"/></g>`;
    }
    front.push({ depth: 0, svg: `<g class="rw-lamps" data-lights="${activity.lights_level ?? 0}">${lamps}</g>` });
    // Plaza poster shows the newest featured title; it glows when the city wakes.
    const poster = (state?.featured_contents || [])[0];
    if (poster && L.idx >= 0 && (state?.content?.total || 0) > 0) {
      const [x, y] = iso(...LOTS.POSTER);
      const title = String(poster.title || "").slice(0, 9);
      const hot = flags.has("NEW_POSTER") || flags.has("FEATURED_POSTER");
      items.push({
        depth: 2.05,
        svg: `<g class="rw-poster${hot ? " is-hot" : ""}"><line x1="${x - 16}" y1="${y}" x2="${x - 16}" y2="${y - 30}" stroke="${OUTLINE}" stroke-width="1.5"/><line x1="${x + 16}" y1="${y + 2}" x2="${x + 16}" y2="${y - 28}" stroke="${OUTLINE}" stroke-width="1.5"/><rect x="${x - 22}" y="${y - 52}" width="44" height="26" rx="3" fill="#fff8ea" stroke="${OUTLINE}" stroke-opacity=".6"/><text x="${x}" y="${y - 41}" class="rw-poster-kicker">${poster.is_new ? "NEW" : "精選"}</text><text x="${x}" y="${y - 31}" class="rw-poster-title">${esc(title)}</text></g>`,
      });
    }
    if (flags.has("FESTIVAL_BANNERS")) {
      const a = iso(-1.5, -1.5),
        b = iso(1.5, -1.5),
        c = iso(1.5, 1.5);
      const flagsSvg = [a, b, c]
        .slice(0, 2)
        .map(([x0, y0], k) => {
          const [x1, y1] = [b, c][k];
          let tri = "";
          for (let n = 1; n < 8; n++) {
            const x = x0 + ((x1 - x0) * n) / 8,
              y = y0 - 34 + ((y1 - y0) * n) / 8 + Math.sin((n / 8) * Math.PI) * 8;
            tri += `<path d="M${r1(x - 3)} ${r1(y)} h6 l-3 6z" fill="${["#ff7fa8", "#ffd35e", "#7fd6c2", "#9db8f2"][n % 4]}"/>`;
          }
          return `<path d="M${r1(x0)} ${r1(y0 - 34)} Q${r1((x0 + x1) / 2)} ${r1((y0 + y1) / 2 - 26)} ${r1(x1)} ${r1(y1 - 34)}" fill="none" stroke="${OUTLINE}" stroke-opacity=".5"/>${tri}`;
        })
        .join("");
      front.push({ depth: 1, svg: `<g class="rw-bunting">${flagsSvg}</g>` });
    }
    // Residents: generic penguin civilians walking the roads, badge colour = profession.
    // They live in the overlay, so walking never repaints the city.
    const archetypes = (state?.residents?.archetypes || []).length ? state.residents.archetypes : [{ profession: "VILLAGER" }];
    for (let k = 0; k < L.walkers; k++) {
      const along = k % 2 === 0;
      const start = Math.round((hash("w0" + k) * 2 - 1) * L.radius);
      const span = 1 + Math.floor(hash("w1" + k) * 3);
      const end = Math.max(-L.radius, Math.min(L.radius, start + (hash("w2" + k) < 0.5 ? span : -span)));
      const lane = (hash("lane" + k) - 0.5) * 0.5;
      const A = along ? iso(start, lane) : iso(lane, start);
      const B = along ? iso(end, lane) : iso(lane, end);
      const role = archetypes[k % archetypes.length];
      const badge = BADGES[role.profession] || "#a9d27d";
      const vars = `--ax:${r1(A[0])};--ay:${r1(A[1])};--bx:${r1(B[0])};--by:${r1(B[1])};--dur:${r1(6 + hash("wd" + k) * 8)}s;--delay:-${r1(hash("wl" + k) * 8)}s`;
      overlay.push(
        `<div class="rw-walker" style="${vars}" data-profession="${esc(role.profession)}"><div class="rw-bob"><svg class="rw-sprite" viewBox="-6 -17 12 19" aria-hidden="true">${penguin(0, 0, badge)}</svg></div></div>`,
      );
    }
    // Characters from the registry: the authority's own image as a small standee,
    // each on its own spot around the district anchor so nobody stands on anybody.
    const spots = {};
    const cast = L.cast.map((c) => {
      const anchor = DISTRICT_ANCHORS[c.district] || [0, 0];
      const n = (spots[c.district] = (spots[c.district] || 0) + 1) - 1;
      const [di, dj] = SPOTS[n % SPOTS.length];
      const [x, y] = iso(anchor[0] + di, anchor[1] + dj);
      const pose = String(c.state || "IDLE").toLowerCase();
      const body =
        c.render_mode === "IMAGE"
          ? `<img src="/api/world/character-thumb/${encodeURIComponent(c.character_id)}?s=96" alt="${esc(c.display_name)}" loading="lazy" decoding="async" draggable="false">`
          : `<svg class="rw-sprite rw-token-sprite" viewBox="-6 -17 12 19" aria-hidden="true">${penguin(0, 0, "#ffd35e")}</svg><b class="rw-token-tag">鵝寶</b>`;
      return `<div class="rw-o rw-actor is-${esc(pose)}" style="--x:${r1(x)};--y:${r1(y)}" data-character="${esc(c.character_id)}" title="${esc(c.display_name)}"><div class="rw-standee">${body}</div></div>`;
    });
    overlay.push(...cast);
    // District labels float over their anchors; locked districts stay unlabelled.
    let labels = "";
    for (const d of state?.districts || []) {
      if (d.status === "LOCKED") continue;
      const anchor = DISTRICT_ANCHORS[d.id];
      if (!anchor || d.id === "MAIN_CITY") continue;
      const [x, y] = iso(...anchor);
      const w = Math.max(44, String(d.name).length * 11 + 14);
      labels += `<g class="rw-district-label${d.status === "PREVIEW" ? " is-preview" : ""}"><rect x="${r1(x - w / 2)}" y="${r1(y + 12)}" width="${r1(w)}" height="16" rx="8"/><text x="${r1(x)}" y="${r1(y + 23.5)}">${esc(d.name)}</text></g>`;
    }
    const sorted = items.sort((a, b) => a.depth - b.depth);
    out.push(`<g class="rw-back">${back.map((x) => x.svg).join("")}</g>`);
    out.push(`<g class="rw-city">${sorted.map((x) => x.svg).join("")}</g>`);
    out.push(`<rect class="rw-shade" x="-440" y="-330" width="880" height="600"/>`);
    out.push(`<g class="rw-front">${front.map((x) => x.svg).join("")}</g>`);
    out.push(`<g class="rw-labels">${labels}</g>`);
    out.push(`</svg>`);
    if (flags.has("FIREWORKS") || flags.has("SMALL_FIREWORKS")) {
      const n = flags.has("FIREWORKS") ? 5 : 3;
      for (let k = 0; k < n; k++) {
        const color = ["#ffd35e", "#ff7fa8", "#7fd6c2", "#9db8f2", "#ffb347"][k % 5];
        fx.push(
          `<i class="rw-o rw-firework" style="--x:${r1(-300 + hash("fw" + k) * 600)};--y:${r1(-280 + hash("fwy" + k) * 90)};--c:${color};--delay:${r1(k * 0.7)}s"></i>`,
        );
      }
    }
    return {
      svg: out.join(""),
      overlay: fx.join("") + overlay.join(""),
      stats: {
        variant: L.variant,
        radius: L.radius,
        buildings: L.slots.length,
        lit_buildings: L.lit,
        walkers: L.walkers,
        characters: cast.length,
        landmarks: (visual.landmarks || []).length,
        construction: L.next ? visual.construction : "NO_LOT",
        effects: fx.length,
      },
    };
  }

  const api = { render, layout, hash, esc, VARIANTS, STYLES };
  root.RenguinWorldScene = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
