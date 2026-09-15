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
| Merge / push / deploy | none at hand-off; done after the FINAL MASTER GATE was approved (see NEXT_SESSION_START_POINT) |

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
8. FINAL MASTER GATE — approved; merged, verified on Production and pushed

## NEXT_SESSION_START_POINT

**MERGED AND LIVE (2026-09-15).** The FINAL MASTER GATE was approved by the user and
every release step below has run; the record is
[Renguin_World_Seamless_Master_20260915.md](Renguin_World_Seamless_Master_20260915.md).
There is no feature-branch work left: master carries the seamless world,
Production serves it at `/world/seamless`, and `/world` is still V1.

The one open decision is the user's: whether `/world/seamless` becomes the default
`/world`. Until then V1 stays the default and the rollback. Art stays PROVISIONAL
(`RENGUIN_WORLD_VISUAL_ENHANCEMENT_V2.md`).

Release steps as run:

1. Merged into master non-destructively (merge commit built with `commit-tree`,
   canonical checkout fast-forwarded; its foreign staged files untouched).
2. `scripts/build_world_thumbnails.py` on the Production checkout with the four
   `RENGUIN_*` variables (private derivatives are git-ignored and per machine).
3. Production restarted through the Content OS controller with all four `RENGUIN_*`
   variables; `native_coverage`, project count and world state reconciled.
4. Production acceptance in a real browser: `world-check.cjs --live`,
   `world-seamless-check.cjs`, `world-parity-check.cjs` (simulated and `--state` on
   Production's own state), `world-production-acceptance.cjs --expect … --declared …`.

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
