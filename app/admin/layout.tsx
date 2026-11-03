import type { Metadata } from 'next'
import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { logout } from '@/lib/actions'
import { getT } from '@/lib/i18n'

export const metadata: Metadata = { title: 'Admin', robots: { index: false, follow: false } }

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { t } = getT()
  const session = await getSession()
  return (
    <>
      <div className="mb-5 flex items-center gap-3 rounded-lg bg-accent-subtle px-4 py-2 text-sm">
        <Link href="/admin" className="font-bold text-navy-900">{t('adminTitle')}</Link>
        {session && (
          <>
            <Link href="/admin/audit" className="text-slate-700 hover:underline">{t('audit')}</Link>
            <span className="ml-auto text-slate-600">{session.name}</span>
            <form action={logout}><button className="btn-ghost !py-1">{t('logout')}</button></form>
          </>
        )}
      </div>
      {children}
    </>
  )
}
