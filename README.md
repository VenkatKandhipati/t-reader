# Kathalu — Telugu Reading Practice

Static reader + FastAPI backend + Supabase auth/DB. Works anonymously
(localStorage only) or signed-in (synced across devices, true SM-2 spaced
repetition backed by Postgres).

```
t-reader/
├── index.html            # reader
├── library.html          # bookshelf
├── flashcard.html        # SM-2 review
├── stories.js            # story content
├── js/
│   ├── config.js         # Supabase URL + anon key + API base
│   ├── storage.js        # local ⇄ cloud storage facade
│   ├── sync.js           # write-through sync (auto-loads)
│   └── auth-ui.js        # login/signup modal
└── backend/
    ├── app/              # FastAPI service
    ├── supabase/schema.sql
    ├── fly.toml
    └── Dockerfile
```

## Setup (~15 min)

### 1. Supabase
Create project `kathalu` at https://supabase.com (region us-east-1). Run
`backend/supabase/schema.sql`. Turn **off** "Confirm email" under
Authentication → Providers → Email.

### 2. Backend on Fly.io
```bash
cd backend
fly launch --no-deploy
fly secrets set \
  DATABASE_URL="postgresql+asyncpg://postgres.<ref>:<pw>@aws-0-us-east-1.pooler.supabase.com:6543/postgres" \
  SUPABASE_JWT_SECRET="<jwt-secret>" \
  CORS_ORIGINS="https://kathalu.pages.dev,http://localhost:8000"
fly deploy
```

### 3. Frontend config
Edit `js/config.js` with your Supabase URL, anon key, and Fly URL.

### 4. Cloudflare Pages
Connect this repo. Build command: *(none)*. Output dir: *root*.

## Running locally

**Frontend:** any static server from repo root.
```bash
python -m http.server 8000
```
Open http://localhost:8000/library.html.

**Backend:** see `backend/README.md`.

## Auth model

Supabase owns signup/login. The frontend uses `supabase-js` directly for auth
and stores its JWT in localStorage. Every API call to FastAPI includes
`Authorization: Bearer <jwt>`; FastAPI verifies HS256 against
`SUPABASE_JWT_SECRET` and pulls `user_id` from `sub`.

"Username-only" is implemented by mapping `username → username@kathalu.local`
under the hood — no email delivery, no password reset flow. Swap in email or
OAuth later by flipping dashboard toggles; backend stays unchanged.

## Sync model

Pages still use `localStorage` synchronously — nothing in the original reader
logic changed. `js/sync.js` adds a write-through layer:

1. On sign-in: import any existing local data once, then overwrite local with
   cloud state.
2. Subsequent `localStorage.setItem("vocabCards" | "storyProgress" |
   "readingDates", …)` writes are mirrored to the API in the background.
3. Signed-out users work offline exactly as before.

## Cost

- Supabase free tier: DB + Auth
- Fly.io: ~$0–2/mo with `auto_stop_machines = "stop"`
- Cloudflare Pages: free, unlimited
