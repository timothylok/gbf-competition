import { redirect } from 'next/navigation'

/** The old plain-HTML printout is gone: the print button now gives the PDF. Old links still work. */
export default function PrintSchedule({ searchParams }: { searchParams: { c?: string; by?: string } }) {
  const q = new URLSearchParams()
  if (searchParams.c) q.set('c', searchParams.c)
  if (searchParams.by === 'court' || searchParams.by === 'time') q.set('by', searchParams.by)
  redirect(`/schedule/pdf${q.toString() ? `?${q}` : ''}`)
}
