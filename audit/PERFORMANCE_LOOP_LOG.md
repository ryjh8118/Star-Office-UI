# Star Office performance loop — round log

Every change is recorded as evidence → root cause → change → before/after → risk → verification.
Environment for every number: real Chrome 154, RTX 4090 (ANGLE/D3D11, GPU compositing on), a maximised window on a
5120×1440 panel at 120 Hz, Windows at 150% (3413×960 CSS px, DPR 1.5). `tests/perf/README.md` says how each metric is
taken. "Reference" is a detached worktree of the commit under test with the runtime's uncommitted overlay files applied,
on its own Preview port; it reproduced Production's profile to within run-to-run noise.

## Round 0 — reconciliation

- GitHub authority `fork/master` = local `master` = canonical checkout HEAD = `4108ce0` (matches the known SHA).
- **The runtime is not master.** Production (19000) runs the canonical checkout's working tree: `4108ce0` plus four
  uncommitted files that are not this work's — `backend/app.py` (+1 line), `frontend/index.html` (+1 line),
  `frontend/renguin-star-office-extension.js` (+429/−38 lines staged, and a further unstaged edit that appeared during
  this session) and `frontend/renguin-star-office-v2.js` (new). They are what Content OS's adapter installs into the checkout
  (`setup_star_office_ui.py` copies its extension and v2 script into `frontend/` and patches `index.html` / `app.py` to load
  them). They are not touched by this work except where a merge has to move past them (dry-run on a scratch clone, then the
  real merge: status before == status after).
- One branch (`claude/star-office-performance-v1-29c635`), fast-forwarded to master before any change.

## Round 1 — the desk stutters while it sits still, and much more when it scrolls

### Baseline (Production, ultrawide viewport, medians of 3 interleaved runs — `audit/PERFORMANCE_BASELINE.md`)

Average FPS said 119–120 at rest and it was not lying; it just was not the question.

### R1.1 BOTTLENECK — a stall every 5 s, another every 6.6 s, and a third that is the response parse

EVIDENCE — trace + 200 µs JS sampling profile of 30 s at rest, every task > 8 ms named. The desk was polling
`/api/renguin/projects` (6.8 MB) every ~6.6 s and `/static/renguin-projects-v2.json` (11.7 MB) every 5 s, plus
`/api/creator/presentation` (0.4 MB) and `/api/creator/event-statuses` (0.3 MB) — 3.3 MB/s with nobody touching it:

| family | what ran | main thread | period |
|---|---|---|---|
| Q | native `Response.json()` of the 6.8 MB projects body | 16 ms | 6.6 s |
| R | `creator-office.js render()` → `JSON.stringify` of the whole 6 MB projection to detect change | 26–32 ms (a single microtask) | 6.6 s |
| P | native `Response.json()` of the 11.7 MB registry file | 32–43 ms | 5.0 s |

ROOT CAUSE — change detection by re-serialising the payload; the payload re-sent although it had not changed (only
`checked_at` and per-project ages move in the projects response; only `generated_at` and the digest that covers it move
in the registry file — verified by diffing successive copies); and, on the server, the same ledger re-read,
re-validated and re-projected by three endpoints in a row (~1.4 s of CPU per poll cycle, presentation alone ~1 s of
which most was a `deepcopy` of ~450 projects at ~14 kB each that every caller only reads).

### R1.2 BOTTLENECK — a scroll drops 15–22% of its frames (Production: 20% missed, P99 34–42 ms, worst 417–550 ms)

EVIDENCE — the same scroll on an empty static page: 120.0 fps, 0–0.2% missed (so the harness is not the cause). Ablation
(pausing animations, hiding the fixed weather layer, sleeping Phaser, removing filters/shadows/blends) improved it by
at most a third even with everything off, so a scroll-time cost lives in the page's own scroll work. The audit probe ranks
scroll-time handlers: `placeOverlayAndStatusAtCanvasBottomLeft` (a `window` scroll listener in `index.html`) = **600 ms of a
7.2 s pass**, 721 calls, 0.8 ms average, 7.6 ms at worst, almost all of it `getBoundingClientRect` forcing a layout.

