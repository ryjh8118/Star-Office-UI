# Renguin World V1 — Blueprint

Renguin World is a visual world grown from finished content. Every completed or
published video adds growth; growth builds a city; the city moves through eight
eras. When no new content arrives the city only gets quieter. Nothing is ever
taken away.

It is a **new, read-only layer** on top of Star Office. It never writes Content OS,
the Office user store, or any character authority.

## Documents

| Document | What it settles |
| --- | --- |
| [Data Contract](Renguin_World_Data_Contract.md) | content input, sources, overrides, world_state output |
| [Character System](Renguin_World_Character_System.md) | World Character / Goosebaby / Civilian registries |
| [Art Direction](Renguin_World_Art_Direction.md) | one camera, one island, eight eras |
| [100 Content Roadmap](Renguin_World_100_Content_Roadmap.md) | growth scoring, era thresholds, milestones 0–100 |
| [Performance](Renguin_World_Performance.md) | lazy loading, no loops, measured cost |
| [Acceptance](Renguin_World_Acceptance.md) | the 30 acceptance tests and their evidence |

## Architecture

```
Content OS ledger ──(read-only, producer validators)──┐
Office user store  ──(sqlite mode=ro)─────────────────┤
World overrides    ──(.world-runtime/world-overrides.json)
YouTube popularity ──(saved file; sync GATED)─────────┤
                                                     ▼
                                           Content Adapter
                                                     ▼
ASSET-01 canon index ─┐                       World Engine (pure)
ASSET-08 member lib  ─┼─► Character registries ─────►│
Member registry (agg)─┘                              ▼
                                  .world-runtime/cache/world_state.json  (TTL 10 min)
                                                     ▼
                                GET /api/world/state  (public view by default)
                                                     ▼
                         /world  →  world-scene.js (static SVG) + overlay (CSS motion)
```

| Piece | File |
| --- | --- |
| Engine (pure, no I/O, `now` is an argument) | `backend/renguin_world/engine.py` |
| Rule registries (data, not code) | `backend/renguin_world/config/*.json` |
| Content Adapter | `backend/renguin_world/content_adapter.py` |
| Character / Goosebaby / Civilian registries | `backend/renguin_world/characters.py` |
| YouTube adapter (GATED) | `backend/renguin_world/youtube_adapter.py` |
| Service: cache, single-flight build, simulation | `backend/renguin_world/service.py` |
| Routes (import loads Flask only) | `backend/renguin_world/routes.py` |
| CLI | `python -m renguin_world build / roadmap / simulate / characters / youtube-sync` (from `backend/`) |
| 100-content mock | `backend/renguin_world/mock.py` |
| Frontend shell, renderer, page | `frontend/world/index.html`, `world-scene.js`, `world-app.js`, `world.css` |

### How it is wired into the Office without touching the app shell

`backend/app.py` and `frontend/index.html` carry someone else's staged changes in
the canonical checkout, so the world does not edit either:

- the World blueprint is nested into the existing `creator_history` blueprint
  (`backend/creator_history.py`, 3 lines). Importing it loads only Flask; the
  engine, adapters and PIL load inside the handlers.
- the Office header gets one plain `<a href="/world">Renguin World</a>`
  (`frontend/creator-office.js`). The Office never loads a world script.

### Routes

| Route | Purpose |
| --- | --- |
| `GET /world` | the page shell (always fresh; its assets are content-hashed under `/static/world/`) |
| `GET /api/world/state` | precomputed world_state, public view. `?audience=local` for the creator's full view, `?refresh=1` to rebuild (≥30 s apart) |
| `GET /api/world/simulate?contents=N&idle=D&gap=G` | mock world for QA and milestone review; always marked `MOCK` |
| `GET /api/world/roadmap` | the 0–100 milestone table from the mock |
| `GET /api/world/characters` | the derived registries (no local paths) |
| `GET /api/world/character-thumb/<id>?s=96\|160\|256` | a trimmed thumbnail of the authority's own image |
| `GET /api/world/character-asset/<id>` | a Member Character Library NPC image, hash-verified |

## Runtime locations

| | Production | Preview |
| --- | --- | --- |
| world runtime | `<checkout>/.world-runtime/` | `.preview-runtime/.world-runtime/` |
| cache | `.world-runtime/cache/world_state.json` | same, under Preview |
| overrides | `.world-runtime/world-overrides.json` | same, under Preview |
| YouTube snapshot | `.world-runtime/youtube_popularity.json` | same, under Preview |

The runtime sits beside the user store, never inside it, and is git-ignored.
`RENGUIN_WORLD_RUNTIME_ROOT` moves it. Character authorities are found through
`RENGUIN_PRODUCER_ROOT`, `RENGUIN_CHARACTER_BIBLE_ROOT` and
`RENGUIN_WORLD_DATA_ROOT` (defaults: the `E:\Renguin_AISystem` checkouts).

## What V1 found in the real data (2026-09-15)

- Content OS ledger: 382 projects, **0** with a verified PUBLISH stage. The world
  therefore takes no publish from the ledger today, and invents none.
- Office user store: 20 visible cards the creator marked 上映 or 完成
  (18 long, 2 short; 3 removed cards and QA artefacts excluded).
  Real world: **ERA_03 河畔聚落 · 木橋完工 · Lv.14 · growth 74**.
- Most 上映 marks were entered in bulk on 2026-09-10, so their dates are mark
  dates, not YouTube publish dates. Overrides can supply real `published_at` and
  `youtube_video_id` per content.
- Characters: ASSET-01 general canon index (37), ASSET-08 Member Character
  Library (20: 13 world NPCs, 7 real-member avatars), member registry (148
  members, aggregated only).

## Growing it later

- New era, district, landmark, gossip line or profession: edit the JSON registry,
  not the code.
- Real publish dates / flagship / series: `world-overrides.json`.
- YouTube views: set `YOUTUBE_API_KEY`, add `youtube_video_id` overrides, run
  `python -m renguin_world youtube-sync`.
- When Content OS starts recording verified PUBLISH stages, they are picked up
  automatically and win over Office marks for the same project.
