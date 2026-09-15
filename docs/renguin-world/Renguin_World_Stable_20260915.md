# Renguin World stable checkpoint — 2026-09-15

Scope is frozen to the implemented World, existing visual/interaction changes,
YouTube sync and canonical URL binding. No Discord, Member Center, automatic
member residents or new product scope was added. Membership API 403 is an
accepted external gate and does not block this release.

## Acceptance before merging

- Isolated Preview at `http://127.0.0.1:19128/world` uses a minimal read-only
  snapshot of the actual 20 content records and verified public API metadata.
  Inbox, notes, history, covers, credentials and private member rows were excluded.
  Preview writes remain isolated; the snapshot and live screenshots are ignored.
- Python regression: 162/162. Node regression: 90/90. The first sandbox Node run
  encountered external-repository ownership protection; the same suite passed
  as the normal user without changing Git safety settings.
- Browser World regression: 29/29 against the real 20-record Preview.
- Desktop 1440×900 and mobile 390×844: 24/24 live acceptance checks, including
  time selection, resident dialogue, pause/resume, refresh, roster lazy loading,
  no overflow/broken images/console errors and accurate data presentation.
- 28 scenario screenshots cover both viewport sizes, all eight eras, day/night,
  quiet/dormant/revival. Ten lifecycle cycles clean timers, requests, tracked
  listeners and mounted HUD nodes. Office requests no World resources.
- Visual review is SELF_REVIEW of the implemented current scope: the paper
  landscape, trees, bridges/buildings, sticker characters, road/era progression
  and responsive controls render consistently. This is not a claim of completed
  Sunburst image generation, the old aspirational art brief, physical-device
  testing, or personal aesthetic approval by the user.

## Data integrity

20/20 have declared resolution status: 16 FULLY_VERIFIED, 3 IDENTITY_VERIFIED /
PUBLIC_VIEWCOUNT_UNAVAILABLE, 1 IDENTITY_UNRESOLVED. Unknown view counts and
popularity buckets stay null. The UI now explicitly says unavailable and leaves
the unresolved content without a YouTube link. No zero substitution or guessed
binding was made. API publish dates and available counts remain the authority.

Calculated result: growth 74, level 14, ERA_03; 18 long and 2 short contents.
Growth formula, era thresholds, membership registry/CSV authority and character
identity remain unchanged. The summary counts are display/acceptance evidence,
not new unlock rules.

## Release procedure and rollback

The release candidate is validated in the isolated branch first. Master is
advanced only by a non-destructive fast-forward; unrelated staged/unstaged
changes are preserved. The existing owned Production service is stopped and
started through its own validated controller, not by broad process termination.
Production verification and the remote-match outcome are recorded below after
execution. No local private runtime or live-data screenshot is included in Git.

Previous stable master: `4aef2c1`. Roll back this release through a reviewed
revert of its changes, keeping user data and other sessions' changes intact;
never reset/force-push or delete the user store. Public-statistics snapshots
must be interpreted by a compatible version (unknown counts are null).

Stable tag planned: `renguin-world-stable-20260915`. The tag names the final
accepted commit, not a promise that unavailable external data became available.

Production/remote verification: pending final release execution.
