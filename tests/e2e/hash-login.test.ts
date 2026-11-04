import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import type { Browser, Page } from 'puppeteer-core'
import { closeBrowser, banner, here, launch, login, logout, newPage, PASSWORD } from './helpers'

// The runner starts this file's app with ADMIN_PASSWORD blank and only ADMIN_PASSWORD_HASH_B64 set.
// PASSWORD (E2E_PASSWORD) is the real hashed password; E2E_PLAIN_PASSWORD is the default one, which must NOT work here.
describe('sign-in with a bcrypt-hashed password (ADMIN_PASSWORD_HASH_B64)', () => {
  let browser: Browser
  let page: Page
  before(async () => {
    browser = await launch()
    page = await newPage(browser)
  })
  after(() => closeBrowser(browser))

  it('rejects the plain default password', async () => {
    await login(page, 'Hash Tester', process.env.E2E_PLAIN_PASSWORD ?? 'e2e-password-123')
    assert.equal(here(page), '/admin/login')
    assert.match((await banner(page)) ?? '', /Wrong password/)
  })

  it('accepts the correct password for the stored hash', async () => {
    await login(page, 'Hash Tester', PASSWORD)
    assert.equal(here(page), '/admin')
  })

  it('signs out cleanly', async () => {
    await logout(page)
    assert.equal(here(page), '/admin/login')
  })
})
