import type { TeamList } from './team-lists'

/** Words on the image, already translated by the page. */
export interface TeamImageText {
  title: string
  subtitle: string
  teamNames: { F: string; R: string }
  men: string
  women: string
  players: string
  rights: string
  printed: string
}

const INK = '#101820', STONE = '#53565A', MIST = '#D9D9D6', CLOUD = '#F0EEE9', PAPER = '#F4F5F0', SUN = '#F5DF4D'
const COLOR = { F: '#00A9E0', R: '#FF5FA2' } as const
const FONT = '"Segoe UI", system-ui, "PingFang HK", "Noto Sans HK", "Microsoft JhengHei", sans-serif'
export const IMAGE_WIDTH = 1600
const PANEL_W = 736, ROW = 34, HEAD = 130, BLOCK_PAD = 32

const blockHeight = (g: { men: string[]; women: string[] }) => 36 + Math.max(g.men.length, g.women.length) * ROW + BLOCK_PAD + 2
const panelHeight = (l: TeamList) => HEAD + l.grades.reduce((n, g) => n + blockHeight(g), 0)

/** Height of the finished image for these lists. */
export function imageHeight(lists: TeamList[]): number {
  return 48 + 50 + 36 + 24 + Math.max(...lists.map(panelHeight)) + 24 + 80 + 48
}

/**
 * Draws the two team lists (Philippines, then the rest) on a canvas: headline, one panel per team, each grade with
 * its men and women, then the rights notice and the print time. Pantone palette only. Runs in the browser, so the
 * visitor's own fonts draw Chinese nicknames.
 */
export function drawTeamImage(canvas: HTMLCanvasElement, lists: TeamList[], text: TeamImageText): void {
  const W = IMAGE_WIDTH
  const H = imageHeight(lists)
  canvas.width = W
  canvas.height = H
  const c = canvas.getContext('2d')!
  const label = (s: string, x: number, y: number, size: number, bold = false, color = INK, align: CanvasTextAlign = 'left') => {
    c.font = `${bold ? 700 : 400} ${size}px ${FONT}`
    c.fillStyle = color
    c.textAlign = align
    c.textBaseline = 'middle'
    c.fillText(s, x, y)
  }
  const round = (x: number, y: number, w: number, h: number, r: number, fill: string, stroke?: string) => {
    c.beginPath()
    c.roundRect(x, y, w, h, r)
    c.fillStyle = fill
    c.fill()
    if (stroke) {
      c.lineWidth = 3
      c.strokeStyle = stroke
      c.stroke()
    }
  }

  c.fillStyle = CLOUD
  c.fillRect(0, 0, W, H)
  label(text.title, 48, 48 + 25, 50, true)
  label(text.subtitle, 48, 48 + 50 + 18, 22, false, STONE)

  const top = 48 + 50 + 36 + 24
  lists.forEach((l, i) => {
    const x = 48 + i * (PANEL_W + 28)
    const h = panelHeight(l)
    const color = COLOR[l.key]
    c.save()
    c.beginPath()
    c.roundRect(x, top, PANEL_W, h, 24)
    c.clip()
    c.fillStyle = PAPER
    c.fillRect(x, top, PANEL_W, h)
    c.fillStyle = color
    c.fillRect(x, top, PANEL_W, HEAD)
    label(text.teamNames[l.key], x + 28, top + 48, 42, true)
    label(`${l.men} ${text.men} · ${l.women} ${text.women}`, x + 28, top + 98, 22)
    label(String(l.count), x + PANEL_W - 28, top + 48, 64, true, INK, 'right')
    label(text.players, x + PANEL_W - 28, top + 98, 18, false, INK, 'right')
    let y = top + HEAD
    for (const g of l.grades) {
      c.fillStyle = MIST
      c.fillRect(x, y, PANEL_W, 2)
      round(x + 24, y + 18, 60, 60, 14, INK)
      label(g.letter, x + 24 + 30, y + 18 + 31, 36, true, PAPER, 'center')
      const colW = (PANEL_W - 24 - 60 - 16 - 24) / 2
      ;([[g.men, text.men], [g.women, text.women]] as const).forEach(([names, head], k) => {
        const cx = x + 24 + 60 + 16 + k * colW
        label(`${head} · ${names.length}`, cx, y + 16 + 18, 18, false, STONE)
        names.forEach((n, j) => label(n, cx, y + 16 + 36 + j * ROW + ROW / 2, 21, true))
      })
      y += blockHeight(g)
    }
    c.restore()
    c.lineWidth = 3
    c.strokeStyle = color
    c.beginPath()
    c.roundRect(x, top, PANEL_W, h, 24)
    c.stroke()
  })

  const fy = H - 48 - 52
  c.fillStyle = SUN
  c.fillRect(48, fy, W - 96, 3)
  label(text.rights, W / 2, fy + 24, 16, false, STONE, 'center')
  label(text.printed, W / 2, fy + 52, 18, true, INK, 'center')
}
