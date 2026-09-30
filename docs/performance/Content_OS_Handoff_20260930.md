# Handoff to Content OS — what the desk's performance work found on that side

Star Office cannot and does not change any of this (the Office is a read-only consumer of Content OS); it works around
it, and each item below is the cheaper fix at the source. Measured 2026-09-30 on the machine that runs both.

## 1. `frontend/renguin-projects-v2.json` is rewritten every 2–6 s, and only two fields ever change

Observed: mtimes 16:29:49.8, 16:29:53.9, 16:30:00.0 (and so on). Two copies taken 6 s apart, compared leaf by leaf, differ in
exactly two top-level fields: `generated_at` and `projection_digest` (the digest covers `generated_at`). The 446 projects,
`source`, `ledger_federation`, `counts` — 11.66 MB pretty-printed — are identical.

Why it is rewritten: `codex_activity_bridge.py` / `bionic_activity_bridge.py` loop every 1.5 s and call
`project_task_store.sync_*_project_snapshot` → `star_office_v2.sync_v2_projection` → `_atomic_json`. `_atomic_json` skips the
write when the rendered text is unchanged, but the rendered text contains `generated_at = now`, so it never is: every call
rebuilds the projection (~0.45 s of CPU, `canonical_projection.build`) and fsyncs and replaces 12 MB.

Suggested fix: stamp `generated_at` only when the projection's content changed (compare the rendered payload *without*
`generated_at` and `projection_digest`), or write it at most once per N seconds and keep `generated_at` as "last verified",
so an unchanged projection is not rewritten. The Office already treats `generated_at` as the transport-freshness signal
(`renguin-freshness.js`, threshold 600 s), so a coarser stamp is safe.

## 2. The desk polled that file every 5 s in full, for a filter that keeps nothing

`renguin-star-office-extension.js` (the working copy in the canonical checkout, not committed to master) polls it with
`cache: no-store` and a cache-busting query every 5 s and keeps only `projects.filter(p => p.bindable && p.classification ===
'REGISTERED')`. None of the current 446 projects has a `bindable` field, so the 11.66 MB is downloaded and parsed (32–43 ms
on the main thread, every 5 s) to produce an empty list. That code lives in a working copy that other work is editing, so
Star Office now revalidates by content instead (server ETag ignoring the two volatile fields, and a fetch layer that answers
a matching poll from the object it already parsed). The better fix is in the extension: poll a digest, or nothing, and stop
filtering on a field the producer no longer writes.

## 3. `/api/renguin/operations`

`operations_contract.board()` reads every native session store (Codex sqlite, Claude sessions, BIONIC sqlite) and
`native_observations.journal()` tails up to 1 MB of each journal; Star Office's `creator_activity.enrich` then tailed the
same journals a second time (now cached per file change). ~80 sessions; ~0.8 s per request, every 5 s. A per-store
(mtime, size) cache in `native_observations` would remove the first read the same way.
