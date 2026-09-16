/* One page from the desk to the city.
 *
 * The Office's own scroll continues past the bottom of its sky island, through a
 * band of cloud, into Renguin World's island, cloud sea and street. There is no
 * second page, no route and no button that swaps one view for another: the world
 * is a region of this document, and the scrollbar is the only thing that moves.
 *
 * What the Office pays on first load is this file and office-gate.css — no world
 * stylesheet, no art, no engine, no state request. The world's 260 kB of script
 * and its state arrive only once the reader is within BOOT_MARGIN of the band, and
 * the world is told to stop the moment it leaves the viewport again. Everything
 * below the fold that would otherwise animate is held still until it is on screen,
 * because Chrome runs an animation it judges invisible on the main thread.
 */
(() => {
  "use strict";

  const current = document.currentScript;
  const VERSION = (current && current.dataset.worldVersion) || "";
  const q = VERSION ? "?v=" + encodeURIComponent(VERSION) : "";
  // The world's files, in the order /world/seamless declares them. Each is fetched in
  // parallel and run in this order (async = false on an injected script keeps order).
  const SCRIPTS = [
    "world-scene.js",
    "world-camera.js",
    "world-composition.js",
    "seamless-art.js",
    "seamless-buildings.js",
    "seamless-districts.js",
    "seamless-app.js",
  ];
  // Start loading a screen and a half early: enough for the engine and one state
  // request to land before the band is reached, not so early that merely opening
  // the Office pulls the world down with it.
  const BOOT_MARGIN = "150% 0px 150% 0px";

  // One sky. The Office already decides what time it is outside its windows, so the
  // world below takes the same answer instead of asking the clock a second time and
  // handing the reader a blue morning underneath a night desk.
  const OFFICE_TIME = { MORNING: "day", DAY: "day", AFTERNOON: "day", SUNSET: "dusk", NIGHT: "night" };
  const daypart = () => {
    const office = OFFICE_TIME[document.documentElement.dataset.envTime];
    if (office) return office;
    const h = new Date().getHours();
    return h >= 6 && h < 17 ? "day" : h >= 17 && h < 19 ? "dusk" : "night";
  };

  const el = (tag, cls, attrs) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    Object.assign(n, attrs || {});
    return n;
  };

  const smoothTo = (top) =>
    window.scrollTo({
      top,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  // Page coordinates: the band's offsetParent is the world's own root, not the page.
  const pageTop = (node) => node.getBoundingClientRect().top + window.scrollY;
  const worldTop = () => pageTop(gate) + gate.offsetHeight;

  // ---------------------------------------------------------------- the band
  const app = el("div", "sw-app ow-embed");
  app.id = "sw-app";
  app.dataset.status = "idle";
  app.dataset.daypart = daypart();
  app.dataset.zone = "island";

  const gate = el("section", "ow-gate");
  gate.id = "ow-gate";
  gate.setAttribute("aria-label", "往下前往 Renguin World");
  gate.append(el("i", "ow-gate-clouds is-far"), el("i", "ow-gate-clouds is-near"));
  const hint = el("button", "ow-gate-hint", { type: "button" });
  hint.append(document.createTextNode("往下滑，抵達 Renguin World"), el("i", null, { textContent: "↓" }));
  hint.addEventListener("click", () => smoothTo(worldTop()));
  gate.append(hint);

  // A strip of the same sky stands where the world will be, so the page never
  // grows a bare gap between the band and the world's first painted section.
  const booting = el("div", "ow-booting");
  app.append(gate, booting);

  // ---------------------------------------------------------------- the shell
  // The same markup /world/seamless serves, with one difference: the way back to
  // the Office is a scroll up this page, not a load of another one.
  const SHELL = `
      <header class="sw-hud">
        <button class="sw-chip sw-back" type="button" aria-label="回到 Star Office">↑<span class="sw-wide"> Star Office</span></button>
        <div class="sw-brand"><span aria-hidden="true">◆</span><span class="sw-wide"> RENGUIN WORLD</span></div>
        <div id="sw-level" class="sw-level" hidden>
          <strong id="sw-level-text"></strong>
          <span class="sw-meter" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i id="sw-level-fill"></i></span>
        </div>
        <div class="sw-tools">
          <button id="sw-zoom-out" class="sw-chip" type="button" aria-label="縮小世界">A−</button>
          <button id="sw-zoom-in" class="sw-chip" type="button" aria-label="放大世界">A+</button>
          <button id="sw-time" class="sw-chip" type="button" aria-label="切換時段">時段</button>
          <button id="sw-data" class="sw-chip is-primary" type="button" aria-expanded="false" aria-controls="sw-drawer">世界資料</button>
        </div>
      </header>
      <div id="sw-banner" class="sw-banner" role="status" hidden></div>

      <nav id="sw-altimeter" class="sw-altimeter" aria-label="高度">
        <button type="button" data-zone="island"><i></i><span>空島</span></button>
        <button type="button" data-zone="descent"><i></i><span>雲海</span></button>
        <button type="button" data-zone="city"><i></i><span>城市</span></button>
      </nav>

      <div id="sw-defs" class="sw-defs-host"></div>
      <main id="sw-world" class="sw-world" aria-label="Renguin World">
        <div class="sw-loading"><p>正在載入世界…</p></div>
      </main>

      <div class="sw-district-nav" id="sw-district-nav" hidden>
        <button id="sw-district" class="sw-chip" type="button" aria-expanded="false" aria-controls="sw-district-list"><span class="sw-wide">街區：</span><span id="sw-district-name">主城區</span><i aria-hidden="true"></i></button>
        <div id="sw-district-list" class="sw-district-list" role="group" aria-label="前往街區" hidden></div>
      </div>

      <div class="sw-street-nav" id="sw-street-nav" hidden>
        <button id="sw-street-left" class="sw-chip" type="button" aria-label="街道往左">‹</button>
        <button id="sw-street-right" class="sw-chip" type="button" aria-label="街道往右">›</button>
      </div>

      <section id="sw-card" class="sw-card" role="dialog" aria-modal="false" aria-labelledby="sw-card-name" hidden>
        <button id="sw-card-close" class="sw-card-close" type="button" aria-label="關閉">×</button>
        <img id="sw-card-img" alt="" width="96" height="96" />
        <div>
          <h2 id="sw-card-name"></h2>
          <p id="sw-card-role" class="sw-card-role"></p>
          <dl id="sw-card-facts" class="sw-facts"></dl>
          <div id="sw-card-actions" class="sw-card-actions"></div>
        </div>
      </section>

      <aside id="sw-drawer" class="sw-drawer" aria-label="世界資料" hidden>
        <div class="sw-drawer-head">
          <h2>世界資料</h2>
          <button id="sw-drawer-close" class="sw-chip" type="button">關閉</button>
        </div>
        <div id="sw-drawer-body"></div>
      </aside>
      <div class="sw-night" aria-hidden="true"></div>`;

  // ------------------------------------------------------------------ booting
  let booted = false;
  let active = null;
  let chrome = null;

  const sheet = (href) =>
    new Promise((resolve, reject) => {
      const link = el("link", null, { rel: "stylesheet", href });
      link.addEventListener("load", () => resolve(), { once: true });
      link.addEventListener("error", () => reject(new Error("CSS " + href)), { once: true });
      document.head.append(link);
    });

  const script = (href) =>
    new Promise((resolve, reject) => {
      const s = el("script", null, { src: href, defer: true });
      // Injected scripts are async by default; clearing it runs them in insertion order.
      s.async = false;
      s.addEventListener("load", () => resolve(), { once: true });
      s.addEventListener("error", () => reject(new Error("JS " + href)), { once: true });
      document.head.append(s);
    });

  async function boot() {
    if (booted) return;
    booted = true;
    try {
      // The stylesheet lands before the shell, so the world's fixed chrome is never
      // painted unstyled across the Office.
      await sheet("/static/world/seamless.css" + q);
      booting.insertAdjacentHTML("beforebegin", SHELL);
      booting.remove();
      app.querySelector(".sw-back").addEventListener("click", toOffice);
      // The engine reads this to know it is a region of someone else's page.
      window.RenguinSeamlessEmbed = { root: app, gate, toOffice };
      await Promise.all(SCRIPTS.map((name) => script("/static/world/" + name + q)));
      window.RenguinSeamlessWorld.start();
      watch();
    } catch (error) {
      // An unreachable world is a band of sky and a link, never a broken desk.
      booting.remove();
      app.dataset.status = "error";
      const box = el("div", "ow-booting");
      const link = el("a", "ow-gate-hint", { href: "/world/seamless", textContent: "Renguin World 暫時無法在這裡載入，開啟世界頁 →" });
      box.style.display = "grid";
      box.style.placeContent = "center";
      box.append(link);
      app.append(box);
      console.warn("[renguin-world] embed boot failed:", error);
    }
  }

  function toOffice() {
    smoothTo(0);
  }

  // ------------------------------------------------------- what is on screen
  // Two separate questions, two observers. "Near" decides when the world is worth
  // loading and when its band may animate; "holding the viewport" decides whether
  // the world's own chrome exists and whether its engine runs at all.
  const near = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        gate.toggleAttribute("data-onscreen", e.isIntersecting);
        if (e.isIntersecting) boot();
      }
    },
    { rootMargin: BOOT_MARGIN },
  );
  near.observe(gate);

  function watch() {
    const world = window.RenguinSeamlessWorld;
    const stage = app.querySelector(".sw-world");
    // Running and showing are different questions. The engine wakes a little before
    // the world is reached, so its layers are already where they belong when the
    // first of it appears; its chrome waits until the world actually holds the
    // screen, so no HUD floats over the desk on the way down.
    active = new IntersectionObserver(
      (entries) => {
        for (const e of entries) (e.isIntersecting ? world.resume : world.pause)();
      },
      { rootMargin: "40% 0px 40% 0px" },
    );
    active.observe(stage);
    chrome = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const on = e.isIntersecting;
          app.classList.toggle("is-active", on);
          // The Office's fixed scenery keeps painting behind an opaque world; while the
          // world holds the viewport it is only cost, so it stands down.
          document.documentElement.toggleAttribute("data-ow-world", on);
        }
      },
      // The world is the view once it reaches the top fifth of the screen — measured
      // against the top of the viewport, not the bottom, or a world this tall would
      // count as "here" from the moment its first pixel appeared.
      { rootMargin: "0px 0px -80% 0px" },
    );
    chrome.observe(stage);
  }

  // The desk's body is a padded, centred column. The world is the ground under it,
  // so it is pulled back out to the window's own edges — measured, because that
  // padding is the Office's to change and responsive.
  function gutters() {
    const cs = getComputedStyle(document.body);
    app.style.setProperty("--ow-gutter-x", cs.paddingLeft);
    app.style.setProperty("--ow-gutter-r", cs.paddingRight);
    app.style.setProperty("--ow-gutter-b", cs.paddingBottom);
  }

  // The Office can change the time of day while the page is open; the sky follows.
  const sky = () => {
    const now = daypart();
    if (app.dataset.daypart !== now) app.dataset.daypart = now;
  };

  const place = () => {
    document.body.append(app);
    gutters();
    sky();
    new MutationObserver(sky).observe(document.documentElement, { attributes: true, attributeFilter: ["data-env-time"] });
    window.addEventListener("resize", gutters, { passive: true });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", place, { once: true });
  else place();

  window.RenguinOfficeWorld = {
    root: app,
    gate,
    boot,
    booted: () => booted,
    toWorld: () => smoothTo(worldTop()),
    toOffice,
  };
})();
