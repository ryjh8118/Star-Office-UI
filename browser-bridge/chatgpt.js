(() => {
  "use strict";
  if (globalThis.__renguinStatusObserver) return;
  globalThis.__renguinStatusObserver = true;
  let last = "",
    sentAt = 0;
  function readStatus() {
    const selectors = [
      'button[data-testid="stop-button"]',
      'button[aria-label="Stop streaming"]',
      'button[aria-label="Stop generating"]',
      'button[aria-label="停止生成"]',
      'button[aria-label="停止產生"]',
    ];
    const visible = (e) => !!e && e.getClientRects().length > 0 && !e.disabled;
    return selectors.some((selector) =>
      [...document.querySelectorAll(selector)].some(visible),
    )
      ? "WORKING"
      : document.querySelector("#prompt-textarea")
        ? "IDLE"
        : "UNKNOWN";
  }
  async function report() {
    const state = readStatus(),
      title = document.title.slice(0, 120),
      now = Date.now();
    const key = state + "|" + title;
    if (key === last && now - sentAt < 10000) return;
    last = key;
    sentAt = now;
    try {
      await chrome.runtime.sendMessage({
        type: "chatgpt-status",
        state,
        title,
        observed_at: now / 1000,
      });
    } catch {}
  }
  report();
  setInterval(report, 2000);
})();
