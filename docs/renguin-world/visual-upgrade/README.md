# Visual upgrade checkpoint — BLOCKED

Requested model: `gpt-image-2.5-sunburst`. Actual image model: **none**.
No generation or image-edit calls were made, and no SVG or existing image is
presented as generated artwork. [Engine access evidence](engine-access.json)
records the actual tool schema, absent model selector and unavailable account
quota evidence. The model exists in official documentation; that is not proof
that this account has access.

## Reviewable work

- Existing `/world` upgraded in an independent branch, without rebuilding Office.
- Native SVG paper shoreline/strata, natural meadow patches, layered canopies,
  shrubs, timber bridge, house details and separated authority standees.
- Office entry in the information margin, reduced text obstruction, 44 px mobile
  controls, manual motion pause, precise content-record wording.
- Existing CAMPFIRE, CITY_WALL and MONORAIL render paths repaired; unlocks and
  growth logic unchanged.
- 37 existing public characters → 111 offline lossless WebP size derivatives.
  Every image request remains gated by the current authority. Original images,
  private members and population rules are unchanged; 148 is not an NPC roster.
- [Spatial sketch](riverside-sketch.svg), [reference pack](reference-pack.json),
  [visual kit manifest](asset-manifest.json), [queued generation specification](generation-spec.md).

The sketch is a genuine vector drawing and a spatial plan. It is **not** a
generated master. No original master / accepted edit / multi-turn lineage exists.
The current SVG kit is useful construction work but does not fulfill that requirement.

## Real website evidence

| Scenario | Before | After |
| --- | --- | --- |
| Riverside, desktop | [PNG](before/1440-sim-20.png) | [PNG](after/1440-sim-20.png) |
| Riverside, 390 px | [PNG](before/390-sim-20.png) | [PNG](after/390-sim-20.png) |
| 100 contents, desktop | [PNG](before/1440-sim-100.png) | [PNG](after/1440-sim-100.png) |
| Night | Historical capture had duplicate query parameter; excluded | [PNG](after/1440-sim-20-time-night.png) |
| Dormancy | Historical capture had duplicate query parameter; excluded | [PNG](after/1440-sim-50-time-night-idle-20.png) |

