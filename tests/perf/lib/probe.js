// Injected before any page script (Page.addScriptToEvaluateOnNewDocument).
//
// "light" mode observes and never wraps: frame timestamps, long tasks, long animation
// frames, slow input events, paint timings. Safe for timing runs.
// "audit" mode also wraps timers, rAF, listeners, observers, fetch/XHR, JSON.parse,
// innerHTML and layout-reading getters, and reports WHICH call site did the work and how
// long each call took. It perturbs timing a little, so it answers "who", never "how fast".
(function () {
  "use strict";
  if (window.__so) return;
  var so = (window.__so = {});
  var MODE = window.__soMode || "light";
  var now = performance.now.bind(performance);
  var origRAF = window.requestAnimationFrame.bind(window);
  so.mode = MODE;

  // ------------------------------------------------------------- frames
  var cap = 1 << 18;
  var frames = new Float64Array(cap);
  var scrolls = new Float32Array(cap);
  var n = 0;
  var recording = false;
  var gen = 0;
  // one chain per start: a stale callback from the previous window must never keep recording
  function makeTick(g) {
    return function tick(t) {
      if (!recording || g !== gen) return;
      if (n < cap) {
        frames[n] = t;
        scrolls[n] = window.scrollY;
        n++;
      }
      origRAF(tick);
    };
  }
  so.startFrames = function () {
    n = 0;
    recording = true;
    gen++;
    origRAF(makeTick(gen));
  };
  // frame timestamps and where the page was scrolled to at each one
  so.stopFrames = function () {
    recording = false;
    gen++;
    return { t: Array.prototype.slice.call(frames, 0, n), y: Array.prototype.slice.call(scrolls, 0, n) };
  };

  // ------------------------------------------------------------- observers of the platform
  so.longtasks = [];
  so.loaf = [];
  so.events = [];
  so.paints = [];
  so.lcp = [];
  so.shifts = [];
  function observe(type, fn, extra) {
    try {
      var o = new PerformanceObserver(function (list) {
        list.getEntries().forEach(fn);
      });
      var opts = { type: type, buffered: true };
      if (extra) for (var k in extra) opts[k] = extra[k];
      o.observe(opts);
    } catch (e) {}
  }
  observe("longtask", function (e) {
    so.longtasks.push({ s: +e.startTime.toFixed(1), d: +e.duration.toFixed(1) });
  });
  observe("long-animation-frame", function (e) {
    so.loaf.push({
      s: +e.startTime.toFixed(1),
      d: +e.duration.toFixed(1),
      block: +(e.blockingDuration || 0).toFixed(1),
      render: +(e.renderStart ? e.renderStart - e.startTime : 0).toFixed(1),
      style: +(e.styleAndLayoutStart ? e.styleAndLayoutStart - e.startTime : 0).toFixed(1),
      scripts: (e.scripts || []).map(function (s) {
        return {
          inv: s.invoker,
          type: s.invokerType,
          src: (s.sourceURL || "").replace(location.origin, ""),
          fn: s.sourceFunctionName,
          ch: s.sourceCharPosition,
          d: +s.duration.toFixed(1),
          forced: +(s.forcedStyleAndLayoutDuration || 0).toFixed(1),
        };
      }),
    });
  });
  observe("event", function (e) {
    so.events.push({ type: e.name, s: +e.startTime.toFixed(1), delay: +(e.processingStart - e.startTime).toFixed(1), d: +e.duration.toFixed(1) });
  }, { durationThreshold: 16 });
  observe("paint", function (e) {
    so.paints.push({ name: e.name, s: +e.startTime.toFixed(1) });
  });
  observe("largest-contentful-paint", function (e) {
    so.lcp.push({ s: +e.startTime.toFixed(1), size: e.size, url: e.url || "", tag: e.element && e.element.tagName });
  });
  observe("layout-shift", function (e) {
    so.shifts.push({ s: +e.startTime.toFixed(1), v: +e.value.toFixed(4) });
  });
  so.clearObserved = function () {
    so.longtasks.length = so.loaf.length = so.events.length = so.shifts.length = 0;
  };

  // When the desk became usable: a project card, the pixel office's canvas and the member buttons are all there.
  so.marks = {};
  function usable() {
    var m = so.marks;
    if (!m.card && document.querySelector("article.co-project[data-project-id]")) m.card = now();
    if (!m.canvas) {
      var cv = document.querySelector("#game-container canvas");
      if (cv && cv.width > 0) m.canvas = now();
    }
    if (!m.members && document.querySelector("button.co-member")) m.members = now();
    if (m.card && m.canvas && m.members && !m.usable) m.usable = Math.max(m.card, m.canvas, m.members);
    return !!m.usable;
  }
  try {
    var usableObs = new MutationObserver(function () {
      if (usable()) usableObs.disconnect();
    });
    usableObs.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["width"] });
  } catch (e) {}

  if (MODE !== "audit") return;

  // ------------------------------------------------------------- audit: who does the work
  var sites = Object.create(null);
  var counts = { timeoutsCreated: 0, intervalsCreated: 0, timersCleared: 0, rafRequested: 0, rafCancelled: 0, listenersAdded: 0, listenersRemoved: 0, observersCreated: 0, observersDisconnected: 0, fetches: 0, xhrs: 0, layoutReads: 0 };
  var timers = new Map();
  var rafs = new Map();
  var observers = [];
  var net = [];
  var origST = window.setTimeout;
  var origSI = window.setInterval;
  var origCT = window.clearTimeout;
  var origCI = window.clearInterval;

  function siteOf() {
    var old = Error.stackTraceLimit;
    Error.stackTraceLimit = 6;
    var s = new Error().stack || "";
    Error.stackTraceLimit = old;
    var lines = s.split("\n");
    for (var i = 1; i < lines.length; i++) {
      if (lines[i].indexOf("__soprobe") >= 0) continue;
      return lines[i].trim().replace(/^at /, "").split(location.origin).join("");
    }
    return "?";
  }
  function rec(kind, site, ms, extra) {
    var key = kind + "|" + site;
    var r = sites[key];
    if (!r) r = sites[key] = { kind: kind, site: site, created: 0, calls: 0, total: 0, max: 0, bytes: 0, b: [0, 0, 0, 0, 0, 0] };
    r.calls++;
    r.total += ms;
    if (ms > r.max) r.max = ms;
    if (extra) r.bytes += extra;
    r.b[ms < 1 ? 0 : ms < 4 ? 1 : ms < 8.3 ? 2 : ms < 16.7 ? 3 : ms < 50 ? 4 : 5]++;
  }
  function created(kind, site) {
    var key = kind + "|" + site;
    var r = sites[key];
    if (!r) r = sites[key] = { kind: kind, site: site, created: 0, calls: 0, total: 0, max: 0, bytes: 0, b: [0, 0, 0, 0, 0, 0] };
    r.created++;
  }

  window.setTimeout = function (fn, delay) {
    if (typeof fn !== "function") return origST.apply(window, arguments);
    var site = siteOf();
    var id;
    var rest = Array.prototype.slice.call(arguments, 2);
    var wrapped = function () {
      var t = now();
      timers.delete(id);
      try {
        return fn.apply(this, arguments);
      } finally {
        rec("timeout", site, now() - t);
      }
    };
    id = origST.apply(window, [wrapped, delay].concat(rest));
    timers.set(id, { kind: "timeout", delay: delay | 0, site: site });
    counts.timeoutsCreated++;
    created("timeout", site);
    return id;
  };
  window.setInterval = function (fn, delay) {
    if (typeof fn !== "function") return origSI.apply(window, arguments);
    var site = siteOf();
    var rest = Array.prototype.slice.call(arguments, 2);
    var wrapped = function () {
      var t = now();
      try {
        return fn.apply(this, arguments);
      } finally {
        rec("interval", site, now() - t);
      }
    };
    var id = origSI.apply(window, [wrapped, delay].concat(rest));
    timers.set(id, { kind: "interval", delay: delay | 0, site: site });
    counts.intervalsCreated++;
    created("interval", site);
    return id;
  };
  window.clearTimeout = function (id) {
    if (timers.delete(id)) counts.timersCleared++;
    return origCT.call(window, id);
  };
  window.clearInterval = function (id) {
    if (timers.delete(id)) counts.timersCleared++;
    return origCI.call(window, id);
  };
  window.requestAnimationFrame = function (cb) {
    var site = siteOf();
    counts.rafRequested++;
    var id = origRAF(function (ts) {
      rafs.delete(id);
      var t = now();
      try {
        return cb(ts);
      } finally {
        rec("raf", site, now() - t);
      }
    });
    rafs.set(id, site);
    return id;
  };
  var origCAF = window.cancelAnimationFrame.bind(window);
  window.cancelAnimationFrame = function (id) {
    if (rafs.delete(id)) counts.rafCancelled++;
    return origCAF(id);
  };

  // listeners: one wrapper per listener, so add/remove keep their native pairing
  var EP = EventTarget.prototype;
  var origAdd = EP.addEventListener;
  var origRem = EP.removeEventListener;
  var wrappers = new WeakMap();
  var passiveStats = Object.create(null);
  EP.addEventListener = function (type, listener, options) {
    if (!listener || (typeof listener !== "function" && typeof listener.handleEvent !== "function")) return origAdd.apply(this, arguments);
    var w = wrappers.get(listener);
    if (!w) {
      var site = siteOf();
      var lt = this === window ? "window" : this === document ? "document" : (this.nodeName || (this.constructor && this.constructor.name) || "?").toString().toLowerCase();
      w = function (ev) {
        var t = now();
        try {
          return typeof listener === "function" ? listener.call(this, ev) : listener.handleEvent(ev);
        } finally {
          rec("event:" + ev.type, site, now() - t);
        }
      };
      wrappers.set(listener, w);
      counts.listenersAdded++;
      created("listener:" + type, site);
      var passive = options && typeof options === "object" ? options.passive : undefined;
      var pk = type + "|" + lt + "|" + (passive === undefined ? "default" : passive ? "passive" : "active");
      passiveStats[pk] = (passiveStats[pk] || 0) + 1;
    } else counts.listenersAdded++;
    return origAdd.call(this, type, w, options);
  };
  EP.removeEventListener = function (type, listener, options) {
    var w = listener && wrappers.get(listener);
    if (w) counts.listenersRemoved++;
    return origRem.call(this, type, w || listener, options);
  };

  // observers
  ["MutationObserver", "ResizeObserver", "IntersectionObserver"].forEach(function (name) {
    var Orig = window[name];
    if (!Orig) return;
    var Wrapped = function (cb, opts) {
      var site = siteOf();
      counts.observersCreated++;
      created(name, site);
      var inst = new Orig(function (entries, obs) {
        var t = now();
        try {
          return cb.call(this, entries, obs);
        } finally {
          rec(name, site, now() - t, entries.length);
        }
      }, opts);
      var info = { name: name, site: site, observed: 0, live: true };
      observers.push(info);
      var od = inst.disconnect;
      inst.disconnect = function () {
        if (info.live) counts.observersDisconnected++;
        info.live = false;
        return od.apply(this, arguments);
      };
      var oo = inst.observe;
      inst.observe = function () {
        info.observed++;
        info.live = true;
        return oo.apply(this, arguments);
      };
      return inst;
    };
    Wrapped.prototype = Orig.prototype;
    window[name] = Wrapped;
  });

  // network from the page's point of view: who asks, how often
  var origFetch = window.fetch;
  window.fetch = function (input, init) {
    var site = siteOf();
    var url = typeof input === "string" ? input : (input && input.url) || "";
    var path = url.split(location.origin).join("").split("?")[0];
    var t0 = now();
    counts.fetches++;
    created("fetch " + path, site);
    var p = origFetch.apply(this, arguments);
    p.then(function (r) {
      if (net.length < 3000) net.push({ url: path, site: site, start: +t0.toFixed(1), ms: +(now() - t0).toFixed(1), status: r.status });
    }, function () {});
    return p;
  };
  var XO = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    counts.xhrs++;
    created("xhr " + String(url).split("?")[0], siteOf());
    return XO.apply(this, arguments);
  };

  // heavy synchronous work the page asks for
  var origParse = JSON.parse;
  JSON.parse = function (text) {
    var t = now();
    try {
      return origParse.apply(this, arguments);
    } finally {
      var d = now() - t;
      if (d > 0.5 || (typeof text === "string" && text.length > 50000)) rec("JSON.parse", siteOf(), d, typeof text === "string" ? text.length : 0);
    }
  };
  var ihd = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
  if (ihd && ihd.set) {
    Object.defineProperty(Element.prototype, "innerHTML", {
      configurable: true,
      enumerable: ihd.enumerable,
      get: ihd.get,
      set: function (v) {
        var t = now();
        try {
          return ihd.set.call(this, v);
        } finally {
          var d = now() - t;
          var len = typeof v === "string" ? v.length : 0;
          if (d > 0.3 || len > 2000) rec("innerHTML", siteOf(), d, len);
        }
      },
    });
  }
  // layout reads: a read that takes real time after a write is a forced synchronous layout
  function wrapLayoutRead(proto, name) {
    var d = Object.getOwnPropertyDescriptor(proto, name);
    if (!d) return;
    if (d.get) {
      Object.defineProperty(proto, name, {
        configurable: true,
        enumerable: d.enumerable,
        set: d.set,
        get: function () {
          var t = now();
          var v = d.get.call(this);
          var ms = now() - t;
          counts.layoutReads++;
          if (ms > 0.3) rec("forcedLayout:" + name, siteOf(), ms);
          return v;
        },
      });
    } else if (typeof d.value === "function") {
      var f = d.value;
      Object.defineProperty(proto, name, {
        configurable: true,
        writable: true,
        enumerable: d.enumerable,
        value: function () {
          var t = now();
          var v = f.apply(this, arguments);
          var ms = now() - t;
          counts.layoutReads++;
          if (ms > 0.3) rec("forcedLayout:" + name, siteOf(), ms);
          return v;
        },
      });
    }
  }
  ["offsetWidth", "offsetHeight", "offsetTop", "offsetLeft", "clientWidth", "clientHeight", "scrollHeight", "scrollWidth", "getBoundingClientRect", "getClientRects"].forEach(function (k) {
    wrapLayoutRead(Element.prototype, k);
  });
  wrapLayoutRead(HTMLElement.prototype, "offsetWidth");
  wrapLayoutRead(HTMLElement.prototype, "offsetHeight");
  wrapLayoutRead(HTMLElement.prototype, "offsetTop");
  wrapLayoutRead(HTMLElement.prototype, "offsetLeft");
  var gcs = window.getComputedStyle;
  window.getComputedStyle = function () {
    var t = now();
    var v = gcs.apply(this, arguments);
    counts.layoutReads++;
    var ms = now() - t;
    if (ms > 0.3) rec("forcedLayout:getComputedStyle", siteOf(), ms);
    return v;
  };

  so.reset = function () {
    for (var k in sites) delete sites[k];
    for (var c in counts) counts[c] = 0;
    for (var p in passiveStats) delete passiveStats[p];
    net.length = 0;
    so.clearObserved();
  };
  function groupActive(map) {
    var out = Object.create(null);
    map.forEach(function (v, id) {
      var site = typeof v === "string" ? v : v.site;
      var key = (typeof v === "string" ? "raf" : v.kind + "@" + v.delay + "ms") + " " + site;
      out[key] = (out[key] || 0) + 1;
    });
    return out;
  }
  so.snapshot = function (top) {
    top = top || 60;
    var list = Object.keys(sites).map(function (k) {
      var r = sites[k];
      return { kind: r.kind, site: r.site, created: r.created, calls: r.calls, total_ms: +r.total.toFixed(2), max_ms: +r.max.toFixed(2), avg_ms: r.calls ? +(r.total / r.calls).toFixed(3) : 0, bytes: r.bytes, hist: r.b };
    });
    list.sort(function (a, b) {
      return b.total_ms - a.total_ms;
    });
    var liveObservers = observers.filter(function (o) {
      return o.live;
    });
    var byObs = Object.create(null);
    liveObservers.forEach(function (o) {
      var k = o.name + " " + o.site;
      byObs[k] = (byObs[k] || 0) + 1;
    });
    // request cadence per url: many calls of the same url is polling
    var byUrl = Object.create(null);
    net.forEach(function (r) {
      var e = byUrl[r.url] || (byUrl[r.url] = { url: r.url, n: 0, total_ms: 0, max_ms: 0, sites: {} });
      e.n++;
      e.total_ms += r.ms;
      if (r.ms > e.max_ms) e.max_ms = r.ms;
      e.sites[r.site] = 1;
    });
    return {
      counts: JSON.parse(JSON.stringify(counts)),
      activeTimers: groupActive(timers),
      activeRafs: groupActive(rafs),
      liveObservers: byObs,
      passive: JSON.parse(JSON.stringify(passiveStats)),
      sites: list.slice(0, top),
      fetchByUrl: Object.keys(byUrl).map(function (k) {
        var e = byUrl[k];
        return { url: e.url, n: e.n, total_ms: +e.total_ms.toFixed(0), max_ms: +e.max_ms.toFixed(0), sites: Object.keys(e.sites) };
      }),
    };
  };
})();
//# sourceURL=__soprobe.js
