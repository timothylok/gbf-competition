import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import type { Browser, BrowserContext, Page } from 'puppeteer-core'
import { closeBrowser, addPlayers, banner, createCompetition, fetchHtml, generate, go, launch, listMatches, login, newPage, roster, seed, setScore, setStatus, submit } from './helpers'

describe('admin: players, matches, scores, competitions', () => {
  let browser: Browser
  let page: Page
  let comp: number
  before(async () => {
    browser = await launch()
    page = await newPage(browser)
    await login(page, 'Path Tester')
    comp = await seed(page, { name: 'Admin Paths', men: 12, women: 8 })
  })
  after(() => closeBrowser(browser))

  describe('players', () => {
    let p1 = { id: '', nick: '' }
    let p2 = { id: '', nick: '' }
    before(async () => {
      await go(page, `/admin/c/${comp}/players`)
      const list = await page.evaluate(() => [...document.forms].filter((f) => f.querySelector('[name=nickname]')).map((f) => ({ id: (f.querySelector('[name=id]') as HTMLInputElement).value, nick: (f.querySelector('[name=nickname]') as HTMLInputElement).value })))
      ;[p1, p2] = list
    })
    const row = (id: string): [string, string][] => [['id', id], ['comp', String(comp)]]

    it('shows the roster with counts', async () => {
      await go(page, `/admin/c/${comp}/players`)
      const text = await page.evaluate(() => document.body.innerText)
      assert.match(text, /20 players · 12 men · 8 women/)
    })
    it('rejects renaming to a nickname that already exists', async () => {
      await submit(page, row(p1.id), { nickname: p2.nick }, 'Save')
      assert.match((await banner(page)) ?? '', /already exists/)
    })
    it('renames to a new nickname', async () => {
      await go(page, `/admin/c/${comp}/players`)
      await submit(page, row(p1.id), { nickname: p1.nick + 'x' }, 'Save')
      assert.match((await banner(page)) ?? '', /Saved/)
      await submit(page, row(p1.id), { nickname: p1.nick }, 'Save')
    })
    it('refuses to delete a player who is in a match', async () => {
      await go(page, `/admin/c/${comp}/players`)
      await submit(page, row(p1.id), {}, 'Delete')
      assert.match((await banner(page)) ?? '', /in a match/)
    })
    it('adds and then deletes an unused player', async () => {
      await go(page, `/admin/c/${comp}/players`)
      await submit(page, [['id', String(comp)], ['text', null]], { text: 'TempPlayer, M, 3' })
      assert.match((await banner(page)) ?? '', /Created/)
      await go(page, `/admin/c/${comp}/players`)
      const id = await page.evaluate(() => (([...document.forms].find((f) => (f.querySelector('[name=nickname]') as HTMLInputElement | null)?.value === 'TempPlayer')!).querySelector('[name=id]') as HTMLInputElement).value)
      await submit(page, row(id), {}, 'Delete')
      assert.match((await banner(page)) ?? '', /Deleted/)
    })
    it('ignores duplicate nicknames when pasting a list', async () => {
      await go(page, `/admin/c/${comp}/players`)
      await submit(page, [['id', String(comp)], ['text', null]], { text: `${p1.nick}, M, 1` })
      await go(page, `/admin/c/${comp}/players`)
      const count = await page.evaluate((n) => [...document.forms].filter((f) => (f.querySelector('[name=nickname]') as HTMLInputElement | null)?.value === n).length, p1.nick)
      assert.equal(count, 1)
    })
  })

  describe('matches', () => {
    const editUrl = (id: number) => `/admin/c/${comp}/schedule?m=${id}#edit`
    let first: number

    before(async () => {
      first = (await listMatches(page, comp))[0].id
    })

    it('opens the edit form only for a match in this competition', async () => {
      const other = await seed(page, { name: 'Other comp', men: 8, women: 4 })
      const foreign = (await listMatches(page, other))[0].id
      await go(page, `/admin/c/${comp}/schedule?m=${foreign}`)
      assert.equal(await page.$('#edit'), null, 'a match from another competition must not open')
      await go(page, `/admin/c/${comp}/schedule?m=999999`)
      assert.equal(await page.$('#edit'), null)
      await go(page, editUrl(first))
      assert.notEqual(await page.$('#edit'), null)
    })
    it('saves an edit and warns when it creates a court clash', async () => {
      await go(page, editUrl(first))
      await submit(page, [['id', String(first)], ['comp', String(comp)]], { court: '2', round: '1' }, 'Save')
      assert.match((await banner(page)) ?? '', /Saved/)
      const warnings = await page.$$eval('li span[title]', (els) => els.map((e) => e.getAttribute('title')))
      assert(warnings.some((w) => /Clash/.test(w ?? '')), 'clash warning shown')
    })
    it('warns when the line-up does not fit the event type', async () => {
      await go(page, editUrl(first))
      await submit(page, [['id', String(first)], ['comp', String(comp)]], { court: '1', event: 'XD' }, 'Save')
      const warnings = await page.$$eval('li span[title]', (els) => els.map((e) => e.getAttribute('title')))
      assert(warnings.some((w) => /does not fit the event/.test(w ?? '')), 'mismatch warning shown')
      await go(page, editUrl(first))
      await submit(page, [['id', String(first)], ['comp', String(comp)]], { event: 'MD' }, 'Save')
    })
    it('rejects a line-up with the same player twice', async () => {
      await go(page, editUrl(first))
      await submit(page, [['id', String(first)], ['comp', String(comp)]], {}, undefined).catch(() => {})
      await go(page, editUrl(first))
      await page.evaluate(() => {
        const f = document.querySelector('#edit') as HTMLFormElement
        ;(f.querySelector('[name=a2]') as HTMLSelectElement).value = (f.querySelector('[name=a1]') as HTMLSelectElement).value
      })
      await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.evaluate(() => (document.querySelector('#edit') as HTMLFormElement).requestSubmit())])
      assert.match((await banner(page)) ?? '', /must be different people/)
    })
    it('adds a match by hand and deletes it again', async () => {
      await go(page, `/admin/c/${comp}/schedule`)
      const before = (await page.$$('section ul li')).length
      await page.evaluate(() => {
        const f = [...document.forms].find((x) => x.querySelector('[name=comp]') && !x.querySelector('[name=id]') && x.querySelector('[name=a1]')) as HTMLFormElement
        ;['a1', 'a2', 'b1', 'b2'].forEach((n, i) => ((f.querySelector(`[name=${n}]`) as HTMLSelectElement).selectedIndex = i + 1))
        ;(f.querySelector('[name=event]') as HTMLSelectElement).value = 'MD'
        ;(f.querySelector('[name=round]') as HTMLInputElement).value = '40'
        ;(f.querySelector('[name=court]') as HTMLInputElement).value = '1'
        f.requestSubmit()
      })
      await page.waitForNavigation({ waitUntil: 'networkidle0' })
      assert.match((await banner(page)) ?? '', /Created/)
      assert.equal((await page.$$('section ul li')).length, before + 1)
      const newest = await page.$$eval('a', (as) => as.filter((a) => a.textContent?.trim() === 'Edit').map((a) => Number(new URL((a as HTMLAnchorElement).href).searchParams.get('m'))))
      const id = Math.max(...newest)
      await go(page, editUrl(id))
      await submit(page, [['id', String(id)], ['comp', String(comp)]], {}, 'Delete')
      assert.match((await banner(page)) ?? '', /Deleted/)
      assert.equal((await page.$$('section ul li')).length, before)
    })
  })

  describe('scores', () => {
    it('saves a final, and a stale second edit is rejected (two score-keepers)', async () => {
      const ms = await listMatches(page, comp)
      const target = ms.filter((m) => m.status === 'Scheduled').at(-1)!
      const stale = await newPage(browser)
      await go(stale, `/admin/c/${comp}/scores`) // loads the same version as the first keeper
      await setScore(page, comp, target.id, 'done', '11', '9')
      assert.match((await banner(page)) ?? '', /Saved/)
      await submit(stale, [['id', String(target.id)], ['score_a', null]], { score_a: '3', score_b: '2' }, 'live')
      assert.match((await banner(stale)) ?? '', /Someone else changed this match/)
      await stale.close()
    })
    it('refuses to edit or delete a finished match', async () => {
      const done = (await listMatches(page, comp)).find((m) => m.status === 'Final')!
      await go(page, `/admin/c/${comp}/schedule?m=${done.id}#edit`)
      await submit(page, [['id', String(done.id)], ['comp', String(comp)]], { court: '5' }, 'Save')
      assert.match((await banner(page)) ?? '', /Not allowed/)
      await go(page, `/admin/c/${comp}/schedule?m=${done.id}#edit`)
      await submit(page, [['id', String(done.id)], ['comp', String(comp)]], {}, 'Delete')
      assert.match((await banner(page)) ?? '', /Not allowed/)
    })
    it('rejects a final with no score, and out-of-range scores', async () => {
      const m = (await listMatches(page, comp)).find((x) => x.status === 'Scheduled')!
      await setScore(page, comp, m.id, 'done', '', '')
      assert.match((await banner(page)) ?? '', /invalid/i)
      await go(page, `/admin/c/${comp}/scores`)
      await page.evaluate((id) => {
        const f = [...document.forms].find((x) => (x.querySelector('[name=id]') as HTMLInputElement | null)?.value === String(id))!
        ;(f.querySelector('[name=score_a]') as HTMLInputElement).removeAttribute('max')
        ;(f.querySelector('[name=score_a]') as HTMLInputElement).value = '500'
        ;(f.querySelector('[name=score_b]') as HTMLInputElement).value = '1'
      }, m.id)
      await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.evaluate((id) => ((([...document.forms].find((x) => (x.querySelector('[name=id]') as HTMLInputElement | null)?.value === String(id))!).querySelector('button[value=done]')) as HTMLButtonElement).click(), m.id)])
      assert.match((await banner(page)) ?? '', /invalid/i)
    })
    it('allows a draw, a live running score, a reset and a cancel', async () => {
      const ms = (await listMatches(page, comp)).filter((m) => m.status === 'Scheduled')
      await setScore(page, comp, ms[0].id, 'done', '12', '12')
      assert.match((await banner(page)) ?? '', /Saved/)
      await setScore(page, comp, ms[1].id, 'live', '5', '3')
      assert.equal((await listMatches(page, comp)).find((m) => m.id === ms[1].id)!.status, 'Live')
      await setScore(page, comp, ms[1].id, 'reset')
      assert.equal((await listMatches(page, comp)).find((m) => m.id === ms[1].id)!.status, 'Scheduled')
      await setScore(page, comp, ms[2].id, 'cancel')
      assert.equal((await listMatches(page, comp)).find((m) => m.id === ms[2].id)!.status, 'Cancelled')
    })
  })

  describe('competitions', () => {
    let visitor: Page
    before(async () => {
      const anon: BrowserContext = await browser.createBrowserContext()
      visitor = await newPage(anon)
    })
    const publicText = async () => (await fetchHtml(`/?c=${comp}`)).text

    it('hides a draft from visitors, shows it when Live, hides it again as Draft', async () => {
      assert.match(await publicText(), /No competition is published/)
      await setStatus(page, comp, 'live')
      assert.match(await publicText(), /Admin Paths/)
      await setStatus(page, comp, 'draft')
      assert.match(await publicText(), /No competition is published/)
    })
    it('validates the competition form', async () => {
      await go(page, `/admin/c/${comp}`)
      await page.evaluate(() => {
        const f = [...document.forms].find((x) => x.querySelector('[name=courts]') && x.querySelector('[name=status]')) as HTMLFormElement
        ;(f.querySelector('[name=courts]') as HTMLInputElement).removeAttribute('max')
        ;(f.querySelector('[name=courts]') as HTMLInputElement).value = '999'
      })
      await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.evaluate(() => ([...document.forms].find((x) => x.querySelector('[name=courts]') && x.querySelector('[name=status]')) as HTMLFormElement).requestSubmit())])
      assert.match((await banner(page)) ?? '', /invalid/i)
    })
    it('deleting needs the exact name', async () => {
      const throwaway = await createCompetition(page, 'Throwaway comp')
      await submit(page, [['id', String(throwaway)], ['confirm', null]], { confirm: 'wrong name' }, 'Delete')
      assert.match((await banner(page)) ?? '', /did not match/)
      await submit(page, [['id', String(throwaway)], ['confirm', null]], { confirm: 'Throwaway comp' }, 'Delete')
      assert.match((await banner(page)) ?? '', /Deleted/)
      assert.doesNotMatch(await page.evaluate(() => document.body.innerText), /Throwaway comp/)
    })
    it('deleting a competition removes its players and matches (no orphans, no error)', async () => {
      const c2 = await seed(page, { name: 'Cascade comp', men: 8, women: 4 })
      await go(page, `/admin/c/${c2}`)
      await submit(page, [['id', String(c2)], ['confirm', null]], { confirm: 'Cascade comp' }, 'Delete')
      assert.match((await banner(page)) ?? '', /Deleted/)
      await go(page, `/admin/c/${c2}/players`)
      assert.match(await page.evaluate(() => document.body.innerText), /404|could not be found/i)
    })
  })

  describe('audit log', () => {
    it('records who did what', async () => {
      await go(page, '/admin/audit')
      const text = await page.evaluate(() => document.body.innerText)
      for (const action of ['login', 'competition.create', 'players.add', 'schedule.generate', 'match.update', 'match.done', 'player.update']) assert.match(text, new RegExp(action.replace('.', '\\.')), action)
      assert.match(text, /Path Tester/)
    })
  })
})
