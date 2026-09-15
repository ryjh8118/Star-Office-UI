# Renguin World — Seamless district migration (2026-09-15)

Status: **merged into master and live on Production** at `/world/seamless` (release record:
[Renguin_World_Seamless_Master_20260915.md](Renguin_World_Seamless_Master_20260915.md)).
Built and first verified in Preview on branch
`claude/renguin-world-seamless-migration-feddec`. The structure contract
(`Renguin_World_Architecture.md`, A/B/C) is unchanged; V1 `/world` is unchanged
and remains the Production default and the rollback. Art stays PROVISIONAL
(`RENGUIN_WORLD_VISUAL_ENHANCEMENT_V2.md`).

## What moved onto the seamless world

Renguin City is one street that grows outward in unlock order. Every row of
`config/districts.json` is on it; nothing about unlocking changed.

| District | Open width | Closed | What it shows from the state | Hotspots (card) |
| --- | --- | --- | --- | --- |
| 主城區 | 2800 | — | the slice's street (station, era homes, plaza, poster, market, stream, construction), tall grass when dormant | 主城區 signpost, poster → 精選影片 |
| 創作者街區 | 1800 | 1000 | studio with ON AIR lamp (lit when `STUDIO` is active), offices by building height, the Star Office star lamp, creator totem (landmark) | 拍攝棚, 辦公室 |
| 旅行港區 | 2200 | 1000 | the street crosses a river on a bridge (wood, stone from the town era); one boat per travel content (max 6); hotel; lighthouse | 碼頭, 旅館 |
| 影片大廳 | 1700 | 1000 | RENGUIN HALL, marquee, up to three featured posters (NEW marks), dome (landmark), spotlights when `PREMIERE` is active | 首映廳, posters → 精選影片 |
| 鵝寶會員區 | 1800 | 1000 | hatchery, tier banners sized by the aggregate member counts, population on the signpost | 孵蛋所 |
| 娛樂夜市區 | 1900 | 1000 | stage (spotlights when `STAGE` is active), night market stalls and lanterns, Ferris wheel | 舞台, 夜市 |
| 星港之門 | 1400 | 1000 | the gate ring at the street's end | 星港之門 |
| (any future registry id) | 1400 | 1000 | a generic stretch with its name | the district |

A closed district is a fenced lot with a signboard: name, 未解鎖 / 施工預告 and the
engine's `unlock_hint`. Nobody stands in it and no crowd walks there.

Navigation stays one page: the 街區 chip (bottom centre on desktop, under the HUD
on a portrait phone) lists every district with its status and pans the street
there; the drawer's 街區 panel has 前往 for each. Every district has a place card
(status, crowd, content count, last 30 days, active hotspots, and boats, member
population or unlock condition where they apply).

## V1 feature and data parity

Everything V1 shows is in the seamless world: era card with tagline, city status
with facts, events and 再放一次煙火, content counts, featured videos with YouTube
status, recent growth, the era road, districts, residents' gossip (bubbles on the
street plus the full list), the lazily loaded roster, the QA simulator, data
sources, 重新整理, 暫停動態, source label, confetti and fireworks, the crowd, tall grass,
and a retry on read failure.

`tests/visual/world-parity-check.cjs` renders the same state in both views and
compares them value by value: 77/77 across seven simulated worlds (empty, camp,
riverside, kingdom, starport, deep dormant, revival), and 13/13 on a read-only copy
of Production's public state (Lv.14 河畔聚落, 20 contents, three open districts),
including 重新整理 requesting `?refresh=1`.

## Character Authority

Unchanged rules, now per district: only `CANONICAL_CHARACTER` and
`PROFESSION_CHARACTER` images stand in the world; each resident stands in the
district the engine placed them in when it is open, otherwise on the main street;
profession residents are labelled by `world_role`. The roster shows only public,
resolved characters with an authority image. `python -m renguin_world residents`
is unchanged: TOTAL 60 · CANONICAL 37 · PROFESSION 14 · PLACEHOLDER 4 · UNRESOLVED 5
· GENERIC_WRONG 0. The crowd is `NEUTRAL_PLACEHOLDER` pawns only.

## Public / Private boundary

- The page reads only the public view (`/api/world/state`, `/api/world/simulate`);
  a unit test fails if it asks for `audience=local` or touches content ids,
  evidence, overrides or skipped rows.
- `/api/world/characters` exposes no file path or member name; unresolved member
  icons appear only as opaque `MEMBER_ICON_<hash>` ids.
- All 15 non-public characters return 404 from both `character-thumb` and
  `character-asset`.
- Member data reaches the world only as the aggregate population and tier counts.

## Performance

Headless Chrome 152, software raster, 1440×900 (phone 390×844 DPR 2),
`node tests/visual/world-seamless-check.cjs`:

| Moment | main thread ms/s | layouts/s | DOM nodes |
| --- | --- | --- | --- |
| desktop idle, island | 15.3 | 0 | 4089 |
| desktop wheel scroll | 105.7 | 5.5 | 4089 |
| desktop idle, main street (sim=20, festival effects still running) | 54.8 | 0 | 4089 |
| desktop idle, far district | 13.9 | 0 | 4316 |
| desktop pan across all seven districts (scripted, 60 steps/s) | 195.6 | 37.5 | 4316 |
| desktop hidden tab | 6.1 | 0 | — |
| phone idle, island / city | 12.9 / 34.6 | 0 / 0.3 | 3971 |
| phone touch scroll | 103.6 | 2.1 | 3971 |

Phone transfer after reaching the city: 438 KB. Idle per district at sim=100
(no festival): 7–28 ms/s.

Honest note on the slice's baseline: its documented 1.0 ms/s idle could not be
reproduced. Serving `6b45efb`'s own front end into the same page today measured
~100 ms/s idle at the city with 120 style recalcs/s. The cause was
Chrome refusing to composite animations it judged invisible (lazy resident images
not yet loaded, boxes painted only by pseudo-elements, off-screen sections), which
then run on the main thread. Fixed here for the whole world (see Architecture →
Motion budget); the same measurement at sim=100 went from 98.5 to 6.6 ms/s.

## Regression (this branch, 2026-09-15)

| Suite | Result |
| --- | --- |
| Python (`tests/test_*.py`, with the four RENGUIN_* variables) | 166/166 |
| Node (`tests/*.cjs`) | 104/104 |
| Seamless browser check | 63/63 |
| Parity, simulated / real state | 77/77 / 13/13 |
| V1 browser check (`tests/visual/world-check.cjs`) | 28/28 |
| `scripts/security_check.py` | OK (local FLASK_SECRET_KEY / ASSET_DRAWER_PASS warnings only) |

Not run on this branch, on purpose: `tests/visual/world-art-audit.cjs` (writes into
the tracked visual-upgrade evidence) and `tests/visual/world-production-acceptance.cjs`
(Production acceptance belongs after a merge is approved).

## Known limits

- Only headless desktop/phone emulation; no physical-device or GPU profiling.
- The scripted pan across all districts is layout-heavy (a district entering view is
  laid out once); real wheel and touch pans stay near the slice's numbers.
- District art is provisional paper craft; notes for V2 are in
  `RENGUIN_WORLD_VISUAL_ENHANCEMENT_V2.md`.
