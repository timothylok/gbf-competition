import { getT, type Key } from '@/lib/i18n'

/** One-shot message from ?ok=code / ?err=code (set by server actions). */
export function Banner({ ok, err }: { ok?: string; err?: string }) {
  const { t } = getT()
  const pick = (kind: 'ok' | 'err', code?: string) => {
    if (!code) return null
    const key = `${kind}_${code}` as Key
    try {
      return t(key) ?? null
    } catch {
      return null
    }
  }
  const okMsg = pick('ok', ok)
  const errMsg = pick('err', err)
  if (!okMsg && !errMsg) return null
  return (
    <div
      role={errMsg ? 'alert' : 'status'}
      className={`mb-4 rounded-lg px-4 py-3 text-sm font-medium ${errMsg ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}
    >
      {errMsg ?? okMsg}
    </div>
  )
}
