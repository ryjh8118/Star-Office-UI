"use strict";
// A real Chrome and a small Chrome DevTools Protocol client, with no dependencies.
//
// The Office is judged on the machine it runs on, at the size it is shown: a 5120x1440
// panel at 120 Hz with Windows at 150%, i.e. a ~3413 CSS px wide viewport at DPR 1.5.
// Everything here therefore takes the window size and scale factor as parameters and
// defaults to that display rather than to a small emulated one.
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const freePort = () =>
  new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

class Client {
  constructor(url) {
    this.url = url;
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    this.closed = false;
  }
  async connect() {
    this.ws = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = () => reject(new Error("CDP_CONNECT_FAILED " + this.url));
    });
    this.ws.onclose = () => {
      this.closed = true;
      for (const [, p] of this.pending) p.reject(new Error("CDP_CLOSED"));
      this.pending.clear();
    };
    this.ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`));
        else p.resolve(msg.result || {});
      } else if (msg.method) {
        const list = this.handlers.get(msg.method);
        if (list) for (const fn of [...list]) fn(msg.params || {}, msg);
      }
    };
    return this;
  }
  send(method, params = {}, timeoutMs = 90000) {
    return new Promise((resolve, reject) => {
      if (this.closed) return reject(new Error("CDP_CLOSED"));
      const id = ++this.id;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP_TIMEOUT ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        method,
        resolve: (v) => (clearTimeout(timer), resolve(v)),
        reject: (e) => (clearTimeout(timer), reject(e)),
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, new Set());
    this.handlers.get(method).add(fn);
    return () => this.handlers.get(method).delete(fn);
  }
  once(method, predicate = () => true, timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => (off(), reject(new Error(`CDP_EVENT_TIMEOUT ${method}`))), timeoutMs);
      const off = this.on(method, (params) => {
        if (!predicate(params)) return;
        clearTimeout(timer);
        off();
        resolve(params);
      });
    });
  }
  close() {
    try {
      this.ws.close();
    } catch {}
  }
}

async function launchChrome({ headless = true, width = 3413, height = 960, dpr = 1.5, args = [], scrollbars = true } = {}) {
  const port = await freePort();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "so-perf-"));
  const flags = [
    headless ? "--headless=new" : null,
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    `--window-size=${width},${height}`,
    `--force-device-scale-factor=${dpr}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-component-update",
    "--disable-sync",
    "--no-proxy-server",
    "--disable-background-networking",
    // A measurement window is never allowed to be judged "hidden" and slowed down.
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    "--disable-features=CalculateNativeWinOcclusion",
    "--autoplay-policy=no-user-gesture-required",
    scrollbars ? null : "--hide-scrollbars",
    ...args,
    "about:blank",
  ].filter(Boolean);
  const proc = spawn(CHROME, flags, { stdio: "ignore", windowsHide: true });
  let version = null;
  for (let i = 0; i < 120 && !version; i++) {
    await sleep(150);
    version = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json()).catch(() => null);
  }
  if (!version) {
    proc.kill();
    throw new Error("CHROME_DID_NOT_START");
  }
  const browser = await new Client(version.webSocketDebuggerUrl).connect();
  const pages = [];
  const chrome = {
    port,
    proc,
    userDataDir,
    version: version.Browser,
    browser,
    async newPage() {
      const t = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" }).then((r) => r.json());
      const client = await new Client(t.webSocketDebuggerUrl).connect();
      const page = { client, targetId: t.id, chrome };
      pages.push(page);
      return page;
    },
    async closePage(page) {
      try {
        await fetch(`http://127.0.0.1:${port}/json/close/${page.targetId}`);
      } catch {}
      page.client.close();
    },
    /** Cumulative CPU seconds per Chrome process type (browser, renderer, GPU, ...). */
    async cpu() {
      const { processInfo } = await browser.send("SystemInfo.getProcessInfo");
      const out = {};
      for (const p of processInfo) out[p.type] = (out[p.type] || 0) + p.cpuTime;
      out.total = Object.values(out).reduce((a, b) => a + b, 0);
      return out;
    },
    async close() {
      browser.close();
      try {
        spawnSync("taskkill", ["/PID", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
      } catch {}
      for (let i = 0; i < 20; i++) {
        try {
          fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3 });
          break;
        } catch {
          await sleep(250);
        }
      }
    },
  };
  return chrome;
}

/** Collect a Chrome trace of the page for `during()` and return its parsed events. */
async function traceCapture(client, categories, during) {
  await client.send("Tracing.start", {
    categories,
    transferMode: "ReturnAsStream",
    streamFormat: "json",
    bufferUsage: 1,
  });
  let result;
  try {
    result = await during();
  } finally {
    const done = client.once("Tracing.tracingComplete", () => true, 120000);
    await client.send("Tracing.end");
    var { stream } = await done;
  }
  let text = "";
  for (;;) {
    const r = await client.send("IO.read", { handle: stream, size: 1 << 20 }, 120000);
    text += r.base64Encoded ? Buffer.from(r.data, "base64").toString("utf8") : r.data;
    if (r.eof) break;
  }
  await client.send("IO.close", { handle: stream });
  const parsed = JSON.parse(text);
  return { result, events: Array.isArray(parsed) ? parsed : parsed.traceEvents };
}

module.exports = { CHROME, sleep, freePort, Client, launchChrome, traceCapture };
