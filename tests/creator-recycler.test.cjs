const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Checkouts with core.autocrlf=true carry CRLF; the layout assertions below are written with LF.
const read = (name) => fs.readFileSync(path.join(__dirname, "../frontend", name), "utf8").replace(/\r\n/g, "\n");
const office = read("creator-office.js");
const slice = (from, to) => office.slice(office.indexOf(from), office.indexOf(to, office.indexOf(from) + from.length));

test("removing asks nothing and writes nothing until the undo window closes", () => {
  const remove = slice("function removeProject(p)", "function showUndo()");
  assert.doesNotMatch(remove, /modal\(|save\(/, "no confirm dialog and no write at the moment of removal");
  assert.match(remove, /pendingRemoval\.set\(p\.project_id/);
  assert.match(remove, /setTimeout\(commitRemovals, UNDO_MS\)/);
  assert.doesNotMatch(office, /function confirmRemove/, "the old confirm dialog is gone");
  const undo = slice("function undoRemovals()", "async function commitRemovals()");
  assert.doesNotMatch(undo, /save\(|fetch\(/, "復原 is exact because nothing was ever written");
  const commit = slice("async function commitRemovals()", "window.addEventListener?.(\"pagehide\"");
  assert.match(commit, /save\("project", \{ project_id: id, hidden: true, confirmed: true \}\)/, "the commit is the same hide 移除專案 always made");
  assert.match(commit, /沒有移除成功，已放回原處/, "a failed write puts the card back and says so");
  assert.match(office, /primary\(\)\.filter\(\(p\) => !pendingRemoval\.has\(p\.project_id\)\)/, "a pending card leaves the desk at once");
  assert.match(office, /\[\.\.\.pendingRemoval\.keys\(\)\],/, "pending removals are part of the render signature");
  assert.match(office, /已移除專案「/);
  assert.match(office, /button\("復原", undoRemovals/);
});

test("only a release inside the recycler's core removes", () => {
  const recycler = slice("function stardustRecycler()", "function startDrag(");
  assert.match(recycler, /const pull = d <= core \? 1 : Math\.max\(0, Math\.min\(0\.95,/, "the rim pulls but never arms");
  const end = slice("async function onDragEnd(e)", "function projectSorting(");
  assert.match(end, /endDrag\(trash\);\s*if \(trash\) removeProject\(p\);\s*else if \(copy\) await copyToShort\(p\);/);
  const move = slice("function onDragMove(e)", "function endDrag(");
  assert.match(move, /const overTrash = pull >= 1;/, "armed is recomputed on every move, so dragging back out disarms");
  assert.match(move, /!overTrash && copies && !!hovered/, "an armed recycler outranks the copy target beneath it");
  assert.doesNotMatch(office, /mouseover[^\n]*removeProject|pointerenter[^\n]*removeProject/, "hovering never removes");
});

test("a finger has to mean it: long press, slop, and a page that holds still", () => {
  assert.match(office, /const LONG_PRESS_MS = 420,\s*PRESS_SLOP = 10,\s*MOUSE_SLOP = 6;/);
  const bind = slice("function bindCardDrag(card)", "function stardustRecycler()");
  assert.match(bind, /if \(far > PRESS_SLOP\) off\(\);/, "a finger that moves before the press is a scroll");
  assert.match(bind, /e\.target\.closest\(CARD_CONTROLS\)/, "buttons, links and inputs on the card keep their own job");
  assert.match(bind, /if \(card\.dataset\.dragBound\) return;/, "a card is bound once however often it re-renders");
  assert.match(office, /addEventListener\("touchmove", holdPage, \{ passive: false \}\)/);
  assert.match(office, /navigator\.userActivation\?\.hasBeenActive/, "no refused vibration logs to the console");
});

test("every listener a drag adds, its end removes", () => {
  const start = slice("function startDrag(card, e, capture)", "function holdPage(e)");
  const end = slice("function endDrag(swallowed)", "function cancelDrag()");
  for (const [event, handler] of [...start.matchAll(/addEventListener\("(\w+)", ([\w.]+)/g)].map((m) => [m[1], m[2]]))
    assert.ok(end.includes(`removeEventListener("${event}", ${handler}`), `${event} ${handler} is removed when the drag ends`);
  assert.match(end, /recycler\.el\.remove\(\)/);
  assert.match(end, /dragging = false;/, "live updates resume after a drag");
});

test("keyboard and screen-reader users can remove without expanding the card", () => {
  const sorting = slice("function projectSorting(", "function expandToggle(");
  assert.match(sorting, /\["Delete", "Backspace"\]\.includes\(e\.key\)/);
  assert.match(sorting, /button\("🗑", \(\) => removeProject\(p\)/, "a visible remove control rides the sort bar");
  assert.match(sorting, /recycle\.setAttribute\("aria-label", "移除「"/);
  for (const layout of ["pin, recycle)", "recycle,\n      );", "pin, recycle);"])
    assert.ok(sorting.includes(layout), "the remove control is on every shelf's bar: " + layout);
  const css = read("creator-office.css");
  assert.match(css, /\.co-trash \{[\s\S]*?pointer-events: none;/, "the recycler never intercepts a drop target");
  const reduced = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduced, /\.co-trash-disk,\s*\.co-trash-mote,\s*\.co-project\.is-pressing \{\s*animation: none;/);
});
