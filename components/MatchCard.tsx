import Link from 'next/link'
import { getT } from '@/lib/i18n'
import { roundTime } from '@/lib/time'
import type { Competition, Match } from '@/lib/types'

export type Names = Record<number, string>

function Side({ ids, names, comp, win }: { ids: [number, number]; names: Names; comp: number; win: boolean }) {
  return (
    <span className={win ? 'font-bold text-navy-900' : 'text-slate-700'}>
      {ids.map((id, i) => (
        <span key={id}>
          {i > 0 && ' / '}
          <Link href={`/players/${id}?c=${comp}`} className="hover:underline">
            {names[id] ?? '?'}
          </Link>
        </span>
      ))}
    </span>
  )
}

export function MatchCard({ m, names, comp }: { m: Match; names: Names; comp: Competition }) {
  const { t } = getT()
  const done = m.status === 'done' && m.score_a != null && m.score_b != null
  const showScore = (m.status === 'done' || m.status === 'live') && m.score_a != null && m.score_b != null
  const aWin = done && m.score_a! > m.score_b!
  const bWin = done && m.score_b! > m.score_a!
  const statusKey = m.status === 'live' ? 'mLive' : m.status === 'done' ? 'mDone' : m.status === 'cancelled' ? 'mCancelled' : 'mScheduled'
  const chip =
    m.status === 'live' ? 'bg-red-100 text-red-800' : m.status === 'done' ? 'bg-emerald-100 text-emerald-800' : m.status === 'cancelled' ? 'bg-slate-200 text-slate-600' : 'bg-blue-50 text-blue-800'
  return (
    <article className="card">
      <header className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-slate-500">
        <span>
          {t('court')} {m.court}
        </span>
        <span>{roundTime(comp.start_time, comp.slot_minutes, m.round)}</span>
        <span>{t(m.event)}</span>
        <span className={`chip ml-auto ${chip}`}>{t(statusKey)}</span>
      </header>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="text-right"><Side ids={[m.a1, m.a2]} names={names} comp={comp.id} win={aWin} /></div>
        <div className="min-w-[4.5rem] rounded-lg bg-navy-900 px-3 py-1 text-center text-lg font-bold tabular-nums text-accent">
          {showScore ? `${m.score_a} – ${m.score_b}` : t('vs')}
        </div>
        <div><Side ids={[m.b1, m.b2]} names={names} comp={comp.id} win={bWin} /></div>
      </div>
    </article>
  )
}
