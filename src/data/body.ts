import { supabase } from "@/lib/supabase";
import type { BodyMetricRow, MetricSource } from "@/lib/database.types";
import type { WeightPoint } from "@/domain";

/** List body metrics for a user, most recent first. */
export async function listBodyMetrics(
  userId: string,
  limit = 180,
): Promise<BodyMetricRow[]> {
  const { data, error } = await supabase
    .from("body_metrics")
    .select("*")
    .eq("user_id", userId)
    .order("metric_date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/** Extract weight points (ascending by date) for the trend engine. */
export function toWeightPoints(
  rows: ReadonlyArray<BodyMetricRow>,
): WeightPoint[] {
  return rows
    .filter((r) => r.weight_kg !== null)
    .map((r) => ({ date: r.metric_date, weightKg: r.weight_kg as number }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Upsert a body metric for a date + source. The (user, date, source) unique
 * constraint means re-syncing the same day's weight overwrites rather than
 * duplicates.
 */
export async function upsertBodyMetric(params: {
  userId: string;
  date: string;
  weightKg?: number;
  bodyFat?: number;
  waistCm?: number;
  chestCm?: number;
  photoUrl?: string;
  source?: MetricSource;
}): Promise<BodyMetricRow> {
  const { data, error } = await supabase
    .from("body_metrics")
    .upsert(
      {
        user_id: params.userId,
        metric_date: params.date,
        weight_kg: params.weightKg ?? null,
        body_fat: params.bodyFat ?? null,
        waist_cm: params.waistCm ?? null,
        chest_cm: params.chestCm ?? null,
        photo_url: params.photoUrl ?? null,
        source: params.source ?? "manual",
      },
      { onConflict: "user_id,metric_date,source" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
