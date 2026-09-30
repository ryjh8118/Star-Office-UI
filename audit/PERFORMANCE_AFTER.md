# Star Office performance after — branch claude/star-office-performance-v1 (change server 19393), desktop 3413x960 @ DPR 1.5, 120 Hz

- label: `change` · target: `http://127.0.0.1:19393` · viewport: `ultrawide` (3413x960 CSS px at DPR 1.5) · runs: 3 (medians) · headless: true · 2026-09-30T14:11:11.030Z
- display refresh measured in the page: **120 Hz** (frame budget 8.33 ms)
- Office revision on that server: `eea5e0a74dd7d78242b5df0a072e4510dbdc9565`

## Frame pacing

Frame time is the interval between animation frames as the page sees them. Average FPS is a secondary number: the tail is what is felt.

| scenario | avg FPS | median ms | P95 ms | P99 ms | P99.9 ms | worst ms | >8.33 | >16.7 | >33.3 | >50 | hitches/min | missed frames |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Entry film (returning reader): held at the airlock while the desk loads | 107.1 | 8.3 | 8.5 | 52.21 | 90.5 | 99.9 | 9 | 6 | 6 | 5 | 154 | 10.7% |
| Entry film (returning reader): the way in | 120 | 8.3 | 8.5 | 8.57 | 8.6 | 8.6 | 0 | 0 | 0 | 0 | 0 | 0.0% |
| Entry film (first visit): held at the airlock | 120 | 8.3 | 8.5 | 8.5 | 8.6 | 8.6 | 0 | 0 | 0 | 0 | 0 | 0.0% |
| Entry film (first visit): the way in | 120 | 8.3 | 8.5 | 8.5 | 8.6 | 8.6 | 0 | 0 | 0 | 0 | 0 | 0.0% |
| Office idle (30 s) | 120 | 8.3 | 8.5 | 8.5 | 8.6 | 8.6 | 0 | 0 | 0 | 0 | 0 | 0.0% |
| Office first scroll of a fresh page (1500 px/s) | 108.4 | 8.3 | 16.7 | 24.9 | 43.4 | 50.1 | 67 | 9 | 2 | 1 | 560 | 9.6% |
| Office scroll, warm, normal (1500 px/s) | 106.9 | 8.3 | 16.7 | 16.8 | 25.2 | 41.6 | 168 | 12 | 1 | 0 | 705 | 10.9% |
| Office scroll, warm, fast (6000 px/s) | 96.9 | 8.35 | 16.8 | 25.1 | 33.4 | 33.5 | 65 | 16 | 1 | 0 | 1052 | 19.3% |
| Project list: expanded deck scroll | 110.4 | 8.3 | 16.6 | 20.88 | 44.3 | 49.9 | 29 | 5 | 2 | 0 | 419 | 8.1% |
| Character walking (DOM) | 120 | 8.3 | 8.5 | 8.55 | 8.8 | 12.6 | 1 | 0 | 0 | 0 | 4 | 0.1% |
| Office → World descent | 110.7 | 8.3 | 16.6 | 24.95 | 41.1 | 62.6 | 39 | 11 | 2 | 1 | 398 | 7.8% |
| World: city idle | 120 | 8.3 | 8.5 | 8.6 | 8.6 | 8.7 | 0 | 0 | 0 | 0 | 0 | 0.0% |
| World: panels / zoom / district | 119.4 | 8.3 | 8.5 | 8.6 | 19.6 | 29.3 | 5 | 1 | 1 | 0 | 25 | 0.5% |
| World → Office ascent | 112.3 | 8.3 | 12.55 | 16.75 | 28.6 | 33.3 | 34 | 5 | 1 | 0 | 392 | 6.4% |

## Main thread and CPU

Wall-clock main-thread time swings ±25% between identical runs on this machine (see the notes on measuring); style recalculations, layouts and script time are exact counters, frames are what is felt.

