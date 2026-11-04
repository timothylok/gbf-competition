import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import type { Browser, Page } from 'puppeteer-core'
import { closeBrowser, cards, createCompetition, fetchHtml, generate, go, launch, listMatches, login, newPage, seed, setScore, setStatus, submit, tableRows, type ScoreCard } from './helpers'

describe('what a logged-out visitor sees', () => {
  let browser: Browser
  let page: Page
  let comp: number
  let mdFinal: ScoreCard, xdDraw: ScoreCard, mdLive: ScoreCard, xdLive: ScoreCard
  const q = (path: string) => `${path}${path.includes('?') ? '&' : '?'}c=${comp}`

  before(async () => {
    browser = await launch()
    page = await newPage(browser)
    await login(page, 'Public Tester')
    comp = await seed(page, { name: 'Public Cup', men: 12, women: 8 })
  })
  after(() => closeBrowser(browser))

  it('hides an unpublished (draft) competition everywhere', async () => {
    for (const path of ['/', q('/'), q('/schedule'), q('/standings')]) {
      const r = await fetchHtml(path)
      assert.match(r.text, /No competition is published yet/, path)
      assert.doesNotMatch(r.text, /Public Cup/, path)
    }
    assert.doesNotMatch((await fetchHtml('/events')).text, /Public Cup/)
    assert((await listMatches(page, comp)).length > 0, 'the draft does have matches; visitors just cannot see them')
  })

  it('publishes when set to Live and scores come through', async () => {
    await setStatus(page, comp, 'live')
    const all = await listMatches(page, comp)
    const md = all.filter((m) => m.event === 'MD' && m.status === 'Scheduled')
    const xd = all.filter((m) => m.event === 'XD' && m.status === 'Scheduled')
    ;[mdFinal, mdLive] = md
    ;[xdDraw, xdLive] = xd
    await setScore(page, comp, mdFinal.id, 'done', '15', '9')
    await setScore(page, comp, xdDraw.id, 'done', '12', '12')
    await setScore(page, comp, mdLive.id, 'live', '10', '8')
    await setScore(page, comp, xdLive.id, 'live', '7', '5')
    const r = await fetchHtml('/')
    assert.equal(r.status, 200)
    assert.match(r.text, /Public Cup/)
    assert.match(r.text, /Live/)
  })

  it('shows live matches with running scores, and finished ones as Final', async () => {
    const r = await fetchHtml('/')
    const live = cards(r.html).find((c) => mdLive.names.every((n) => c.includes(n)))!
    assert.match(live, /Live/)
    assert.match(r.html, /class="[^"]*live-badge/, 'the Live badge uses the animated style')
    assert.match(live, /\b10\b/)
    assert.match(live, /\b8\b/)
    assert.match(live, /Men's doubles/)
    const final = cards(r.html).find((c) => mdFinal.names.every((n) => c.includes(n)))!
    assert.match(final, /Final/)
    assert.match(final, /\b15\b/)
    const mixed = cards(r.html).find((c) => xdLive.names.every((n) => c.includes(n)))!
    assert.match(mixed, /Mixed doubles/)
  })

  it('labels a level result as a draw', async () => {
    const card = cards((await fetchHtml('/')).html).find((c) => xdDraw.names.every((n) => c.includes(n)))!
    assert.match(card, /Draw/)
    assert.match(card, /Final/)
  })

  it('draws the standings correctly: win 2 / draw 1, difference, shared ranks', async () => {
    const md = tableRows((await fetchHtml(q('/standings?e=MD'))).html)
    const winner = md.find((r) => r[1] === mdFinal.names[0])!
    assert.deepEqual(winner, ['T-1', mdFinal.names[0], '1', '1', '0', '0', '+6', '2'])
    const loser = md.find((r) => r[1] === mdFinal.names[2])!
    assert.deepEqual(loser, ['T-3', mdFinal.names[2], '1', '0', '0', '1', '-6', '0'])
    assert.equal(md.length - 1, 4, 'header + only the 4 players who have finished a men\'s match')

    const xd = tableRows((await fetchHtml(q('/standings?e=XD'))).html)
    const drawn = xd.find((r) => r[1] === xdDraw.names[0])!
    assert.deepEqual(drawn.slice(2), ['1', '0', '1', '0', '0', '1'])

    const all = tableRows((await fetchHtml(q('/standings'))).html)
    assert.equal(all.length - 1, 8, 'overall lists everyone with a finished match')
  })

  it('does not count live or scheduled matches in the standings', async () => {
    const rows = tableRows((await fetchHtml(q('/standings'))).html).slice(1)
    const played = rows.reduce((n, r) => n + Number(r[2]), 0)
    assert.equal(played, 8, 'two finals x four players; the two live matches add nothing')
    const finalists = new Set([...mdFinal.names, ...xdDraw.names])
    const onlyLive = [...mdLive.names, ...xdLive.names].filter((n) => !finalists.has(n))
    for (const n of onlyLive) assert(!rows.some((r) => r[1] === n), `${n} only has a live match, so must not be listed`)
  })

  it('shows a player\'s record and only their matches', async () => {
    const html = (await fetchHtml(q('/standings?e=MD'))).html
    const link = html.match(new RegExp(`href="/players/(\\d+)\\?c=${comp}"[^>]*>\\s*${mdFinal.names[0]}\\s*<`))
    assert(link, 'player link on the standings page')
    const player = await fetchHtml(`/players/${link![1]}`)
    assert.match(player.text, new RegExp(mdFinal.names[0]))
    assert.match(player.text, /Record\s*:\s*1W 0D 0L · 2 Pts · \+6/)
    for (const c of cards(player.html)) assert(c.includes(mdFinal.names[0]), 'every card is theirs')
  })

  it('filters the schedule by player', async () => {
    const html = (await fetchHtml(q('/standings?e=MD'))).html
    const id = html.match(new RegExp(`href="/players/(\\d+)\\?c=${comp}"[^>]*>\\s*${mdFinal.names[0]}\\s*<`))![1]
    const filtered = cards((await fetchHtml(q(`/schedule?p=${id}`))).html)
    assert(filtered.length >= 3 && filtered.length < 10)
    for (const c of filtered) assert(c.includes(mdFinal.names[0]))
    assert(cards((await fetchHtml(q('/schedule'))).html).length > filtered.length)
  })

  it('serves a Hong Kong Chinese version', async () => {
    const r = await fetchHtml('/', 'lang=zh')
    assert.match(r.html, /<html lang="zh-HK"/)
    assert.match(r.text, /進行中/)
    assert.match(r.text, /男子雙打/)
    assert.match(r.text, /混合雙打/)
    assert.match(r.text, /5 個場地/)
    assert.doesNotMatch(r.text, /5 場地數/)
    assert.match(r.text, /5 個場地/)
    assert.doesNotMatch(r.text, /5 場地數/)
    const s = await fetchHtml(q('/standings'), 'lang=zh')
    assert.match(s.text, /勝 2 分、和 1 分、負 0 分/)
    assert.match(s.text, /並列名次/)
    assert.match((await fetchHtml('/')).html, /<html lang="en-NZ"/)
  })

  it('lists published events but never drafts', async () => {
    await createCompetition(page, 'Secret Draft')
    const events = (await fetchHtml('/events')).text
    assert.match(events, /Public Cup/)
    assert.doesNotMatch(events, /Secret Draft/)
  })

  it('marks a finished competition as finished and stops auto-refresh', async () => {
    await setStatus(page, comp, 'finished')
    const r = await fetchHtml(q('/'))
    assert.match(r.text, /Finished/)
    assert.doesNotMatch(r.text, /This page refreshes automatically/)
  })

  it('escapes names so a nickname cannot inject markup', async () => {
    const c2 = await createCompetition(page, 'XSS Check')
    await go(page, `/admin/c/${c2}/players`)
    await submit(page, [['id', String(c2)], ['text', null]], { text: ['<img src=x onerror=alert(1)>, M, 1', 'B, M', 'C, M', 'D, M'].join('\n') })
    await generate(page, c2, { md: 1, xd: 0 })
    await setStatus(page, c2, 'live')
    const html = (await fetchHtml(`/schedule?c=${c2}`)).html
    assert.doesNotMatch(html, /<img src=x/, 'raw tag must not appear')
    assert.match(html, /&lt;img src=x/)
  })
})
