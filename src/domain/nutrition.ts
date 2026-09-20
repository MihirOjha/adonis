import { KCAL_PER_G } from "./constants";
import type { Macros, NutritionPer100g } from "./types";

/**
 * Scale a per-100 g nutrition profile to an arbitrary gram amount.
 *
 * @param per100g Nutrition facts per 100 g.
 * @param grams The actual amount eaten, in grams.
 * @returns Calories + macros for the given amount.
 */
export function scaleNutrition(
  per100g: NutritionPer100g,
  grams: number,
): { calories: number } & Macros {
  const factor = grams / 100;
  return {
    calories: per100g.calories * factor,
    protein: per100g.protein * factor,
    carbs: per100g.carbs * factor,
    fat: per100g.fat * factor,
  };
}

/**
 * Estimate calories from macronutrients using Atwater factors.
 * Useful for sanity-checking crowd-sourced food data.
 */
export function caloriesFromMacros(macros: Macros): number {
  return (
    macros.protein * KCAL_PER_G.protein +
    macros.carbs * KCAL_PER_G.carbs +
    macros.fat * KCAL_PER_G.fat
  );
}

/**
 * Sum a list of {calories + macros} entries into a single total.
 */
export function sumEntries(
  entries: ReadonlyArray<{ calories: number } & Macros>,
): { calories: number } & Macros {
  return entries.reduce(
    (acc, e) => ({
      calories: acc.calories + e.calories,
      protein: acc.protein + e.protein,
      carbs: acc.carbs + e.carbs,
      fat: acc.fat + e.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

/**
 * Convert a per-100 g profile derived from a total amount.
 * Given totals for a known gram weight, produce the per-100 g figures
 * (used when a user enters "this whole thing weighs X g and has Y kcal").
 */
export function toPer100g(
  totals: { calories: number } & Macros,
  totalGrams: number,
): NutritionPer100g {
  const factor = 100 / totalGrams;
  return {
    calories: totals.calories * factor,
    protein: totals.protein * factor,
    carbs: totals.carbs * factor,
    fat: totals.fat * factor,
  };
}
