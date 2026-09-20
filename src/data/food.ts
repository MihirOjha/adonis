import { supabase } from "@/lib/supabase";
import type { FoodRow, FoodSource } from "@/lib/database.types";
import type { NutritionPer100g } from "@/domain";

/** Map a DB food row to a domain per-100 g nutrition profile. */
export function foodToNutrition(food: FoodRow): NutritionPer100g {
  return {
    calories: food.calories,
    protein: food.protein,
    carbs: food.carbs,
    fat: food.fat,
    fiber: food.fiber ?? undefined,
    sodium: food.sodium ?? undefined,
    iron: food.iron ?? undefined,
    calcium: food.calcium ?? undefined,
    vitaminD: food.vitamin_d ?? undefined,
  };
}

/** Search the user's saved foods by name. */
export async function searchFoods(
  userId: string,
  query: string,
  limit = 25,
): Promise<FoodRow[]> {
  let q = supabase.from("foods").select("*").eq("user_id", userId).limit(limit);
  if (query.trim()) q = q.ilike("name", `%${query.trim()}%`);
  const { data, error } = await q.order("name");
  if (error) throw error;
  return data ?? [];
}

/** Find a saved food by exact barcode (dedup before hitting the network). */
export async function findFoodByBarcode(
  userId: string,
  barcode: string,
): Promise<FoodRow | null> {
  const { data, error } = await supabase
    .from("foods")
    .select("*")
    .eq("user_id", userId)
    .eq("barcode", barcode)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export interface UpsertFoodInput {
  name: string;
  source: FoodSource;
  barcode?: string | null;
  per100g: NutritionPer100g;
}

/** Save a new food to the user's verified personal database. */
export async function createFood(
  userId: string,
  input: UpsertFoodInput,
): Promise<FoodRow> {
  const { per100g } = input;
  const { data, error } = await supabase
    .from("foods")
    .insert({
      user_id: userId,
      name: input.name,
      source: input.source,
      barcode: input.barcode ?? null,
      calories: per100g.calories,
      protein: per100g.protein,
      carbs: per100g.carbs,
      fat: per100g.fat,
      fiber: per100g.fiber ?? null,
      sodium: per100g.sodium ?? null,
      iron: per100g.iron ?? null,
      calcium: per100g.calcium ?? null,
      vitamin_d: per100g.vitaminD ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
