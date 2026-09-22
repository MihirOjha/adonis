/**
 * Hand-written database types mirroring supabase/migrations/0001_init.sql.
 *
 * When you have the Supabase CLI linked, you can regenerate a fuller version
 * with:  `supabase gen types typescript --linked > src/lib/database.types.ts`
 * For now this covers the tables the app reads/writes.
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
export type FoodSource = "barcode" | "usda" | "manual";
export type RecipeVisibility = "private" | "shared";
export type InboxStatus = "pending" | "processed" | "discarded";
export type CycleStatus = "active" | "completed" | "abandoned";
export type TargetSetter = "muse" | "manual";
export type ShareStatus = "pending" | "accepted" | "revoked";
export type MetricSource = "health" | "manual";

interface Table<Row, Insert = Partial<Row>, Update = Partial<Row>> {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
}

export type ProfileRow = {
  id: string;
  name: string;
  sex: Sex | null;
  birthdate: string | null;
  height_cm: number | null;
  activity: ActivityLevel;
  goal: Goal;
  muse_account_ref: string | null;
  theme_color: string | null;
  created_at: string;
  updated_at: string;
};

export type CycleRow = {
  id: string;
  user_id: string;
  name: string;
  goal: Goal;
  start_date: string;
  target_date: string | null;
  status: CycleStatus;
  created_at: string;
};

export type FoodRow = {
  id: string;
  user_id: string;
  name: string;
  source: FoodSource;
  barcode: string | null;
  serving_size_g: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  sodium: number | null;
  iron: number | null;
  calcium: number | null;
  vitamin_d: number | null;
  created_at: string;
};

export type DailyLogRow = {
  id: string;
  user_id: string;
  log_date: string;
  notes: string | null;
};

export type FoodEntryRow = {
  id: string;
  daily_log_id: string;
  food_id: string | null;
  recipe_id: string | null;
  meal: MealSlot;
  grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  created_at: string;
};

export type BodyMetricRow = {
  id: string;
  user_id: string;
  metric_date: string;
  weight_kg: number | null;
  body_fat: number | null;
  waist_cm: number | null;
  chest_cm: number | null;
  photo_url: string | null;
  source: MetricSource;
  created_at: string;
};

export type CoachTargetRow = {
  id: string;
  user_id: string;
  cycle_id: string | null;
  effective_date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  expenditure: number | null;
  rationale: string | null;
  set_by: TargetSetter;
  created_at: string;
};

export type RecipeRow = {
  id: string;
  user_id: string;
  name: string;
  cooked_weight_g: number;
  visibility: RecipeVisibility;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  created_at: string;
};

export type RecipeIngredientRow = {
  id: string;
  recipe_id: string;
  food_id: string | null;
  name: string;
  raw_grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type InboxNoteRow = {
  id: string;
  user_id: string;
  raw_text: string;
  status: InboxStatus;
  created_at: string;
};

export type SharePermissionRow = {
  id: string;
  owner_id: string;
  viewer_id: string;
  scopes: string[];
  status: ShareStatus;
  created_at: string;
};

export type MuseTokenRow = {
  id: string;
  user_id: string;
  label: string;
  token_hash: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export type ExerciseRow = {
  id: string;
  user_id: string;
  name: string;
  type: string;
  muscle_group: string | null;
};

export type WorkoutSessionRow = {
  id: string;
  daily_log_id: string;
  name: string;
  duration_min: number | null;
  created_at: string;
};

export type ExerciseSetRow = {
  id: string;
  session_id: string;
  exercise_id: string | null;
  reps: number | null;
  weight_kg: number | null;
  rest_sec: number | null;
  rir: number | null;
  pain: boolean;
  notes: string | null;
  position: number;
};

export interface Database {
  public: {
    Tables: {
      profiles: Table<ProfileRow>;
      cycles: Table<CycleRow>;
      foods: Table<FoodRow>;
      daily_logs: Table<DailyLogRow>;
      food_entries: Table<FoodEntryRow>;
      body_metrics: Table<BodyMetricRow>;
      coach_targets: Table<CoachTargetRow>;
      recipes: Table<RecipeRow>;
      recipe_ingredients: Table<RecipeIngredientRow>;
      inbox_notes: Table<InboxNoteRow>;
      share_permissions: Table<SharePermissionRow>;
      muse_tokens: Table<MuseTokenRow>;
      exercises: Table<ExerciseRow>;
      workout_sessions: Table<WorkoutSessionRow>;
      exercise_sets: Table<ExerciseSetRow>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
