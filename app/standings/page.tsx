import type { Metadata } from 'next'
import Link from 'next/link'
import { AutoRefresh } from '@/components/AutoRefresh'
import { CompTabs } from '@/components/CompTabs'
import { getT } from '@/lib/i18n'
import { loadPublic } from '@/lib/public'
import { standings } from '@/lib/standings'

export const metadata: Metadata = { title: 'Standings' }

export default async function StandingsPage({ searchParams }: { searchParams: { c?: string; e?: string } }) {
  const { t } = getT()
  const data = await loadPublic(searchParams.c)
  if (!data) return <p className="card text-slate-600">{t('noEvent')}</p>
  const { comp, players, matches } = data

  const ev = searchParams.e === 'MD' || searchParams.e === 'XD' ? searchParams.e : 'ALL'
  const rows = standings(players, matches, ev)
  const tabs = ['ALL', 'MD', 'XD'] as const

  return (
    <>
      {comp.status === 'live' && <AutoRefresh seconds={30} />}
      <CompTabs comp={comp} active="standings" />
      <div className="mb-4 flex gap-2">
        {tabs.map((e) => (
          <Link
            key={e}
            href={`/standings?c=${comp.id}&e=${e}`}
            aria-current={e === ev ? 'page' : undefined}
            className={e === ev ? 'btn-primary' : 'btn-ghost'}
          >
            {t(e)}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">{t('noStandings')}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <caption className="sr-only">{t(ev)}</caption>
            <thead className="bg-navy-900 text-left text-xs uppercase text-slate-200">
              <tr>
                <th scope="col" className="px-3 py-2">{t('rank')}</th>
                <th scope="col" className="px-3 py-2">{t('player')}</th>
                {(['played', 'won', 'drawn', 'lost', 'diff'] as const).map((k) => (
                  <th key={k} scope="col" className="px-2 py-2 text-right">{t(k)}</th>
                ))}
                <th scope="col" className="px-3 py-2 text-right text-accent">{t('points')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {rows.map((r, i) => (
                <tr key={r.player.id} className={i < 3 ? 'bg-accent-subtle/40' : ''}>
                  <td className="px-3 py-2 font-bold">{i + 1}</td>
                  <td className="px-3 py-2 font-medium">
                    <Link href={`/players/${r.player.id}?c=${comp.id}`} className="hover:underline">{r.player.nickname}</Link>
                  </td>
                  <td className="px-2 py-2 text-right">{r.played}</td>
                  <td className="px-2 py-2 text-right">{r.won}</td>
                  <td className="px-2 py-2 text-right">{r.drawn}</td>
                  <td className="px-2 py-2 text-right">{r.lost}</td>
                  <td className="px-2 py-2 text-right">{r.diff > 0 ? `+${r.diff}` : r.diff}</td>
                  <td className="px-3 py-2 text-right font-bold text-navy-900">{r.pts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">{t('scoringNote')}</p>
    </>
  )
}
