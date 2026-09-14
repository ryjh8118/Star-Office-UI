const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const T = require("../frontend/creator-timeline.js");

const repo = path.join(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(repo, "frontend", name), "utf8");
const data = JSON.parse(read("creator-milestones.json"));
const today = new Date("2026-09-14T12:00:00+08:00");

test("every milestone in the registry is one the page will stand behind", () => {
  assert.equal(data.schema, "renguin://star-office/system-timeline/1.0.0");
  const ids = new Set();
  for (const m of data.milestones) {
    assert.ok(T.validMilestone(m, today), "rejected: " + m.id);
    assert.ok(!ids.has(m.id), "duplicate id " + m.id);
    ids.add(m.id);
    for (const field of ["date", "category", "title", "summary", "importance", "source", "source_ref", "commit_sha", "confidence"])
      assert.ok(Object.hasOwn(m, field), m.id + " keeps its " + field);
    assert.ok(Object.hasOwn(T.CONFIDENCE, m.confidence));
    assert.ok(Object.hasOwn(T.SOURCES, m.source), m.id + " names a known kind of evidence");
    assert.ok(m.what && m.why, m.id + " explains what happened and why it matters");
  }
  assert.equal(T.normalize(data, today).length, data.milestones.length, "nothing in the registry is silently dropped");
});

test("both routes carry at least five milestones", () => {
  const list = T.normalize(data, today);
  assert.ok(T.track(list, "star_office").length >= 5);
  assert.ok(T.track(list, "content_system").length >= 5);
  assert.deepEqual(Object.keys(T.TRACKS), ["star_office", "content_system"]);
  assert.equal(T.TRACKS.star_office.label, "星辦里程碑");
  assert.equal(T.TRACKS.content_system.label, "內容里程碑");
});

test("the main route speaks plainly; engineering names stay in the evidence", () => {
  const engineering = /\b(fix|feat|chore|refactor|docs)\(|\b[A-Z]+(?:_[A-Z0-9]+){1,}\b|\b[0-9a-f]{7,40}\b|[A-Za-z]:[\\/]|\.(py|js|json|md)\b/;
  for (const m of data.milestones) {
    assert.doesNotMatch(m.title, engineering, m.id + " title");
    assert.doesNotMatch(m.summary, engineering, m.id + " summary");
    assert.ok(m.title.length <= 24, m.id + " title stays short");
  }
});

test("routes run oldest first and group by month, and undated history waits at the end", () => {
  const list = T.normalize(
    {
      milestones: [
        { id: "b", category: "star_office", date: "2026-09-02", title: "B", summary: "b", confidence: "VERIFIED", commit_sha: "abcdef1" },
        { id: "p", category: "star_office", date: null, title: "P", summary: "p", confidence: "PARTIAL" },
        { id: "a", category: "star_office", date: "2026-08-30", title: "A", summary: "a", confidence: "HIGH", source_ref: "report" },
        { id: "c", category: "star_office", date: "2026-09-02", title: "C", summary: "c", confidence: "HIGH", source_ref: "later in file" },
      ],
    },
    today,
  );
  assert.deepEqual(list.map((m) => m.id), ["a", "b", "c", "p"]);
  assert.deepEqual(T.stations(list).map((s) => s.label), ["2026 / 08", "2026 / 09", "日期待確認"]);
  assert.equal(T.dayLabel(list[3]), "日期待確認");
  const real = T.normalize(data, today).map((m) => m.date);
  assert.deepEqual(real, [...real].sort(), "the shipped registry is chronological once ordered");
});

test("no date is invented: future, impossible or unsourced claims are refused", () => {
  const base = { id: "x", category: "content_system", title: "X", summary: "x", source_ref: "somewhere" };
  assert.equal(T.validMilestone({ ...base, date: "2026-09-15", confidence: "HIGH" }, today), null, "a future day");
  assert.equal(T.validMilestone({ ...base, date: "2026-02-30", confidence: "HIGH" }, today), null, "a day that does not exist");
  assert.equal(T.validMilestone({ ...base, date: "2026/09/01", confidence: "HIGH" }, today), null, "a date that is not ISO");
  assert.equal(T.validMilestone({ ...base, date: null, confidence: "VERIFIED" }, today), null, "verified without a date");
  assert.equal(T.validMilestone({ ...base, date: null, confidence: "HIGH" }, today), null, "an undated claim must say PARTIAL");
  assert.equal(T.validMilestone({ ...base, source_ref: "", date: "2026-09-01", confidence: "VERIFIED" }, today), null, "verified without a source");
  assert.equal(T.validMilestone({ ...base, date: "2026-09-01", confidence: "SURE" }, today), null, "an unknown confidence");
  assert.ok(T.validMilestone({ ...base, date: null, confidence: "PARTIAL" }, today), "日期待確認 is allowed");
});

test("every STAR OFFICE commit the timeline cites exists in this repository, dated as claimed", () => {
  for (const m of data.milestones.filter((m) => m.category === "star_office" && m.source === "git")) {
    const iso = execFileSync("git", ["log", "-1", "--format=%cI", m.commit_sha], { cwd: repo, encoding: "utf8" }).trim();
    const taipei = new Date(new Date(iso).getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    const authored = execFileSync("git", ["log", "-1", "--format=%aI", m.commit_sha], { cwd: repo, encoding: "utf8" }).trim();
    const authoredTaipei = new Date(new Date(authored).getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    assert.ok([taipei, authoredTaipei].includes(m.date), `${m.id}: ${m.commit_sha} is ${authoredTaipei}, timeline says ${m.date}`);
  }
});

test("Content OS commits cited by the timeline exist and match their dates when the checkout is here", (t) => {
  const contentOS = process.env.RENGUIN_CANONICAL_ROOT || "E:/Renguin_AISystem/Content_OS";
  if (!fs.existsSync(path.join(contentOS, ".git"))) return t.skip("Content OS checkout not present");
  for (const m of data.milestones.filter((m) => m.category === "content_system" && m.source === "git")) {
    const authored = execFileSync("git", ["log", "-1", "--format=%aI", m.commit_sha], { cwd: contentOS, encoding: "utf8" }).trim();
    const taipei = new Date(new Date(authored).getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    assert.equal(taipei, m.date, `${m.id}: ${m.commit_sha}`);
  }
});

test("the timeline is data, not markup, and 工作紀錄 stays reachable beside it", () => {
  const office = read("creator-office.js");
  assert.match(office, /"系統年表"/);
  assert.match(office, /layers\.at\("creator-milestones\.json"\)/, "the page reads the registry file");
  assert.match(office, /node\("span", "☾ 工作紀錄"\)/, "the work records drawer keeps its name");
  assert.match(office, /historyRoot = node\("div", undefined, "co-history"\)/);
  const html = read("index.html");
  assert.doesNotMatch(html, /星辦里程碑|內容里程碑|creator-milestones/, "no history is hard-coded in the page shell");
  const timeline = read("creator-timeline.js");
  assert.doesNotMatch(timeline, /2026-0\d-\d\d/, "the renderer carries no dates of its own");
  assert.match(timeline, /現在 is computed, never stored/);
});
