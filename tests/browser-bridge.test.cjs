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
