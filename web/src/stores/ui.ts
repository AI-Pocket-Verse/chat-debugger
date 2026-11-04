import { create } from 'zustand'

import { t } from '../i18n'

export interface RoleOption { id: number; name: string }

// 后端还没返回角色列表(或返回空)时的占位;名字留空,显示时按当前语言取「角色 N」
const DEFAULT_ROLES: RoleOption[] = [
  { id: 1, name: '' },
  { id: 2, name: '' },
]

/** 角色的显示名(顶栏、气泡头像、各弹窗共用):后端没给名字时显示「角色 N」 */
export function roleDisplayName(roles: RoleOption[], id: number): string {
  return roles.find((r) => r.id === id)?.name || t('role.fallback', { id })
}

interface UiState {
  roles: RoleOption[]
  configOpen: boolean
  presetOpen: boolean
  editSection: string | null // 正在编辑的 prompt 段名(null=关闭)
  setRoles: (r: RoleOption[]) => void
  openConfig: (b: boolean) => void
  openPreset: (b: boolean) => void
  openEdit: (name: string | null) => void
}

export const useUiStore = create<UiState>((set) => ({
  roles: DEFAULT_ROLES,
  configOpen: false,
  presetOpen: false,
  editSection: null,
  setRoles: (r) => set({ roles: r.length ? r : DEFAULT_ROLES }),
  openConfig: (b) => set({ configOpen: b }),
  openPreset: (b) => set({ presetOpen: b }),
  openEdit: (name) => set({ editSection: name }),
}))
