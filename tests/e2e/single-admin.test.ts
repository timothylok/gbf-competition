import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import type { Browser, Page } from 'puppeteer-core'
import { closeBrowser, PASSWORD, banner, go, here, launch, login, logout, newPage } from './helpers'

// Two browser contexts = two separate people (separate cookie jars).
describe('only one admin can be signed in at a time', () => {
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

  it('refuses a second admin with the right password and names the holder', async () => {
    await login(bob, 'Bob')
    assert.equal(here(bob), '/admin/login')
    const msg = (await banner(bob)) ?? ''
    assert.match(msg, /Another admin \(Alice\) is signed in/)
    assert.match(msg, /Only one admin at a time/)
    assert.match(msg, /about \d+ min/)
  })

  it('does not reveal who is signed in to someone with the wrong password', async () => {
    await login(bob, 'Mallory', 'a-wrong-password')
    const msg = (await banner(bob)) ?? ''
    assert.match(msg, /Wrong password/)
    assert.doesNotMatch(msg, /Alice/)
  })

  it('keeps the first admin signed in after the refused attempts', async () => {
    await go(alice, '/admin')
    assert.equal(here(alice), '/admin')
  })

  it('refuses the same name from another device too', async () => {
    const other = await newPage(await browser.createBrowserContext())
    await login(other, 'Alice')
    assert.equal(here(other), '/admin/login')
    assert.match((await banner(other)) ?? '', /Another admin/)
  })

  it('frees the lock the moment the holder signs out', async () => {
    await logout(alice)
    assert.equal(here(alice), '/admin/login')
    await login(bob, 'Bob', PASSWORD)
    assert.equal(here(bob), '/admin')
  })

  it('now blocks Alice, naming Bob', async () => {
    await login(alice, 'Alice')
    assert.equal(here(alice), '/admin/login')
    assert.match((await banner(alice)) ?? '', /Another admin \(Bob\)/)
  })

  it('a signed-out session cannot get back in with its old cookie', async () => {
    await go(alice, '/admin')
    assert.equal(here(alice), '/admin/login')
  })
})
