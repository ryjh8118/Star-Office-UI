# Handoff to the owner of `renguin-star-office-extension.js` — what the desk's performance work found in it

In the canonical checkout this file is not what master holds: Content OS's `setup_star_office_ui.py` installs its adapter's
`renguin-star-office-extension.js` and `renguin-star-office-v2.js` into `frontend/` and patches `index.html` / `app.py` to load
them, and the result sits in the checkout as staged, uncommitted changes (plus a further unstaged edit while this work ran). The
source of the extension is therefore Content OS's adapter (`10_AI_Editorial_Engine/04_Adapters/Star_Office/`), and the fixes
below belong there. The performance work did **not** touch the file. Each finding has the measurement behind it. Measured
2026-09-30, real Chrome 154, 3392×862 CSS px at DPR 1.5, 120 Hz.

## 1. `suppressUpstreamCat` is a requestAnimationFrame loop that never ends

```js
const suppressUpstreamCat = () => { hideUpstreamCat(); window.requestAnimationFrame(suppressUpstreamCat); };
window.requestAnimationFrame(suppressUpstreamCat);
```

`hideUpstreamCat()` has two halves. The first walks `Phaser.GAMES`, which does not exist in the bundled Phaser 3.80.1
(`Phaser.GAMES === undefined`; the game object is `game.game`), so it walks an empty list and hides nothing. The second hides
`window.catSprite` and destroys `window.catBubble`: `index.html` creates the cat once (`window.catSprite = cat`) and a bubble
for it from time to time (`showCatBubble`), so the *effect* is real and must stay, but polling for it 120 times a second
for the life of the page is not needed: the cat only needs hiding once after the scene is created, and its bubble once each
time one is made.

Why it matters: a page that always has a pending `requestAnimationFrame` produces a main-thread frame at every vsync, and
every frame Chrome samples every running CSS animation on the main thread (even the ones drawn by the compositor) and
re-runs style, pre-paint, layerize and commit. The Office is a page of ~50–100 running animations.

Measured with the loop the only thing left running (Phaser put to sleep, everything else identical):

| where on the page | main thread, loop running | loop dropped |
|---|---:|---:|
| top of the desk | 243 ms/s | 70 ms/s |
| decks | 354 ms/s | (other frame drivers remain until the hidden-object loops are paused; see the loop log) |

Suggested change (any one of):

- hide the cat once after the scene exists (`create()` in `index.html` sets `window.catSprite`) and make `showCatBubble` a
  no-op or destroy its bubble where it is made, then delete the loop;
- or bound the loop: a `setInterval(hideUpstreamCat, 500)` for the first ~10 s of the page, then `clearInterval`, plus a
  `catBubble` guard where the bubble is made;
- or keep the loop but make it end: stop rescheduling once `window.catSprite` exists and is hidden.

Removing the loop without doing one of those brings the upstream cat back, so it is a change for whoever owns the file.

## 2. `pollProjectRegistry` polls a 11.7 MB file every 5 s and keeps nothing

See `Content_OS_Handoff_20260930.md` §2. Star Office now answers a matching poll from the object it already parsed
(`creator-fetch-cache.js`), so the parse is gone, but the request itself, its `cache: no-store`, its cache-busting query and
the empty filter (`bindable && classification === 'REGISTERED'`, a field no project has) are still there: poll a digest, or
nothing.

## 3. Smaller

- `applyRenguinBranding` re-walks text nodes on a 750 ms timer; a `MutationObserver` that fires only on the nodes that change
  would do it without the timer.
- `pickerObserver` (a `MutationObserver` on the document) fires on every DOM change the page makes.

None of these is a stall; they are the small always-on costs the loop above sits on top of.
