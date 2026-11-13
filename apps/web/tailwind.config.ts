import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: '1rem', md: '2rem' },
      screens: { '2xl': '1280px' },
    },
    extend: {
      colors: {
        canvas: '#080D18',
        surface: '#101827',
        card: '#151F30',
        primary: { DEFAULT: '#6366F1', foreground: '#F8FAFC' },
        accent: { DEFAULT: '#06B6D4', foreground: '#04121A' },
        success: '#22C55E',
        warning: '#F59E0B',
        danger: '#EF4444',
        ink: '#F8FAFC',
        muted: '#94A3B8',
        line: 'rgba(148, 163, 184, 0.16)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(8, 13, 24, 0.4), 0 8px 24px -12px rgba(8, 13, 24, 0.8)',
        card: '0 24px 60px -40px rgba(2, 6, 23, 0.9)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 220ms ease-out',
        'pulse-soft': 'pulse-soft 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
