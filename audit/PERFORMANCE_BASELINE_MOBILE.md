# Star Office performance baseline — phone 390x844 @ DPR 2

- label: `reference` · target: `http://127.0.0.1:19392` · viewport: `mobile` (500x900 CSS px at DPR 2) · runs: 2 (medians) · headless: true · 2026-09-30T14:42:18.157Z
- display refresh measured in the page: **120 Hz** (frame budget 8.33 ms)
- Office revision on that server: `4108ce0bcc9493608f649160df9578651e1aa789`

## Frame pacing

Frame time is the interval between animation frames as the page sees them. Average FPS is a secondary number: the tail is what is felt.

| scenario | avg FPS | median ms | P95 ms | P99 ms | P99.9 ms | worst ms | >8.33 | >16.7 | >33.3 | >50 | hitches/min | missed frames |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Office idle (30 s) | 118.8 | 8.3 | 8.5 | 8.6 | 27.8 | 41.7 | 9 | 6 | 2 | 0 | 36 | 1.0% |
| Office first scroll of a fresh page (1500 px/s) | 115.4 | 8.3 | 8.5 | 16.75 | 46.3 | 58.4 | 50 | 12 | 6 | 1 | 184 | 3.9% |
| Office scroll, warm, normal (1500 px/s) | 115.6 | 8.3 | 8.5 | 16.75 | 42.4 | 95.8 | 96 | 17 | 12 | 3 | 178 | 3.7% |
| Office scroll, warm, fast (6000 px/s) | 114.2 | 8.3 | 8.55 | 16.8 | 53 | 62.5 | 85 | 12 | 6 | 3 | 261 | 4.9% |
| Office → World descent | 117.6 | 8.3 | 8.5 | 12.65 | 33.4 | 49.9 | 29 | 8 | 4 | 0 | 97 | 2.0% |
| World: city idle | 118.9 | 8.3 | 8.5 | 8.6 | 34.3 | 37.6 | 8 | 5 | 3 | 0 | 28 | 0.9% |
| World: panels / zoom / district | 118.6 | 8.3 | 8.5 | 8.6 | 34.1 | 45.9 | 8 | 4 | 2 | 1 | 42 | 1.2% |
| World → Office ascent | 108.7 | 8.3 | 12.65 | 30.16 | 63.8 | 70.9 | 23 | 10 | 5 | 1 | 255 | 9.5% |

## Main thread and CPU

Wall-clock main-thread time swings ±25% between identical runs on this machine (see the notes on measuring); style recalculations, layouts and script time are exact counters, frames are what is felt.

| scenario | main ms/s | script | style ms/s | recalcs/s | layouts/s | long tasks | longest | renderer % | GPU % | total % | heap MB | nodes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Office idle (frame recorder running in the page) | 169 | 22 | 45 | 120 | 7.2 | 0 | 0 | 31 | 25 | 59 | 29.4 | 4109 |
| Office idle (nothing of the harness in the page) | 165 | 19 | 46 | 120 | 6 | 0 | 0 | 31 | 25 | 58 | 32.4 | 4186 |
| Office first scroll | 277 | 23 | 56 | 141 | 6.8 | 0 | 0 | 44 | 41 | 88 | 35.9 | 9107 |
| Office scroll, warm, normal | 298 | 23 | 57 | 143 | 6.8 | 0 | 0 | 46 | 36 | 85 | 38.1 | 9090 |
| Office scroll, warm, fast | 287 | 23 | 56 | 130 | 6.9 | 0 | 0 | 45 | 37 | 85 | 37.5 | 9237 |
| Descent to the World | 276 | 23 | 56 | 142 | 7.3 | 0 | 0 | 42 | 31 | 76 | 34.5 | 6693 |
| City idle | 247 | 21 | 45 | 122 | 5.5 | 0 | 0 | 37 | 20 | 59 | 43 | 7008 |
| Ascent | 269 | 26 | 70 | 161 | 28.9 | 0 | 0 | 43 | 55 | 101 | 49.2 | 9415 |

## What each part of the page costs at rest

