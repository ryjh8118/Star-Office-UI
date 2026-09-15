// Renguin World seamless side-view slice: who stands where, what the art draws, and the camera math.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Art = require("../frontend/world/seamless-art.js");
const Cam = require("../frontend/world/world-camera.js");
const Compose = require("../frontend/world/world-composition.js");

const Districts = require("../frontend/world/seamless-districts.js");
const Buildings = require("../frontend/world/seamless-buildings.js");

const read = (...parts) => fs.readFileSync(path.join(__dirname, "..", ...parts), "utf8");
const DISTRICT_NAMES = { MAIN_CITY: "主城區", CREATOR_DISTRICT: "創作者街區", TRAVEL_DISTRICT: "旅行港區", VIDEO_HALL: "影片大廳", MEMBER_DISTRICT: "鵝寶會員區", ENTERTAINMENT_DISTRICT: "娛樂夜市區", FUTURE_GATE: "星港之門" };
// District rows shaped like engine.districts(): pass one status for all, or a map of id -> status.
const districtRows = (status = "UNLOCKED") =>
  Object.entries(DISTRICT_NAMES).map(([id, name]) => {
    const s = id === "MAIN_CITY" ? "UNLOCKED" : typeof status === "string" ? status : status[id] || "LOCKED";
    return { id, name, status: s, unlocked: s === "UNLOCKED", crowd_density: s === "UNLOCKED" ? "BUSY" : "EMPTY", content_count: 6, recent_count: 2, active_hotspots: s === "UNLOCKED" ? ["STUDIO", "HARBOR", "PREMIERE", "STAGE"] : [], unlock_hint: s === "UNLOCKED" ? null : "進入「繁榮城鎮」解鎖", summary: name };
  });
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
  const scene = Art.scene(state("riverside", { districts: districtRows("UNLOCKED") }));
  const painted = scene.sections.flatMap((s) => s.layers.flatMap((l) => [l.svg || "", ...(l.chunks || []).map((c) => c.svg)])).join("");
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
    if (l.kind === "svg" && l.host === "section") assert.ok(/^<svg class="sw-art sw-city-/.test(l.svg), `${l.name} is its own drawing`);
    // Street layers are painted per district: each chunk is its own drawing of that one layer.
    if (l.kind === "svg" && l.host === "street") assert.ok(l.chunks.length && l.chunks.every((c) => c.svg.startsWith(`<svg class="sw-art sw-city-${l.name}"`)), `${l.name} chunks are drawings of that layer`);
  }
  assert.ok(["sky", "distant"].every((n) => city.layers.find((l) => l.name === n).host === "section"), "far layers live outside the street so they may rise into the clouds");
  assert.ok(["buildings", "street", "residents"].every((n) => city.layers.find((l) => l.name === n).depth === 1), "the playfield does not drift");
  const buildings = city.layers.find((l) => l.name === "buildings").chunks[0].svg;
  const street = city.layers.find((l) => l.name === "street").chunks[0].svg;
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
  // Sections create no stacking context, so text the page lays over the world shares the cable's stack.
  const css = read("frontend/world/seamless.css");
  const hintZ = Math.max(...[...css.matchAll(/\.sw-swipe-hint \{[^}]*?z-index: (\d+)/g)].map((m) => +m[1]));
  const top = Math.max(scene.cable_z, ...scene.sections.flatMap((s) => s.layers.map((l) => l.z)));
  assert.ok(hintZ > top, `the swipe hint (z ${hintZ}) is painted above the cable and every world layer (z ${top})`);
});

