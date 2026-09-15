# Renguin World — Character System

## 2026-09-15 resolution policy (V2 checkpoint)

The World is a character consumer. Each resident resolves in this order and the
result is recorded as `resolution` on the registry entry and on the street cast:

1. `CANONICAL_CHARACTER` — the resident has its own authority image (ASSET-01 via
   the Office image, or an ASSET-08 `MEMBER_WORLD_NPC` reference).
2. `PROFESSION_CHARACTER` — an existing 鵝寶居民 profession character. The seven
   ASSET-08 `REAL_MEMBER_AVATAR` entries (護理師, 工廠作業員, 外送員, 建築工程助理,
   烘焙門市, 電話客服, 飯店客服) now wear their official art. ASSET-08's cameo rule
   asks for them to be clearly recognisable, so the earlier "token only" choice is
   retired. Identity stays private: the image is addressed by the opaque
   `MEMBER_AVATAR_<12 hex>` id, re-resolved through the sha-checked registry on
   every request, and the label is the profession (護理師居民 · 鵝寶居民), never the
   member name.
3. `NEUTRAL_PLACEHOLDER` — no authority character exists for the role (村民, 旅人,
   攤販, 慶典遊客 crowd roles). Since 2026-09-16 a style-safe townsperson (see below);
   before that one faceless grey paper pawn.
4. `UNRESOLVED` — an image exists but no authority confirms who it is (Office-only
   residents such as JOSH). Hidden, never guessed.

Crowd roles never copy a character: ASSET-08 forbids duplicating one, so a
profession role (`CIVILIAN_NURSE`) carries `character_ref` to its single
profession character and the anonymous walkers stay placeholders. The generic
badge-coloured penguin sprite is gone.

### Style-safe townsfolk (2026-09-16)

The grey pawns read as placeholders, so the crowd now wears its role. A walker is a
generic paper townsperson drawn from shapes in `seamless-buildings.js#townsfolk`: round
head with two dot eyes, a coat in one of six palettes, and the role's clothes —
straw hat and basket (村民), cap, backpack and stick (旅人), headscarf, apron and tray
(攤販), party hat and balloon (慶典遊客), or a beanie for a plain citizen. Rules:

- No animal features, no likeness of any character, no names, no member badges; the
  sprite contains no image and no character reference (unit-tested).
- Only roles without an authority character walk in the crowd. A profession role still
  stands as its single profession character and is never repeated as a walker.
- Townsfolk are about half a character's height and walk behind the residents, so the
  authority characters stay the main presentation.
- The engine still decides how many walk (`residents.visible`, render caps); the page
  picks the role from the engine's `NEUTRAL_PLACEHOLDER` archetypes for that district,
  then the district's own mix.

`python -m renguin_world residents` prints the report. Real authorities on
2026-09-15: TOTAL 60 · CANONICAL 37 · PROFESSION 14 (7 characters + 7 role refs) ·
PLACEHOLDER 4 · UNRESOLVED 5 · GENERIC_WRONG 0.

### Member icon folder (read-only source, `RENGUIN_MEMBER_ICON_ROOT`)

`E:\素材\icon\鵝寶會員` holds the official 鵝寶會員 cut-outs. Only the offline
builder opens it, never a web request, and nothing in it is modified. A file is
mapped onto an existing ASSET-08 character only when two independent kinds of
evidence agree: its artwork is the nearest reference by structure and colour
(structure distance < 0.18), and its file name agrees with that character's
authority profile on profession or name. A name alone maps nothing, two files
may not claim one character, and everything else is `UNRESOLVED` and not shown.

The mapping (`portraits-private/member-icons.json`, git-ignored) records file
hashes, opaque character ids and the evidence scores only — no file names, no
member names. A matched character keeps its ASSET-08 address and permission
check; only its display derivative is rendered from the official cut-out, so
no keying is needed. 2026-09-15: 10 files → 7 matched (all seven profession
residents), 3 unresolved (a second design of the construction assistant, a
magician and a social-worker character with no authority record).

Six profession sources are painted on an opaque white page and the hotel source
is a chroma-green JPEG with a white sticker frame. The offline builder keys only
the canvas connected to the image border, so the character, its outline and the
frame keep their pixels. Private-identity derivatives are written to the
git-ignored `backend/renguin_world/art/portraits-private/`; run
`scripts/build_world_thumbnails.py` on each machine (Production included) or
the thumb route serves the permitted original. Sources smaller than 256 px are
flagged `ASSET_RESOLUTION_LIMIT` in the manifest (GOOSE_EGG, RENGUIN, ULY).

## 2026-09-15 display derivative update

