'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { login } from '@/lib/actions'

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {label}
    </button>
  )
}

export function LoginForm({ labels }: { labels: Record<string, string> }) {
  const [state, action] = useFormState(login, undefined)
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="name" className="label">{labels.yourName}</label>
        <input id="name" name="name" className="input" required maxLength={40} autoComplete="name" />
      </div>
      <div>
        <label htmlFor="password" className="label">{labels.password}</label>
        <input id="password" name="password" type="password" className="input" required autoComplete="current-password" />
      </div>
      {state?.error && (
        <p role="alert" className="rounded-lg bg-berry/10 px-3 py-2 text-sm font-medium text-berry">
          {labels[state.error]
            .replace('{who}', state.who ?? '')
            .replace('{mins}', String(state.mins ?? ''))}
        </p>
      )}
      <Submit label={labels.login} />
    </form>
  )
}
