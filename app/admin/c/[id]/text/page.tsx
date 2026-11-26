import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CopyButton } from '@/components/CopyButton'
import { requireAdmin } from '@/lib/auth'
import { getT } from '@/lib/i18n'
import { getCompetition, getMatches, getPlayers } from '@/lib/queries'
import { groupsToText, scheduleGroups } from '@/lib/schedule-groups'

/** Plain-text schedule for copying into a chat or document: grouped by court or by time. */
export default async function TextSchedule({ params, searchParams }: { params: { id: string }; searchParams: { by?: string } }) {
  await requireAdmin()
  const { t } = getT()
  const id = Number(params.id)
  const comp = await getCompetition(id)
  if (!comp) notFound()
  const [players, matches] = await Promise.all([getPlayers(id), getMatches(id)])
  const by = searchParams.by === 'time' ? 'time' : 'court'
  const groups = scheduleGroups(comp, players, matches, by, t)
  const text = groupsToText(comp, groups, by, t('noMatches'))

  const tab = (key: 'court' | 'time', label: string) => (
    <Link
      href={`/admin/c/${id}/text?by=${key}`}
      aria-current={by === key ? 'true' : undefined}
      className={`rounded-lg border px-4 py-2 text-sm font-semibold ${by === key ? 'border-ink bg-sun text-ink' : 'border-mist text-ink hover:bg-mist/40'}`}
    >
      {label}
    </Link>
  )

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {tab('court', t('textByCourt'))}
        {tab('time', t('textByTime'))}
        <a href={`/schedule/pdf?c=${id}&by=${by}`} className="rounded-lg border border-mist px-4 py-2 text-sm font-semibold text-ink hover:bg-mist/40">
          {t('printSchedule')}
        </a>
        <span className="ml-auto"><CopyButton targetId="schedule-text" label={t('textCopy')} doneLabel={t('textCopied')} /></span>
      </div>
      <label htmlFor="schedule-text" className="sr-only">{t('tabText')}</label>
      <textarea
        id="schedule-text"
        readOnly
        value={text}
        rows={Math.min(40, text.split('\n').length + 1)}
        className="input w-full font-mono text-sm leading-6"
        data-testid="schedule-text"
      />
    </>
  )
}
