import { notFound } from 'next/navigation'
import { Banner } from '@/components/Banner'
import { requireAdmin } from '@/lib/auth'
import { deleteCompetition, updateCompetition } from '@/lib/actions'
import { getT } from '@/lib/i18n'
import { getCompetition, getMatches, getPlayers } from '@/lib/queries'
import { compileRules, parseRules } from '@/lib/pairing-rules'
import { endTimeOf, maxRoundsFor, roundTime } from '@/lib/time'

export default async function Overview({ params, searchParams }: { params: { id: string }; searchParams: { ok?: string; err?: string } }) {
  await requireAdmin()
  const { t } = getT()
  const c = await getCompetition(Number(params.id))
  if (!c) notFound()
  const [matches, players] = await Promise.all([getMatches(c.id), getPlayers(c.id)])
  const parsedRules = parseRules(c.pairing_rules)
  const compiled = compileRules(parsedRules, players)
  const errors = [...parsedRules.errors, ...compiled.problems]
  const rounds = matches.length ? Math.max(...matches.map((m) => m.round)) : 0
  return (
    <>
      <Banner ok={searchParams.ok} err={searchParams.err} />
      <p className="card mb-4 text-sm font-semibold text-ink" data-testid="comp-times">
        {t('compStarts')} {c.start_time} · {t('endTime')} {endTimeOf(c)}
        {rounds > 0
          ? ` · ${t('compEnds')} ${roundTime(c.start_time, c.slot_minutes, rounds + 1)} · ${rounds} ${t('planRounds')}${rounds > maxRoundsFor(c) ? ` · ⚠ ${t('afterEnd')}` : ''}`
          : ` · ${t('compNoSchedule')}`}
      </p>
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
          <label htmlFor="end_time" className="label">{t('endTime')}</label>
          <input id="end_time" name="end_time" type="time" className="input" required defaultValue={endTimeOf(c)} />
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
        <div className="sm:col-span-2">
          <label htmlFor="pairing_rules" className="label">{t('pairingRules')}</label>
          <p className="mb-1 text-xs text-ink/75">{t('pairingRulesHelp')}</p>
          <textarea id="pairing_rules" name="pairing_rules" rows={7} maxLength={4000} spellCheck={false} className="input font-mono text-sm" defaultValue={c.pairing_rules ?? ''} />
          {errors.length > 0 && (
            <div className="mt-2 rounded-lg border-2 border-berry bg-paper/60 px-3 py-2 text-sm text-ink" role="alert" data-testid="rule-problems">
              <p className="font-semibold">{t('ruleProblems')}</p>
              <ul className="list-disc pl-5">{errors.map((e, i) => <li key={`e${i}`}>{t('ruleLine')} {e.line}: {e.message}</li>)}</ul>
            </div>
          )}
          {errors.length === 0 && compiled.warnings.length > 0 && (
            <div className="mt-2 rounded-lg border border-sun bg-paper/60 px-3 py-2 text-sm text-ink" data-testid="rule-warnings">
              <p className="font-semibold">{t('ruleWarnings')}</p>
              <ul className="list-disc pl-5">{compiled.warnings.map((e, i) => <li key={`w${i}`}>{t('ruleLine')} {e.line}: {e.message}</li>)}</ul>
            </div>
          )}
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
