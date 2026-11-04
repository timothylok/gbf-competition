import { notFound } from 'next/navigation'
import { Banner } from '@/components/Banner'
import { requireAdmin } from '@/lib/auth'
import { deleteCompetition, updateCompetition } from '@/lib/actions'
import { getT } from '@/lib/i18n'
import { getCompetition } from '@/lib/queries'

export default async function Overview({ params, searchParams }: { params: { id: string }; searchParams: { ok?: string; err?: string } }) {
  await requireAdmin()
  const { t } = getT()
  const c = await getCompetition(Number(params.id))
  if (!c) notFound()
  return (
    <>
      <Banner ok={searchParams.ok} err={searchParams.err} />
      <form action={updateCompetition} className="card mb-8 grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="id" value={c.id} />
        <div className="sm:col-span-2">
          <label htmlFor="name" className="label">{t('name')}</label>
          <input id="name" name="name" className="input" required maxLength={80} defaultValue={c.name} />
        </div>
        <div>
          <label htmlFor="event_date" className="label">{t('date')}</label>
          <input id="event_date" name="event_date" type="date" className="input" required defaultValue={c.event_date} />
        </div>
        <div>
          <label htmlFor="start_time" className="label">{t('startTime')}</label>
          <input id="start_time" name="start_time" type="time" className="input" required defaultValue={c.start_time} />
        </div>
        <div>
          <label htmlFor="courts" className="label">{t('courts')}</label>
          <input id="courts" name="courts" type="number" min={1} max={20} className="input" required defaultValue={c.courts} />
        </div>
        <div>
          <label htmlFor="slot_minutes" className="label">{t('slotMinutes')}</label>
          <input id="slot_minutes" name="slot_minutes" type="number" min={5} max={60} className="input" required defaultValue={c.slot_minutes} />
        </div>
        <div>
          <label htmlFor="status" className="label">{t('status')}</label>
          <select id="status" name="status" className="input" defaultValue={c.status}>
            <option value="draft">{t('statusDraft')}</option>
            <option value="live">{t('statusLive')}</option>
            <option value="finished">{t('statusFinished')}</option>
          </select>
        </div>
        <div className="flex items-end"><button className="btn-accent">{t('save')}</button></div>
      </form>

      <form action={deleteCompetition} className="card border-berry/40">
        <h2 className="mb-1 font-bold text-berry">{t('dangerZone')}</h2>
        <p className="mb-3 text-sm text-ink/75">{t('dangerHelp')}</p>
        <input type="hidden" name="id" value={c.id} />
        <div className="flex gap-2">
          <input name="confirm" className="input" aria-label={t('name')} autoComplete="off" required />
          <button className="btn-danger">{t('delete')}</button>
        </div>
      </form>
    </>
  )
}
