# Before / after — phone (390x844 CSS px at DPR 2, touch), medians of 2 interleaved runs

| metric | before | after | change |
|---|---:|---:|---:|
| **Office idle (top of the desk, 30 s)** | | | |
| Average FPS | 119 | 120 | +1.0% |
| Frame time P95 | 8.5 ms | 8.5 ms | 0.0% |
| Frame time P99 | 8.6 ms | 8.55 ms | -0.6% |
| Frame time P99.9 | 27.812 ms | 8.6 ms | -69.1% ✅ |
| Worst frame | 41.7 ms | 8.6 ms | -79.4% ✅ |
| Frames > 16.7 ms | 5.5 | 0 | -100.0% ✅ |
| Hitches / min (frame > 1.5x budget) | 36 | 0 | -100.0% ✅ |
| Missed-frame ratio | 0.01 | 0 | -100.0% ✅ |
| Long tasks > 50 ms | 0 | 0 | same |
| Main thread busy | 169 ms/s | 141 ms/s | -16.3% ✅ |
|   script | 21.85 ms/s | 20.95 ms/s | -4.1% ✅ |
|   style recalcs | 120 /s | 122 /s | +1.2% |
|   style time | 45 ms/s | 42.8 ms/s | -4.9% ✅ |
|   layouts | 7.2 /s | 6.8 /s | -5.6% ✅ |
| CPU (renderer+GPU+browser) | 58.75 % core | 52.85 % core | -10.0% ✅ |
|   renderer | 31.05 % core | 27.2 % core | -12.4% ✅ |
|   GPU process | 25.3 % core | 24.65 % core | -2.6% ✅ |
| Polling traffic | 3344 KB/s | 129 KB/s | -96.1% ✅ |
| JS heap | 29.4 MB | 22.5 MB | -23.5% ✅ |
| Main thread busy (nothing of the harness in the page) | 165 ms/s | 138 ms/s | -16.2% ✅ |
|   style recalcs (same window) | 120 /s | 122 /s | +1.0% |
|   CPU of the whole browser (same window) | 58 % core | 52.9 % core | -8.8% ✅ |
| **Entry film (a returning reader: held at the airlock while the desk loads underneath)** | | | |
| Held: frame time P99 | n/a | n/a |  |
| Held: worst frame | n/a | n/a |  |
| Held: frames > 50 ms | n/a | n/a |  |
| Held: missed-frame ratio | n/a | n/a |  |
| Held: long tasks | n/a | n/a |  |
| The way in: worst frame | n/a | n/a |  |
| First visit, the way in: worst frame | n/a | n/a |  |
| **What each part of the page costs at rest (main thread ms/s)** | | | |
| top of the page | 170 ms/s | 143 ms/s | -15.5% ✅ |
| y = 800 | 287 ms/s | 180 ms/s | -37.4% ✅ |
| y = 1600 | 276 ms/s | 182 ms/s | -34.2% ✅ |
| y = 2600 (decks) | 259 ms/s | 152 ms/s | -41.2% ✅ |
| y = 3600 | 251 ms/s | 156 ms/s | -37.8% ✅ |
| y = 4900 (timeline) | 234 ms/s | 156 ms/s | -33.3% ✅ |
| y = 5900 (world gate) | 270 ms/s | 148 ms/s | -45.4% ✅ |
| y = 6600 (world) | 276 ms/s | 145 ms/s | -47.3% ✅ |
| CPU of the whole browser at y = 1600 | 78.8 % core | 60.4 % core | -23.4% ✅ |
| CPU of the whole browser at y = 2600 | 72.95 % core | 50.65 % core | -30.6% ✅ |
| CPU of the whole browser at y = 4900 | 69.45 % core | 53.8 % core | -22.5% ✅ |
| Running animations at y = 2600 | 46.5 | 29 | -37.6% ✅ |
| Running animations at y = 4900 | 47 | 30 | -36.2% ✅ |
| **Office first scroll of a fresh page (1500 px/s, down and up once: its tiles have never been drawn)** | | | |
| Average FPS | 115 | 118 | +2.0% |
| Frame time P95 | 8.5 ms | 8.5 ms | 0.0% |
| Frame time P99 | 16.752 ms | 16.6 ms | -0.9% |
| Worst frame | 58.35 ms | 54.15 ms | -7.2% ✅ |
| Frames > 33.3 ms | 6 | 2.5 | -58.3% ✅ |
| Frames > 50 ms | 0.5 | 0.5 | 0.0% |
| Missed-frame ratio | 0.039 | 0.02 | -48.7% ✅ |
| CPU (renderer+GPU+browser) | 88.2 % core | 66 % core | -25.2% ✅ |
| **Office normal scroll, warm (1500 px/s)** | | | |
| Average FPS | 116 | 118 | +2.4% ✅ |
| Frame time P95 | 8.5 ms | 8.5 ms | 0.0% |
| Frame time P99 | 16.75 ms | 16.6 ms | -0.9% |
| Worst frame | 95.8 ms | 21 ms | -78.1% ✅ |
| Frames > 16.7 ms | 17 | 0.5 | -97.1% ✅ |
| Frames > 33.3 ms | 11.5 | 0 | -100.0% ✅ |
| Missed-frame ratio | 0.037 | 0.014 | -62.2% ✅ |
| Long tasks > 50 ms | 0 | 0 | same |
| Main thread busy | 298 ms/s | 184 ms/s | -38.2% ✅ |
|   style recalcs | 143 /s | 122 /s | -14.4% ✅ |
| CPU (renderer+GPU+browser) | 84.85 % core | 61.4 % core | -27.6% ✅ |
| **Office fast scroll (6000 px/s)** | | | |
| Average FPS | 114 | 117 | +2.9% ✅ |
| Frame time P95 | 8.55 ms | 8.5 ms | -0.6% |
| Frame time P99 | 16.8 ms | 16.7 ms | -0.6% |
| Worst frame | 62.5 ms | 25 ms | -60.0% ✅ |
| Missed-frame ratio | 0.049 | 0.021 | -57.1% ✅ |
| **Project list (deck expanded to every project)** | | | |
| Expand latency | n/a | n/a |  |
| Scroll: frame time P99 | n/a | n/a |  |
| Scroll: worst frame | n/a | n/a |  |
| Scroll: missed-frame ratio | n/a | n/a |  |
| **Panels / drawers** | | | |
| env panel open | n/a | n/a |  |
| work-history toggle | n/a | n/a |  |
| office collapse | n/a | n/a |  |
| Heap growth over 24 toggles | n/a | n/a |  |
| Listener growth over 24 toggles | n/a | n/a |  |
| **Office -> Renguin World** | | | |
| Descent: frame time P99 | 12.65 ms | 12.6 ms | -0.4% |
| Descent: worst frame | 49.9 ms | 29.05 ms | -41.8% ✅ |
| Descent: missed-frame ratio | 0.02 | 0.009 | -55.0% ✅ |
| Descent: long tasks > 50 ms | 0 | 0 | same |
| World assets loaded | 197 KB | 197 KB | 0.0% |
| City idle: frame time P99 | 8.6 ms | 8.55 ms | -0.6% |
| City idle: main thread | 247 ms/s | 184 ms/s | -25.2% ✅ |
| City idle: CPU | 59.05 % core | 48.55 % core | -17.8% ✅ |
| City interactions: worst frame | 45.85 ms | 12.7 ms | -72.3% ✅ |
| Ascent: frame time P99 | 30.155 ms | 20.799 ms | -31.0% ✅ |
| Ascent: missed-frame ratio | 0.095 | 0.048 | -49.5% ✅ |
| Back at the desk: world animations still running | 0 | 0 | same |
| Desk idle after the trip: main thread | 223 ms/s | 170 ms/s | -23.9% ✅ |
| **Load** | | | |
| Time to usable UI (cold) | 2541 ms | 1304 ms | -48.7% ✅ |
| Time to usable UI (warm) | 2320 ms | 873 ms | -62.4% ✅ |
| Cold: long tasks total | 368 ms | 302 ms | -18.1% ✅ |
| Cold: longest task | 80 ms | 84.5 ms | +5.6% ⚠️ |
| Cold: main-thread script at usable | 506 ms | 500 ms | -1.1% |
| Cold: transferred | 38609 KB | 38600 KB | -0.0% |
| Warm: transferred | 19790 KB | 19774 KB | -0.1% |
| **Soak (repeated Office -> World -> Office)** | | | |
| Heap growth / cycle | n/a | n/a |  |
| DOM nodes / cycle | n/a | n/a |  |
| Listeners / cycle | n/a | n/a |  |
| **Backend (P50 / P95 ms per request)** | | | |
| /api/renguin/projects P50 | n/a | n/a |  |
| /api/renguin/projects P95 | n/a | n/a |  |
| /api/renguin/projects size | n/a | n/a |  |
| /api/creator/presentation P50 | n/a | n/a |  |
| /api/creator/presentation P95 | n/a | n/a |  |
| /api/creator/event-statuses P50 | n/a | n/a |  |
| /api/renguin/operations P50 | n/a | n/a |  |
| /status P95 | n/a | n/a |  |
| **Main-thread spikes at idle (trace + profile, 30 s)** | | | |
| Tasks > 8 ms / min | n/a | n/a |  |
| Time in those tasks | n/a | n/a |  |
