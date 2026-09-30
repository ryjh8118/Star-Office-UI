# Star Office performance baseline — Production (19000): master 4108ce0 plus the runtime's uncommitted files

- label: `baseline-production` · target: `http://127.0.0.1:19000` · viewport: `ultrawide` (3413x960 CSS px at DPR 1.5) · runs: 3 (medians) · headless: true · 2026-09-30T08:56:59.216Z
- display refresh measured in the page: **120 Hz** (frame budget 8.33 ms)

## Frame pacing

Frame time is the interval between animation frames as the page sees them. Average FPS is a secondary number: the tail is what is felt.

| scenario | avg FPS | median ms | P95 ms | P99 ms | P99.9 ms | worst ms | >8.33 | >16.7 | >33.3 | >50 | hitches/min | missed frames |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Office idle (30 s) | 118.9 | 8.3 | 8.5 | 8.6 | 33.4 | 41.6 | 14 | 10 | 4 | 0 | 28 | 0.9% |
| Office scroll, normal (1500 px/s) | 96 | 8.3 | 16.7 | 33.3 | 280 | 416.7 | 126 | 53 | 13 | 8 | 527 | 20.0% |
| Office scroll, fast (6000 px/s) | 90.6 | 8.4 | 25 | 33.35 | 41.6 | 41.7 | 72 | 30 | 5 | 0 | 1165 | 24.5% |
| Project list: expanded deck scroll | 109.6 | 8.3 | 16.6 | 25.1 | 47.2 | 50.1 | 23 | 6 | 3 | 1 | 437 | 8.7% |
| Character walking (DOM) | 118.4 | 8.3 | 8.5 | 8.6 | 34.4 | 41.7 | 5 | 4 | 2 | 0 | 38 | 1.4% |
| Office → World descent | 81.6 | 8.3 | 16.8 | 74.9 | 570.8 | 883.4 | 36 | 20 | 13 | 9 | 352 | 32.0% |
| World: city idle | 118.5 | 8.3 | 8.5 | 8.6 | 41.6 | 49.9 | 10 | 5 | 3 | 0 | 40 | 1.2% |
| World: panels / zoom / district | 116.4 | 8.3 | 8.5 | 16.7 | 50 | 66.5 | 20 | 9 | 5 | 2 | 111 | 3.0% |
| World → Office ascent | 99.6 | 8.3 | 24.88 | 37.85 | 58.4 | 66.9 | 56 | 30 | 9 | 2 | 614 | 17.0% |

## Main thread and CPU

Wall-clock main-thread time swings ±25% between identical runs on this machine (see the notes on measuring); style recalculations, layouts and script time are exact counters, frames are what is felt.

| scenario | main ms/s | script | style ms/s | recalcs/s | layouts/s | long tasks | longest | renderer % | GPU % | total % | heap MB | nodes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Office idle | 228 | 26 | 69 | 120 | 7.2 | 0 | 0 | 43 | 36 | 87 | 31.2 | 7159 |
| Office scroll, normal | 373 | 29 | 82 | 214 | 9.7 | 1 | 91 | 62 | 45 | 113 | 50.3 | 19975 |
| Office scroll, fast | 399 | 29 | 95 | 197 | 13.8 | 0 | 0 | 66 | 47 | 121 | 38.6 | 22326 |
| Expanded deck scroll | 499 | 34 | 97 | 252 | 10.8 | 0 | 0 | 74 | 26 | 106 | 56.6 | 28580 |
| Character walking | 258 | 27 | 72 | 128 | 9 | 0 | 0 | 49 | 25 | 78 | 41.9 | 18831 |
| Descent to the World | 339 | 27 | 75 | 264 | 12.2 | 1 | 97 | 53 | 67 | 124 | 50.4 | 21240 |
| City idle | 349 | 24 | 50 | 120 | 7.1 | 0 | 0 | 47 | 16 | 65 | 43.6 | 21322 |
| Ascent | 364 | 32 | 83 | 364 | 10.2 | 0 | 0 | 61 | 32 | 99 | 42.4 | 20794 |

