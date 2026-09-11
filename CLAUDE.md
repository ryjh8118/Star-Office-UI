# Star Office — operating contract

The Office is the creator's desk. It renders work that already happened; it does
not decide what happened. Everything below exists because breaking it once cost
the user a day of visible work.

## Boundary

Content OS owns the canonical record. The Office is a **read-only consumer**.

- Never write the Content OS progress ledger from the Office.
- Never build a second project registry, a local snapshot that stands in for
  canonical data, or an "unverified fallback" that renders when the real read
  fails. An empty desk with `SYNC_ERROR` is correct; invented data is not.
- The Office may own *presentation* state (covers, display names, manual
  completion, disabled steps, inbox, ordering). That is a separate store and
  never travels back into canonical.

## The read bridge

`backend/renguin_boundary.py` imports `canonical_projection` from the adapter
directory inside Content OS:

```
<RENGUIN_PRODUCER_ROOT>/10_AI_Editorial_Engine/04_Adapters/Star_Office/
```

Those modules — `canonical_projection`, `schema_contract`, `workspace_ledgers`,
`operations_contract`, `native_observations`, `project_stage_evidence`,
`codex_executor_lease` — plus `11_Workflow_Governance/02_Schemas/STAR_OFFICE_V2_PROFILE.schema.json`
are **owned by Content OS and must stay committed there**. They once lived only
as untracked files in a temporary Codex visualization directory; Production
defaulted its producer root to the real checkout, found nothing, and answered
every projects/operations/event-status request with 503.

Never point a root at `C:\Users\User\.codex\visualizations\...` or any other
scratch worktree for anything that outlives a single review.

## Runtime configuration

Four environment variables decide what the Office can see. The startup launcher
sets all four; anything that starts the backend another way must too.

| Variable | Meaning |
| --- | --- |
| `RENGUIN_CANONICAL_ROOT` | where the OS progress ledger lives |
| `RENGUIN_PRODUCER_ROOT` | where the trusted adapter modules live |
| `RENGUIN_PROJECT_SOURCE_ROOTS` | JSON array of roots to scan for per-project ledgers |
| `RENGUIN_NATIVE_HOME` | home whose Codex / Claude / BIONIC session stores feed 辦公室成員 |

`RENGUIN_PROJECT_SOURCE_ROOTS` is not optional in practice. Projects keep a
progress ledger beside their own footage, so without it the Office silently
drops every project the central ledger does not happen to mention.

`RENGUIN_NATIVE_HOME` is the same trap for the members panel: `board()` reads
agent sessions only when it is set, so without it every member card says 尚無紀錄
while the agents are working. Preview passes its own `--native-home` on purpose;
never default it inside `app.py`, or Preview starts reading the real home.

## Production and Preview are not interchangeable

| | Production | Preview |
| --- | --- | --- |
| URL | `http://127.0.0.1:19000/` | `http://127.0.0.1:19119/` |
| launcher | `Content_OS/.../Star_Office/START_STAR_OFFICE_UI.ps1` | `scripts/launch_preview.py` |
| user store | `.user-presentation/` | `.preview-runtime/user-presentation/` |

Production is the only acceptance authority for user data. Preview is an
isolated QA environment and its separate store is deliberate — never merge the
two to make them "match", and never cite Preview as evidence that the user's
real data is intact.

## User data

`.user-presentation/` is local-only and git-ignored. It never gets committed,
and neither do `state.json`, `agents-state.json`, `join-keys.json`, or anything
else carrying a key or a runtime secret.

When recovering it:

- Newer valid data beats an older backup. Do not restore a snapshot over live
  state without proving the live state is the poorer one.
- Restore only user-authored fields — cover, display name, manual completion,
  disabled steps, hidden/deleted, inbox, order. Workflow, resident assignment
  and history are re-derived from live canonical evidence on the next read;
  restoring stale copies of them just reintroduces old truth.
- QA and acceptance artefacts (`WORKFLOW-QA-DEMO`, anything named 驗收 / 可移除
  / UX 驗證) are not the user's projects. Keep them out.
- Back up the target store before writing, and record where every restored
  field came from.

## Visible is the only "done"

A file on disk, a row in SQLite and a 200 from the API are all necessary and
none of them is sufficient. Acceptance means the data **renders** in Production
in a real browser.

`UI_FILTERED != DATA_LOST`, but a real project the user cannot reach from any
surface *is* lost. Every canonical record must be reachable: a primary card, the
工作紀錄 list, 測試與系統紀錄, or 已移除的專案 if the user removed it themselves.
Reconcile the counts before claiming a pass.

## Startup

Windows starts the Office from a Startup-folder shortcut:

```
%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\RENGUIN Star Office.lnk
  -> Content_OS\10_AI_Editorial_Engine\04_Adapters\Star_Office\START_STAR_OFFICE_UI.cmd
     -> START_STAR_OFFICE_UI.ps1
```

Edit that chain. Do not add a second startup entry, do not pin a commit, and do
not let Preview become the thing that starts at login. The launcher is
idempotent — it probes `/status` before starting the backend and matches on
command line before starting a bridge — so keep it that way.

The backend runs on `.venv`, whose base interpreter lives in a Codex runtime
cache. If that cache is cleared the venv stops working and startup aborts with
"Star Office private Python is missing"; rebuild the venv rather than repointing
the launcher.

## Tests

```bash
for f in tests/*.cjs; do node "$f"; done
for f in tests/test_*.py; do .venv/Scripts/python.exe -X utf8 "$f"; done
```

The Python tests want the environment variables above. Frontend logic is
tested by loading the real files into a `vm` context in
`tests/test_creator_truth.cjs` — put display-rule regressions there.

## Never

- `git push --force`, `git reset --hard`, `git clean -fd`
- `git stash pop` / `drop` / `clear` — the stash is shared with other agents and
  other worktrees; use `git stash push -u -m "<tag>"` and `apply` by SHA
- merging branches in bulk to "get everything onto master"
- overwriting a newer remote with an older local checkout
- committing user data, runtime state, or secrets
