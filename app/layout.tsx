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
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#101820' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const { t, lang } = getT()
  return (
    <html lang={lang === 'zh' ? 'zh-HK' : 'en-NZ'}>
      <body className="min-h-screen">
        {/* Soft Pantone colour fields so the glass panels have something to frost */}
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute -left-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-blue/25 blur-3xl" />
          <div className="absolute -right-24 top-24 h-[26rem] w-[26rem] rounded-full bg-pink/35 blur-3xl" />
          <div className="absolute -bottom-32 left-1/4 h-[28rem] w-[28rem] rounded-full bg-sun/35 blur-3xl" />
          <div className="absolute -bottom-24 -right-24 h-[24rem] w-[24rem] rounded-full bg-sky/50 blur-3xl" />
        </div>
        <header className="bg-ink text-paper">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 whitespace-nowrap py-2 text-base font-bold sm:text-lg">
              <span aria-hidden className="inline-block h-3 w-3 rounded-full bg-sun" />
              {t('appName')}
            </Link>
            <nav aria-label="Main" className="ml-auto flex items-center gap-3 whitespace-nowrap text-sm font-medium sm:gap-4">
              <Link href="/events" className="py-2 text-mist hover:text-paper">{t('navEvents')}</Link>
              <Link href="/admin" className="py-2 text-mist hover:text-paper">{t('navAdmin')}</Link>
              <form action={setLang}>
                <input type="hidden" name="lang" value={lang === 'zh' ? 'en' : 'zh'} />
                <button type="submit" className="whitespace-nowrap rounded border border-stone px-2.5 py-2 text-xs hover:bg-stone/40">
                  {t('langSwitch')}
                </button>
              </form>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-4xl px-4 pb-10 text-xs text-ink/75">Grand Badminton Family</footer>
      </body>
    </html>
  )
}