| scenario | main ms/s | script | style ms/s | recalcs/s | layouts/s | long tasks | longest | renderer % | GPU % | total % | heap MB | nodes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Office idle (frame recorder running in the page) | 164 | 21 | 54 | 122 | 6.2 | 0 | 0 | 31 | 25 | 57 | 17.6 | 5145 |
| Office idle (nothing of the harness in the page) | 160 | 18 | 53 | 121 | 5.4 | 0 | 0 | 31 | 25 | 56 | 20 | 5102 |
| Office first scroll | 244 | 18 | 57 | 132 | 8.9 | 1 | 50 | 41 | 55 | 103 | 25.2 | 9948 |
| Office scroll, warm, normal | 235 | 17 | 52 | 128 | 8.3 | 0 | 0 | 40 | 43 | 89 | 42.2 | 10663 |
| Office scroll, warm, fast | 251 | 16 | 61 | 113 | 12.9 | 0 | 0 | 44 | 56 | 105 | 25.6 | 10050 |
| Expanded deck scroll | 295 | 18 | 54 | 165 | 12 | 0 | 0 | 44 | 40 | 88 | 24 | 15683 |
| Character walking | 187 | 23 | 57 | 128 | 7.8 | 0 | 0 | 35 | 27 | 63 | 18.9 | 10191 |
| Descent to the World | 246 | 17 | 52 | 306 | 12.8 | 1 | 28 | 39 | 46 | 90 | 26.3 | 10944 |
| City idle | 195 | 10 | 27 | 122 | 5.7 | 0 | 0 | 31 | 17 | 49 | 23.7 | 10069 |
| Ascent | 255 | 22 | 60 | 340 | 8.2 | 0 | 0 | 42 | 40 | 87 | 21.3 | 10583 |

## What each part of the page costs at rest

Scrolled to each position and left alone for 6 s (the page is 7547 px tall); nothing of the harness runs in the page. Main-thread time is wall-clock and noisy; the counters (style recalcs per second, running animations) are exact.

| scroll y (px) | main ms/s | script | style ms/s | recalcs/s | renderer % | GPU % | total % | running animations |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | 169 | 19 | 55 | 122 | 32 | 25 | 59 | 64 |
| 800 | 279 | 21 | 81 | 122 | 45 | 27 | 73 | 90 |
| 1600 | 263 | 8 | 82 | 121 | 44 | 44 | 89 | 76 |
| 2600 | 199 | 8 | 46 | 122 | 35 | 46 | 82 | 46 |
| 3600 | 197 | 8 | 44 | 122 | 34 | 32 | 68 | 43 |
| 4900 | 77 | 8 | 17 | 122 | 13 | 5 | 19 | 14 |
| 5900 | 180 | 8 | 22 | 122 | 28 | 15 | 45 | 18 |
| 6600 | 174 | 8 | 20 | 122 | 27 | 12 | 40 | 16 |

## What the desk asks for, at rest (30 s)

Total: 152 KB/s over 113 requests. Non-GET requests: [].

| url | requests/min | KB per request | KB/s | interval s |
|---|---:|---:|---:|---:|
| `/api/creator/presentation` | 10 | 373.1 | 62.1 | 5.65 |
| `/api/creator/event-statuses` | 10 | 264.7 | 44.1 | 5.62 |
| `/api/renguin/operations` | 12 | 136.3 | 27.2 | 5 |
| `/static/bionic_activity.json` | 40 | 13.6 | 9 | 1.5 |
| `/static/codex_activity.json` | 40 | 6.8 | 4.5 | 1.5 |
| `/api/renguin/projects` | 10 | 23.6 | 3.9 | 5.62 |
| `/status` | 60 | 0.4 | 0.4 | 1.01 |
| `/agents` | 16 | 0.3 | 0.1 | 3.51 |
| `/api/creator/browser-bridge/status` | 10 | 0.4 | 0.1 | 5.62 |
| `/static/renguin-achievements.json` | 6 | 0 | 0 | 10 |
| `/static/renguin-projects-v2.json` | 12 | 0 | 0 | 5 |

## Interaction latency (mouse release → third painted frame)

