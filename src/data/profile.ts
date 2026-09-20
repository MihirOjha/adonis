import { supabase } from "@/lib/supabase";
import type { CoachTargetRow, ProfileRow } from "@/lib/database.types";
import {
  coldStartTdee,
  computeTarget,
  estimateExpenditure,
  isStalled,
  smoothWeightTrend,
  targetRationale,
  weightSlopeKgPerDay,
  type IntakePoint,
} from "@/domain";
import { listBodyMetrics, toWeightPoints } from "./body";

/** Fetch the current user's profile row. */
export async function getProfile(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Update fields on the current user's profile. */
export async function updateProfile(
  userId: string,
  patch: Partial<Omit<ProfileRow, "id" | "created_at" | "updated_at">>,
): Promise<ProfileRow> {
  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", userId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/** Compute age in whole years from an ISO birthdate. */
function ageFrom(birthdate: string | null): number {
  if (!birthdate) return 30; // sensible default until the profile is filled in
  const b = new Date(birthdate);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

/** The most recent coach target for a user, or null if none yet. */
export async function getCurrentTarget(
  userId: string,
): Promise<CoachTargetRow | null> {
  const { data, error } = await supabase
    .from("coach_targets")
    .select("*")
    .eq("user_id", userId)
    .order("effective_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Build per-day intake totals from logged food, ascending by date. */
export async function getIntakeHistory(
  userId: string,
  days = 60,
): Promise<IntakePoint[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("daily_logs")
    .select("log_date, food_entries(calories)")
    .eq("user_id", userId)
    .gte("log_date", sinceIso)
    .order("log_date")
    .returns<{ log_date: string; food_entries: { calories: number }[] }[]>();
  if (error) throw error;

  return (data ?? []).map((row) => {
    const entries = (row.food_entries ?? []) as { calories: number }[];
    return {
      date: row.log_date,
      calories: entries.reduce((a, e) => a + e.calories, 0),
    };
  });
}

/**
 * Recompute the adaptive expenditure estimate + target and persist it as a new
 * CoachTarget. This is what Muse (or the "Recalculate" button) calls.
 */
export async function recomputeTarget(
  profile: ProfileRow,
  setBy: "muse" | "manual" = "manual",
): Promise<CoachTargetRow> {
  const [metrics, intakes, prior] = await Promise.all([
    listBodyMetrics(profile.id),
    getIntakeHistory(profile.id),
    getCurrentTarget(profile.id),
  ]);

  const weights = toWeightPoints(metrics);
  const latestWeight = weights.at(-1)?.weightKg ?? 75;

  const coldStart = coldStartTdee({
    weightKg: latestWeight,
    heightCm: profile.height_cm ?? 175,
    ageYears: ageFrom(profile.birthdate),
    sex: profile.sex ?? "male",
    activity: profile.activity,
  });

  const estimate = estimateExpenditure({
    weights,
    intakes,
    coldStart,
    prior: prior?.expenditure ?? undefined,
  });

  const target = computeTarget({
    expenditure: estimate.expenditure,
    weightKg: latestWeight,
    goal: profile.goal,
  });

  const trend = smoothWeightTrend(weights);
  const slope = weightSlopeKgPerDay(trend);
  const rationale = targetRationale({
    goal: profile.goal,
    expenditure: estimate.expenditure,
    adaptive: estimate.adaptive,
    slopeKgPerWeek: slope === null ? null : slope * 7,
    stalled: isStalled(trend),
  });

  // Find the active cycle to scope the target to (optional).
  const { data: cycle } = await supabase
    .from("cycles")
    .select("id")
    .eq("user_id", profile.id)
    .eq("status", "active")
    .maybeSingle();

  const { data, error } = await supabase
    .from("coach_targets")
    .insert({
      user_id: profile.id,
      cycle_id: cycle?.id ?? null,
      effective_date: new Date().toISOString().slice(0, 10),
      calories: target.calories,
      protein: target.protein,
      carbs: target.carbs,
      fat: target.fat,
      expenditure: estimate.expenditure,
      rationale,
      set_by: setBy,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
