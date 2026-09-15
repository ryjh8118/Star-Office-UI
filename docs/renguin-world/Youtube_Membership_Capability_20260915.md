# Membership capability probe — confirmed access gate

PHASE_1 remains **PASS_WITH_DECLARED_UNAVAILABLE_DATA** (16 fully verified,
3 identity verified / public count unavailable, 1 unresolved). PHASE_2 is
**CONFIRMED_TRUE_GATE**, not membership synchronization success.

## Actual OAuth and API evidence

Reused the existing **Renguin World Desktop Sync** Desktop client in the existing
local `02_Sync` environment. Its earlier token returned `invalid_grant`.
The user personally completed a new Google consent flow. No new OAuth client or
replacement account was created. The adapter reuses the existing configuration,
InstalledAppFlow and installed runtime, suppresses authorization URL and callback
logging, and stores new credentials only with Windows per-user DPAPI outside Git.
It does not run the existing member-sync entry point, write its plaintext token
file, or create member snapshots/events.

Live verification after consent:

- Google token inspection: HTTP 200. Actual granted scopes include both
  `youtube.readonly` and `youtube.channel-memberships.creator`; client matches.
- `channels.list(part=id,mine=true)`: token accepted and expected Renguin channel
  identity confirmed.
- `members.list(part=snippet,mode=all_current,maxResults=1000)`: HTTP **403**,
  reason **forbidden**. The API did not return a member page.
- Members found = unavailable, not zero. Pagination could not start. Levels were
  not queried because the work order requires members access to pass first.

This is an observed channel API access denial with valid authorization and the
expected owner/channel. The response does **not** specify whether the channel
is missing an allowlist entry or another platform eligibility condition.
Do not claim a narrower root cause without YouTube confirmation. Google's
[Members reference](https://developers.google.com/youtube/v3/docs/members)
documents channel-level access restrictions and dedicated Partner Manager access;
the [members.list reference](https://developers.google.com/youtube/v3/docs/members/list)
directs creators to their Google/YouTube representative to request access.

Required external step: ask that representative to confirm/enable this channel's
Members API access. Creating another client, repeatedly consenting, or changing
the membership CSV is not a solution to this confirmed denial.

## Validation and security

Six synthetic probe tests verify all-page traversal, no private identities in
output, duplicate/pagination failure, creator identity, error classification,
missing level relationships, and unavailable counts on denial. They validate the
implementation only; they do not replace the failed live capability request.

After OAuth, public sync again returned 19/19 mapped identities, 16 complete
statistics and 3 explicitly null counts, with 1 unresolved content. Recalculated
growth/level/era remain 74/14/ERA_03 using the existing rules. World tests 55/55,
Office tests 78/78, probe tests 6/6, final browser regression 29/29. The final
secret scan checked 773 files plus both worktrees' diff/index against the actual
API key, access token, refresh token and client secret, with zero hits. The
pre-existing untracked running-service lock was excluded. Sanitized results are
retained in ignored `.qa-runtime` files.

No member CSV, registry, member roles, production member data or authority was
modified. No raw private API response, token, client secret, authorization code
or OAuth screenshot is committed. The user's supplied callback screenshot is
not copied into the repository or reports. The callback code was exchanged by
the OAuth library; no screenshot-based credential extraction was used.

Code remains isolated in the task branch and Preview. No Production code update
or push is claimed. Resume the read-only probe with the same protected client
after external access is enabled; inspect all pages and then membership levels.
