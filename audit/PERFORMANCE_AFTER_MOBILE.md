# Star Office performance after — phone 390x844 @ DPR 2

- label: `change` · target: `http://127.0.0.1:19393` · viewport: `mobile` (500x900 CSS px at DPR 2) · runs: 2 (medians) · headless: true · 2026-09-30T14:46:49.748Z
- display refresh measured in the page: **120 Hz** (frame budget 8.33 ms)
- Office revision on that server: `eea5e0a74dd7d78242b5df0a072e4510dbdc9565`

## Frame pacing

Frame time is the interval between animation frames as the page sees them. Average FPS is a secondary number: the tail is what is felt.

| scenario | avg FPS | median ms | P95 ms | P99 ms | P99.9 ms | worst ms | >8.33 | >16.7 | >33.3 | >50 | hitches/min | missed frames |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Office idle (30 s) | 120 | 8.3 | 8.5 | 8.55 | 8.6 | 8.6 | 0 | 0 | 0 | 0 | 0 | 0.0% |
| Office first scroll of a fresh page (1500 px/s) | 117.6 | 8.3 | 8.5 | 16.6 | 29.2 | 54.2 | 39 | 4 | 3 | 1 | 113 | 2.0% |
| Office scroll, warm, normal (1500 px/s) | 118.3 | 8.3 | 8.5 | 16.6 | 16.8 | 21 | 68 | 1 | 0 | 0 | 100 | 1.4% |
| Office scroll, warm, fast (6000 px/s) | 117.5 | 8.3 | 8.5 | 16.7 | 16.8 | 25 | 60 | 1 | 0 | 0 | 147 | 2.1% |
| Office → World descent | 118.9 | 8.3 | 8.5 | 12.6 | 14.3 | 29.1 | 14 | 1 | 1 | 0 | 57 | 0.9% |
| World: city idle | 120 | 8.3 | 8.5 | 8.55 | 8.6 | 8.6 | 0 | 0 | 0 | 0 | 0 | 0.0% |
| World: panels / zoom / district | 119.9 | 8.3 | 8.5 | 8.6 | 11.4 | 12.7 | 1 | 0 | 0 | 0 | 6 | 0.1% |
| World → Office ascent | 114.3 | 8.3 | 8.54 | 20.8 | 39.6 | 46 | 19 | 3 | 1 | 1 | 215 | 4.8% |

## Main thread and CPU

Wall-clock main-thread time swings ±25% between identical runs on this machine (see the notes on measuring); style recalculations, layouts and script time are exact counters, frames are what is felt.

| scenario | main ms/s | script | style ms/s | recalcs/s | layouts/s | long tasks | longest | renderer % | GPU % | total % | heap MB | nodes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Office idle (frame recorder running in the page) | 141 | 21 | 43 | 122 | 6.8 | 0 | 0 | 27 | 25 | 53 | 22.5 | 4302 |
| Office idle (nothing of the harness in the page) | 138 | 18 | 43 | 122 | 5.4 | 0 | 0 | 27 | 25 | 53 | 24.8 | 4360 |
| Office first scroll | 180 | 12 | 39 | 122 | 6.7 | 0 | 0 | 30 | 33 | 66 | 24.3 | 9384 |
| Office scroll, warm, normal | 184 | 12 | 38 | 122 | 6.5 | 0 | 0 | 30 | 28 | 61 | 26.8 | 9135 |
| Office scroll, warm, fast | 189 | 11 | 39 | 122 | 7.1 | 0 | 0 | 31 | 30 | 64 | 20.5 | 8897 |
| Descent to the World | 194 | 11 | 43 | 133 | 7.3 | 0 | 0 | 31 | 28 | 61 | 25 | 6784 |
| City idle | 184 | 10 | 36 | 122 | 6 | 0 | 0 | 29 | 18 | 49 | 26.2 | 6844 |
| Ascent | 243 | 21 | 67 | 157 | 33.2 | 0 | 0 | 40 | 56 | 99 | 28.1 | 7048 |

## What each part of the page costs at rest

