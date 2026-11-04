import type { Config } from 'tailwindcss'
// @ts-expect-error -- shared preset is plain CJS, no types needed
import preset from '@chat-debugger/tailwind-preset'

// 本应用自带一套固定配色(蓝色主色),覆盖共享 preset 的同名颜色。
export default {
  presets: [preset],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#ffffff',
        surface: '#f7f8fa',
        fg: '#1f2329',
        muted: '#646a73',
        line: '#dee0e3',
        primary: { DEFAULT: '#3370ff', fg: '#ffffff' },
        accent: { DEFAULT: '#3370ff', soft: '#eff4ff' },
      },
      boxShadow: {
        glass: '0 1px 2px rgba(31, 35, 41, 0.06)',
        glassLg: '0 6px 24px rgba(31, 35, 41, 0.12), 0 2px 6px rgba(31, 35, 41, 0.06)',
        pop: '0 12px 40px rgba(31, 35, 41, 0.16), 0 4px 12px rgba(31, 35, 41, 0.08)',
      },
      keyframes: {
        popIn: { '0%': { opacity: '0', transform: 'translateY(10px) scale(0.98)' }, '100%': { opacity: '1', transform: 'translateY(0) scale(1)' } },
      },
      animation: { 'pop-in': 'popIn 0.2s cubic-bezier(0.2,0.8,0.2,1)' },
    },
  },
} satisfies Config
