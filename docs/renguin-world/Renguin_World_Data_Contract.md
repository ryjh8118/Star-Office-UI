# Renguin World — Data Contract

## 1. Content input (adapter → engine)

```json
{
  "project_id": "WORKSPACE-…",
  "content_id": "optional, defaults to project_id",
  "title": "",
  "content_type": "long | short | member | special",
  "status": "PUBLISHED | COMPLETED",
  "completed_at": "ISO-8601 or null",
  "published_at": "ISO-8601 or null",
  "runtime_seconds": null,
  "youtube_video_id": null,
  "series_slug": null,
  "tags": [],
  "world_flags": [],
  "evidence": "CONTENT_OS_LEDGER | OFFICE_USER_MARK | CONTENT_OS_LEDGER+OFFICE_USER_MARK | MANUAL_OVERRIDE | MOCK"
}
```

Only `PUBLISHED` and `COMPLETED` grow the world. Anything else, an unknown type,
a future date or a duplicate id is listed in `skipped` with its reason.

## 2. Sources — only fields that really exist

| Source | Read how | Becomes | Reliable fields used |
| --- | --- | --- | --- |
| Content OS progress ledger (`.renguin_state/progress/os_progress_ledger.jsonl` + `RENGUIN_PROJECT_SOURCE_ROOTS`) | `creator_history.snapshot()` → producer validators | latest `PUBLISH` stage of `YOUTUBE_CANONICAL_WORKFLOW_V2` = `VERIFIED` → `PUBLISHED` long | project_id, project_name, timestamp |
| Office user store (`presentation.sqlite`) | `sqlite3` `mode=ro`, never created | 上映 step done → `PUBLISHED`; card finished (manual 完成 or every enabled step) → `COMPLETED` | format (LONG/SHORT), step `completed_at`, manual_done timestamp, display/source name, hidden, source_project_id |
| World overrides | JSON file in the world runtime | corrections and additions | whitelisted fields only |
| YouTube popularity | saved JSON, sync needs `YOUTUBE_API_KEY` | `view_count` per video id | view count |

Rules the adapter keeps:

- One Office card is one content. The 會員影片 / 短影音 steps of a long chain are
  recorded as `MEMBER_CUT_MARKED` / `SHORTS_MARKED` flags only — marking a later
  step fills the earlier ones, so they do not prove a separate video exists.
  A SHORT card of its own (including a 短影音 copy) is a short.
- Removed cards (`hidden` / `deleted_at`) and QA artefacts
  (`WORKFLOW-QA-DEMO`, 驗收, 可移除, UX 驗證) are excluded and counted in the report.
- Duplicates fold by workspace folder (or cleaned title) and format; canonical
  evidence wins, then PUBLISHED over COMPLETED; folded ids are kept.
- A failed ledger read reports `SYNC_ERROR` and contributes nothing. There is no
  snapshot fallback.
- Folder date tokens (`1150605_` ROC, `20260820_`) become
  `production_date_hint` only. They are shoot/folder dates, not publish dates.
- Title tags (travel, entertainment, nightlife, lifestyle, career, fitness, story)
  are inferred from title keywords in `config/tags.json` and marked `INFERRED`;
  an override replaces them.

## 3. Manual overrides

File: `<world runtime>/world-overrides.json` (template:
`backend/renguin_world/config/overrides.example.json`). Local-only, never committed.

| Key | Effect |
| --- | --- |
| `contents.<content_id>` | set `content_type`, `status`, `title`, `published_at`, `completed_at`, `runtime_seconds`, `youtube_video_id`, `series_slug`, `tags`, `world_flags`, `flagship`, `featured`, `district`, `view_count`; `exclude: true` removes it |
| `extra_contents[]` | add a content the sources cannot see (e.g. videos published before the Office) |
| `series.<slug>` | `{ "complete": true }` grants the series bonus once |
| `featured[]` | pin featured contents in order |
| `characters.<character_id>` | `public_visibility`, `default_district` |
| `era.force_era` / `era.min_era` | era hotfix, reported in `era.hotfix` |

Unknown keys are ignored; every applied override is listed in `overrides_applied`.

## 4. world_state output

Schema `RENGUIN_WORLD_STATE_V1`. Everything the spec asks for, plus provenance:

