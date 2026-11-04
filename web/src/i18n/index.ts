import { useCallback } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { en } from './en'
import { zh } from './zh'

export type Lang = 'zh' | 'en'
/** 用户的语言偏好:auto = 跟随浏览器 */
export type LangPref = Lang | 'auto'
export type MsgKey = keyof typeof zh
export type MsgVars = Record<string, string | number>
export type TFn = (key: MsgKey, vars?: MsgVars) => string

const DICTS: Record<Lang, Record<MsgKey, string>> = { zh, en }

/** 浏览器首选语言是中文就用中文,其余一律英文 */
export function detectLang(): Lang {
  const first = typeof navigator === 'undefined' ? '' : (navigator.languages?.[0] ?? navigator.language ?? '')
  return /^zh\b/i.test(first) ? 'zh' : 'en'
}

export const resolveLang = (pref: LangPref): Lang => (pref === 'auto' ? detectLang() : pref)

interface LangState {
  pref: LangPref
  setPref: (p: LangPref) => void
}

export const useLangStore = create<LangState>()(
  persist((set) => ({ pref: 'auto', setPref: (pref) => set({ pref }) }), { name: 'chat-debugger.lang' }),
)

/** 当前生效的语言(非组件代码用;组件用 useLang 以便切换语言时重渲) */
export const currentLang = (): Lang => resolveLang(useLangStore.getState().pref)

/** 把文案里的 {name} 换成 vars.name;没给的变量原样保留 */
function format(s: string, vars?: MsgVars): string {
  if (!vars) return s
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
}

export function translate(lang: Lang, key: MsgKey, vars?: MsgVars): string {
  return format(DICTS[lang][key] ?? zh[key] ?? key, vars)
}

/** 非组件代码取文案:按调用时的当前语言 */
export const t: TFn = (key, vars) => translate(currentLang(), key, vars)

export function useLang(): Lang {
  return resolveLang(useLangStore((s) => s.pref))
}

/** 组件取文案:订阅语言偏好,切换后自动重渲 */
export function useT(): TFn {
  const lang = useLang()
  return useCallback<TFn>((key, vars) => translate(lang, key, vars), [lang])
}
