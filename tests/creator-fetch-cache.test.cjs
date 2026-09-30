"use strict";
// The desk's poll of the generated projection: nothing a caller can see may change, only what is transferred and parsed.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../frontend/creator-fetch-cache.js"), "utf8");
const FILE = "/static/renguin-projects-v2.json";

/** Load the real file against a scripted server; `calls` records exactly what reached the network. */
function load({ search = "", server }) {
  const calls = [];
  const native = function (input, init) {
    calls.push({ input, init, ifNoneMatch: new Headers((init && init.headers) || undefined).get("If-None-Match") });
    return Promise.resolve(server(calls.length - 1, input, init));
  };
  const win = { location: { search }, fetch: native };
  win.window = win;
  vm.runInContext(source, vm.createContext({ window: win, Response, Headers, URLSearchParams, Object, Promise, String, Set, Map }));
  return { win, calls, native };
}
const ok = (body, etag) => new Response(JSON.stringify(body), { status: 200, headers: etag ? { ETag: etag, "Content-Type": "application/json" } : {} });
const notModified = (etag) => new Response(null, { status: 304, headers: { ETag: etag } });

(async () => {
  // a fetch that is not for the generated file is not touched at all
  {
    const { win, calls, native } = load({ server: () => ok({ a: 1 }) });
    await win.fetch("/api/renguin/operations", { cache: "no-store" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].input, "/api/renguin/operations");
    assert.deepEqual(calls[0].init, { cache: "no-store" });
    assert.notEqual(win.fetch, native, "the wrapper is installed");
  }
  // first ask: nothing held, so no validator; the cache-buster is dropped; the caller gets the untouched response
  const held = { projects: [{ id: 1 }] };
  {
    const { win, calls } = load({ server: () => ok(held, '"sem-a"') });
    const response = await win.fetch(FILE + "?t=123", { cache: "no-store" });
    assert.equal(calls[0].input, FILE, "?t= is not sent");
    assert.equal(calls[0].ifNoneMatch, null);
    assert.equal(calls[0].init.cache, "no-store");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), held);
  }
  // second ask: the validator goes out; a 304 hands back the very object parsed the first time
  {
    const replies = [ok(held, '"sem-a"'), notModified('"sem-a"'), ok({ projects: [{ id: 2 }] }, '"sem-b"'), notModified('"sem-b"')];
    const { win, calls } = load({ server: (i) => replies[i] });
    const first = await (await win.fetch(FILE + "?t=1", { cache: "no-store" })).json();
    const second = await win.fetch(FILE + "?t=2", { cache: "no-store" });
    assert.equal(calls[1].ifNoneMatch, '"sem-a"');
    assert.equal(second.ok, true);
    assert.equal(second.status, 200, "the caller is never shown a 304");
    assert.equal(await second.json(), first, "the same object, not a copy and not another parse");
    // content that did change is the new body, and the new validator is the one asked with next
    const third = await (await win.fetch(FILE + "?t=3", { cache: "no-store" })).json();
    assert.deepEqual(third, { projects: [{ id: 2 }] });
    assert.equal(calls[2].ifNoneMatch, '"sem-a"');
    const fourth = await win.fetch(FILE + "?t=4", { cache: "no-store" });
    assert.equal(calls[3].ifNoneMatch, '"sem-b"');
    assert.equal(await fourth.json(), third);
  }
  // a response without a validator is never held, so the next ask is unconditional
  {
    const { win, calls } = load({ server: () => ok(held) });
    await (await win.fetch(FILE, {})).json();
    await (await win.fetch(FILE, {})).json();
    assert.equal(calls[1].ifNoneMatch, null);
  }
  // an error is passed through as it came, and holds nothing
  {
    const { win, calls } = load({ server: (i) => (i === 0 ? new Response("no", { status: 503, headers: { ETag: '"x"' } }) : ok(held, '"sem-a"')) });
    const bad = await win.fetch(FILE, {});
    assert.equal(bad.status, 503);
    assert.equal(bad.ok, false);
    await win.fetch(FILE, {});
    assert.equal(calls[1].ifNoneMatch, null);
  }
  // anything that is not a plain GET goes straight through
  {
    const { win, calls } = load({ server: () => ok(held, '"sem-a"') });
    await win.fetch(FILE, { method: "POST", body: "{}" });
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[0].input, FILE);
  }
  // the experimental v2 view keeps this payload itself: it gets the browser's own fetch
  {
    const { win, native } = load({ search: "?star-office-v2=1", server: () => ok(held, '"sem-a"') });
    assert.equal(win.fetch, native);
  }
  // loaded twice, it wraps once
  {
    const { win } = load({ server: () => ok(held, '"sem-a"') });
    const wrapped = win.fetch;
    vm.runInContext(source, vm.createContext({ window: win, Response, Headers, URLSearchParams, Object, Promise, String, Set, Map }));
    assert.equal(win.fetch, wrapped);
  }
  console.log("creator-fetch-cache: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
