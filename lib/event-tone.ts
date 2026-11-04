import type { EventType } from './types'

/**
 * Event colours, all from the Pantone palette in tailwind.config.ts:
 * men's doubles = Classic Blue (+ Serenity tint), mixed doubles = Honeysuckle (+ Rose Quartz tint).
 * Text on blue is Bright White; text on pink is Black 6 C (better contrast than white on pink).
 */
export const TONE: Record<
  EventType,
  { band: string; tint: string; win: string; border: string; side: string; chip: string }
> = {
  MD: {
    band: 'bg-blue text-paper',
    tint: 'bg-sky/40 text-blue',
    win: 'bg-blue text-paper',
    border: 'border-blue',
    side: 'border-l-blue',
    chip: 'bg-blue text-paper',
  },
  XD: {
    band: 'bg-pink text-ink',
    tint: 'bg-rose text-ink',
    win: 'bg-pink text-ink',
    border: 'border-pink',
    side: 'border-l-pink',
    chip: 'bg-pink text-ink',
  },
}
