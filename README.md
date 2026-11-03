# GBF Competition

Match schedule, live scores and standings for Grand Badminton Family casual competitions.
Public visitors only view. Admins sign in with a shared password to manage players, the draw and scores.

- Next.js 14 (App Router) · TypeScript · Tailwind · Postgres (Neon free tier) · deploys to Vercel Hobby
- English and 繁體中文 (toggle in the header)
- Scoring: win 2, draw 1, loss 0; ties broken by points difference, then points scored. Matches are time-limited, so draws are possible.

## Local development

```bash
npm install
cp .env.example .env.local      # then fill in ADMIN_PASSWORD and SESSION_SECRET
npm run dev                     # http://localhost:3000
npm test                        # scheduler + standings logic tests
```

With `DATABASE_URL` empty, local dev uses an embedded database in `.pglite/` (git-ignored), so no account is needed.
That fallback is disabled in production builds.

## Deploy to Vercel (free)

1. **Import** this GitHub repo at vercel.com/new (Hobby plan).
2. **Add a database:** Project → Storage → Marketplace → **Neon** (free). This sets `DATABASE_URL` automatically.
   The tables are created on first use, so there is no migration step.
3. **Set environment variables** (Project → Settings → Environment Variables, Production):
   | Name | Value |
   |---|---|
   | `ADMIN_PASSWORD` | the shared admin password, 8+ characters. Tick **Sensitive**. |
   | `SESSION_SECRET` | 32+ random characters: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
4. **Deploy.** Then sign in at `/admin`.

### Changing the admin password
Edit `ADMIN_PASSWORD` in Vercel → **redeploy** (Deployments → ⋯ → Redeploy). Vercel only applies env changes to new
deployments. Everyone is signed out automatically, because sessions are tied to the current password.
Rotating `SESSION_SECRET` also signs everyone out.

Prefer not to keep the password in plain text? Set `ADMIN_PASSWORD_HASH_B64` instead (generate with
`npm run hash-password -- "password"`) and leave `ADMIN_PASSWORD` unset.

## Running the event

1. **Admin → New competition** (date, start time, courts, minutes per match). It starts as *Draft*, which is hidden from the public.
2. **Players tab:** paste one per line as `nickname, M or F, optional grade` (grade 1 = strongest). Use nicknames, since they are shown publicly.
3. **Schedule tab:** check the plan preview, then **Generate**. Change the draw number for a different draw.
   Edit any match (players, court, round), add matches by hand, or regenerate until play starts.
   Amber badges warn about a clash (same player or court twice in a round) or a line-up that doesn't fit the event.
4. On the **Overview** tab set status to **Live** to publish it.
5. **Scores tab** (built for phones): *Start* marks a match live (optional running score), *Save final* records the result.
   *Reset* undoes a result. Open rounds are listed first.
6. Set **Finished** afterwards; it stays viewable under *Past events*.

Women play mixed doubles only, so the men's/mixed split follows your gender ratio. The scheduler never repeats a
partner if it can avoid it, and avoids back-to-back games.

## Security notes

- Admin pages and **every** admin server action re-check the session; middleware is only a first gate.
- Session: signed JWT in an `httpOnly`, `Secure`, `SameSite=Strict` cookie, 12-hour expiry.
- Login rate limit: 5 failures per IP and 40 total per 15 minutes, tracked in the database.
- Password comparison is constant-time; all input is validated with Zod; all SQL is parameterised.
- Security headers (CSP, HSTS, frame-ancestors none, nosniff) are set in `next.config.mjs`.
- Edits to a match are versioned, so two admins can't silently overwrite each other's score.
- Every admin action is written to the audit log (name typed at sign-in + action).
- The repo is public, so keep secrets only in Vercel. `.env*` files are git-ignored.
- Optional hardening: Vercel → Firewall → add a rate-limit rule on `/admin/login`.
