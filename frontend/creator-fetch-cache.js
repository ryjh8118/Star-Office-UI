/* The desk polls one generated file, the verified project projection (~12 MB, rewritten every few seconds).
   Between two rewrites only two fields of it change (when it was generated, and the digest that covers that),
   so nearly every poll downloaded and parsed 12 MB to learn nothing. The server names the content with an ETag
   that ignores those two fields. This asks with it, and when the content is what was already parsed the caller
   is handed that same object instead of a fresh 12 MB body.

   It changes what is transferred and parsed, never what a caller sees: a 200 is the untouched response, and a
   caller that gets the held object receives exactly what parsing the same bytes again would have produced. */
(function (scope) {
  "use strict";
  if (!scope || typeof scope.fetch !== "function" || scope.__renguinFetchCache) return;
  // The experimental v2 view reads this payload and keeps it; it gets an untouched fetch.
  try {
    if (new URLSearchParams(scope.location.search).get("star-office-v2") === "1") return;
  } catch (error) {}
  const nativeFetch = scope.fetch;
  const FILES = new Set(["/static/renguin-projects-v2.json"]);
  const held = new Map(); // path -> { etag, value }
  const pathOf = (input) => {
    if (typeof input !== "string") return null;
    const path = input.split("?")[0];
    return FILES.has(path) ? path : null;
  };
  // Callers check .ok and call .json(), so a Response it is; its body is the one already parsed.
  function reply(value) {
    const response = new Response(null, { status: 200, headers: { "Content-Type": "application/json" } });
    response.json = () => Promise.resolve(value);
    return response;
  }
  scope.__renguinFetchCache = true;
  scope.fetch = function (input, init) {
    const path = pathOf(input);
    const method = String((init && init.method) || "GET").toUpperCase();
    if (!path || method !== "GET") return nativeFetch.apply(this, arguments);
    const entry = held.get(path);
    const headers = new Headers((init && init.headers) || undefined);
    if (entry) headers.set("If-None-Match", entry.etag);
    return nativeFetch.call(this, path, Object.assign({}, init, { headers, cache: "no-store" })).then((response) => {
      if (response.status === 304 && entry) return reply(entry.value);
      const etag = response.headers.get("ETag");
      if (response.ok && etag) {
        const parse = response.json.bind(response);
        response.json = () =>
          parse().then((value) => {
            held.set(path, { etag, value });
            return value;
          });
      }
      return response;
    });
  };
})(typeof window === "undefined" ? undefined : window);
