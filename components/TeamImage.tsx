import { TeamImageButton } from './TeamImageButton'
import type { Key } from '@/lib/i18n'
import { hasTeams, teamLists } from '@/lib/team-lists'

/** "Print team list (image)" button for the public pages. Shown only when the competition has a Philippines team. */
export function TeamImage({ comp, players, t }: {
  comp: { name: string; event_date: string }
  players: { nickname: string; gender: 'M' | 'F'; grade: number | null }[]
  t: (k: Key) => string
}) {
  if (!hasTeams(players)) return null
  const lists = teamLists(players)
  return (
    <TeamImageButton
      lists={lists}
      label={t('printTeams')}
      fileName={`GBF-teams-${comp.event_date}.png`}
      printedLabel={t('printedAt')}
      nzLabel={t('nzTime')}
      text={{
        title: comp.name,
        subtitle: `${comp.event_date} · ${players.length} ${t('playersCount')} · ${lists[0].count} / ${lists[1].count}`,
        teamNames: { F: t('teamF'), R: t('teamR') },
        men: t('menCount'),
        women: t('womenCount'),
        players: t('playersCount'),
        rights: `© ${new Date().getFullYear()} ${t('footerRights')} ${t('footerCredit')}`,
      }}
    />
  )
}
