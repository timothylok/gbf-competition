import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { getT } from '@/lib/i18n'
import { setLang } from '@/lib/actions'
import './globals.css'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: { default: 'GBF Competition', template: '%s | GBF Competition' },
  description: 'Live schedule, scores and standings for Grand Badminton Family casual competitions.',
  robots: { index: true, follow: true },
}
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0a1628' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const { t, lang } = getT()
  return (
    <html lang={lang === 'zh' ? 'zh-Hant' : 'en-NZ'}>
      <body className="min-h-screen">
        <header className="bg-navy-900 text-white">
          <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 text-lg font-bold">
              <span aria-hidden className="inline-block h-3 w-3 rounded-full bg-accent" />
              {t('appName')}
            </Link>
            <nav aria-label="Main" className="ml-auto flex items-center gap-4 text-sm font-medium">
              <Link href="/events" className="text-slate-200 hover:text-white">{t('navEvents')}</Link>
              <Link href="/admin" className="text-slate-200 hover:text-white">{t('navAdmin')}</Link>
              <form action={setLang}>
                <input type="hidden" name="lang" value={lang === 'zh' ? 'en' : 'zh'} />
                <button type="submit" className="rounded border border-slate-500 px-2 py-1 text-xs hover:bg-navy-700">
                  {t('langSwitch')}
                </button>
              </form>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-4xl px-4 pb-10 text-xs text-slate-500">Grand Badminton Family</footer>
      </body>
    </html>
  )
}
