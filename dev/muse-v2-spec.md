# Adonis Muse Coach API — v2 Spec

**Target:** `supabase/functions/muse/index.ts` + one new migration (`supabase/migrations/0005_muse_api_v2.sql`).
**Author:** Flash (Muse, the coach). **Implementer:** GitHub Copilot.
**Goal:** give the coach API food identity, workout logging, full macros, and corrections — all additive, no breaking changes to the five existing actions.

---

## Change 1 — `log_food`: food identity

**Problem:** `food_entries` has `food_id` / `recipe_id` columns and the app sets them, but the Muse API accepts neither and has no name field. The coach receives anonymous macros.

**Migration** (in `0005_muse_api_v2.sql`):

```sql
alter table food_entries
  add column if not exists name text;
```

**New payload** (all existing fields unchanged; three new optional fields):

```json
{
  "action": "log_food",
  "grams": 150,
  "calories": 250,
  "protein": 30,
  "carbs": 0,
  "fat": 12,
  "meal": "lunch",
  "date": "2026-09-21",
  "food_id": "<uuid, optional>",
  "recipe_id": "<uuid, optional>",
  "name": "<free text, optional, e.g. 'Chicken burrito'>"
}
```

**Validation:**

- If `food_id` is provided, it must exist in `foods` with `user_id` = caller. Otherwise 400 `"food_id not found or not yours"`.
- If `recipe_id` is provided, it must exist in `recipes` with `user_id` = caller OR `visibility = 'shared'`. Otherwise 400.
- `name` is stored as-is on the entry (manual entries with no food/recipe link).
- Response `{ "entry": { ...row... } }` unchanged in shape (now includes the new columns via `select("*")`).

---

## Change 2 — workout logging (`log_workout` action)

**Problem:** the schema has `exercises`, `workout_sessions`, `exercise_sets`, but the Edge Function exposes none of it and `summary` returns no training data. The coach cannot track adherence or progression.

**Migration** (in `0005_muse_api_v2.sql`):

```sql
alter table exercise_sets
  add column if not exists rir smallint check (rir between 0 and 10),
  add column if not exists pain boolean not null default false,
  add column if not exists notes text;
```

