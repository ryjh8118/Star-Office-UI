/* Beside each sky island's title platform floats a small resting islet, and a
   resident who lands there plays on it for a while: kicks a ball, swings from
   the tree, flies a kite, chases a butterfly, dances, naps in the shade, and
   jumps for joy when poked, before flying off again.
   Decoration only: it reads no work state, writes nothing, and never clones a
   resident. An islet without a visitor keeps only its butterflies. */
((scope) => {
  "use strict";
  const PLAYS = ["ball", "swing", "kite", "butterfly", "dance", "hop", "nap", "wave"];
  // A perched resident is too big to roam; it plays where it stands.
  const PERCHED = ["dance", "hop", "nap", "wave", "kite"];
  const LENGTH = { ball: 7200, swing: 7800, kite: 8200, butterfly: 6400, dance: 5600, hop: 4000, nap: 9200, wave: 3600 };
  const EMOTE = { ball: "!", swing: "♪", kite: "♫", butterfly: "✿", dance: "♪", hop: "✦", nap: "z", wave: "❤" };
  // Where on the grass a resident may stand, as a share of the island's width.
  const MIN_X = 20,
    MAX_X = 80,
    PACE = 55; // milliseconds per percent walked

  function random(seed, step) {
    let t = (seed ^ Math.imul(step + 1, 0x9e3779b1)) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const treeX = (seed) => (seed % 2 ? 16 : 84);
  // The swing hangs from the end of the branch, which reaches toward the middle.
  const swingX = (seed) => treeX(seed) + (treeX(seed) < 50 ? 10 : -10);
  // What a resident does next, from where it stands and what it just played.
  // Pure: every resident keeps its own rhythm, and neighbours never move in lockstep.
  function plan(seed, step, x, fixed = false, last = null) {
    const pool = fixed ? PERCHED : PLAYS;
    const before = pool.indexOf(last);
    // Never the same game twice running: skip past the last one.
    const play =
      before < 0
        ? pool[Math.floor(random(seed, step) * pool.length)]
        : pool[(before + 1 + Math.floor(random(seed, step) * (pool.length - 1))) % pool.length];
    let spot = x;
    if (!fixed) {
      if (play === "swing") spot = swingX(seed);
      else if (play === "nap") spot = swingX(seed) + (treeX(seed) < 50 ? 16 : -16);
      else if (play === "butterfly")
        // A chase covers ground: head for the far half of the grass.
        spot = x < 50 ? 58 + random(seed, step + 500) * 22 : MIN_X + random(seed, step + 500) * 22;
      else spot = MIN_X + 8 + random(seed, step + 1000) * (MAX_X - MIN_X - 16);
      spot = Math.round(Math.min(MAX_X, Math.max(MIN_X, spot)));
    }
    const walk = Math.round(Math.abs(spot - x) * PACE);
    const facing = spot === x ? (x < 50 ? 1 : -1) : spot > x ? 1 : -1;
    // Swinging, kicking, flying a kite or waving, a resident faces the island's
    // middle, so the ball and the kite stay over the grass.
    const face = ["swing", "kite", "wave", "ball"].includes(play) ? (spot < 50 ? 1 : -1) : facing;
    return { play, x: spot, walk, facing, face, emote: EMOTE[play], duration: walk + LENGTH[play] };
  }

  const api = { PLAYS, PERCHED, MIN_X, MAX_X, random, treeX, swingX, plan };
  scope.CreatorYard = api;
  if (typeof module !== "undefined") module.exports = api;
  if (typeof document === "undefined") return;

  function el(cls, parent, tag = "div") {
    const node = document.createElement(tag);
    node.className = cls;
    parent?.append(node);
    return node;
  }
  const timers = new WeakMap();

  function perform(yard, actor, next) {
    clearTimeout(timers.get(yard));
    const emote = actor.querySelector(".co-yard-emote");
    actor.dataset.facing = next.facing > 0 ? "right" : "left";
    actor.style.setProperty("--walk", next.walk + "ms");
    actor.style.left = next.x + "%";
    emote.textContent = "";
    yard.dataset.play = next.walk && next.play !== "butterfly" ? "walk" : next.play;
    timers.set(
      yard,
      setTimeout(() => {
        yard.dataset.play = next.play;
        actor.dataset.facing = next.face > 0 ? "right" : "left";
        emote.textContent = next.emote;
      }, next.walk),
    );
  }

  function start(yard, actor, seed, fixed, delay) {
    let step = Math.floor(random(seed, 7) * 5),
      last = null,
      x = fixed ? 55 : Math.round(30 + random(seed, 3) * 40);
    actor.style.left = x + "%";
    actor.dataset.facing = x < 50 ? "right" : "left";
    yard.dataset.play = "stand";
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const tick = () => {
      // An islet taken out of the page retires its schedule.
      if (!yard.isConnected) return;
      // A visitor that has flown off takes its schedule with it.
      if (!actor.isConnected) return;
      if (document.hidden || !yard.classList.contains("is-on-screen")) {
        setTimeout(tick, 1500);
        return;
      }
      const next = plan(seed, step++, x, fixed, last);
      x = next.x;
      last = next.play;
      perform(yard, actor, next);
      setTimeout(tick, next.duration);
    };
    setTimeout(tick, delay ?? 400 + random(seed, 11) * 2400);
  }

  function poke(actor) {
    actor.classList.remove("is-poked");
    void actor.offsetWidth;
    actor.classList.add("is-poked");
    clearTimeout(timers.get(actor));
    timers.set(actor, setTimeout(() => actor.classList.remove("is-poked"), 950));
    for (let i = 0; i < 3; i++) {
      const heart = el("co-yard-heart", actor, "span");
      heart.textContent = "❤";
      heart.style.setProperty("--i", i);
      setTimeout(() => heart.remove(), 1300);
    }
  }

  function sprite(character, parent) {
    const [x, y, w, h] = character.bounds;
    const box = el("co-yard-sprite", parent);
    const img = document.createElement("img");
    box.append(img);
    img.src = "/static/renguin-characters/residents/" + character.file;
    img.alt = "";
    img.loading = "lazy";
    img.draggable = false;
    img.style.cssText = `width:${(character.size[0] / w) * 100}%;height:${(character.size[1] / h) * 100}%;left:${(-x / w) * 100}%;top:${(-y / h) * 100}%`;
    return box;
  }

  const place = (node, i, [left, top]) => {
    node.style.setProperty("--i", i);
    node.style.left = left + "%";
    node.style.top = top + "cqw";
  };
  function build({ character, seed }) {
    const yard = el("co-yard");
    yard.setAttribute("aria-hidden", "true");
    yard.dataset.resident = character?.name || "";
    yard.style.setProperty("--tree-x", treeX(seed) + "%");
    yard.style.setProperty("--swing-x", swingX(seed) + "%");
    yard.style.setProperty("--bob-delay", -Math.round(random(seed, 21) * 6000) + "ms");
    yard.dataset.tree = treeX(seed) < 50 ? "left" : "right";
    const isle = el("co-yard-isle", yard);
    el("co-yard-rock", isle);
    [[4, 25.5], [95, 24.5], [24, 28.5]].forEach((at, i) => place(el("co-yard-pebble", isle), i, at));
    el("co-yard-grass", isle);
    const tree = el("co-yard-tree", isle);
    el("co-yard-trunk", tree);
    el("co-yard-branch", tree);
    el("co-yard-canopy", tree);
    el("co-yard-bird", tree);
    el("co-yard-treeswing", isle);
    // Flowers keep clear of the tree's side of the grass.
    const side = treeX(seed) < 50 ? 1 : -1;
    [[50 - 8 * side, 19.6], [50 + 14 * side, 18.4], [50 + 26 * side, 20.2], [50 + 34 * side, 18.9]].forEach((at, i) =>
      place(el("co-yard-flower", isle), i, at),
    );
    for (let i = 0; i < 2; i++) el("co-yard-flutter", isle).style.setProperty("--i", i);
    if (!character) return yard;
    resident(yard, isle, character, seed);
    return yard;
  }
  function resident(yard, isle, character, seed, delay) {
    yard.classList.add("has-resident");
    yard.dataset.resident = character.name;
    const actor = el("co-yard-actor" + (character.fixed ? " is-perched" : ""), isle);
    actor.dataset.character = character.name;
    // Every resident stands about as tall as the next, however its art is cropped.
    const aspect = character.bounds[2] / character.bounds[3];
    actor.style.aspectRatio = `${character.bounds[2]} / ${character.bounds[3]}`;
    actor.style.setProperty("--scale", Math.min(1.15, Math.max(0.68, 1 / Math.sqrt(aspect))).toFixed(3));
    const rig = el("co-yard-rig", actor);
    const swing = el("co-yard-swing", rig);
    el("co-yard-seat", swing);
    const joy = el("co-yard-joy", rig);
    const facing = el("co-yard-facing", joy);
    const body = el("co-yard-body", facing);
    sprite(character, body);
    el("co-yard-ball", facing);
    const kite = el("co-yard-kite", facing);
    kite.innerHTML =
      '<svg viewBox="0 0 60 60" preserveAspectRatio="none"><path class="co-yard-string" d="M1 59 C 20 54, 34 36, 48 12"/>' +
      '<path class="co-yard-kite-tail" d="M48 18 q -5 7 1 11 q 6 4 -1 10 q -6 5 0 9"/>' +
      '<path class="co-yard-kite-sail" d="M48 0 L58 10 L48 20 L38 10 Z"/><path class="co-yard-kite-spar" d="M48 0 V20 M38 10 H58"/></svg>';
    el("co-yard-butterfly", facing);
    el("co-yard-emote", actor, "span");
    el("co-yard-shadow", actor, "span");
    actor.addEventListener("click", () => poke(actor));
    start(yard, actor, seed, !!character.fixed, delay);
    return actor;
  }
  // A resting place with no one on it can take a visitor, who later flies off
  // again. The island itself stays put; only the visitor comes and goes, and it
  // starts to play only once it has landed.
  function visit(yard, character, seed, landing = 0) {
    const isle = yard?.querySelector(".co-yard-isle");
    if (!isle || !character || yard.querySelector(".co-yard-actor")) return null;
    return resident(yard, isle, character, seed, landing || undefined);
  }
  function leave(yard) {
    const actor = yard?.querySelector(".co-yard-actor");
    if (!actor) return;
    clearTimeout(timers.get(yard));
    clearTimeout(timers.get(actor));
    actor.remove();
    yard.classList.remove("has-resident");
    yard.dataset.resident = "";
    yard.dataset.play = "stand";
  }

  Object.assign(api, { build, visit, leave });
})(typeof window === "undefined" ? globalThis : window);
