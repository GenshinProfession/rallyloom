import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)',
        },
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['var(--ui-font)'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        'ui-title': ['var(--ui-size-title)', { lineHeight: 'var(--ui-line-title)' }],
        'ui-section': ['var(--ui-size-section)', { lineHeight: 'var(--ui-line-section)' }],
        'ui-body': ['var(--ui-size-body)', { lineHeight: 'var(--ui-line-body)' }],
        'ui-label': ['var(--ui-size-label)', { lineHeight: 'var(--ui-line-label)' }],
        'ui-meta': ['var(--ui-size-meta)', { lineHeight: 'var(--ui-line-meta)' }],
        'ui-map': ['var(--ui-size-map)', { lineHeight: 'var(--ui-line-map)' }],
        '2xs': ['10px', { lineHeight: '1.3' }],
        '3xs': ['9px', { lineHeight: '1.2' }],
      },
      boxShadow: {
        card: '0 0 0 1px rgba(17,18,22,0.035), 0 1px 2px rgba(17,18,22,0.04)',
        pop: '0 0 0 1px rgba(17,18,22,0.05), 0 12px 32px -12px rgba(17,18,22,0.18)',
        room: 'inset 0 0 0 1px rgba(255,255,255,0.55), inset 0 -18px 24px -22px rgba(17,18,22,0.25)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'pop-in': {
          from: { opacity: '0', transform: 'scale(0.97) translateY(3px)' },
          to: { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.45' },
        },
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-out',
        'pop-in': 'pop-in 140ms cubic-bezier(0.2, 0.9, 0.3, 1)',
        'pulse-soft': 'pulse-soft 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [animate],
} satisfies Config
