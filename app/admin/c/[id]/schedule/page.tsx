import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Banner } from '@/components/Banner'
import { requireAdmin } from '@/lib/auth'
import { addMatch, deleteMatch, generateSchedule, saveMatch } from '@/lib/actions'
import { getT, type T } from '@/lib/i18n'
import { getCompetition, getMatches, getPlayers } from '@/lib/queries'
import { planCounts, roundsNeeded } from '@/lib/scheduler'
import { roundTime } from '@/lib/time'
import { TONE } from '@/lib/event-tone'
import type { Match, Player } from '@/lib/types'

// Defaults for a typical event: 4 games each, 5-hour limit.
const DEFAULT_MD = 4
const DEFAULT_XD = 4
const DEFAULT_HOURS = 5

function PlayerSelect({ name, players, value, label }: { name: string; players: Player[]; value?: number; label: string }) {
  return (
    <select name={name} aria-label={label} defaultValue={value} required className="input">
      {value === undefined && <option value="">{label}</option>}
      {players.map((p) => (
        <option key={p.id} value={p.id}>{p.nickname} ({p.gender}{p.grade ? p.grade : ''})</option>
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
  const plan = planCounts(men, women, { mdGames: DEFAULT_MD, xdGames: DEFAULT_XD })
  const planned = plan.md + plan.xd
  const planRounds = roundsNeeded(planned, comp.courts)
  const maxRounds = Math.floor((DEFAULT_HOURS * 60) / comp.slot_minutes)
  const perMan = men > 0 ? DEFAULT_MD + (2 * plan.xd) / men : 0

  const warn = (m: Match): string[] => {
    const out: string[] = []
    const ids = [m.a1, m.a2, m.b1, m.b2]
    const same = matches.filter((o) => o.id !== m.id && o.round === m.round && o.status !== 'cancelled')
    if (same.some((o) => o.court === m.court || ids.some((i) => [o.a1, o.a2, o.b1, o.b2].includes(i)))) out.push(t('clash'))
    const g = (i: number) => byId.get(i)?.gender
    const ok = m.event === 'MD' ? ids.every((i) => g(i) === 'M') : g(m.a1) !== g(m.a2) && g(m.b1) !== g(m.b2)
    if (!ok) out.push(t('mismatch'))
    return out
  }

  const editing = searchParams.m ? matches.find((m) => m.id === Number(searchParams.m)) : undefined
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b)
  const nm = (i: number) => byId.get(i)?.nickname ?? '?'

  return (
    <>
      <Banner ok={searchParams.ok} err={searchParams.err} />

      <form action={generateSchedule} className="card mb-6">
        <input type="hidden" name="id" value={id} />
        <h2 className="mb-1 font-bold text-ink">{t('generate')}</h2>
        <p className="mb-3 text-sm text-ink/75">{t('generateHelp')}</p>
        <p className="mb-3 text-sm font-medium text-ink">
          {t('planPreview')}: {players.length} {t('playersCount')} ({men} {t('menCount')}, {women} {t('womenCount')}) → {planned} {t('planMatches')} ({t('MD')} {plan.md}, {t('XD')} {plan.xd}),{' '}
          {planRounds} {t('planRounds')}, {t('planFinish')} {roundTime(comp.start_time, comp.slot_minutes, planRounds + 1)}, ~{perMan.toFixed(1)} {t('menPlay')}.{' '}
          <span className={planRounds > maxRounds ? 'font-bold text-berry' : 'text-ink'}>
            {planRounds > maxRounds ? `⚠ ${t('planOver')}` : `✓ ${t('planFits')}`}
          </span>
        </p>
        <div className="grid grid-cols-2 gap-3 sm:max-w-xl sm:grid-cols-4">
          <div>
            <label htmlFor="mdGames" className="label">{t('mdGames')}</label>
            <input id="mdGames" name="mdGames" type="number" min={0} max={10} defaultValue={DEFAULT_MD} className="input" />
          </div>
          <div>
            <label htmlFor="xdGames" className="label">{t('xdGames')}</label>
            <input id="xdGames" name="xdGames" type="number" min={0} max={10} defaultValue={DEFAULT_XD} className="input" />
          </div>
          <div>
            <label htmlFor="hours" className="label">{t('windowHours')}</label>
            <input id="hours" name="hours" type="number" min={0.5} max={24} step={0.5} defaultValue={DEFAULT_HOURS} className="input" />
          </div>
          <div>
            <label htmlFor="seed" className="label">{t('seed')}</label>
            <input id="seed" name="seed" type="number" min={0} max={1000000} defaultValue={Math.floor(Math.random() * 9999)} className="input" />
          </div>
        </div>
        <p className="mb-3 mt-1 text-xs text-ink/75">{t('seedHelp')}</p>
        <button className="btn-accent">{t('generate')}</button>
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

      {rounds.length === 0 && <p className="mb-6 text-sm text-ink/75">{t('noMatches')}</p>}
      <div className="mb-8 space-y-4">
        {rounds.map((r) => (
          <section key={r}>
            <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-ink/75">
              {t('round')} {r} · {roundTime(comp.start_time, comp.slot_minutes, r)}
            </h3>
            <ul className="glass divide-y divide-ink/10 overflow-hidden">
              {matches.filter((m) => m.round === r).map((m) => {
                const w = warn(m)
                return (
                  <li key={m.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-l-4 px-3 py-2 text-sm ${TONE[m.event].side}`}>
                    <span className="w-14 font-semibold text-ink/75">{t('court')} {m.court}</span>
                    <span className={`chip ${TONE[m.event].chip}`}>{t(m.event)}</span>
                    <span className="flex-1">{nm(m.a1)} / {nm(m.a2)} <span className="text-ink/75">{t('vs')}</span> {nm(m.b1)} / {nm(m.b2)}</span>
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
