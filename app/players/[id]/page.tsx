import { notFound } from 'next/navigation'
import Link from 'next/link'
import { MatchCard } from '@/components/MatchCard'
import { getT } from '@/lib/i18n'
import { loadPublic } from '@/lib/public'
import { standings } from '@/lib/standings'
import { query } from '@/lib/db'

export default async function PlayerPage({ params, searchParams }: { params: { id: string }; searchParams: { c?: string } }) {
  const { t } = getT()
  const id = Number(params.id)
  if (!Number.isInteger(id) || id < 1) notFound()
  // The competition is taken from the player row so a mismatched ?c= cannot leak another event.
  const [row] = await query<{ competition_id: number }>('SELECT competition_id FROM players WHERE id=$1', [id])
  if (!row) notFound()
  const data = await loadPublic(String(row.competition_id))
  if (!data) notFound()
  const { comp, players, matches, names } = data
  const player = players.find((p) => p.id === id)
  if (!player) notFound()

  const mine = matches.filter((m) => [m.a1, m.a2, m.b1, m.b2].includes(id)).sort((a, b) => a.round - b.round)
  const rec = standings(players, matches, 'ALL').find((r) => r.player.id === id)

  return (
    <>
      <p className="mb-2 text-sm"><Link href={`/?c=${comp.id}`} className="text-stone hover:underline">← {comp.name}</Link></p>
      <h1 className="mb-1 text-2xl font-bold text-blue">{player.nickname}</h1>
      <p className="mb-4 text-sm text-stone">
        {t('record')}: {rec ? `${rec.won}${t('won')} ${rec.drawn}${t('drawn')} ${rec.lost}${t('lost')} · ${rec.pts} ${t('points')} · ${rec.diff > 0 ? '+' : ''}${rec.diff}` : '—'}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {mine.map((m) => <MatchCard key={m.id} m={m} names={names} comp={comp} />)}
      </div>
      {mine.length === 0 && <p className="text-sm text-stone">{t('noMatches')}</p>}
    </>
  )
}