## What the desk asks for, at rest (30 s)

Total: 3358 KB/s over 109 requests. Non-GET requests: [].

| url | requests/min | KB per request | KB/s | interval s |
|---|---:|---:|---:|---:|
| `/static/renguin-projects-v2.json` | 12 | 11660.1 | 2331.2 | 5 |
| `/api/renguin/projects` | 8 | 6652.1 | 886.6 | 6.51 |
| `/api/creator/presentation` | 8 | 471.2 | 62.8 | 6.51 |
| `/api/creator/event-statuses` | 8 | 264.7 | 35.3 | 6.5 |
| `/api/renguin/operations` | 12 | 136.2 | 27.2 | 5 |
| `/static/bionic_activity.json` | 40 | 13.5 | 9 | 1.5 |
| `/static/codex_activity.json` | 40 | 6.8 | 4.5 | 1.5 |
| `/status` | 58 | 1.3 | 1.3 | 1.01 |
| `/agents` | 18 | 0.6 | 0.2 | 3.51 |
| `/static/renguin-achievements.json` | 6 | 0.8 | 0.1 | 10 |
| `/api/creator/browser-bridge/status` | 8 | 0.3 | 0 | 6.52 |

## Interaction latency (mouse release → third painted frame)

| interaction | open/first median ms | P95 | max | close median ms | close max |
|---|---:|---:|---:|---:|---:|
| env-panel | 23.1 | 48.7 | 57.2 | 21.6 | 26.4 |
| work-history-zone | 22.1 | 38.7 | 44 | 24.4 | 35.4 |
| timeline-node | 23.6 | 54 | 62.1 | 21.9 | 31.3 |
| office-collapse | 38.2 | 44.2 | 45.5 | 42.4 | 48 |
| project deck expand / collapse | 121.6 | – | – | 115.3 | – |
| world: open_data_drawer | 31.1 | – | – | – | – |
| world: close_data_drawer | 14.2 | – | – | – | – |
| world: open_resident_card | 14.8 | – | – | – | – |
| world: close_resident_card | 14.5 | – | – | – | – |
| world: zoom_in | 72.2 | – | – | – | – |
| world: zoom_out | 60.4 | – | – | – | – |
| world: time_of_day | 42.6 | – | – | – | – |
| world: district_menu | 12.9 | – | – | – | – |

Panel cycles left 77 DOM nodes, 5 listeners and 9.4 MB of heap behind (24 toggles).

## Load

| load | usable ms | DCL | load | FCP | LCP | requests | KB | long tasks | sum ms | longest ms | script ms at usable |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| cold (no cache) | 2745 | 921 | 1246 | 192 | 908 | 145 | 41537 | 6 | 1170 | 511 | 1256 |
| warm (cache) | 2369 | 253 | 419 | 88 | 240 | 147 | 19893 | 5 | 435 | 144 | 589 |

Cold load by type: {"Document":{"n":1,"kb":243},"js":{"n":19,"kb":1613},"css":{"n":11,"kb":265},"json":{"n":24,"kb":19306},"Font":{"n":1,"kb":727},"Image":{"n":50,"kb":0},"image":{"n":36,"kb":19374},"Fetch":{"n":3,"kb":10}}. Largest: /static/renguin-projects-v2.json 11660KB; /api/renguin/projects 6652KB; /static/coffee-machine-v3-grid.webp 2501KB; /static/sync-animation-v3-grid.webp 2056KB; /static/star-idle-v5.png 1872KB; /static/error-bug-spritesheet-grid.webp 1841KB; /static/renguin-characters/residents/resident-26.png 1570KB; /static/renguin-characters/residents/resident-06.png 1490KB.

## Office → Renguin World

- world assets loaded on the way down: 484 KB · engine ready 1 ms after the last gesture
- at the desk before / after the trip: main thread 257 → 252 ms/s; world animations still running at the desk: 0; world paused: true
- worst frames on the way down: 591.6 ms at scrollY 2149, 516.7 ms at scrollY 3465, 91.6 ms at scrollY 4690, 83.4 ms at scrollY 668, 75.1 ms at scrollY 8843, 67.1 ms at scrollY 8449

