import { redirect } from 'next/navigation'
import { LoginForm } from '@/components/LoginForm'
import { getSession } from '@/lib/auth'
import { getT } from '@/lib/i18n'

export default async function LoginPage({ searchParams }: { searchParams: { out?: string } }) {
  if (await getSession()) redirect('/admin')
  const { t } = getT()
  const labels = Object.fromEntries(
    (['yourName', 'password', 'login', 'errInvalid', 'errLocked', 'errConfig', 'errName'] as const).map((k) => [k, t(k)]),
  )
  return (
    <div className="card mx-auto max-w-sm">
      <h1 className="mb-4 text-xl font-bold text-ink">{t('adminTitle')}</h1>
      {searchParams.out && <p role="status" className="mb-4 rounded-lg border-l-4 border-sun bg-sun/10 px-3 py-2 text-sm font-medium text-ink">{t('signedOutNotice')}</p>}
      <LoginForm labels={labels} />
    </div>
  )
}
