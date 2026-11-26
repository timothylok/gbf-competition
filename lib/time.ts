/** Nothing is played in the first 15 minutes: warm-up on every court. Round 1 starts after it. */
export const WARMUP_MINUTES = 15

/** Default time limit: a competition must finish within this many hours of its start time. */
export const DEFAULT_HOURS = 5

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
const toHHMM = (total: number) => `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`

/** Minutes from the start time to the latest finish: the set end time, or the default hours when none is set. */
export function limitMinutes(c: { start_time: string; end_time?: string | null }): number {
  return c.end_time ? toMinutes(c.end_time) - toMinutes(c.start_time) : DEFAULT_HOURS * 60
}

/** The latest finish time shown on screen (the set end time, or start + the default hours). */
export function endTimeOf(c: { start_time: string; end_time?: string | null }): string {
  return c.end_time ?? toHHMM(toMinutes(c.start_time) + DEFAULT_HOURS * 60)
}

/** How many rounds fit in `minutes` minutes from the start time, after the warm-up. */
export function roundsIn(minutes: number, slotMinutes: number): number {
  return Math.max(0, Math.floor((minutes - WARMUP_MINUTES) / slotMinutes))
}

/** How many rounds fit before the latest finish. */
export function maxRoundsFor(c: { start_time: string; slot_minutes: number; end_time?: string | null }): number {
  return roundsIn(limitMinutes(c), c.slot_minutes)
}

/** How many rounds fit in `hours` hours. */
export function maxRounds(slotMinutes: number, hours: number = DEFAULT_HOURS): number {
  return roundsIn(hours * 60, slotMinutes)
}

/** The warm-up slot, e.g. ("09:00") -> "09:00–09:15". */
export function warmupRange(start: string): string {
  return `${toHHMM(toMinutes(start))}–${toHHMM(toMinutes(start) + WARMUP_MINUTES)}`
}

/** Start and end of a round, e.g. ("09:00", 15, 1) -> "09:15–09:30". Matches end when their slot ends. */
export function roundRange(start: string, slotMinutes: number, round: number): string {
  return `${roundTime(start, slotMinutes, round)}–${roundTime(start, slotMinutes, round + 1)}`
}

/** Start time of a 1-based round, after the warm-up, e.g. ("09:00", 15, 3) -> "09:45". */
export function roundTime(start: string, slotMinutes: number, round: number): string {
  return toHHMM(toMinutes(start) + WARMUP_MINUTES + (round - 1) * slotMinutes)
}