ROOT CAUSE — read → write → read → write on every scroll event: the loading overlay's box is rewritten (hidden almost
always), the container measured again after that write, the status text rewritten. A scroll moves the canvas but never the
status text's place inside it.

Also found: Phaser's default `preventDefaultWheel` swallows every wheel event over its canvas, so with the pointer on the
pixel office the page does not scroll at all (measured: false), through a non-passive listener.

## Round 1 — the changes

| # | change | files |
|---|---|---|
| R1.1a | the desk asks for the projection with the digest of the copy it holds (`?known=`); the server answers "unchanged" with the small envelope and the desk keeps the parsed projection; change is decided by `projection_stable_digest` (the producer's own digest covers `generated_at`, so it changes on every rebuild) | `renguin_boundary.py`, `app.py`, `creator-office.js` |
| R1.1b | the generated 11.7 MB registry file is served with an ETag of its content (the volatile `generated_at` / `projection_digest` lines left out) and a fetch layer answers a matching poll from the object it already parsed | `projection_file.py`, `app.py`, `creator-fetch-cache.js`, `index.html` |
| R1.1c | the ledger is read, validated and projected once for the endpoints that ask back to back (bounded, invalidated by the ledger's own stamp, single-flight, failures never kept; freshness is recomputed per request); projections are shared read-only instead of `deepcopy`'d; each native journal is parsed once per change, not once per poll | `renguin_boundary.py` (`Memo`), `creator_history.py`, `creator_projects.py`, `creator_activity.py` |
| R1.2a | the scroll listener no longer measures the canvas on every event (a forced layout per scroll event); a `ResizeObserver` re-places what has to follow it | `index.html` |
| R1.2b | Phaser no longer swallows the wheel over its canvas (the page scrolls under the pointer like everywhere else) | `index.html` |

## Round 2 — animations nobody can see still cost the main thread (and two waterfalls repaint the page)

### R2.0 BOTTLENECK — after the polling stalls were gone, the desk still spent 190–390 ms/s of main thread at rest

EVIDENCE — per-region idle cost, both frame loops stopped by hand so only the page's own animations remain (Phaser asleep,
the extension's `suppressUpstreamCat` rAF loop dropped), y = 4900 (the timeline, 20 running animations): **232 ms/s; with
every animation paused: 40 ms/s**. Bisecting by animation family (fresh page per run): the four office residents' loops alone
(`co-scene-*`, 64×87 px each, 4300 px above the viewport) cost **+133 ms/s** and 108 main frames/s; the eleven weather-layer
animations cost +38. Main-thread self time says why: `Layerize` (Blink rebuilding the page's compositor layers) 93–110 ms/s,
0.9 ms × 120 per second, against 4.5 ms/s at the top of the page where the same animations are on screen.
A control settles it: four plain transform-animated `<div>`s put *inside the office layer* cost +21 ms/s with the office in view
and **+142 ms/s** with the office scrolled 4300 px away; the same four in `<body>` cost +19 either way. Blink only paints about
4000 px around the viewport; an animation running beyond that makes it re-layerize the page every frame. Census of running
animations by distance from the viewport: none beyond 2000 px for y ≤ 2400, the six office/lodge loops at 2000–4000 px from
y ≈ 3200 and beyond 4000 px from y ≈ 4800 — i.e. the whole lower third of the page.

At the decks (y = 2600, loops stopped, 337 ms/s; everything paused: 46) four families force a main frame every vsync:
`cw-pour` (two waterfalls animating `background-position`: **a repaint of the page each frame**, Paint 372/s), and the loops
of *hidden* sky-world objects — `cw-bob`, `cw-fly-*`, `cw-face`/`cw-hover` (Layerize 74–84 ms/s each on its own).
Blink's own compositing verdicts (`blink.animations` trace: `Animation` events carry `compositeFailed` and
`unsupportedProperties`, decoded on a blank page: `8224` = animates a property the compositor cannot run,
`131072` = "animation has no visible change", produced by `visibility:hidden` and zero-size targets) list ten animations
Blink refused to composite at the decks: seven whose target is `visibility:hidden`, the two `cw-pour`, and one `co-working`.
`creator-transitions.js` hides every sky-world object the camera cannot see with `visibility:hidden` and leaves its loops
running; a hidden target's animation stays on the main thread and asks for a frame every vsync.

ROOT CAUSE — animations kept running where nothing can see them (hidden sky objects; office residents and member cards
thousands of pixels off screen), and two waterfalls animated with a repaint instead of a compositor move.

### R2.1–R2.3 CHANGE

| # | change | files |
|---|---|---|
| R2.1 | the sky world marks the objects the camera shows (`is-shown`); the rest have their loops paused | `creator-transitions.js` (`show()`), `creator-islands.css` |
| R2.2 | the office residents' loops pause with the room (`is-amb-idle`, the negative twin of `is-amb-live`); the members' with the lodge (`is-off-screen`, from its own observer — the lodge is not a zone, so the zone watcher never saw it) | `creator-ambience.js/.css`, `creator-office.js`, `creator-lodge.css` |
| R2.3 | both waterfalls (`cw-pour`, `co-isle-pour`) slide a one-tile-taller `::before` with `translate` instead of animating `background-position`; one period a turn, so the loop is seamless | `creator-islands.css` |

No animation was removed or slowed; a loop resumes where it stopped when the reader comes back.

### R2 VERIFICATION

- Blink verdicts at the decks: 10 animations refused → 1 (`co-working`, a resident's portrait that is on screen only at the
  top). Running animations at y = 4800: 21 → 14; none farther than 2000 px from the viewport at any scroll position.
- Behaviour (`tests/perf` scratch check, real page): the room is live in view / idle when scrolled away / live again on return;
  the lodge likewise; every sky-world object's `is-shown` equals its computed visibility (80 objects, before and after a flight
  to another island); nothing hidden runs; what is shown still animates; the work island's two waterfalls animate a
  `translate` on their `::before` and run while the island is home; no uncaught errors.
- Pixels, every animation frozen at the same instant on both builds (`5087×1293`, three phases each): `cw-pour` regions
  **0 differing pixels** (max channel delta 5/255); the isle waterfall forced on (it is `display:none` in this data): 161–190
  of 6.6 M pixels differ, all inside the 16×225 px streak, ≤ 64/255 at stripe edges — sub-pixel anti-aliasing of a moved layer
  against a re-rasterised one; the two crops are visually identical.
- Idle main thread per region (medians of three interleaved runs, reference vs change, ms/s):

| region | reference | change |
|---|---:|---:|
| top of the page (Phaser + office) | 192 | 174 |
| y = 800 | 326 | 280 |
| y = 1600 | 336 | 265 |
| y = 2600 (decks) | 275 | 212 |
| y = 3600 | 261 | 202 |
| y = 4900 (timeline) | 192 | **83** |
| y = 5900 (world gate) | 224 | 196 |
| y = 6600 (world) | 212 | 183 |

  CPU of the whole browser at the timeline: 30 → 17 % of a core.

### Not changed, and why

`renguin-star-office-extension.js` starts `requestAnimationFrame(suppressUpstreamCat)` and never stops it. What it does
(`hideUpstreamCat`: keep the upstream cat sprite hidden and its bubble destroyed) needs doing once, not 120 times a second; the
first half of the function reads `Phaser.GAMES`, which does not exist in the bundled Phaser 3.80. With Phaser asleep it is the
only thing that keeps the page producing a main frame every vsync (243 → 69 ms/s at the top when it is dropped as well —
the upper bound; the cat would come back). The file in the canonical checkout is Content OS's adapter extension, installed and
uncommitted there, so it is left alone; the change and its numbers are in
`docs/performance/Office_Extension_Handoff_20260930.md`.

## Round 3 — the frame loop and the load

- **The pixel office sleeps off screen** (`sleepWhenOffscreen`, `index.html`). Measured at the first screens below the office:
  main thread -12 ms/s of script, CPU of the whole browser 112 % -> 82 % of a core at y = 1600. Its `/status` and `/agents` polls run
  on timers while it sleeps (`tests/perf/phaser-sleep-check.cjs`, 13 checks: sleeps, draws nothing, keeps polling, awake before it
  is needed, not blank after a sleep, folded away also sleeps, no errors).
- **No Web Audio context** (`audio: { noAudio: true }`): the office plays no sound; Phaser built a context and kept it.
- Time to usable UI on a cold load 2581 -> 1276 ms, warm 2345 -> 908 ms: the endpoints the desk needs to draw its first card
  are no longer computed three times over on the server (`/api/creator/presentation` 821 -> 16 ms, `/api/renguin/projects`
  371 -> 49 ms at the median). The first seconds of a load are still Phaser's own synchronous work (context 30 ms, renderer init
  140 ms, texture creation 180 ms and four 40-70 ms `_processTexture` tasks) with the desk's first render (~50 ms) landing
  among them; they are unchanged and are what the entry film's first frames hitch on (see "remaining").

