# Renguin World — V2 visual world upgrade (2026-09-16)

Branch `claude/renguin-world-v2-visual-209238`, based on master `5784e85`. Scope: how
`/world/seamless` looks. The world API, the public/private boundary, data sync, the
seamless architecture (composition rule, layer stacks, navigation), V1 at `/world` and
the performance safeguards are unchanged. Production is not touched by this branch.

## What changed

| Area | Before | After |
| --- | --- | --- |
| Density | up to 4 front houses and 8 small back houses on a 2800-unit main street; one or two buildings per district | three rows per stretch (street front, set-back row, hazy skyline); lots a few units apart; Production's Lv.14 main street shows 6 front, 9 set-back and 14 skyline buildings |
| Light and depth | flat fills, one narrow side return | contact shadow, shaded return, wall material, eave shadow, ground occlusion, recessed windows with glass and sills, awning shadows, lit and shaded roof planes, atmospheric haze by row |
| Evolution | a building count and an era material swap | `grade()` = 3 steps per era; every lot upgrades with the world (width, storeys, chimney, balcony, dormer, turret, roof garden); a plaza landmark rebuilt per era that gains wings within it; district buildings upgrade too |
| Districts | one or two special buildings each | each district a block in its own palette with its own upgrades (studio roof and mast, waterfront row and dock crane, hall columns and fly tower, egg tower and crown, big top and lit wheel, launch tower and gate pylons); closed lots show the skyline they will become |
| Ground | flat soil strata | curb, era retaining wall, underground band rebuilt per era (mine gallery → brick vaults → subway → glass tube), lamp light pools |
| Night | flat tint over day colours | painted layers dim, windows glow with halos, lamp pools, bulbs and lanterns stay warm |
| Crowd | grey faceless pawns | style-safe townsfolk in role clothes, half a character's height, behind the residents |

Code: `frontend/world/seamless-buildings.js` (new), `seamless-art.js` (main street),
`seamless-districts.js` (districts, crowd roles), `seamless-app.js` (townsfolk sprite),
`seamless.css`, `seamless.html` (one script tag). Contract: section D of
[Renguin_World_Architecture.md](Renguin_World_Architecture.md); crowd rules in
[Renguin_World_Character_System.md](Renguin_World_Character_System.md).

## Character cut-outs

Every resident on Production is served as a transparent cut-out: alpha checked on all
nine live residents at 160 px and on three profession residents at 256 px. A worktree
that has not run `scripts/build_world_thumbnails.py` serves the permitted originals
(white page or chroma green) instead; the builder was run in this worktree with the
`RENGUIN_*` roots. Its public output was byte-identical to the committed derivatives, and
the private derivatives stay git-ignored.

## Validation

All on this worktree's Preview (`http://127.0.0.1:19119`), one headless Chrome tab.

| Check | Result |
| --- | --- |
| `node tests/world-seamless.test.cjs` | 18/18 (14 existing + 4 new: density, light, evolution, townsfolk) |
| all `tests/*.cjs` | 15 suites pass |
| `tests/test_world_engine.py`, `test_world_sources.py`, `test_world_youtube_sync.py` | OK |
| `tests/visual/world-seamless-check.cjs` | 64/64 |
| `tests/visual/world-parity-check.cjs` (simulated) | 77/77 |
| `tests/visual/world-parity-check.cjs --state` (read-only copy of Production's state) | 13/13 |
| `tests/visual/world-check.cjs` (V1) | 28/28 |
| `scripts/security_check.py` | OK |
| Viewports 1920×1080, 1366×768, 768×1024, 390×844, 375×667 | 0 console errors, 0 horizontal overflow, HUD, altimeter and district navigator unobstructed |

Before/after screenshots were taken on the same server with the same data and scroll
positions: the `HEAD` front end was served by request interception for "before". They
stay local QA evidence and are not committed (profession residents' art is private
identity).

## Performance (world-seamless-check baseline, sim=20 unless noted)

| Measure | Before main-thread ms/s | After | DOM nodes before | after |
| --- | --- | --- | --- | --- |
| desktop idle, island | 14.6 | 14.6 | 4089 | 9749 |
| desktop wheel scroll | 113.6 | 104.1 | 4089 | 9749 |
| desktop idle, city | 60.8 | 38.6 | 4089 | 9749 |
| phone idle, island | 12.4 | 13.6 | 3971 | 9682 |
| phone touch scroll | 105.8 | 103.9 | 3971 | 9682 |
| phone idle, city | 46.6 | 38.2 | 3973 | 9595 |
| desktop pan across all seven districts (sim=100, 60 jumps of 230 px) | 204.5 | 264.6 | 4370 | 16960 |
| desktop idle, far district (sim=100) | 15.5 | 11.5 | 4310 | 16960 |

Idle and scroll costs are equal or lower. The one regression is the synthetic whip-pan
across the whole grown street (+29%): each newly near district is laid out and rasterised
with about three times the art. A first cut was +89%; distance-based detail (one-shape
windows in the skyline, light windows in the set-back row, merged quoins and floor bands)
brought it down. Phone transfer after reaching the city fell from 2155 KB to 481 KB only
because this worktree now has the private derivatives; the art itself adds no requests.

## Not done here

- Merge into master, Production restart and Production acceptance: a separate release
  step (see [Renguin_World_Seamless_Master_20260915.md](Renguin_World_Seamless_Master_20260915.md)
  for how the last one ran). Production must rebuild nothing for this change; the private
  derivatives already exist there.
- Remaining V2 scope: weather, particles, animated residents, sound hooks.
