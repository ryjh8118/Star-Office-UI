// Renguin World seamless side-view slice: who stands where, what the art draws, and the camera math.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Art = require("../frontend/world/seamless-art.js");
const Cam = require("../frontend/world/world-camera.js");
const Compose = require("../frontend/world/world-composition.js");

const read = (...parts) => fs.readFileSync(path.join(__dirname, "..", ...parts), "utf8");
const person = (id, over = {}) => ({ character_id: id, display_name: id, render_mode: "IMAGE", resolution: "CANONICAL_CHARACTER", character_type: "SPECIAL_GUEST", district: "MAIN_CITY", state: "IDLE", source_authority: "ASSET-01", ...over });

function state(variant = "riverside", over = {}) {
  return {
    visual: { era_variant: variant, buildings: 12, building_height: 1, landmarks: ["CAMPFIRE", "CREATOR_TOTEM", "RIVER_DOCK", "WOODEN_BRIDGE"], construction: "ACTIVE", roads: "dirt", shops_open: 1 },
    activity: { lights_level: 88, event_flags: [] },
    featured_contents: [{ title: "新片", is_new: true }],
    content: { total: 20 },
    characters: [
      person("RENGUIN", { character_type: "MAIN_CHARACTER", district: "CREATOR_DISTRICT" }),
      person("DOLA", { character_type: "SUPPORTING_CHARACTER", district: "CREATOR_DISTRICT" }),
      person("XUEBAO", { character_type: "SUPPORTING_CHARACTER", district: "CREATOR_DISTRICT" }),
      person("ERIC", { character_type: "SUPPORTING_CHARACTER", district: "CREATOR_DISTRICT" }),
      person("DODO", { character_type: "SUPPORTING_CHARACTER" }),
      person("GUEST_A"),
      person("GUEST_B"),
      person("GUEST_C"),
      person("KING_PENGUIN", { character_type: "GOOSEBABY", source_authority: "ASSET-08", world_role: "會員區城主" }),
      person("MEMBER_AVATAR_AAA", { character_type: "GOOSEBABY", resolution: "PROFESSION_CHARACTER", world_role: "護理師居民", source_authority: "ASSET-08" }),
      person("MEMBER_AVATAR_BBB", { character_type: "GOOSEBABY", resolution: "PROFESSION_CHARACTER", world_role: "飯店客服居民", source_authority: "ASSET-08" }),
      person("NO_ART", { render_mode: "TOKEN", resolution: "NEUTRAL_PLACEHOLDER" }),
      person("OFFICE_ONLY", { resolution: "UNRESOLVED" }),
    ],
    ...over,
  };
}

test("the slice shows 5 to 10 authority residents: crew on the island, profession residents first on the street", () => {
  const cast = Art.cast(state());
  const all = [...cast.island, ...cast.city];
  assert.ok(all.length >= 5 && all.length <= 10, `${all.length} residents`);
  assert.equal(cast.island[0].character_id, "RENGUIN", "Renguin stands at the Star Office");
  assert.ok(cast.island.length <= 3 && cast.island.every((c) => c.district === "CREATOR_DISTRICT"));
  assert.deepEqual(cast.city.slice(0, 2).map((c) => c.character_id), ["MEMBER_AVATAR_AAA", "MEMBER_AVATAR_BBB"]);
  assert.ok(all.every((c) => c.render_mode === "IMAGE" && ["CANONICAL_CHARACTER", "PROFESSION_CHARACTER"].includes(c.resolution)), "only authority images, never a placeholder or an unresolved image");
  assert.ok(!all.some((c) => c.character_id === "NO_ART" || c.character_id === "OFFICE_ONLY"));
  assert.equal(new Set(all.map((c) => c.character_id)).size, all.length, "no character appears twice");
  const spots = cast.city.map((c) => c.spot);
  assert.equal(new Set(spots).size, spots.length, "every street resident has its own spot");
  for (const [a, b] of spots.slice().sort((x, y) => x - y).map((v, i, list) => [v, list[i + 1]]).slice(0, -1)) assert.ok(b - a >= 180, "street spots keep residents apart");
  assert.equal(Art.cast(state("riverside", { characters: [] })).city.length, 0);
});

