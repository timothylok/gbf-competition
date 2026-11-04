import { requireAdmin } from '@/lib/auth'
import { query } from '@/lib/db'
import { getT } from '@/lib/i18n'

export default async function AuditPage() {
  await requireAdmin()
  const { t } = getT()
  const rows = await query<{ id: number; at: string; actor: string; action: string; detail: string }>(
    'SELECT id, at, actor, action, detail FROM audit_log ORDER BY id DESC LIMIT 200',
  )
  return (
    <>
      <h1 className="mb-3 text-xl font-bold text-ink">{t('audit')}</h1>
      <div className="glass overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-mist/40 text-left text-xs uppercase text-ink/75">
            <tr>
              <th className="px-3 py-2">{t('when')}</th>
              <th className="px-3 py-2">{t('who')}</th>
              <th className="px-3 py-2">{t('action')}</th>
              <th className="px-3 py-2">{t('detail')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap px-3 py-2">{new Date(r.at).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' })}</td>
                <td className="px-3 py-2">{r.actor}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.action}</td>
                <td className="px-3 py-2 text-ink/75">{r.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