| interaction | open/first median ms | P95 | max | close median ms | close max |
|---|---:|---:|---:|---:|---:|
| env-panel | 22.6 | 65 | 78.8 | 21.3 | 25.7 |
| work-history-zone | 23.3 | 31 | 33.2 | 22.7 | 30.7 |
| timeline-node | 23.5 | 39.3 | 43.8 | 23.2 | 26.8 |
| office-collapse | 30.4 | 35.8 | 36.3 | 33.9 | 43 |
| project deck expand / collapse | 149.5 | – | – | 84.8 | – |
| world: open_data_drawer | 29.5 | – | – | – | – |
| world: close_data_drawer | 12.1 | – | – | – | – |
| world: open_resident_card | 18.7 | – | – | – | – |
| world: close_resident_card | 16.2 | – | – | – | – |
| world: zoom_in | 27.2 | – | – | – | – |
| world: zoom_out | 31.2 | – | – | – | – |
| world: time_of_day | 16.5 | – | – | – | – |
| world: district_menu | 10.4 | – | – | – | – |

Panel cycles left 2498 DOM nodes, 39 listeners and 1.2 MB of heap behind (24 toggles).

## Load

| load | usable ms | DCL | load | FCP | LCP | requests | KB | long tasks | sum ms | longest ms | script ms at usable |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| cold (no cache) | 1276 | 333 | 411 | 108 | 316 | 142 | 38596 | 4 | 293 | 85 | 499 |
| warm (cache) | 908 | 256 | 321 | 68 | 244 | 141 | 19773 | 4 | 247 | 75 | 438 |

Cold load by type: {"Document":{"n":1,"kb":247},"js":{"n":20,"kb":1620},"css":{"n":11,"kb":268},"image":{"n":34,"kb":16543},"Font":{"n":1,"kb":727},"json":{"n":22,"kb":19181},"Image":{"n":50,"kb":0},"Fetch":{"n":3,"kb":10}}. Largest: /static/renguin-projects-v2.json 11660KB; /api/renguin/projects 6652KB; /static/coffee-machine-v3-grid.webp 2501KB; /static/sync-animation-v3-grid.webp 2056KB; /static/star-idle-v5.png 1872KB; /static/error-bug-spritesheet-grid.webp 1841KB; /static/renguin-characters/residents/resident-05.png 1476KB; /static/star-working-spritesheet-grid.webp 1378KB.

## Office → Renguin World

- world assets loaded on the way down: 460 KB · engine ready 3 ms after the last gesture
- at the desk before / after the trip: main thread 171 → 179 ms/s; world animations still running at the desk: 0; world paused: true
- worst frames on the way down: 58.4 ms at scrollY 3004, 25.2 ms at scrollY 5364, 25.1 ms at scrollY 1835, 25 ms at scrollY 2472, 25 ms at scrollY 4455, 25 ms at scrollY 5633

## Main-thread spikes at rest (trace + JS profile, first run)

0 tasks over 8 ms in 30 s = **0/min**, 0 ms in total.

| family (what ran) | count | total ms | longest ms | period s |
|---|---:|---:|---:|---:|

Who owns the JavaScript time (sampled, ms per second):

| owner | ms/s |
|---|---:|
| (program) | 208.25 |
| (anon) renguin-star-office-extension.js:863 < applyRenguinBranding renguin-star-office-extension.js:847 < update renguin-star-office-extension.js:1084 | 3.28 |
| (garbage collector) | 2.67 |
| (anon) renguin-star-office-extension.js:863 < applyRenguinBranding renguin-star-office-extension.js:847 | 1.61 |
| applyRenguinBranding renguin-star-office-extension.js:847 < update renguin-star-office-extension.js:1084 < (anon) renguin-star-office-extension.js:1134 | 0.74 |
| applyRenguinBranding renguin-star-office-extension.js:847 < update renguin-star-office-extension.js:1084 | 0.73 |
| [phaser] getParentBounds vendor/phaser-3.80.1.min.js:1 | 0.62 |
| applyRenguinBranding renguin-star-office-extension.js:847 | 0.55 |
| renderPanel renguin-star-office-extension.js:447 < update renguin-star-office-extension.js:1084 < (anon) renguin-star-office-extension.js:1134 | 0.41 |
| memberView creator-office.js:937 < syncMap creator-office.js:1168 < renderMembers creator-office.js:1076 | 0.4 |

## Audit: timers, animation-frame loops, observers, listeners (20 s at rest)

Counts in the window: {"timeoutsCreated":82,"intervalsCreated":0,"timersCleared":0,"rafRequested":7602,"rafCancelled":0,"listenersAdded":560,"listenersRemoved":0,"observersCreated":0,"observersDisconnected":0,"fetches":118,"xhrs":0,"layoutReads":342}; live listeners in the page: 492. Passive-ness of listeners added: {"pointerdown|div|passive":112,"scroll|div|passive":112}.

