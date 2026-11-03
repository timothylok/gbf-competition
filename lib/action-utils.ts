import { redirect } from 'next/navigation'

/** Redirect back to a page with a one-shot banner code (?ok=... or ?err=...). */
export function back(path: string, kind: 'ok' | 'err', code: string): never {
  const sep = path.includes('?') ? '&' : '?'
  redirect(`${path}${sep}${kind}=${code}`)
}

export interface ParsedPlayer {
  nickname: string
  gender: 'M' | 'F'
  grade: number | null
}

const GENDERS: Record<string, 'M' | 'F'> = { m: 'M', male: 'M', 男: 'M', f: 'F', female: 'F', 女: 'F' }

/** Parse "nickname, M|F, grade?" lines. Invalid lines are skipped and counted. */
export function parsePlayerLines(text: string): { players: ParsedPlayer[]; skipped: number } {
  const players: ParsedPlayer[] = []
  const seen = new Set<string>()
  let skipped = 0
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const parts = line.split(/[,，\t;；]/).map((s) => s.trim())
    const nickname = (parts[0] ?? '').replace(/[\u0000-\u001f]/g, '').slice(0, 30)
    const gender = GENDERS[(parts[1] ?? '').toLowerCase()]
    const gradeRaw = parts[2]
    const grade = gradeRaw ? Number(gradeRaw) : null
    const gradeOk = grade === null || (Number.isInteger(grade) && grade >= 1 && grade <= 9)
    if (!nickname || !gender || !gradeOk || seen.has(nickname.toLowerCase())) {
      skipped++
      continue
    }
    seen.add(nickname.toLowerCase())
    players.push({ nickname, gender, grade })
  }
  return { players, skipped }
}
