import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Banner } from '@/components/Banner'
import { requireAdmin } from '@/lib/auth'
import { gradeToLetter, withGrade } from '@/lib/grade'
import { matchKind, startLabel, startScoreOf } from '@/lib/handicap'
import { lineupIssues, teamSetup, type LineupPlayer } from '@/lib/lineup'
import { compileRules, parseRules } from '@/lib/pairing-rules'
import { ConfirmButton } from '@/components/ConfirmButton'
import { addMatch, deleteMatch, generateSchedule, saveMatch } from '@/lib/actions'
import { getT, type T } from '@/lib/i18n'
import { generatedLine } from '@/lib/nz-time'
import { getCompetition, getMatches, getPlayers } from '@/lib/queries'
import { estimatePlan } from '@/lib/scheduler'
import { teamOf } from '@/lib/team'
import { limitMinutes, maxRoundsFor, roundRange, roundTime, warmupRange } from '@/lib/time'
import { TONE } from '@/lib/event-tone'
import type { Match, Player } from '@/lib/types'

/** Most games any player plays by default (15-minute matches). */
const DEFAULT_MAX_GAMES = 6

function PlayerSelect({ name, players, value, label }: { name: string; players: Player[]; value?: number; label: string }) {
  return (
    <select name={name} aria-label={label} defaultValue={value} required className="input">
      {value === undefined && <option value="">{label}</option>}
      {players.map((p) => (
        <option key={p.id} value={p.id}>{p.nickname} ({p.gender}{gradeToLetter(p.grade)})</option>
      ))}
    </select>
  )
}

function MatchFields({ players, m, t }: { players: Player[]; m?: Match; t: T }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="grid grid-cols-3 gap-2 sm:col-span-2">
        <select name="event" aria-label={t('event')} defaultValue={m?.event ?? 'XD'} className="input">
          <option value="MD">{t('MD')}</option>
          <option value="XD">{t('XD')}</option>
        </select>
        <input name="round" type="number" min={1} max={99} required aria-label={t('round')} placeholder={t('round')} defaultValue={m?.round} className="input" />
        <input name="court" type="number" min={1} max={50} required aria-label={t('court')} placeholder={t('court')} defaultValue={m?.court} className="input" />
      </div>
      <fieldset className="space-y-2">
        <legend className="label">{t('sideA')}</legend>
        <PlayerSelect name="a1" players={players} value={m?.a1} label={t('player')} />
        <PlayerSelect name="a2" players={players} value={m?.a2} label={t('player')} />
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="label">{t('sideB')}</legend>
        <PlayerSelect name="b1" players={players} value={m?.b1} label={t('player')} />
        <PlayerSelect name="b2" players={players} value={m?.b2} label={t('player')} />
      </fieldset>
    </div>
  )
}

