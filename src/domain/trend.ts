import type { WeightPoint } from "./types";

/** A weight point with an exponentially-smoothed trend value attached. */
export interface TrendPoint extends WeightPoint {
  /** Exponentially-weighted moving average of weight up to this date. */
  trendKg: number;
}

/** Milliseconds in one day. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toTime(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getTime();
}

function daysBetween(a: string, b: string): number {
  return (toTime(b) - toTime(a)) / MS_PER_DAY;
}

/**
 * Smooth daily weight into a trend line using an exponentially-weighted
 * moving average (EWMA). Daily weight is noisy (water, sodium, glycogen);
 * the trend is what the coach should react to.
 *
 * @param points Weight points; will be sorted ascending by date.
 * @param alpha Smoothing factor in (0, 1]. Lower = smoother/slower. 0.1 ≈ a
 *   ~10-day responsiveness, a good default for bodyweight.
 */
export function smoothWeightTrend(
  points: ReadonlyArray<WeightPoint>,
  alpha = 0.1,
): TrendPoint[] {
  if (alpha <= 0 || alpha > 1) {
    throw new Error("alpha must be in (0, 1]");
  }
  const sorted = [...points].sort((a, b) => toTime(a.date) - toTime(b.date));
  const out: TrendPoint[] = [];
  let trend: number | null = null;
  for (const p of sorted) {
    trend =
      trend === null ? p.weightKg : alpha * p.weightKg + (1 - alpha) * trend;
    out.push({ ...p, trendKg: trend });
  }
  return out;
}

/**
 * Fit the slope of the weight trend over the most recent `windowDays` using
 * ordinary least squares. Returns kg per day (negative = losing weight).
 *
 * @returns null when there is insufficient data to fit a line.
 */
export function weightSlopeKgPerDay(
  trend: ReadonlyArray<TrendPoint>,
  windowDays = 14,
): number | null {
  if (trend.length < 2) return null;

  const last = trend[trend.length - 1];
  const cutoff = toTime(last.date) - windowDays * MS_PER_DAY;
  const window = trend.filter((p) => toTime(p.date) >= cutoff);
  if (window.length < 2) return null;

  // Regress trendKg on days-since-first-point.
  const x0 = window[0].date;
  const xs = window.map((p) => daysBetween(x0, p.date));
  const ys = window.map((p) => p.trendKg);
  const n = xs.length;
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((acc, x, i) => acc + x * ys[i], 0);
  const sumXX = xs.reduce((acc, x) => acc + x * x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;
  return (n * sumXY - sumX * sumY) / denom;
}

/**
 * Detect a stall: the trend weight has changed less than `thresholdKgPerWeek`
 * (in magnitude) over the given window, i.e. progress has plateaued.
 *
 * @returns true when stalled, false when moving, null when not enough data.
 */
export function isStalled(
  trend: ReadonlyArray<TrendPoint>,
  windowDays = 14,
  thresholdKgPerWeek = 0.1,
): boolean | null {
  const slope = weightSlopeKgPerDay(trend, windowDays);
  if (slope === null) return null;
  return Math.abs(slope * 7) < thresholdKgPerWeek;
}
