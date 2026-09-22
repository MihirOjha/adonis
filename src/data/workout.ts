import { supabase } from "@/lib/supabase";
import type {
  ExerciseRow,
  ExerciseSetRow,
  WorkoutSessionRow,
} from "@/lib/database.types";
import { getOrCreateDailyLog, todayIso } from "./logs";

/** A set being entered in the UI (not yet saved). */
export interface SetInput {
  exercise: string;
  reps: number;
  weightKg?: number | null;
  rir?: number | null;
  pain?: boolean;
  restSec?: number | null;
  notes?: string | null;
}

/** A saved session with its sets + exercise names, for display. */
export interface SessionWithSets {
  id: string;
  date: string;
  name: string;
  durationMin: number | null;
  sets: Array<{
    exercise: string;
    reps: number | null;
    weightKg: number | null;
    rir: number | null;
    pain: boolean;
    notes: string | null;
  }>;
}

/** List the user's exercises (for autocomplete). */
export async function listExercises(userId: string): Promise<ExerciseRow[]> {
  const { data, error } = await supabase
    .from("exercises")
    .select("*")
    .eq("user_id", userId)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

/** Find-or-create an exercise by normalized name (case/space-insensitive). */
async function findOrCreateExercise(
  userId: string,
  name: string,
): Promise<string> {
  const norm = name.trim().replace(/\s+/g, " ");
  // Escape LIKE wildcards so names containing % or _ don't false-match.
  const escaped = norm.replace(/[%_\\]/g, (c) => `\\${c}`);
  const found = await supabase
    .from("exercises")
    .select("id")
    .eq("user_id", userId)
    .ilike("name", escaped)
    .maybeSingle();
  if (found.data?.id) return found.data.id;
  const created = await supabase
    .from("exercises")
    .insert({ user_id: userId, name: norm })
    .select("id")
    .single();
  if (created.error) throw created.error;
  return created.data.id;
}

/** Save a workout session with its sets. Returns the session id. */
export async function saveWorkout(
  userId: string,
  input: {
    name: string;
    date?: string;
    durationMin?: number | null;
    sets: SetInput[];
  },
): Promise<string> {
  if (input.sets.length === 0) throw new Error("Add at least one set.");
  const logId = await getOrCreateDailyLog(userId, input.date ?? todayIso());

  const session = await supabase
    .from("workout_sessions")
    .insert({
      daily_log_id: logId,
      name: input.name.trim() || "Workout",
      duration_min: input.durationMin ?? null,
    })
    .select("id")
    .single();
  if (session.error) throw session.error;
  const sessionId = session.data.id;

  for (let i = 0; i < input.sets.length; i++) {
    const s = input.sets[i];
    const exerciseId = await findOrCreateExercise(userId, s.exercise);
    const { error } = await supabase.from("exercise_sets").insert({
      session_id: sessionId,
      exercise_id: exerciseId,
      reps: s.reps,
      weight_kg: s.weightKg ?? null,
      rest_sec: s.restSec ?? null,
      rir: s.rir ?? null,
      pain: s.pain === true,
      notes: s.notes ?? null,
      position: i,
    });
    if (error) throw error;
  }
  return sessionId;
}

/** List recent sessions with their sets, newest first. */
export async function listWorkouts(
  userId: string,
  limit = 30,
): Promise<SessionWithSets[]> {
  const { data, error } = await supabase
    .from("workout_sessions")
    .select(
      "id, name, duration_min, created_at, daily_logs!inner(log_date, user_id), exercise_sets(reps, weight_kg, rir, pain, notes, position, exercises(name))",
    )
    .eq("daily_logs.user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  return (data ?? []).map((s: any) => ({
    id: s.id,
    date: s.daily_logs?.log_date ?? s.created_at?.slice(0, 10) ?? "",
    name: s.name,
    durationMin: s.duration_min,
    sets: ((s.exercise_sets ?? []) as any[])
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((set) => ({
        exercise: set.exercises?.name ?? "Unknown exercise",
        reps: set.reps,
        weightKg: set.weight_kg,
        rir: set.rir,
        pain: set.pain === true,
        notes: set.notes,
      })),
  }));
}

/** Delete a workout session (and its sets via cascade). */
export async function deleteWorkout(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from("workout_sessions")
    .delete()
    .eq("id", sessionId);
  if (error) throw error;
}
