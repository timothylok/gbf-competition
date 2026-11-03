import Link from 'next/link'
import { getT } from '@/lib/i18n'
import type { Competition } from '@/lib/types'

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
        <h1 className="text-2xl font-bold text-navy-900">{comp.name}</h1>
        <span className={`chip ${comp.status === 'live' ? 'bg-red-100 text-red-800' : 'bg-slate-200 text-slate-700'}`}>{t(statusKey)}</span>
      </div>
      <p className="mb-3 text-sm text-slate-600">
        {comp.event_date} · {comp.start_time} · {comp.courts} {t('courts')} · {comp.slot_minutes} min
      </p>
      <nav aria-label="Sections" className="flex gap-1 border-b border-slate-200">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={tab.key === active ? 'page' : undefined}
            className={`border-b-2 px-4 py-2 text-sm font-semibold ${tab.key === active ? 'border-accent text-navy-900' : 'border-transparent text-slate-500 hover:text-navy-900'}`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  )
}

