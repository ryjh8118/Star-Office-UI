# Renguin World — seamless world architecture

Status 2026-09-15: `DIRECTION = APPROVED`, `VISUAL_ACCEPTANCE = PROVISIONAL`.
The structure below is the contract. Art quality is upgraded later in
`RENGUIN_WORLD_VISUAL_ENHANCEMENT_V2.md` without changing it.

The three structural conditions are enforced by `tests/world-seamless.test.cjs`
(unit) and `tests/visual/world-seamless-check.cjs` (real browser, 45 checks).

## A. Camera composition rule (`frontend/world/world-composition.js`)

Pure function: `compose({ width, height, zoom })` → world scale and framing.

| Rule | Value |
| --- | --- |
| Safe area | 72 px below the top (HUD); 24 px above the bottom, 64 px on a compact screen (bottom altimeter) |
| Compact | width ≤ 720 **and** height ≥ 481 (a portrait phone); a landscape phone keeps side controls |
| Island focus band | world units 140–620: the Star Office star to the crew's name tags |
| City focus band | world units 430–836: rooftops to the residents' name tags |
| Scale by width | `clamp(0.45 + width / 2600, 0.7, 1)`: readable on a phone, full size on a desktop |
| Scale by height | usable height ÷ the taller focus band, so short screens still fit both bands |
| World scale | `clamp(min(byWidth, byHeight), 0.55, 1.25) × zoom` |
| Island lead | extra or trimmed sky above the island so its band is centred in the safe area at scroll 0 |
| City height | soil kept below the street so its band is centred when the page bottoms out (art is 1080 units; soil colour continues past it, up to 1700) |
| Island crew | spots squeeze toward the Office until every resident fits the width |
| Zoom (A− / A+) | multiplies the result; an accessibility enlargement allowed to break framing |

Verified in a real browser at 1920×1080, 1440×900, 1280×720, 1024×768,
768×1024, 390×844, 360×640, 844×390 and 667×375: island and street residents are
inside the safe area, never under 80 px, with no horizontal overflow. Below
667×375 (e.g. 568×320) the bands may clip; residents stay ≥ 83 px.

## B. Layer architecture (`frontend/world/seamless-art.js#scene`)

The scene is a list of sections; each section declares its layer stack in
`LAYER_STACKS`. The page (`seamless-app.js#mount`) mounts any stack generically
and moves layers by one rule — it never redraws them.

Renguin City:

| Layer | z | Host | Depth | Holds |
| --- | --- | --- | --- | --- |
| `sky` | 10 | section | 0.15 | clouds, kites |
| `distant` | 20 | section | 0.35 | mountains, hills, far houses, era skyline |
| `backdrop` | 30 | street | 0.7 | older back-row houses, trees, clock tower |
| `buildings` | 40 | street | 1 | station, homes, plaza, market, construction; hotspots |
| `street` | 50 | street | 1 | road surface, bridge and stream, soil |
| `foreground` | 60 | street | 1.18 | tufts, flowers, bushes, fence — below residents |
| `residents` | 70 | street | 1 | authority character DOM |
| `effects` | 80 | street | 1 | effect descriptors → compositor-only elements |

The sky cable is `CABLE_Z = 55`: above street buildings and the cloud sea, below
residents and the near clouds.

Contract for every layer: a unique name, a z on steps of ten (room for weather,
lighting, particles), a host (`section` layers may rise past the street into
the clouds; `street` layers pan with the street), a depth (parallax factor), a
kind (`svg` painted by the art, `dom` filled by the page) and a cull flag.
Movement rule: section layers lag vertically by depth, and in a street section
also sideways; street layers slide sideways only. Reduced motion removes
parallax. Every layer can be switched on its own: `RenguinSeamlessWorld.setLayer
('city.buildings', false)`, `RenguinSeamlessWorld.layers()`, or `?hide=
city.foreground,city.effects` for QA and art passes.

Island: `sky, terrain, buildings, residents, effects`. Descent: `distant,
clouds-far, clouds-mid, effects, cloud-sea, clouds-near`.

## C. Seamless navigation

- One document, one route. Island → clouds → city is page scroll; altitude jumps
  (altimeter, 往下探索, 回到空島) are `scrollTo` on the same page; the street pans
  inside a native scroller. No route change, history entry, reload or fade.
- Sections touch with no gap and each sky gradient starts on the colour the one
  above ends with.
- Sections create no stacking context, so the single world-level cable crosses
  all of them and its gondola rides with the scroll from station to station.
- The browser check walks the journey by wheel and by altimeter and asserts the
  same URL, the same history length, one navigation entry, no pagehide, zero
  seams and identical seam colours.

## Extending the world

A new district is a new section (or a longer street) with its own declared
stack; the mount, parallax, culling, composition and lifecycle code do not
change. Residents are always placed by the page from the engine's cast, never
painted into a layer.