`scripts/build_world_thumbnails.py` creates proportional, alpha-trimmed lossless
WebP derivatives **offline**, using `characters.asset_path` and the existing
public-visibility rules. Original images are unchanged. The 96/160/256 px files
live under `backend/renguin_world/art/portraits`, outside Flask's static tree.
Their manifest is a display-output index, not a new character authority.

The existing thumbnail endpoint first resolves the current permitted authority
file, then selects a derivative by the source SHA-256 and requested size. Private
or revoked sources return 404 even if a derivative exists. Changed public art
without a matching derivative falls back to the permitted original with
`X-World-Art: original-needs-offline-build`; rerun the build before release to
restore the transfer budget. No request crops, compresses or generates an image.

The original V1 notes below describe the previous on-request PNG implementation
where they mention trimming. Identity, visibility and source authority rules remain.

## Authorities that already exist (discovered, referenced, never copied)

| Authority | Location | What the world takes |
| --- | --- | --- |
| **ASSET-01** Character Bible v1.28 via `GENERAL_CHARACTER_CANON_INDEX.json` (derived lookup index, 37 characters: 24 base, 13 transformation forms) | `Content_OS/10_AI_Editorial_Engine/06_Local_Runner/image_generation/config/` | id, 中文名, entity type, authority version + sha256 of the index |
| **ASSET-08** Member Character Library v1.0 (`MEMBER_CHARACTER_REGISTRY_V1.json`, manifest sha-checked) | `Character_Bible/Member_Character_Library/` | 13 `MEMBER_WORLD_NPC` (public canon), 7 `REAL_MEMBER_AVATAR` (identity private) |
| Office resident images (`creator-residents.json`, exact user-provided PNGs) | `frontend/renguin-characters/residents/` | the image a general character already wears in the Office |
| Office role images (director / editor / scanner / astra) | `frontend/renguin-characters/` | Renguin, 哆啦, 雪寶, Eric |
| Renguin World member registry (148 members, 7 avatars) | `Renguin_World/01_Data/member_registry.json` | **counts per tier** and avatar mapping status by profession only |

No second Character Bible exists. `backend/renguin_world/config/characters.json`
holds world placement only (district, allowed states/actions, dialogue pool);
it has no appearance text. The registry is rebuilt from the authorities on
demand (at most once a minute) and carries `authority_role:
DERIVED_VIEW_NOT_AN_AUTHORITY`.

## World Character Registry

```json
{
  "character_id": "RENGUIN",
  "display_name": "企鵝",
  "character_type": "MAIN_CHARACTER | SUPPORTING_CHARACTER | GOOSEBABY | CIVILIAN | SPECIAL_GUEST",
  "source_authority": "ASSET-01 | ASSET-08 | STAR_OFFICE_RESIDENT_MANIFEST",
  "source_ref": { "index_character_id": "RENGUIN", "entity_type": "BASE_CHARACTER", "authority_version": "1.28" },
  "asset_ref": "/static/renguin-characters/director/renguin.png",
  "default_district": "CREATOR_DISTRICT",
  "public_visibility": true,
  "allowed_states": ["IDLE", "WALKING", "FILMING", "EDITING", "CELEBRATING", "NAPPING"],
  "allowed_actions": ["wave", "film", "celebrate", "nap"],
  "dialogue_pool": "RENGUIN",
  "special_flags": ["SINGLE_INSTANCE", "ALWAYS_VISIBLE"]
}
```

| Type | Who (V1) |
| --- | --- |
| MAIN_CHARACTER | Renguin (single instance). Transformation forms are listed as `EVENT_SKIN_ONLY`, `SHARES_SINGLE_INSTANCE_WITH_SOURCE`, not public — the Bible allows one Renguin at a time. |
| SUPPORTING_CHARACTER | 哆啦, 雪寶, DODO, Eric (ASSET-08's own first four plus the Office's ASTRA) |
| SPECIAL_GUEST | the other base characters with an Office image, rotating daily; residents missing from the Bible (e.g. JOSH) are listed `NOT_IN_CHARACTER_BIBLE` and hidden unless an override shows them |
| GOOSEBABY | Member Character Library characters (below) |
| CIVILIAN | profession archetypes (below) |

Rendering rules:

- A character with an authority image is shown as that image, trimmed and scaled
  (`/api/world/character-thumb`). The world never redraws a canon character.
- A character whose image may not be shown is a neutral penguin **token** with a
  鵝寶 tag — clearly a placeholder, not a likeness.
- Who is on the street: EMPTY_WORLD shows Renguin alone; otherwise the
  always-visible cast, plus up to `min(6, era+1)` guests and goosebabies whose
  district is open. States follow the city: CELEBRATING in REVIVAL/FESTIVAL,
  NAPPING when dormant (if the character allows it).

## Goosebaby Registry

A minimal normalisation — nothing is retyped.

