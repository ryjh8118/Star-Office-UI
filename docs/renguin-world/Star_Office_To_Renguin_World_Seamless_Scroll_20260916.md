# STAR_OFFICE_TO_RENGUIN_WORLD_SEAMLESS_SCROLL_V1

One scroll from the desk to the city. Recorded 2026-09-16 from the branch
`claude/star-office-renguin-seamless-scroll-b849ef`, base `5c0a2e6` (Production).

## What changed

The Office's own scroll continues past the bottom of its sky island, through a
band of cloud that dissolves the Office's sky into the world's, into Renguin
World's island, cloud sea and street. The world is a region of the Office's
document: no route, no reload, no button that swaps one view for another. The
scrollbar is the only thing that moves.

| | |
| --- | --- |
| new | `frontend/world/office-gate.css`, `frontend/world/office-world-bridge.js`, `frontend/world/seamless-page.css`, `tests/visual/office-world-seamless-check.cjs` |
| changed | `frontend/world/seamless.css` (scoped to `.sw-app`), `frontend/world/seamless-app.js` (embed mode, cable origin), `frontend/world/seamless.html`, `frontend/index.html`, `backend/app.py`, `tests/visual/world-check.cjs` |
| unchanged | V1 `/world`, `/world/seamless`, every project surface of the desk, the Content OS boundary |

`/world/seamless` is still the standalone world and still the rollback: nothing
about it changed except where its page-level rules live.

## Four things it had to stop assuming

1. **`seamless.css` owned the document.** Its `:root`, `*`, `html`, `body`,
   `[hidden]` and `:focus-visible` rules would have reset the desk's font,
   painted its background soil-brown and changed its focus rings. Every rule is
   now scoped to `.sw-app`; what the standalone page needs from `html` and `body`
   moved to `seamless-page.css`, which only that page loads.
2. **`offsetTop` was a page coordinate.** Embedded, the world's root is
   positioned, so a section's `offsetTop` is measured from the world rather than
   from the document — which broke parallax anchoring, altitude and every jump.
   One rect read per scroll frame, taken before any transform is written, gives
   the world's own start on the page; standalone that is zero and the arithmetic
   is unchanged.
3. **A rescale moved the scroll.** `applyScale` restored the reader's position
   by scrolling the document. Embedded, that document is the Office's, so a zoom
   would have thrown the reader out of the world. It no longer moves anything.
4. **The sky cable hung off the page.** The cable and gondola are absolutely
   placed inside the world stage but both ends were measured against the page.
   Standalone the two agree; embedded, the cable was drawn a whole Office below
   the wheels it joins and the gondola never appeared in the cloud sea. The
   wheels are still measured against the page — the gondola's progress is a
   question about where the reader is — and converted to the stage before writing.

## What the desk pays

`office-gate.css` and `office-world-bridge.js`, about 19 kB: one masked band of
sky, two cloud layers, no script beyond the loader. No world stylesheet, no art,
no engine and no world state until the reader is within a screen and a half of
the band. The band's own clouds and its hint stay still until it is on screen,
because Chrome runs an animation it judges invisible on the main thread.

`?world=off` restores the desk exactly as it was — nothing appended, no band, no
root. That is how the cost below was measured, and it is the switch if the way
down ever misbehaves.

## Acceptance — Preview 19119, 2026-09-16

`node tests/visual/office-world-seamless-check.cjs http://127.0.0.1:19119` —
**39/39**. It walks the real page against whatever data the server has and never
simulates a world to make a check pass.

| | |
| --- | --- |
| desk at load | band only; no world CSS, engine, sections or `/api/world/*` |
| scrolling the desk | never reaches for the world |
| approaching it | loads the engine once, reads world state once |
| the page | `island`, `descent`, `city` as sections of `/?intro=off`, one navigation entry, no reload |
| growth | below the reader; the band never moves |
| the seam | worst step **4/255**; entering 3, leaving 3; no unpainted white anywhere on the descent |
| arriving | `zone: city`, residents on the street, chrome up, the desk's fixed scenery stood down |
| the cable | joins its two wheels, 0 px off |
| going back | `scrollY` 0, same URL, one navigation entry, world paused, nothing animating |
| phone (390×844) | the same one scroll, composed compact, no horizontal overflow |

The seam is measured, not asserted: the check screenshots a strip of the page and
reads the pixels back through the page's own canvas.

World function inside the Office — every panel is `position: fixed`, which is
exactly what embedding breaks: 世界資料, the resident card, district travel, zoom
and the time of day all open where the reader is. Zoom rescales the world without
taking the desk's scroll with it. Residents draw from the small cut-out at the
world's own scale and the large one only when zoomed close (measured before
anything zooms — that upgrade is one-way).

## Performance

Measured by alternating the two variants of the same page three times each and
comparing medians, because on a working machine a single wall-clock measurement
of the same code swung 178 → 294 ms/s between runs.

| | with the way down | without | change |
| --- | --- | --- | --- |
| idle, frames per second | 120 | 120 | **0%** |
| idle, style recalcs /s | 119.1 | 119.7 | −0.5% |
| idle, script ms/s | 17.3 | 18.8 | −8.0% |
| scrolling, frames per second | 119 | 119 | **0%** |
| scrolling, style recalcs /s | 287.7 | 287.3 | +0.1% |
| scrolling, script ms/s | 35.7 | 35.1 | +1.7% |

A separate three-run study of the whole page gave idle +1.0% and scrolling +1.5%
of wall-clock main-thread time. Frames — what "the character still walks" and
"scrolling still feels the same" actually mean — are identical.

For scale: Production at rest, with none of this, costs **251 ms/s** of main
thread. That is the desk's own pre-existing cost and this change neither adds to
it nor addresses it.

Down in the world: the descent costs 962 style recalcs/s, against 932 for the
same descent on the standalone `/world/seamless` — the world in the Office does no
more work than the world on its own page. At rest at the desk afterwards, nothing
in the world is animating and its scroll work returns immediately.

## Regression — Preview 19119

| | |
| --- | --- |
| Node suites | 15/15 |
| Python suites | 14/14 (166 assertions) |
| `world-seamless-check.cjs` (standalone world) | 64/64 |
| `world-check.cjs` (V1) | 28/28 |
| `world-parity-check.cjs` | 77/77 |
| `scripts/security_check.py` | OK |

`world-check.cjs` asserted that the Office loads *nothing* of the world. That was
the boundary until the desk's own scroll started carrying on into it; the check
now names the two files it may load and refuses a mounted world on the desk.

## Still to do

Production acceptance of the way down, in a real browser on 19000, after the merge.
