import type { Metadata } from 'next'
import Link from 'next/link'
import { PrintButton } from '@/components/PrintButton'
import { getT } from '@/lib/i18n'
import { loadPublic } from '@/lib/public'
import { scheduleGroups } from '@/lib/schedule-groups'

export const metadata: Metadata = { title: 'Print schedule' }

/** Plain, printable schedule. Players are shown as "nickname - (G)" with G the grade letter. */
export default async function PrintSchedule({ searchParams }: { searchParams: { c?: string; by?: string } }) {
  const { t } = getT()
  const data = await loadPublic(searchParams.c)
  if (!data) return <p className="card text-ink/75">{t('noEvent')}</p>
  const { comp, players, matches } = data
  const by = searchParams.by === 'court' ? 'court' : 'time'
  const groups = scheduleGroups(comp, players, matches, by, t)
  const q = `?c=${comp.id}`

  const toggle = (key: 'time' | 'court', label: string) => (
    <Link
      href={`/schedule/print${q}&by=${key}`}
      aria-current={by === key ? 'true' : undefined}
      className={`rounded-lg border px-4 py-2 text-sm font-semibold ${by === key ? 'border-ink bg-sun text-ink' : 'border-mist text-ink hover:bg-mist/40'}`}
    >
      {label}
    </Link>
  )

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Link href={`/schedule${q}`} className="btn-ghost" data-testid="back">← {t('back')}</Link>
        {toggle('time', t('textByTime'))}
        {toggle('court', t('textByCourt'))}
        <span className="ml-auto"><PrintButton label={t('print')} /></span>
      </div>

      <h1 className="text-xl font-bold text-ink">{comp.name}</h1>
      <p className="mb-4 text-sm text-ink">
        {comp.event_date} · {comp.start_time} · {comp.courts} {t('courtsShort')} · {comp.slot_minutes} min
      </p>
      {groups.every((g) => g.rows.every((r) => r.warmup)) && <p className="text-sm text-ink">{t('noMatches')}</p>}
      {groups.map((g) => g.rows.length === 0 ? (
        <section key={g.title} className="mb-5 break-inside-avoid" data-testid="warmup">
          <h2 className="mb-1 text-base font-bold text-ink">{g.title}</h2>
        </section>
      ) : (
        <section key={g.title} className="mb-5 break-inside-avoid">
          <h2 className="mb-1 text-base font-bold text-ink">{g.title}</h2>
          <table className="w-full border-collapse text-left text-sm text-ink">
            <caption className="sr-only">{g.title}</caption>
            <thead>
              <tr className="border-b-2 border-ink">
                <th scope="col" className="py-1 pr-3">{by === 'court' ? t('textTime') : t('court')}</th>
                <th scope="col" className="py-1 pr-3">{t('event')}</th>
                <th scope="col" className="py-1 pr-3">{t('sideA')}</th>
                <th scope="col" className="py-1">{t('sideB')}</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r) => r.warmup ? (
                <tr key={`warmup-${r.court}`} className="warmup-row border-b border-ink/20 align-top">
                  <td className="whitespace-nowrap py-1 pr-3">{r.when}</td>
                  <td className="py-1 font-semibold" colSpan={3}>{r.kind}</td>
                </tr>
              ) : (
                <tr key={`${r.round}-${r.court}`} className="border-b border-mist align-top">
                  <td className="whitespace-nowrap py-1 pr-3">{by === 'court' ? r.when : r.courtLabel}</td>
                  <td className="py-1 pr-3">{r.kind}</td>
                  <td className="py-1 pr-3">{r.sideA}{r.note && <span className="block text-xs font-semibold">{r.note}</span>}</td>
                  <td className="py-1">{r.sideB}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </>
  )
}
