import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Banner } from '@/components/Banner'
import { requireAdmin } from '@/lib/auth'
import { addMatch, deleteMatch, generateSchedule, saveMatch } from '@/lib/actions'
import { getT, type T } from '@/lib/i18n'
import { getCompetition, getMatches, getPlayers } from '@/lib/queries'
import { planCounts } from '@/lib/scheduler'
import { roundTime } from '@/lib/time'
import type { Match, Player } from '@/lib/types'

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
  const plan = planCounts(men, women, 4)
  const planned = plan.md + plan.xd
  const planRounds = Math.ceil(planned / comp.courts)

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
        <h2 className="mb-1 font-bold text-navy-900">{t('generate')}</h2>
        <p className="mb-3 text-sm text-slate-600">{t('generateHelp')}</p>
        <p className="mb-3 text-sm font-medium text-slate-700">
          {t('planPreview')}: {players.length} {t('playersCount')} ({men} {t('menCount')}, {women} {t('womenCount')}) → {planned} {t('planMatches')} ({t('MD')} {plan.md}, {t('XD')} {plan.xd}),{' '}
          {planRounds} {t('planRounds')}, {t('planFinish')} {roundTime(comp.start_time, comp.slot_minutes, planRounds + 1)}
        </p>
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <div>
            <label htmlFor="target" className="label">{t('gamesPerPlayer')}</label>
            <input id="target" name="target" type="number" min={1} max={10} defaultValue={4} className="input" />
          </div>
          <div>
            <label htmlFor="seed" className="label">{t('seed')}</label>
            <input id="seed" name="seed" type="number" min={0} max={1000000} defaultValue={Math.floor(Math.random() * 9999)} className="input" />
          </div>
        </div>
        <p className="mb-3 mt-1 text-xs text-slate-500">{t('seedHelp')}</p>
        <button className="btn-accent">{t('generate')}</button>
      </form>

      {editing && (
        <form action={saveMatch} id="edit" className="card mb-6 border-accent">
          <input type="hidden" name="id" value={editing.id} />
          <input type="hidden" name="comp" value={id} />
          <MatchFields players={players} m={editing} t={t} />
          <div className="mt-3 flex gap-2">
            <button className="btn-accent">{t('save')}</button>
            <button formAction={deleteMatch} formNoValidate className="btn-ghost text-red-700">{t('delete')}</button>
            <Link href={`/admin/c/${id}/schedule`} className="btn-ghost">✕</Link>
          </div>
        </form>
      )}

      {rounds.length === 0 && <p className="mb-6 text-sm text-slate-500">{t('noMatches')}</p>}
      <div className="mb-8 space-y-4">
        {rounds.map((r) => (
          <section key={r}>
            <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">
              {t('round')} {r} · {roundTime(comp.start_time, comp.slot_minutes, r)}
            </h3>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {matches.filter((m) => m.round === r).map((m) => {
                const w = warn(m)
                return (
                  <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                    <span className="w-14 font-semibold text-slate-500">{t('court')} {m.court}</span>
                    <span className="chip bg-slate-100 text-slate-700">{m.event}</span>
                    <span className="flex-1">{nm(m.a1)} / {nm(m.a2)} <span className="text-slate-400">{t('vs')}</span> {nm(m.b1)} / {nm(m.b2)}</span>
                    {m.status === 'done' && <span className="chip bg-emerald-100 text-emerald-800">{m.score_a}–{m.score_b}</span>}
                    {w.map((x) => <span key={x} title={x} className="chip bg-amber-100 text-amber-900">⚠ {x}</span>)}
                    {m.status !== 'done' && <Link href={`/admin/c/${id}/schedule?m=${m.id}#edit`} className="font-semibold text-navy-900 hover:underline">{t('edit')}</Link>}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>

      {players.length >= 4 && (
        <details className="card">
          <summary className="cursor-pointer font-bold text-navy-900">{t('addMatch')}</summary>
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
