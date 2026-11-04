import { useEffect, useState } from 'react'
import TopBar from '../components/TopBar'
import PromptLibraryPanel from '../components/PromptLibraryPanel'
import ChatArea from '../components/ChatArea'
import ConfigDialog from '../components/ConfigDialog'
import PresetDialog from '../components/PresetDialog'
import PromptEditDialog from '../components/PromptEditDialog'
import { backendCfg, useConfigStore } from '../stores/config'
import { useChatStore, messagesOf, EMPTY_MESSAGES } from '../stores/chat'
import { usePromptStore, type PromptSectionView } from '../stores/prompt'
import { useUiStore } from '../stores/ui'
import { getRoles, type RoleInfo } from '../lib/backendClient'
import { ensureRoleSession } from '../lib/roleSession'
import { PERSONA_KEYS, isSafetySection } from '../lib/sections'

// 角色七段人设 → 左侧「提示词组装」未聊天时的占位。段名用后端的键(显示名由 sectionLabel 按语言映射)。
function segsFromPersona(pp: Record<string, unknown>): PromptSectionView[] {
  return PERSONA_KEYS.map((key) => ({ key, content: typeof pp[key] === 'string' ? (pp[key] as string) : '' }))
    .filter((x) => x.content)
    .map(({ key, content }) => ({ name: key, chars: content.length, content, source_node: 'persona', hit: false, safety: isSafetySection(key) }))
}

export default function ChatPage() {
  const baseUrl = useConfigStore((s) => s.baseUrl)
  const debugKey = useConfigStore((s) => s.debugKey)
  const roleId = useConfigStore((s) => s.roleId)
  const setRoles = useUiStore((s) => s.setRoles)
  const msgCount = useChatStore((s) => (s.byRole[String(roleId)] ?? EMPTY_MESSAGES).length)
  const [rolesFull, setRolesFull] = useState<RoleInfo[]>([])

  // 确保当前角色有自己的会话 token(后端的角色绑在 token 上,详见 lib/roleSession.ts):
  // 进页面/切角色时自动铸;已有缓存则无操作。失败静默,发消息时 send.ts 会给可见提示。
  useEffect(() => {
    void ensureRoleSession(roleId).catch(() => {})
  }, [roleId, baseUrl, debugKey])

  // 进入/切换角色时从 IndexedDB 载入该角色最新一页历史(幂等,已载入则无操作)
  useEffect(() => {
    void useChatStore.getState().hydrateRole(roleId)
  }, [roleId])

  // 拉角色(X-Debug-Key 门控,不需登录 token):填下拉 + 存全量(含七段 persona)
  useEffect(() => {
    if (!baseUrl || !debugKey) return
    let alive = true
    getRoles(backendCfg())
      .then((rs) => { if (!alive) return; setRolesFull(rs); setRoles(rs.map((r) => ({ id: r.id, name: r.name }))) })
      .catch(() => {})
    return () => { alive = false }
  }, [baseUrl, debugKey, setRoles])

  // 左侧「提示词组装」:优先用最后一条 trace 的分段;否则用当前角色七段人设占位。
  // 这样未发消息 / 刷新后都有内容可看,不必先发一条。
  // 依赖 msgCount(仅加消息时变)而非整个 messages —— 避免流式 token 增量触发重跑。
  // 流式中的 trace 更新由 send.ts 的 setFromTrace 负责,这里只管初始/刷新/换角色。
  useEffect(() => {
    const msgs = messagesOf(useChatStore.getState(), roleId)
    const lastTrace = [...msgs].reverse().find((m) => m.trace)?.trace
    if (lastTrace?.prompt?.sections?.length) { usePromptStore.getState().setFromTrace(lastTrace.prompt.sections); return }
    const role = rolesFull.find((r) => r.id === roleId)
    const pp = role?.prompt_persona as Record<string, unknown> | undefined
    if (pp) usePromptStore.getState().setFromSeed(segsFromPersona(pp))
  }, [roleId, rolesFull, msgCount])

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[308px_1fr] gap-3.5 p-3.5">
      <PromptLibraryPanel />
      <main className="flex min-w-0 flex-col overflow-hidden rounded-[22px] border border-line bg-white">
        <TopBar />
        <ChatArea />
      </main>
      <ConfigDialog />
      <PresetDialog />
      <PromptEditDialog />
    </div>
  )
}
