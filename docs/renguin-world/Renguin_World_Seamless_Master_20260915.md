# Renguin World — seamless world into master and Production (2026-09-15)

Result: **PASS**. The seamless world (`/world/seamless`, seven districts on one street,
character authority, V1 parity) is on master and live on Production. `/world` is still
V1 and still the default; making the seamless world the default is a separate decision
that was not taken here. Art stays PROVISIONAL (`RENGUIN_WORLD_VISUAL_ENHANCEMENT_V2.md`).

## What reached master

| Commit | |
| --- | --- |
| `128f1fd` | previous stable master (tag `renguin-world-stable-20260915`), V1 only |
| `7a1dd38` | Merge: `claude/renguin-world-seamless-migration-feddec` (`44d1944`) into Production |
| `b745d14` | Keep the seamless world's swipe hint above the sky cable (defect found in Production acceptance) |
| `8de9a72` | Take the expected live world as acceptance input; create parity check output dir |

The merge commit was built with `git commit-tree` (tree identical to `44d1944`) and the
canonical checkout was fast-forwarded. Its foreign staged and unstaged changes
(`backend/app.py`, `frontend/index.html`, `frontend/renguin-star-office-extension.js`,
`frontend/renguin-star-office-v2.js`) were not touched: their diff hashes were identical
before the merge, after the merge and at the end.

## Private portrait derivatives

`scripts/build_world_thumbnails.py` ran on the Production checkout with the four
`RENGUIN_*` variables: 37 public characters (111 derivatives, byte-identical to the
committed ones, so no tracked file changed), 7 private-identity characters (21 derivatives
in the git-ignored `art/portraits-private/`), member icons 7 MATCHED / 3 UNRESOLVED
(`ARTWORK_MATCHES_NO_AUTHORITY_CHARACTER`), resolution-limited GOOSE_EGG, RENGUIN, ULY.

## Production restart

Production is owned by the Content OS controller (`star_office_service.py`, started by
`START_STAR_OFFICE_UI.ps1` in the `canonical-main-runtime` checkout). Its preflight refuses a
dirty runtime checkout; when this release started that checkout carried another agent's
uncommitted edits, so the restart waited until it was clean again rather than bypassing
the controller. Then: controlled STOP (0 leftover processes), START from a shell that set
`RENGUIN_PROJECT_SOURCE_ROOTS=["E:/"]` and `RENGUIN_NATIVE_HOME=%USERPROFILE%` (the
controller itself sets the canonical and producer roots). New run `d0e9ed30`, status RUNNING
with the bionic, codex and backend children.

| Read-only reconciliation | before restart | after restart | end of release |
| --- | --- | --- | --- |
| `/status` | 200 | 200 | 200 |
| native observations (ASTRA, BIONIC, CHATGPT_WORK, CLAUDE) | 82 | 82 | 81 |
| canonical projects / federated project ledgers | 386 / 6 | 386 / 6 | 387 / 6 |
| World contents / growth / level / era | 21 / 75 / 14 / ERA_03 | same | same |
| YouTube declared FULLY / IDENTITY_VERIFIED / UNRESOLVED | 16 / 3 / 2 | same | same |

The 387th project (`SOURCE-c045ed6ee5e6`) was registered by Content OS at 23:02; no project
disappeared. The user store changed once, by the creator: a cover uploaded through the
Office at 22:49:19 (a multipart image upload; every check in this release was read-only
navigation). Nothing was restored or written into it by this release.

## Production acceptance (real headless Chrome 152, on `8de9a72`)

| Check | Result |
| --- | --- |
| `world-check.cjs --live` (V1 default route, Office isolation, lifecycle, live sources) | 29/29 |
| `world-seamless-check.cjs` (structure, districts, residents, phone, viewport matrix, performance) | 64/64 |
| `world-parity-check.cjs`, seven simulated worlds | 77/77 |
| `world-parity-check.cjs --state` on Production's own public state | 13/13 |
| `world-production-acceptance.cjs --expect 21/75/14/ERA_03 --declared 16/3/2`, desktop and phone | 24/24 |
| Live `/world/seamless` desktop and phone (real level and era, no simulation banner, V1 link, no overflow, no broken images, no failed requests, derivatives instead of originals), V1 rollback render, Office desk | 21/21 |
| Office desk | 21 cards, every API 200, no exceptions |

