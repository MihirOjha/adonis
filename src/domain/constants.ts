/**
 * Physiological + energy constants used across the domain logic.
 */

/**
 * Energy density of body-mass change, in kcal per kg.
 * ~7700 kcal per kg is the standard mixed-tissue approximation used for
 * translating weight change into an energy surplus/deficit.
 */
export const KCAL_PER_KG = 7700;

/** kcal per gram of each macronutrient (Atwater factors). */
export const KCAL_PER_G = {
  protein: 4,
  carbs: 4,
  fat: 9,
  alcohol: 7,
} as const;

/** Activity multipliers applied to BMR to estimate a cold-start TDEE. */
export const ACTIVITY_FACTORS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
} as const;

/**
 * Default protein targets in grams per kg of bodyweight, by goal.
 * Higher during a cut to preserve lean mass.
 */
export const PROTEIN_G_PER_KG = {
  cut: 2.2,
  recomp: 2.0,
  maintain: 1.8,
  bulk: 1.8,
} as const;
