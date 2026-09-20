// Adonis — Muse coach API (Supabase Edge Function, Deno runtime)
//
// This is the single, scoped entry point Muse calls to read data and write
// coaching decisions. It runs with the *caller's* JWT, so Postgres Row-Level
// Security automatically limits every query to that one user's rows — Muse can
// never touch the other partner's data.
//
// Deploy:  supabase functions deploy muse
// Call:    POST /functions/v1/muse
//          Authorization: Bearer <the user's access token>
//          Body: { "action": "...", ... }
//
// Actions:
//   summary       → recent weights, intake history, current target, profile
//   set_target    → write a new CoachTarget (set_by = 'muse') with rationale
//   log_weight    → upsert a body-weight measurement
//   add_note      → drop raw text into the Muse Inbox
//   log_food      → append a structured food entry to today's log
//
// deno-lint-ignore-file no-explicit-any

import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

  try {
    switch (action) {
      case "summary": {
        const [profile, metrics, targets, logs] = await Promise.all([
          supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
          supabase
            .from("body_metrics")
            .select("metric_date, weight_kg, body_fat, waist_cm")
            .eq("user_id", userId)
            .order("metric_date", { ascending: false })
            .limit(90),
          supabase
            .from("coach_targets")
            .select("*")
            .eq("user_id", userId)
            .order("effective_date", { ascending: false })
            .limit(1),
          supabase
            .from("daily_logs")
            .select("log_date, food_entries(calories, protein)")
            .eq("user_id", userId)
            .order("log_date", { ascending: false })
            .limit(30),
        ]);

        const intake = (logs.data ?? []).map((row: any) => {
          const entries = (row.food_entries ?? []) as any[];
          return {
            date: row.log_date,
            calories: entries.reduce((a, e) => a + Number(e.calories), 0),
            protein: entries.reduce((a, e) => a + Number(e.protein), 0),
          };
        });

        return json({
          profile: profile.data,
          weights: metrics.data ?? [],
          intake,
          currentTarget: targets.data?.[0] ?? null,
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
        const { grams, calories, protein, carbs, fat, meal, date } = payload;
        if ([grams, calories].some((v) => typeof v !== "number")) {
          return json(
            { error: "grams and calories are required numbers" },
            400,
          );
        }
        // Ensure a daily log exists for the date.
        const day = date ?? todayIso();
        const existing = await supabase
          .from("daily_logs")
          .select("id")
          .eq("user_id", userId)
          .eq("log_date", day)
          .maybeSingle();
        let logId = existing.data?.id as string | undefined;
        if (!logId) {
          const created = await supabase
            .from("daily_logs")
            .insert({ user_id: userId, log_date: day })
            .select("id")
            .single();
          if (created.error) throw created.error;
          logId = created.data.id;
        }
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
          })
          .select("*")
          .single();
        if (error) throw error;
        return json({ entry: data });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : "Server error" },
      500,
    );
  }
});
