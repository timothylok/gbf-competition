/** "27 Nov 2026, 14:05 NZDT": a moment shown in New Zealand time (NZDT in summer, NZST in winter), whatever the server's own zone is. */
export function nzTimestamp(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-NZ', {
    timeZone: 'Pacific/Auckland',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  }).formatToParts(date)
  return parts.map((p) => p.value).join('')
}

/** "Schedule generated: 27 Nov 2026, 14:05 NZDT", or '' when the schedule has no recorded generation time. */
export function generatedLine(t: (k: 'scheduleGenerated') => string, at: Date | string | null | undefined): string {
  if (!at) return ''
  const d = new Date(at)
  return Number.isNaN(d.getTime()) ? '' : `${t('scheduleGenerated')} ${nzTimestamp(d)}`
}

/** The "Printed ..." line for the PDF and the team image, e.g. "Printed 27 Nov 2026, 14:05 NZDT (New Zealand time)". */
export function printedLine(t: (k: 'printedAt' | 'nzTime') => string, date: Date = new Date()): string {
  return `${t('printedAt')} ${nzTimestamp(date)} (${t('nzTime')})`
}