Scrolled to each position and left alone for 6 s (the page is 8807 px tall); nothing of the harness runs in the page. Main-thread time is wall-clock and noisy; the counters (style recalcs per second, running animations) are exact.

| scroll y (px) | main ms/s | script | style ms/s | recalcs/s | renderer % | GPU % | total % | running animations |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | 170 | 19 | 44 | 120 | 31 | 25 | 59 | 48 |
| 800 | 287 | 20 | 67 | 122 | 42 | 24 | 68 | 66 |
| 1600 | 276 | 19 | 64 | 122 | 44 | 33 | 79 | 60 |
| 2600 | 259 | 19 | 52 | 122 | 41 | 30 | 73 | 47 |
| 3600 | 251 | 18 | 52 | 122 | 39 | 30 | 71 | 46 |
| 4900 | 234 | 19 | 52 | 123 | 38 | 30 | 69 | 47 |
| 5900 | 270 | 18 | 50 | 122 | 41 | 27 | 71 | 47 |
| 6600 | 276 | 19 | 53 | 123 | 41 | 24 | 68 | 48 |

## What the desk asks for, at rest (30 s)

Total: 3344 KB/s over 55 requests. Non-GET requests: [].

| url | requests/min | KB per request | KB/s | interval s |
|---|---:|---:|---:|---:|
| `/static/renguin-projects-v2.json` | 12 | 11660.1 | 2330.3 | 5 |
| `/api/renguin/projects` | 8 | 6652.2 | 886.3 | 6.56 |
| `/api/creator/presentation` | 8 | 373.1 | 49.7 | 6.75 |
| `/api/creator/event-statuses` | 8 | 264.7 | 35.3 | 6.75 |
| `/api/renguin/operations` | 12 | 136.3 | 27.2 | 5 |
| `/static/bionic_activity.json` | 40 | 13.6 | 9 | 1.5 |
| `/static/codex_activity.json` | 40 | 6.8 | 4.5 | 1.5 |
| `/status` | 60 | 0.4 | 0.4 | 1.01 |
| `/agents` | 16 | 0.3 | 0.1 | 3.51 |
| `/static/renguin-achievements.json` | 8 | 0 | 0 | 10 |
| `/api/creator/browser-bridge/status` | 8 | 0.4 | 0 | 6.54 |

## Load

| load | usable ms | DCL | load | FCP | LCP | requests | KB | long tasks | sum ms | longest ms | script ms at usable |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| cold (no cache) | 2541 | 371 | 457 | 124 | 340 | 146 | 38609 | 6 | 368 | 80 | 506 |
| warm (cache) | 2320 | 267 | 332 | 184 | 244 | 144 | 19790 | 5 | 349 | 106 | 481 |

Cold load by type: {"Document":{"n":1,"kb":243},"js":{"n":19,"kb":1615},"css":{"n":11,"kb":265},"image":{"n":35.5,"kb":16547},"Font":{"n":1,"kb":727},"json":{"n":26,"kb":19202},"Image":{"n":49,"kb":0},"Fetch":{"n":3,"kb":10}}. Largest: /static/renguin-projects-v2.json 11660KB; /api/renguin/projects 6652KB; /static/coffee-machine-v3-grid.webp 2501KB; /static/sync-animation-v3-grid.webp 2056KB; /static/star-idle-v5.png 1872KB; /static/error-bug-spritesheet-grid.webp 1841KB; /static/renguin-characters/residents/resident-05.png 1476KB; /static/star-working-spritesheet-grid.webp 1378KB.

## Office → Renguin World

- world assets loaded on the way down: 197 KB · engine ready 3 ms after the last gesture
- at the desk before / after the trip: main thread 165 → 223 ms/s; world animations still running at the desk: 0; world paused: true
- worst frames on the way down: 49.9 ms at scrollY 5739, 33.4 ms at scrollY 1984, 33.3 ms at scrollY 7413, 33.2 ms at scrollY 1999, 33.2 ms at scrollY 8433, 16.8 ms at scrollY 214

Wheel with the pointer over the pixel office scrolls the page: **false**.

