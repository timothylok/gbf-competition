import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import type { Browser, Page } from 'puppeteer-core'
import { closeBrowser, go, here, launch, login, newPage } from './helpers'

// The runner starts this file's app with ADMIN_IDLE_MINUTES=0.05 (3 seconds).
describe('the admin lock frees itself after inactivity', () => {
  let browser: Browser
  let alice: Page
  let bob: Page
  before(async () => {
    browser = await launch()
    alice = await newPage(await browser.createBrowserContext())
    bob = await newPage(await browser.createBrowserContext())
  })
  after(() => closeBrowser(browser))

  it('blocks a second admin while the first is active', async () => {
    await login(alice, 'Alice')
    assert.equal(here(alice), '/admin')
    await login(bob, 'Bob')
    assert.equal(here(bob), '/admin/login')
  })

  it('lets the second admin in once the first has been idle past the limit', async () => {
    await new Promise((r) => setTimeout(r, 4500))
    await login(bob, 'Bob')
    assert.equal(here(bob), '/admin')
  })

  it('ends the idle admin\'s session on their next click', async () => {
    await go(alice, '/admin')
    assert.equal(here(alice), '/admin/login')
  })
})
