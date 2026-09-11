"use strict";
// Production (19000) is the desk the user works at; Preview (19119) is kept for
// QA. The token is stored with the Office that issued it, and observations go
// back to that Office only.
const OFFICES = ["http://127.0.0.1:19000", "http://127.0.0.1:19119"];
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
    OFFICES.includes(origin) &&
    /^[A-Za-z0-9_-]{43}$/.test(message.token || "")
  ) {
    chrome.storage.local
      .set({ token: message.token, office: origin })
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
  chrome.storage.local.get(["token", "office"]).then(async ({ token, office }) => {
    if (!token || !OFFICES.includes(office)) return reply({ connected: false });
    try {
      const result = await fetch(
        office + "/api/creator/browser-bridge/observe",
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
