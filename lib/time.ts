/** Start time of a 1-based round, e.g. ("09:00", 15, 3) -> "09:30". */
export function roundTime(start: string, slotMinutes: number, round: number): string {
  const [h, m] = start.split(':').map(Number)
  const total = h * 60 + m + (round - 1) * slotMinutes
  const hh = Math.floor(total / 60) % 24
  return `${String(hh).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
