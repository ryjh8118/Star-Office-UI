(() => {
  "use strict";
  if (
    !["http://127.0.0.1:19000", "http://127.0.0.1:19119"].includes(
      location.origin,
    )
  )
    return;
  window.addEventListener("message", async (event) => {
    if (
      event.source !== window ||
      event.origin !== location.origin ||
      event.data?.type !== "RENGUIN_PAIR"
    )
      return;
    let paired = false;
    try {
      paired = !!(
        await chrome.runtime.sendMessage({
          type: "office-pair",
          token: event.data.token,
        })
      )?.paired;
    } catch {}
    window.postMessage(
      {
        type: "RENGUIN_PAIR_RESULT",
        paired,
        request_id: event.data.request_id,
      },
      location.origin,
    );
  });
})();
