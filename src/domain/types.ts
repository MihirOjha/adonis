/**
 * Shared domain types for Adonis.
 *
 * These are framework-agnostic, pure-data shapes used by the domain logic.
 * Database rows are mapped to/from these in the data layer (src/data).
 */

export type Sex = "male" | "female";

export type Goal = "cut" | "maintain" | "bulk" | "recomp";

export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very_active";

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

/** Macronutrients in grams. */
export interface Macros {
  protein: number;
  carbs: number;
  fat: number;
}

/** Nutrition facts expressed per 100 g of a food. */
export interface NutritionPer100g extends Macros {
  calories: number;
  /** Optional micronutrients (mg unless noted), when the source provides them. */
  fiber?: number;
  sodium?: number;
  iron?: number;
  calcium?: number;
  vitaminD?: number;
}

/** A single weight measurement. */
export interface WeightPoint {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  weightKg: number;
}

/** Total energy intake for a single day. */
export interface IntakePoint {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  calories: number;
}

/** A calorie + macro target produced by the coach. */
export interface CoachTargetValues {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}
