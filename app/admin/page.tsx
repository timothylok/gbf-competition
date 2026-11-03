import Link from 'next/link'
import { Banner } from '@/components/Banner'
import { requireAdmin } from '@/lib/auth'
import { createCompetition } from '@/lib/actions'
import { getT } from '@/lib/i18n'
import { listCompetitions } from '@/lib/queries'

export default async function AdminHome({ searchParams }: { searchParams: { ok?: string; err?: string } }) {
  await requireAdmin()
  const { t } = getT()
  const comps = await listCompetitions(true)
  return (
    <>
      <Banner ok={searchParams.ok} err={searchParams.err} />
      <h1 className="mb-3 text-xl font-bold text-navy-900">{t('competitions')}</h1>
      <ul className="mb-8 grid gap-3 sm:grid-cols-2">
        {comps.map((c) => (
          <li key={c.id}>
            <Link href={`/admin/c/${c.id}`} className="card block hover:border-accent">
              <span className="block font-bold text-navy-900">{c.name}</span>
              <span className="text-sm text-slate-600">{c.event_date} · {t(c.status === 'live' ? 'statusLive' : c.status === 'finished' ? 'statusFinished' : 'statusDraft')}</span>
            </Link>
          </li>
        ))}
      </ul>

      <section className="card">
        <h2 className="mb-3 font-bold text-navy-900">{t('newCompetition')}</h2>
        <form action={createCompetition} className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="name" className="label">{t('name')}</label>
            <input id="name" name="name" className="input" required maxLength={80} defaultValue="GBF Casual Competition" />
          </div>
          <div>
            <label htmlFor="event_date" className="label">{t('date')}</label>
            <input id="event_date" name="event_date" type="date" className="input" required defaultValue="2026-11-28" />
          </div>
          <div>
            <label htmlFor="start_time" className="label">{t('startTime')}</label>
            <input id="start_time" name="start_time" type="time" className="input" required defaultValue="09:00" />
          </div>
          <div>
            <label htmlFor="courts" className="label">{t('courts')}</label>
            <input id="courts" name="courts" type="number" min={1} max={20} className="input" required defaultValue={5} />
          </div>
          <div>
            <label htmlFor="slot_minutes" className="label">{t('slotMinutes')}</label>
            <input id="slot_minutes" name="slot_minutes" type="number" min={5} max={60} className="input" required defaultValue={15} />
          </div>
          <div className="sm:col-span-2"><button className="btn-accent">{t('create')}</button></div>
        </form>
      </section>
    </>
  )
}
