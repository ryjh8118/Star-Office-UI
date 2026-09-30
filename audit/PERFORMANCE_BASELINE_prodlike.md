# Star Office performance baseline — production-like reference (master 4108ce0 plus the runtime overlay, Preview 19392)

- label: `baseline-prodlike-master` · target: `http://127.0.0.1:19392` · viewport: `ultrawide` (3413x960 CSS px at DPR 1.5) · runs: 3 (medians) · headless: true · 2026-09-30T09:03:52.463Z
- display refresh measured in the page: **120 Hz** (frame budget 8.33 ms)
- Office revision on that server: `4108ce0bcc9493608f649160df9578651e1aa789`

## Frame pacing

Frame time is the interval between animation frames as the page sees them. Average FPS is a secondary number: the tail is what is felt.

| scenario | avg FPS | median ms | P95 ms | P99 ms | P99.9 ms | worst ms | >8.33 | >16.7 | >33.3 | >50 | hitches/min | missed frames |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Office idle (30 s) | 118.9 | 8.3 | 8.5 | 8.6 | 33.2 | 41.7 | 19 | 11 | 3 | 0 | 32 | 0.9% |
| Office scroll, normal (1500 px/s) | 87.6 | 8.4 | 16.8 | 33.4 | 110 | 1041.7 | 246 | 48 | 15 | 8 | 1014 | 27.0% |
| Office scroll, fast (6000 px/s) | 88.3 | 8.4 | 25 | 33.37 | 41.8 | 41.8 | 82 | 28 | 6 | 0 | 1309 | 26.4% |
| Project list: expanded deck scroll | 89.8 | 8.4 | 16.8 | 36.6 | 60.7 | 66.7 | 86 | 18 | 8 | 1 | 1279 | 25.2% |
| Character walking (DOM) | 119 | 8.3 | 8.5 | 8.6 | 33.2 | 33.3 | 3 | 3 | 1 | 0 | 23 | 0.8% |
| Office → World descent | 84.1 | 8.3 | 16.7 | 58.28 | 575.3 | 1066.6 | 35 | 20 | 12 | 8 | 339 | 29.9% |
| World: city idle | 118.9 | 8.3 | 8.5 | 8.6 | 33.2 | 33.4 | 8 | 5 | 2 | 0 | 32 | 0.9% |
| World: panels / zoom / district | 118.3 | 8.3 | 8.5 | 8.6 | 25.1 | 33.3 | 11 | 6 | 0 | 0 | 62 | 1.4% |
| World → Office ascent | 106.3 | 8.3 | 16.7 | 25.03 | 37.1 | 41.7 | 52 | 16 | 3 | 0 | 573 | 11.4% |

## Main thread and CPU

Wall-clock main-thread time swings ±25% between identical runs on this machine (see the notes on measuring); style recalculations, layouts and script time are exact counters, frames are what is felt.

| scenario | main ms/s | script | style ms/s | recalcs/s | layouts/s | long tasks | longest | renderer % | GPU % | total % | heap MB | nodes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Office idle | 260 | 29 | 81 | 120 | 7.2 | 0 | 0 | 47 | 34 | 89 | 54.4 | 5684 |
| Office scroll, normal | 353 | 28 | 76 | 188 | 9.3 | 1 | 60 | 58 | 58 | 122 | 50.4 | 11697 |
| Office scroll, fast | 369 | 27 | 92 | 184 | 13.3 | 0 | 0 | 61 | 61 | 129 | 31.3 | 9955 |
| Expanded deck scroll | 489 | 33 | 87 | 219 | 12.7 | 0 | 0 | 70 | 50 | 128 | 45.5 | 18177 |
| Character walking | 251 | 26 | 72 | 128 | 8.9 | 0 | 0 | 47 | 33 | 83 | 46.4 | 10448 |
| Descent to the World | 264 | 27 | 56 | 288 | 11 | 1 | 58 | 42 | 72 | 122 | 33.1 | 10000 |
| City idle | 268 | 24 | 46 | 120 | 6.7 | 0 | 0 | 39 | 18 | 61 | 28.9 | 10923 |
| Ascent | 339 | 30 | 83 | 386 | 8.8 | 0 | 0 | 54 | 42 | 100 | 60.5 | 12544 |

