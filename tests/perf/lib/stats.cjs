"use strict";
// Frame pacing is the measure here, not average frames per second: a page that averages
// 118 fps and drops one frame in ten looks perfect in a mean and feels broken in the hand.

const round = (v, d = 2) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null);

function percentile(sorted, p) {
  if (!sorted.length) return NaN;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

function median(values) {
  return percentile([...values].sort((a, b) => a - b), 0.5);
}

/** The display's own cadence: the fullest 0.25 ms bin of frame intervals, refined by its neighbours. */
function modalInterval(deltas) {
  const bins = new Map();
  for (const d of deltas) {
    if (d < 2 || d > 100) continue;
    const b = Math.round(d * 4);
    bins.set(b, (bins.get(b) || 0) + 1);
  }
  let best = null;
  for (const [b, n] of bins) if (!best || n > best.n) best = { b, n };
  if (!best) return NaN;
  const centre = best.b / 4;
  const near = deltas.filter((d) => Math.abs(d - centre) <= 1);
  return near.reduce((a, b) => a + b, 0) / near.length;
}

/**
 * @param {number[]} ts rAF timestamps (ms), one per produced frame.
 * @param {{refreshHz?: number}} opts Pass the refresh rate to pin the budget; otherwise it is inferred.
 */
function frameStats(ts, opts = {}) {
  if (!ts || ts.length < 3) return { frames: ts ? ts.length : 0, error: "TOO_FEW_FRAMES" };
  const deltas = [];
  for (let i = 1; i < ts.length; i++) deltas.push(ts[i] - ts[i - 1]);
  const sorted = [...deltas].sort((a, b) => a - b);
  const span = ts[ts.length - 1] - ts[0];
  const interval = opts.refreshHz ? 1000 / opts.refreshHz : modalInterval(deltas);
  const mean = span / deltas.length;
  // A frame the display could have shown but the page did not produce.
  let missed = 0;
  let hitches = 0;
  let hitchMs = 0;
  for (const d of deltas) {
    const n = Math.round(d / interval) - 1;
    if (n > 0) missed += n;
    if (d > interval * 1.5) {
      hitches++;
      hitchMs += d - interval;
    }
  }
  const over = (ms) => deltas.filter((d) => d > ms).length;
  return {
    frames: ts.length,
    seconds: round(span / 1000, 2),
    interval_ms: round(interval, 3),
    refresh_hz: round(1000 / interval, 1),
    fps: round(1000 / mean, 1),
    mean_ms: round(mean, 3),
    median_ms: round(percentile(sorted, 0.5), 3),
    p95_ms: round(percentile(sorted, 0.95), 3),
    p99_ms: round(percentile(sorted, 0.99), 3),
    p999_ms: round(percentile(sorted, 0.999), 3),
    worst_ms: round(sorted[sorted.length - 1], 2),
    gt_8_33: over(8.33 + 0.4),
    gt_16_67: over(16.67 + 0.4),
    gt_33_3: over(33.3),
    gt_50: over(50),
    hitches,
    hitches_per_min: round(hitches / (span / 60000), 1),
    hitch_ms_per_s: round(hitchMs / (span / 1000), 2),
    missed_frames: missed,
    missed_ratio: round(missed / (deltas.length + missed), 4),
  };
}

/** Percentiles of an arbitrary list of durations (ms). */
function distribution(values) {
  if (!values.length) return { n: 0 };
  const s = [...values].sort((a, b) => a - b);
  return {
    n: s.length,
    sum_ms: round(s.reduce((a, b) => a + b, 0), 1),
    median_ms: round(percentile(s, 0.5), 2),
    p95_ms: round(percentile(s, 0.95), 2),
    p99_ms: round(percentile(s, 0.99), 2),
    max_ms: round(s[s.length - 1], 2),
  };
}

module.exports = { round, percentile, median, modalInterval, frameStats, distribution };