All captures are real browser renders of the existing website, not concept art.
Simulation screenshots are explicitly marked MOCK. The real Production world
was separately inspected (20 contents, growth 74, Lv.14); its screenshot remains
local at `.qa-runtime/production-before-local.png` and is not pushed with content
titles. Preview uses its own state store, so `/world` without `sim` is not a copy
of Production. [Open the riverside Preview](http://127.0.0.1:19125/world?sim=20&time=day).

Eight required content checkpoints 0/5/10/20/35/50/75/100 are covered; 85 was added
to exercise ERA_07 because the requested eight checkpoints skip that era.
Day/night/dusk and quiet/dormant/deep-dormant/revival are separately captured.

## Internal art review

**SELF_REVIEW**, not a separate visual model and not user approval.

| Criterion | Score / 2 | Observation |
| --- | --- | --- |
| Scene and existing characters | 1 | Warm palette and paper edges improved; raster standees remain visually richer than buildings. |
| Terrain, vegetation, architecture | 1 | Grid and slab removed; canopies and bridge improved; later buildings still simple prisms. |
| Composition / life / negative space | 1 | Cast separated and text reduced; small-screen scene still too small for rich exploration. |
| Era/day/activity consistency | 2 | One camera/material system, old lots and progression retained; day and activity are separate. |
| Website versus sketch / readable information | 1 | Spatial elements and HTML margins implemented, but no generated master to match. |

**6/10: art acceptance NOT passed.** A polished Sunburst master and reusable
components are still required; engineering test success does not replace this gate.

## Validation and measurement notes

`regression.json` records all 25 existing root test files. The World-specific
suites currently contain 18 engine tests, 13 source/route tests and 9 scene tests.
The added route test checks offline derivative bytes, changed-source fallback
and denial when current authority no longer permits an image. Engine and registry
implementation files are unchanged.

The existing real-browser regression passed **29/29**; see
`browser-regression.txt`. An initial Chrome startup failed before any test
(`ECONNREFUSED` on its temporary debug port); a clean retry passed. The timeline
test initially hit the sandbox user's Git ownership check and passed when run
read-only as the normal user; no global Git security setting was changed.

The final cleanup pass additionally removes HUD/district/footer subtrees (and
their card-local listeners), releases state/roster references, and resets the
paused class on visible restoration. Final `after/festival.json` records the
remaining mounted card nodes and restored-visible result; earlier after data
predates that cleanup-only fix.

`tests/visual/world-art-audit.cjs` writes raw samples, screenshots, Office request
isolation, hidden/reduced-motion checks and 10 pagehide/pageshow cleanup cycles.
Measurements use Chrome 152, DPR 1, 1440×900 and emulated 390×844. Each cold/warm
case has three samples, 14 s settling and a 5 s stable main-thread window.
No network/CPU throttling; these are localhost desktop measurements, not physical
mobile-device measurements. Heap values are JS heap, not full GPU/decoded-texture
memory. Cleanup is instrumented with the existing debug counters; the intentional
document-lifetime `pageshow` restore hook is outside those tracked counters.

The first `before/audit.json` incorrectly counted offscreen lazy roster portraits
as broken; those `brokenImages` fields are invalid. `before/performance.json`
supersedes its performance sample checks using actual scene images only. The old
file is retained as an audit trail. A duplicate `time=day&time=night` query issue
was also corrected before final after screenshots; historical before night shots
are excluded. These instrumentation corrections do not relax the budgets.
The intermediate `after/screenshots.json` is also superseded by final
`after/audit.json`; final PNG paths refer to the corrected captures.

The unmodified 100-content mock is ACTIVE, not FESTIVAL. Stress runs explicitly
override only the browser's QA response activity/crowd/effects to FESTIVAL while
preserving backend state, content score and unlocks. `festival.json` identifies
this fixture; the override never ships in the website.

Final measured values are recorded in `performance-summary.json` after completion.
Budgets remain 5 MB desktop / 3 MB mobile and max(baseline×1.2, baseline+5 ms/s).

Three-run medians for the ordinary 100-content case:

| View / load | Main thread before → after (ms/s) | Images before → after (bytes) | Scene DOM ready before → after (ms) |
| --- | --- | --- | --- |
| Desktop cold | 1.183 → 1.096 | 126819 → 103712 | 28.5 → 29.1 |
| Desktop warm | 0.998 → 0.941 | 126819 → 103712 | 16.9 → 17.7 |
| 390 px cold | 0.983 → 0.976 | 73925 → 60604 | 21.6 → 21.3 |
| 390 px warm | 0.953 → 0.943 | 73925 → 60604 | 17.9 → 17.6 |

No long tasks were recorded in these sampling windows. Main-thread and image
budgets pass; initial scene DOM time is nearly unchanged. Full-page bitmap/GPU
memory is not measured. The festival audit includes the loaded portrait bitmap
estimate (natural width × height × 4), which is an estimate, not GPU allocation.

The explicit FESTIVAL stress fixture (three cold runs) measured desktop
**1.092 → 1.069 ms/s** and 390 px **0.992 → 1.160 ms/s**. Both are within the
unchanged limits of 6.092 and 5.992 ms/s respectively. Image bytes stayed at
126819 → 103712 desktop and 73925 → 60604 mobile. Loaded portrait bitmap estimates
were unchanged at 362496 / 232320 bytes. Final ten cleanup cycles had zero tracked
timers/listeners/requests/walkers and **zero mounted card nodes**; post-GC heap
stayed between 1219752 and 1224820 bytes. Visible restoration returned running=true,
paused=false, hasScene=true. The one intended document-lifetime restore listener
remains an explicitly disclosed exception to a literal all-listener-zero claim.

[Before festival](before/1440-100-festival.png) ·
[After festival](after/1440-100-festival.png) ·
[Local-only Production before](../../../.qa-runtime/production-before-local.png)

## Isolation, version and rollback

BASE_SHA: `4aef2c1694ebff43076658602acc12c64829f4d4`, verified against `fork/master`
at task start. No AGENTS.md was present in the repository or its E: ancestors.
Branch: `codex/renguin-world-visual-20260915`. Independent worktree under the
task visualization directory. Baseline is a separate detached worktree at the
same SHA on port 19126; upgraded Preview uses port 19125, bound to loopback.

Production `127.0.0.1:19000/world` was not restarted or deployed. Main checkout's
staged and working changes were neither stashed nor reset. Pre-work diff hashes:
staged `77003875b2bf47e7035b12488feaeb8038242147`, unstaged
`4ddf7111ad3c693f2048ac9bafce5c44a5fe2c37` (other sessions may continue working).

Rollback requires no Production action because nothing was deployed. For Preview,
open the unmodified baseline at `http://127.0.0.1:19126/world?sim=20&time=day`.
For a future merge, revert only this task's commits after reviewing concurrent
changes; never reset or force-push the shared branch. Runtime sources are read-only
in the established Preview server and its writes are confined to its state folder.

## Continuation gate

Provide an already-authorized image entry point that can select and report
`gpt-image-2.5-sunburst`, with existing usable quota. Then use the inspected
reference pack and sketch to generate the mother scene, make layered assets,
perform actual multi-turn edits with parent hashes, integrate them, and repeat
visual/performance acceptance. No purchase or new paid usage was authorized.
No separate visual review model was invoked. Production remains gated until
full visual and mandatory validation acceptance; user approval is not claimed.
