import type { Metadata } from 'next'
import { AutoRefresh } from '@/components/AutoRefresh'
import { CompTabs } from '@/components/CompTabs'
import { MatchCard } from '@/components/MatchCard'
import { getT } from '@/lib/i18n'
import { loadPublic } from '@/lib/public'
import { roundTime } from '@/lib/time'

export const metadata: Metadata = { title: 'Schedule' }

export default async function SchedulePage({ searchParams }: { searchParams: { c?: string; p?: string } }) {
  const { t } = getT()
  const data = await loadPublic(searchParams.c)
  if (!data) return <p className="card text-slate-600">{t('noEvent')}</p>
  const { comp, players, matches, names } = data

  const pid = Number(searchParams.p) || null
  const shown = pid ? matches.filter((m) => [m.a1, m.a2, m.b1, m.b2].includes(pid)) : matches
  const rounds = [...new Set(shown.map((m) => m.round))].sort((a, b) => a - b)

  return (
    <>
      {comp.status === 'live' && <AutoRefresh seconds={30} />}
      <CompTabs comp={comp} active="schedule" />
      <form method="get" className="mb-5 flex items-end gap-2">
        <input type="hidden" name="c" value={comp.id} />
        <div className="flex-1">
          <label htmlFor="p" className="label">{t('filterPlayer')}</label>
          <select id="p" name="p" defaultValue={pid ?? ''} className="input">
            <option value="">{t('allPlayers')}</option>
            {players.map((p) => <option key={p.id} value={p.id}>{p.nickname}</option>)}
          </select>
        </div>
        <button className="btn-primary" type="submit">{t('filter')}</button>
      </form>
      {rounds.length === 0 && <p className="text-sm text-slate-500">{t('noMatches')}</p>}
      {rounds.map((r) => (
        <section key={r} className="mb-6" aria-label={`${t('round')} ${r}`}>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
            {t('round')} {r} · {roundTime(comp.start_time, comp.slot_minutes, r)}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {shown.filter((m) => m.round === r).map((m) => <MatchCard key={m.id} m={m} names={names} comp={comp} />)}
          </div>
        </section>
      ))}
    </>
  )
}
