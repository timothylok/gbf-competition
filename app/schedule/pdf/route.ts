import { getT } from '@/lib/i18n'
import { loadPublic } from '@/lib/public'
import { scheduleGroups } from '@/lib/schedule-groups'
import { buildSchedulePdf } from '@/lib/schedule-pdf'

export const dynamic = 'force-dynamic'

/**
 * The schedule as a PDF (the "Print schedule" button opens it). Same visibility as the public pages: a draft
 * competition is only available to a signed-in admin. ?by=court (default, one court per page) or ?by=time.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const by = url.searchParams.get('by') === 'time' ? 'time' : 'court'
  const data = await loadPublic(url.searchParams.get('c') ?? undefined)
  if (!data) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })

  const { t } = getT()
  const { comp, players, matches } = data
  const groups = scheduleGroups(comp, players, matches, by, t)
  const bytes = await buildSchedulePdf({ comp, groups, by, t, year: new Date().getFullYear() })

  const ascii = `GBF-schedule-${comp.event_date}.pdf`
  const full = encodeURIComponent(`${comp.name} ${comp.event_date} - Schedule.pdf`)
  // Uint8Array is a valid body at runtime; the cast only settles a TypeScript lib mismatch.
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      // Opens in the browser tab (so Back returns to the portal); the browser's save button uses this name.
      'Content-Disposition': `inline; filename="${ascii}"; filename*=UTF-8''${full}`,
      'Cache-Control': 'no-store',
    },
  })
}
