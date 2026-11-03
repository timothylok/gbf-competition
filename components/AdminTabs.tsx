'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function AdminTabs({ id, labels }: { id: number; labels: { overview: string; players: string; schedule: string; scores: string } }) {
  const path = usePathname()
  const tabs = [
    { href: `/admin/c/${id}`, label: labels.overview },
    { href: `/admin/c/${id}/players`, label: labels.players },
    { href: `/admin/c/${id}/schedule`, label: labels.schedule },
    { href: `/admin/c/${id}/scores`, label: labels.scores },
  ]
  return (
    <nav aria-label="Competition sections" className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => {
        const active = path === t.href
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-semibold ${active ? 'border-accent text-navy-900' : 'border-transparent text-slate-500 hover:text-navy-900'}`}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
