import { create } from 'zustand'
import type { TracePromptSection } from '../types/trace'
import { isSafetySection } from '../lib/sections'

export interface PromptSectionView extends TracePromptSection { hit: boolean; safety: boolean }

interface PromptState {
  sections: PromptSectionView[]
  overridableSections: string[]
  flashing: string | null
  setFromTrace: (sections: TracePromptSection[]) => void
  setFromSeed: (sections: PromptSectionView[]) => void
  refreshContents: (sections: TracePromptSection[]) => void
  setOverridable: (names: string[]) => void
  markOverridden: (name: string, overridden: boolean) => void
  flash: (name: string) => void
}

export const usePromptStore = create<PromptState>((set) => ({
  sections: [],
  overridableSections: [],
  flashing: null,
  setFromTrace: (secs) => set({ sections: secs.map((s) => ({ ...s, hit: true, safety: isSafetySection(s.name) })) }),
  setFromSeed: (secs) => set({ sections: secs }),
  // 预览刷新:按 name 合并,只更新已展示段的 content/chars(实时段:时间/记忆),
  // 保留 source_node/hit/safety/overridden 与分组顺序;预览缺失的段维持原样。
  refreshContents: (secs) =>
    set((st) => {
      const byName = new Map(secs.map((s) => [s.name, s]))
      return { sections: st.sections.map((s) => { const u = byName.get(s.name); return u ? { ...s, content: u.content, chars: u.chars } : s }) }
    }),
  setOverridable: (names) => set({ overridableSections: names }),
  markOverridden: (name, overridden) => set((st) => ({ sections: st.sections.map((s) => (s.name === name ? { ...s, overridden } : s)) })),
  flash: (name) => {
    set({ flashing: name })
    setTimeout(() => set((st) => (st.flashing === name ? { flashing: null } : {})), 1000)
  },
}))
