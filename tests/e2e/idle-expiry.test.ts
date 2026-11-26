import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import type { Browser, Page } from 'puppeteer-core'
import { closeBrowser, go, here, launch, login, newPage } from './helpers'

// The runner starts this file's app with ADMIN_IDLE_MINUTES=0.05 (3 seconds).
describe('an idle admin is signed out', () => {
  let browser: Browser
  let alice: Page
  before(async () => {
    browser = await launch()
    alice = await newPage(await browser.createBrowserContext())
  })
  after(() => closeBrowser(browser))

  it('keeps an admin signed in while they are active', async () => {
    await login(alice, 'Alice')
    assert.equal(here(alice), '/admin')
    await go(alice, '/admin/audit')
    assert.equal(here(alice), '/admin/audit')
  })

  it('signs an admin out after they have been idle past the limit', async () => {
    await new Promise((r) => setTimeout(r, 4500))
    await go(alice, '/admin')
    assert.equal(here(alice), '/admin/login')
    assert.match(await alice.evaluate(() => document.body.innerText), /inactive for too long/)
  })

  it('lets the same admin sign in again', async () => {
    await login(alice, 'Alice')
    assert.equal(here(alice), '/admin')
  })
})
