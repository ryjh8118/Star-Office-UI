"use strict";
const OFFICE = "http://127.0.0.1:19119";
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  const origin = (() => {
    try {
      return new URL(sender.url).origin;
    } catch {
      return "";
    }
  })();
  if (
    message?.type === "office-pair" &&
    origin === OFFICE &&
    /^[A-Za-z0-9_-]{43}$/.test(message.token || "")
  ) {
    chrome.storage.local
      .set({ token: message.token })
      .then(async () => {
        const tabs = await chrome.tabs.query({ url: "https://chatgpt.com/*" });
        for (const tab of tabs)
          if (tab.id !== undefined) {
            try {
              await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ["chatgpt.js"],
              });
            } catch {}
          }
        reply({ paired: true });
      })
      .catch(() => reply({ paired: false }));
    return true;
  }
  if (
    message?.type !== "chatgpt-status" ||
    origin !== "https://chatgpt.com" ||
    sender.tab?.id === undefined
  )
    return;
  if (
    !["WORKING", "IDLE", "UNKNOWN"].includes(message.state) ||
    typeof message.title !== "string" ||
    !Number.isFinite(message.observed_at)
  )
    return;
  chrome.storage.local.get("token").then(async ({ token }) => {
    if (!token) return reply({ connected: false });
    try {
      const result = await fetch(
        OFFICE + "/api/creator/browser-bridge/observe",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
          },
          body: JSON.stringify({
            client_id: "chatgpt-tab-" + sender.tab.id,
            state: message.state,
            title: message.title.slice(0, 120),
            observed_at: message.observed_at,
          }),
          signal: AbortSignal.timeout(5000),
        },
      );
      reply({ connected: result.ok });
    } catch {
      reply({ connected: false });
    }
  });
  return true;
});
