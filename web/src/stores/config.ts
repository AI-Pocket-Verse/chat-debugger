import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { parseExtraHeaders, type BackendConfig } from '../lib/backendClient'

// 每个角色一份 debug 会话:后端在 debug/token 铸造测试号时就绑定了角色,
// /chat 只认 token 对应的角色,请求体里的 role_id 不起作用。
// 所以「切角色」必须切到该角色自己的 token —— 按角色缓存在 sessions,铸新逻辑见 lib/roleSession.ts。
export interface RoleSession { token: string; uid: number }

interface ConfigState {
  /** 被测后端地址,含路径前缀;接口拼成 `${baseUrl}/debug/token` 等 */
  baseUrl: string
  debugKey: string
  /** 额外请求头(JSON 文本),每个请求都带上;解析失败时忽略,由配置弹窗提示 */
  extraHeaders: string
  /** 修改 prompt 覆盖时记录的操作人 */
  operator: string
  /** 随 /chat 发送的模型 ID;空 = 后端默认模型 */
  model: string
  roleId: number
  // 当前角色会话的镜像(= sessions[roleId]):既有取值点 cfg.token / cfg.uid 保持不变
  token: string
  uid: number
  sessions: Record<string, RoleSession>
  set: (p: Partial<Pick<ConfigState, 'baseUrl' | 'debugKey' | 'extraHeaders' | 'operator' | 'model' | 'token' | 'uid' | 'roleId'>>) => void
  /** 写入某角色的会话;若是当前角色,同步镜像 token/uid */
  setSession: (roleId: number, s: RoleSession) => void
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      // 开发时默认指向 `pnpm mock` 启动的示例后端;生产构建默认留空,首次打开会弹出连接配置。
      baseUrl: import.meta.env.PROD ? '' : 'http://localhost:8680',
      debugKey: import.meta.env.PROD ? '' : 'mock-debug-key',
      extraHeaders: '',
      operator: '',
      model: '',
      roleId: 1,
      token: '',
      uid: 0,
      sessions: {},
      // 改 roleId 时自动把镜像切到该角色缓存的会话(无缓存则空,由 roleSession 铸新)。
      set: (p) =>
        set((s) => {
          // 后端地址或 Debug Key 变了:已缓存的会话 token 属于旧后端,留着会拿 A 的 token 去请求 B。
          // 一并清空,由 roleSession 按新配置重新铸号。模型 ID 也是旧后端的,换地址时回到后端默认。
          const baseChanged = p.baseUrl != null && p.baseUrl !== s.baseUrl
          if (baseChanged || (p.debugKey != null && p.debugKey !== s.debugKey)) {
            return { ...p, ...(baseChanged ? { model: '' } : {}), sessions: {}, token: '', uid: 0 }
          }
          if (p.roleId == null || p.roleId === s.roleId) return p
          const sess = s.sessions[String(p.roleId)]
          return { ...p, token: sess?.token ?? '', uid: sess?.uid ?? 0 }
        }),
      setSession: (roleId, sess) =>
        set((s) => ({
          sessions: { ...s.sessions, [String(roleId)]: sess },
          ...(roleId === s.roleId ? { token: sess.token, uid: sess.uid } : {}),
        })),
    }),
    { name: 'chat-debugger.config' },
  ),
)

/** 当前配置 → 后端请求配置。所有调用后端的地方都从这里取,不各自拼。 */
export function backendCfg(token?: string): BackendConfig {
  const s = useConfigStore.getState()
  const headers = parseExtraHeaders(s.extraHeaders)
  return {
    base: s.baseUrl,
    debugKey: s.debugKey,
    token,
    headers: headers instanceof Error ? undefined : headers,
  }
}
