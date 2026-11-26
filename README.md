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
2. **Players tab:** paste one per line as `nickname, M or F, optional grade` (grade A = strongest, then B, C, D). Use nicknames, since they are shown publicly.
3. **Schedule tab:** check the plan preview, then **Generate**. Change the draw number for a different draw.
   Set the most games per player (default 6) and the time limit in hours. The draw stops at the competition end time, so a
   short day gives some players fewer games instead of a late finish.
   Edit any match (players, court, round), add matches by hand, or regenerate until play starts.
   Amber badges warn about a clash (same player or court twice in a round) or a line-up that doesn't fit the event.
4. On the **Overview** tab set status to **Live** to publish it.
5. **Scores tab** (built for phones): *Start* marks a match live (optional running score), *Save final* records the result.
   *Reset* undoes a result. Open rounds are listed first.
6. Set **Finished** afterwards; it stays viewable under *Past events*.

### How the draw works

Full rules are in `docs/game-rules.md`. In short:

1. **Teams.** Nicknames ending in `-F` are the Philippines team; every match is Philippines against the rest (two players
   from one team on each side). The larger team plays a few same-team filler matches so its players can reach the maximum too.
   With no `-F` nicknames there are no teams and anyone can play anyone.
2. **Same type, same grade.** Both sides are the same type (men's, women's or mixed doubles) and all four players are within
   one grade of each other (same grade preferred). When types cannot match, two women may play two men with a head start
   (handicap: 4 points at the same grade, 6 when one grade lower), which is shown on the match; the scorekeeper includes it
   when entering the score.
3. **At most 6 games per player** (the "Most games per player" field, 15 minutes each). The draw gives everyone as close to
   the maximum as the rules allow, within the time limit (the end time and the "Time limit (hours)" field).
4. **Pairing rules** (Overview tab, per competition) say who never partners whom and which pairs must partner once; the draw never
   breaks them (see `docs/game-rules.md`).
5. In each round men's doubles use the lower court numbers. No player is in two matches in a round, partners and opponents
   are not repeated if it can be avoided, and players who just sat out are preferred. Players ticked **Happy to partner D grade**
   are preferred as partners for D grades.

If the time is too short for everyone to reach the maximum, the draw is still made and some players get fewer games; the
Schedule tab says so. The plan line on the Schedule tab is a quick upper bound ("up to N matches"); the real draw can be a little lower.

No match is played in the first 15 minutes (warm-up on every court, shown on the schedule), so round 1 starts at 09:15 for a
09:00 start, and 19 rounds fit in the default 5 hours.

Example (5 courts, 15-minute matches, 6 games each, 09:00 start):

| Philippines / Rest | Matches (cross-team + filler) | Rounds | Finish |
|---|---|---|---|
| 21 / 25 | 63 + 6 = 69 | 14 | 12:45 |
| 26 / 25 | 75 + 1 = 76 | 16 | 13:15 |
| no teams, 64 players | up to 96 (95 fit in 19 rounds) | 19 to 20 | 14:00 to 14:15 |

## Schedule PDF

The **Print schedule (PDF)** button (Live and Schedule pages, and the admin Copy text tab) opens the schedule as an A4 PDF in the
same tab, so the browser's Back button returns to the portal: one court per page (or `?by=time` for one round after another),
coloured event chips, each player with a grade badge, the warm-up row, head start notes, and the rights footer on every page.
It is built on the server (`app/schedule/pdf/route.ts`, `lib/schedule-pdf.ts` with pdf-lib), follows the same visibility as the
public pages (a draft is for admins only) and the language switch, and takes well under a second. The old `/schedule/print`
address redirects to it. Fonts are Noto Sans SC (SIL OFL) in `assets/fonts/`, so Chinese nicknames print; each PDF embeds only the
characters it uses. If you add Chinese text to `lib/i18n.ts`, a unit test tells you to rebuild the fonts with `scripts/make-pdf-font.py`.

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
- **One admin at a time, newest sign-in wins.** A single database lock holds the signed-in admin. When someone signs in with
  the right password, whoever was signed in is signed out: their next click sends them to the login page with a notice, and
  the audit log records who was signed out. A session also ends after 20 minutes without activity (set `ADMIN_IDLE_MINUTES`
  to change), on sign-out, or when the password is changed. Only the password check lets anyone take over, and it is rate limited.
- Login rate limit: 5 failures per IP and 40 total per 15 minutes, tracked in the database.
- Password comparison is constant-time; all input is validated with Zod; all SQL is parameterised.
- Security headers (CSP, HSTS, frame-ancestors none, nosniff) are set in `next.config.mjs`.
- Edits to a match are versioned, so two admins can't silently overwrite each other's score.
- Every admin action is written to the audit log (name typed at sign-in + action).
- The repo is public, so keep secrets only in Vercel. `.env*` files are git-ignored.
- Optional hardening: Vercel → Firewall → add a rate-limit rule on `/admin/login`.