## Results

Desktop 3413x960 CSS px at DPR 1.5, 120 Hz; headless Chrome 154 on the machine that runs the Office; one warm browser profile;
reference = master `4108ce0` plus the runtime's uncommitted overlay, change = this branch; runs interleaved; medians.

Full tables: `audit/PERFORMANCE_COMPARE.md` (desktop), `audit/PERFORMANCE_COMPARE_MOBILE.md` (phone), a report for each side
of each (`PERFORMANCE_BASELINE*.md`, `PERFORMANCE_AFTER*.md`) and the raw medians in the `.json` files beside them.

| | before | after |
|---|---:|---:|
| **Office at rest, 30 s (3 runs)** | | |
| frame time P99.9 | 33.3 ms | 8.6 ms |
| worst frame | 50 ms | 8.6 ms |
| frames over 16.7 ms | 10 | 0 |
| hitches per minute | 32 | 0 |
| missed frames | 1.0 % | 0.0 % |
| main-thread tasks over 8 ms, per minute (trace) | 42 | 0 |
| polling traffic | 3345 KB/s | 152 KB/s |
| JS heap | 38.1 MB | 17.6 MB |
| main thread busy, nothing of the harness in the page | 185 ms/s | 160 ms/s |
| whole browser CPU | 62 % of a core | 56 % |
| **Idle cost by position on the page (main thread, ms/s)** | | |
| top / 800 / 1600 / decks (2600) | 199 / 349 / 354 / 297 | 169 / 279 / 263 / 199 |
| 3600 / timeline (4900) / world gate / world | 281 / 196 / 226 / 212 | 197 / 77 / 180 / 174 |
| **First scroll of a fresh page, 1500 px/s** | | |
| missed frames / frames over 33 ms | 14.4 % / 4 | 9.6 % / 2 |
| **Warm scroll, 1500 px/s** | | |
| P99 | 24.9 ms | 16.8 ms |
| frames over 16.7 ms / over 33 ms | 17 / 6 | 12 / 1 |
| missed frames | 13.6 % | 10.9 % |
| main thread busy / style recalcs per second | 340 ms/s / 226 | 235 ms/s / 128 |
| **Scroll through the expanded project deck (2 runs)** | | |
| P99 / worst frame / missed frames | 33.4 ms / 95.8 ms / 17.8 % | 20.9 ms / 49.9 ms / 8.1 % |
| **Office to World and back (2 runs)** | | |
| descent: worst frame / missed frames | 87.5 ms / 10.8 % | 62.6 ms / 7.8 % |
| ascent: P99 / missed frames | 24.0 ms / 9.2 % | 16.8 ms / 6.4 % |
| city at rest, main thread | 240 ms/s | 195 ms/s |
| **Load (3 runs)** | | |
| time to usable UI, cold / warm | 2581 / 2345 ms | 1276 / 908 ms |
| **Backend, per request (P50)** | | |
| `/api/creator/presentation` / `/api/renguin/projects` | 821 / 371 ms | 16 / 49 ms |
| `/api/creator/event-statuses` / `/api/renguin/operations` | 146 / 591 ms | 7 / 210 ms |
| **Phone 390x844 at DPR 2, warm scroll (2 runs)** | | |
| worst frame / frames over 16.7 ms / missed | 95.8 ms / 17 / 3.7 % | 21 ms / 0.5 / 1.4 % |
| main thread, warm scroll | 298 ms/s | 184 ms/s |
| **Soak, 8 x Office - panels - World - Office** | | |
| heap / DOM nodes / listeners growth per cycle | +0.13 MB / -2 / -0.1 | +0.16 MB / +12 / +0.7 (noise: +-100 nodes between cycles) |

