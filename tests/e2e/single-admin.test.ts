import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import type { Browser, Page } from 'puppeteer-core'
import { closeBrowser, PASSWORD, banner, go, here, launch, login, logout, newPage } from './helpers'

// Two browser contexts = two separate people (separate cookie jars).
describe('only one admin at a time: a new sign-in signs the previous one out', () => {
  let browser: Browser
  let alice: Page
  let bob: Page
  before(async () => {
    browser = await launch()
    alice = await newPage(await browser.createBrowserContext())
    bob = await newPage(await browser.createBrowserContext())
  })
  after(() => closeBrowser(browser))

  it('lets the first admin in', async () => {
    await login(alice, 'Alice')
    assert.equal(here(alice), '/admin')
  })

  it('a second admin signing in signs the first one out', async () => {
    await login(bob, 'Bob')
    assert.equal(here(bob), '/admin', 'the newest sign-in is let in')
    await go(alice, '/admin')
    assert.equal(here(alice), '/admin/login', 'Alice is sent to the login page on her next click')
    assert.match(await alice.evaluate(() => document.body.innerText), /You were signed out: another admin signed in/)
  })

  it("Alice's old cookie no longer works on any admin page", async () => {
    for (const path of ['/admin', '/admin/audit']) {
      await go(alice, path)
      assert.equal(here(alice), '/admin/login')
    }
  })

  it('a wrong password takes nothing over', async () => {
    await login(alice, 'Mallory', 'a-wrong-password')
    assert.match((await banner(alice)) ?? '', /Wrong password/)
    await go(bob, '/admin')
    assert.equal(here(bob), '/admin', 'Bob is still signed in')
  })

  it('the same name from another device also takes over', async () => {
    const other = await newPage(await browser.createBrowserContext())
    await login(other, 'Bob')
    assert.equal(here(other), '/admin')
    await go(bob, '/admin')
    assert.equal(here(bob), '/admin/login')
    await logout(other)
  })

  it('signing out frees the lock; the next sign-in is simply let in', async () => {
    await login(alice, 'Alice')
    assert.equal(here(alice), '/admin')
    await logout(alice)
    assert.equal(here(alice), '/admin/login')
    await login(bob, 'Bob', PASSWORD)
    assert.equal(here(bob), '/admin')
  })

  it('a signed-out session cannot get back in with its old cookie', async () => {
    await go(alice, '/admin')
    assert.equal(here(alice), '/admin/login')
  })
})