## What the desk asks for, at rest (30 s)

Total: 3344 KB/s over 110 requests. Non-GET requests: [].

| url | requests/min | KB per request | KB/s | interval s |
|---|---:|---:|---:|---:|
| `/static/renguin-projects-v2.json` | 12 | 11660.1 | 2330.9 | 5 |
| `/api/renguin/projects` | 8 | 6652.2 | 886.5 | 6.76 |
| `/api/creator/presentation` | 8 | 373.1 | 49.7 | 7 |
| `/api/creator/event-statuses` | 8 | 264.7 | 35.3 | 7 |
| `/api/renguin/operations` | 12 | 136.3 | 27.2 | 5 |
| `/static/bionic_activity.json` | 40 | 13.6 | 9 | 1.5 |
| `/static/codex_activity.json` | 40 | 6.8 | 4.5 | 1.5 |
| `/status` | 60 | 0.4 | 0.4 | 1.01 |
| `/agents` | 18 | 0.3 | 0.1 | 3.51 |
| `/static/renguin-achievements.json` | 6 | 0 | 0 | 10 |
| `/api/creator/browser-bridge/status` | 8 | 0.4 | 0 | 6.75 |

## Interaction latency (mouse release → third painted frame)

| interaction | open/first median ms | P95 | max | close median ms | close max |
|---|---:|---:|---:|---:|---:|
| env-panel | 22.4 | 78.7 | 95 | 22.9 | 26.4 |
| work-history-zone | 21.4 | 38.8 | 44.3 | 23 | 30.1 |
| timeline-node | 25.3 | 42.9 | 48 | 24 | 33.1 |
| office-collapse | 34.4 | 42.7 | 43.8 | 41.6 | 48 |
| project deck expand / collapse | 151.7 | – | – | 143.7 | – |
| world: open_data_drawer | 31.4 | – | – | – | – |
| world: close_data_drawer | 15.6 | – | – | – | – |
| world: open_resident_card | 19.3 | – | – | – | – |
| world: close_resident_card | 14.9 | – | – | – | – |
| world: zoom_in | 36.6 | – | – | – | – |
| world: zoom_out | 25.4 | – | – | – | – |
| world: time_of_day | 19.2 | – | – | – | – |
| world: district_menu | 14.2 | – | – | – | – |

Panel cycles left 100 DOM nodes, 3 listeners and 1.5 MB of heap behind (24 toggles).

## Load

| load | usable ms | DCL | load | FCP | LCP | requests | KB | long tasks | sum ms | longest ms | script ms at usable |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| cold (no cache) | 2951 | 861 | 1197 | 236 | 844 | 146 | 50401 | 6 | 1199 | 485 | 1287 |
| warm (cache) | 2644 | 272 | 463 | 84 | 256 | 145 | 19790 | 5 | 446 | 146 | 617 |

Cold load by type: {"Document":{"n":1,"kb":243},"js":{"n":19,"kb":1615},"css":{"n":11,"kb":265},"json":{"n":27,"kb":30998},"Font":{"n":1,"kb":727},"Image":{"n":50,"kb":0},"image":{"n":34,"kb":16543},"Fetch":{"n":3,"kb":10}}. Largest: /static/renguin-projects-v2.json 11660KB; /api/renguin/projects 6652KB; /static/coffee-machine-v3-grid.webp 2501KB; /static/sync-animation-v3-grid.webp 2056KB; /static/star-idle-v5.png 1872KB; /static/error-bug-spritesheet-grid.webp 1841KB; /static/renguin-characters/residents/resident-05.png 1476KB; /static/star-working-spritesheet-grid.webp 1378KB.

## Office → Renguin World

- world assets loaded on the way down: 2980 KB · engine ready 3 ms after the last gesture
- at the desk before / after the trip: main thread 240 → 226 ms/s; world animations still running at the desk: 0; world paused: true
- worst frames on the way down: 1000 ms at scrollY 3283, 91.7 ms at scrollY 613, 83.1 ms at scrollY 3485, 66.9 ms at scrollY 768, 58.5 ms at scrollY 4765, 58.3 ms at scrollY 281

