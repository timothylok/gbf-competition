import type { EventType } from './types'

/**
 * Event colours, all from the Pantone palette in tailwind.config.ts:
 * men's doubles = PANTONE 2995 C (#00A9E0), mixed doubles = PANTONE 812 C (neon pink).
 * Header strips and winning scores are solid colour; the glass panel body takes a light wash of the
 * same colour. Both colours are light, so text on them is Black 6 C (white on 2995 C is 2.5:1, on 812 C 2.6:1).
 */
export const TONE: Record<
  EventType,
  { band: string; wash: string; tint: string; win: string; side: string; chip: string }
> = {
  MD: {
    band: 'bg-blue text-ink',
    wash: 'bg-blue/10',
    tint: 'bg-blue/15 text-ink',
    win: 'bg-blue text-ink',
    side: 'border-l-blue',
    chip: 'bg-blue text-ink',
  },
  XD: {
    band: 'bg-pink text-ink',
    wash: 'bg-pink/15',
    tint: 'bg-pink/25 text-ink',
    win: 'bg-pink text-ink',
    side: 'border-l-pink',
    chip: 'bg-pink text-ink',
  },
}
