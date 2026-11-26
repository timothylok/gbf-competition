'use client'

import { drawTeamImage, type TeamImageText } from '@/lib/team-image'
import { nzTimestamp } from '@/lib/nz-time'
import type { TeamList } from '@/lib/team-lists'

/**
 * Draws the team lists as a PNG in the browser (with the New Zealand print time) and saves it.
 * `text.printed` is completed here, so the time is the moment of the click.
 */
export function TeamImageButton({ lists, text, printedLabel, nzLabel, fileName, label }: {
  lists: TeamList[]
  text: Omit<TeamImageText, 'printed'>
  printedLabel: string
  nzLabel: string
  fileName: string
  label: string
}) {
  function save() {
    const canvas = document.createElement('canvas')
    drawTeamImage(canvas, lists, { ...text, printed: `${printedLabel} ${nzTimestamp()} (${nzLabel})` })
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    }, 'image/png')
  }
  return (
    <button type="button" onClick={save} className="btn-ghost" data-testid="teams-link">
      {label}
    </button>
  )
}
