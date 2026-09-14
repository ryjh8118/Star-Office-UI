// Renguin World city renderer: one camera for every era, a static SVG, and motion only in the overlay.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const S = require("../frontend/world/world-scene.js");

const read = (...parts) => fs.readFileSync(path.join(__dirname, "..", ...parts), "utf8");

function state(variant, over = {}) {
  const idx = S.VARIANTS.indexOf(variant);
  return {
    current_era_name: variant,
    world_level: idx * 5 + 1,
    visual: {
      era_variant: variant,
      city_radius: [2, 3, 3, 4, 5, 5, 6, 6][idx],
      buildings: [3, 6, 9, 14, 19, 28, 32, 37][idx],
      building_height: [1, 1, 1, 2, 3, 4, 5, 5][idx],
      landmarks: ["CAMPFIRE", "CREATOR_TOTEM", "RIVER_DOCK", "WOODEN_BRIDGE", "MARKET", "CLOCK_TOWER", "CITY_WALL", "CASTLE_KEEP", "TV_TOWER", "VIDEO_HALL_DOME", "MONORAIL", "SKY_GARDEN", "SPACE_GATE"].slice(0, [1, 2, 4, 6, 8, 10, 12, 13][idx]),
      construction: "ACTIVE",
      shops_open: 1,
      grass_level: 0,
      lights_level: 88,
      future_gate: idx === 7 ? "UNLOCKED" : idx === 6 ? "PREVIEW" : "LOCKED",
    },
    activity: { state: "ACTIVE", event_flags: [], lights_level: 88, crowd_density: "BUSY" },
    residents: { visible: 20, render_cap: { desktop: 28, mobile: 14 }, archetypes: [{ profession: "NURSE" }, { profession: "VILLAGER" }] },
    districts: [
      { id: "MAIN_CITY", name: "主城區", status: "UNLOCKED", unlocked: true },
      { id: "CREATOR_DISTRICT", name: "創作者街區", status: idx >= 1 ? "UNLOCKED" : "LOCKED", unlocked: idx >= 1 },
    ],
    characters: [
      { character_id: "RENGUIN", display_name: "企鵝", render_mode: "IMAGE", district: "CREATOR_DISTRICT", state: "WALKING" },
      { character_id: "MEMBER_AVATAR_ABC", display_name: "護理師鵝寶", render_mode: "TOKEN", district: "MAIN_CITY", state: "IDLE" },
    ],
    featured_contents: [{ title: "新片", is_new: true }],
    content: { total: 3 },
    ...over,
  };
}

test("every era uses the same camera, island and outline, and differs only in what stands on it", () => {
  const boxes = new Set(),
    islands = new Set(),
    kinds = [];
  for (const variant of S.VARIANTS) {
    const { svg } = S.render(state(variant));
    boxes.add(svg.match(/viewBox="([^"]+)"/)[1]);
    islands.add(svg.match(/<g class="rw-island">([\s\S]*?)<\/g>/)[1]);
    // Inner lots carry the era's own roof; the outer ring may still show the previous era's.
    const counts = {};
    for (const m of svg.matchAll(/data-kind="(\w+)"/g)) counts[m[1]] = (counts[m[1]] || 0) + 1;
    kinds.push(Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]);
    assert.ok(!/stroke="#(?!3a3150)[0-9a-f]{6}" stroke-opacity="\.45"/.test(svg), "one outline colour");
  }
  assert.equal(boxes.size, 1, "one viewBox");
  assert.equal(islands.size, 1, "one floating island slab");
  assert.deepEqual(kinds, ["tent", "hut", "cabin", "house", "manor", "tower", "spire", "spire"]);
});

