/* Renguin World camera and interaction utilities, shared by world views.
 *
 * Generic on purpose: math for bounded cameras, one-callback-per-frame
 * batching, mouse drag-to-pan for native scrollers (touch keeps the browser's
 * own momentum), and motion that respects prefers-reduced-motion. Nothing here
 * runs until a view calls it, and every binding returns its own dispose.
 */
(function (root) {
  "use strict";
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const reducedMotion = () => Boolean(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches);

  // Distance of an anchor edge from the viewport's matching edge; 0 is the composed view.
  function anchorOffset(anchor, top, height, scroll, viewport) {
    if (anchor === "top") return top - scroll;
    if (anchor === "bottom") return top + height - (scroll + viewport);
    return top + height / 2 - (scroll + viewport / 2);
  }

  // A layer at depth d moves d times as fast as the content it sits in.
  const parallax = (offset, depth) => -offset * (1 - depth) + 0;

  // Keep a 1-D camera inside [0, content - viewport]; centre it when the content is smaller.
  function bound(position, content, viewport) {
    return content <= viewport ? (content - viewport) / 2 : clamp(position, 0, content - viewport);
  }

  function frameBatch(fn) {
    let id = 0;
    const schedule = () => {
      if (!id) id = root.requestAnimationFrame(() => ((id = 0), fn()));
    };
    schedule.cancel = () => {
      if (id) root.cancelAnimationFrame(id);
      id = 0;
    };
    return schedule;
  }

  function dragPan(scroller, { threshold = 6, ignore = "button, a, input, [data-no-pan]" } = {}) {
    let start = null,
      dragged = false;
    const down = (e) => {
      if (e.pointerType !== "mouse" || e.button !== 0 || e.target.closest(ignore)) return;
      start = { x: e.clientX, left: scroller.scrollLeft, id: e.pointerId };
      dragged = false;
    };
    const move = (e) => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x;
      if (!dragged && Math.abs(dx) < threshold) return;
      if (!dragged) {
        dragged = true;
        scroller.setPointerCapture(e.pointerId);
        scroller.classList.add("is-dragging");
      }
      scroller.scrollLeft = start.left - dx;
    };
    const up = (e) => {
      if (!start || e.pointerId !== start.id) return;
      if (dragged) scroller.releasePointerCapture?.(e.pointerId);
      scroller.classList.remove("is-dragging");
      start = null;
    };
    // A drag never turns into a click on whatever was under the pointer.
    const click = (e) => {
      if (dragged) {
        e.stopPropagation();
        e.preventDefault();
        dragged = false;
      }
    };
    scroller.addEventListener("pointerdown", down);
    scroller.addEventListener("pointermove", move);
    scroller.addEventListener("pointerup", up);
    scroller.addEventListener("pointercancel", up);
    scroller.addEventListener("click", click, true);
    return () => {
      scroller.removeEventListener("pointerdown", down);
      scroller.removeEventListener("pointermove", move);
      scroller.removeEventListener("pointerup", up);
      scroller.removeEventListener("pointercancel", up);
      scroller.removeEventListener("click", click, true);
    };
  }

  function scrollTo(target, options) {
    target.scrollTo({ ...options, behavior: reducedMotion() ? "instant" : "smooth" });
  }

  const api = { clamp, lerp, ease, reducedMotion, anchorOffset, parallax, bound, frameBatch, dragPan, scrollTo };
  root.RenguinWorldCamera = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
