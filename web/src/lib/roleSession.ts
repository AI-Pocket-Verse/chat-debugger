import { getToken } from './backendClient'
import { backendCfg, useConfigStore } from '../stores/config'

// 后端在 debug/token 铸造测试号时按 ta_gender 绑定角色:1 → role 1,2 → role 2;
// /chat 只认 token 对应的角色,请求体 role_id 不起作用。
// debug/token 只区分这两种,其余 roleId 一律按 2 映射。
export const taGenderForRole = (roleId: number): 1 | 2 => (roleId === 1 ? 1 : 2)

// 同角色并发铸 token 防抖:快速来回切角色时同一角色只铸一次。
const inflight = new Map<number, Promise<void>>()

/** 确保 roleId 有自己的会话 token:有缓存即无操作,没有则按角色铸一个新测试号。
 *  幂等,可在切角色/进页面时随意调用;失败静默(backendClient 已把错误打进 console),
 *  发消息时 send.ts 会对空 token 给出可见提示。 */
export async function ensureRoleSession(roleId: number): Promise<void> {
  const cfg = useConfigStore.getState()
  if (cfg.sessions[String(roleId)]?.token || !cfg.baseUrl || !cfg.debugKey) return
  let p = inflight.get(roleId)
  if (!p) {
    p = getToken(backendCfg(), taGenderForRole(roleId))
      .then((t) => {
        // 只填空槽:铸号期间用户可能已在「配置」手动初始化过(手动铸的号优先,不覆盖),
        // 否则晚到的自动铸号会把镜像覆盖回另一个测试号,UI 显示的 uid 与实际会话分岔。
        const s = useConfigStore.getState()
        if (!s.sessions[String(roleId)]?.token) s.setSession(roleId, { token: t.token, uid: t.uid })
      })
      .finally(() => inflight.delete(roleId))
    inflight.set(roleId, p)
  }
  return p
}