| kind @ interval — site | live |
|---|---:|
| interval@50ms /static/renguin-readiness.js:27:14 | 1 |
| interval@5000ms /static/renguin-operations.js:82:103 | 1 |
| interval@1000ms /static/renguin-operations.js:83:3 | 1 |
| interval@60000ms mount (/static/creator-environment.js:677:5) | 1 |
| interval@1000ms setup (/static/creator-office.js:3801:5) | 1 |
| interval@1500ms HTMLDocument.<anonymous> (/static/renguin-star-office-extension.js:1156:12) | 1 |
| interval@10000ms HTMLDocument.<anonymous> (/static/renguin-star-office-extension.js:1157:12) | 1 |
| interval@5000ms HTMLDocument.<anonymous> (/static/renguin-star-office-extension.js:1158:12) | 1 |
| interval@750ms HTMLDocument.<anonymous> (/static/renguin-star-office-extension.js:1163:12) | 1 |
| interval@1000ms HTMLDocument.<anonymous> (/static/renguin-star-office-extension.js:1164:12) | 1 |
| timeout@6000ms cycle (/static/creator-scene.js:130:23) | 1 |
| timeout@7700ms cycle (/static/creator-scene.js:130:23) | 1 |
| timeout@6850ms cycle (/static/creator-scene.js:130:23) | 1 |
| timeout@8550ms cycle (/static/creator-scene.js:130:23) | 1 |
| timeout@5000ms poll (/static/creator-office.js:3488:17) | 1 |
| timeout@6000ms planVisit (/static/creator-transitions.js:826:17) | 1 |

| animation-frame loop | live |
|---|---:|
| raf suppressUpstreamCat (/static/renguin-star-office-extension.js:1161:67) | 1 |
| raf e (/static/vendor/phaser-3.80.1.min.js:1:141103) | 1 |

| observer | live |
|---|---:|
| MutationObserver /static/renguin-readiness.js:26:2 | 1 |
| IntersectionObserver idleGuard (/static/creator-ambience.js:197:22) | 1 |
| IntersectionObserver /static/creator-environment.js:657:9 | 1 |
| IntersectionObserver /static/creator-transitions.js:611:22 | 1 |
| IntersectionObserver /static/creator-office.js:247:27 | 1 |
| IntersectionObserver setup (/static/creator-office.js:3617:7) | 1 |
| ResizeObserver Object.mount (/static/creator-transitions.js:1217:47) | 1 |
| IntersectionObserver Object.mount (/static/creator-transitions.js:1224:7) | 1 |
| IntersectionObserver /static/world/office-world-bridge.js:211:16 | 1 |
| MutationObserver place (/static/world/office-world-bridge.js:277:5) | 1 |
| MutationObserver HTMLDocument.<anonymous> (/static/renguin-star-office-extension.js:1159:28) | 1 |
| IntersectionObserver sleepWhenOffscreen (/?intro=off:2808:13) | 1 |
| ResizeObserver initialize.create (/?intro=off:4358:32) | 1 |

Work by call site while the desk is at rest:

| kind | site | calls | total ms | avg ms | max ms |
|---|---:|---:|---:|---:|---:|
| raf | e (/static/vendor/phaser-3.80.1.min.js:1:141103) | 3601 | 421.3 | 0.117 | 2.1 |
| raf | suppressUpstreamCat (/static/renguin-star-office-extension.js:1161:67) | 3601 | 175 | 0.049 | 0.6 |
| interval | HTMLDocument.<anonymous> (/static/renguin-star-office-extension.js:1163:12) | 40 | 65.7 | 1.642 | 2.6 |
| interval | /static/renguin-operations.js:83:3 | 30 | 27.9 | 0.93 | 1.3 |
| interval | setup (/static/creator-office.js:3801:5) | 30 | 26.7 | 0.89 | 1.2 |
| forcedLayout:getBoundingClientRect | initialize.getParentBounds (/static/vendor/phaser-3.80.1.min.js:1:938942) | 44 | 18.7 | 0.425 | 1 |
| MutationObserver | /static/renguin-readiness.js:26:2 | 188 | 18 | 0.096 | 0.4 |
| interval | HTMLDocument.<anonymous> (/static/renguin-star-office-extension.js:1164:12) | 30 | 11.4 | 0.38 | 0.8 |
| interval | /static/renguin-readiness.js:27:14 | 600 | 10.8 | 0.018 | 0.2 |
| raf | /static/renguin-readiness.js:24:29 | 200 | 10.1 | 0.05 | 0.2 |
| interval | HTMLDocument.<anonymous> (/static/renguin-star-office-extension.js:1156:12) | 20 | 6.2 | 0.31 | 0.5 |
| MutationObserver | HTMLDocument.<anonymous> (/static/renguin-star-office-extension.js:1159:28) | 148 | 3.7 | 0.025 | 0.1 |
| timeout | cycle (/static/creator-scene.js:130:23) | 17 | 2.1 | 0.124 | 0.2 |
| timeout | step (/static/renguin-star-office-extension.js:753:14) | 55 | 1.7 | 0.031 | 0.1 |