export default async function SchedulePage({ params, searchParams }: { params: { id: string }; searchParams: { ok?: string; err?: string; m?: string } }) {
  await requireAdmin()
  const { t } = getT()
  const id = Number(params.id)
  const comp = await getCompetition(id)
  if (!comp) notFound()
  const [players, matches] = await Promise.all([getPlayers(id), getMatches(id)])
  const byId = new Map(players.map((p) => [p.id, p]))
  const men = players.filter((p) => p.gender === 'M').length
  const women = players.length - men
  const withTeam = players.map((p) => ({ ...p, team: teamOf(p.nickname) }))
  const setup = teamSetup(withTeam)
  const compiled = compileRules(parseRules(comp.pairing_rules), players)
  const nF = withTeam.filter((p) => p.team === 'F').length
  const maxRounds = maxRoundsFor(comp)
  const plan = estimatePlan(withTeam, DEFAULT_MAX_GAMES, comp.courts)
  const planRounds = plan.rounds
  const info = Object.fromEntries(players.map((p) => [p.id, { gender: p.gender, grade: p.grade, upper: p.upper_c }]))
  const lp = (i: number): LineupPlayer | null => {
    const p = byId.get(i)
    return p ? { id: p.id, gender: p.gender, grade: p.grade, team: teamOf(p.nickname), upper: p.upper_c } : null
  }

  // Cross doubles limit: each player plays at most one. Counted from the saved matches, so a hand edit is reflected.
  const crossBy = new Map<number, number[]>()
  for (const m of matches) {
    if (m.status === 'cancelled' || matchKind(m, info) !== 'HD') continue
    for (const i of [m.a1, m.a2, m.b1, m.b2]) crossBy.set(i, [...(crossBy.get(i) ?? []), m.round])
  }
  const crossOver = [...crossBy.entries()].filter(([, r]) => r.length > 1).sort((a, b) => b[1].length - a[1].length)
  const crossTotal = matches.filter((m) => m.status !== 'cancelled' && matchKind(m, info) === 'HD').length

  const warn = (m: Match): string[] => {
    const out: string[] = []
    const ids = [m.a1, m.a2, m.b1, m.b2]
    if (m.round > maxRounds) out.push(t('afterEnd'))
    const same = matches.filter((o) => o.id !== m.id && o.round === m.round && o.status !== 'cancelled')
    if (same.some((o) => o.court === m.court || ids.some((i) => [o.a1, o.a2, o.b1, o.b2].includes(i)))) out.push(t('clash'))
    if (matchKind(m, info) === 'HD' && ids.some((i) => (crossBy.get(i)?.length ?? 0) > 1)) out.push(t('crossMany'))
    const [a1, a2, b1, b2] = ids.map(lp)
    if (a1 && a2 && b1 && b2) {
      const issues = lineupIssues(m.event, [a1, a2], [b1, b2], setup, compiled.forbidden)
      if (issues.includes('mismatch')) out.push(t('mismatch'))
      if (issues.includes('grades')) out.push(t('gradesApart'))
      if (issues.includes('team')) out.push(t('teamIssue'))
      if (issues.includes('rule')) out.push(t('ruleBroken'))
    }
    return out
  }

  const editing = searchParams.m ? matches.find((m) => m.id === Number(searchParams.m)) : undefined
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b)
  // Required pairs: shown from the saved matches, so a hand edit is reflected.
  const partnered = (a: number, b: number) =>
    matches.some((m) => m.status !== 'cancelled' && [[m.a1, m.a2], [m.b1, m.b2]].some(([x, y]) => (x === a && y === b) || (x === b && y === a)))
  const nm = (i: number) => {
    const p = byId.get(i)
    return p ? withGrade(p.nickname, p.grade) : '?'
  }

  return (
    <>
      <Banner ok={searchParams.ok} err={searchParams.err} />

      <form action={generateSchedule} className="card mb-6">
        <input type="hidden" name="id" value={id} />
        <h2 className="mb-1 font-bold text-ink">{t('generate')}</h2>
        <p className="mb-3 text-sm text-ink/75">{t('generateHelp')}</p>
        {comp.schedule_generated_at && <p className="mb-3 text-sm font-semibold text-ink" data-testid="generated-at">{generatedLine(t, comp.schedule_generated_at)}</p>}
        <p className="mb-3 text-sm font-medium text-ink">
          {t('planPreview')}: {players.length} {t('playersCount')} ({men} {t('menCount')}, {women} {t('womenCount')}
          {setup.active ? `; ${t('teamF')} ${nF}, ${t('teamR')} ${players.length - nF}` : ''}) → {t('planUpTo')} {plan.matches} {t('planMatches')}
          {setup.active && plan.filler > 0 ? ` (${plan.cross} + ${plan.filler} ${t('planFiller')})` : ''}, {planRounds} {t('planRounds')}, {t('planFinish')} {roundTime(comp.start_time, comp.slot_minutes, planRounds + 1)}.{' '}
          <span className="text-ink">{plan.rounds > maxRounds ? `⚠ ${t('planOver')}` : `✓ ${t('planFits')}`}</span>
        </p>
        <div className="grid grid-cols-2 gap-3 sm:max-w-xl sm:grid-cols-3">
          <div>
            <label htmlFor="maxGames" className="label">{t('maxGames')}</label>
            <input id="maxGames" name="maxGames" type="number" min={1} max={10} defaultValue={DEFAULT_MAX_GAMES} className="input" />
          </div>
          <div>
            <label htmlFor="hours" className="label">{t('windowHours')}</label>
            <input id="hours" name="hours" type="number" min={0.5} max={24} step={0.5} defaultValue={limitMinutes(comp) / 60} className="input" />
          </div>
          <div>
            <label htmlFor="seed" className="label">{t('seed')}</label>
            <input id="seed" name="seed" type="number" min={0} max={1000000} defaultValue={Math.floor(Math.random() * 9999)} className="input" />
          </div>
        </div>
        <p className="mb-3 mt-1 text-xs text-ink/75">{t('seedHelp')}</p>
        <ConfirmButton className="btn-accent" message={matches.length > 0 ? t('confirmRegenerate').replace('{n}', String(matches.length)) : undefined}>{t('generate')}</ConfirmButton>
      </form>

      {editing && (
        <form action={saveMatch} id="edit" className="card mb-6 border-sun">
          <input type="hidden" name="id" value={editing.id} />
          <input type="hidden" name="comp" value={id} />
          <MatchFields players={players} m={editing} t={t} />
          <div className="mt-3 flex gap-2">
            <button className="btn-accent">{t('save')}</button>
            <button formAction={deleteMatch} formNoValidate className="btn-ghost text-berry">{t('delete')}</button>
            <Link href={`/admin/c/${id}/schedule`} className="btn-ghost">✕</Link>
          </div>
        </form>
      )}

      <p className="mb-4 rounded-lg border border-mist bg-paper/60 px-4 py-2 text-sm font-semibold text-ink" data-testid="warmup">{t('warmup')} {warmupRange(comp.start_time)} · {t('allCourts')}</p>
      {(compiled.forbidden.size > 0 || compiled.required.length > 0) && (
        <p className="mb-4 text-sm text-ink" data-testid="rules-status">
          <span className="font-semibold">{t('rulesStatus')}:</span> {compiled.forbidden.size} {t('rulesAvoid')}
          {compiled.required.map(([a, b]) => (
            <span key={`${a}-${b}`}> · {rounds.length > 0 ? (partnered(a, b) ? '✓' : '✗') : ''} {nm(a)} + {nm(b)} ({t('rulesMust')})</span>
          ))}
        </p>
      )}
      {crossTotal > 0 && (
        <p className="mb-4 text-sm text-ink" data-testid="cross-limit">
          <span className="font-semibold">{t('crossLimit')}:</span> {crossTotal} {t('crossMatches')} ·{' '}
          {crossOver.length === 0 ? (
            <span>✓ {t('crossOk')}</span>
          ) : (
            <span className="rounded bg-sun px-1.5 py-0.5 font-semibold" data-testid="cross-exceptions">
              {t('crossExceptions')}: {crossOver.map(([i, r]) => `${nm(i)} (${r.length}: ${t('round')} ${r.join(', ')})`).join('; ')}
            </span>
          )}
        </p>
      )}
      {rounds.length === 0 && <p className="mb-6 text-sm text-ink/75">{t('noMatches')}</p>}
      {rounds.length > 0 && (
        <p className="mb-3 text-sm font-semibold text-ink">
          {t('compEnds')} {roundTime(comp.start_time, comp.slot_minutes, rounds[rounds.length - 1] + 1)}
        </p>
      )}
      <div className="mb-8 space-y-4">
        {rounds.map((r) => (
          <section key={r}>
            <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-ink/75">
              {t('round')} {r} · {roundRange(comp.start_time, comp.slot_minutes, r)} ({comp.slot_minutes} {t('minShort')})
            </h3>
            <ul className="glass divide-y divide-ink/10 overflow-hidden">
              {matches.filter((m) => m.round === r).map((m) => {
                const w = warn(m)
                const kind = matchKind(m, info)
                const ss = startScoreOf(m, info)
                return (
                  <li key={m.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-l-4 px-3 py-2 text-sm ${TONE[kind].side}`}>
                    <span className="w-14 font-semibold text-ink/75">{t('court')} {m.court}</span>
                    <span className={`chip ${TONE[kind].chip}`}>{t(kind)}</span>
                    <span className="flex-1">{nm(m.a1)} / {nm(m.a2)} <span className="text-ink/75">{t('vs')}</span> {nm(m.b1)} / {nm(m.b2)}</span>
                    {ss && <span className="chip bg-mist text-ink">{startLabel(ss, t)}</span>}
                    {m.status === 'done' && <span className="chip bg-leaf/30 text-ink">{m.score_a}–{m.score_b}</span>}
                    {w.map((x) => <span key={x} title={x} className="chip bg-sun text-ink">⚠ {x}</span>)}
                    {m.status !== 'done' && <Link href={`/admin/c/${id}/schedule?m=${m.id}#edit`} className="rounded-lg border border-mist px-3 py-2 font-semibold text-ink hover:bg-mist/40">{t('edit')}</Link>}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>

      {players.length >= 4 && (
        <details className="card">
          <summary className="cursor-pointer py-2 font-bold text-ink">{t('addMatch')}</summary>
          <form action={addMatch} className="mt-3">
            <input type="hidden" name="comp" value={id} />
            <MatchFields players={players} t={t} />
            <button className="btn-accent mt-3">{t('create')}</button>
          </form>
        </details>
      )}
    </>
  )
}
