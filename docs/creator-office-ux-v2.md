# Creator Office UX v2

The existing Mountain Lodge map remains the art authority. The home page is map → office members → active projects → Human Inbox → recently completed. Project routes use 素材、校正、導演、工單、確認、粗剪、定剪, with a separate historical freshness note.

## Data boundaries

- `/api/renguin/projects`, the existing producer validators, canonical identity, owner leases, collision checks and executor lifecycle remain authoritative and read-only.
- `/api/creator/history` reads every validated ledger event, including the existing workspace federation. `/api/creator/event-statuses` preserves the original failure vocabulary for display, joined only by exact ledger entry, project identity and timestamp. Neither endpoint writes to the ledger.
- Only a valid owner lease produces a running member. Native Codex journal and BIONIC database events produce **recent activity**, never a heartbeat. A bounded journal-tail reader extracts timestamps and event kinds without returning conversation text or tool arguments. A missed poll retains the previous observations while the original lease expiry continues to apply.
- Manual completion uses `USER_MANUAL_DONE` with a timestamp and reversible history. It does not complete an executor job, approve a human gate, or change a canonical workflow stage. No suitable whole-project manual-completion producer or presentation store existed in the retained Office adapter.

## User presentation storage

`RENGUIN_PRESENTATION_ROOT` defaults to `.user-presentation` in the Office checkout. The isolated launcher uses `.preview-runtime/user-presentation`. SQLite transactions preserve concurrent updates; generated cover assets live in its `covers` directory. Both locations are ignored by Git.

Covers bind to the exact registered canonical project ID. Renaming a display name does not change the binding. Accepted formats are JPG/JPEG, PNG and WEBP, up to 5 MB and 24 million pixels. Extension, MIME, decoder and dimensions are checked; accepted images are re-encoded to WEBP under generated filenames. Replacing or removing a cover changes its metadata reference and retains the old asset for recovery.

The Human Inbox merges current system suggestions with user-created items and wording overrides. Source labels are retained. Drag ordering and keyboard ordering (Alt + Up/Down on the grip) persist. Completion stays visible through the local day; older completed and ignored items can be restored. Manual project completion stays on the main page for 14 days, with older completions accessible afterward.

## Running and verifying

The existing CMD launcher and Python server are retained. Choose a free preview port with `START_STAR_OFFICE_PREVIEW.cmd --port 19119`. It reads the existing configured Content OS producer and canonical checkout, while all Office-owned writes stay in the preview state directory. No production cutover or workload dispatch is performed by the launcher.

Run `python -m unittest discover -s tests -v` and `node tests/test_creator_truth.cjs`. `backend/requirements.txt` and `pyproject.toml` both use Pillow 10.4.0. The `uv.lock` file includes this dependency.

The route visual fixture under `tests/visual` is explicitly labelled as a style test, and carries no canonical project or executor activity. Browser QA uses a separate `.qa-runtime` store, so test covers, completed projects and sample to-dos do not affect the usable preview.

## Retained local engineering

This branch starts from the existing isolated remediation implementation: canonical delivery, freshness predicates, display semantics, operations diagnostics, owner lifecycle integration and CMD launcher. The original production checkout and preceding worktree are left intact. The earlier diagnostic component is superseded on the home page; its operations details and collision form remain accessible under 查看詳情 → 技術資訊.
