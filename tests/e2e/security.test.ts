import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { SignJWT } from 'jose'
import { BASE, fetchHtml } from './helpers'

describe('security: headers, access control, forged sessions', () => {
  it('sends the security headers on public pages', async () => {
    const r = await fetch(BASE + '/')
    const csp = r.headers.get('content-security-policy') ?? ''
    assert.match(csp, /frame-ancestors 'none'/)
    assert.match(csp, /default-src 'self'/)
    assert.match(csp, /form-action 'self'/)
    assert.equal(r.headers.get('x-frame-options'), 'DENY')
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff')
    assert.match(r.headers.get('strict-transport-security') ?? '', /max-age=\d+/)
    assert.equal(r.headers.get('referrer-policy'), 'strict-origin-when-cross-origin')
    assert.equal(r.headers.get('x-powered-by'), null, 'does not advertise the framework')
  })

  for (const path of ['/admin', '/admin/audit', '/admin/c/1', '/admin/c/1/players', '/admin/c/1/schedule', '/admin/c/1/scores']) {
    it(`redirects a logged-out visitor from ${path} to the login page`, async () => {
      const r = await fetchHtml(path)
      assert.equal(r.status, 307)
      assert.match(r.location ?? '', /\/admin\/login$/)
    })
  }

  it('rejects garbage, and a token signed with the wrong secret', async () => {
    const forged = await new SignJWT({ name: 'Mallory', sid: 'x', pv: 'x' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('this-is-not-the-real-session-secret-0000'))
    for (const token of ['abc.def.ghi', 'not-a-jwt', forged]) {
      const r = await fetchHtml('/admin', `gbf_admin=${token}`)
      assert.equal(r.status, 307, 'forged cookie must not reach /admin')
      assert.match(r.location ?? '', /\/admin\/login$/)
    }
  })

  it('rejects an unsigned (alg=none) token', async () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ name: 'Mallory', sid: 'x', pv: 'x', exp: 9999999999 })}.`
    const r = await fetchHtml('/admin', `gbf_admin=${none}`)
    assert.equal(r.status, 307)
  })

  it('keeps admin pages out of search engines', async () => {
    const r = await fetchHtml('/admin/login')
    assert.equal(r.status, 200)
    assert.match(r.html, /<meta name="robots" content="noindex/)
  })

  it('shows a friendly empty state or 404 for unknown things, never an error page', async () => {
    assert.equal((await fetchHtml('/players/999999')).status, 404)
    assert.equal((await fetchHtml('/players/abc')).status, 404)
    assert.equal((await fetchHtml('/no-such-page')).status, 404)
    const unknownComp = await fetchHtml('/?c=999999')
    assert.equal(unknownComp.status, 200)
    assert.match(unknownComp.text, /No competition is published yet/)
    assert.equal((await fetchHtml('/?c=<script>alert(1)</script>')).status, 200)
  })

  it('does not expose source or secrets', async () => {
    for (const path of ['/.env', '/.env.local', '/package.json', '/lib/auth.ts', '/.pglite']) {
      const r = await fetchHtml(path)
      assert.equal(r.status, 404, `${path} must not be served`)
    }
  })
})
