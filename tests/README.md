# Tests

```bash
npm test          # unit tests, about 3 seconds
npm run test:e2e  # end-to-end tests, about 15 minutes (drives a real Chrome)
npm run test:all  # both
npm run test:e2e -- draw   # only e2e files whose name contains "draw"
```

Needs Chrome or Chromium installed (set `CHROME_PATH` if it is not in a standard location).

## Unit (`tests/unit`)

| File | Covers |
|---|---|
| `scheduler.test.ts` | Draw rules: Philippines (-F) vs the rest, same type and grade (within one), handicap fallback, filler for the larger team, at most 6 games, no clashes, time-limit stop, reproducible seeds, hand-made line-up warnings |
| `pairing-rules.test.ts` | The rules box: parsing and error lines, names and groups, ambiguous names, required pairs, the draw obeying rules, hand-made warnings |
| `handicap.test.ts` | Head start rules (4 / 6 / half), women's doubles and handicap kinds |
| `time.test.ts` | Round start/end times, the end time and the rounds that fit before it |
| `standings.test.ts` | Win 2 / draw 1 / loss 0, tiebreaks, shared ranks, per-event tables, round times |
| `lock.test.ts` | The single-admin lock on a real in-memory Postgres: blocking, release, idle expiry, password change, simultaneous logins |
| `players-parse.test.ts` | Pasting a player list: genders (including 男/女), grades (letters A-I or digits), duplicates, bad lines, control characters |
| `i18n.test.ts` | English and Hong Kong Chinese have the same keys and placeholders, real translations, Hong Kong wording |
| `colors.test.ts` | Pantone-only palette (no other colour classes or hex values) and WCAG AA contrast for every text/background pair, including over the glass colour fields |

## End to end (`tests/e2e`)

`run.ts` starts a **throwaway copy of the app for each test file** (own port, own embedded database, own build folder,
random secrets) and stops it afterwards, so the login lockout and single-admin lock in one file cannot affect another.
`DATABASE_URL` is forced empty, so these tests can never touch a real database.

| File | Covers |
|---|---|
| `security.test.ts` | Security headers, admin redirects, forged / unsigned tokens, noindex, 404s, no source or secrets served |
| `admin-paths.test.ts` | Players, matches (edit, clash and line-up warnings, add, delete), scores (final, live, reset, cancel, stale edits, finished-match lock), competitions (status, validation, delete confirmation), audit log |
| `draw.test.ts` | 64 players, no teams: plan preview, at most 6 games, grades within one, a tight time limit gives fewer games, regenerate rules |
| `rules.test.ts` | Philippines vs the rest roster: teams, filler, same type and grade, head start, partner flag, end time, late-round refusal, hand-made warnings, pairing rules, Copy text, print page and print button |
| `public.test.ts` | What a logged-out visitor sees: drafts hidden, live board, finals and draws, standings and shared ranks, player pages, schedule filter, Hong Kong Chinese, XSS escaping |
| `single-admin.test.ts` | Only one admin at a time (two browsers), no leak of who is signed in |
| `idle-expiry.test.ts` | The lock frees itself after inactivity (3 seconds in this test) |
| `hash-login.test.ts` | Signing in with `ADMIN_PASSWORD_HASH_B64`; the plain password must fail |
| `lockout.test.ts` | Five wrong passwords lock the sign-in, even for the correct password; public pages stay up |
| `layout.test.ts` | 390px phone width (no sideways scroll, tap targets, header), Pantone colours as rendered, accessibility basics |

Tests drive the real admin screens, so they also act as a check that the forms work end to end.
