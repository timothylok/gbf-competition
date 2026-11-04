import type { Config } from 'tailwindcss'

/**
 * Pantone-only palette. `theme.colors` is replaced (not extended), so any class that uses a
 * non-Pantone colour (slate-500, red-700, white, ...) produces no style, and `npm test` flags it.
 * Pantone publishes no official hex values; these are the widely used digital approximations.
 */
const pantone = {
  ink: '#101820', //    PANTONE Black 6 C           text, dark surfaces
  stone: '#53565A', //  PANTONE Cool Gray 11 C      secondary text
  mist: '#D9D9D6', //   PANTONE Cool Gray 1 C       borders, quiet chips
  cloud: '#F0EEE9', //  PANTONE 11-4201 Cloud Dancer   page background
  paper: '#F4F5F0', //  PANTONE 11-0601 Bright White   cards, text on dark
  blue: '#00A9E0', //   PANTONE 2995 C                 men's doubles, primary (light: use dark text on it)
  sky: '#91A8D0', //    PANTONE 15-3919 Serenity       men's doubles tint
  pink: '#FF5FA2', //   PANTONE 812 C                  mixed doubles (neon pink)
  sun: '#F5DF4D', //    PANTONE 13-0647 Illuminating   live, highlights, focus
  leaf: '#88B04B', //   PANTONE 15-0343 Greenery       final / success
  berry: '#BB2649', //  PANTONE 18-1750 Viva Magenta   errors, destructive
}

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.ts'],
  theme: {
    colors: { transparent: 'transparent', current: 'currentColor', ...pantone },
    extend: {
      // Latin first, then Hong Kong Chinese faces (PingFang HK on Apple, JhengHei on Windows, Noto Sans HK elsewhere)
      fontFamily: { sans: ['system-ui', '"Segoe UI"', '"PingFang HK"', '"Noto Sans HK"', '"Microsoft JhengHei"', 'sans-serif'] },
    },
  },
  plugins: [],
}
export default config
