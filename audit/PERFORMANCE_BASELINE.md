# Star Office performance baseline — master 4108ce0 plus the runtime overlay (reference server 19392), desktop 3413x960 @ DPR 1.5, 120 Hz

- label: `reference` · target: `http://127.0.0.1:19392` · viewport: `ultrawide` (3413x960 CSS px at DPR 1.5) · runs: 3 (medians) · headless: true · 2026-09-30T14:08:03.275Z
- display refresh measured in the page: **120 Hz** (frame budget 8.33 ms)
- Office revision on that server: `4108ce0bcc9493608f649160df9578651e1aa789`

## Frame pacing

Frame time is the interval between animation frames as the page sees them. Average FPS is a secondary number: the tail is what is felt.

| scenario | avg FPS | median ms | P95 ms | P99 ms | P99.9 ms | worst ms | >8.33 | >16.7 | >33.3 | >50 | hitches/min | missed frames |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Entry film (returning reader): held at the airlock while the desk loads | 107.5 | 8.3 | 8.5 | 43.69 | 85.4 | 91.6 | 12 | 7 | 5 | 4 | 206 | 10.5% |
| Entry film (returning reader): the way in | 120 | 8.3 | 8.5 | 8.5 | 8.5 | 8.5 | 0 | 0 | 0 | 0 | 0 | 0.0% |
| Entry film (first visit): held at the airlock | 118.9 | 8.3 | 8.5 | 8.5 | 26.3 | 33.4 | 1 | 1 | 1 | 0 | 17 | 1.0% |
| Entry film (first visit): the way in | 119.5 | 8.3 | 8.5 | 8.5 | 14.6 | 16.6 | 1 | 0 | 0 | 0 | 30 | 0.4% |
| Office idle (30 s) | 118.8 | 8.3 | 8.5 | 8.6 | 33.3 | 50 | 16 | 10 | 4 | 0 | 32 | 1.0% |
| Office first scroll of a fresh page (1500 px/s) | 102.7 | 8.3 | 16.7 | 25 | 44 | 50.1 | 101 | 10 | 4 | 1 | 839 | 14.4% |
| Office scroll, warm, normal (1500 px/s) | 103.7 | 8.3 | 16.7 | 24.9 | 37.7 | 41.7 | 201 | 17 | 6 | 0 | 844 | 13.6% |
| Office scroll, warm, fast (6000 px/s) | 94.5 | 8.4 | 25 | 25.2 | 33.4 | 33.4 | 69 | 24 | 3 | 0 | 1114 | 21.3% |
| Project list: expanded deck scroll | 98.7 | 8.3 | 16.7 | 33.43 | 80.7 | 95.8 | 60 | 10 | 4 | 2 | 876 | 17.8% |
| Character walking (DOM) | 118.4 | 8.3 | 8.5 | 8.6 | 37.9 | 45.9 | 5 | 4 | 3 | 1 | 37 | 1.4% |
| Office → World descent | 107.1 | 8.3 | 16.7 | 25.02 | 74.4 | 87.5 | 48 | 13 | 3 | 2 | 490 | 10.8% |
| World: city idle | 119.1 | 8.3 | 8.5 | 8.6 | 34.3 | 37.6 | 6 | 5 | 2 | 0 | 24 | 0.8% |
| World: panels / zoom / district | 118.8 | 8.3 | 8.5 | 8.55 | 28 | 41.7 | 8 | 3 | 1 | 0 | 45 | 1.0% |
| World → Office ascent | 109 | 8.3 | 16.65 | 23.98 | 43.1 | 49.9 | 44 | 7 | 3 | 0 | 516 | 9.2% |

## Main thread and CPU

Wall-clock main-thread time swings ±25% between identical runs on this machine (see the notes on measuring); style recalculations, layouts and script time are exact counters, frames are what is felt.