## Main-thread spikes at rest (trace + JS profile, first run)

22 tasks over 8 ms in 30 s = **44/min**, 524 ms in total.

| family (what ran) | count | total ms | longest ms | period s |
|---|---:|---:|---:|---:|
| (native) after /api/renguin/operations | 11 | 287 | 42.9 | 2.15 |
| render creator-office.js:3219 < poll creator-office.js:3422 | 5 | 146 | 32.7 | 6.67 |
| (program) | 4 | 57 | 16.2 | 8.64 |
| (native) after /status | 2 | 34 | 17.7 | – |

Who owns the JavaScript time (sampled, ms per second):

| owner | ms/s |
|---|---:|
| (program) | 266.83 |
| (anon) renguin-star-office-extension.js:863 < applyRenguinBranding renguin-star-office-extension.js:847 < update renguin-star-office-extension.js:1084 | 4.64 |
| render creator-office.js:3219 < poll creator-office.js:3422 | 4.59 |
| (garbage collector) | 2.92 |
| (anon) renguin-star-office-extension.js:863 < applyRenguinBranding renguin-star-office-extension.js:847 | 2.07 |
| applyRenguinBranding renguin-star-office-extension.js:847 | 1.13 |
| [phaser] getParentBounds vendor/phaser-3.80.1.min.js:1 | 1.03 |
| applyRenguinBranding renguin-star-office-extension.js:847 < update renguin-star-office-extension.js:1084 | 0.89 |
| applyRenguinBranding renguin-star-office-extension.js:847 < update renguin-star-office-extension.js:1084 < (anon) renguin-star-office-extension.js:1134 | 0.82 |
| renderPanel renguin-star-office-extension.js:447 < update renguin-star-office-extension.js:1084 < (anon) renguin-star-office-extension.js:1134 | 0.56 |

## Audit: timers, animation-frame loops, observers, listeners (20 s at rest)

Counts in the window: {"timeoutsCreated":71,"intervalsCreated":0,"timersCleared":0,"rafRequested":5046,"rafCancelled":0,"listenersAdded":391,"listenersRemoved":0,"observersCreated":0,"observersDisconnected":0,"fetches":76,"xhrs":0,"layoutReads":230}; live listeners in the page: 680. Passive-ness of listeners added: {"pointerdown|div|passive":75,"scroll|div|passive":75,"click|button|default":8,"error|img|default":8}.

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
| timeout@8550ms cycle (/static/creator-scene.js:130:23) | 1 |
| timeout@5000ms poll (/static/creator-office.js:3475:17) | 1 |
| timeout@7700ms cycle (/static/creator-scene.js:130:23) | 1 |
| timeout@6000ms planVisit (/static/creator-transitions.js:826:17) | 1 |
| timeout@6000ms cycle (/static/creator-scene.js:130:23) | 1 |
| timeout@6850ms cycle (/static/creator-scene.js:130:23) | 1 |

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
| raf | e (/static/vendor/phaser-3.80.1.min.js:1:141103) | 2375 | 364 | 0.153 | 3.1 |
| raf | suppressUpstreamCat (/static/renguin-star-office-extension.js:1161:67) | 2375 | 159.7 | 0.067 | 0.5 |
| interval | HTMLDocument.<anonymous> (/static/renguin-star-office-extension.js:1163:12) | 27 | 76.8 | 2.844 | 3.9 |
| MutationObserver | /static/renguin-readiness.js:26:2 | 141 | 25.6 | 0.182 | 0.3 |
| forcedLayout:getBoundingClientRect | initialize.getParentBounds (/static/vendor/phaser-3.80.1.min.js:1:938942) | 40 | 24.1 | 0.602 | 1.6 |
| interval | /static/renguin-operations.js:83:3 | 20 | 23.6 | 1.18 | 1.3 |
| interval | setup (/static/creator-office.js:3779:5) | 20 | 21.9 | 1.095 | 1.5 |
| interval | HTMLDocument.<anonymous> (/static/renguin-star-office-extension.js:1164:12) | 20 | 15.9 | 0.795 | 1.3 |
| raf | /static/renguin-readiness.js:24:29 | 149 | 11.2 | 0.075 | 0.2 |
| interval | /static/renguin-readiness.js:27:14 | 400 | 7.4 | 0.018 | 0.1 |
| interval | HTMLDocument.<anonymous> (/static/renguin-star-office-extension.js:1156:12) | 14 | 4.8 | 0.343 | 0.4 |
| MutationObserver | HTMLDocument.<anonymous> (/static/renguin-star-office-extension.js:1159:28) | 114 | 4.4 | 0.039 | 0.2 |
| timeout | step (/static/renguin-star-office-extension.js:753:14) | 54 | 2.9 | 0.054 | 0.3 |
| raf | MutationObserver.render (/static/renguin-readiness.js:24:3) | 141 | 1.8 | 0.013 | 0.1 |