The first Office desk probe, minutes after the restart, was still showing 正在讀取專案資料 at
its 30 s limit; four later probes rendered the cards in 3.0–9.7 s. No code change was made
for it.

Seamless performance on Production (main thread ms/s): desktop idle island 13.0, wheel
scroll 110, idle city 58.3 (sim=20, festival effects), far district 13.6, hidden 5.5; phone
idle island 12.0, touch scroll 97.3, idle city 41.3; phone transfer after reaching the city
480 KB. These match the branch's recorded baseline.

## Art audit

- `world-art-audit.cjs` (unmodified copy run from the ignored `.qa-runtime/`, so the tracked
  `visual-upgrade/after` evidence was not overwritten) against Production, V1: median main
  thread desktop cold 2.26 / warm 1.88, 390 px cold 1.74 / warm 1.64 ms/s, all within the
  committed budgets (6.18 / 6.00 / 5.98 / 5.95); images 134 990 / 60 604 bytes against
  5 MB / 3 MB; no long tasks; 28 scenarios with no broken image, error or overflow; ten
  pagehide/pageshow cycles at zero timers, requests, listeners, walkers and card nodes;
  hidden tab paused; reduced motion 0 animations; restore visible. Office loads no World
  resource. V1 files did not change after this run.
- Character art: resident report TOTAL 60 · CANONICAL 37 · PROFESSION 14 · PLACEHOLDER 4 ·
  UNRESOLVED 5 · GENERIC_WRONG 0. All 111 public and 21 private derivatives match their
  manifest hash and the current authority source; no orphan, no stale source, none in the
  wrong folder.
- Screenshots inspected (live V1, live seamless island and city on desktop and phone,
  districts, layers, Office desk). One defect found and fixed: on a 390×844 phone the sky
  cable was painted over the "← 左右滑動，逛逛各個街區 →" hint, because sections create no
  stacking context and the hint sat at z 8 under the cable's z 55. The hint is now z 90; a
  unit test pins it above the cable and every declared layer, and the browser check
  hit-tests it (it failed 63/64 on the unfixed Production, passes 64/64 after).

## Full regression

On the canonical master checkout (what Production runs) and on a clean checkout of the
same commit: Python `tests/test_*.py` 166/166 across 14 suites with the four `RENGUIN_*`
variables; Node `tests/*.cjs` 15/15 files (104 `node:test` cases).

## Security

- `scripts/security_check.py`: OK (local warnings only: FLASK_SECRET_KEY, ASSET_DRAWER_PASS).
- Production probe 33/33: no real-member name or id (31 private strings, counted, never
  printed) in `/api/world/characters`, `/api/world/state`, simulate, roadmap, `/world`,
  `/world/seamless` or any `/static/world/` file; no filesystem path; the public state keeps
  the `engine.public_view` contract (opaque `c_` content ids, no evidence, counts only,
  unpublished titles masked, no project ids); all 15 non-public characters 404 on both image
  routes; the 7 private-identity residents are served only as offline derivatives by opaque
  id; traversal and out-of-range inputs refused; git tracks no private derivative, user store,
  runtime state or key file; the merged diff carries no member name, API key, token or key.
- Pre-existing, not introduced here: the backend listens on `0.0.0.0:19000`
  (`app.run(host="0.0.0.0")`), so its unauthenticated local routes are reachable from the LAN.
  Left for a separate decision; `backend/app.py` also carries foreign staged changes.

## Rollback

V1 is the default `/world` and renders the live world (verified above). The seamless world
adds a route and files and writes nothing beyond the World state cache V1 shares: to withdraw it, revert the release commits
(`git revert 8de9a72 b745d14` and `git revert -m 1 7a1dd38`) and push; no data, user store or
world runtime needs restoring. Never reset or force-push.