## Main-thread spikes at rest (trace + JS profile, first run)

19 tasks over 8 ms in 30 s = **38/min**, 434 ms in total.

| family (what ran) | count | total ms | longest ms | period s |
|---|---:|---:|---:|---:|
| (native) after /api/renguin/operations | 6 | 156 | 38.5 | 4.99 |
| render creator-office.js:3219 < poll creator-office.js:3422 | 4 | 114 | 30.9 | 6.72 |
| (program) | 5 | 89 | 34.2 | 7.38 |
| (native) after /status | 2 | 42 | 32.8 | – |
| (native) after /static/bionic_activity.json | 2 | 34 | 16.9 | – |

Who owns the JavaScript time (sampled, ms per second):

| owner | ms/s |
|---|---:|
| (program) | 228.91 |
| render creator-office.js:3219 < poll creator-office.js:3422 | 3.59 |
| (garbage collector) | 3.14 |
| (anon) renguin-star-office-extension.js:863 < applyRenguinBranding renguin-star-office-extension.js:847 < update renguin-star-office-extension.js:1084 | 3.03 |
| (anon) renguin-star-office-extension.js:863 < applyRenguinBranding renguin-star-office-extension.js:847 | 1.74 |
| applyRenguinBranding renguin-star-office-extension.js:847 < update renguin-star-office-extension.js:1084 < (anon) renguin-star-office-extension.js:1134 | 0.91 |
| applyRenguinBranding renguin-star-office-extension.js:847 | 0.86 |
| applyRenguinBranding renguin-star-office-extension.js:847 < update renguin-star-office-extension.js:1084 | 0.78 |
| [phaser] getParentBounds vendor/phaser-3.80.1.min.js:1 | 0.77 |
| renderPanel renguin-star-office-extension.js:447 < update renguin-star-office-extension.js:1084 < (anon) renguin-star-office-extension.js:1134 | 0.51 |

## Audit: timers, animation-frame loops, observers, listeners (20 s at rest)

Counts in the window: {"timeoutsCreated":66,"intervalsCreated":0,"timersCleared":0,"rafRequested":5038,"rafCancelled":0,"listenersAdded":391,"listenersRemoved":0,"observersCreated":0,"observersDisconnected":0,"fetches":76,"xhrs":0,"layoutReads":230}; live listeners in the page: 480. Passive-ness of listeners added: {"pointerdown|div|passive":75,"scroll|div|passive":75,"click|button|default":8,"error|img|default":8}.

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
| timeout@5000ms poll (/static/creator-office.js:3475:17) | 1 |
| timeout@7700ms cycle (/static/creator-scene.js:130:23) | 1 |
| timeout@6000ms planVisit (/static/creator-transitions.js:826:17) | 1 |
| timeout@6000ms cycle (/static/creator-scene.js:130:23) | 1 |
| timeout@6850ms cycle (/static/creator-scene.js:130:23) | 1 |
| timeout@8550ms cycle (/static/creator-scene.js:130:23) | 1 |

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
| raf | e (/static/vendor/phaser-3.80.1.min.js:1:141103) | 2383 | 291 | 0.122 | 2.2 |
| raf | suppressUpstreamCat (/static/renguin-star-office-extension.js:1161:67) | 2383 | 117.3 | 0.049 | 0.6 |
| interval | HTMLDocument.<anonymous> (/static/renguin-star-office-extension.js:1163:12) | 27 | 59.7 | 2.211 | 2.9 |
| interval | /static/renguin-operations.js:83:3 | 20 | 23.2 | 1.16 | 1.5 |
| interval | setup (/static/creator-office.js:3779:5) | 20 | 20.7 | 1.035 | 1.2 |
| forcedLayout:getBoundingClientRect | initialize.getParentBounds (/static/vendor/phaser-3.80.1.min.js:1:938942) | 34 | 16 | 0.471 | 0.9 |
| MutationObserver | /static/renguin-readiness.js:26:2 | 129 | 15.8 | 0.122 | 0.3 |
| interval | HTMLDocument.<anonymous> (/static/renguin-star-office-extension.js:1164:12) | 20 | 10.8 | 0.54 | 1.8 |
| raf | /static/renguin-readiness.js:24:29 | 136 | 8.8 | 0.065 | 0.2 |
| interval | /static/renguin-readiness.js:27:14 | 400 | 7.5 | 0.019 | 0.1 |
| interval | HTMLDocument.<anonymous> (/static/renguin-star-office-extension.js:1156:12) | 14 | 4 | 0.286 | 0.4 |
| timeout | step (/static/renguin-star-office-extension.js:753:14) | 49 | 2.1 | 0.043 | 0.2 |
| MutationObserver | HTMLDocument.<anonymous> (/static/renguin-star-office-extension.js:1159:28) | 102 | 1.8 | 0.018 | 0.1 |
| timeout | cycle (/static/creator-scene.js:130:23) | 13 | 1.6 | 0.123 | 0.3 |

