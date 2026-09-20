import { ACTIVITY_FACTORS, KCAL_PER_KG } from "./constants";
import type { ActivityLevel, IntakePoint, Sex, WeightPoint } from "./types";
import { smoothWeightTrend, weightSlopeKgPerDay } from "./trend";

/** Plausible bounds for a daily expenditure estimate, in kcal. */
const MIN_EXPENDITURE = 1000;
const MAX_EXPENDITURE = 6000;

/**
 * Cold-start Total Daily Energy Expenditure (TDEE) using the Mifflin–St Jeor
 * equation. Used only until enough real intake + weight data exists for the
 * adaptive estimator to take over.
 */
export function coldStartTdee(params: {
  weightKg: number;
  heightCm: number;
  ageYears: number;
  sex: Sex;
  activity: ActivityLevel;
}): number {
  const { weightKg, heightCm, ageYears, sex, activity } = params;
  const s = sex === "male" ? 5 : -161;
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * ageYears + s;
  return Math.round(bmr * ACTIVITY_FACTORS[activity]);
}

export interface ExpenditureEstimate {
  /** Estimated maintenance calories (TDEE), in kcal/day. */
  expenditure: number;
  /** Confidence proxy: number of days of data used in the window. */
  daysOfData: number;
  /** The measured weight-trend slope, kg/day (negative = losing). */
  slopeKgPerDay: number | null;
  /** True when the adaptive estimate was used; false for cold-start fallback. */
  adaptive: boolean;
}

/**
 * Adaptively estimate expenditure from the relationship between energy intake
 * and weight change — the core of the coach.
 *
 * Energy balance says:
 *   intake − expenditure = energy stored/released as body mass
 *   ⇒ expenditure = avgIntake − (Δweight_kg/day × KCAL_PER_KG)
 *
 * The observed expenditure from the window is blended with a prior estimate
 * to trade responsiveness for stability (avoids large week-to-week swings).
 *
 * @param opts.weights     Recent weight measurements.
 * @param opts.intakes     Recent per-day calorie totals.
 * @param opts.coldStart   Fallback TDEE when there isn't enough data.
 * @param opts.prior       Previous expenditure estimate to blend against.
 * @param opts.windowDays  Look-back window (default 14).
 * @param opts.alpha       Blend weight for the new observation (default 0.25).
 * @param opts.minDays     Minimum days of data before going adaptive (default 10).
 */
export function estimateExpenditure(opts: {
  weights: ReadonlyArray<WeightPoint>;
  intakes: ReadonlyArray<IntakePoint>;
  coldStart: number;
  prior?: number;
  windowDays?: number;
  alpha?: number;
  minDays?: number;
}): ExpenditureEstimate {
  const {
    weights,
    intakes,
    coldStart,
    prior,
    windowDays = 14,
    alpha = 0.25,
    minDays = 10,
  } = opts;

  const trend = smoothWeightTrend(weights);
  const slope = weightSlopeKgPerDay(trend, windowDays);

  // Average intake over the same window.
  const cutoff = windowIntakeCutoff(intakes, windowDays);
  const windowIntakes = intakes.filter((i) => i.date >= cutoff);
  const daysOfData = Math.min(windowIntakes.length, trend.length);

  const hasEnough =
    slope !== null && windowIntakes.length >= minDays && daysOfData >= minDays;

  if (!hasEnough || slope === null) {
    return {
      expenditure: clamp(prior ?? coldStart),
      daysOfData,
      slopeKgPerDay: slope,
      adaptive: false,
    };
  }

  const avgIntake =
    windowIntakes.reduce((a, i) => a + i.calories, 0) / windowIntakes.length;

  const observed = avgIntake - slope * KCAL_PER_KG;
  const base = prior ?? coldStart;
  const blended = alpha * observed + (1 - alpha) * base;

  return {
    expenditure: clamp(Math.round(blended)),
    daysOfData,
    slopeKgPerDay: slope,
    adaptive: true,
  };
}

function windowIntakeCutoff(
  intakes: ReadonlyArray<IntakePoint>,
  windowDays: number,
): string {
  if (intakes.length === 0) return "0000-00-00";
  const latest = intakes
    .map((i) => i.date)
    .sort()
    .at(-1) as string;
  const t = new Date(`${latest}T00:00:00Z`).getTime();
  const cutoff = new Date(t - windowDays * 24 * 60 * 60 * 1000);
  return cutoff.toISOString().slice(0, 10);
}

function clamp(v: number): number {
  return Math.max(MIN_EXPENDITURE, Math.min(MAX_EXPENDITURE, v));
}
