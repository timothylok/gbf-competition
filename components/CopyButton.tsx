'use client'

import { useState } from 'react'

/** Copies the text of the textarea with the given id (falls back to selecting it). */
export function CopyButton({ targetId, label, doneLabel }: { targetId: string; label: string; doneLabel: string }) {
  const [done, setDone] = useState(false)
  async function copy() {
    const el = document.getElementById(targetId) as HTMLTextAreaElement | null
    if (!el) return
    el.select()
    try {
      await navigator.clipboard.writeText(el.value)
    } catch {
      document.execCommand('copy') // older browsers: the text is already selected
    }
    setDone(true)
    setTimeout(() => setDone(false), 2000)
  }
  return (
    <button type="button" onClick={copy} className="btn-accent" aria-live="polite">
      {done ? doneLabel : label}
    </button>
  )
}
