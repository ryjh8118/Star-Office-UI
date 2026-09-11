const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const E = require("../frontend/creator-environment.js");

const read = (name) => fs.readFileSync(path.join(__dirname, "../frontend", name), "utf8");
const source = read("creator-environment.js");
const css = read("creator-environment.css");

test("the office offers every promised time, weather and atmosphere", () => {
  assert.deepEqual(E.TIMES, ["MORNING", "DAY", "AFTERNOON", "SUNSET", "NIGHT"]);
  for (const w of ["CLEAR", "CLOUDY", "OVERCAST", "RAIN", "HEAVY_RAIN", "THUNDERSTORM", "SNOW", "HEAVY_SNOW", "FOG", "WINDY"])
    assert.ok(E.WEATHERS.includes(w), w);
  assert.deepEqual(E.RAINBOW_WEATHERS, ["CLEAR", "CLOUDY", "RAIN"]);
  for (const a of ["AURORA", "STARS", "METEOR", "FIREFLIES", "SPARKLES"]) assert.ok(E.ATMOSPHERES.includes(a), a);
  for (const key of [...E.TIME_MODES, ...E.WEATHERS, ...E.ATMOSPHERES, "RAINBOW"])
    assert.ok(E.LABELS[key], "label for " + key);
});

test("state stays inside the complexity budget", () => {
  assert.deepEqual(E.normalize(null), { time: "AUTO", weather: "CLEAR", rainbow: false, atmosphere: [] });
  assert.deepEqual(E.normalize({ time: "NOON", weather: "HAIL", atmosphere: "AURORA" }), E.normalize(null));
  const crowded = E.normalize({ time: "NIGHT", weather: "SNOW", atmosphere: ["STARS", "AURORA", "METEOR", "AURORA"] });
  assert.deepEqual(crowded.atmosphere, ["AURORA", "STARS"]);
  assert.equal(E.normalize({ weather: "SNOW", rainbow: true }).rainbow, false);
  for (const weather of E.RAINBOW_WEATHERS) assert.equal(E.normalize({ weather, rainbow: true }).rainbow, true);
  assert.equal(E.withWeather({ weather: "CLEAR", rainbow: true }, "THUNDERSTORM").rainbow, false);
  assert.ok(E.same({ atmosphere: ["STARS", "AURORA"] }, { atmosphere: ["AURORA", "STARS"] }));
});

test("a third atmosphere is refused, never silently swapped", () => {
  const two = { atmosphere: ["AURORA", "STARS"] };
  const refused = E.withAtmosphere(two, "METEOR", true);
  assert.equal(refused.refused, true);
  assert.deepEqual(refused.state.atmosphere, ["AURORA", "STARS"]);
  assert.deepEqual(E.withAtmosphere(two, "STARS", false).state.atmosphere, ["AURORA"]);
  assert.equal(E.withAtmosphere(two, "AURORA", true).refused, false);
  assert.deepEqual(E.withAtmosphere({ atmosphere: ["AURORA"] }, "FIREFLIES", true).state.atmosphere, ["AURORA", "FIREFLIES"]);
});

test("aurora is an atmosphere at every time of day, brighter toward night", () => {
  const light = E.TIMES.map((time) => E.plan({ weather: "CLEAR", atmosphere: ["AURORA"] }, { time }).aurora);
  for (const value of light) assert.ok(value > 0 && value < 1);
  const at = (time) => light[E.TIMES.indexOf(time)];
  assert.ok(at("DAY") <= 0.35, "day aurora stays faint");
  assert.ok(at("DAY") < at("SUNSET") && at("SUNSET") < at("NIGHT"));
  assert.equal(E.plan({ atmosphere: [] }, { time: "NIGHT" }).aurora, 0);
  assert.ok(E.plan({ weather: "OVERCAST", atmosphere: ["AURORA"] }, { time: "NIGHT" }).aurora < at("NIGHT"));
});

test("stars and meteors belong to the dark sky", () => {
  const sky = (time) => E.plan({ weather: "CLEAR", atmosphere: ["STARS", "METEOR"] }, { time });
  for (const time of ["MORNING", "DAY", "AFTERNOON"]) {
    assert.equal(sky(time).stars, 0, time);
    assert.equal(sky(time).meteor, false, time);
  }
  assert.equal(sky("NIGHT").stars, 1);
  assert.equal(sky("NIGHT").meteor, true);
});

test("reduced motion keeps the look but drops the movement", () => {
  const storm = E.plan({ weather: "THUNDERSTORM", atmosphere: ["METEOR", "FIREFLIES"] }, { time: "NIGHT", reduced: true });
  assert.equal(storm.lightning, false);
  assert.equal(storm.meteor, false);
  assert.equal(storm.fireflies, 0);
  assert.equal(storm.rain, 1, "heavy rain becomes a light, still texture");
  assert.equal(storm.motion, false);
  const snow = E.plan({ weather: "HEAVY_SNOW", atmosphere: ["AURORA"] }, { time: "NIGHT", reduced: true });
  assert.equal(snow.snow, 1);
  assert.ok(snow.aurora > 0, "a still aurora remains");
  assert.equal(E.plan({ weather: "THUNDERSTORM" }, { time: "NIGHT" }).lightning, true);
});

