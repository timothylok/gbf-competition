'use client'

import type { ReactNode } from 'react'

/** A submit button that asks "are you sure?" first. With no message it behaves like a normal button. */
export function ConfirmButton({ message, className, children }: { message?: string; className?: string; children: ReactNode }) {
  return (
    <button
      className={className}
      onClick={(e) => {
        if (message && !window.confirm(message)) e.preventDefault()
      }}
    >
      {children}
    </button>
  )
}