| fetch | count in 20 s | total ms | max ms |
|---|---:|---:|---:|
| `/static/renguin-projects-v2.json` | 6 | 20 | 5 |
| `/status` | 30 | 201 | 68 |
| `/api/creator/browser-bridge/status` | 6 | 20 | 4 |
| `/static/bionic_activity.json` | 20 | 248 | 101 |
| `/static/codex_activity.json` | 20 | 268 | 101 |
| `/api/renguin/projects` | 6 | 2620 | 462 |
| `/api/creator/event-statuses` | 6 | 929 | 174 |
| `/api/creator/presentation` | 6 | 119 | 23 |
| `/agents` | 9 | 45 | 8 |
| `/api/renguin/operations` | 6 | 1262 | 260 |
| `/static/renguin-achievements.json` | 3 | 12 | 5 |

## Backend latency (sequential requests, no cache)

| endpoint | status | KB | P50 ms | P95 ms | P99 ms | max ms |
|---|---:|---:|---:|---:|---:|---:|
| `/status` | 200 | 0.1 | 2.4 | 2.9 | 3.1 | 3.1 |
| `/api/renguin/projects` | 200 | 6651.9 | 49.1 | 221.6 | 367.3 | 403.7 |
| `/api/creator/event-statuses` | 200 | 264.4 | 7 | 8.2 | 9.1 | 9.3 |
| `/api/renguin/operations` | 200 | 136 | 209.7 | 233.4 | 242.4 | 244.6 |
| `/api/world/state` | 200 | 10.9 | 3.5 | 6.3 | 8.5 | 9.1 |
| `/api/creator/presentation` | 200 | 372.8 | 16.1 | 52.3 | 60.4 | 62.4 |
| `/agents` | 200 | 0 | 4.1 | 4.2 | 4.2 | 4.2 |
| `/static/bionic_activity.json` | 200 | 13.1 | 2.4 | 2.6 | 2.6 | 2.6 |
| `/static/codex_activity.json` | 200 | 6.3 | 2.4 | 2.6 | 2.6 | 2.6 |
| `/static/renguin-projects-v2.json` | 200 | 11659.6 | 24.9 | 36.5 | 42.8 | 44.4 |
| `/static/creator-office.js` | 200 | 152.1 | 2.8 | 3.8 | 4.4 | 4.5 |
| `/` | 200 | 246.7 | 3.1 | 16.8 | 16.8 | 16.9 |

## Soak: Office → panels → World → interactions → Office, repeated

| cycle | heap MB | DOM nodes | listeners | documents |
|---|---:|---:|---:|---:|
| 1 | 18.4 | 10352 | 556 | 24 |
| 2 | 18.3 | 10271 | 546 | 24 |
| 3 | 18.8 | 10273 | 546 | 24 |
| 4 | 18.6 | 10295 | 547 | 24 |
| 5 | 18.4 | 10300 | 547 | 24 |
| 6 | 18.8 | 10353 | 556 | 24 |
| 7 | 19.7 | 10391 | 556 | 24 |
| 8 | 19.5 | 10434 | 561 | 24 |

Growth per cycle: heap 0.16 MB, nodes 12, listeners 0.7.

Wheel with the pointer over the pixel office scrolls the page: **true**.

