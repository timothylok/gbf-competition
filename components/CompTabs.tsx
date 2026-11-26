import Link from 'next/link'
import { getT } from '@/lib/i18n'
import type { Competition } from '@/lib/types'
import { EventLegend } from './MatchCard'

/** Competition heading plus Live / Schedule / Standings tabs for public pages. */
export function CompTabs({ comp, active }: { comp: Competition; active: 'live' | 'schedule' | 'standings' }) {
  const { t } = getT()
  const q = `?c=${comp.id}`
  const tabs = [
    { key: 'live', href: `/${q}`, label: t('navLive') },
    { key: 'schedule', href: `/schedule${q}`, label: t('navSchedule') },
    { key: 'standings', href: `/standings${q}`, label: t('navStandings') },
  ] as const
  const statusKey = comp.status === 'live' ? 'statusLive' : comp.status === 'finished' ? 'statusFinished' : 'statusDraft'
  return (
    <div className="mb-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold text-ink">{comp.name}</h1>
        <span className={comp.status === 'live' ? 'live-badge' : 'chip bg-mist text-ink'}>
          {comp.status === 'live' && <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-current" />}
          {t(statusKey)}
        </span>
      </div>
      <p className="mb-3 text-sm text-ink/75">
        {comp.event_date} · {comp.start_time} · {comp.courts} {t('courtsShort')} · {comp.slot_minutes} min
      </p>
      {/* Pill buttons: the open tab is solid dark with a yellow dot; the others look like buttons you can press. */}
      <nav aria-label="Sections" className="grid grid-cols-3 gap-2 sm:flex">
        {tabs.map((tab) => {
          const open = tab.key === active
          return (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={open ? 'page' : undefined}
              data-open={open ? 'true' : 'false'}
              className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl border-2 px-4 py-2 text-sm font-bold transition-colors sm:min-w-[8.5rem] ${
                open ? 'border-ink bg-ink text-paper shadow-md' : 'border-mist bg-paper text-ink hover:border-ink hover:bg-cloud'
              }`}
            >
              {open && <span aria-hidden className="h-2 w-2 rounded-full bg-sun" />}
              {tab.label}
            </Link>
          )
        })}
      </nav>
      <div className="mt-3"><EventLegend /></div>
    </div>
  )
}

