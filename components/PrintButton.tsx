'use client'

/** Opens the browser's print dialog (also the way to save the schedule as a PDF). */
export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="btn-accent">
      {label}
    </button>
  )
}
