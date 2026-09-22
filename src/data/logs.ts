import { supabase } from "@/lib/supabase";
import type { FoodEntryRow, FoodRow, MealSlot } from "@/lib/database.types";
import { scaleFromServing, sumEntries, type Macros } from "@/domain";
import { foodToServing } from "./food";

/** Today's date as an ISO YYYY-MM-DD string in local time. */
export function todayIso(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

/** Get the daily log for a date, creating it if it doesn't exist. */
export async function getOrCreateDailyLog(
  userId: string,
  logDate: string,
): Promise<string> {
  const existing = await supabase
    .from("daily_logs")
    .select("id")
    .eq("user_id", userId)
    .eq("log_date", logDate)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data.id;

  const created = await supabase
    .from("daily_logs")
    .insert({ user_id: userId, log_date: logDate })
    .select("id")
    .single();
  if (created.error) throw created.error;
  return created.data.id;
}

/** List food entries for a daily log. */
export async function listFoodEntries(
  dailyLogId: string,
): Promise<FoodEntryRow[]> {
  const { data, error } = await supabase
    .from("food_entries")
    .select("*")
    .eq("daily_log_id", dailyLogId)
    .order("created_at");
  if (error) throw error;
  return data ?? [];
}

/**
 * Log a portion of a saved food to a day. Computes and snapshots the
 * calories/macros so historical entries stay stable even if the food is later
 * edited.
 */
export async function logFood(params: {
  dailyLogId: string;
  food: FoodRow;
  grams: number;
  meal: MealSlot;
}): Promise<FoodEntryRow> {
  const scaled = scaleFromServing(
    foodToServing(params.food),
    params.food.serving_size_g,
    params.grams,
  );
  const { data, error } = await supabase
    .from("food_entries")
    .insert({
      daily_log_id: params.dailyLogId,
      food_id: params.food.id,
      meal: params.meal,
      grams: params.grams,
      calories: round(scaled.calories),
      protein: round(scaled.protein),
      carbs: round(scaled.carbs),
      fat: round(scaled.fat),
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/** Delete a food entry. */
export async function deleteFoodEntry(id: string): Promise<void> {
  const { error } = await supabase.from("food_entries").delete().eq("id", id);
  if (error) throw error;
}

/** Roll up a day's food entries into total calories + macros. */
export function dayTotals(
  entries: ReadonlyArray<FoodEntryRow>,
): { calories: number } & Macros {
  return sumEntries(
    entries.map((e) => ({
      calories: e.calories,
      protein: e.protein,
      carbs: e.carbs,
      fat: e.fat,
    })),
  );
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
