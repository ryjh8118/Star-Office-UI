// Renguin World seamless side-view slice: who stands where, what the art draws, and the camera math.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Art = require("../frontend/world/seamless-art.js");
const Cam = require("../frontend/world/world-camera.js");

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
  const island = Art.island(state());
  const descent = Art.descent(state());
  const riverside = Art.city(state());
  const everything = island + descent.map((l) => l.svg).join("") + riverside.layers.map((l) => l.svg).join("");
  assert.ok(!/<image|<img|character-thumb|MEMBER_AVATAR/.test(everything), "residents are placed by the page, not painted into the scenery");
  assert.ok(!/fill="#526473"/.test(everything), "no generic penguin sprite");
  assert.ok(island.includes("STAR OFFICE"));
  assert.ok(descent.length >= 4 && descent.some((l) => l.depth < 1) && descent.some((l) => l.depth > 1), "clouds on both sides of the view");
  assert.deepEqual(riverside.layers.map((l) => l.name), ["bg", "back", "main", "front"]);
  assert.ok(riverside.layers.find((l) => l.name === "front").z < 6, "the foreground never covers residents");
  assert.ok(riverside.stats.river && !riverside.stats.fountain && !riverside.stats.market);
  const town = Art.city(state("town", { visual: { ...state().visual, era_variant: "town", landmarks: ["MARKET", "CLOCK_TOWER"], roads: "cobble", building_height: 2 } }));
  assert.ok(town.stats.fountain && town.stats.market);
  assert.ok(town.layers.find((l) => l.name === "main").svg.includes('data-kind="house"'));
  assert.ok(riverside.layers.find((l) => l.name === "main").svg.includes('data-kind="cabin"'));
});

test("growth is visible on the street: more buildings, a construction site, the newest poster", () => {
  const few = Art.city(state("riverside", { visual: { ...state().visual, buildings: 2 } })).stats;
  const many = Art.city(state("riverside", { visual: { ...state().visual, buildings: 12 } })).stats;
  assert.ok(many.front_houses + many.back_houses > few.front_houses + few.back_houses);
  assert.ok(Art.city(state()).layers.find((l) => l.name === "main").svg.includes("sw-construction"));
  assert.ok(!Art.city(state("riverside", { visual: { ...state().visual, construction: "COMPLETE" } })).layers.find((l) => l.name === "main").svg.includes("sw-construction"));
  const empty = Art.city(state("camp", { featured_contents: [], content: { total: 0 }, visual: { ...state().visual, era_variant: "camp", buildings: 0 } }));
  assert.equal(empty.stats.poster, false);
  assert.equal(empty.stats.front_houses, 0);
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
  for (const f of ["world-scene.js", "world-camera.js", "seamless-art.js", "seamless-app.js", "seamless.css"]) assert.ok(shell.includes(`/static/world/${f}?v={{WORLD_VERSION}}`), f);
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
