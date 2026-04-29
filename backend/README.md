# Kathalu API

FastAPI backend for the Kathalu Telugu reading app. Talks to Supabase
Postgres and verifies Supabase-issued JWTs.

## Local dev

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e .
cp .env.example .env   # then fill in DATABASE_URL + SUPABASE_JWT_SECRET
uvicorn app.main:app --reload
```

API docs: http://localhost:8000/docs

## Supabase setup

1. Create project `kathalu` at https://supabase.com (region: `us-east-1`).
2. SQL editor → paste `supabase/schema.sql` → run.
3. Authentication → Providers → Email: turn **OFF** "Confirm email" and keep
   "Enable email signups" **ON**. That lets users sign up with
   `username@kathalu.local` (no email delivery needed).
4. Project Settings → API:
   - `Project URL` → paste into `frontend/js/config.js` as `SUPABASE_URL`
   - `anon public` key → paste into `config.js` as `SUPABASE_ANON_KEY`
   - `JWT Secret` → set as `SUPABASE_JWT_SECRET` on Fly
5. Project Settings → Database → Connection string → "Transaction" pooler:
   - Copy, rewrite as `postgresql+asyncpg://...@...pooler.supabase.com:6543/postgres`
   - Set as `DATABASE_URL` on Fly.

## Deploy to Fly.io

```bash
brew install flyctl
fly auth signup            # or login
fly launch --no-deploy     # uses fly.toml; app name: kathalu, region: iad
fly secrets set \
  DATABASE_URL="postgresql+asyncpg://postgres.xxx:PWD@aws-0-us-east-1.pooler.supabase.com:6543/postgres" \
  SUPABASE_JWT_SECRET="eyJ..." \
  CORS_ORIGINS="https://kathalu.pages.dev,http://localhost:8000"
fly deploy
```

After deploy, the API is at `https://kathalu.fly.dev`.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET  | `/cards?due_only=` | List user's cards |
| POST | `/cards` | Upsert card (by telugu) |
| PATCH | `/cards/{id}` | Update trans/meaning |
| DELETE | `/cards/{id}` | Delete a card |
| POST | `/cards/{id}/rate` | Server-side SM-2 rating |
| POST | `/cards/state-sync` | Batch mirror of local SRS state |
| GET  | `/progress` | Story progress list |
| POST | `/progress` | Upsert best_pct for a story |
| POST | `/reading-days` | Record today as a reading day |
| GET  | `/streak` | Current streak + last read day |
| GET  | `/stats` | Totals (cards, due, reviews_30d) |
| POST | `/import` | Bulk import from localStorage |
| GET  | `/health` | Liveness probe |

## Schema

See [`supabase/schema.sql`](supabase/schema.sql). Four tables:
- `public.cards` — one row per user vocab word, with full SM-2 state.
- `public.reviews` — append-only audit log of every rating (quality, timestamp).
- `public.story_progress` — best proficiency % per user per story.
- `public.reading_days` — one row per (user, day) for streak calc.
