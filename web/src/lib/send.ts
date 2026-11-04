import { chat } from './backendClient'
import { ensureRoleSession } from './roleSession'
import { useChatStore, messagesOf } from '../stores/chat'
import { usePromptStore } from '../stores/prompt'
import { backendCfg, useConfigStore } from '../stores/config'
import { t } from '../i18n'

/** 生成消息 id;crypto.randomUUID 仅在安全上下文可用(http 非 localhost 下为 undefined),回退到时间+随机。 */
function genId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

/** 从回复正文推断早返回类型(后端在安全拦截等分支提前返回、没有完整 trace 时) */
function inferEarlyReturn(reply: string): string {
  const r = reply || ''
  if (/没法帮|不能帮|我没办法|无法协助|危险|违法|can'?t help|cannot help|unable to (help|assist)|dangerous|illegal/i.test(r)) return t('early.risk')
  if (/你是指|能不能说清|具体是|哪方面|再说说是|do you mean|could you clarify|what kind of|which one/i.test(r)) return t('early.clarify')
  if (!r.trim()) return t('early.media')
  return t('early.unknown')
}

export async function send(text: string): Promise<void> {
  const cfg = useConfigStore.getState()
  const chatS = useChatStore.getState()
  const promptS = usePromptStore.getState()
  // 发起时锁定角色:消息进该角色的桶;token 也用该角色自己的(后端的角色绑在 token 上)。
  const roleId = cfg.roleId

  // 自动铸号可能仍在途(切角色后立刻发送):先等它一次,再取该角色的会话。
  let token = cfg.sessions[String(roleId)]?.token
  if (!token) {
    await ensureRoleSession(roleId).catch(() => {})
    token = useConfigStore.getState().sessions[String(roleId)]?.token
  }
  if (!token) {
    // 铸号确实失败:给一条仅内存的临时提示(transient 不落库,不污染该角色的持久历史)
    chatS.addMessage(roleId, {
      id: genId(),
      role: 'assistant',
      content: t('send.initFailed'),
      noTrace: true,
      earlyReturn: t('send.noInit'),
      transient: true,
    })
    return
  }

  const uid = genId()
  const aid = genId()
  chatS.addMessage(roleId, { id: uid, role: 'user', content: text })
  chatS.addMessage(roleId, { id: aid, role: 'assistant', content: '' })
  chatS.setStreaming(true)

  let gotTrace = false

  await chat(
    backendCfg(token),
    { role_id: roleId, content: text, ...(cfg.model.trim() ? { model: cfg.model.trim() } : {}) },
    {
      onDelta: (t) => chatS.appendDelta(aid, t),
      onFirstToken: (ms) => chatS.patch(aid, { firstTokenMs: ms }),
      onTraceFrame: (f) => {
        gotTrace = true
        chatS.setTrace(aid, f.trace)
        chatS.setTrace(uid, f.trace) // 同轮 user 消息也挂,便于点用户气泡取拼接 prompt
        // 左侧提示词面板是全局单例:流式中切了角色就不刷,防旧角色 trace 覆盖新角色视图
        if (f.trace.prompt?.sections?.length && useConfigStore.getState().roleId === roleId) {
          promptS.setFromTrace(f.trace.prompt.sections)
        }
      },
      onError: (e) => {
        // 仅当本轮尚未拿到 trace 时才标「未产生链路」,避免盖掉已到手的链路
        const cur = messagesOf(useChatStore.getState(), roleId).find((m) => m.id === aid)
        if (!cur?.trace) useChatStore.getState().patch(aid, { noTrace: true, earlyReturn: t('send.error', { err: String(e) }) })
        // 已拿到 trace 的回答若被截断 / 超时,在气泡末尾标出来,免得把半截回答当成完整回复
        else chatS.appendDelta(aid, `\n⚠ ${e instanceof Error ? e.message : String(e)}`)
      },
      onDone: () => chatS.setStreaming(false),
    },
  )
  chatS.setStreaming(false)
  // 流结束仍没有 trace(且没有被 onError 标成错误):后端早返回(澄清 / 风险拦截 / 限频等),按回复正文推断类型。
  // 不能靠定时器:早返回的流往往一秒内就结束,定时器会在清理时被取消,气泡点了没反应。
  if (!gotTrace) {
    const cur = messagesOf(useChatStore.getState(), roleId).find((m) => m.id === aid)
    if (cur && !cur.noTrace) useChatStore.getState().patch(aid, { noTrace: true, earlyReturn: inferEarlyReturn(cur.content ?? '') })
  }
}
