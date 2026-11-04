# GBF Competition

Match schedule, live scores and standings for Grand Badminton Family casual competitions.
Public visitors only view. Admins sign in with a shared password to manage players, the draw and scores.

- Next.js 14 (App Router) · TypeScript · Tailwind · Postgres (Neon free tier) · deploys to Vercel Hobby
- English and 繁體中文 (Hong Kong, `zh-HK`; toggle in the header)
- Scoring: win 2, draw 1, loss 0; ties broken by points difference, then points scored. Matches are time-limited, so draws are possible.

## Local development

```bash
npm install
cp .env.example .env.local      # then fill in ADMIN_PASSWORD and SESSION_SECRET
npm run dev                     # http://localhost:3000
npm test                        # unit tests (about 3 s); see tests/README.md
npm run test:e2e                # end-to-end tests in a real Chrome (about 15 min)
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

Only one admin can be signed in at a time, so agree who keeps score. Always press **Sign out** when you hand over;
otherwise the next person waits until the 20-minute inactivity limit passes.

1. **Admin → New competition** (date, start time, courts, minutes per match). It starts as *Draft*, which is hidden from the public.
2. **Players tab:** paste one per line as `nickname, M or F, optional grade` (grade 1 = strongest). Use nicknames, since they are shown publicly.
3. **Schedule tab:** check the plan preview, then **Generate**. Change the draw number for a different draw.
   Set the games per man (men's doubles), games per woman (mixed doubles) and the time limit in hours; a draw that
   would run past the limit is refused.
   Edit any match (players, court, round), add matches by hand, or regenerate until play starts.
   Amber badges warn about a clash (same player or court twice in a round) or a line-up that doesn't fit the event.
4. On the **Overview** tab set status to **Live** to publish it.
5. **Scores tab** (built for phones): *Start* marks a match live (optional running score), *Save final* records the result.
   *Reset* undoes a result. Open rounds are listed first.
6. Set **Finished** afterwards; it stays viewable under *Past events*.

### How the draw works

Men's doubles come first, mixed doubles second:

1. Every man plays the set number of **men's doubles** games (default 4).
2. Every woman plays the set number of **mixed doubles** games (default 4). Women only play mixed.
3. Men fill the other two places in each mixed match as **extra games**, with no cap. The scheduler always picks the men
   with the fewest games, so extras are spread evenly (typically within 2 games of each other).
4. In each round men's doubles are placed first (lower court numbers), then mixed.
5. No player is in two matches in a round, partners are not repeated if it can be avoided, and players who just sat out
   are preferred for the next round. Optional grades (1 = strongest) are used to keep sides balanced.

Examples at 4 games each, 5 courts, 15-minute matches:

| Men / Women | Men's | Mixed | Matches | Rounds | Finish (from 09:00) | Games per man |
|---|---|---|---|---|---|---|
| 50 / 14 | 50 | 28 | 78 | 16 | 13:00 | 4 to 6 |
| 44 / 20 | 44 | 40 | 84 | 17 | 13:15 | 5 to 6 |
| 40 / 24 | 40 | 48 | 88 | 18 | 13:30 | 6 to 7 |
| 32 / 32 | 32 | 64 | 96 | 20 | 14:00 | 7 to 9 |

Note: the plan line on the Schedule tab always shows the defaults (4 games, 5 hours). The time limit you type in the form is
what is enforced when you press Generate.

## Design

- **Pantone palette only.** Men's doubles panels are PANTONE 2995 C (`#00A9E0`), mixed doubles are PANTONE 812 C (`#FF5FA2`,
  neon pink); live is Illuminating (13-0647), final is Greenery (15-0343), errors Viva Magenta (18-1750), text Black 6 C,
  backgrounds Cloud Dancer (11-4201) and Bright White (11-0601). Pantone publishes no official hex values, so
  `tailwind.config.ts` holds the widely used digital approximations. It *replaces* Tailwind's default colours, and `npm test`
  fails if any non-Pantone colour class or hex value appears. Both event colours are light, so text on them is always Black 6 C.
- **Glass style.** Panels, cards and tables use the frosted-glass recipe from css.glass (20% Bright White fill, 16px radius,
  soft shadow, 5px backdrop blur, 30% white border) over soft Pantone colour fields. Men's doubles panels have a blue header strip
  and wash, mixed doubles a pink one.
- Each match is a panel: coloured header (court, time, event), the two sides with large score boxes, and a status footer.
  The score-entry cards use the same layout with number inputs and big buttons for phones.
- Checked at 390px wide (no horizontal scroll on any page) and for WCAG AA text contrast.

## Security notes

- Admin pages and **every** admin server action re-check the session; middleware is only a first gate.
- Session: signed JWT in an `httpOnly`, `Secure`, `SameSite=Strict` cookie, 12-hour expiry.
- **One admin at a time.** A single database lock holds the signed-in admin. A second person who enters the right
  password is refused and told who is signed in. The lock frees when the admin signs out, after 20 minutes without
  activity (set `ADMIN_IDLE_MINUTES` to change), or when the password is changed. If the lock changes hands, the
  old session stops working on its next click. The password is checked first, so the holder's name is not revealed
  to anyone who doesn't know it.
- Login rate limit: 5 failures per IP and 40 total per 15 minutes, tracked in the database.
- Password comparison is constant-time; all input is validated with Zod; all SQL is parameterised.
- Security headers (CSP, HSTS, frame-ancestors none, nosniff) are set in `next.config.mjs`.
- Edits to a match are versioned, so two admins can't silently overwrite each other's score.
- Every admin action is written to the audit log (name typed at sign-in + action).
- The repo is public, so keep secrets only in Vercel. `.env*` files are git-ignored.
- Optional hardening: Vercel → Firewall → add a rate-limit rule on `/admin/login`.
