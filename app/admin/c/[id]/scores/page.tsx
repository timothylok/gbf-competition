import { notFound } from 'next/navigation'
import { Banner } from '@/components/Banner'
import { requireAdmin } from '@/lib/auth'
import { scoreMatch } from '@/lib/actions'
import { getT, type T } from '@/lib/i18n'
import { getCompetition, getMatches, getPlayers } from '@/lib/queries'
import { roundTime } from '@/lib/time'
import type { Match } from '@/lib/types'

function ScoreCard({ m, comp, nm, t, round }: { m: Match; comp: number; nm: (i: number) => string; t: T; round: number }) {
  const locked = m.status === 'done' || m.status === 'cancelled'
  return (
    <form action={scoreMatch} className="card">
      <input type="hidden" name="id" value={m.id} />
      <input type="hidden" name="comp" value={comp} />
      <input type="hidden" name="version" value={m.version} />
      <input type="hidden" name="r" value={round} />
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
        <span>{t('court')} {m.court}</span>
        <span>{t(m.event)}</span>
        <span className={`chip ml-auto ${m.status === 'live' ? 'bg-red-100 text-red-800' : m.status === 'done' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
          {t(m.status === 'live' ? 'mLive' : m.status === 'done' ? 'mDone' : m.status === 'cancelled' ? 'mCancelled' : 'mScheduled')}
        </span>
      </div>
      <div className="grid grid-cols-[1fr_4rem_4rem_1fr] items-center gap-2">
        <span className="text-right text-sm font-medium">{nm(m.a1)}<br />{nm(m.a2)}</span>
        <input name="score_a" type="number" inputMode="numeric" min={0} max={99} aria-label={t('sideA')} defaultValue={m.score_a ?? ''} className="input !px-1 text-center text-xl font-bold tabular-nums" />
        <input name="score_b" type="number" inputMode="numeric" min={0} max={99} aria-label={t('sideB')} defaultValue={m.score_b ?? ''} className="input !px-1 text-center text-xl font-bold tabular-nums" />
        <span className="text-sm font-medium">{nm(m.b1)}<br />{nm(m.b2)}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {!locked && <button name="intent" value="live" formNoValidate className="btn-ghost">{t('startMatch')}</button>}
        {!locked && <button name="intent" value="done" className="btn-accent">{t('saveFinal')}</button>}
        {m.status !== 'scheduled' && <button name="intent" value="reset" formNoValidate className="btn-ghost">{t('clearScore')}</button>}
        {!locked && <button name="intent" value="cancel" formNoValidate className="btn-ghost text-red-700">{t('cancelMatch')}</button>}
      </div>
    </form>
  )
}

export default async function ScoresPage({ params, searchParams }: { params: { id: string }; searchParams: { ok?: string; err?: string } }) {
  await requireAdmin()
  const { t } = getT()
  const id = Number(params.id)
  const comp = await getCompetition(id)
  if (!comp) notFound()
  const [players, matches] = await Promise.all([getPlayers(id), getMatches(id)])
  const names = new Map(players.map((p) => [p.id, p.nickname]))
  const nm = (i: number) => names.get(i) ?? '?'

  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b)
  const isOpen = (r: number) => matches.some((m) => m.round === r && (m.status === 'scheduled' || m.status === 'live'))
  const open = rounds.filter(isOpen)
  const closed = rounds.filter((r) => !isOpen(r))

  const Round = ({ r }: { r: number }) => (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
        {t('round')} {r} · {roundTime(comp.start_time, comp.slot_minutes, r)}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {matches.filter((m) => m.round === r).map((m) => <ScoreCard key={m.id} m={m} comp={id} nm={nm} t={t} round={r} />)}
      </div>
    </section>
  )

  return (
    <>
      <Banner ok={searchParams.ok} err={searchParams.err} />
      {rounds.length === 0 && <p className="text-sm text-slate-500">{t('noMatches')}</p>}
      {open.map((r) => <Round key={r} r={r} />)}
      {closed.length > 0 && (
        <details className="mt-6">
          <summary className="mb-3 cursor-pointer font-bold text-navy-900">{t('completedRounds')} ({closed.length})</summary>
          {closed.map((r) => <Round key={r} r={r} />)}
        </details>
      )}
    </>
  )
}
