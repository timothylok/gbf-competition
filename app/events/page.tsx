import type { Metadata } from 'next'
import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { getT } from '@/lib/i18n'
import { listCompetitions } from '@/lib/queries'

export const metadata: Metadata = { title: 'Past events' }

export default async function EventsPage() {
  const { t } = getT()
  const comps = await listCompetitions(!!(await getSession()))
  return (
    <>
      <h1 className="mb-4 text-2xl font-bold text-navy-900">{t('navEvents')}</h1>
      {comps.length === 0 && <p className="card text-slate-600">{t('noEvent')}</p>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {comps.map((c) => (
          <li key={c.id}>
            <Link href={`/?c=${c.id}`} className="card block hover:border-accent">
              <span className="block font-bold text-navy-900">{c.name}</span>
              <span className="text-sm text-slate-600">{c.event_date} · {t(c.status === 'live' ? 'statusLive' : c.status === 'finished' ? 'statusFinished' : 'statusDraft')}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