Not better, honestly: the entry film held at the airlock while the desk loads underneath (P99 43.7 -> 52.2 ms, worst 92 -> 100 ms,
4 -> 5 frames over 50 ms: the same three to five hitches in the first second and a half, from Phaser's synchronous start-up and
the desk's first render, which now arrives earlier), the project-deck expand click (146 -> 150 ms), and the first scroll of a fresh
page, whose P99 and worst frame did not move (its tiles are drawn for the first time; the missed-frame share fell by a third).

## Verification

- **A real window on the real display** (headed Chrome, 120 Hz measured in the page, one pair of runs and one more of the change;
  the second reference run was discarded: its window was occluded and produced no frames). Idle: worst frame 41.6 ms and six
  frames over 16.7 ms -> 16.6 / 16.8 ms and none. Warm scroll at 1500 px/s: 7.7 % missed frames, worst 41.7 ms, main thread
  342 ms/s -> 4.1 / 4.0 %, worst 25.1 ms, 199-201 ms/s. Warm fast scroll: 20.1 % -> 13.8 / 16.1 % missed. Idle cost by position:
  the same shape as the headless table (timeline 187 -> 63-77 ms/s). The first scroll of a page in a headed window still pays its
  one-time GPU work (a 0.6-1.5 s freeze in every run, before and after): that is the browser's shader cache, not the page.
- **What the desk draws did not change.** `tests/perf/desk-fingerprint.cjs`, reference against change: same cards in the same
  order with the same text and tier, same 14 sections and headers, same members, same 34 timeline entries, same page height, same
  animations (within one), no page errors, screenshots within the reference's own animation noise (13/13). With every animation
  frozen at the same instant and the pixel office (a game loop, not an animation) masked out, full-viewport screenshots at eight
  scroll positions on the desktop and six on a phone: the phone 6/6 pixel-identical; the desktop 4/8 identical and the other four
  differ by 17-215 pixels of 6.6 million (avatar and seam anti-aliasing, at most 49/255) — the members' running portrait and a
  1 px seam. The two waterfalls: `cw-pour` 0 differing pixels at three phases; the isle waterfall (display:none in this data,
  forced on for the check) 161-190 pixels inside its 16x225 px streak, at stripe edges.
- **Behaviour.** The digest protocol end to end in a real browser (`poll-protocol-check.cjs`, 13/13: names nothing when it holds
  nothing, names what it holds, "nothing changed" leaves every card where it was, a real change and a failed read still reach the
  screen); the pixel office's sleep (`phaser-sleep-check.cjs`, 13/13); the animation gates (in view / scrolled away / back for the
  room, the lodge, every sky-world object before and after a flight; no uncaught errors).
