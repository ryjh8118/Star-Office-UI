# Before / after — desktop (3413x960 CSS px at DPR 1.5, 120 Hz), medians of interleaved runs on one warm browser profile

| metric | before | after | change |
|---|---:|---:|---:|
| **Office idle (top of the desk, 30 s)** | | | |
| Average FPS | 119 | 120 | +1.0% |
| Frame time P95 | 8.5 ms | 8.5 ms | 0.0% |
| Frame time P99 | 8.6 ms | 8.5 ms | -1.2% |
| Frame time P99.9 | 33.343 ms | 8.6 ms | -74.2% ✅ |
| Worst frame | 50 ms | 8.6 ms | -82.8% ✅ |
| Frames > 16.7 ms | 10 | 0 | -100.0% ✅ |
| Hitches / min (frame > 1.5x budget) | 32 | 0 | -100.0% ✅ |
| Missed-frame ratio | 0.01 | 0 | -100.0% ✅ |
| Long tasks > 50 ms | 0 | 0 | same |
| Main thread busy | 197 ms/s | 164 ms/s | -16.4% ✅ |
|   script | 22.7 ms/s | 21.3 ms/s | -6.2% ✅ |
|   style recalcs | 120 /s | 122 /s | +1.2% |
|   style time | 58.6 ms/s | 54.4 ms/s | -7.2% ✅ |
|   layouts | 7 /s | 6.2 /s | -11.4% ✅ |
| CPU (renderer+GPU+browser) | 64.1 % core | 57 % core | -11.1% ✅ |
|   renderer | 35.8 % core | 31.1 % core | -13.1% ✅ |
|   GPU process | 26.1 % core | 24.9 % core | -4.6% ✅ |
| Polling traffic | 3345 KB/s | 152 KB/s | -95.5% ✅ |
| JS heap | 38.1 MB | 17.6 MB | -53.8% ✅ |
| Main thread busy (nothing of the harness in the page) | 185 ms/s | 160 ms/s | -13.3% ✅ |
|   style recalcs (same window) | 120 /s | 121 /s | +1.3% |
|   CPU of the whole browser (same window) | 61.8 % core | 56.3 % core | -8.9% ✅ |
| **Entry film (a returning reader: held at the airlock while the desk loads underneath)** | | | |
| Held: frame time P99 | 43.692 ms | 52.206 ms | +19.5% ⚠️ |
| Held: worst frame | 91.6 ms | 99.9 ms | +9.1% ⚠️ |
| Held: frames > 50 ms | 4 | 5 | +25.0% ⚠️ |
| Held: missed-frame ratio | 0.105 | 0.107 | +1.9% |
| Held: long tasks | 2 | 1 | -50.0% ✅ |
| The way in: worst frame | 8.5 ms | 8.6 ms | +1.2% |
| First visit, the way in: worst frame | 16.6 ms | 8.6 ms | -48.2% ✅ |
| **What each part of the page costs at rest (main thread ms/s)** | | | |
| top of the page | 199 ms/s | 169 ms/s | -14.8% ✅ |
| y = 800 | 349 ms/s | 279 ms/s | -20.1% ✅ |
| y = 1600 | 354 ms/s | 263 ms/s | -25.6% ✅ |
| y = 2600 (decks) | 297 ms/s | 199 ms/s | -33.1% ✅ |
| y = 3600 | 281 ms/s | 197 ms/s | -29.8% ✅ |
| y = 4900 (timeline) | 196 ms/s | 76.6 ms/s | -60.9% ✅ |
| y = 5900 (world gate) | 226 ms/s | 180 ms/s | -20.0% ✅ |
| y = 6600 (world) | 212 ms/s | 174 ms/s | -17.8% ✅ |
| CPU of the whole browser at y = 1600 | 105 % core | 89.1 % core | -14.9% ✅ |
| CPU of the whole browser at y = 2600 | 99.2 % core | 81.5 % core | -17.8% ✅ |
| CPU of the whole browser at y = 4900 | 30.35 % core | 18.9 % core | -37.7% ✅ |
| Running animations at y = 2600 | 58.5 | 46 | -21.4% ✅ |
| Running animations at y = 4900 | 19.5 | 14 | -28.2% ✅ |
| **Office first scroll of a fresh page (1500 px/s, down and up once: its tiles have never been drawn)** | | | |
| Average FPS | 103 | 108 | +5.6% ✅ |
| Frame time P95 | 16.7 ms | 16.7 ms | 0.0% |
| Frame time P99 | 25 ms | 24.9 ms | -0.4% |
| Worst frame | 50.1 ms | 50.1 ms | 0.0% |
| Frames > 33.3 ms | 4 | 2 | -50.0% ✅ |
| Frames > 50 ms | 1 | 1 | 0.0% |
| Missed-frame ratio | 0.144 | 0.096 | -33.3% ✅ |
| CPU (renderer+GPU+browser) | 117 % core | 103 % core | -12.3% ✅ |
| **Office normal scroll, warm (1500 px/s)** | | | |
| Average FPS | 104 | 107 | +3.1% ✅ |
| Frame time P95 | 16.7 ms | 16.7 ms | 0.0% |
| Frame time P99 | 24.9 ms | 16.8 ms | -32.5% ✅ |
| Worst frame | 41.7 ms | 41.6 ms | -0.2% |
| Frames > 16.7 ms | 17 | 12 | -29.4% ✅ |
| Frames > 33.3 ms | 6 | 1 | -83.3% ✅ |
| Missed-frame ratio | 0.136 | 0.109 | -19.9% ✅ |
| Long tasks > 50 ms | 0 | 0 | same |
| Main thread busy | 340 ms/s | 235 ms/s | -30.8% ✅ |
|   style recalcs | 226 /s | 128 /s | -43.4% ✅ |
| CPU (renderer+GPU+browser) | 96.3 % core | 88.5 % core | -8.1% ✅ |
| **Office fast scroll (6000 px/s)** | | | |
| Average FPS | 94.5 | 96.9 | +2.5% ✅ |
| Frame time P95 | 25 ms | 16.8 ms | -32.8% ✅ |
| Frame time P99 | 25.2 ms | 25.1 ms | -0.4% |
| Worst frame | 33.4 ms | 33.5 ms | +0.3% |
| Missed-frame ratio | 0.213 | 0.193 | -9.4% ✅ |
| **Project list (deck expanded to every project)** | | | |
| Expand latency | 146 ms | 150 ms | +2.6% ⚠️ |
| Scroll: frame time P99 | 33.426 ms | 20.876 ms | -37.5% ✅ |
| Scroll: worst frame | 95.75 ms | 49.9 ms | -47.9% ✅ |
| Scroll: missed-frame ratio | 0.178 | 0.081 | -54.5% ✅ |
| **Panels / drawers** | | | |
| env panel open | 22.2 ms | 22.6 ms | +1.8% |
| work-history toggle | 22.55 ms | 23.3 ms | +3.3% ⚠️ |
| office collapse | 33.85 ms | 30.375 ms | -10.3% ✅ |
| Heap growth over 24 toggles | 5.25 MB | 1.15 MB | -78.1% ✅ |
| Listener growth over 24 toggles | 36.5 | 39 | +6.8% ⚠️ |
| **Office -> Renguin World** | | | |
| Descent: frame time P99 | 25.022 ms | 24.95 ms | -0.3% |
| Descent: worst frame | 87.5 ms | 62.55 ms | -28.5% ✅ |
| Descent: missed-frame ratio | 0.108 | 0.078 | -27.8% ✅ |
| Descent: long tasks > 50 ms | 1 | 0.5 | -50.0% ✅ |
| World assets loaded | 460 KB | 460 KB | 0.0% |
| City idle: frame time P99 | 8.6 ms | 8.6 ms | 0.0% |
| City idle: main thread | 240 ms/s | 195 ms/s | -18.5% ✅ |
| City idle: CPU | 56.8 % core | 49.15 % core | -13.5% ✅ |
| City interactions: worst frame | 41.65 ms | 29.25 ms | -29.8% ✅ |
| Ascent: frame time P99 | 23.975 ms | 16.75 ms | -30.1% ✅ |
| Ascent: missed-frame ratio | 0.092 | 0.064 | -30.4% ✅ |
| Back at the desk: world animations still running | 0 | 0 | same |
| Desk idle after the trip: main thread | 205 ms/s | 179 ms/s | -12.8% ✅ |
| **Load** | | | |
| Time to usable UI (cold) | 2581 ms | 1276 ms | -50.6% ✅ |
| Time to usable UI (warm) | 2345 ms | 908 ms | -61.3% ✅ |
| Cold: long tasks total | 339 ms | 293 ms | -13.6% ✅ |
| Cold: longest task | 89 ms | 85 ms | -4.5% ✅ |
| Cold: main-thread script at usable | 521 ms | 499 ms | -4.2% ✅ |
| Cold: transferred | 38605 KB | 38596 KB | -0.0% |
| Warm: transferred | 19789 KB | 19773 KB | -0.1% |
| **Soak (repeated Office -> World -> Office)** | | | |
| Heap growth / cycle | 0.13 MB | 0.16 MB | +23.1% ⚠️ |
| DOM nodes / cycle | -2 | 12 | +700.0% ⚠️ |
| Listeners / cycle | -0.1 | 0.7 | +800.0% ⚠️ |
| **Backend (P50 / P95 ms per request)** | | | |
| /api/renguin/projects P50 | 371 ms | 49.06 ms | -86.8% ✅ |
| /api/renguin/projects P95 | 393 ms | 222 ms | -43.6% ✅ |
| /api/renguin/projects size | 6651 KB | 6652 KB | +0.0% |
| /api/creator/presentation P50 | 821 ms | 16.13 ms | -98.0% ✅ |
| /api/creator/presentation P95 | 877 ms | 52.32 ms | -94.0% ✅ |
| /api/creator/event-statuses P50 | 146 ms | 6.97 ms | -95.2% ✅ |
| /api/renguin/operations P50 | 591 ms | 210 ms | -64.5% ✅ |
| /status P95 | 2.74 ms | 2.87 ms | +4.7% ⚠️ |
| **Main-thread spikes at idle (trace + profile, 30 s)** | | | |
| Tasks > 8 ms / min | 42 | 0 | -100.0% ✅ |
| Time in those tasks | 509 ms | 0 ms | -100.0% ✅ |
