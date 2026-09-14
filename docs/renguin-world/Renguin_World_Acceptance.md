# Renguin World V1 — Acceptance

Run on 2026-09-15. Production = `http://127.0.0.1:19000` after merge `4611dd7`
and a restart with all four `RENGUIN_*` variables. Preview = `http://127.0.0.1:19119`
from the feature worktree.

## Result

**PASS** — World V1. **YouTube Live Sync: GATED** (no YouTube Data API key; the
OAuth token in `Renguin_World/02_Sync` is scoped to channel memberships and is not
used).

## Evidence sources

| Suite | Command | Result |
| --- | --- | --- |
| Engine | `.venv/Scripts/python.exe -X utf8 tests/test_world_engine.py` | 18 tests OK |
| Sources, registries, routes, YouTube | `.venv/Scripts/python.exe -X utf8 tests/test_world_sources.py` | 12 tests OK |
| Renderer and Office isolation | `node tests/world-scene.test.cjs` | 8 tests OK |
| Real browser, Production | `node tests/visual/world-check.cjs http://127.0.0.1:19000 --live` | 29/29 PASS |
| Real browser, Preview | `node tests/visual/world-check.cjs http://127.0.0.1:19119 --live` | 29/29 PASS |
| Full regression | `for f in tests/*.cjs …; for f in tests/test_*.py …` | 14 Node files, 11 Python files — all pass (see note) |

Note: `tests/creator-recycler.test.cjs` failed before this work on any
`core.autocrlf=true` checkout, including the canonical one (its layout
assertions are written with LF). It now normalises CRLF and passes.

## Production reconciliation (before → after restart)

| Check | Before | After |
| --- | --- | --- |
| `/api/creator/presentation` | revision 209 · 180 projects · 34 removed · 12 local | identical |
| `/api/renguin/projects` | STALE · 382 projects | identical |
| `/api/renguin/operations` `native_coverage` | present (5 agents) | present (5 agents) |
| Office home in a real browser | 20 cards · 工作紀錄 299 筆 · 5 個分類 · 0 console errors | identical, plus the Renguin World link |
| Canonical checkout foreign staged files | app.py, index.html, extension.js, v2.js | untouched (fast-forward) |

Live world in Production: **ERA_03 河畔聚落 · 木橋完工 · Lv.14 · growth 74 ·
20 contents (18 long, 2 short; 16 marked 上映) · FESTIVAL (content burst)**.
Sources: Content OS ledger OK (0 verified publishes) · Office marks OK 20 ·
overrides none · YouTube GATED · ASSET-01 OK 37 · ASSET-08 OK 20 · member registry OK 148.

## The 30 tests

| # | Test | Result | Evidence |
| --- | --- | --- | --- |
| 01 | Star Office normal | PASS | reconciliation above; full regression green |
| 02 | Content OS normal | PASS | world only reads the ledger through the producer validators; nothing written; projects API identical |
| 03 | World bundle not loaded outside the world | PASS | browser: Office network log has no `/static/world/`, `/api/world/` or `/world` request |
| 04 | No NPC system outside the world | PASS | browser: no `RenguinWorld`, `RenguinWorldScene`, `.rw-walker` on the Office; `sys.modules` holds only `renguin_world.routes` |
| 05 | State loads only on the world page | PASS | browser: exactly one state request on open, none in the next 8 s |
| 06 | Leaving stops timers and loops | PASS | hidden → paused, timers 0; pagehide → timers 0, requests 0, listeners 0, walkers 0 |
| 07 | 0 contents | PASS | EMPTY_WORLD, 遠古空地, Renguin alone, "等待開工" |
| 08 | 5 contents | PASS | ERA_01 小型營地, growth 14 |
| 09 | 10 contents | PASS | ERA_02 部落村莊, 創作者街區 open |
| 10 | 20 contents | PASS | ERA_03 河畔聚落, 旅行港區 open |
| 11 | 35 contents | PASS | ERA_04 繁榮城鎮, 影片大廳 + 鵝寶會員區 |
| 12 | 50 contents | PASS | ERA_05 王國都市, 娛樂夜市區 |
| 13 | 75 contents | PASS | ERA_06 現代都會, gate still locked |
| 14 | 100 contents | PASS | ERA_08 星港時代, Space Gate unlocked |
| 15 | Era progression deterministic | PASS | same inputs in any order → identical state; era_for stable over 0–320 |
| 16 | Character Authority not duplicated | PASS | registry has no appearance text, traits or reference hashes; authority bytes unchanged; `DERIVED_VIEW_NOT_AN_AUTHORITY` |
| 17 | Goosebaby Registry | PASS | 13 world NPCs + 7 private avatars (opaque id, profession, no image, no name); population aggregated by tier |
| 18 | Civilian Registry | PASS | 7 professions from ASSET-08 + 4 world archetypes, with district, density group, day/night |
| 19 | Quiet | PASS | 8–14 days: fewer walkers, construction SLOW, CITY_QUIET |
| 20 | Dormant | PASS | 15–30 days: shops dimmed, construction paused, grass up |
| 21 | Revival | PASS | gap ≥ 8 days then new content: LIGHTS_ON, RESIDENTS_RETURN, CONSTRUCTION_RESTARTED, NEW_POSTER, CONFETTI, SMALL_FIREWORKS |
| 22 | City does not regress with inactivity | PASS | 0 → 400 idle days: buildings, landmarks, radius, height, districts unchanged |
| 23 | Score does not drop with inactivity | PASS | score, level, era, progress unchanged across the same range |
| 24 | NPC density presets | PASS | EMPTY 0 → FESTIVAL 1.0; render caps 28 / 14 |
| 25 | Gossip needs no AI | PASS | every line from the prewritten pool; no AI/network module on the world path; no insults |
| 26 | 100 mock contents stable | PASS | score monotonic 0→100, identical across runs |
| 27 | No new console errors | PASS | browser: Office 0, every world page 0 |
| 28 | Mobile | PASS | 390 × 844: no sideways scroll, scene 356 px, 14 walkers |
| 29 | Desktop | PASS | 1440 × 900: scene 840 px beside the HUD |
| 30 | No Production slowdown | PASS | Office loads nothing of the world (main thread ≈223 ms/s is the Office's own); world page 2.4 ms/s with 28 walkers; world build 149 ms, only on `/world`, cached 10 min |

## Gated / not in V1

| Item | Status | To enable |
| --- | --- | --- |
| YouTube live view counts | GATED | `YOUTUBE_API_KEY` + `youtube_video_id` overrides, then `python -m renguin_world youtube-sync` |
| Real publish dates for Office-marked content | data gap | the ledger has no verified PUBLISH yet; add `published_at` overrides or record PUBLISH in Content OS |
| Showing a real member avatar's name or image | not done by design | needs an explicit decision per member; the override only toggles visibility |
| Public hosting | not in scope | `/api/world/state` already defaults to the public view |