- **Repository suites**, reference and change alike: Node 16/16, Python 16/16 files, `scripts/security_check.py` OK;
  `world-check` 28/28, `world-seamless-check` 39/39, `world-parity-check` 39/39, `office-world-seamless-check` 38/39 (the one
  failure is a 404 for `/static/renguin-achievements.json`, an untracked file the Preview worktrees do not have; identical on
  both). No console error and no non-GET request in any measured run (desktop, phone, soak, spikes, audit).

## Deployment (2026-09-30)

- `master` `4108ce0` -> `d5c93b8` (merge of `claude/star-office-performance-v1-29c635`), pushed to `fork` (fast-forward). Remote
  `d5c93b857f49c37f281b5cb96fcfb1eee4393b07` = local master = the canonical checkout's HEAD.
- The canonical checkout (Production's files) was fast-forwarded after a dry run on a scratch clone that reproduced its dirty state:
  the four installed files (`backend/app.py`, `frontend/index.html`, `frontend/renguin-star-office-extension.js`,
  `frontend/renguin-star-office-v2.js`) kept exactly their staged/unstaged edits (`git status` before == after); the two of them the
  merge also touches were parked and re-applied. All Node (16) and Python (16) test files pass on the merged tree with that overlay.
- Production's backend was restarted alone (python `backend\app.py`, pids 14636/35392 -> 34464/55156 at 23:45:02, the launcher's
  environment: canonical/producer = Content OS, source roots `["E:/"]`, native home = the user profile; bridges untouched).
  Reconciliation before and after: 446 projects, identical counts (`ai_running 0, blocked 1, my_turn 0, review 1`), status `STALE`
  both times (Content OS's own freshness verdict), 5 jobs, `native_coverage` present, 188 presentation projects, 1766 events. New:
  `projection_stable_digest` is served, `?known=<digest>` answers `projection_unchanged` (23.7 KB instead of 6.65 MB), the registry
  file carries its ETag, and `index.html` loads `creator-fetch-cache.js` with the new version stamp.
- Production measured with the harness (2 runs, same warm profile; `audit/PERFORMANCE_PRODUCTION_AFTER.md`): at rest 120 fps, worst
  frame 8.6 ms, 0 hitches, 0 missed frames, no long task; warm scroll P99 20.9 ms, 6.0 % missed frames, worst 33 ms; expanded-deck
  and world scenarios were not repeated there. Time to usable UI 1348 ms cold / 1051 ms warm. Idle cost by position 182 / 298 / 285 /
  224 / 209 / 114 / 249 / 244 ms/s: the same shape as the change server, a little higher in the lower half (the runtime shares the
  machine with Content OS's two activity bridges). No console error, no non-GET request.

## Remaining known bottlenecks

1. **The extension's frame loop** (`suppressUpstreamCat`, in Content OS's adapter extension): with the pixel office asleep it is the only
   thing that keeps the page producing a main frame every vsync; dropped as well, the top of the page falls from 243 to 70 ms/s
   (an upper bound: the upstream cat has to be hidden some other way). Handed off in `Office_Extension_Handoff_20260930.md`.
2. **Rest at the top of the page is ~160-170 ms/s**, not zero: the pixel office draws at 120 Hz by design (the frame rate was not
   lowered) and Chrome re-samples ~65 running animations on the main thread every frame while a frame loop runs.
3. **Warm scroll still misses ~11 % of frames** at this viewport (5087x1293 device pixels): the loss is in the compositor and GPU
   (`EndActivateToSubmitCompositorFrame`, tile memory: ~236 layers, ~545 MB of GPU memory), not the main thread (median frame
   task 4 ms).
4. **First scroll on a browser profile that has never drawn this page**: about a second of one-time GPU shader compilation
   (renderer `RasterDecoder::DoEndRaster` flush) before the shaders are cached; measured away by keeping the profile.
5. **Entry film start**: Phaser's synchronous start-up (renderer init ~140 ms, texture creation ~180 ms, four ~50 ms texture
   tasks) and the desk's first render hitch the film's first frames.
6. **Expanding a deck** (+54 cards) costs ~110-150 ms of layout (container queries on every card's crystal and yard).
7. `co-working` on a working resident's portrait is the one animation still refused by the compositor
   (`compositeFailed=8224`, "unsupported width"): it runs on the main thread only while that resident is working and on screen.
