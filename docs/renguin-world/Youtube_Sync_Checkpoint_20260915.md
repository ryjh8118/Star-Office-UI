# YouTube sync checkpoint — BLOCKED

No real API key was read, persisted, logged or committed. Presence-only checks
in the restricted process and the actual signed-in Windows user both found
`YOUTUBE_API_KEY` absent in Process/User/Machine scopes. The user has been asked
for its secure local storage location, not its value. Creating a key in Google
Cloud does not by itself make it available to the local process.

## Execution

Executed the requested `python -m renguin_world youtube-sync` from `backend/`,
using `RENGUIN_PRESENTATION_ROOT` to select the real local presentation store.
Result: exit 1, `GATED / YOUTUBE_API_KEY_NOT_CONFIGURED`, synced 0,
eligible contents 20, unmapped contents 18. No YouTube Data API call occurred.
Publish dates, view counts and live popularity buckets have NOT been verified
with the Data API or updated. World popularity remains GATED with 0 tracked videos.

## Verified local mapping work

Read the public Renguin channel's 150-entry video list through the installed
agent-reach yt-dlp backend, without cookies or credentials. Compare downloaded
public metadata locally; do not send private project titles to search providers.
Two public video descriptions uniquely identify the existing project and its
participant, corroborated by channel `UCngezrYb9YylX2M24Fz6Dmw`:

- https://www.youtube.com/watch?v=0olGQMd6MXA
- https://www.youtube.com/watch?v=NxVYhbJLhMg

Only these two video IDs were applied to the real local, Git-ignored
`.world-runtime/world-overrides.json`. Full internal project IDs, candidate
metadata, descriptions and actual overrides are not included in this commit.
Another candidate required age verification; no authentication bypass was used.
The other 18 records remain unmapped, including records without a uniquely
identifiable public YouTube version. Public-page timestamps are retained only
as local evidence, pending `videos.list` verification; completion dates were
not repurposed as verified publication dates.

An automatic review rejected an earlier query containing a potentially sensitive
local title. The safe replacement succeeded: request the already-public channel
URL, then match locally. No additional approval is required for the completed
replacement method.

## Repairs and validation

- Sync all eligible contents after overrides, not just the limited featured cards.
- Honor the configured presentation root; report unmapped coverage explicitly.
- Empty mappings return GATED; a mapped subset returns PARTIAL, not full success.
- Failed or malformed API responses and missing videos preserve the old snapshot.
- Discard exception text that might contain a credential-bearing request URL.
- Validate and normalize returned publish timestamps before saving a snapshot.
- Invalidate only the disposable World cache after a successful snapshot write.
- Non-success CLI results now return a nonzero exit code.

Unit/scene regression: 18 engine + 13 sources/routes + 8 new sync + 9 scene tests
= **48/48 passed**. New fixtures cover multi-batch failure without secret leakage,
missing IDs/statistics, invalid dates, all-content selection, partial mapping,
configured storage, cache preservation and popularity tier boundaries.
All tests use synthetic credentials/data, never the user's key.

The existing real-browser regression passed **29/29** on the isolated localhost
Preview (19127), including mobile, lifecycle, lazy loading, all original era and
activity cases, and its own live-state store. A restricted invocation produced
no output and was not counted; the normal-user run generated the recorded results.
See `youtube-regression-20260915.json` and
`youtube-browser-regression-20260915.txt`. Preview data is separate from Production;
its 1-content fixture is not claimed as a 20-content Production browser test.

The engine and rule files are unchanged. Real-data before/after comparison of
the two ID-only overrides preserved content count 20, score 74, level 14,
ERA_03, recent growth and activity. The live Production API independently
confirmed those count/score/level/era values after the local mapping write.

Official API contract: https://developers.google.com/youtube/v3/docs/videos/list
and https://developers.google.com/youtube/v3/docs/videos . Runtime statistics
continue to be an explicit CLI operation, never a browser request to YouTube.

## Resume / rollback

Supply only the secure local location of the existing key. Load its value into
the sync process environment without echoing it or adding it to files/arguments.
Then repeat the explicit sync, validate the mapped IDs/publish timestamps/views,
check each bucket against the existing rules and compare growth/era again.
Resolve further mappings only with unique, verifiable evidence.

Code repairs are isolated on `codex/renguin-world-youtube-sync-20260915`.
Production application code and other sessions' changes were not modified;
only the two local ID overrides and disposable runtime cache were updated.
To undo this turn's data edit, remove only its two `youtube_video_id` fields
from the local overrides, preserving any newer edits, and rebuild the cache.
The isolated code branch starts from `9b47d09`; no remote push was attempted.
