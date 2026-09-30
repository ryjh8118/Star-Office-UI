# Star Office performance on Production (19000) after the merge d5c93b8 — desktop 3413x960 @ DPR 1.5, 120 Hz

- label: `production-after` · target: `http://127.0.0.1:19000` · viewport: `ultrawide` (3413x960 CSS px at DPR 1.5) · runs: 2 (medians) · headless: true · 2026-09-30T15:46:12.245Z
- display refresh measured in the page: **120 Hz** (frame budget 8.33 ms)

## Frame pacing

Frame time is the interval between animation frames as the page sees them. Average FPS is a secondary number: the tail is what is felt.

| scenario | avg FPS | median ms | P95 ms | P99 ms | P99.9 ms | worst ms | >8.33 | >16.7 | >33.3 | >50 | hitches/min | missed frames |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Office idle (30 s) | 120 | 8.3 | 8.4 | 8.5 | 8.5 | 8.6 | 0 | 0 | 0 | 0 | 0 | 0.0% |
| Office first scroll of a fresh page (1500 px/s) | 104.6 | 8.3 | 16.65 | 35.27 | 85.6 | 104.2 | 51 | 21 | 10 | 5 | 428 | 12.8% |
| Office scroll, warm, normal (1500 px/s) | 112.8 | 8.3 | 12.6 | 20.9 | 26.8 | 33.2 | 81 | 20 | 1 | 0 | 340 | 6.0% |
| Office scroll, warm, fast (6000 px/s) | 98.8 | 8.35 | 22.44 | 25.13 | 40.1 | 41.7 | 52 | 23 | 3 | 0 | 829 | 17.7% |

## Main thread and CPU

Wall-clock main-thread time swings ±25% between identical runs on this machine (see the notes on measuring); style recalculations, layouts and script time are exact counters, frames are what is felt.

| scenario | main ms/s | script | style ms/s | recalcs/s | layouts/s | long tasks | longest | renderer % | GPU % | total % | heap MB | nodes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Office idle (frame recorder running in the page) | 197 | 25 | 66 | 121 | 8.4 | 0 | 0 | 37 | 35 | 73 | 24 | 6911 |
| Office idle (nothing of the harness in the page) | 186 | 21 | 63 | 121 | 6.5 | 0 | 0 | 35 | 35 | 71 | 22.8 | 7369 |
| Office first scroll | 280 | 20 | 67 | 132 | 9.9 | 1 | 93 | 57 | 37 | 100 | 27.8 | 21803 |
| Office scroll, warm, normal | 280 | 19 | 65 | 142 | 9.4 | 0 | 0 | 58 | 28 | 92 | 40.8 | 23007 |
| Office scroll, warm, fast | 286 | 18 | 70 | 125 | 13.7 | 0 | 0 | 56 | 40 | 101 | 28.4 | 17423 |

## What each part of the page costs at rest

Scrolled to each position and left alone for 6 s (the page is 7493 px tall); nothing of the harness runs in the page. Main-thread time is wall-clock and noisy; the counters (style recalcs per second, running animations) are exact.

| scroll y (px) | main ms/s | script | style ms/s | recalcs/s | renderer % | GPU % | total % | running animations |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | 182 | 21 | 57 | 121 | 35 | 34 | 70 | 67 |
| 800 | 298 | 23 | 85 | 121 | 51 | 23 | 75 | 97 |
| 1600 | 285 | 9 | 88 | 121 | 50 | 16 | 67 | 82 |
| 2600 | 224 | 9 | 54 | 121 | 41 | 15 | 57 | 52 |
| 3600 | 209 | 9 | 50 | 122 | 37 | 10 | 47 | 47 |
| 4900 | 114 | 10 | 27 | 122 | 19 | 20 | 40 | 16 |
| 5900 | 249 | 10 | 29 | 121 | 37 | 22 | 61 | 20 |
| 6600 | 244 | 10 | 31 | 121 | 35 | 21 | 57 | 21 |

## What the desk asks for, at rest (30 s)

Total: 169 KB/s over 113 requests. Non-GET requests: [].

| url | requests/min | KB per request | KB/s | interval s |
|---|---:|---:|---:|---:|
| `/api/creator/presentation` | 10 | 471.2 | 78.5 | 5.64 |
| `/api/creator/event-statuses` | 10 | 264.7 | 44.1 | 5.64 |
| `/api/renguin/operations` | 12 | 136.2 | 27.2 | 5 |
| `/static/bionic_activity.json` | 40 | 13.5 | 9 | 1.5 |
| `/static/codex_activity.json` | 40 | 6.8 | 4.5 | 1.5 |
| `/api/renguin/projects` | 10 | 23.5 | 3.9 | 5.63 |
| `/status` | 60 | 1.3 | 1.3 | 1.01 |
| `/agents` | 16 | 0.6 | 0.1 | 3.51 |
| `/static/renguin-achievements.json` | 6 | 0.8 | 0.1 | 10 |
| `/api/creator/browser-bridge/status` | 10 | 0.3 | 0.1 | 5.63 |
| `/static/renguin-projects-v2.json` | 12 | 0 | 0 | 5 |

## Load

| load | usable ms | DCL | load | FCP | LCP | requests | KB | long tasks | sum ms | longest ms | script ms at usable |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| cold (no cache) | 1348 | 339 | 403 | 116 | 324 | 144 | 41528 | 5 | 313 | 85 | 497 |
| warm (cache) | 1051 | 305 | 471 | 128 | 288 | 147 | 19884 | 4 | 327 | 132 | 507 |

Cold load by type: {"Document":{"n":1,"kb":247},"js":{"n":20,"kb":1618},"css":{"n":11,"kb":267},"json":{"n":22,"kb":19286},"Font":{"n":1,"kb":727},"Image":{"n":50,"kb":0},"image":{"n":36,"kb":19374},"Fetch":{"n":3,"kb":10}}. Largest: /static/renguin-projects-v2.json 11660KB; /api/renguin/projects 6652KB; /static/coffee-machine-v3-grid.webp 2501KB; /static/sync-animation-v3-grid.webp 2056KB; /static/star-idle-v5.png 1872KB; /static/error-bug-spritesheet-grid.webp 1841KB; /static/renguin-characters/residents/resident-26.png 1570KB; /static/renguin-characters/residents/resident-06.png 1490KB.

Wheel with the pointer over the pixel office scrolls the page: **true**.

