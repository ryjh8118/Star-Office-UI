# Renguin World — seamless world architecture

Status 2026-09-15: `DIRECTION = APPROVED`, `VISUAL_ACCEPTANCE = PROVISIONAL`.
The structure below is the contract. Art quality is upgraded later in
`RENGUIN_WORLD_VISUAL_ENHANCEMENT_V2.md` without changing it.

The three structural conditions are enforced by `tests/world-seamless.test.cjs`
(unit) and `tests/visual/world-seamless-check.cjs` (real browser, 63 checks since the
district migration). `tests/visual/world-parity-check.cjs` holds the seamless world to
V1 on the same state.

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
| `residents` | 70 | street | 1 | authority character DOM; behind them the anonymous crowd (style-safe townsfolk, never a likeness) |
| `effects` | 80 | street | 1 | effect descriptors → compositor-only elements; residents' gossip bubbles |

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

Street layers are painted per district. `scene()` returns their art as `chunks`
(`{ district, x, width, svg }`), and the page mounts each chunk as one `.sw-chunk`
in its layer; residents, crowd, effects and hotspots are grouped into the same
per-district chunks. A chunk is the unit of culling and anchoring:

- culling: a district more than 60% of a screen away from the street's view has
  no `data-near`. Its painted chunks get `content-visibility: hidden`; its residents
  and effects chunks get `display: none` (animations under `content-visibility`
  keep ticking, so they must leave rendering instead).
- anchoring: a street layer chunk at depth d moves by `(scrollLeft − district start)
  × (1 − d)`, so each district's back and front rows sit exactly where they were
  drawn when the district's start is at the view's left edge. The main street starts
  at 0, so its movement is the slice's movement unchanged.
- far section layers (`sky`, `distant`) span the whole street; past the main street
  their art repeats as mirrored copies, only as far as their slower pan can show.

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
- District travel is the same street scrolled sideways: the district navigator
  (街區 chip, the drawer's 前往) calls `goToDistrict`, which scrolls the page down to
  the city if needed and pans the street scroller. The browser check walks every
  district this way and asserts the same URL and history.

## D. Buildings, light and growth (`frontend/world/seamless-buildings.js`)

Added by the V2 visual upgrade (2026-09-16). It paints inside the layer contract above;
the composition rule, the stacks, the mount and navigation are unchanged.

- **One lit kit for the whole street.** The main street and every district draw their
  buildings with `house()`: light from the upper left, a contact shadow thrown right, a
  darker side return, the era's wall material (patterns), eave shadow and ground
  occlusion, recessed windows (`<use>` symbols), a framed door, and a roof with a lit and
  a shaded plane. Awnings cast a shadow; chimneys, balconies, dormers, turrets and roof
  gardens are parts.
- **Rows give depth and density.** Each stretch has three rows: the street front
  (`buildings`, scale 1), a set-back row behind it (`buildings`, scale 0.8, lifted, light
  haze) and a hazy skyline (`backdrop`, scale 0.62, depth 0.7). Lots sit a few units apart,
  so a grown street reads as blocks; the main street keeps its plaza open to a landmark.
- **Evolution.** `grade(state)` is three steps per era (0 … 23) from the era and its
  progress. A lot has the grade it first stands at (`since`); its level is how far the
  world has grown past that, and the level adds width, a storey and parts. So when the
  world grows the buildings already standing upgrade, the era rebuilds every lot in its
  own material at once, and nothing is taken away. The engine's building count still
  decides how many lots are filled. The main street's plaza landmark is a different
  building per era (gathering tent, great hut, timber hall, clock tower, castle keep, TV
  tower, sky spire) and gains wings within its era; districts upgrade their own
  buildings (studio roof and mast, lighthouse gallery, hall columns and fly tower,
  hatchery egg tower and crown, Ferris wheel lights). `stats.evolution` lists every lot.
- **District identity.** Each district leans its walls and roofs toward its own palette,
  more so in later eras, and keeps its own props; a closed district shows the faint
  skyline it will become behind its fence.
- **Ground.** The shared ground adds a curb, an era retaining wall and an underground
  band that is rebuilt each era: root cellar and mine gallery, brick vaults, a subway,
  a glass tube. Lamps throw light pools on the road.
- **Day and night.** Windows carry a halo and lit glass whose opacity comes from
  `--swb-lit` / `--swb-halo`, set per daypart in CSS, so the SVG never changes. At night
  the painted city layers dim (`filter`), lit windows, lamp pools, bulbs and lanterns
  stay warm, and the fixed night tint is lighter than before.
- **Detail follows distance.** The street front gets every part; the set-back row uses a
  lighter window and drops small parts; the skyline paints each window as one shape
  (a `<use>` window is a dozen nodes in its shadow tree). Quoins and floor bands are one
  path per building.

## Motion budget

- No timers. Gossip bubbles advance on their own CSS animation's `animationiteration`,
  so a hidden tab, a paused world or reduced motion stops them for free.
- Animations pause outside the sections that are actually on screen (`data-onscreen`,
  no margin); culling and parallax keep the wider `data-near` margin.
- Chrome decides at animation start whether it can run on the compositor, and it
  refuses an element it judges invisible (`kAnimationHasNoVisibleChange`), which then
  ticks on the main thread forever. So a resident starts moving only after its image
  has loaded (`is-ready`), and animated elements paint their own box (a townsperson's
  sprite is the pawn's own background, bird wings are the animated pseudo-elements).

## Extending the world

A new district is a new stretch of the street (`frontend/world/seamless-districts.js`)
painting the declared street layers in its own coordinates; the mount, parallax,
culling, composition and lifecycle code do not change. The street follows the
registry: districts appear in unlock order, a closed district is a short lot that
shows the engine's unlock hint, and a district id the registry adds before the art
exists gets a generic stretch with its name. Residents are always placed by the page
from the engine's cast, never painted into a layer.