| scenario | main ms/s | script | style ms/s | recalcs/s | layouts/s | long tasks | longest | renderer % | GPU % | total % | heap MB | nodes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Office idle (frame recorder running in the page) | 197 | 23 | 59 | 120 | 7 | 0 | 0 | 36 | 26 | 64 | 38.1 | 5331 |
| Office idle (nothing of the harness in the page) | 185 | 19 | 54 | 120 | 5.5 | 0 | 0 | 34 | 26 | 62 | 54.4 | 5522 |
| Office first scroll | 326 | 27 | 74 | 224 | 9.3 | 0 | 0 | 51 | 57 | 117 | 49.3 | 11328 |
| Office scroll, warm, normal | 340 | 26 | 71 | 226 | 8.3 | 0 | 0 | 52 | 37 | 96 | 68.4 | 11566 |
| Office scroll, warm, fast | 319 | 25 | 81 | 201 | 12.9 | 0 | 0 | 54 | 55 | 119 | 35.5 | 9978 |
| Expanded deck scroll | 436 | 30 | 74 | 239 | 12.8 | 0 | 0 | 61 | 51 | 119 | 43.3 | 14813 |
| Character walking | 226 | 24 | 61 | 127 | 8.6 | 0 | 0 | 41 | 28 | 72 | 42.6 | 10145 |
| Descent to the World | 301 | 28 | 64 | 366 | 12.5 | 1 | 62 | 46 | 50 | 101 | 37.6 | 11066 |
| City idle | 240 | 21 | 35 | 121 | 6.2 | 0 | 0 | 36 | 17 | 57 | 35.3 | 10541 |
| Ascent | 309 | 28 | 71 | 403 | 8.5 | 0 | 0 | 49 | 38 | 93 | 43.3 | 10419 |

## What each part of the page costs at rest

Scrolled to each position and left alone for 6 s (the page is 7567 px tall); nothing of the harness runs in the page. Main-thread time is wall-clock and noisy; the counters (style recalcs per second, running animations) are exact.

| scroll y (px) | main ms/s | script | style ms/s | recalcs/s | renderer % | GPU % | total % | running animations |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | 199 | 20 | 58 | 120 | 37 | 26 | 65 | 66 |
| 800 | 349 | 21 | 91 | 120 | 52 | 28 | 82 | 99 |
| 1600 | 354 | 21 | 98 | 119 | 56 | 46 | 105 | 88 |
| 2600 | 297 | 20 | 60 | 120 | 49 | 47 | 99 | 59 |
| 3600 | 281 | 20 | 60 | 120 | 46 | 37 | 84 | 55 |
| 4900 | 196 | 18 | 22 | 120 | 26 | 3 | 30 | 20 |
| 5900 | 226 | 19 | 28 | 120 | 34 | 15 | 51 | 22 |
| 6600 | 212 | 19 | 25 | 120 | 32 | 13 | 47 | 20 |

## What the desk asks for, at rest (30 s)

Total: 3345 KB/s over 110 requests. Non-GET requests: [].

| url | requests/min | KB per request | KB/s | interval s |
|---|---:|---:|---:|---:|
| `/static/renguin-projects-v2.json` | 12 | 11660.1 | 2331.9 | 5 |
| `/api/renguin/projects` | 8 | 6652.2 | 886.9 | 6.55 |
| `/api/creator/presentation` | 8 | 373.1 | 49.7 | 6.53 |
| `/api/creator/event-statuses` | 8 | 264.7 | 35.3 | 6.52 |
| `/api/renguin/operations` | 12 | 136.3 | 27.3 | 5 |
| `/static/bionic_activity.json` | 40 | 13.6 | 9 | 1.5 |
| `/static/codex_activity.json` | 40 | 6.8 | 4.5 | 1.5 |
| `/status` | 60 | 0.4 | 0.4 | 1.01 |
| `/agents` | 18 | 0.3 | 0.1 | 3.5 |
| `/static/renguin-achievements.json` | 6 | 0 | 0 | 10 |
| `/api/creator/browser-bridge/status` | 8 | 0.4 | 0 | 6.59 |

## Interaction latency (mouse release → third painted frame)

| interaction | open/first median ms | P95 | max | close median ms | close max |
|---|---:|---:|---:|---:|---:|
| env-panel | 22.2 | 61.6 | 74.5 | 20.3 | 24.1 |
| work-history-zone | 22.6 | 32 | 34.7 | 22.2 | 26.7 |
| timeline-node | 22.6 | 29.4 | 31.2 | 22 | 39.8 |
| office-collapse | 33.9 | 49.8 | 52.7 | 35.3 | 40.1 |
| project deck expand / collapse | 145.8 | – | – | 113.5 | – |
| world: open_data_drawer | 30.3 | – | – | – | – |
| world: close_data_drawer | 11.4 | – | – | – | – |
| world: open_resident_card | 17.3 | – | – | – | – |
| world: close_resident_card | 15.9 | – | – | – | – |
| world: zoom_in | 24.9 | – | – | – | – |
| world: zoom_out | 25.7 | – | – | – | – |
| world: time_of_day | 16.7 | – | – | – | – |
| world: district_menu | 14.1 | – | – | – | – |

