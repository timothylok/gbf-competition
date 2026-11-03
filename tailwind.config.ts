import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { 950: '#060d1a', 900: '#0a1628', 800: '#0d1f3c', 700: '#112952' },
        accent: { DEFAULT: '#eab308', dark: '#ca8a04', light: '#fde047', subtle: '#fef9c3' },
      },
      fontFamily: { sans: ['system-ui', '"Segoe UI"', '"PingFang TC"', '"Microsoft JhengHei"', 'sans-serif'] },
    },
  },
  plugins: [],
}
export default config
