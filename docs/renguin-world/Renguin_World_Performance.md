# Renguin World — Performance

The V1 numbers below are historical. The 2026-09-15 visual-upgrade branch has
fresh three-run measurements, screenshots and limitations in
[visual-upgrade/README.md](visual-upgrade/README.md). Character processing is now
offline; the endpoint serves an authority-gated WebP derivative or the validated
original. No full character roster or era asset set is preloaded by the page.

## When the world page is not open

- The Office loads **no** world file: its only reference is a plain
  `<a href="/world">`. Checked by `tests/world-scene.test.cjs` (source) and
  `tests/visual/world-check.cjs` (network log in a real browser).
- The backend imports `renguin_world.routes`, which loads only Flask. The engine,
  adapters, registries and PIL load inside a world request
  (`tests/test_world_sources.py` checks `sys.modules`).
- No thread, timer, scheduler or background build exists. Content OS, BIONIC,
  Premiere and the Office polling paths are untouched.

## When it is open

| Step | Cost |
| --- | --- |
| Shell `/world` | 2.8 KB HTML |
| Bundle | `world.css`, `world-scene.js`, `world-app.js` — content-hashed under `/static/world/`, immutable cache |
| State | one `GET /api/world/state`: the saved `world_state.json` while younger than 10 min, otherwise one build under a lock (≈0.2 s measured; the ledger read dominates) |
| Characters | ≤16 standees (≤8 on phones) as 96 px trimmed thumbnails, 6–30 KB each, cached in memory server-side; the full roster loads only when its drawer is opened |
| Motion | CSS `translate` / `transform` / `opacity` only, in an HTML overlay — the compositor animates it; the city SVG is static and painted once |
| Timers | one: the gossip bubble every 6.5 s |
| Polling | none; "重新整理" rebuilds on request (≥30 s apart server-side) |
| Fireworks / confetti | finite iterations, then stop |

## Leaving, hiding, returning

| Event | Effect |
| --- | --- |
| `visibilitychange` → hidden | `.rw-paused` pauses every animation; gossip timer cleared |
| visible again | animations resume; one timer re-armed |
| `pagehide` | requests aborted, timers cleared, listeners removed, scene DOM dropped |
| `pageshow` from bfcache | starts again |

`window.RenguinWorld.debug()` reports running, paused, timers, pending requests,
listeners and walkers for QA.

## Measured (headless Chrome, 1440 × 900, 2026-09-15)

| Page | Preview main-thread ms / s | Production main-thread ms / s | Layouts / s | Style recalcs / s |
| --- | --- | --- | --- | --- |
| Star Office home (loads nothing of the world) | 219.6 | 223.1 | 3–8 | 120 |
| Renguin World, 100 contents, FESTIVAL, 28 walkers | **3.4** | **2.4** | 0.2 | 0.2 |
| Renguin World, tab hidden | 12.2 | 9.9 | 0 | 0.33 |

The Office figure is the Office's own animation cost and is unchanged by the
world. Hidden-tab figures are sampling noise from the probe itself: no layouts,
no timers. Live world build in Production: 149 ms, then served from the
10-minute cache.

Timers after hide: 0. After leave: timers 0, requests 0, listeners 0, walkers 0.
Phone (390 px): 14 walkers, no sideways scroll.

Reproduce: `node tests/visual/world-check.cjs http://127.0.0.1:19119 --live`.

## Budgets to keep

- No `setInterval`, no `requestAnimationFrame`, no polling (a source test enforces it).
- No animation inside the SVG; keyframes may not animate layout properties or filters (tested).
- Walkers capped at 28 desktop / 14 phone; standees at 16 / 8.
- Precomputed state TTL 10 min; forced rebuild ≥30 s apart; single-flight lock.
