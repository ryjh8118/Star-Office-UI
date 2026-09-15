# Renguin World — Seamless side-view vertical slice (2026-09-15)

Status: **VISUAL DECISION GATE**. The slice exists to decide the direction; it is
not the full world. V1 (`/world`, isometric island) is unchanged and stays the
default and the fallback.

## What it proves

`/world/seamless` is one vertical world that the page itself scrolls through:

1. **Star Office sky island** — a paper-cut floating island with the Office
   (the building links to `/`), and the Star Office crew from the day's cast.
2. **Cloud descent** — layered cloud banks at five depths, distant paper
   islands, a balloon, birds. A cable car runs from the island's station to the
   street's station and its gondola rides down with the scroll.
3. **Renguin City, 主城區** — one real street: the arriving cable-car station,
   era houses (V1's era palette and building kinds), plaza (campfire before the
   town era, fountain after), a poster board for the newest video, market or
   cart, a stream under a bridge from the riverside era, and the construction
   site while the city is still growing. The street pans sideways.

Navigation is native scroll: wheel/trackpad or swipe down, swipe/drag or ‹ › along
the street. Zoom (A− / A+) is secondary and only rescales the world. A small
altimeter (空島 · 雲海 · 城市) jumps between altitudes. The data dashboard is a
drawer (世界資料, or the poster board), not a panel beside the world.

## Residents

5–10 residents, placed by `seamless-art.js#cast` from the engine's day cast:
up to three Star Office crew on the island, up to seven on the street with
profession residents first. Only `CANONICAL_CHARACTER` and
`PROFESSION_CHARACTER` images are shown; placeholders and unresolved images are
never placed. Labels are the authority's: profession residents by profession
(護理師居民), never by member name. Residents are 150 world units tall
(150 px on a desktop, ~105 px on a phone) with name tags; the foreground layer
sits below them so nothing covers a character. Click or tap opens a card with
known facts only (district, current state, source authority).

## Structure

| File | Role |
| --- | --- |
| `frontend/world/seamless.html` | page shell, HUD, altimeter, card, drawer |
| `frontend/world/seamless-art.js` | pure: state → layered SVG strings, shared `<symbol>` kit, cast placement |
| `frontend/world/seamless-app.js` | mount, parallax, cable car, street pan, card/drawer, lifecycle |
| `frontend/world/seamless.css` | world scale `--ws`, layers, day/dusk/night palettes |
| `frontend/world/world-camera.js` | reusable camera utilities (anchored parallax, bounds, frame batching, drag-to-pan, reduced-motion scroll) |
| `backend/renguin_world/routes.py` | `GET /world/seamless` |

No data authority changed: the slice reads the same `/api/world/state`
(or `?sim=`) as V1 and the same character thumbs.

## Performance

- One state request; images `loading="lazy"`; the cloud and paper kit are
  `<symbol>`s reused with `<use>`.
- Layers move by `transform` once per animation frame of a scroll burst, and a
  transform is written only when it changed. Sections away from the viewport
  (IntersectionObserver, 60% margin) get no parallax work, their decorative
  layers are hidden and their animations paused.
- All motion is CSS transform/opacity; a hidden tab pauses it; reduced motion
  removes parallax and animation while exploration keeps working.
- `pagehide` releases listeners, observers, requests and the DOM.

Baseline (headless Chrome, software raster, `?sim=20`,
`node tests/visual/world-seamless-check.cjs <preview>`):

| Moment | main thread ms/s | layouts/s | DOM nodes | JS heap |
| --- | --- | --- | --- | --- |
| desktop idle, island | 1.4 | 0 | 2202 | 0.9 MB |
| desktop continuous wheel scroll | 98 | 3.2 | 2202 | 1.0 MB |
| desktop idle, city | 1.0 | 0 | 2202 | 0.9 MB |
| desktop hidden tab | 3.2 | 0 | — | — |
| phone idle, island | 0.9 | 0 | 2202 | 1.0 MB |
| phone continuous touch scroll | 83 | 1.1 | 2202 | 1.0 MB |
| phone idle, city | 0.9 | 0 | 2202 | 1.1 MB |

Phone transfer after reaching the city: ~415 KB.

## Acceptance run

- `tests/world-seamless.test.cjs` — cast rules, labels, art never draws a
  character, era and growth on the street, camera math, V1 isolation.
- `tests/visual/world-seamless-check.cjs` — 29/29: single load, island start,
  descend, wheel scroll, altimeter, culling, readable residents, bounded drag
  pan, resident card, poster → drawer, zoom without overflow, time of day,
  hidden-tab pause, pagehide cleanup, reduced motion, phone swipe down and
  sideways, zero console errors, V1 still renders.
- V1 `tests/visual/world-check.cjs` 28/28; all Node and Python suites pass.

The gate screenshots also rendered Production's real world state (Lv.14 河畔聚落)
by feeding its read-only `/api/world/state` response into the Preview page, with
this branch's character resolution applied. Production itself was not changed.

## Not in the slice

Other districts (創作者街區, 旅行港區, 影片大廳, 鵝寶會員區), district-to-district
travel, the isometric world camera, member onboarding. The isometric camera
work is paused; `world-camera.js` keeps the reusable parts.

If the direction is approved, the next step is migrating districts as further
streets and platforms on the same vertical world. If not, V1 and all character
authority work stay as they are.
