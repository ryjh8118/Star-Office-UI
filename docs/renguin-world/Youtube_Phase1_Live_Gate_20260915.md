# Live public sync — Phase 1 gate

This supersedes the earlier missing-key checkpoint. The existing Windows User
environment now contains the key. Its value was loaded only into the child
process environment, never echoed or saved. Real YouTube Data API requests
succeeded. No OAuth credentials, tokens or membership data were read.

## Result

- World content records: 20.
- Canonical video identities corroborated: 19.
- Live API identity, publish timestamp, view count and computed bucket: **16/20**.
- Identified videos for which the API omits `statistics.viewCount`: **3**.
- Existing content record without a uniquely verified video identity: **1**.
- **Phase 1: BLOCKED. Phase 2: NOT STARTED**, following the required order.

The three unavailable counts are not zeros. The endpoint returned their
metadata but no view count. This is the observed public API limitation; it is
not proof of a particular membership eligibility/allowlist rule, and no claim is
made that owner OAuth will necessarily expose those counts.

## Actual discovery and verification

Queried the previously discovered public channel's 150-item long-video list
through `videos.list`, then traversed five pages of the API uploads playlist.
The upload traversal covered 224 records dated 2025 or later, including Shorts,
and stopped at the explicit 2025-01-01 cutoff. This is public video discovery,
not a membership pagination probe or a claim to have traversed the full archive.

Matched titles, descriptions, participant/event text and existing Office covers
locally. Public API thumbnail URLs were fetched for comparison; local images
and internal project titles were not transmitted. Image differences were only
a comparison aid, not an automatic identity decision. Two generic titles were
resolved through their matching scene/thumbnail; one unrelated generic record
remains unresolved. Main long-form projects retain their existing identity
rules; bonus/member cuts were not counted as additional content.

The 19 ID mappings were saved only in the ignored local overrides. The previous
two-ID overrides were backed up before editing. Per-video API metadata and the
mapping evidence remain in the ignored local runtime, not in Git. Dates and
statistics for the full candidate set have not been promoted to Production.

Explicit CLI rerun after mapping:

```text
status=PARTIAL
reason=VIDEOS_MISSING_OR_WITHOUT_STATISTICS
requested=19
received=16
synced=0
eligible_contents=20
unmapped_contents=1
exit_code=1
```

The incomplete request preserved the previous two-video snapshot. That earlier
snapshot came from a successful live API request in this turn; it is not claimed
as 20-video coverage. The full 16-record metadata verification is recorded
separately as a candidate, not disguised as a successful CLI commit of all 20.

## Recalculation and implementation

Recomputed the candidate through the unchanged engine/rules using the verified
publish dates and 16 available counts. Retained unknown data as unknown and kept
existing content classifications. Candidate result: growth 74, level 14, ERA_03;
these values were calculated, not pinned to the previous state. This is a
provisional calculation with one unresolved identity and three missing counts,
not final 20/20 acceptance. Verified-subset popularity: 8 in VIEW_TIER_1 and
8 in VIEW_TIER_2; unknown counts were excluded from this distribution.

Found and fixed an additional false-success path: a recent saved snapshot could
still report OK after the latest CLI attempt was partial or failed. The new
`youtube_sync_attempt.json` stores only status, timestamp and counts. Every CLI
attempt invalidates the disposable world-state cache; loading the last good
snapshot now exposes PARTIAL/ERROR/GATED or STALE as appropriate. The last good
video snapshot remains intact. Later successful sync recovers to OK.

No frontend, growth formula, era threshold, membership authority, CSV or member
role data was changed. Production application code was not deployed while
Phase 1 remains gated. The status repair was exercised in the isolated branch
and Preview; it is not claimed to have replaced the running Production code.

## Validation / resume

World and sync regression: **53/53** (18 engine, 13 sources/routes, 13 sync and
9 scene). Includes quota-style HTTP failures, malformed responses, missing
statistics, non-featured coverage, stale snapshots, latest-attempt status and
World-service integration. One new test initially used an incomplete mock
registry, then passed after adding its required empty sources list.

The browser regression passed **29/29** on the isolated Preview's own live store
and simulation cases (not a claim of final 20-video Production acceptance).
The secret scan checked 755 files plus both worktrees' current/staged diffs, with
zero exact-key or Google credential-pattern hits. These results are recorded
with this checkpoint's sanitized result files. All new tests use synthetic credentials. No member list,
private API payload or OAuth authorization artifact was produced.

Required external resolution: identify the remaining record's canonical video
or confirm it has no YouTube version, and resolve how the three absent public
counts can be obtained legitimately (or explicitly revise the acceptance scope).
Do not start Phase 2/OAuth or push until Phase 1 meets the user's gate. No new
OAuth client, login, consent click, token storage or membership migration was
attempted. Existing member CSV remains authority.

API references:
- https://developers.google.com/youtube/v3/docs/videos/list
- https://developers.google.com/youtube/v3/docs/playlistItems/list
- https://developers.google.com/youtube/v3/docs/channels/list
