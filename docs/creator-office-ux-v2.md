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

## Living lodge visual pass

The Mountain Lodge map remains the art authority; the pass adds light around it rather than replacing it.

`creator-ambience.js` builds two decorative layers inside the map container: a back layer holding the window light, the room warmth wash and the practical lights traced from the map art, and a front layer holding the string lights, light dust, snow, the coffee wisp and the depth vignette. Both are `pointer-events: none`, so the map, the members and every control keep their original hit areas. Pointer parallax is clamped to a few pixels, is skipped on coarse pointers, and never moves layout.

`creator-ambience.css` carries the scene and the residents in the room; `creator-lodge.css` carries the panels below the map. Animation is limited to `transform` and `opacity`. Particle counts are fixed budgets asserted by `tests/creator-ambience.test.cjs`, layouts are seeded so every reload is identical, an `IntersectionObserver` and `visibilitychange` stop the scene when the map is offscreen or the tab is hidden, small screens and low-refresh displays drop the fine particles, and `prefers-reduced-motion` removes the animation, the particles and the parallax entirely.

## Display tiers and the light

Nothing in this pass observes work. The member tier (`data-tier`) restates the status line the card already renders: a verified running lease or a fresh native working observation is `working`, any other timestamped record is `recent`, and no record is `quiet`. The warm pool under a resident follows the existing `is-working` class the map already sets, so an expired lease stops the light with the label. The project house (`data-live`) lights up only for `hasRunning`, marks `done` from the user's own completion, and is otherwise unlit. Workflow stages, freshness, lease semantics and Agent Truth are unchanged.

## Running and verifying

The existing CMD launcher and Python server are retained. Choose a free preview port with `START_STAR_OFFICE_PREVIEW.cmd --port 19119`. It reads the existing configured Content OS producer and canonical checkout, while all Office-owned writes stay in the preview state directory. No production cutover or workload dispatch is performed by the launcher. The CMD prefers the virtual environment inside its own checkout, so a moved or re-created Office worktree still launches its own Preview.

## Preview identity and the port

`/api/renguin/preview-info` reports the commit the Preview process started from (`office_revision`), read straight from the checkout's git files — the server's audit hook blocks subprocesses, and a linked worktree resolves through its common directory. The launcher prints it as `loaded_version` beside `checkout_revision`, so which build is being served is observable rather than assumed.

The identity gate itself is unchanged: kind, read-only canonical, and all four pinned paths are still required, and every served Preview passes `verify()`. What changed is that the launcher now separates three situations the gate used to collapse into one opaque failure. A Preview from **another Office checkout** holding the port is reclaimed — it is a disposable read-only viewer by its own verified contract, its own state directory is untouched, and `--keep-foreign` refuses instead. **This checkout's own Preview started before a sync** reports an older commit (or none at all, if it predates this contract) and is restarted, so a pull can never leave a stale build on the port. Anything the operating system cannot confirm is a Preview process is **never stopped**; the launcher refuses and names the port, the holder and the pid. Mismatch errors now carry expected, actual and pid instead of only the key name.

Run `python -m unittest discover -s tests -v` (it covers the preview identity authority in `tests/test_preview_identity.py`), `node tests/test_creator_truth.cjs` and `node --test tests/creator-ambience.test.cjs tests/creator-scene.test.cjs tests/creator-contexts.test.cjs tests/browser-bridge.test.cjs`. `backend/requirements.txt` and `pyproject.toml` both use Pillow 10.4.0. The `uv.lock` file includes this dependency.

The route and living-lodge visual fixtures under `tests/visual` are explicitly labelled as style tests, and carry no canonical project or executor activity. Browser QA uses a separate `.qa-runtime` store, so test covers, completed projects and sample to-dos do not affect the usable preview.

## Recovering local settings after a sync

Most of what a user personalises is ignored by Git — the presentation store under `.user-presentation`, `state.json`, `agents-state.json`, `runtime-config.json`, `join-keys.json`, the activity and achievement snapshots under `frontend/`, and the generated assets under `assets/`. A checkout, merge or pull never touches any of it. A plain `git stash` does not carry it either; only `git stash push -a` does, and that is the case where the working tree really does lose it.

`scripts/recover_local_settings.py`, wrapped by `scripts/recover_local_settings.ps1`, moves that data into the current checkout in one pass. The stash is only ever read: no pop, apply, drop or clear, and no `reset --hard` or `clean`. Every entry is written to a quarantine directory under `.recovery-<timestamp>/` (ignored by Git, because it holds keys and covers), classified, and only then acted on.

Implementation files in the stash are reported and skipped, so a sync cannot be reverted by accident; the Living Lodge house frame counts as chrome rather than cast for the same reason. Local runtime state is restored only where the checkout has none, since a live file has been in use since the sync — except for a tracked file, whose presence in the stash means the user edited it, so their version is the data. Shared shapes are merged rather than overwritten: the asset maps union entry by entry with the newer stamp winning, the resident manifest keeps the checkout's cast and re-adds any name the user's store still points at, and the presentation store is merged field by field so old values fill the gaps without losing anything set since the sync. Everything written is backed up first and a rollback script is written beside the report.

`tests/test_recover_local_settings.py` pins the classification table and each merge rule.

## Retained local engineering

This branch starts from the existing isolated remediation implementation: canonical delivery, freshness predicates, display semantics, operations diagnostics, owner lifecycle integration and CMD launcher. The original production checkout and preceding worktree are left intact. The earlier diagnostic component is superseded on the home page; its operations details and collision form remain accessible under 查看詳情 → 技術資訊.