(`rir` = reps in reserve, the coach's intensity signal; `pain` = pain flag for the set.)

**New action payload:**

```json
{
  "action": "log_workout",
  "date": "2026-09-21",
  "name": "Full-body A",
  "duration_min": 50,
  "sets": [
    {
      "exercise": "Goblet squat",
      "reps": 12,
      "weight_kg": 16,
      "rir": 2,
      "pain": false,
      "rest_sec": 90,
      "notes": ""
    },
    {
      "exercise": "DB bench press",
      "reps": 10,
      "weight_kg": 22.5,
      "rir": 1,
      "pain": false
    }
  ]
}
```

**Behavior:**

1. `sets` must be a non-empty array; each set requires `exercise` (non-empty string) and `reps` (number). `weight_kg`, `rir` (0–10), `rest_sec` optional; `pain` defaults false; `notes` defaults null. Unknown fields ignored. Violations → 400.
2. Ensure a `daily_logs` row for (`user_id`, `date ?? today`), creating it if missing (same pattern as `log_food`).
3. Insert one `workout_sessions` row (`daily_log_id`, `name ?? 'Workout'`, `duration_min ?? null`).
4. For each set, find-or-create an `exercises` row matching (`user_id`, case-insensitive `name`); insert `exercise_sets` with `position` = array index.
5. Return `{ "session": { ...session row... }, "sets": <count> }`.

---

## Change 3 — `summary`: full macros + workouts

**Intake rows** gain carbs and fat (columns already exist; just aggregate them):

```json
{
  "date": "2026-09-21",
  "calories": 2100,
  "protein": 160,
  "carbs": 200,
  "fat": 70
}
```

Change the `food_entries` sub-select to `(calories, protein, carbs, fat)`.

**New `workouts` key** — last 20 sessions, newest first:

```json
"workouts": [
  {
    "date": "2026-09-21", "name": "Full-body A", "duration_min": 50,
    "sets": [
      {"exercise": "Goblet squat", "reps": 12, "weight_kg": 16, "rir": 2, "pain": false, "notes": ""}
    ]
  }
]
```

Query: `workout_sessions` joined through `daily_logs` where `daily_logs.user_id` = caller, ordered by `log_date` desc, limit 20; sets joined with `exercises.name`, ordered by `position`. Sets with a deleted exercise (`exercise_id` null via `on delete set null`) must still appear — fall back to `"Unknown exercise"`, never drop the set.

---

## Change 4 — corrections (`void_food_entry` action)

**Problem:** a mistaken food entry is permanent through the API.

**New action:**

```json
{ "action": "void_food_entry", "entry_id": "<uuid>" }
```

- Verify ownership: the entry's `daily_log` must have `user_id` = caller (join, don't trust a bare id). Not found / not owned → 404 `{ "error": "entry not found" }` (same message either way — don't leak existence).
- Delete the row. Return `{ "deleted": "<entry_id>" }`.

**Note (no code):** `log_weight` already upserts per (`user_id`, `date`, `source='manual'`), so weight corrections = re-log the day. Document this in `MUSE_API.txt`.

---

## Change 5 — fix the security comments + filter discipline

The comments in `0003_muse_tokens.sql` and `supabase/functions/muse/index.ts` claim RLS scopes the muse-token path. It doesn't: that path uses the **service-role client**, and scoping comes from the explicit `user_id` filter on every query. The mechanism works (verified), but the comment is wrong and dangerous — a future action that forgets the filter silently leaks across users.

1. Correct both comments to describe the real mechanism.
2. Add a guard: at the top of the `switch`, add a comment block `// EVERY query in EVERY action MUST filter by userId — the service-role client bypasses RLS.` and, better, a tiny helper that makes it hard to forget, e.g. wrapping table access so `user_id` is always constrained. Implementer's choice of exact form, but the invariant must be unmissable in code, not just comments.

---

## Docs

Update `MUSE_API.txt` section 3: document `food_id`/`recipe_id`/`name` on `log_food`, the new `log_workout` and `void_food_entry` actions, the new `summary` fields, and the weight-correction note. Keep section 1's security model text as-is (it remains accurate).

---

## Acceptance tests

After `supabase functions deploy muse` and applying the migration, all of these must pass (replace `<TOKEN>` with a real muse token):

```bash
F=https://grqaxxvmjqdycvxmniyb.supabase.co/functions/v1/muse
H="Authorization: Bearer <TOKEN>"

# 1. food identity
curl -s -X POST $F -H "$H" -H 'Content-Type: application/json' \
  -d '{"action":"log_food","grams":100,"calories":200,"protein":20,"name":"Test bowl","meal":"lunch"}'
# → 200, entry.name == "Test bowl"

# 2. bad food_id rejected
curl -s -X POST $F -H "$H" -H 'Content-Type: application/json' \
  -d '{"action":"log_food","grams":100,"calories":200,"food_id":"00000000-0000-0000-0000-000000000000"}'
# → 400

# 3. workout round-trip
curl -s -X POST $F -H "$H" -H 'Content-Type: application/json' \
  -d '{"action":"log_workout","name":"Test session","sets":[{"exercise":"Test press","reps":10,"weight_kg":20,"rir":2,"pain":false}]}'
# → 200, sets == 1; then summary must list it under workouts with the exercise name

# 4. summary macros
curl -s -X POST $F -H "$H" -H 'Content-Type: application/json' -d '{"action":"summary"}'
# → intake rows contain carbs and fat; workouts key present

# 5. void entry
curl -s -X POST $F -H "$H" -H 'Content-Type: application/json' \
  -d '{"action":"void_food_entry","entry_id":"<id from test 1>"}'
# → 200 {"deleted": "<id>"}; repeating it → 404

# 6. no regressions: the original five actions behave exactly as documented
```

---

## Appendix A — Red-team this spec FIRST (Copilot: do this before writing code)

Critique this spec before implementing. List: ambiguities, missing validations, anything that conflicts with `0001_init.sql` / `0002_rls.sql` / `0003_muse_tokens.sql`, and any security hole in the new actions (especially the find-or-create exercise path and the ownership checks). Propose fixes. Do not silently reinterpret — ask in comments if something is genuinely ambiguous.

## Appendix B — Implementer's suggestions

(Copilot: use this section for anything you notice while implementing — simplifications, extra validations, or follow-ups worth a v3. Keep each to 2–3 lines with the file and line it touches.)

---

## Appendix C — Copilot's red-team review (done BEFORE implementing, as requested)

Reviewed against `0001_init.sql`, `0002_rls.sql`, `0003_muse_tokens.sql`. Overall the spec is solid and additive. Findings:

**C1. `food_entries.name` — fine, but note the existing snapshot pattern.**
`food_entries` already snapshots calories/protein/carbs/fat (so edits to a food don't rewrite history). Adding a free-text `name` is consistent with that. No conflict. ✅ Accept as specced.

**C2. `log_workout` find-or-create exercise — real risk is duplicate/typo exercises, not security.**
Case-insensitive match on (`user_id`, name) is correct and RLS-safe (every query filters user_id). But "DB bench" vs "DB Bench" vs "db bench " (trailing space) would create dupes. FIX: trim + collapse whitespace, and match on `lower(trim(name))`. Also add a `unique (user_id, lower(name))` index to make dupes impossible at the DB level. Acceptable with that hardening.

**C3. `void_food_entry` ownership check — correct approach, one clarification.**
Spec says join through daily_logs and return 404 either way. Correct. Implementation note: with the service-role client (muse-token path) there's no RLS, so the ownership filter MUST be `daily_logs.userId = caller` in the delete's subquery — not a select-then-delete in two steps (which would be racy). I'll do a single delete with an ownership-filtering subquery. ✅ Accept with that note.

**C4. `exercise_sets.rir` check constraint `rir between 0 and 10` — fine.**
But `pain boolean default false` and `notes text` are additive and safe. No conflict with existing columns (reps/weight_kg/rest_sec/position all already exist). ✅

**C5. `summary` workouts join — the "deleted exercise must still appear" requirement is important and correct.**
`exercise_sets.exercise_id` is `on delete set null`, so a left join + `coalesce(exercises.name, 'Unknown exercise')` is required. Spec already calls this out. ✅ Will implement exactly so.

**C6. Change 5 (fix the RLS comments + enforce the user_id filter) — STRONGLY AGREE, and it's the most important item here.**
The muse-token path uses the service-role client, which bypasses RLS. Scoping today comes only from each query's explicit `user_id` filter. That's correct but fragile. I will: (a) fix the misleading comments, and (b) add a small `asUser(userId)` table-access wrapper so every action's queries are forced through a user-scoped filter — making the invariant structural, not just a comment. This is the highest-value change in the spec.

**C7. One genuine ambiguity to flag (not blocking):** `log_workout` "ensure a daily_logs row" — `daily_logs` has `unique(user_id, log_date)`, so find-or-create must handle the race where two concurrent calls both try to insert. I'll use upsert with `onConflict: user_id,log_date` to be safe. (Same hardening applies to the existing `log_food` — worth a v3 note.)

**C8. Minor:** spec numbers the migration `0004_muse_api_v2.sql`, but `0004_muse_messages.sql` already exists (the message channel). I'll use `0005_muse_api_v2.sql` to avoid collision.

Verdict: implement all five changes with the hardening in C2, C3, C6, C7. No breaking changes.
