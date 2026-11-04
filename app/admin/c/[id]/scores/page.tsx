import { notFound } from 'next/navigation'
import { Banner } from '@/components/Banner'
import { requireAdmin } from '@/lib/auth'
import { scoreMatch } from '@/lib/actions'
import { getT, type T } from '@/lib/i18n'
import { getCompetition, getMatches, getPlayers } from '@/lib/queries'
import { roundTime } from '@/lib/time'
import { TONE } from '@/lib/event-tone'
import type { Match } from '@/lib/types'

function ScoreCard({ m, comp, nm, t, round, start }: { m: Match; comp: number; nm: (i: number) => string; t: T; round: number; start: string }) {
  const locked = m.status === 'done' || m.status === 'cancelled'
  const tone = TONE[m.event]
  const status =
    m.status === 'live'
      ? { label: t('mLive'), cls: 'bg-sun text-ink' }
      : m.status === 'done'
        ? { label: t('mDone'), cls: 'bg-leaf text-ink' }
        : m.status === 'cancelled'
          ? { label: t('mCancelled'), cls: 'bg-mist text-stone line-through' }
          : { label: t('mScheduled'), cls: 'bg-mist text-stone' }
  const scoreCls = `h-14 w-20 rounded-xl border-2 text-center text-3xl font-extrabold tabular-nums text-ink bg-paper ${tone.border}`
  return (
    <form action={scoreMatch} className={`overflow-hidden rounded-2xl border-2 bg-paper shadow-sm ${tone.border}`}>
      <input type="hidden" name="id" value={m.id} />
      <input type="hidden" name="comp" value={comp} />
      <input type="hidden" name="version" value={m.version} />
      <input type="hidden" name="r" value={round} />
      <header className={`flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wide ${tone.band}`}>
        <span>{t('court')} {m.court}</span>
        <span aria-hidden>·</span>
        <span>{start}</span>
        <span className="ml-auto">{t(m.event)}</span>
      </header>
      <div className="divide-y divide-mist">
        <div className="flex items-center gap-3 px-4 py-3">
          <p className="min-w-0 flex-1 text-base font-medium">{nm(m.a1)}<br />{nm(m.a2)}</p>
          <input name="score_a" type="number" inputMode="numeric" min={0} max={99} aria-label={`${t('sideA')} ${t('score')}`} defaultValue={m.score_a ?? ''} className={scoreCls} />
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <p className="min-w-0 flex-1 text-base font-medium">{nm(m.b1)}<br />{nm(m.b2)}</p>
          <input name="score_b" type="number" inputMode="numeric" min={0} max={99} aria-label={`${t('sideB')} ${t('score')}`} defaultValue={m.score_b ?? ''} className={scoreCls} />
        </div>
      </div>
      <footer className="flex flex-wrap items-center gap-x-2 gap-y-3 bg-cloud px-4 py-3">
        <span className={`chip ${status.cls}`}>{status.label}</span>
        <div className="grid w-full grid-cols-2 gap-2 sm:ml-auto sm:flex sm:w-auto sm:flex-wrap">
          {!locked && <button name="intent" value="done" className="btn-primary col-span-2 py-3 sm:col-span-1 sm:py-2">{t('saveFinal')}</button>}
          {!locked && <button name="intent" value="live" formNoValidate className="btn-ghost">{t('startMatch')}</button>}
          {m.status !== 'scheduled' && <button name="intent" value="reset" formNoValidate className="btn-ghost">{t('clearScore')}</button>}
          {!locked && <button name="intent" value="cancel" formNoValidate className="btn-ghost text-berry">{t('cancelMatch')}</button>}
        </div>
      </footer>
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
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-stone">
        {t('round')} {r} · {roundTime(comp.start_time, comp.slot_minutes, r)}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {matches.filter((m) => m.round === r).map((m) => <ScoreCard key={m.id} m={m} comp={id} nm={nm} t={t} round={r} start={roundTime(comp.start_time, comp.slot_minutes, r)} />)}
      </div>
    </section>
  )

  return (
    <>
      <Banner ok={searchParams.ok} err={searchParams.err} />
      {rounds.length === 0 && <p className="text-sm text-stone">{t('noMatches')}</p>}
      {open.map((r) => <Round key={r} r={r} />)}
      {closed.length > 0 && (
        <details className="mt-6">
          <summary className="mb-3 cursor-pointer font-bold text-blue">{t('completedRounds')} ({closed.length})</summary>
          {closed.map((r) => <Round key={r} r={r} />)}
        </details>
      )}
    </>
  )
}