```json
{
  "schema": "RENGUIN_WORLD_STATE_V1",
  "source": "LIVE | MOCK",
  "generated_at": "",
  "world_score": 0, "world_level": 1,
  "current_era": "ERA_01", "current_era_name": "遠古營地", "current_stage": "遠古空地",
  "next_era": "ERA_02", "next_era_name": "部落村莊", "era_progress": 0, "score_to_next_era": 24,
  "era": { "id": "", "name": "", "name_en": "", "variant": "", "min_score": 0, "tagline": "", "features": [], "unlocked_at": null, "hotfix": null },
  "eras": [{ "id": "", "name": "", "min_score": 0, "reached": true }],
  "content": { "total": 0, "long": 0, "short": 0, "member": 0, "special": 0, "published": 0, "completed_unpublished": 0 },
  "activity": {
    "state": "EMPTY_WORLD | ACTIVE | NORMAL | QUIET | DORMANT | DEEP_DORMANT | REVIVAL | FESTIVAL",
    "base_state": "", "days_since_publish": null, "last_publish_at": null,
    "crowd_density": "EMPTY | QUIET | NORMAL | BUSY | FESTIVAL",
    "lights_level": 0, "shops_open": 0, "construction": "", "grass_level": 0,
    "event_flags": [], "description": ""
  },
  "districts": [{ "id": "", "name": "", "unlocked": false, "status": "UNLOCKED | PREVIEW | LOCKED", "unlock_hint": "", "crowd_density": "", "content_count": 0, "recent_count": 0, "active_hotspots": [] }],
  "featured_contents": [{ "content_id": "", "title": "", "content_type": "", "status": "", "date": "", "date_basis": "", "view_tier": null, "youtube_video_id": null, "tags": [], "is_new": false }],
  "recent_growth": [{ "kind": "CONTENT | SERIES_COMPLETE", "content_id": "", "title": "", "points": 0, "reasons": [], "at": "" }],
  "characters": [{ "character_id": "", "display_name": "", "character_type": "", "district": "", "has_image": true, "render_mode": "IMAGE | TOKEN", "state": "", "source_authority": "" }],
  "residents": { "crowd_density": "", "capacity": 0, "visible": 0, "render_cap": { "desktop": 28, "mobile": 14 }, "archetypes": [] },
  "goosebaby": { "population": { "total": 0, "by_tier": {} }, "named_avatars": 0, "district_unlocked": false },
  "gossip": [{ "id": "", "category": "", "text": "", "speaker": { "type": "", "id": "", "label": "" } }],
  "popularity": { "status": "GATED | OK | STALE | ERROR | MOCK", "recent_top_tier": null, "tracked_videos": 0 },
  "visual": { "city_variant": "riverside-s4", "art_theme_version": "renguin-iso-v1", "era_variant": "riverside", "city_radius": 3, "buildings": 12, "building_height": 1, "roads": "", "landmarks": [], "landmark_count": 0, "construction": "", "grass_level": 0, "lights_level": 0, "shops_open": 1, "future_gate": "LOCKED | PREVIEW | UNLOCKED" },
  "sources": [{ "id": "", "status": "", "count": 0 }],
  "overrides_applied": [], "skipped": [],
  "cache": { "saved_at": 0, "ttl_seconds": 600, "hit": false, "age_seconds": 0, "build_ms": 0 }
}
```

### Public view (default for `/api/world/state` and `/api/world/simulate`)

`engine.public_view()` replaces content ids with opaque `c_…` digests, shows a
title only for `PUBLISHED` content (otherwise 即將公開的作品), strips local paths
and error details from `sources`, and reduces `overrides_applied` / `skipped` to
counts. Member identity never reaches the state in either view.

## 5. Activity rules (config `rules.json → activity`)

| Days since the latest content | State |
| --- | --- |
| 0–3 | ACTIVE |
| 4–7 | NORMAL |
| 8–14 | QUIET |
| 15–30 | DORMANT |
| 31+ | DEEP_DORMANT |

- **REVIVAL**: a content arrived ≥8 days after the one before it, within the last 3 days.
- **FESTIVAL**: ≥5 contents in 3 days, a new era within 3 days, or a VIEW_TIER_4+ video in the last 7 days. REVIVAL outranks FESTIVAL (festival events join as flags).
- Popularity can raise the crowd and lights of an awake city (ACTIVE / NORMAL / REVIVAL) only.
- Inactivity changes `activity` alone: score, era, level, buildings, landmarks and districts are functions of the contents, never of time.
