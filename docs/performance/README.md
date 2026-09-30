# Star Office performance — where things are

The Office was made smoother in one measured pass (2026-09-30). Everything is in the repository so the next pass starts
from evidence, not from memory.

| what | where |
|---|---|
| how to measure (real Chrome, 120 Hz, warm profile, scenarios, what each number means) | `tests/perf/README.md` |
| every change: bottleneck → evidence → root cause → change → before/after → risk → verification | `audit/PERFORMANCE_LOOP_LOG.md` |
| the baseline (master `4108ce0` + the runtime's overlay) and the after run, same machine, interleaved | `audit/PERFORMANCE_BASELINE.md/.json`, `audit/PERFORMANCE_AFTER.md/.json` |
| the before/after table | `audit/PERFORMANCE_COMPARE.md` |
| what the desk cannot fix itself, and the cheaper fix at the source | `docs/performance/Content_OS_Handoff_20260930.md`, `docs/performance/Office_Extension_Handoff_20260930.md` |
| the rules it left behind | the *Performance* section of `CLAUDE.md` |

Checks that are not part of the suite but were written for this work and are kept because they answer questions that will
come back:

- `tests/perf/poll-protocol-check.cjs` — the digest protocol: unchanged, changed, missing digest, the stale digest, the
  SYNC_ERROR path (rewrites responses in the browser only; refuses to run against Production).
- `tests/perf/desk-fingerprint.cjs` — the desk renders the same cards with the same text before and after.
- `tests/perf/phaser-sleep-check.cjs` — the pixel office's frame loop sleeps off screen, and everything it drove keeps going.
