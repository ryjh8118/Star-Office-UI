/* Rooms take the stage as they scroll into view and leave it as they scroll out,
   in either direction. Decoration only: it reads no work state and writes nothing. */
((scope) => {
  "use strict";
  // The stage is the viewport less a strip at the top and the bottom, so a room
  // has visibly arrived before it lights up and visibly goes as it leaves.
  const EDGE = 0.1;

  function onStage(rect, height, edge = EDGE) {
    return rect.bottom > height * edge && rect.top < height * (1 - edge);
  }
  // Off stage, a room is wholly past one edge; its middle says which.
  function side(rect, height) {
    return rect.top + rect.height / 2 > height / 2 ? "below" : "above";
  }

  const api = { EDGE, onStage, side };
  scope.CreatorTransitions = api;
  if (typeof module !== "undefined") module.exports = api;
  if (typeof document === "undefined" || typeof IntersectionObserver !== "function") return;

  const watched = new WeakSet();
  const height = () => window.innerHeight || document.documentElement.clientHeight;
  // The side is kept while on stage, so a room leaves the way it came until the
  // scroll direction says otherwise.
  function place(el, where) {
    if (where) el.dataset.stageSide = where;
    el.classList.toggle("is-on-stage", !where);
  }
  // Settle without animating: first paint, and jumps the page makes on purpose.
  function settle(el, where) {
    el.classList.add("is-stage-instant");
    place(el, where);
    void el.offsetHeight;
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove("is-stage-instant")));
  }
  // A fast fling or a jump can carry a hidden room clean past the stage with no
  // report in between, so it would come back from the side it left by. Before it
  // enters, turn it to face the way it is really coming from.
  function turn(el, where) {
    el.classList.add("is-stage-instant");
    el.dataset.stageSide = where;
    void el.offsetHeight;
    el.classList.remove("is-stage-instant");
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const el = entry.target,
          from = side(entry.boundingClientRect, height());
        if (!entry.isIntersecting) place(el, from);
        else {
          if (!el.classList.contains("is-on-stage") && el.dataset.stageSide !== from) turn(el, from);
          place(el, null);
        }
      }
    },
    { rootMargin: `-${EDGE * 100}% 0px -${EDGE * 100}% 0px` },
  );

  function watch(el) {
    if (!el || watched.has(el)) return;
    watched.add(el);
    el.classList.add("co-stage");
    const rect = el.getBoundingClientRect();
    settle(el, onStage(rect, height()) ? null : side(rect, height()));
    observer.observe(el);
  }
  // Before scrolling to a room, bring it on stage at once: a scroll aimed at a
  // box still sliding in would land short by the length of the slide.
  function show(el) {
    const room = el?.closest?.(".co-stage");
    if (room && !room.classList.contains("is-on-stage")) settle(room, null);
  }
  Object.assign(api, { watch, show });
})(typeof window === "undefined" ? globalThis : window);
