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

Priority 1: migrate 創作者街區, 旅行港區, 影片大廳, 鵝寶會員區, 娛樂夜市區 and 星港之門
onto the vertical world as further stretches of Renguin City, using the
extension rule in the architecture document (a district declares its own
stack; mount, parallax, culling, composition and lifecycle stay generic).

Progress on the queue is recorded in the "Migration log" section below as it
happens; the newest entry is the real start point.

## Environment

- Preview for this worktree: `http://127.0.0.1:19131/` (`star-office-seamless-migration-preview`
  in `.claude/launch.json`). Port 19119 belongs to the camera-character worktree's
  Preview; leave it alone.
- Production `http://127.0.0.1:19000/` is read-only for this work: GET
  `/api/world/state` only.
- Tests: `for f in tests/*.cjs; do node "$f"; done`,
  `for f in tests/test_*.py; do .venv/Scripts/python.exe -X utf8 "$f"; done` with the
  four `RENGUIN_*` variables, `node tests/visual/world-seamless-check.cjs <preview>`,
  `node tests/visual/world-check.cjs <preview>`.
- Profession-resident derivatives are git-ignored
  (`backend/renguin_world/art/portraits-private/`); without them the thumb route serves
  the permitted original (1–2 MB each).

## Migration log
