import type { Config } from 'tailwindcss'
import typography from '@tailwindcss/typography'

// Dark sci-fi theme — slate-950 base, indigo/violet/cyan accents,
// glow rings reused across status pills + interactive cards. Colors
// stay close to the Tailwind palette so existing utility classes
// keep working alongside the new tokens.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        // Surface tokens — light theme. ``base`` is the body bg,
        // ``raised`` reserved for any future drawer/dialog layer.
        surface: {
          base: '#f8fafc',     // slate-50
          raised: '#ffffff',   // pure white card
          inset: '#f1f5f9',    // slate-100 for table headers / wells
        },
      },
      boxShadow: {
        // Soft accent glow used on hover for interactive surfaces.
        'glow-cyan': '0 0 24px -6px rgba(34, 211, 238, 0.4)',
        'glow-violet': '0 0 24px -6px rgba(168, 85, 247, 0.4)',
        'glow-indigo': '0 0 22px -8px rgba(99, 102, 241, 0.45)',
        'glow-emerald': '0 0 20px -8px rgba(16, 185, 129, 0.4)',
        'inset-line': 'inset 0 1px 0 0 rgba(15, 23, 42, 0.04)',
      },
      backgroundImage: {
        'accent-gradient': 'linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #22d3ee 100%)',
        'subtle-grid':
          'linear-gradient(rgba(15,23,42,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.04) 1px, transparent 1px)',
      },
      keyframes: {
        'pulse-soft': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.55', transform: 'scale(1.15)' },
        },
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'breathe': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(34, 211, 238, 0.4)' },
          '50%': { boxShadow: '0 0 0 6px rgba(34, 211, 238, 0)' },
        },
        // Slow large-radius drift for ambient gradient blobs on the
        // login page. The motion is meant to read as "alive", not
        // animated — the period is intentionally long.
        'drift-a': {
          '0%, 100%': { transform: 'translate3d(0,0,0) scale(1)' },
          '33%': { transform: 'translate3d(40px,-30px,0) scale(1.1)' },
          '66%': { transform: 'translate3d(-30px,20px,0) scale(0.95)' },
        },
        'drift-b': {
          '0%, 100%': { transform: 'translate3d(0,0,0) scale(1)' },
          '50%': { transform: 'translate3d(-50px,-40px,0) scale(1.15)' },
        },
        'drift-c': {
          '0%, 100%': { transform: 'translate3d(0,0,0) scale(1)' },
          '40%': { transform: 'translate3d(60px,40px,0) scale(0.9)' },
          '80%': { transform: 'translate3d(-20px,30px,0) scale(1.08)' },
        },
      },
      animation: {
        'pulse-soft': 'pulse-soft 2.4s ease-in-out infinite',
        'fade-in': 'fade-in 0.3s ease-out',
        'shimmer': 'shimmer 3s linear infinite',
        'breathe': 'breathe 2.2s ease-in-out infinite',
        'drift-a': 'drift-a 18s ease-in-out infinite',
        'drift-b': 'drift-b 22s ease-in-out infinite',
        'drift-c': 'drift-c 26s ease-in-out infinite',
      },
    },
  },
  plugins: [typography],
}

export default config
