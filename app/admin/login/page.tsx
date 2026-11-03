import { redirect } from 'next/navigation'
import { LoginForm } from '@/components/LoginForm'
import { getSession } from '@/lib/auth'
import { getT } from '@/lib/i18n'

export default async function LoginPage() {
  if (await getSession()) redirect('/admin')
  const { t } = getT()
  const labels = Object.fromEntries(
    (['yourName', 'password', 'login', 'errInvalid', 'errLocked', 'errConfig', 'errName'] as const).map((k) => [k, t(k)]),
  )
  return (
    <div className="card mx-auto max-w-sm">
      <h1 className="mb-4 text-xl font-bold text-navy-900">{t('adminTitle')}</h1>
      <LoginForm labels={labels} />
    </div>
  )
}