```json
{
  "goosebaby_id": "GOOSE_EGG | MEMBER_AVATAR_<12 hex>",
  "display_name": "鵝蛋 | 護理師鵝寶",
  "avatar_name": null,
  "profession": "NURSE",
  "world_role": "孵蛋所的蛋 | 護理師（具名平民鵝寶）",
  "district": "MEMBER_DISTRICT",
  "asset_ref": "/api/world/character-asset/GOOSE_EGG | null",
  "public_visibility": true,
  "status": "CANONICAL_MEMBER_CHARACTER | BOUND | CANDIDATE | UNBOUND | UNKNOWN",
  "member_class": "MEMBER_WORLD_NPC | REAL_MEMBER_AVATAR",
  "notes": ""
}
```

- **MEMBER_WORLD_NPC** (鵝蛋, 母企鵝蛋, 企鵝破蛋, 幼兒園企鵝, 村民企鵝, 騎士企鵝, 騎士盔甲企鵝, 企鵝公主, 國王企鵝, 皇上企鵝, 伯爵紳士企鵝, 至尊企鵝, 造物主企鵝):
  public canon; readable ids; images served from the library after the profile's
  sha256 is re-verified; each has a world role and the era it appears from.
- **REAL_MEMBER_AVATAR** (7): ASSET-08 marks their identity private and its
  cloud index hides their names. The world follows the same rule: an opaque id
  derived from the profile hash, a profession title (護理師鵝寶, 外送員鵝寶, …),
  `avatar_name: null`, no image. Matching to the member registry is by
  profession, so no member name is read into the world or committed to this repo.
- **Population**: `{ total, by_tier: {BRONZE, SILVER, GOLD, PLATINUM}, snapshot_at }`
  from the member registry. It grows the 鵝寶會員區 crowd (up to +12 residents)
  once the district is open. No member row, name or URL is copied.

## Civilian Registry

Profession archetypes taken from the existing 平民企鵝 (real-member avatar
professions), plus four world archetypes:

| civilian_id | Label | District | From era | Density group | Day / night |
| --- | --- | --- | --- | --- | --- |
| CIVILIAN_NURSE | 護理師 | MAIN_CITY | ERA_03 | CORE | ✓ / ✓ |
| CIVILIAN_FACTORY_WORKER | 工廠作業員 | MAIN_CITY | ERA_05 | COMMUTER | ✓ / – |
| CIVILIAN_DELIVERY_COURIER | 外送員 | MAIN_CITY | ERA_04 | COMMUTER | ✓ / ✓ |
| CIVILIAN_CONSTRUCTION_ASSISTANT | 建築工程助理 | MAIN_CITY | ERA_01 | CORE | ✓ / – |
| CIVILIAN_BAKERY_STAFF | 烘焙門市 | MAIN_CITY | ERA_04 | CORE | ✓ / – |
| CIVILIAN_CALL_CENTER | 電話客服 | CREATOR_DISTRICT | ERA_06 | COMMUTER | ✓ / – |
| CIVILIAN_HOTEL_STAFF | 飯店客服 | TRAVEL_DISTRICT | ERA_03 | CORE | ✓ / ✓ |
| CIVILIAN_VILLAGER / TRAVELER / VENDOR / FESTIVAL_GOER | 村民 / 旅人 / 攤販 / 慶典遊客 | — | ERA_01–02 | CORE / COMMUTER / NIGHTLIFE / FESTIVAL | — |

Civilians are generic tokens coloured by profession badge — crowd, not
characters.

## NPC density presets

| Preset | Resident factor | Groups on the street |
| --- | --- | --- |
| EMPTY | 0 | — |
| QUIET | 0.3 | CORE |
| NORMAL | 0.6 | CORE, COMMUTER |
| BUSY | 0.85 | + NIGHTLIFE |
| FESTIVAL | 1.0 | + FESTIVAL |

`visible = round((era population + member bonus) × factor)`, drawn up to 28
walkers on desktop and 14 on phones. Districts adjust their own crowd from the
last 30 days of matching content (travel → 旅行港區, nightlife/entertainment →
娛樂夜市區, fitness → 主城區 GYM hotspot, career → 創作者街區, shorts → 主城區).

## Resident gossip

`config/gossip.json` — prewritten pools only: GENERIC, PROJECT (with a published
title), ACTIVE, QUIET, DORMANT, DEEP_DORMANT, REVIVAL, FESTIVAL, EMPTY_WORLD,
ERA, PROFESSION, CHARACTER_SPECIFIC. Twelve lines are picked deterministically
per day, score and state. No AI call, no network; a test checks the pool has
no insults and that every emitted line comes from it. Tone: cheeky, never
shaming — 「新片勒？」「聽說企鵝還活著。」「工地先停工了，放心，鷹架都還在。」