| fetch | count in 20 s | total ms | max ms |
|---|---:|---:|---:|
| `/status` | 20 | 422 | 90 |
| `/static/codex_activity.json` | 14 | 229 | 73 |
| `/static/bionic_activity.json` | 14 | 205 | 73 |
| `/agents` | 6 | 189 | 72 |
| `/api/creator/browser-bridge/status` | 3 | 24 | 16 |
| `/api/renguin/projects` | 3 | 1504 | 540 |
| `/api/creator/event-statuses` | 3 | 513 | 174 |
| `/api/creator/presentation` | 3 | 2508 | 912 |
| `/api/renguin/operations` | 4 | 3718 | 1334 |
| `/static/renguin-achievements.json` | 2 | 70 | 65 |
| `/static/renguin-projects-v2.json` | 4 | 90 | 66 |

## Backend latency (sequential requests, no cache)

| endpoint | status | KB | P50 ms | P95 ms | P99 ms | max ms |
|---|---:|---:|---:|---:|---:|---:|
| `/status` | 200 | 1.1 | 3 | 3.9 | 4.3 | 4.4 |
| `/api/renguin/projects` | 200 | 6651.7 | 469.5 | 494 | 495.2 | 495.5 |
| `/api/creator/event-statuses` | 200 | 264.4 | 166 | 178.6 | 179 | 179 |
| `/api/renguin/operations` | 200 | 136 | 769.3 | 785.3 | 788.9 | 789.9 |
| `/api/world/state` | 200 | 14.7 | 3.8 | 5.4 | 6.2 | 6.3 |
| `/api/creator/presentation` | 200 | 470.9 | 763.6 | 782.2 | 783 | 783.2 |
| `/agents` | 200 | 0.3 | 9.2 | 13.4 | 14.1 | 14.3 |
| `/static/bionic_activity.json` | 200 | 13.1 | 2.8 | 3.6 | 3.6 | 3.6 |
| `/static/codex_activity.json` | 200 | 6.3 | 2.9 | 3.5 | 3.6 | 3.6 |
| `/static/renguin-projects-v2.json` | 200 | 11659.6 | 25.7 | 30 | 30.2 | 30.2 |
| `/static/creator-office.js` | 200 | 150.7 | 3.2 | 3.9 | 4.6 | 4.7 |
| `/` | 200 | 243 | 3.4 | 11.3 | 15.4 | 16.4 |

## Soak: Office → panels → World → interactions → Office, repeated

| cycle | heap MB | DOM nodes | listeners | documents |
|---|---:|---:|---:|---:|
| 1 | 29.3 | 17436 | 763 | 29 |
| 2 | 29.1 | 18040 | 773 | 29 |
| 3 | 29.9 | 17145 | 758 | 29 |
| 4 | 35.3 | 17374 | 762 | 29 |
| 5 | 29.3 | 17351 | 762 | 29 |

Growth per cycle: heap 0 MB, nodes 68, listeners 1.

Wheel with the pointer over the pixel office scrolls the page: **false**.