test("growth is visible on the street: more buildings, a construction site, the newest poster", () => {
  const few = Art.city(state("riverside", { visual: { ...state().visual, buildings: 2 } })).stats;
  const many = Art.city(state("riverside", { visual: { ...state().visual, buildings: 12 } })).stats;
  assert.ok(many.front_houses + many.back_houses > few.front_houses + few.back_houses);
  assert.ok(Art.city(state()).layers.buildings.includes("sw-construction"));
  assert.ok(!Art.city(state("riverside", { visual: { ...state().visual, construction: "COMPLETE" } })).layers.buildings.includes("sw-construction"));
  const empty = Art.city(state("camp", { featured_contents: [], content: { total: 0 }, visual: { ...state().visual, era_variant: "camp", buildings: 0 } }));
  assert.equal(empty.stats.poster, false);
  const tufts = (s) => (Art.city(s).layers.foreground.match(/sw-tuft/g) || []).length;
  assert.ok(tufts(state("riverside", { visual: { ...state().visual, grass_level: 3 } })) > tufts(state()), "a dormant city grows tall grass, as in V1");
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
  for (const f of ["world-scene.js", "world-camera.js", "world-composition.js", "seamless-art.js", "seamless-buildings.js", "seamless-districts.js", "seamless-app.js", "seamless.css"]) assert.ok(shell.includes(`/static/world/${f}?v={{WORLD_VERSION}}`), f);
  assert.ok(shell.indexOf("seamless-art.js") < shell.indexOf("seamless-buildings.js") && shell.indexOf("seamless-buildings.js") < shell.indexOf("seamless-districts.js") && shell.indexOf("seamless-districts.js") < shell.indexOf("seamless-app.js"), "the building kit and districts load after the art kit and before the page");
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


test("districts: the street grows outward in unlock order; closed districts are short lots that say what opens them", () => {
  const young = Districts.layout(state("riverside", { districts: districtRows({ CREATOR_DISTRICT: "UNLOCKED", TRAVEL_DISTRICT: "UNLOCKED", FUTURE_GATE: "PREVIEW" }) }));
  assert.deepEqual(young.districts.map((d) => d.id), Districts.ORDER, "every registry district is on the street, in unlock order");
  let x = 0;
  for (const d of young.districts) {
    assert.equal(d.x, x, `${d.id} starts where the previous district ends`);
    x += d.width;
    assert.equal(d.width, d.status === "UNLOCKED" ? Districts.OPEN_WIDTH[d.id] : Districts.CLOSED_WIDTH);
    if (d.status !== "UNLOCKED") assert.equal(d.spots.length, 0, "nobody stands in a closed lot");
  }
  assert.equal(young.width, x);
  const old = Districts.layout(state("starport", { districts: districtRows("UNLOCKED") }));
  assert.ok(old.width > young.width, "an older city has a longer street");
  // Without district rows (older states, fixtures) the street is exactly the main street.
  assert.deepEqual(Districts.layout(state()).districts.map((d) => [d.id, d.width]), [["MAIN_CITY", 2800]]);
  // A district the registry adds later still gets a stretch of street with its name.
  const extra = state("riverside", { districts: [...districtRows("UNLOCKED"), { id: "SPORTS_DISTRICT", name: "運動街區", status: "UNLOCKED", crowd_density: "NORMAL" }] });
  const sports = Districts.paint(extra).find((d) => d.id === "SPORTS_DISTRICT");
  assert.ok(sports && sports.layers.buildings.includes("運動街區") && sports.stats.kind === "generic");
  const lots = Districts.paint(state("riverside", { districts: districtRows({ VIDEO_HALL: "PREVIEW" }) }));
  const hall = lots.find((d) => d.id === "VIDEO_HALL");
  assert.ok(hall.stats.kind === "lot" && hall.layers.buildings.includes("施工預告") && hall.layers.buildings.includes("進入「繁榮城鎮」解鎖"));
  assert.ok(lots.find((d) => d.id === "MEMBER_DISTRICT").layers.buildings.includes("未解鎖"));
});

test("districts carry their own data: boats per trip, posters from featured contents, member population as a count only", () => {
  const rows = districtRows("UNLOCKED");
  rows.find((d) => d.id === "TRAVEL_DISTRICT").content_count = 4;
  const painted = Districts.paint(state("town", { districts: rows, visual: { ...state().visual, era_variant: "town", landmarks: ["VIDEO_HALL_DOME"] }, featured_contents: [{ title: "a", is_new: true }, { title: "b" }], goosebaby: { population: { total: 148, by_tier: { BRONZE: 138, SILVER: 5, GOLD: 4, PLATINUM: 1 } } } }));
  const by = Object.fromEntries(painted.map((d) => [d.id, d]));
  assert.equal(by.TRAVEL_DISTRICT.stats.boats, 4);
  assert.equal((by.TRAVEL_DISTRICT.layers.street.match(/class="sw-boat"/g) || []).length, 4);
  assert.equal(by.TRAVEL_DISTRICT.stats.bridge, "stone", "the town era builds a stone bridge");
  assert.equal(by.VIDEO_HALL.stats.posters, 2);
  assert.ok(by.VIDEO_HALL.stats.dome);
  assert.deepEqual(by.MEMBER_DISTRICT.stats.tiers, [138, 5, 4, 1]);
  const text = painted.map((d) => Object.values(d.layers).join("")).join("");
  assert.ok(!/<image|<img|character-thumb|MEMBER_AVATAR/.test(text), "no district paints a character");
  for (const d of painted) for (const layer of ["backdrop", "buildings", "street", "foreground"]) assert.ok(d.layers[layer].startsWith(`<svg class="sw-art sw-city-${layer}" viewBox="${d.x} 0 ${d.width} 1080"`), `${d.id}.${layer} is drawn in its own stretch`);
});

test("residents stand in their own open district, never in a closed one, never on a hotspot", () => {
  const people = [
    person("RENGUIN", { character_type: "MAIN_CHARACTER", district: "CREATOR_DISTRICT" }),
    person("DOLA", { character_type: "SUPPORTING_CHARACTER", district: "CREATOR_DISTRICT" }),
    person("XUEBAO", { character_type: "SUPPORTING_CHARACTER", district: "CREATOR_DISTRICT" }),
    person("ERIC", { character_type: "SUPPORTING_CHARACTER", district: "CREATOR_DISTRICT" }),
    person("GUO", { district: "TRAVEL_DISTRICT" }),
    person("HOTEL", { character_type: "GOOSEBABY", resolution: "PROFESSION_CHARACTER", world_role: "飯店客服居民", district: "TRAVEL_DISTRICT" }),
    person("SUPREME", { character_type: "GOOSEBABY", district: "VIDEO_HALL" }),
    person("XIAO_V", { district: "ENTERTAINMENT_DISTRICT" }),
    person("CAMILLA"),
  ];
  const open = state("riverside", { characters: people, districts: districtRows({ CREATOR_DISTRICT: "UNLOCKED", TRAVEL_DISTRICT: "UNLOCKED" }) });
  const plan = Districts.layout(open);
  const cast = Art.cast(open, plan);
  const where = Object.fromEntries(cast.city.map((c) => [c.character_id, c.stand]));
  assert.equal(cast.island.length, 3);
  assert.equal(where.ERIC, "CREATOR_DISTRICT", "the fourth crew member works on the creator street");
  assert.equal(where.GUO, "TRAVEL_DISTRICT");
  assert.equal(where.HOTEL, "TRAVEL_DISTRICT");
  assert.equal(where.SUPREME, "MAIN_CITY", "a closed district's resident waits on the main street");
  assert.equal(where.XIAO_V, "MAIN_CITY");
  const range = Object.fromEntries(plan.districts.map((d) => [d.id, [d.x, d.x + d.width]]));
  for (const c of cast.city) assert.ok(c.spot >= range[c.stand][0] && c.spot < range[c.stand][1], `${c.character_id} stands inside ${c.stand}`);
  // Every spot the street offers keeps residents apart and clear of every hotspot.
  const full = state("starport", { characters: people, districts: districtRows("UNLOCKED") });
  const fullPlan = Districts.layout(full);
  const spots = fullPlan.districts.flatMap((d) => d.spots).sort((a, b) => a - b);
  for (let i = 1; i < spots.length; i++) assert.ok(spots[i] - spots[i - 1] >= 180, `spots ${spots[i - 1]} and ${spots[i]} keep residents apart`);
  const G = Art.GEOMETRY;
  const head = G.city.feet - G.character;
  const city = Art.scene(full).sections.find((s) => s.zone === "city");
  for (const h of city.hotspots) {
    const [x, y, w, hh] = h.box;
    for (const s of spots) assert.ok(y + hh <= head || s + 105 < x || s - 105 > x + w, `${h.id} stays clickable over the resident at ${s}`);
  }
  assert.deepEqual([...new Set(city.hotspots.map((h) => h.district))].sort(), fullPlan.districts.map((d) => d.id).sort(), "every district can be opened from the street");
});

test("the crowd is anonymous and adds up to what the engine says is visible, spread by district crowd", () => {
  const busy = state("riverside", { residents: { visible: 15, render_cap: { desktop: 28, mobile: 14 } }, activity: { lights_level: 88, event_flags: [], crowd_density: "BUSY" }, districts: districtRows({ CREATOR_DISTRICT: "UNLOCKED", TRAVEL_DISTRICT: "UNLOCKED" }) });
  const plan = Districts.layout(busy);
  const crowd = Districts.crowd(busy, plan, 28);
  assert.equal(crowd.length, 15);
  assert.equal(Districts.crowd(busy, plan, 6).length, 6, "the render cap (phone) wins");
  assert.ok(crowd.every((p) => plan.districts.find((d) => d.id === p.district).status === "UNLOCKED"), "no pawn in a closed lot");
  for (const p of crowd) {
    const d = plan.districts.find((x) => x.id === p.district);
    assert.ok(p.x >= d.x && p.x <= d.x + d.width, "pawns walk in their own district");
  }
  assert.ok(new Set(crowd.map((p) => Math.round(p.x / 100))).size >= 10, "pawns are spread out, not stacked");
  assert.equal(Districts.crowd(state("camp", { residents: { visible: 0 }, districts: districtRows("LOCKED") }), plan, 28).length, 0);
  const app = read("frontend/world/seamless-app.js");
  const pawn = app.slice(app.indexOf("function pawn("), app.indexOf("const BALLOON"));
  assert.ok(/NEUTRAL_PLACEHOLDER/.test(pawn) && !/img|character/.test(pawn), "a pawn is a faceless placeholder, never an image");
});

test("V1 parity lives in the drawer and the street, without timers and without widening what the page can see", () => {
  const app = read("frontend/world/seamless-app.js");
  for (const part of ["城市狀態", "文明時代", "居民八卦", "世界居民名冊", "世界模擬器（QA）", "資料來源", "重新整理", "暫停動態", "再放一次煙火", "再試一次", "街區", "精選影片", "最近的成長"]) assert.ok(app.includes(part), part);
  assert.ok(/animationiteration/.test(app) && !/setInterval|setTimeout\(/.test(app), "gossip advances on CSS animation iterations, not timers");
  assert.ok(!/audience=local/.test(app), "the page reads only the public view");
  assert.ok(!/\.evidence|content_id|project_id|overrides_applied|\.skipped/.test(app), "no provenance or project ids reach the page");
  assert.ok(/\/api\/world\/characters/.test(app) && /people\.open && !W\.roster/.test(app), "the roster loads only when its panel opens");
  const roster = app.slice(app.indexOf("async function loadRoster("), app.indexOf("function replayCelebration("));
  const figure = app.slice(app.indexOf("function rosterFigure("), app.indexOf("async function loadRoster("));
  assert.ok(/public_visibility === true/.test(roster) && /"CANONICAL_CHARACTER", "PROFESSION_CHARACTER"/.test(roster) && /Art\.nameOf/.test(figure), "the roster shows only public, resolved characters, profession residents by profession");
  assert.ok(/refresh=1/.test(app) && /const unmount = \(\) =>/.test(app) && /unmount\(\);\s*const world/.test(app), "a refresh rebuilds the world after releasing the old one");
});

// ---------- V2 visual world: density, light, evolution, townsfolk ----------
const grown = (variant, progress, over = {}) => state(variant, { era_progress: progress, visual: { ...state().visual, era_variant: variant, buildings: 20, building_height: 2, roads: "stone", ...over } });

test("V2 density: a grown main street stands as blocks, not one house on an empty lot", () => {
  const city = Art.city(grown("riverside", 0.66, { buildings: 12, building_height: 1 }));
  const lots = city.stats.evolution;
  assert.ok(city.stats.front_houses >= 5 && city.stats.back_houses >= 12, `front ${city.stats.front_houses}, behind ${city.stats.back_houses}`);
  // Along the street no stretch without a building in any row is wider than a third of a screen, apart from the plaza.
  const spans = lots.map((l) => [l.x, l.x + l.width]).sort((a, b) => a[0] - b[0]);
  let reach = spans[0][1];
  const gaps = [];
  for (const [a, b] of spans.slice(1)) {
    if (a > reach) gaps.push([reach, a]);
    reach = Math.max(reach, b);
  }
  assert.ok(gaps.every(([a, b]) => b - a < 480 || (a >= 1000 && b <= 1600)), `gaps ${JSON.stringify(gaps)}`);
  assert.ok(city.layers.backdrop.includes('class="sw-landmark"'), "a landmark rises behind the plaza");
});

test("V2 light and depth: every building has a contact shadow, a shaded return, recessed windows and a lit roof plane", () => {
  const svg = Buildings.house({ x: 0, base: 740, w: 200, floors: 2, kind: "house", lvl: 5, parts: ["flowers", "chimney", "balcony", "dormer"], seed: "t", lit: true, wall: "#e0967a", roof: "#bb4d42", trim: "#fff1d6", stone: "#b8ab98", mat: "brick", shop: "#e07d4f" });
  for (const part of ["url(#swb-contact)", "url(#swb-ao)", "url(#swb-lightwall)", "url(#swb-brick)", "url(#swb-sheen)", 'href="#swb-win-arch"', "sw-awning", 'href="#swb-chimney"', 'href="#swb-balcony"']) assert.ok(svg.includes(part), part);
  const defs = Buildings.defs();
  assert.ok(/id="swb-win"[\s\S]*var\(--swb-halo,0\)[\s\S]*var\(--swb-lit,0\)/.test(defs), "windows carry a halo and lit glass that the daypart switches on");
  // The hazy skyline keeps each window to one shape, so a grown street stays light for the browser.
  const far = Buildings.row([{ x: 0, w: 200, since: 0 }], { base: 740, g: 12, variant: "kingdom", district: "MAIN_CITY", lit: true, rowId: "s", haze: 0.32, scale: 0.62 }).svg;
  assert.ok(!far.includes('<use href="#swb-win') && far.includes("swb-farwin"));
  const css = read("frontend/world/seamless.css");
  assert.ok(/data-daypart="night"\][^{]*\.swb-w\.is-lit \{[^}]*--swb-halo: 1/.test(css) && /\.swb-pool/.test(css), "night lights the windows and the lamp pools");
});

test("V2 evolution: when the world grows, the buildings already standing upgrade with it", () => {
  const at = (variant, progress) => Object.fromEntries(Art.city(grown(variant, progress)).stats.evolution.map((l) => [l.id, l]));
  const early = at("town", 0),
    later = at("town", 0.9),
    kingdom = at("kingdom", 0.9);
  const standing = Object.keys(early);
  assert.ok(standing.length >= 10, `${standing.length} lots`);
  for (const id of standing) {
    assert.ok(later[id] && later[id].lvl > early[id].lvl, `${id} levels up within the era`);
    assert.ok(later[id].floors >= early[id].floors && later[id].width >= early[id].width && later[id].parts >= early[id].parts, `${id} never shrinks`);
    assert.ok(kingdom[id].lvl > later[id].lvl && kingdom[id].width >= later[id].width, `${id} keeps growing into the next era`);
  }
  assert.ok(standing.some((id) => later[id].floors > early[id].floors || later[id].parts > early[id].parts), "someone gains a storey or new parts");
  assert.ok(Object.keys(later).length >= standing.length, "nothing is taken away");
  // The era rebuilds the same lots in its own material, and the plaza landmark is a new building each era.
  const kinds = (variant) => new Set(Art.city(grown(variant, 0.5)).stats.evolution.map((l) => l.kind));
  assert.ok(kinds("riverside").has("cabin") && kinds("town").has("house") && kinds("kingdom").has("manor") && kinds("starport").has("spire"));
  const hall = (variant, p = 0.5) => Art.city(grown(variant, p)).layers.backdrop.match(/class="sw-landmark" data-era="(\w+)" data-step="(\d)"/);
  assert.deepEqual(["camp", "riverside", "town", "kingdom", "modern", "starport"].map((v) => hall(v)[1]), ["camp", "riverside", "town", "kingdom", "modern", "starport"]);
  assert.ok(+hall("town", 0)[2] < +hall("town", 0.9)[2], "the landmark gains wings within its era");
  // Districts grow the same way: each open district is a block of its own, and it keeps adding lots.
  const lots = (p) => Districts.paint({ ...grown("town", p), districts: districtRows("UNLOCKED") }).find((d) => d.id === "CREATOR_DISTRICT").stats.lots;
  assert.ok(lots(0) >= 10 && lots(0.9) >= lots(0), `creator district ${lots(0)} → ${lots(0.9)} lots`);
});

test("V2 townsfolk: the crowd wears its role, never a character, and closed lots preview their district", () => {
  const busy = state("riverside", { residents: { visible: 12, render_cap: { desktop: 28, mobile: 14 }, archetypes: [{ civilian_id: "CIVILIAN_TRAVELER", profession: "TRAVELER", district: "TRAVEL_DISTRICT", resolution: "NEUTRAL_PLACEHOLDER" }, { civilian_id: "CIVILIAN_NURSE", profession: "NURSE", district: "MAIN_CITY", resolution: "PROFESSION_CHARACTER", character_ref: "MEMBER_AVATAR_AAA" }] }, activity: { lights_level: 88, event_flags: [], crowd_density: "BUSY" }, districts: districtRows({ TRAVEL_DISTRICT: "UNLOCKED" }) });
  const crowd = Districts.crowd(busy, Districts.layout(busy), 28);
  assert.equal(crowd.length, 12);
  assert.ok(crowd.every((p) => ["VILLAGER", "TRAVELER", "VENDOR", "FESTIVAL", "CITIZEN"].includes(p.role) && Number.isInteger(p.tone)), "every walker has a generic role and a palette");
  for (const role of ["VILLAGER", "TRAVELER", "VENDOR", "FESTIVAL", "CITIZEN"]) {
    const sprite = Buildings.townsfolk(role, 3);
    assert.ok(sprite.startsWith("<svg") && !/<image|href=|MEMBER_AVATAR|character/i.test(sprite), `${role} is drawn from shapes only`);
  }
  const lot = Districts.paint(state("riverside", { districts: districtRows({ VIDEO_HALL: "LOCKED" }) })).find((d) => d.id === "VIDEO_HALL");
  assert.ok(lot.stats.preview_lots >= 3 && lot.layers.backdrop.includes("sw-blueprint"), "a closed lot shows the faint skyline it will become");
  const css = read("frontend/world/seamless.css");
  assert.ok(/\.sw-pawn \{[^}]*background: var\(--folk\)/.test(css) && !/\.sw-pawn \{[^}]*border:/.test(css), "the pawn is a painted townsperson, not a grey outline");
});
