import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import type { Browser, Page } from 'puppeteer-core'
import { closeBrowser, PASSWORD, banner, fetchHtml, go, here, launch, login, newPage } from './helpers'

describe('login lockout (5 failures per address in 15 minutes)', () => {
  let browser: Browser
  let page: Page
  before(async () => {
    browser = await launch()
    page = await newPage(browser)
  })
  after(() => closeBrowser(browser))

  it('says "wrong password" for each of the first five failures', async () => {
    for (let i = 1; i <= 5; i++) {
      await login(page, 'Mallory', `wrong-${i}`)
      assert.match((await banner(page)) ?? '', /Wrong password/, `attempt ${i}`)
    }
  })

  it('then refuses even the CORRECT password', async () => {
    await login(page, 'Mallory', PASSWORD)
    assert.equal(here(page), '/admin/login')
    assert.match((await banner(page)) ?? '', /Too many attempts/)
  })

  it('stays locked on a fresh browser from the same address', async () => {
    const other = await newPage(await browser.createBrowserContext())
    await login(other, 'Someone Else', PASSWORD)
    assert.match((await banner(other)) ?? '', /Too many attempts/)
  })

  it('does not stop ordinary visitors from viewing the public pages', async () => {
    assert.equal((await fetchHtml('/')).status, 200)
    assert.equal((await fetchHtml('/events')).status, 200)
    await go(page, '/standings')
    assert.equal(here(page), '/standings')
  })
})