test("labels come from the authority: profession residents by profession, never by member name", () => {
  const nurse = person("MEMBER_AVATAR_AAA", { character_type: "GOOSEBABY", resolution: "PROFESSION_CHARACTER", world_role: "護理師居民", display_name: "護理師鵝寶", source_authority: "ASSET-08" });
  assert.equal(Art.nameOf(nurse), "護理師居民");
  assert.equal(Art.roleOf(nurse), "鵝寶居民 · 正式職業角色");
  assert.equal(Art.sourceOf(nurse), "會員角色庫");
  assert.equal(Art.roleOf(person("KING_PENGUIN", { character_type: "GOOSEBABY", world_role: "會員區城主" })), "鵝寶 · 會員區城主");
  assert.equal(Art.roleOf(person("RENGUIN", { character_type: "MAIN_CHARACTER" })), "主角");
});

test("the art never draws a character, reuses one paper kit and carries the era", () => {
  const defs = Art.defs();
  for (const id of ["sw-cloud-a", "sw-tree", "sw-lamp", "sw-cobble"]) assert.ok(defs.includes(`id="${id}"`), id);
  const scene = Art.scene(state());
  const painted = scene.sections.flatMap((s) => s.layers.map((l) => l.svg || "")).join("");
  assert.ok(!/<image|<img|character-thumb|MEMBER_AVATAR/.test(painted), "residents are placed by the page, not painted into the scenery");
  assert.ok(!/fill="#526473"/.test(painted), "no generic penguin sprite");
  const island = scene.sections[0].layers;
  assert.ok(island.find((l) => l.name === "buildings").svg.includes("STAR OFFICE"));
  const riverside = Art.city(state());
  assert.ok(riverside.stats.river && !riverside.stats.fountain && !riverside.stats.market);
  const town = Art.city(state("town", { visual: { ...state().visual, era_variant: "town", landmarks: ["MARKET", "CLOCK_TOWER"], roads: "cobble", building_height: 2 } }));
  assert.ok(town.stats.fountain && town.stats.market);
  assert.ok(town.layers.buildings.includes('data-kind="house"'));
  assert.ok(riverside.layers.buildings.includes('data-kind="cabin"'));
});