Panel cycles left 2457 DOM nodes, 37 listeners and 5.3 MB of heap behind (24 toggles).

## Load

| load | usable ms | DCL | load | FCP | LCP | requests | KB | long tasks | sum ms | longest ms | script ms at usable |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| cold (no cache) | 2581 | 361 | 457 | 104 | 344 | 145 | 38605 | 5 | 339 | 89 | 521 |
| warm (cache) | 2345 | 254 | 322 | 84 | 240 | 145 | 19789 | 3 | 215 | 77 | 479 |

Cold load by type: {"Document":{"n":1,"kb":243},"js":{"n":19,"kb":1615},"css":{"n":11,"kb":265},"json":{"n":26,"kb":19202},"Font":{"n":1,"kb":727},"Image":{"n":50,"kb":0},"image":{"n":34,"kb":16543},"Fetch":{"n":3,"kb":10}}. Largest: /static/renguin-projects-v2.json 11660KB; /api/renguin/projects 6652KB; /static/coffee-machine-v3-grid.webp 2501KB; /static/sync-animation-v3-grid.webp 2056KB; /static/star-idle-v5.png 1872KB; /static/error-bug-spritesheet-grid.webp 1841KB; /static/renguin-characters/residents/resident-05.png 1476KB; /static/star-working-spritesheet-grid.webp 1378KB.

## Office → Renguin World

- world assets loaded on the way down: 460 KB · engine ready 3 ms after the last gesture
- at the desk before / after the trip: main thread 195 → 205 ms/s; world animations still running at the desk: 0; world paused: true
- worst frames on the way down: 66.6 ms at scrollY 3370, 50 ms at scrollY 4696, 41.6 ms at scrollY 4696, 33.3 ms at scrollY 815, 25 ms at scrollY 876, 25 ms at scrollY 1568

## Main-thread spikes at rest (trace + JS profile, first run)

21 tasks over 8 ms in 30 s = **42/min**, 509 ms in total.

| family (what ran) | count | total ms | longest ms | period s |
|---|---:|---:|---:|---:|
| (program) | 11 | 230 | 38.2 | 2.3 |
| render creator-office.js:3219 < poll creator-office.js:3422 | 5 | 144 | 31.5 | 6.49 |
| (native) after /api/renguin/operations | 2 | 52 | 34.9 | – |
| (native) after /api/creator/presentation | 1 | 35 | 35.1 | – |
| (native) after /status | 1 | 32 | 32.1 | – |
| (native) after /static/bionic_activity.json | 1 | 16 | 16.1 | – |

Who owns the JavaScript time (sampled, ms per second):

| owner | ms/s |
|---|---:|
| (program) | 205.85 |
| render creator-office.js:3219 < poll creator-office.js:3422 | 4.57 |
| (anon) renguin-star-office-extension.js:863 < applyRenguinBranding renguin-star-office-extension.js:847 < update renguin-star-office-extension.js:1084 | 2.87 |
| (garbage collector) | 2.5 |
| (anon) renguin-star-office-extension.js:863 < applyRenguinBranding renguin-star-office-extension.js:847 | 1.25 |
| applyRenguinBranding renguin-star-office-extension.js:847 | 0.91 |
| applyRenguinBranding renguin-star-office-extension.js:847 < update renguin-star-office-extension.js:1084 | 0.77 |
| applyRenguinBranding renguin-star-office-extension.js:847 < update renguin-star-office-extension.js:1084 < (anon) renguin-star-office-extension.js:1134 | 0.74 |
| [phaser] getParentBounds vendor/phaser-3.80.1.min.js:1 | 0.73 |
| memberView creator-office.js:936 < syncMap creator-office.js:1167 < renderMembers creator-office.js:1075 | 0.38 |

## Audit: timers, animation-frame loops, observers, listeners (20 s at rest)

