// Adonis — Muse coach API (Supabase Edge Function, Deno runtime)
//
// This is the single, scoped entry point Muse calls to read data and write
// coaching decisions.
//
// SECURITY MODEL (accurate): two credential types.
//   1. User JWT (from the app) → Postgres Row-Level Security scopes every
//      query to that user automatically.
//   2. Scoped Muse token (muse_...) → resolves to a user, then we use the
//      SERVICE-ROLE client, which BYPASSES RLS. Scoping on this path comes
//      ONLY from the explicit user_id filter applied to EVERY query via the
//      asUser() helper below. Never query a user table without asUser().
//
// Deploy:  supabase functions deploy muse --no-verify-jwt
// Call:    POST /functions/v1/muse
//          Authorization: Bearer <user JWT | muse_ token>
//          Body: { "action": "...", ... }
//
// deno-lint-ignore-file no-explicit-any

import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Bump this whenever the action contract changes, and update dev/MUSE_API.txt
// in the same commit. Muse calls `version` to confirm it's on the current
// contract before relying on new fields/actions.
const CONTRACT_VERSION = "3";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();

  // Two credential types:
  //  1. A user JWT (from the app) → act as that user via RLS.
  //  2. A scoped Muse token (opaque string) → resolve to a user, then act as
  //     that user with the service role. Every query below filters by user_id,
  //     so all reads/writes stay scoped to that single user.
  let supabase;
  let userId: string;

  if (bearer.startsWith("muse_")) {
    // Scoped Muse token path.
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: resolved, error: resolveErr } = await admin.rpc(
      "resolve_muse_token",
      { token: bearer },
    );
    if (resolveErr || !resolved) return json({ error: "Invalid token" }, 401);
    userId = resolved as string;
    supabase = admin; // queries below already filter by user_id
    // Best-effort usage stamp; don't block the request on it.
    admin.rpc("touch_muse_token", { token: bearer }).then(() => {});
  } else {
    // User JWT path → RLS scopes everything to the caller.
    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await client.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Invalid token" }, 401);
    userId = userData.user.id;
    supabase = client;
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const action = payload.action as string | undefined;

  // EVERY query against a user-owned table MUST go through asUser() so the
  // user_id filter is structural, not per-call-site. On the service-role
  // (muse-token) path RLS is bypassed, so this filter is the ONLY thing
  // scoping the query to the caller. Do not call supabase.from(...) directly
  // for user tables.
  const asUser = (table: string) => supabase.from(table).eq("user_id", userId);

  // Find-or-create a daily_logs row for a date (handles the unique race).
  async function ensureDailyLog(day: string): Promise<string> {
    const existing = await supabase
      .from("daily_logs")
      .select("id")
      .eq("user_id", userId)
      .eq("log_date", day)
      .maybeSingle();
    if (existing.data?.id) return existing.data.id as string;
    const created = await supabase
      .from("daily_logs")
      .upsert(
        { user_id: userId, log_date: day },
        { onConflict: "user_id,log_date" },
      )
      .select("id")
      .single();
    if (created.error) throw created.error;
    return created.data.id as string;
  }

  try {
    switch (action) {
      case "summary": {
        const [profile, metrics, targets, logs, sessions] = await Promise.all([
          supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
          supabase
            .from("body_metrics")
            .select("metric_date, weight_kg, body_fat, waist_cm")
            .eq("user_id", userId)
            .order("metric_date", { ascending: false })
            .limit(90),
          // Target history (not just latest) so Muse can judge whether the
          // previous change worked.
          supabase
            .from("coach_targets")
            .select("*")
            .eq("user_id", userId)
            .order("effective_date", { ascending: false })
            .limit(10),
          supabase
            .from("daily_logs")
            .select("log_date, food_entries(calories, protein, carbs, fat)")
            .eq("user_id", userId)
            .order("log_date", { ascending: false })
            .limit(30),
          // Recent workouts with their sets + exercise names.
          supabase
            .from("workout_sessions")
            .select(
              "id, name, duration_min, created_at, daily_logs!inner(log_date, user_id), exercise_sets(reps, weight_kg, rir, pain, rest_sec, position, notes, exercises(name))",
            )
            .eq("daily_logs.user_id", userId)
            .order("created_at", { ascending: false })
            .limit(20),
        ]);

        const intake = (logs.data ?? []).map((row: any) => {
          const entries = (row.food_entries ?? []) as any[];
          return {
            date: row.log_date,
            calories: entries.reduce((a, e) => a + Number(e.calories), 0),
            protein: entries.reduce((a, e) => a + Number(e.protein), 0),
            carbs: entries.reduce((a, e) => a + Number(e.carbs), 0),
            fat: entries.reduce((a, e) => a + Number(e.fat), 0),
          };
        });

        const workouts = (sessions.data ?? []).map((s: any) => ({
          date: s.daily_logs?.log_date ?? null,
          name: s.name,
          duration_min: s.duration_min,
          sets: ((s.exercise_sets ?? []) as any[])
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
            .map((set) => ({
              exercise: set.exercises?.name ?? "Unknown exercise",
              reps: set.reps,
              weight_kg: set.weight_kg,
              rir: set.rir,
              pain: set.pain,
              rest_sec: set.rest_sec,
              notes: set.notes,
            })),
        }));

        return json({
          profile: profile.data,
          weights: metrics.data ?? [],
          intake,
          workouts,
          currentTarget: targets.data?.[0] ?? null,
          targetHistory: targets.data ?? [],
        });
      }

      case "set_target": {
        const {
          calories,
          protein,
          carbs,
          fat,
          expenditure,
          rationale,
          cycle_id,
        } = payload;
        if (
          [calories, protein, carbs, fat].some((v) => typeof v !== "number")
        ) {
          return json(
            { error: "calories, protein, carbs, fat are required numbers" },
            400,
          );
        }
        const { data, error } = await supabase
          .from("coach_targets")
          .insert({
            user_id: userId,
            cycle_id: cycle_id ?? null,
            effective_date: todayIso(),
            calories,
            protein,
            carbs,
            fat,
            expenditure: expenditure ?? null,
            rationale: rationale ?? null,
            set_by: "muse",
          })
          .select("*")
          .single();
        if (error) throw error;
        return json({ target: data });
      }

      case "log_weight": {
        const { weight_kg, body_fat, date } = payload;
        if (typeof weight_kg !== "number") {
          return json({ error: "weight_kg (number) is required" }, 400);
        }
        const { data, error } = await supabase
          .from("body_metrics")
          .upsert(
            {
              user_id: userId,
              metric_date: date ?? todayIso(),
              weight_kg,
              body_fat: body_fat ?? null,
              source: "manual",
            },
            { onConflict: "user_id,metric_date,source" },
          )
          .select("*")
          .single();
        if (error) throw error;
        return json({ metric: data });
      }

      case "add_note": {
        const { text } = payload;
        if (typeof text !== "string" || !text.trim()) {
          return json({ error: "text is required" }, 400);
        }
        const { data, error } = await supabase
          .from("inbox_notes")
          .insert({ user_id: userId, raw_text: text.trim() })
          .select("*")
          .single();
        if (error) throw error;
        return json({ note: data });
      }

      case "log_food": {
        const {
          grams,
          calories,
          protein,
          carbs,
          fat,
          meal,
          date,
          food_id,
          recipe_id,
          name,
        } = payload;
        if ([grams, calories].some((v) => typeof v !== "number")) {
          return json(
            { error: "grams and calories are required numbers" },
            400,
          );
        }

        // Validate optional food/recipe links (ownership / shared visibility).
        if (food_id != null) {
          const f = await supabase
            .from("foods")
            .select("id")
            .eq("id", food_id)
            .eq("user_id", userId)
            .maybeSingle();
          if (!f.data)
            return json({ error: "food_id not found or not yours" }, 400);
        }
        if (recipe_id != null) {
          const r = await supabase
            .from("recipes")
            .select("id, user_id, visibility")
            .eq("id", recipe_id)
            .maybeSingle();
          const ok =
            r.data &&
            (r.data.user_id === userId || r.data.visibility === "shared");
          if (!ok)
            return json(
              { error: "recipe_id not found or not accessible" },
              400,
            );
        }

        const logId = await ensureDailyLog(date ?? todayIso());
        const { data, error } = await supabase
          .from("food_entries")
          .insert({
            daily_log_id: logId,
            meal: meal ?? "snack",
            grams,
            calories,
            protein: protein ?? 0,
            carbs: carbs ?? 0,
            fat: fat ?? 0,
            food_id: food_id ?? null,
            recipe_id: recipe_id ?? null,
            name: typeof name === "string" && name.trim() ? name.trim() : null,
          })
          .select("*")
          .single();
        if (error) throw error;
        return json({ entry: data });
      }

      case "log_workout": {
        const { date, name, duration_min, sets } = payload;
        if (!Array.isArray(sets) || sets.length === 0) {
          return json({ error: "sets must be a non-empty array" }, 400);
        }
        // Validate ALL sets up front (before any insert) so a bad set can't
        // leave an orphaned 0-set session row.
        for (const s of sets) {
          if (
            !s ||
            typeof s.exercise !== "string" ||
            !s.exercise.trim() ||
            typeof s.reps !== "number"
          ) {
            return json(
              {
                error: "each set requires exercise (string) and reps (number)",
              },
              400,
            );
          }
          if (
            s.rir != null &&
            (typeof s.rir !== "number" || s.rir < 0 || s.rir > 10)
          ) {
            return json(
              { error: "rir must be a number between 0 and 10" },
              400,
            );
          }
        }

        const logId = await ensureDailyLog(date ?? todayIso());
        const session = await supabase
          .from("workout_sessions")
          .insert({
            daily_log_id: logId,
            name:
              typeof name === "string" && name.trim() ? name.trim() : "Workout",
            duration_min:
              typeof duration_min === "number" ? duration_min : null,
          })
          .select("*")
          .single();
        if (session.error) throw session.error;
        const sessionId = session.data.id as string;

        // Insert sets, find-or-creating exercises by normalized name.
        let inserted = 0;
        for (let i = 0; i < sets.length; i++) {
          const s = sets[i];
          const normName = s.exercise.trim().replace(/\s+/g, " ");
          // find existing (case-insensitive). Escape LIKE wildcards so names
          // containing % or _ don't false-match other exercises.
          const escaped = normName.replace(/[%_\\]/g, (c) => `\\${c}`);
          const found = await supabase
            .from("exercises")
            .select("id")
            .eq("user_id", userId)
            .ilike("name", escaped)
            .maybeSingle();
          let exerciseId = found.data?.id as string | undefined;
          if (!exerciseId) {
            const created = await supabase
              .from("exercises")
              .insert({ user_id: userId, name: normName })
              .select("id")
              .single();
            if (created.error) throw created.error;
            exerciseId = created.data.id as string;
          }
          const setRow = await supabase.from("exercise_sets").insert({
            session_id: sessionId,
            exercise_id: exerciseId,
            reps: s.reps,
            weight_kg: typeof s.weight_kg === "number" ? s.weight_kg : null,
            rest_sec: typeof s.rest_sec === "number" ? s.rest_sec : null,
            rir: typeof s.rir === "number" ? s.rir : null,
            pain: s.pain === true,
            notes: typeof s.notes === "string" ? s.notes : null,
            position: i,
          });
          if (setRow.error) throw setRow.error;
          inserted++;
        }
        return json({ session: session.data, sets: inserted });
      }

      case "void_food_entry": {
        const { entry_id } = payload;
        if (typeof entry_id !== "string" || !entry_id) {
          return json({ error: "entry_id (string) is required" }, 400);
        }
        // Verify ownership: the entry's daily_log must belong to this user.
        // (Service-role path has no RLS, so this check IS the guard.)
        const entry = await supabase
          .from("food_entries")
          .select("id, daily_logs!inner(user_id)")
          .eq("id", entry_id)
          .maybeSingle();
        if (entry.error) throw entry.error;
        const ownerId = (entry.data as any)?.daily_logs?.user_id;
        if (!entry.data || ownerId !== userId) {
          // Same message whether it doesn't exist or isn't owned — don't leak.
          return json({ error: "entry not found" }, 404);
        }
        const del = await supabase
          .from("food_entries")
          .delete()
          .eq("id", entry_id);
        if (del.error) throw del.error;
        return json({ deleted: entry_id });
      }

      case "version": {
        // Lets Muse confirm it's working against the current contract.
        return json({
          contract_version: CONTRACT_VERSION,
          actions: [
            "summary",
            "set_target",
            "log_weight",
            "add_note",
            "log_food",
            "log_workout",
            "void_food_entry",
            "version",
            "send_message",
            "list_messages",
          ],
        });
      }

      case "send_message": {
        const { kind, body } = payload;
        if (typeof body !== "string" || !body.trim()) {
          return json({ error: "body (non-empty string) is required" }, 400);
        }
        const allowed = [
          "capability_request",
          "feedback",
          "suggestion",
          "question",
          "note",
        ];
        const { data, error } = await supabase
          .from("muse_messages")
          .insert({
            user_id: userId,
            author: "muse",
            kind: allowed.includes(kind) ? kind : "note",
            body: body.trim(),
          })
          .select("id, kind, status, created_at")
          .single();
        if (error) throw error;
        return json({ message: data });
      }

      case "list_messages": {
        // Muse pulls the conversation: its own messages + dev/user replies.
        const limit = typeof payload.limit === "number" ? payload.limit : 50;
        const { data, error } = await supabase
          .from("muse_messages")
          .select("id, author, kind, body, status, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(limit);
        if (error) throw error;
        return json({ messages: data ?? [] });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    // Map known Postgres constraint violations to a clean 400 instead of a
    // generic 500 (e.g. grams <= 0 -> check constraint 23514).
    const msg = e instanceof Error ? e.message : "Server error";
    const code = (e as any)?.code;
    if (code === "23514" || code === "23502" || code === "23503" || code === "23505") {
      return json({ error: msg }, 400);
    }
    return json({ error: msg }, 500);
  }
});
