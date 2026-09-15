# RENGUIN_WORLD_SEAMLESS_HANDOFF

Reconstructed 2026-09-15 from the verified repository state. The handoff the
previous session referred to was never written: it was not in any branch,
worktree, stash or session transcript. Everything below was checked against Git
and the documents it cites, not recalled.

## Verified baseline

| | |
| --- | --- |
| Branch | `claude/renguin-world-seamless-migration-feddec` |
| Base | fast-forwarded (user-authorised, feature branch only) from `128f1fd` to `6b45efb` |
| `6b45efb` | Make the seamless world's composition, layer stack and navigation structural |
| `ab44e85` | Add seamless side-view World vertical slice at `/world/seamless` |
| `6564740` | Map official 鵝寶會員 cut-outs onto existing member characters by artwork and profile evidence |
| `985cd54` | Resolve World residents through character authority; show official profession art |
| Stable master / Production | `128f1fd` (tag `renguin-world-stable-20260915`), V1 `/world` |
| Working tree at hand-off | clean |
| Merge / push / deploy | none. Not allowed before FINAL MASTER GATE |

The same four commits also sit on `claude/renguin-world-camera-character-5b0a90`
(its worktree was clean). That branch is left untouched.

## Decisions already made (do not reopen)

- `DIRECTION = APPROVED`, `VISUAL_ACCEPTANCE = PROVISIONAL` (user, 2026-09-15).
- Structural conditions A (composition rule), B (declared layer stacks),
  C (seamless one-page navigation) are **PASS** and are the contract in
  [Renguin_World_Architecture.md](Renguin_World_Architecture.md). Do not redo them.
- Art upgrades are deferred to
  [RENGUIN_WORLD_VISUAL_ENHANCEMENT_V2.md](RENGUIN_WORLD_VISUAL_ENHANCEMENT_V2.md).
- V1 (`/world`, isometric island) stays unchanged and is the rollback authority
  until a later gate.
- Character authority rules are in
  [Renguin_World_Character_System.md](Renguin_World_Character_System.md): the World is
  a consumer; resolution order CANONICAL → PROFESSION → NEUTRAL_PLACEHOLDER →
  UNRESOLVED (hidden); profession residents are labelled by profession, never by
  member name.

## Priority queue (user order)

1. Remaining districts migration onto the seamless world
2. V1 feature and data parity
3. Character Authority
4. Real data sync
5. Public / Private boundary
6. Performance
7. Full regression
8. FINAL MASTER GATE — stop and wait for approval

## NEXT_SESSION_START_POINT

**FINAL MASTER GATE — waiting for the user.** Priorities 1–7 are PASS on this
branch (see the migration log). Nothing is merged, pushed or deployed. The next
action is the user's decision; do not start release steps without it.

If the merge is approved, the release steps are (none have been run):

1. Merge this branch into master non-destructively (fast-forward or reviewed merge;
   the canonical checkout carries foreign staged files), never reset or force.
2. On the Production checkout run `scripts/build_world_thumbnails.py` with the four
   `RENGUIN_*` variables, so profession residents use their private derivatives.
3. Restart Production with all four `RENGUIN_*` variables and check `native_coverage`.
4. Production acceptance in a real browser: `world-check.cjs` (V1, still the default
   `/world`), `world-seamless-check.cjs`, `world-parity-check.cjs --state` on
   Production's own state, and `world-production-acceptance.cjs`.
5. Making `/world/seamless` the default `/world` is a separate decision, not part of
   this gate; V1 stays the rollback until then.

## Environment

- Preview for this worktree ran at `http://127.0.0.1:19131/` from a local, uncommitted
  launch configuration (the `star-office-preview` arguments with port 19131). Port 19119
  belonged to the camera-character worktree's Preview and stopped answering during this
  session; it was never used as evidence.
- Production `http://127.0.0.1:19000/` is read-only for this work: GET
  `/api/world/state` only.
- Tests: `for f in tests/*.cjs; do node "$f"; done`,
  `for f in tests/test_*.py; do .venv/Scripts/python.exe -X utf8 "$f"; done` with the
  four `RENGUIN_*` variables, `node tests/visual/world-seamless-check.cjs <preview>`,
  `node tests/visual/world-check.cjs <preview>`,
  `node tests/visual/world-parity-check.cjs <preview> [--state <saved public world_state.json>]`.
- Profession-resident derivatives are git-ignored
  (`backend/renguin_world/art/portraits-private/`); without them the thumb route serves
  the permitted original (1–2 MB each).

## Migration log

### 2026-09-15 — reconstruction and priorities 1–7

- Handoff reconstructed (`bc42bce`); branch fast-forwarded to `6b45efb` with the user's
  authorisation. Baseline before any change: Python 166/166 (14 suites), all Node suites
  passing, working tree clean.
- **1. Districts — PASS** (`59288a1`): all seven registry districts are stretches of one
  street in unlock order, closed ones as lots with the engine's unlock hint; per-district
  chunks for culling and anchoring; district navigator and place cards; residents in their
  own open district; neutral crowd; gossip without timers.
- **2. V1 parity — PASS** (`59288a1`, `5df1db7`): every V1 panel and control present;
  parity check 77/77 on seven simulated worlds.
- **3. Character Authority — PASS**: resident report unchanged (60 / 37 / 14 / 4 / 5 / 0);
  only canonical and profession images stand in the world, profession residents by role;
  the roster is filtered the same way.
- **4. Real data sync — PASS**: a read-only copy of Production's public state (Lv.14,
  20 contents) renders identically in V1 and the seamless world, 13/13 including
  重新整理 → `?refresh=1`.
- **5. Public / Private — PASS**: public view only; no paths or member names in the character
  API; all 15 non-public characters return 404 on the thumb and asset routes.
- **6. Performance — PASS, with a baseline note**: animations Chrome judged invisible ran on
  the main thread (also at `6b45efb`, ~100 ms/s idle); fixed, sim=100 city idle
  98.5 → 6.6 ms/s. Numbers in `Renguin_World_Seamless_Districts_20260915.md`.
- **7. Full regression — PASS**: Python 166/166, Node 104/104, seamless browser 63/63,
  parity 77/77 and 13/13, V1 browser 28/28, security preflight OK.
- Local only (git-ignored): private portrait derivatives built in this worktree by
  `scripts/build_world_thumbnails.py` (7 matched, 3 unresolved).
