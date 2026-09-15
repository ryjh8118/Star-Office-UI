# Phase 1 — declared unavailable data acceptance

This supersedes the acceptance conclusion in `Youtube_Phase1_Live_Gate_20260915.md`
under the user's revised scope. It does not erase that historical evidence.

**PHASE_1 = PASS_WITH_DECLARED_UNAVAILABLE_DATA** means data integrity passed,
not that all 20 contents have complete YouTube statistics.

## Live verification

The existing Windows User `YOUTUBE_API_KEY` was inherited into a child process
without printing its value. The actual `python -m renguin_world youtube-sync`
request returned 19 of 19 mapped IDs: 16 FULLY_VERIFIED and 3 IDENTITY_VERIFIED /
PUBLIC_VIEWCOUNT_UNAVAILABLE. All 19 responses identify the verified channel.
The remaining content stays IDENTITY_UNRESOLVED with no video binding.

The 3 absent counts are JSON null, with the exact provenance:
`YouTube API did not provide public viewCount`. Their popularity buckets are
null. An explicit malformed count, missing requested video, failed request,
missing key, invalid saved snapshot, or stale data still cannot claim live success.

All 20 contents have explicit statuses in the local `youtube_resolutions.json`.
The unresolved record retains references to prior public catalog, upload-list
and local cover-review evidence for Canonical Project Identity V2 reconciliation.
No uniquely supported candidate exists; none was fabricated or bound.
Public API metadata, internal mappings and local reconciliation evidence remain
outside Git in ignored runtime files.

Recalculation used the existing rules and classifications: 20 contents (18 long,
2 short), growth **74**, level **14**, **ERA_03**. These results were computed,
not fixed to the previous values. Popularity: 8 VIEW_TIER_1, 8 VIEW_TIER_2,
4 unavailable (3 missing counts and 1 unresolved identity). Publish dates for
the 19 confirmed identities come from the API. No growth formula or era threshold
changed. No member CSV, registry, member role or character authority was modified.

## Manual URL binding

The existing Office project-link field validates watch, youtu.be, Shorts, live
and embed video URLs through videos.list before committing. The stable selected
source project ID (or the existing stable local project ID) is the canonical key;
titles and full URLs are not identity keys. Relationships and safe metadata live
in `canonical_youtube_bindings` inside the existing presentation transaction.

USER_CONFIRMED_BINDING outranks inferred/BIONIC mappings. Existing API-verified
overrides are reserved in the same transaction before checking uniqueness; an
unverified legacy mapping fails closed. A duplicate owner produces a short human
confirmation and no mutation. Explicit confirmation is checked against the
current owner and revision again inside the transaction. Unlinking leaves a
manual tombstone, retains projects and other bindings, and prevents inferred
overrides from silently restoring the old relationship.

A successful URL save refreshes safe metadata and immediately rebuilds the
World and its resolution projection. No extra sync click or background polling
is needed. A fresh manual null count cannot fall back to an older cached value.
Only explicit URL writes and the sync CLI contact YouTube; viewing World uses
local derived data. The key remains server-side in the process environment.

## Verification and boundaries

- World Python tests: 46/46. Scene tests: 9/9 (55 World checks total).
- Office Python regression: 78/78, including 17 manual-binding integration tests.
- Browser regression: 29/29 on isolated Preview, covering all eight milestones,
  quiet/dormant/revival, desktop/mobile, zero World requests outside World,
  hidden-tab pause, leaving cleanup, and no console errors.
- The Preview browser's own live store contains one content. The real 20-content
  calculation was separately run against the existing local store through the
  current branch; the browser result is not misrepresented as a 20-content
  Production deployment. Measured full-city main-thread cost: 2.5 ms/s.
- Secret scan: 762 files and both worktrees' unstaged/staged diffs, zero exact-key
  or Google credential-pattern hits. The pre-existing untracked running-service
  lock file was excluded; it is not a new artifact or tracked change.
- Main workspace staged/unstaged hashes remained unchanged. Production code was
  not replaced. Preview: `http://127.0.0.1:19127/world`. No push.

Sanitized detailed results are in the local `.qa-runtime/phase1-acceptance-v2-*`
files. The API snapshot and resolution projection have hashes recorded there.
This acceptance concerns data integrity and the URL feature, not the earlier
unpassed visual/Sunburst work. User visual approval is not claimed.

Next: immediately proceed to the existing **Renguin World Desktop Sync** OAuth
client and read-only Membership API capability probe. Stop at personal OAuth
login/consent; never create a substitute client or change the member authority.
