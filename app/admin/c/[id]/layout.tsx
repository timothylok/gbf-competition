import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AdminTabs } from '@/components/AdminTabs'
import { requireAdmin } from '@/lib/auth'
import { getT } from '@/lib/i18n'
import { getCompetition } from '@/lib/queries'

export default async function CompLayout({ children, params }: { children: React.ReactNode; params: { id: string } }) {
  await requireAdmin()
  const { t } = getT()
  const id = Number(params.id)
  const comp = Number.isInteger(id) ? await getCompetition(id) : null
  if (!comp) notFound()
  return (
    <>
      <div className="mb-3 flex flex-wrap items-baseline gap-3">
        <h1 className="text-xl font-bold text-navy-900">{comp.name}</h1>
        <Link href={`/?c=${comp.id}`} className="text-sm text-slate-600 hover:underline">{t('viewPublic')} →</Link>
      </div>
      <AdminTabs id={comp.id} labels={{ overview: t('tabOverview'), players: t('tabPlayers'), schedule: t('tabSchedule'), scores: t('tabScores') }} />
      {children}
    </>
  )
}
