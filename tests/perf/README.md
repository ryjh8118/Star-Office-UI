# Star Office performance harness

Measures the Office the way it is used: a real Chrome, at the size and refresh rate of the machine it runs on
(a maximised window on a 5120x1440 panel at 120 Hz with Windows at 150%: about 3413 x 960 CSS px at DPR 1.5),
driven through the Chrome DevTools Protocol with nothing but Node. No dependencies.

**Average frames per second is reported and is not the measure.** A page can average 119 fps and drop one frame
in five; that is what the tail (P95, P99, worst, frames lost per minute) and the main-thread spikes show.

```bash
# everything, three runs, medians
node tests/perf/office-perf.cjs --base http://127.0.0.1:19000 --label production --runs 3 --out audit/runs/production.json

# only some scenarios, a phone-sized page
node tests/perf/office-perf.cjs --base http://127.0.0.1:19393 --scenarios idle,scroll,world --viewport mobile

# before / after, and a readable report
node tests/perf/compare.cjs before.json after.json --md audit/PERFORMANCE_AFTER.md
node tests/perf/report.cjs merged.json report.md --title "..."
node tests/perf/merge.cjs --out merged.json run1.json run2.json run3.json
```

Scenarios (`--scenarios`): `load` (cold and warm), `idle` (30 s at the top), `scroll` (real wheel input at 1500 and
6000 px/s, and whether the wheel scrolls over the pixel office), `projects` (the deck expanded to every project),
`panels` (open/close cycles, latency, heap/DOM/listener growth), `character` (a DOM character walking), `world`
(the way down, the city, its panels, the way back, and whether the world sleeps at the desk), `soak` (repeated
Office → World → Office cycles), `backend` (sequential request latency), `spikes` (a Chrome trace and a JS sampling
profile, every main-thread task over 8 ms named by the code that ran) and `audit` (every timer, animation-frame
loop, observer, listener and fetch by call site, and the time each one took).

## What the numbers mean

- **frame time**: the interval between animation frames as the page sees them, from a `requestAnimationFrame`
  recorder that also stamps the scroll position. `>8.33 / >16.67 / >33.3 / >50` count frames over those budgets;
  `hitches` are frames over 1.5x the display's own interval; `missed` is the share of display refreshes the page did
  not produce a frame for.
- **long tasks / LoAF**: `PerformanceObserver` `longtask` and `long-animation-frame` (with the scripts inside).
- **main ms/s, recalcs/s, layouts/s, script ms/s**: `Performance.getMetrics` deltas. Wall-clock main-thread time
  swings by ±25% between identical runs on this machine: compare medians of interleaved runs, and gate on the exact
  counters (recalcs, layouts, script) and on frames.
- **CPU % of one core**: `SystemInfo.getProcessInfo` for the browser, renderer and GPU processes.
- **interaction latency**: mouse release to the third painted frame.

## Ground rules

- Read-only: requests are GETs, interactions are toggles, and any non-GET request is reported. The poll protocol
  check rewrites responses in the browser only, and refuses to run against Production.
- The control that keeps the scroll numbers honest: an empty static page scrolled with the same input scrolls at
  120.0 fps with 0-0.2% missed frames, so the loss measured on the Office is the Office's.
- A "production-like" reference is a detached worktree of the commit under test with the runtime's uncommitted
  overlay files (`git diff HEAD` of the canonical checkout) applied, served by `scripts/launch_preview.py` on its own
  port. It reproduced Production's frame, spike and polling profile to within run-to-run noise.

## Diagnosing

`spikes` answers "which code broke the frame": the JS profile is sampled every 200 µs alongside a trace; a task that
the profile only calls `(program)` is native work, and is named by the biggest response that had just arrived
(parsing a large JSON body is native). `audit` wraps timers, rAF, listeners, observers, fetch, `JSON.parse`,
`innerHTML` and the layout-reading getters and reports by call site; it perturbs timing slightly, so it answers
"who", never "how fast".
