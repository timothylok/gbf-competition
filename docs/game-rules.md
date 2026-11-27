# Game rules

Rules for GBF casual competitions as the app runs them. Items marked **To confirm** are not set by the app, so the organisers decide them before the event.

## Teams

- Players whose nickname ends in **-F** are the Philippines team. Everyone else (including the `-RW` players) is "the rest".
- Every match is **Philippines against the rest**. Both players on a side come from the same team.
- The team with more players has spare games. Once the cross-team matches run out, that team plays a few **same-team filler** matches so its players can reach the maximum number of games too. The smaller team never plays filler.
- If nobody (or everybody) has a `-F` nickname, there are no teams and anyone can play anyone.

## Format

- **At most 6 games per player** (set on the Schedule tab; each match is 15 minutes, so 90 minutes of play). The draw gives everyone as close to the maximum as the rules allow.
- Doubles only. Both sides are the **same type**:
  - men vs men (men's doubles)
  - women vs women (women's doubles)
  - one man and one woman against one man and one woman (mixed doubles)
- When that is not possible, two women may play two men (**cross doubles**, with the starting score below). It is the last resort, mainly because the Philippines women outnumber the rest's women.
- **Cross doubles limit:** each player plays at most one cross doubles match. The draw keeps to this where it can; when the grade rules leave no other legal opponents, a player may get a second, and the schedule page lists every exception (player, count, rounds) and flags those matches. Full games come first.
- Several matches run at the same time, one per court. In each round men's doubles use the lower court numbers, then mixed, women's and cross doubles.

## Grades

- Grades run A (strongest), B, C, D and so on up to I.
- **All four players in a match must be within one grade of each other.** The draw prefers all four on the same grade, and uses "one grade apart" only when it has to. A B-grade and a D-grade player can never be in the same match.
- Players with no grade can play anyone.

## The draw

- No player is in two matches in the same round, and no court is used twice in a round.
- Partners and opponents are not repeated where it can be avoided, and players who just sat out are preferred for the next round.
- Some players are happy to partner D-grade players. Tick **Happy to partner D grade** for them on the Players tab, and the draw prefers them as partners for D-grade players.
- The draw is built to give as many players as possible their full games, then to use as few "one grade apart", cross doubles and filler matches as it can.
- Organisers can edit any match (players, court, round), add matches by hand, or regenerate the draw until play starts. A hand-made or edited match shows an amber warning if the players are more than one grade apart, if it breaks the team rule, or if the match type does not fit.

## Pairing rules (per competition)

Each competition has a **Pairing rules** box on its Overview tab. The rules are stored with that competition (never in the code), one per line; `#` starts a note.

```
# these two groups never partner each other
avoid: grade:D & team:F | grade:B & team:F
avoid: grade:D & team:F | Alex, Sam
avoid: Kim, Lee | grade:B & team:F
# these two play mixed doubles together at least once
pair: Kim & team:F + Jo & team:F
```

- **`avoid: <who> | <who>`**: no one in the first group is ever the partner (same side of the net) of anyone in the second. Opponents are not restricted.
- **`pair: <name> + <name>`**: the two partner at least once, in mixed doubles, so they must be one man and one woman of the same team. Each side is one player: a nickname, optionally with `& team:F` (no commas).
- **`<who>`** is a comma-separated list; a player matches if any item matches. An item is a nickname (a trailing `-F` or `-RW` is ignored, or write the exact nickname), `grade:B`, or `team:F` (nicknames ending `-F`) / `team:R` (everyone else). Join items with `&` when all must match, for example `grade:D & team:F`.
- A nickname that matches more than one player (for example `Alex` and `Alex-F`) is refused: write the exact nickname, or add `& team:F`. A nickname that matches nobody is only a warning.
- **Rules win over games.** The draw never breaks a rule; if the rules make a player's 6th game impossible, that player gets fewer games, and a required pair that cannot be made is reported. Rules are applied together with the grade rule (all four players within one grade), so `avoid: grade:D | grade:B` is already covered.
- Bad lines are saved but shown under the box with their line numbers, and the draw is refused until they are fixed.
- A hand-made or edited match with a forbidden pair on one side shows an amber **Breaks a pairing rule** warning. The Schedule tab lists the rules and ticks each required pair that is in the saved schedule.
- "Happy to partner D grade" stays a tick box on the Players tab (a preference, not a rule). Tick it again after pasting a player list, because the paste does not carry it.

## Warm-up, time limit and end time

- **No match is played in the first 15 minutes.** From the start time (for example 09:00 to 09:15) every court is for warm-up, and round 1 starts after it. The schedule shows the warm-up for all courts.
- Every competition has a start time and an **end time** (default start + 5 hours, warm-up included). The draw stops at the last round that ends by the end time, and by the "Time limit (hours)" on the Schedule tab, whichever is earlier. With a 09:00 start and 15-minute matches that is 19 rounds, the last ending at 14:00.
- If the time is too short for everyone to reach the maximum, the draw still goes ahead and some players get fewer games. The Schedule tab then says so.
- A hand-made or edited match in a round that would end after the end time is refused.
- The admin pages show each round's start, end and duration, and when the competition ends.

## Match length

- Every match is **time-limited** (set per event, for example 15 minutes). When time is up the score on the board is the result, so draws are possible.
- **To confirm:** points per game or points cap, if any, and who calls time when a match is still running.

## Scoring

| Result | Points |
|---|---|
| Win | 2 |
| Draw | 1 |
| Loss | 0 |

Standings are ranked by:

1. Competition points
2. Points difference (points scored minus points conceded)
3. Points scored

Players still level after that share a rank, shown as `T-n` (for example T-3).

## Starting score (handicap)

Every match has a starting score worked out from the gender and grade of all four players, whatever the match type:
men's, women's or mixed doubles, or sides of different types (men vs women, men vs mixed, women vs mixed).

**Player strength** (the men's figures already include 2 extra points for gender, counted once)

| Grade | Man | Woman |
|---|---|---|
| B | 14 | 6 |
| Upper C | 8 | 3 |
| C | 6 | 2 |
| D | 4 | 1 |

- Team strength = the two players' strengths added.
- Handicap = the difference between the teams, halved and rounded up to a whole number. The weaker team starts with it; the stronger starts at 0. Equal teams start 0 : 0.
- Example: man B + man B (28) against man C + man C (12) starts 0 : 8.
- Upper C players are named in the pairing rules (`upper:`). Grades outside B, C and D show "Start: to be confirmed".
- A handicap never makes a match allowed: B never meets D, and two C players (one of them Upper C) never play two D players.
- Every possible line-up and its starting score is listed in [handicap-matrix.md](handicap-matrix.md).

**How it counts**

- Starting points are part of the score. They count in the result, points scored and points difference like any other points.
- The app shows the starting score on every match (for example "Start 0 : 8", side A first) on the live, schedule, score-entry, copy-text and PDF screens. It does not add the points itself: the scorekeeper includes them when entering the score.
- Matches whose sides are different types appear as **Cross doubles** (coral); four women as **Women's doubles** (lilac). Both are stored as mixed doubles and counted under the Mixed tab of the standings.

## Results and disputes

- Only the scorekeeper (the admin) enters scores. A match is **Live** once started and **Final** once the result is saved.
- A saved result can be reset and re-entered by the scorekeeper if it was wrong.
- **To confirm:** how players raise a score query, and who has the final say on court (for example, the scorekeeper).

## On-court rules

**To confirm:** serving and service-line rules, line calls, let and fault calls, warm-up time, and what happens if a player is injured or absent. The organisers decide these.

## Fair play

- Players use nicknames, which are shown publicly. Every page shows each nickname with the grade letter, for example `Alex - (C)`.
- Every page carries the footer: all rights reserved by Grand Badminton Family, no information or data may be copied, used or published without its approval, and the credit "Developed by Tim Lok".
- Be on your court when your round is called, so the schedule stays on time.