test("B. layer architecture: Renguin City is a stack of independent layers, never one flat street picture", () => {
  const scene = Art.scene(state("riverside", { activity: { lights_level: 88, event_flags: ["FIREWORKS"] } }));
  const city = scene.sections.find((s) => s.zone === "city");
  const names = city.layers.map((l) => l.name);
  for (const required of ["sky", "distant", "buildings", "street", "residents", "foreground", "effects"]) assert.ok(names.includes(required), required);
  assert.equal(new Set(names).size, names.length, "each layer has one name");
  const z = Object.fromEntries(city.layers.map((l) => [l.name, l.z]));
  assert.ok(z.sky < z.distant && z.distant < z.backdrop && z.backdrop < z.buildings && z.buildings < z.street, "back to front");
  assert.ok(z.street < z.foreground && z.foreground < z.residents && z.residents < z.effects, "the foreground never covers residents");
  assert.equal(new Set(Object.values(z)).size, names.length, "no two layers share a z order");
  assert.ok(Object.values(z).every((v) => v % 10 === 0), "z steps of ten leave room for future layers");
  for (const l of city.layers) {
    assert.ok(["svg", "dom"].includes(l.kind) && ["section", "street"].includes(l.host) && l.depth > 0, l.name);
    if (l.kind === "svg") assert.ok(/^<svg class="sw-art sw-city-/.test(l.svg), `${l.name} is its own drawing`);
  }
  assert.ok(["sky", "distant"].every((n) => city.layers.find((l) => l.name === n).host === "section"), "far layers live outside the street so they may rise into the clouds");
  assert.ok(["buildings", "street", "residents"].every((n) => city.layers.find((l) => l.name === n).depth === 1), "the playfield does not drift");
  const buildings = city.layers.find((l) => l.name === "buildings").svg;
  const street = city.layers.find((l) => l.name === "street").svg;
  assert.ok(buildings.includes("sw-house") && !buildings.includes('fill="#dcc7a0"'), "buildings carry no road");
  assert.ok(!street.includes("sw-house"), "the street carries no building");
  assert.ok(city.effects.some((e) => e.kind === "firework") && city.effects.some((e) => e.kind === "flame"), "effects are descriptors for their own layer");
  for (const fx of city.effects.filter((e) => e.kind === "flame")) for (const r of Art.GEOMETRY.city.spots) assert.ok(Math.abs(r - fx.x) >= 90, "a scene effect never stands on a resident spot");
  const [px, , pw] = Art.GEOMETRY.city.poster;
  for (const r of Art.GEOMETRY.city.spots) assert.ok(r + 70 < px - 34 || r - 70 > px + pw + 34, "no resident stands in front of the poster board, so it stays clickable");
  for (const s of scene.sections) {
    const zs = s.layers.map((l) => l.z);
    assert.deepEqual(zs, [...zs].sort((a, b) => a - b), `${s.zone} stack is ordered`);
    assert.ok(s.layers.some((l) => l.name === "effects"), `${s.zone} has an effects layer`);
    assert.ok(!zs.includes(scene.cable_z), "the cable has its own place in the stack");
  }
  const descent = scene.sections.find((s) => s.zone === "descent").layers;
  assert.ok(descent.find((l) => l.name === "clouds-near").z > scene.cable_z && descent.find((l) => l.name === "cloud-sea").z < scene.cable_z, "the cable passes between cloud layers");
  assert.ok(z.buildings < scene.cable_z && scene.cable_z < z.residents, "the gondola docks above the station, below residents");
});

test("growth is visible on the street: more buildings, a construction site, the newest poster", () => {
  const few = Art.city(state("riverside", { visual: { ...state().visual, buildings: 2 } })).stats;
  const many = Art.city(state("riverside", { visual: { ...state().visual, buildings: 12 } })).stats;
  assert.ok(many.front_houses + many.back_houses > few.front_houses + few.back_houses);
  assert.ok(Art.city(state()).layers.buildings.includes("sw-construction"));
  assert.ok(!Art.city(state("riverside", { visual: { ...state().visual, construction: "COMPLETE" } })).layers.buildings.includes("sw-construction"));
  const empty = Art.city(state("camp", { featured_contents: [], content: { total: 0 }, visual: { ...state().visual, era_variant: "camp", buildings: 0 } }));
  assert.equal(empty.stats.poster, false);
  assert.equal(empty.stats.front_houses, 0);
});

const VIEWPORTS = [
  ["desktop wide", 1920, 1080], ["desktop ultrawide", 2560, 1080], ["laptop", 1440, 900], ["laptop short", 1366, 768], ["laptop 720p", 1280, 720],
  ["tablet landscape", 1024, 768], ["tablet portrait", 768, 1024], ["phone portrait", 390, 844], ["small phone", 360, 640],
  ["phone landscape", 844, 390], ["small phone landscape", 667, 375],
];

test("A. composition rule: the island and the city keep their subject in the safe area at every viewport ratio", () => {
  const { RULE } = Compose;
  for (const [label, width, height] of VIEWPORTS) {
    const c = Compose.compose({ width, height });
    const f = Compose.framing(c, height);
    const safe = [c.safe.top, height - c.safe.bottom];
    assert.ok(f.island[0] >= safe[0] - 1 && f.island[1] <= safe[1] + 1, `${label}: island band ${f.island} inside ${safe}`);
    assert.ok(f.city[0] >= safe[0] - 1 && f.city[1] <= safe[1] + 1, `${label}: city band ${f.city} inside ${safe}`);
    assert.ok(c.resident_px >= RULE.residents.readable_px && c.resident_px <= 190, `${label}: residents ${c.resident_px}px`);
    const squeeze = c.island.squeeze(Art.GEOMETRY.island.spots);
    for (const spot of Art.GEOMETRY.island.spots) {
      const x = width / 2 + spot * squeeze * c.ws;
      assert.ok(x - 60 * c.ws >= 0 && x + 60 * c.ws <= width, `${label}: island resident at ${Math.round(x)} stays on screen`);
    }
    assert.ok(c.city.visible_width >= 480, `${label}: at least a stretch of street is visible`);
    // The balance holds: residents never dwarf the island band, nor vanish in it.
    const ratio = (RULE.residents.height * c.ws) / (f.island[1] - f.island[0]);
    assert.ok(ratio > 0.25 && ratio < 0.4, `${label}: resident to island ratio ${ratio.toFixed(2)}`);
  }
  assert.equal(Compose.compose({ width: 390, height: 844 }).compact, true, "portrait phone");
  assert.equal(Compose.compose({ width: 844, height: 390 }).compact, false, "landscape phone keeps side controls");
  const zoomed = Compose.compose({ width: 1440, height: 900, zoom: 1.5 });
  assert.equal(zoomed.ws, 1.5, "zoom is an enlargement on top of the rule");
});

test("camera math: anchored parallax is still at rest, bounded pans never leave the content", () => {
  assert.equal(Cam.anchorOffset("top", 0, 1000, 0, 900), 0);
  assert.equal(Cam.anchorOffset("bottom", 2500, 1080, 2680, 900), 0);
  assert.equal(Cam.parallax(0, 0.4), 0);
  assert.ok(Cam.parallax(100, 0.4) < 0 && Cam.parallax(100, 1.2) > 0, "far layers lag, near layers lead");
  assert.equal(Cam.parallax(250, 1), 0);
  assert.equal(Cam.bound(-50, 2800, 1440), 0);
  assert.equal(Cam.bound(9000, 2800, 1440), 1360);
  assert.equal(Cam.bound(10, 1000, 1440), -220, "smaller content is centred");
  assert.equal(Cam.clamp(5, 0, 3), 3);
  assert.equal(Cam.ease(0), 0);
  assert.equal(Cam.ease(1), 1);
});

test("the slice is its own page: V1 keeps its route, bundle and budget", () => {
  const routes = read("backend/renguin_world/routes.py");
  assert.ok(routes.includes("@bp.get('/world')") && routes.includes("@bp.get('/world/seamless')"));
  const shell = read("frontend/world/seamless.html");
  for (const f of ["world-scene.js", "world-camera.js", "world-composition.js", "seamless-art.js", "seamless-app.js", "seamless.css"]) assert.ok(shell.includes(`/static/world/${f}?v={{WORLD_VERSION}}`), f);
  assert.ok(shell.includes('href="/world"'), "V1 stays one click away for comparison");
  const v1 = read("frontend/world/index.html");
  assert.ok(!/seamless/.test(v1), "V1 does not load the slice");
  const app = read("frontend/world/seamless-app.js");
  assert.ok(!/setInterval|setTimeout\(/.test(app), "no timers: motion is CSS, work is per scroll frame");
  assert.ok(/listen\(window, "pagehide", stop\)/.test(app) && /visibilitychange/.test(app) && /observer\?\.disconnect\(\)/.test(app));
  assert.ok(/textContent|node\("span", Art\.nameOf/.test(app) && !/innerHTML = .*nameOf/.test(app), "names enter the DOM as text");
  const css = read("frontend/world/seamless.css");
  for (const block of css.match(/@keyframes[^{]+\{[\s\S]*?\n\}/g)) assert.ok(!/\b(left|top|width|height|margin|filter)\s*:/.test(block), "keyframes animate transform/opacity only: " + block.split("{")[0]);
  assert.ok(/prefers-reduced-motion: reduce[\s\S]*animation: none !important/.test(css));
  assert.ok(/\.sw-street \{[^}]*overflow: clip/.test(css), "parallax layers cannot widen the street scroll");
});

test("C. seamless navigation: one page, one continuous sky, every jump is a scroll", () => {
  const css = read("frontend/world/seamless.css");
  const gradient = (cls) => css.match(new RegExp(`\\.${cls} \\{[^}]*?background: linear-gradient\\(([^;]+)\\);`))[1].split(/,(?![^(]*\))/).map((x) => x.trim().split(" ")[0]);
  const island = gradient("sw-island"),
    descent = gradient("sw-descent"),
    city = gradient("sw-city");
  assert.equal(island.at(-1), descent[0], "island ends on the colour the descent starts with");
  assert.equal(descent.at(-1), city[0], "descent ends on the colour the city starts with");
  const app = read("frontend/world/seamless-app.js");
  const goTo = app.slice(app.indexOf("function goTo("), app.indexOf("function setLayer("));
  assert.ok(/Cam\.scrollTo\(window/.test(goTo) && !/location|history|href|navigate/.test(goTo), "altitude jumps scroll the same page");
  assert.ok(!/location\.(assign|replace|href\s*=)|history\.(push|replace)State|window\.open/.test(app), "exploring never changes the page or the route");
  const shell = read("frontend/world/seamless.html");
  assert.ok(!/<a[^>]+href="#/.test(shell) && /<button type="button" data-zone="island">/.test(shell), "the altimeter is buttons, not links");
  const scene = Art.scene(state());
  assert.deepEqual(scene.sections.map((s) => s.zone), ["island", "descent", "city"], "one vertical world, top to bottom");
  assert.ok(/\.sw-world \{[^}]*overflow: clip/.test(css) && !/\.sw-section \{[^}]*(transform|opacity|filter|z-index)/.test(css), "sections stack without their own stacking context, so the cable crosses them");
});

