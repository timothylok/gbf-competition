import Link from 'next/link'
import { getT, type T } from '@/lib/i18n'
import { TONE } from '@/lib/event-tone'
import { roundTime } from '@/lib/time'
import type { Competition, Match } from '@/lib/types'

export type Names = Record<number, string>

function Team({
  ids, names, comp, score, show, win, dim, tone, t,
}: {
  ids: [number, number]
  names: Names
  comp: number
  score: number | null
  show: boolean
  win: boolean
  dim: boolean
  tone: (typeof TONE)['MD']
  t: T
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2">
      <ul className="min-w-0 flex-1 space-y-0.5">
        {ids.map((id) => (
          <li key={id} className={`truncate text-base ${win ? 'font-bold text-ink' : dim ? 'text-stone' : 'text-ink'}`}>
            <Link href={`/players/${id}?c=${comp}`} className="inline-block max-w-full py-1.5 align-top hover:underline">
              {names[id] ?? '?'}
            </Link>
          </li>
        ))}
      </ul>
      {win && <span className="sr-only">{t('winner')}</span>}
      <div
        className={`grid h-12 min-w-[3.25rem] place-items-center rounded-xl px-2 text-2xl font-extrabold tabular-nums ${
          show ? (win ? tone.win : tone.tint) : 'bg-mist/40 text-stone'
        }`}
      >
        {show ? score : '–'}
      </div>
    </div>
  )
}

export function MatchCard({ m, names, comp }: { m: Match; names: Names; comp: Competition }) {
  const { t } = getT()
  const tone = TONE[m.event]
  const done = m.status === 'done' && m.score_a != null && m.score_b != null
  const show = (m.status === 'done' || m.status === 'live') && m.score_a != null && m.score_b != null
  const aWin = done && m.score_a! > m.score_b!
  const bWin = done && m.score_b! > m.score_a!
  const draw = done && m.score_a === m.score_b

  const status =
    m.status === 'live'
      ? { label: t('mLive'), cls: 'bg-sun text-ink', pulse: true }
      : m.status === 'done'
        ? { label: t('mDone'), cls: 'bg-leaf text-ink', pulse: false }
        : m.status === 'cancelled'
          ? { label: t('mCancelled'), cls: 'bg-mist text-stone line-through', pulse: false }
          : { label: t('mScheduled'), cls: 'bg-mist text-stone', pulse: false }

  return (
    <article className={`overflow-hidden rounded-2xl border-2 bg-paper shadow-sm ${tone.border}`}>
      <header className={`flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wide ${tone.band}`}>
        <span>{t('court')} {m.court}</span>
        <span aria-hidden>·</span>
        <span>{roundTime(comp.start_time, comp.slot_minutes, m.round)}</span>
        <span className="ml-auto">{t(m.event)}</span>
      </header>
      <div className="divide-y divide-mist">
        <Team ids={[m.a1, m.a2]} names={names} comp={comp.id} score={m.score_a} show={show} win={aWin} dim={bWin} tone={tone} t={t} />
        <Team ids={[m.b1, m.b2]} names={names} comp={comp.id} score={m.score_b} show={show} win={bWin} dim={aWin} tone={tone} t={t} />
      </div>
      <footer className="flex items-center gap-2 bg-cloud px-4 py-2">
        <span className={`chip gap-1.5 ${status.cls}`}>
          {status.pulse && <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-ink" />}
          {status.label}
        </span>
        {draw && <span className="chip bg-mist text-stone">{t('draw')}</span>}
        <span className="ml-auto text-xs text-stone">{t('round')} {m.round}</span>
      </footer>
    </article>
  )
}

/** Colour key shown under the tabs: blue = men's doubles, pink = mixed doubles. */
export function EventLegend() {
  const { t } = getT()
  return (
    <p className="mb-5 flex flex-wrap items-center gap-2 text-xs text-stone">
      <span className={`chip ${TONE.MD.chip}`}>{t('MD')}</span>
      <span className={`chip ${TONE.XD.chip}`}>{t('XD')}</span>
    </p>
  )
}
