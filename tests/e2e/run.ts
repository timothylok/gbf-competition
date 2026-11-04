/**
 * End-to-end runner. For EACH test file it starts a throwaway copy of the app (own port, own embedded
 * database, own build folder, random secrets), runs the file against it, then stops it. So the
 * login lockout and the single-admin lock in one file can never interfere with another.
 *
 *   npm run test:e2e                 # all files
 *   npm run test:e2e -- security     # only files whose name contains "security"
 *
 * Safety: DATABASE_URL is forced empty, so these tests can never touch a real (Neon) database.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'

const ROOT = join(__dirname, '..', '..')
const PORT = Number(process.env.E2E_PORT ?? 3200)
const BASE = `http://127.0.0.1:${PORT}`
const PASSWORD = 'e2e-password-123'
const HASHED_PASSWORD = 'e2e-hashed-password-456'

// Per-file server environment. Everything else uses the defaults below.
const FILE_ENV: Record<string, Record<string, string>> = {
  'hash-login': { ADMIN_PASSWORD: '', ADMIN_PASSWORD_HASH_B64: Buffer.from(bcrypt.hashSync(HASHED_PASSWORD, 10)).toString('base64') },
  'idle-expiry': { ADMIN_IDLE_MINUTES: '0.05' }, // 3 seconds
}

const filter = process.argv[2]
const files = readdirSync(join(ROOT, 'tests', 'e2e'))
  .filter((f) => f.endsWith('.test.ts'))
  .filter((f) => !filter || f.includes(filter))
  .sort()

function killTree(child: ChildProcess) {
  if (!child.pid) return
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  else child.kill('SIGKILL')
}

async function waitForServer(child: ChildProcess, log: () => string) {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('app exited early:\n' + log())
    try {
      const r = await fetch(BASE + '/admin/login', { redirect: 'manual' })
      if (r.status === 200) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('app did not start in 120s:\n' + log())
}

async function runFile(file: string): Promise<boolean> {
  const name = file.replace('.test.ts', '')
  const tmpRoot = join(ROOT, '.e2e-tmp')
  mkdirSync(tmpRoot, { recursive: true })
  const dbDir = mkdtempSync(join(tmpRoot, 'db-'))
  const env: Record<string, string | undefined> = {
    ...process.env,
    DATABASE_URL: '', // never a real database
    PGLITE_DIR: dbDir,
    NEXT_DIST_DIR: '.next-test',
    SESSION_SECRET: randomBytes(32).toString('hex'),
    ADMIN_PASSWORD: PASSWORD,
    ADMIN_PASSWORD_HASH_B64: '',
    ADMIN_IDLE_MINUTES: '',
    NODE_ENV: undefined, // let Next.js pick development
    NEXT_TELEMETRY_DISABLED: '1',
    ...(FILE_ENV[name] ?? {}),
  }

  console.log(`\n━━ ${file} — starting a fresh app on ${BASE}`)
  let output = ''
  const server: ChildProcess = spawn(process.execPath, [join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next'), 'dev', '-p', String(PORT)], { cwd: ROOT, env: env as NodeJS.ProcessEnv, stdio: ['ignore', 'pipe', 'pipe'] })
  server.stdout?.on('data', (d: Buffer) => (output += d))
  server.stderr?.on('data', (d: Buffer) => (output += d))
  try {
    await waitForServer(server, () => output.slice(-2000))
    const r = spawnSync(process.execPath, ['--import', 'tsx', '--test', '--test-force-exit', '--test-reporter=spec', join('tests', 'e2e', file)], {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, E2E_BASE: BASE, E2E_PASSWORD: HASHED_PASSWORD_FOR(name), E2E_PLAIN_PASSWORD: PASSWORD },
    })
    return r.status === 0
  } catch (e) {
    console.error(String(e))
    return false
  } finally {
    killTree(server)
    await new Promise((r) => setTimeout(r, 1500))
    rmSync(dbDir, { recursive: true, force: true })
  }
}

// The hash-login file signs in with the hashed password; every other file uses the plain one.
function HASHED_PASSWORD_FOR(name: string) {
  return name === 'hash-login' ? HASHED_PASSWORD : PASSWORD
}

async function main() {
  if (files.length === 0) {
    console.error('no e2e test files matched')
    process.exit(1)
  }
  const results: [string, boolean][] = []
  for (const f of files) results.push([f, await runFile(f)])
  console.log('\n━━ summary')
  for (const [f, ok] of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${f}`)
  rmSync(join(ROOT, '.e2e-tmp'), { recursive: true, force: true })
  process.exit(results.every(([, ok]) => ok) ? 0 : 1)
}
main()