test("narrow screens thin the particles without removing the world", () => {
  const wide = E.plan({ atmosphere: ["FIREFLIES", "SPARKLES"] }, { time: "NIGHT" });
  const narrow = E.plan({ atmosphere: ["FIREFLIES", "SPARKLES"] }, { time: "NIGHT", narrow: true });
  assert.ok(narrow.fireflies > 0 && narrow.fireflies < wide.fireflies);
  assert.ok(narrow.sparkles > 0 && narrow.sparkles < wide.sparkles);
});

test("automatic time follows the local clock", () => {
  const at = (hour) => E.resolveTime("AUTO", new Date(2026, 8, 11, hour, 30));
  assert.equal(at(6), "MORNING");
  assert.equal(at(11), "DAY");
  assert.equal(at(15), "AFTERNOON");
  assert.equal(at(18), "SUNSET");
  assert.equal(at(22), "NIGHT");
  assert.equal(at(2), "NIGHT");
  assert.equal(E.resolveTime("SUNSET", new Date(2026, 8, 11, 11)), "SUNSET");
});

test("presets are shortcuts into the same modular state", () => {
  const named = Object.fromEntries(E.PRESETS.map((p) => [p.label, E.preset(p.id)]));
  const expect = (label, time, weather, atmosphere) =>
    assert.deepEqual(named[label], { time, weather, rainbow: false, atmosphere }, label);
  expect("晴朗白天", "DAY", "CLEAR", []);
  expect("白晝極光", "DAY", "CLEAR", ["AURORA"]);
  expect("雨天辦公室", "AFTERNOON", "RAIN", []);
  expect("夕陽極光", "SUNSET", "CLEAR", ["AURORA"]);
  expect("極光雪夜", "NIGHT", "SNOW", ["AURORA", "STARS"]);
  expect("雷雨夜", "NIGHT", "THUNDERSTORM", []);
  for (const p of E.PRESETS) assert.deepEqual(E.normalize(E.preset(p.id)), E.preset(p.id));
});

test("the acceptance matrix plans within budget", () => {
  const matrix = [
    ["DAY", "CLEAR", []],
    ["DAY", "CLEAR", ["AURORA"]],
    ["DAY", "CLOUDY", ["AURORA"]],
    ["AFTERNOON", "RAIN", []],
    ["SUNSET", "CLEAR", ["AURORA"]],
    ["SUNSET", "RAIN", ["AURORA"]],
    ["NIGHT", "CLEAR", ["STARS"]],
    ["NIGHT", "SNOW", ["AURORA"]],
    ["NIGHT", "FOG", ["FIREFLIES"]],
    ["NIGHT", "THUNDERSTORM", []],
  ];
  for (const [time, weather, atmosphere] of matrix) {
    const p = E.plan({ time, weather, atmosphere }, {});
    assert.equal(p.time, time);
    assert.equal(p.weather, weather);
    assert.ok([p.rain, p.snow, p.fog, p.wind].filter(Boolean).length <= 1, "one primary weather");
    assert.ok([p.aurora, p.stars, p.meteor, p.fireflies, p.sparkles].filter(Boolean).length <= 2, "at most two atmospheres");
    if (atmosphere.includes("AURORA")) assert.ok(p.aurora > 0, `aurora shows at ${time} ${weather}`);
  }
});

test("the environment never reads or publishes work state", () => {
  for (const forbidden of [
    "RenguinOperations",
    "RenguinFreshness",
    "CreatorOffice",
    "effective(",
    "last_heartbeat",
    "lease",
    "visual_activity",
    "fetch(",
    "/api/",
  ])
    assert.ok(!source.includes(forbidden), "environment must not touch " + forbidden);
});

test("folding a room never stretches the world", () => {
  const sheets = ["creator-office.css", "creator-lodge.css", "creator-ambience.css", "creator-environment.css"]
    .map(read)
    .join("\n");
  assert.ok(!/scaleY\s*\(/.test(sheets), "no scaleY anywhere");
  assert.ok(!/background-size\s*:\s*100%\s+100%/.test(sheets), "no 100% 100% background-size");
  assert.ok(!/\/\s*100%\s+100%/.test(sheets), "no 100% 100% in a background shorthand");
  // Room layers tile at pixel geometry instead of sizing to their container.
  assert.match(css, /\.co-zone-wall\s*\{[^}]*repeat-x/);
  assert.match(css, /\.co-zone-fold\s*\{[^}]*grid-template-rows/);
  assert.match(css, /\.co-zone\.is-collapsed > \.co-zone-fold\s*\{\s*grid-template-rows:\s*0fr/);
});

test("reduced motion switches the moving layers off", () => {
  const block = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
  for (const needle of [".co-env-meteor", ".co-env-flash", ".co-env-fireflies", ".co-env-wind", "animation: none !important"])
    assert.ok(block.includes(needle), needle);
});
