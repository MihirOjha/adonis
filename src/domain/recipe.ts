import { scaleNutrition, sumEntries, toPer100g } from "./nutrition";
import type { Macros, NutritionPer100g } from "./types";

/**
 * A raw ingredient going into a recipe, weighed before cooking.
 */
export interface RecipeIngredientInput {
  name: string;
  /** Nutrition facts per 100 g for this ingredient. */
  per100g: NutritionPer100g;
  /** Raw weight used, in grams. */
  rawGrams: number;
}

/**
 * The computed nutrition profile of a finished dish, normalized to its
 * cooked weight so portions can be logged accurately regardless of how much
 * water was lost or gained during cooking.
 */
export interface CookedRecipe {
  /** Total calories + macros for the whole dish. */
  totals: { calories: number } & Macros;
  /** Finished (cooked) weight of the whole dish, in grams. */
  cookedWeightG: number;
  /** Nutrition per 100 g of the finished dish. */
  per100gCooked: NutritionPer100g;
}

/**
 * Compute a finished dish's nutrition from its raw ingredients and final
 * cooked weight.
 *
 * The key insight: calories/macros are conserved during cooking (only water
 * moves), so we sum the ingredients for the totals, then divide by the
 * *cooked* weight to get an accurate per-gram figure for portioning.
 *
 * @throws if cookedWeightG <= 0.
 */
export function computeCookedRecipe(
  ingredients: ReadonlyArray<RecipeIngredientInput>,
  cookedWeightG: number,
): CookedRecipe {
  if (cookedWeightG <= 0) {
    throw new Error("cookedWeightG must be greater than 0");
  }

  const totals = sumEntries(
    ingredients.map((ing) => scaleNutrition(ing.per100g, ing.rawGrams)),
  );

  return {
    totals,
    cookedWeightG,
    per100gCooked: toPer100g(totals, cookedWeightG),
  };
}

/**
 * Compute the nutrition of a single served portion of a cooked recipe.
 *
 * @param recipe The finished dish.
 * @param portionGrams The weight of the portion actually eaten, in grams.
 */
export function portionOf(
  recipe: CookedRecipe,
  portionGrams: number,
): { calories: number } & Macros {
  return scaleNutrition(recipe.per100gCooked, portionGrams);
}
