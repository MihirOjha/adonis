import { supabase } from "@/lib/supabase";
import type { RecipeRow } from "@/lib/database.types";
import { computeCookedRecipe, type CookedRecipe } from "@/domain";

/** An ingredient going into a recipe (a saved food + raw grams). */
export interface RecipeIngredientInput {
  foodId?: string | null;
  name: string;
  rawGrams: number;
  /** Nutrition per 100 g for this ingredient. */
  per100g: { calories: number; protein: number; carbs: number; fat: number };
}

export interface RecipeWithIngredients extends RecipeRow {
  ingredients: Array<{
    id: string;
    name: string;
    raw_grams: number;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }>;
}

/**
 * Create a recipe from ingredients + the final cooked weight.
 * Computes totals and per-100g-cooked, stores ingredients as snapshots.
 */
export async function createRecipe(
  userId: string,
  input: {
    name: string;
    cookedWeightG: number;
    ingredients: RecipeIngredientInput[];
    visibility?: "private" | "shared";
  },
): Promise<RecipeRow> {
  if (input.ingredients.length === 0) throw new Error("Add at least one ingredient.");
  const computed = computeCookedRecipe(
    input.ingredients.map((i) => ({ name: i.name, per100g: i.per100g, rawGrams: i.rawGrams })),
    input.cookedWeightG,
  );

  const { data: recipe, error } = await supabase
    .from("recipes")
    .insert({
      user_id: userId,
      name: input.name.trim() || "Untitled recipe",
      cooked_weight_g: input.cookedWeightG,
      visibility: input.visibility ?? "private",
      total_calories: computed.totals.calories,
      total_protein: computed.totals.protein,
      total_carbs: computed.totals.carbs,
      total_fat: computed.totals.fat,
    })
    .select("*")
    .single();
  if (error) throw error;

  for (const ing of input.ingredients) {
    const { error: ingErr } = await supabase.from("recipe_ingredients").insert({
      recipe_id: recipe.id,
      food_id: ing.foodId ?? null,
      name: ing.name,
      raw_grams: ing.rawGrams,
      calories: ing.per100g.calories,
      protein: ing.per100g.protein,
      carbs: ing.per100g.carbs,
      fat: ing.per100g.fat,
    });
    if (ingErr) throw ingErr;
  }
  return recipe;
}

/** List the user's own recipes plus any shared to them. */
export async function listRecipes(userId: string): Promise<RecipeRow[]> {
  const { data, error } = await supabase
    .from("recipes")
    .select("*")
    .or(`user_id.eq.${userId},visibility.eq.shared`)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Get a recipe with its ingredients. */
export async function getRecipe(recipeId: string): Promise<RecipeWithIngredients | null> {
  const { data, error } = await supabase
    .from("recipes")
    .select("*, recipe_ingredients(*)")
    .eq("id", recipeId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { recipe_ingredients, ...recipe } = data as any;
  return { ...recipe, ingredients: recipe_ingredients ?? [] };
}

/** Toggle a recipe's visibility (private <-> shared). */
export async function setRecipeVisibility(
  recipeId: string,
  visibility: "private" | "shared",
): Promise<void> {
  const { error } = await supabase.from("recipes").update({ visibility }).eq("id", recipeId);
  if (error) throw error;
}

/** Delete a recipe (ingredients cascade). */
export async function deleteRecipe(recipeId: string): Promise<void> {
  const { error } = await supabase.from("recipes").delete().eq("id", recipeId);
  if (error) throw error;
}

/** Compute the per-100g-cooked profile for portioning a recipe. */
export function recipePer100g(recipe: RecipeRow): { calories: number; protein: number; carbs: number; fat: number } {
  const factor = 100 / recipe.cooked_weight_g;
  return {
    calories: recipe.total_calories * factor,
    protein: recipe.total_protein * factor,
    carbs: recipe.total_carbs * factor,
    fat: recipe.total_fat * factor,
  };
}
