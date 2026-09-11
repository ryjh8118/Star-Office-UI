const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const code = fs.readFileSync(
  require("node:path").join(__dirname, "../browser-bridge/chatgpt.js"),
  "utf8",
);
test("only a visible enabled stop control means working; message contains no conversation content", () => {
  for (const [visible, disabled, composer, expected] of [
    [true, false, true, "WORKING"],
    [false, false, true, "IDLE"],
    [true, true, true, "IDLE"],
    [false, false, false, "UNKNOWN"],
  ]) {
    const sent = [];
    const context = {
      document: {
        title: "企劃標題",
        querySelectorAll: () => [
          { disabled, getClientRects: () => (visible ? [{}] : []) },
        ],
        querySelector: () => (composer ? {} : null),
      },
      chrome: {
        runtime: {
          sendMessage: async (msg) => {
            sent.push(msg);
          },
        },
      },
      setInterval: () => {},
      Date,
    };
    vm.runInNewContext(code, context);
    assert.equal(sent[0].state, expected);
    assert.deepEqual(Object.keys(sent[0]).sort(), [
      "observed_at",
      "state",
      "title",
      "type",
    ]);
    assert.equal(sent[0].title, "企劃標題");
    vm.runInNewContext(code, context);
    assert.equal(sent.length, 1);
  }
});

test("pairing from Production sends observations back to Production", async () => {
  const background = fs.readFileSync(
    require("node:path").join(__dirname, "../browser-bridge/background.js"),
    "utf8",
  );
  let listener;
  const stored = {},
    posted = [];
  const context = {
    URL,
    AbortSignal,
    fetch: async (url) => {
      posted.push(url);
      return { ok: true };
    },
    chrome: {
      runtime: { onMessage: { addListener: (fn) => (listener = fn) } },
      storage: {
        local: {
          set: async (value) => Object.assign(stored, value),
          get: async (keys) => Object.fromEntries(keys.map((k) => [k, stored[k]])),
        },
      },
      tabs: { query: async () => [] },
      scripting: { executeScript: async () => {} },
    },
  };
  vm.runInNewContext(background, context);
  // Replies are built inside the vm realm; compare them as plain data.
  const send = (message, sender) =>
    new Promise((resolve) => {
      const plain = (value) => resolve(value && JSON.parse(JSON.stringify(value)));
      if (!listener(message, sender, plain)) resolve(undefined);
    });
  const token = "a".repeat(43);
  assert.equal(
    await send({ type: "office-pair", token }, { url: "http://127.0.0.1:4444/" }),
    undefined,
    "an unknown local page cannot pair",
  );
  assert.deepEqual(
    await send({ type: "office-pair", token }, { url: "http://127.0.0.1:19000/" }),
    { paired: true },
  );
  assert.equal(stored.office, "http://127.0.0.1:19000");
  const status = { type: "chatgpt-status", state: "WORKING", title: "企劃", observed_at: 1 };
  assert.deepEqual(
    await send(status, { url: "https://chatgpt.com/c/1", tab: { id: 7 } }),
    { connected: true },
  );
  assert.deepEqual(posted, ["http://127.0.0.1:19000/api/creator/browser-bridge/observe"]);
});