Scrolled to each position and left alone for 6 s (the page is 10636 px tall); nothing of the harness runs in the page. Main-thread time is wall-clock and noisy; the counters (style recalcs per second, running animations) are exact.

| scroll y (px) | main ms/s | script | style ms/s | recalcs/s | renderer % | GPU % | total % | running animations |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | 143 | 19 | 44 | 122 | 28 | 25 | 53 | 47 |
| 800 | 180 | 8 | 45 | 122 | 29 | 20 | 50 | 49 |
| 1600 | 182 | 7 | 44 | 122 | 31 | 28 | 60 | 43 |
| 2600 | 152 | 7 | 32 | 122 | 25 | 24 | 51 | 29 |
| 3600 | 156 | 7 | 32 | 122 | 27 | 25 | 52 | 29 |
| 4900 | 156 | 7 | 33 | 122 | 27 | 26 | 54 | 30 |
| 5900 | 148 | 7 | 32 | 122 | 26 | 24 | 52 | 30 |
| 6600 | 145 | 7 | 33 | 122 | 24 | 21 | 46 | 31 |

## What the desk asks for, at rest (30 s)

Total: 129 KB/s over 55 requests. Non-GET requests: [].

| url | requests/min | KB per request | KB/s | interval s |
|---|---:|---:|---:|---:|
| `/api/creator/presentation` | 8 | 373.1 | 49.7 | 5.63 |
| `/api/creator/event-statuses` | 8 | 264.7 | 35.3 | 5.64 |
| `/api/renguin/operations` | 12 | 136.3 | 27.2 | 5 |
| `/static/bionic_activity.json` | 40 | 13.6 | 9 | 1.5 |
| `/static/codex_activity.json` | 40 | 6.8 | 4.5 | 1.5 |
| `/api/renguin/projects` | 8 | 23.2 | 3.1 | 5.72 |
| `/status` | 60 | 0.4 | 0.4 | 1.01 |
| `/agents` | 16 | 0.3 | 0.1 | 3.51 |
| `/static/renguin-achievements.json` | 8 | 0 | 0 | 10 |
| `/static/renguin-projects-v2.json` | 12 | 0 | 0 | 5 |
| `/api/creator/browser-bridge/status` | 8 | 0.4 | 0 | 5.72 |

## Load

| load | usable ms | DCL | load | FCP | LCP | requests | KB | long tasks | sum ms | longest ms | script ms at usable |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| cold (no cache) | 1304 | 358 | 424 | 124 | 336 | 143 | 38600 | 5 | 302 | 85 | 500 |
| warm (cache) | 873 | 253 | 309 | 184 | 240 | 140 | 19774 | 3 | 230 | 113 | 417 |

Cold load by type: {"Document":{"n":1,"kb":247},"js":{"n":20,"kb":1620},"css":{"n":11,"kb":268},"json":{"n":22,"kb":19181},"image":{"n":35.5,"kb":16547},"Font":{"n":1,"kb":727},"Image":{"n":49,"kb":0},"Fetch":{"n":3,"kb":10}}. Largest: /static/renguin-projects-v2.json 11660KB; /api/renguin/projects 6652KB; /static/coffee-machine-v3-grid.webp 2501KB; /static/sync-animation-v3-grid.webp 2056KB; /static/star-idle-v5.png 1872KB; /static/error-bug-spritesheet-grid.webp 1841KB; /static/renguin-characters/residents/resident-05.png 1476KB; /static/star-working-spritesheet-grid.webp 1378KB.

## Office → Renguin World

- world assets loaded on the way down: 197 KB · engine ready 1 ms after the last gesture
- at the desk before / after the trip: main thread 144 → 170 ms/s; world animations still running at the desk: 0; world paused: true
- worst frames on the way down: 41.5 ms at scrollY 7571, 24.9 ms at scrollY 7112, 16.8 ms at scrollY 1774, 16.8 ms at scrollY 3035, 16.8 ms at scrollY 2554, 16.8 ms at scrollY 5079

Wheel with the pointer over the pixel office scrolls the page: **true**.