Counts in the window: {"timeoutsCreated":72,"intervalsCreated":0,"timersCleared":0,"rafRequested":7526,"rafCancelled":0,"listenersAdded":555,"listenersRemoved":0,"observersCreated":0,"observersDisconnected":0,"fetches":114,"xhrs":0,"layoutReads":342}; live listeners in the page: 485. Passive-ness of listeners added: {"pointerdown|div|passive":111,"scroll|div|passive":111}.

| kind @ interval — site | live |
|---|---:|
| interval@50ms /static/renguin-readiness.js:27:14 | 1 |
| interval@5000ms /static/renguin-operations.js:82:103 | 1 |
| interval@1000ms /static/renguin-operations.js:83:3 | 1 |
| interval@60000ms mount (/static/creator-environment.js:677:5) | 1 |
| interval@1000ms setup (/static/creator-office.js:3779:5) | 1 |
| interval@1500ms HTMLDocument.<anonymous> (/static/renguin-star-office-extension.js:1156:12) | 1 |
| interval@10000ms HTMLDocument.<anonymous> (/static/renguin-star-office-extension.js:1157:12) | 1 |
| interval@5000ms HTMLDocument.<anonymous> (/static/renguin-star-office-extension.js:1158:12) | 1 |
| interval@750ms HTMLDocument.<anonymous> (/static/renguin-star-office-extension.js:1163:12) | 1 |
| interval@1000ms HTMLDocument.<anonymous> (/static/renguin-star-office-extension.js:1164:12) | 1 |
| timeout@6000ms planVisit (/static/creator-transitions.js:826:17) | 1 |
| timeout@6000ms cycle (/static/creator-scene.js:130:23) | 1 |
| timeout@7700ms cycle (/static/creator-scene.js:130:23) | 1 |
| timeout@8550ms cycle (/static/creator-scene.js:130:23) | 1 |
| timeout@5000ms poll (/static/creator-office.js:3475:17) | 1 |
| timeout@6850ms cycle (/static/creator-scene.js:130:23) | 1 |
| timeout@4000ms showCatBubble (/?intro=off:4906:13) | 1 |

| animation-frame loop | live |
|---|---:|
| raf suppressUpstreamCat (/static/renguin-star-office-extension.js:1161:67) | 1 |
| raf e (/static/vendor/phaser-3.80.1.min.js:1:141103) | 1 |

| observer | live |
|---|---:|
| MutationObserver /static/renguin-readiness.js:26:2 | 1 |
| IntersectionObserver idleGuard (/static/creator-ambience.js:193:22) | 1 |
| IntersectionObserver /static/creator-environment.js:657:9 | 1 |
| IntersectionObserver /static/creator-transitions.js:611:22 | 1 |
| IntersectionObserver /static/creator-office.js:246:27 | 1 |
| ResizeObserver Object.mount (/static/creator-transitions.js:1215:47) | 1 |
| IntersectionObserver Object.mount (/static/creator-transitions.js:1222:7) | 1 |
| IntersectionObserver /static/world/office-world-bridge.js:211:16 | 1 |
| MutationObserver place (/static/world/office-world-bridge.js:277:5) | 1 |
| MutationObserver HTMLDocument.<anonymous> (/static/renguin-star-office-extension.js:1159:28) | 1 |

Work by call site while the desk is at rest:

