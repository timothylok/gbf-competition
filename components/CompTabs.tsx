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
      <nav aria-label="Sections" className="flex gap-1 border-b border-mist">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={tab.key === active ? 'page' : undefined}
            className={`border-b-2 px-4 py-2 text-sm font-semibold ${tab.key === active ? 'border-sun text-ink' : 'border-transparent text-ink/75 hover:text-ink'}`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <div className="mt-3"><EventLegend /></div>
    </div>
  )
}

