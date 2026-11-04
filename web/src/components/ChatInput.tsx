import { useRef, useState } from 'react'
import { useChatStore } from '../stores/chat'
import { send } from '../lib/send'
import { useT } from '../i18n'

export default function ChatInput() {
  const [text, setText] = useState('')
  const streaming = useChatStore((s) => s.streaming)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const t = useT()

  const submit = () => {
    const t = text.trim()
    if (!t || streaming) return
    setText('')
    if (taRef.current) taRef.current.style.height = 'auto'
    void send(t)
  }

  return (
    <div className="border-t border-line/70 px-[22px] pb-5 pt-3.5">
      <div className="mx-auto flex max-w-none items-end gap-2.5 rounded-[20px] border border-line bg-surface py-[7px] pl-4 pr-[7px] focus-within:border-primary focus-within:ring-4 focus-within:ring-accent-soft">
        <textarea
          ref={taRef}
          rows={1}
          value={text}
          disabled={streaming}
          placeholder={streaming ? t('input.streaming') : t('input.placeholder')}
          onChange={(e) => {
            setText(e.target.value)
            e.target.style.height = 'auto'
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          className="max-h-[120px] flex-1 resize-none bg-transparent py-2 text-[14px] leading-normal text-fg outline-none placeholder:text-muted/70 disabled:opacity-60"
        />
        <button onClick={submit} disabled={streaming} title={streaming ? t('input.streaming') : t('input.send')} className="grid h-[42px] w-[42px] flex-none place-items-center rounded-[15px] bg-gradient-to-br from-primary to-accent text-white disabled:cursor-not-allowed disabled:opacity-50">
          {streaming ? (
            // 生成中:转圈 loading
            <svg viewBox="0 0 24 24" fill="none" className="w-[19px] animate-spin">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={3} strokeOpacity={0.3} />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-[19px]"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
          )}
        </button>
      </div>
    </div>
  )
}