| kind | site | calls | total ms | avg ms | max ms |
|---|---:|---:|---:|---:|---:|
| raf | e (/static/vendor/phaser-3.80.1.min.js:1:141103) | 3566 | 425.1 | 0.119 | 1.6 |
| raf | suppressUpstreamCat (/static/renguin-star-office-extension.js:1161:67) | 3566 | 181.2 | 0.051 | 1 |
| interval | HTMLDocument.<anonymous> (/static/renguin-star-office-extension.js:1163:12) | 40 | 64.6 | 1.615 | 2.7 |
| interval | /static/renguin-operations.js:83:3 | 30 | 27.1 | 0.903 | 1.7 |
| interval | setup (/static/creator-office.js:3779:5) | 30 | 25.5 | 0.85 | 1.3 |
| forcedLayout:getBoundingClientRect | initialize.getParentBounds (/static/vendor/phaser-3.80.1.min.js:1:938942) | 47 | 20.2 | 0.43 | 0.9 |
| MutationObserver | /static/renguin-readiness.js:26:2 | 186 | 18.8 | 0.101 | 0.4 |
| raf | /static/renguin-readiness.js:24:29 | 197 | 12.6 | 0.064 | 0.2 |
| interval | HTMLDocument.<anonymous> (/static/renguin-star-office-extension.js:1164:12) | 30 | 11.8 | 0.393 | 1 |
| interval | /static/renguin-readiness.js:27:14 | 598 | 8.8 | 0.015 | 0.1 |
| interval | HTMLDocument.<anonymous> (/static/renguin-star-office-extension.js:1156:12) | 20 | 4.5 | 0.225 | 0.3 |
| MutationObserver | HTMLDocument.<anonymous> (/static/renguin-star-office-extension.js:1159:28) | 146 | 3.9 | 0.027 | 0.2 |
| timeout | cycle (/static/creator-scene.js:130:23) | 18 | 1.8 | 0.1 | 0.2 |
| timeout | step (/static/renguin-star-office-extension.js:753:14) | 46 | 1.7 | 0.037 | 0.2 |

| fetch | count in 20 s | total ms | max ms |
|---|---:|---:|---:|
| `/agents` | 9 | 250 | 63 |
| `/status` | 30 | 302 | 109 |
| `/api/creator/browser-bridge/status` | 5 | 35 | 20 |
| `/static/bionic_activity.json` | 20 | 309 | 96 |
| `/static/codex_activity.json` | 20 | 450 | 189 |
| `/api/renguin/projects` | 5 | 2033 | 447 |
| `/api/creator/event-statuses` | 5 | 756 | 155 |
| `/api/creator/presentation` | 5 | 4369 | 962 |
| `/static/renguin-achievements.json` | 3 | 101 | 74 |
| `/static/renguin-projects-v2.json` | 6 | 316 | 152 |
| `/api/renguin/operations` | 6 | 4481 | 1161 |

## Backend latency (sequential requests, no cache)

| endpoint | status | KB | P50 ms | P95 ms | P99 ms | max ms |
|---|---:|---:|---:|---:|---:|---:|
| `/status` | 200 | 0.1 | 2.3 | 2.7 | 2.8 | 2.8 |
| `/api/renguin/projects` | 200 | 6651.4 | 371.3 | 393.2 | 396.6 | 397.4 |
| `/api/creator/event-statuses` | 200 | 264.4 | 145.9 | 161.8 | 162.1 | 162.2 |
| `/api/renguin/operations` | 200 | 136 | 591 | 630.9 | 638.7 | 640.7 |
| `/api/world/state` | 200 | 10.9 | 2.8 | 3.7 | 3.9 | 3.9 |
| `/api/creator/presentation` | 200 | 372.8 | 821.2 | 877.4 | 905.7 | 912.7 |
| `/agents` | 200 | 0 | 3.7 | 4.2 | 4.4 | 4.4 |
| `/static/bionic_activity.json` | 200 | 13.1 | 2.3 | 2.6 | 2.6 | 2.6 |
| `/static/codex_activity.json` | 200 | 6.3 | 2.1 | 2.4 | 2.4 | 2.4 |
| `/static/renguin-projects-v2.json` | 200 | 11659.6 | 26.8 | 41.1 | 47.4 | 49 |
| `/static/creator-office.js` | 200 | 150.7 | 2.6 | 2.9 | 3 | 3 |
| `/` | 200 | 243 | 3 | 4 | 4.3 | 4.4 |

## Soak: Office → panels → World → interactions → Office, repeated

| cycle | heap MB | DOM nodes | listeners | documents |
|---|---:|---:|---:|---:|
| 1 | 28.1 | 10200 | 541 | 24 |
| 2 | 28.5 | 10287 | 546 | 24 |
| 3 | 28.6 | 10233 | 541 | 24 |
| 4 | 29.1 | 10398 | 556 | 24 |
| 5 | 28.7 | 10353 | 551 | 24 |
| 6 | 30.2 | 10248 | 541 | 24 |
| 7 | 29.2 | 10317 | 550 | 24 |
| 8 | 29 | 10183 | 540 | 24 |

Growth per cycle: heap 0.13 MB, nodes -2, listeners -0.1.

Wheel with the pointer over the pixel office scrolls the page: **false**.

