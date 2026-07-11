import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Concourse brand — pitch green primary, hi-vis accent
        primary: {
          DEFAULT: '#00B67A',
          50:  '#E6F8F1',
          100: '#C1EFDB',
          200: '#8BE0BA',
          300: '#4FCF95',
          400: '#1FBF7A',
          500: '#00B67A',
          600: '#009964',
          700: '#00754D',
          800: '#005637',
          900: '#003A24',
          950: '#00291A',
        },
        accent: {
          DEFAULT: '#FFC300',
          500: '#FFC300',
          600: '#D6A400',
        },
        surface: {
          0: '#FFFFFF',
          50: '#F7F8F9',
          100: '#EEF1F3',
          200: '#DDE2E7',
          300: '#B9C1CA',
          400: '#8A94A0',
          500: '#5B6672',
          600: '#3D4652',
          700: '#2A313A',
          800: '#1A1F26',
          900: '#0F1319',
          950: '#080A0E',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'ui-sans-serif', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        pill: '9999px',
      },
      animation: {
        'spin-slow': 'spin 4s linear infinite',
      },
    },
  },
  plugins: [typography],
};

export default config;