test("the city SVG never animates; walkers, characters and effects live in the overlay", () => {
  const s = state("town", { activity: { state: "FESTIVAL", event_flags: ["FIREWORKS", "FESTIVAL_BANNERS"], lights_level: 100, crowd_density: "FESTIVAL" } });
  const { svg, overlay, stats } = S.render(s);
  assert.ok(!/<animate|rw-walker|rw-firework|rw-actor|rw-cloud/.test(svg));
  assert.equal((overlay.match(/class="rw-walker"/g) || []).length, 20);
  assert.equal((overlay.match(/class="rw-o rw-firework"/g) || []).length, 5);
  assert.equal((overlay.match(/rw-actor/g) || []).length, 2);
  assert.equal(stats.walkers, 20);
  const css = read("frontend/world/world.css");
  const motion = css.slice(css.indexOf("/* Motion lives in the overlay"), css.indexOf("@keyframes rw-walk"));
  assert.ok(/\.rw-paused \*[\s\S]*animation-play-state: paused !important/.test(motion), "one class pauses everything");
  for (const block of css.match(/@keyframes[^{]+\{[\s\S]*?\n\}/g))
    assert.ok(!/\b(left|top|width|height|margin|filter)\s*:/.test(block), "keyframes animate transform/translate/opacity only: " + block.split("{")[0]);
});

test("resident density follows the preset and the render cap, tighter on phones", () => {
  const busy = state("modern", { residents: { visible: 42, render_cap: { desktop: 28, mobile: 14 }, archetypes: [] } });
  assert.equal(S.render(busy).stats.walkers, 28);
  assert.equal(S.render(busy, { mobile: true }).stats.walkers, 14);
  assert.equal(S.render(state("modern", { residents: { visible: 0, render_cap: { desktop: 28, mobile: 14 }, archetypes: [] } })).stats.walkers, 0);
});

test("growth only adds buildings; quiet only dims them", () => {
  let last = -1;
  for (let n = 0; n <= 40; n += 4) {
    const s = state("future", { visual: { ...state("future").visual, buildings: n } });
    const { stats } = S.render(s);
    assert.ok(stats.buildings >= last);
    last = stats.buildings;
  }
  const awake = S.render(state("town"));
  const dim = state("town");
  dim.visual = { ...dim.visual, shops_open: 0.25, construction: "PAUSED", grass_level: 3, lights_level: 20 };
  const asleep = S.render(dim);
  assert.equal(asleep.stats.buildings, awake.stats.buildings, "no building is removed");
  assert.ok(asleep.stats.lit_buildings < awake.stats.lit_buildings);
  assert.ok(asleep.svg.includes("暫停施工"));
  assert.ok(asleep.svg.includes('data-grass="3"'));
});

test("the space gate is hidden, then scaffolded, then lit", () => {
  assert.ok(!S.render(state("modern")).svg.includes('class="rw-gate'));
  assert.ok(S.render(state("future")).svg.includes('class="rw-gate is-preview"'));
  assert.ok(S.render(state("starport")).svg.includes('class="rw-gate is-active"'));
});

test("configured landmarks reach their renderer without early unlocks", () => {
  assert.ok(S.render(state("camp")).svg.includes('class="rw-campfire"'));
  const camp = S.render(state("camp")).svg;
  assert.ok(!camp.includes('class="rw-bridge"') && !camp.includes('rw-fx-train'));
  assert.ok(S.render(state("riverside")).svg.includes('class="rw-bridge"'));
  assert.ok(S.render(state("kingdom")).svg.includes('stroke-dasharray="26 6"'));
  assert.ok(S.render(state("future")).overlay.includes('rw-fx-train'));
  const locked = state("riverside", { districts: [] });
  assert.ok(!S.render(locked).overlay.includes('class="rw-office-entry"'));
});

test("text from data is escaped and characters render as the authority's image or a token", () => {
  const s = state("town", { featured_contents: [{ title: '<img src=x onerror="1">', is_new: false }] });
  s.characters[0].display_name = '"><script>';
  const { svg, overlay } = S.render(s);
  assert.ok(!svg.includes("<img src=x") && !overlay.includes("<script>"));
  assert.ok(overlay.includes('src="/api/world/character-thumb/RENGUIN?s=96"'));
  assert.ok(overlay.includes("rw-token-sprite"), "a private member avatar is a token, never a drawn likeness");
  assert.ok(!overlay.includes("MEMBER_AVATAR_ABC?s="), "no image request for a token");
});

test("an empty world still renders: the lot, the campfire and nothing pretending to be content", () => {
  const empty = state("camp", { visual: { ...state("camp").visual, buildings: 0, construction: "WAITING" }, featured_contents: [], content: { total: 0 }, residents: { visible: 0, render_cap: { desktop: 28, mobile: 14 }, archetypes: [] } });
  const { svg, stats } = S.render(empty);
  assert.equal(stats.buildings, 0);
  assert.ok(!svg.includes("rw-poster"));
  assert.ok(svg.includes("等待開工"));
});

test("the Office never loads the world: only a link points at /world", () => {
  const office = read("frontend/index.html") + read("frontend/creator-office.js");
  assert.ok(!/world-(scene|app)\.js|world\.css|RenguinWorld/.test(office));
  assert.ok(read("frontend/creator-office.js").includes('worldLink.href = "/world"'));
  const shell = read("frontend/world/index.html");
  assert.ok(shell.includes("/static/world/world-scene.js?v={{WORLD_VERSION}}"));
  const app = read("frontend/world/world-app.js");
  assert.ok(!/setInterval|requestAnimationFrame/.test(app), "no loop, no poll");
  assert.equal((app.match(/setTimeout\(/g) || []).length, 1, "one tracked timer helper");
  assert.ok(/listen\(window, "pagehide", stop\)/.test(app) && /visibilitychange/.test(app));
});
