# Adonis

Adaptive nutrition, training, and body-composition tracking for two people,
coached by data. Cross-platform (iOS, Android, web) from a single Expo +
TypeScript codebase, backed by Supabase, with an AI coach ("Muse") that plugs
into a scoped API.

> This project is fully self-contained and shares nothing with any other
> project. See [PLAN.md](PLAN.md) for the design and roadmap.

## What's built

- **Expo app** (`app/`) — file-based routing with `expo-router`:
  - Auth (email/password), Today dashboard, Food log, Body/weight, Coach, Profile.
- **Pure domain logic** (`src/domain/`) — framework-free and testable:
  - Adaptive **expenditure engine** (estimates TDEE from weight-trend vs. intake),
    calorie/macro **target** calculator, **recipe** bulk-cook portioning by
    cooked weight, weight **trend** smoothing (EWMA) + stall detection.
- **Data layer** (`src/data/`) — Supabase queries + Open Food Facts barcode lookup.
- **Database** (`supabase/migrations/`) — full schema with **Row-Level Security**
  and an invitation-based sharing model.
- **Muse API** (`supabase/functions/muse/`) — one scoped edge function the AI
  coach calls; runs as the user so RLS limits it to that user's data.

## Prerequisites

- Node 18+ (tested on 20)
- A free [Supabase](https://supabase.com) project
- For phone builds: the [Expo Go](https://expo.dev/go) app, or an
  [EAS](https://docs.expo.dev/eas/) dev build (required later for scale/health sync)

## Setup

### 1. Install dependencies

```powershell
npm install
```

### 2. Create your Supabase project

1. Create a new project at supabase.com (free tier is enough for two users).
2. In the SQL editor, run the migrations **in order**:
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_rls.sql`
3. In **Authentication → Providers**, keep Email enabled. For quick testing you
   can disable "Confirm email" so sign-ups log in immediately.

### 3. Configure environment

```powershell
Copy-Item .env.example .env
```

Fill in `.env` from **Supabase → Settings → API**:

```
EXPO_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
```

### 4. Run the app

```powershell
npm run web      # browser
npm start        # then press i / a, or scan the QR with Expo Go
```

Create an account, open **Profile** to set height/sex/goal, log a weigh-in on
**Body**, add some food on **Food**, then tap **Recalculate target** on **Coach**.

## Deploy the Muse coach API (optional, for AI integration)

Using the [Supabase CLI](https://supabase.com/docs/guides/cli):

```powershell
supabase login
supabase link --project-ref YOUR-PROJECT-ref
supabase functions deploy muse
```

Muse (or any client) calls it as the signed-in user:

```
POST https://YOUR-PROJECT-ref.supabase.co/functions/v1/muse
Authorization: Bearer <the user's Supabase access token>
Content-Type: application/json

{ "action": "summary" }
```

Supported actions: `summary`, `set_target`, `log_weight`, `add_note`, `log_food`.
Because the function runs with the caller's token, Row-Level Security guarantees
each Muse account can only ever read/write **its own** user's data — the two
partners stay fully isolated.

## Scripts

| Command             | What it does                          |
| ------------------- | ------------------------------------- |
| `npm start`         | Start the Expo dev server             |
| `npm run web`       | Run in the browser                    |
| `npm run ios`       | Run on iOS (Mac/simulator or Expo Go) |
| `npm run android`   | Run on Android                        |
| `npm run typecheck` | Type-check with `tsc --noEmit`        |

## Project layout

```
app/                     Expo Router screens
  _layout.tsx            Root layout + auth gating
  sign-in.tsx            Auth screen
  (app)/                 Signed-in tabs: index, food, body, coach, profile
src/
  domain/                Pure logic (engine, targets, recipes, trends)
  data/                  Supabase queries + Open Food Facts
  lib/                   Supabase client, auth context, env, DB types
  ui/                    Theme + reusable components
supabase/
  migrations/            SQL schema + RLS
  functions/muse/        Scoped AI coach API (Deno edge function)
```

## Roadmap (next up)

See [PLAN.md](PLAN.md) for the full plan. Near-term:

- Recipe bulk-cook UI (domain logic already implemented)
- Health sync: Renpho → Apple Health / Health Connect (needs an EAS dev build)
- Camera barcode scanning (currently manual barcode entry)
- Muse Inbox processing UI, sharing/invitation UI, cycles UI
- Micronutrient surfacing and charts

## Attribution

Food data by barcode is provided by **Open Food Facts** and licensed under the
**Open Database License (ODbL)**.

## Disclaimer

Adonis provides general, evidence-based guidance only and is not medical advice.
Consult a qualified professional before significant changes to diet or training.
