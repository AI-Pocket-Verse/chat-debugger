import { useRef, useState } from 'react'
import { useChatStore, EMPTY_MESSAGES, PAGE_SIZE } from '../stores/chat'
import { useConfigStore } from '../stores/config'
import MessageBubble from './MessageBubble'
import AssembledPromptDialog from './AssembledPromptDialog'
import TraceGraphDialog from './TraceGraphDialog'
import NoTraceDialog from './NoTraceDialog'
import { useT } from '../i18n'

type Sel = { id: string; kind: 'prompt' | 'trace' | 'notrace' } | null

export default function MessageList() {
  // 只展示当前角色的桶(=IndexedDB 里该角色历史的已加载窗口):每个角色独立历史,切角色即切桶
  const roleId = useConfigStore((s) => s.roleId)
  const messages = useChatStore((s) => s.byRole[String(roleId)] ?? EMPTY_MESSAGES)
  const hasMore = useChatStore((s) => s.hasMore[String(roleId)] ?? false)
  const hydrated = useChatStore((s) => s.hydrated[String(roleId)] ?? false)
  const loadingOlder = useChatStore((s) => s.loadingOlder)
  const [sel, setSel] = useState<Sel>(null)
  const selMsg = sel ? messages.find((m) => m.id === sel.id) : undefined
  const scrollRef = useRef<HTMLDivElement>(null)
  const t = useT()

  // 向上翻页后把 scrollTop 补上新增内容的高度,视觉停留在原来的消息上
  const onLoadOlder = async () => {
    const el = scrollRef.current
    const prevH = el?.scrollHeight ?? 0
    await useChatStore.getState().loadOlder(roleId)
    requestAnimationFrame(() => {
      if (el) el.scrollTop += el.scrollHeight - prevH
    })
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-[22px] pb-2 pt-6">
      <div className="mx-auto flex max-w-none flex-col gap-5">
        {hasMore && (
          <button
            onClick={() => void onLoadOlder()}
            disabled={loadingOlder}
            className="mx-auto rounded-full border border-line bg-white px-4 py-1.5 text-[12px] font-semibold text-muted hover:border-primary/30 hover:text-primary disabled:opacity-50"
          >
            {loadingOlder ? t('list.loading') : t('list.loadOlder', { n: PAGE_SIZE })}
          </button>
        )}
        {messages.length === 0 && (
          // 区分「历史还没从 IndexedDB 载入」和「真的没有历史」:避免有历史的角色首帧
          // 闪现"先初始化"误导用户去点重新初始化(那会真清掉该角色历史)。
          <div className="grid place-items-center py-20 text-[13px] text-muted">
            {hydrated ? t('list.emptyHint') : t('list.hydrating')}
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            m={m}
            onOpen={() => {
              if (m.role === 'user') setSel({ id: m.id, kind: 'prompt' })
              else if (m.noTrace) setSel({ id: m.id, kind: 'notrace' })
              else setSel({ id: m.id, kind: 'trace' })
            }}
          />
        ))}
      </div>

      <AssembledPromptDialog open={sel?.kind === 'prompt'} onOpenChange={(b) => !b && setSel(null)} trace={selMsg?.trace} />
      <TraceGraphDialog open={sel?.kind === 'trace'} onOpenChange={(b) => !b && setSel(null)} trace={selMsg?.trace} firstTokenMs={selMsg?.firstTokenMs} />
      <NoTraceDialog open={sel?.kind === 'notrace'} onOpenChange={(b) => !b && setSel(null)} reason={selMsg?.earlyReturn} />
    </div>
  )
}
