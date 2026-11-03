import { AutoRefresh } from '@/components/AutoRefresh'
import { CompTabs } from '@/components/CompTabs'
import { MatchCard } from '@/components/MatchCard'
import { getT } from '@/lib/i18n'
import { loadPublic } from '@/lib/public'

export default async function LivePage({ searchParams }: { searchParams: { c?: string } }) {
  const { t } = getT()
  const data = await loadPublic(searchParams.c)
  if (!data) return <p className="card text-slate-600">{t('noEvent')}</p>
  const { comp, matches, names } = data

  const live = matches.filter((m) => m.status === 'live')
  const scheduled = matches.filter((m) => m.status === 'scheduled')
  const nextRound = scheduled.length ? Math.min(...scheduled.map((m) => m.round)) : null
  const next = scheduled.filter((m) => m.round === nextRound)
  const done = matches
    .filter((m) => m.status === 'done')
    .sort((a, b) => b.round - a.round || a.court - b.court)
    .slice(0, 8)

  const Section = ({ title, empty, items }: { title: string; empty: string; items: typeof matches }) => (
    <section className="mb-8" aria-labelledby={title}>
      <h2 id={title} className="mb-3 text-lg font-bold text-navy-900">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">{empty}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((m) => <MatchCard key={m.id} m={m} names={names} comp={comp} />)}
        </div>
      )}
    </section>
  )

  return (
    <>
      {comp.status === 'live' && <AutoRefresh />}
      <CompTabs comp={comp} active="live" />
      <Section title={t('nowPlaying')} empty={t('nothingLive')} items={live} />
      <Section title={t('upNext')} empty={t('nothingNext')} items={next} />
      <Section title={t('latestResults')} empty={t('nothingDone')} items={done} />
      {comp.status === 'live' && <p className="text-xs text-slate-500">{t('autoRefresh')}</p>}
    </>
  )
}
