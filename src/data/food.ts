import { supabase } from "@/lib/supabase";
import type { FoodRow, FoodSource } from "@/lib/database.types";
import type { Macros } from "@/domain";

/**
 * Map a DB food row to its nutrition per SERVING (the label's reference
 * amount, serving_size_g). The stored calories/macros are the values for that
 * serving size, exactly as the label printed them.
 */
export function foodToServing(food: FoodRow): { calories: number } & Macros {
  return {
    calories: food.calories,
    protein: food.protein,
    carbs: food.carbs,
    fat: food.fat,
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
  /** The label's reference weight in grams (e.g. 50 for "per 50 g"). Default 100. */
  servingSizeG?: number;
  /** Nutrition values AS PRINTED on the label, for the given servingSizeG. */
  perServing: { calories: number } & Macros;
  fiber?: number | null;
  sodium?: number | null;
  iron?: number | null;
  calcium?: number | null;
  vitaminD?: number | null;
}

/** Save a new food to the user's verified personal database. */
export async function createFood(
  userId: string,
  input: UpsertFoodInput,
): Promise<FoodRow> {
  const { perServing } = input;
  const { data, error } = await supabase
    .from("foods")
    .insert({
      user_id: userId,
      name: input.name,
      source: input.source,
      barcode: input.barcode ?? null,
      serving_size_g: input.servingSizeG ?? 100,
      calories: perServing.calories,
      protein: perServing.protein,
      carbs: perServing.carbs,
      fat: perServing.fat,
      fiber: input.fiber ?? null,
      sodium: input.sodium ?? null,
      iron: input.iron ?? null,
      calcium: input.calcium ?? null,
      vitamin_d: input.vitaminD ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