| fetch | count in 20 s | total ms | max ms |
|---|---:|---:|---:|
| `/static/codex_activity.json` | 14 | 210 | 68 |
| `/static/bionic_activity.json` | 14 | 202 | 68 |
| `/agents` | 6 | 55 | 32 |
| `/status` | 20 | 299 | 146 |
| `/api/creator/browser-bridge/status` | 3 | 11 | 4 |
| `/api/renguin/projects` | 3 | 1398 | 471 |
| `/api/creator/event-statuses` | 3 | 556 | 220 |
| `/api/creator/presentation` | 3 | 3200 | 1192 |
| `/api/renguin/operations` | 4 | 4163 | 1802 |
| `/static/renguin-achievements.json` | 2 | 6 | 3 |
| `/static/renguin-projects-v2.json` | 4 | 31 | 21 |

## Backend latency (sequential requests, no cache)

| endpoint | status | KB | P50 ms | P95 ms | P99 ms | max ms |
|---|---:|---:|---:|---:|---:|---:|
| `/status` | 200 | 0.1 | 2.4 | 2.7 | 2.7 | 2.7 |
| `/api/renguin/projects` | 200 | 6651.7 | 456.3 | 492.4 | 520.6 | 527.6 |
| `/api/creator/event-statuses` | 200 | 264.4 | 163.6 | 184.5 | 188.7 | 189.7 |
| `/api/renguin/operations` | 200 | 136 | 755.9 | 788.6 | 798.2 | 800.6 |
| `/api/world/state` | 200 | 10.9 | 3.4 | 3.8 | 3.9 | 3.9 |
| `/api/creator/presentation` | 200 | 372.8 | 975.8 | 997.3 | 998.7 | 999.1 |
| `/agents` | 200 | 0 | 4 | 4.4 | 4.4 | 4.4 |
| `/static/bionic_activity.json` | 200 | 13.1 | 2.5 | 2.7 | 2.8 | 2.8 |
| `/static/codex_activity.json` | 200 | 6.3 | 2.5 | 2.7 | 2.8 | 2.8 |
| `/static/renguin-projects-v2.json` | 200 | 11659.6 | 30.9 | 44.7 | 54.1 | 56.4 |
| `/static/creator-office.js` | 200 | 150.7 | 2.8 | 3.1 | 3.3 | 3.3 |
| `/` | 200 | 243 | 3.1 | 3.3 | 3.4 | 3.4 |

## Soak: Office → panels → World → interactions → Office, repeated

| cycle | heap MB | DOM nodes | listeners | documents |
|---|---:|---:|---:|---:|
| 1 | 28.8 | 10361 | 550 | 24 |
| 2 | 28.4 | 10289 | 541 | 24 |
| 3 | 28.7 | 10338 | 546 | 24 |
| 4 | 29.3 | 10306 | 545 | 24 |
| 5 | 28.6 | 10288 | 541 | 24 |

Growth per cycle: heap 0.22 MB, nodes -11, listeners -1.2.

Wheel with the pointer over the pixel office scrolls the page: **false**.

