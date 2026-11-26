import { Banner } from '@/components/Banner'
import { requireAdmin } from '@/lib/auth'
import { addPlayers, deletePlayer, updatePlayer } from '@/lib/actions'
import { gradeToLetter } from '@/lib/grade'
import { getT } from '@/lib/i18n'
import { getPlayers } from '@/lib/queries'

export default async function PlayersPage({ params, searchParams }: { params: { id: string }; searchParams: { ok?: string; err?: string } }) {
  await requireAdmin()
  const { t } = getT()
  const id = Number(params.id)
  const players = await getPlayers(id)
  const men = players.filter((p) => p.gender === 'M').length

  return (
    <>
      <Banner ok={searchParams.ok} err={searchParams.err} />
      <form action={addPlayers} className="card mb-6">
        <input type="hidden" name="id" value={id} />
        <label htmlFor="text" className="label">{t('bulkAdd')}</label>
        <p className="mb-2 text-xs text-ink/75">{t('bulkHelp')}</p>
        <textarea id="text" name="text" rows={6} className="input mb-3 font-mono text-sm" required placeholder={'Kevin, M, B\nMei, F'} />
        <button className="btn-accent">{t('addPlayers')}</button>
      </form>

      <p className="mb-3 text-sm font-semibold text-ink">
        {players.length} {t('playersCount')} · {men} {t('menCount')} · {players.length - men} {t('womenCount')}
      </p>
      {players.length === 0 && <p className="text-sm text-ink/75">{t('noPlayers')}</p>}
      <ul className="space-y-2">
        {players.map((p) => (
          <li key={p.id} className="card !p-3">
            <form action={updatePlayer} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="comp" value={id} />
              <input name="nickname" aria-label={t('player')} defaultValue={p.nickname} maxLength={30} required className="input !w-40 flex-1" />
              <select name="gender" aria-label={t('gender')} defaultValue={p.gender} className="input !w-24">
                <option value="M">{t('male')}</option>
                <option value="F">{t('female')}</option>
              </select>
              <input name="grade" maxLength={1} pattern="[A-Ia-i]?" aria-label={t('grade')} placeholder={t('grade')} defaultValue={gradeToLetter(p.grade)} className="input !w-20 uppercase" />
              <label className="flex items-center gap-1 text-xs text-ink">
                <input type="checkbox" name="d_friendly" defaultChecked={p.d_friendly} className="h-8 w-8" /> {t('partnerD')}
              </label>
              <button className="btn-ghost">{t('save')}</button>
              <button formAction={deletePlayer} className="btn-ghost text-berry" formNoValidate>{t('delete')}</button>
            </form>
          </li>
        ))}
      </ul>
    </>
  )
}
