import { KCAL_PER_G, KCAL_PER_KG, PROTEIN_G_PER_KG } from "./constants";
import type { CoachTargetValues, Goal } from "./types";

/** Default weekly rate of weight change (kg/week) by goal. */
const DEFAULT_RATE_KG_PER_WEEK: Record<Goal, number> = {
  cut: -0.5,
  recomp: 0,
  maintain: 0,
  bulk: 0.25,
};

/** Fat floor as a fraction of calories, to protect hormones. */
const MIN_FAT_FRACTION = 0.2;

export interface TargetInput {
  /** Current adaptive expenditure estimate (kcal/day). */
  expenditure: number;
  /** Current bodyweight (kg) — used to anchor protein. */
  weightKg: number;
  goal: Goal;
  /**
   * Optional override for weekly rate of change (kg/week). Negative = loss.
   * When omitted, a sensible default per goal is used.
   */
  rateKgPerWeek?: number;
}

/**
 * Produce a calorie + macro target from the current expenditure estimate and
 * goal.
 *
 * Calories: expenditure adjusted by the desired weekly rate of weight change.
 * Protein:  anchored to bodyweight (higher on a cut to preserve lean mass).
 * Fat:      a minimum fraction of calories, then the remainder goes to carbs.
 */
export function computeTarget(input: TargetInput): CoachTargetValues {
  const { expenditure, weightKg, goal } = input;
  const rate = input.rateKgPerWeek ?? DEFAULT_RATE_KG_PER_WEEK[goal];

  // Weekly rate → daily kcal adjustment.
  const dailyAdjustment = (rate * KCAL_PER_KG) / 7;
  const calories = Math.round(expenditure + dailyAdjustment);

  // Protein anchored to bodyweight.
  const protein = Math.round(weightKg * PROTEIN_G_PER_KG[goal]);
  const proteinKcal = protein * KCAL_PER_G.protein;

  // Fat: at least MIN_FAT_FRACTION of calories.
  const fatKcal = Math.max(
    calories * MIN_FAT_FRACTION,
    // never below what's left after protein if calories are very low
    0,
  );
  const fat = Math.round(fatKcal / KCAL_PER_G.fat);

  // Carbs: whatever calories remain.
  const remainingKcal = Math.max(
    0,
    calories - proteinKcal - fat * KCAL_PER_G.fat,
  );
  const carbs = Math.round(remainingKcal / KCAL_PER_G.carbs);

  return { calories, protein, carbs, fat };
}

/**
 * Human-readable rationale for a target change, stored alongside the
 * CoachTarget so the user always sees *why* it moved.
 */
export function targetRationale(params: {
  goal: Goal;
  expenditure: number;
  adaptive: boolean;
  slopeKgPerWeek: number | null;
  stalled: boolean | null;
}): string {
  const { goal, expenditure, adaptive, slopeKgPerWeek, stalled } = params;
  const parts: string[] = [];

  parts.push(
    adaptive
      ? `Expenditure estimated at ~${expenditure} kcal/day from your weight trend vs. intake.`
      : `Using a starting estimate of ~${expenditure} kcal/day until more data is collected.`,
  );

  if (slopeKgPerWeek !== null) {
    const dir =
      slopeKgPerWeek < -0.05
        ? `losing ~${Math.abs(slopeKgPerWeek).toFixed(2)} kg/week`
        : slopeKgPerWeek > 0.05
          ? `gaining ~${slopeKgPerWeek.toFixed(2)} kg/week`
          : "holding steady";
    parts.push(`You're currently ${dir}.`);
  }

  if (stalled) {
    parts.push("Progress has plateaued, so the target was adjusted.");
  }

  parts.push(`Goal: ${goal}.`);
  return parts.join(" ");
}
