// Tailwind is bound to CSS variables defined in src/index.css.
// Every utility (text-ink-1, bg-up, etc.) becomes theme-aware because the var
// stores a space-separated RGB triplet, so opacity modifiers still work.

const v = (name) => `rgb(var(${name}) / <alpha-value>)`

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Sora', 'Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
        xs:   ['0.75rem',   { lineHeight: '1.1rem' }],
        sm:   ['0.8125rem', { lineHeight: '1.25rem' }],
        base: ['0.875rem',  { lineHeight: '1.35rem' }],
      },
      colors: {
        // `white` is rebound to the theme overlay — when light mode is on, white/X
        // utilities become subtle dark overlays automatically. True-white pixels use #fff.
        white: v('--c-overlay'),
        up:      { DEFAULT: v('--c-up'),    soft: v('--c-up-soft'),    glow: 'rgba(var(--c-up) / 0.18)' },
        down:    { DEFAULT: v('--c-down'),  soft: v('--c-down-soft'),  glow: 'rgba(var(--c-down) / 0.18)' },
        warn:    { DEFAULT: v('--c-warn'),  soft: v('--c-warn-soft') },
        info:    { DEFAULT: v('--c-info'),  soft: v('--c-info-soft') },
        accent:  { DEFAULT: v('--c-accent'),  soft: v('--c-accent-soft'),  glow: 'rgba(var(--c-accent) / 0.25)' },
        accent2: { DEFAULT: v('--c-accent2'), soft: v('--c-accent2-soft') },
        surf: {
          0: v('--c-surf-0'),
          1: v('--c-surf-1'),
          2: v('--c-surf-2'),
          3: v('--c-surf-3'),
          4: v('--c-surf-4'),
          5: v('--c-surf-5'),
        },
        ink: {
          1: v('--c-ink-1'),
          2: v('--c-ink-2'),
          3: v('--c-ink-3'),
          4: v('--c-ink-4'),
          5: v('--c-ink-5'),
        },
      },
      backgroundImage: {
        'brand-grad': 'linear-gradient(135deg, rgb(var(--c-grad-a)) 0%, rgb(var(--c-grad-b)) 50%, rgb(var(--c-grad-c)) 100%)',
        'up-grad':    'linear-gradient(180deg, rgb(var(--c-up)) 0%, rgb(var(--c-up-soft)) 100%)',
        'down-grad':  'linear-gradient(180deg, rgb(var(--c-down)) 0%, rgb(var(--c-down-soft)) 100%)',
        'panel-grad': 'linear-gradient(180deg, rgba(var(--c-overlay) / 0.025) 0%, rgba(var(--c-overlay) / 0) 100%)',
      },
      boxShadow: {
        'glow-up':     '0 0 0 1px rgba(var(--c-up) / 0.25),    0 8px 24px -8px rgba(var(--c-up) / 0.35)',
        'glow-down':   '0 0 0 1px rgba(var(--c-down) / 0.25),  0 8px 24px -8px rgba(var(--c-down) / 0.35)',
        'glow-accent': '0 0 0 1px rgba(var(--c-accent) / 0.30),0 10px 30px -10px rgba(var(--c-accent) / 0.45)',
      },
      keyframes: {
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        shimmer: 'shimmer 2s linear infinite',
      },
    },
  },
  plugins: [],
}
