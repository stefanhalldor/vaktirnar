'use client'

import { useState, FormEvent } from 'react'
import { useTranslations } from 'next-intl'
import { Send } from 'lucide-react'

interface MessageInputProps {
  onSend: (content: string) => Promise<void>
  onActivityClick: () => void
  disabled?: boolean
}

export function MessageInput({ onSend, onActivityClick, disabled }: MessageInputProps) {
  const t = useTranslations('chat')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!text.trim() || sending) return
    setSending(true)
    await onSend(text.trim())
    setText('')
    setSending(false)
  }

  return (
    <div className="fixed bottom-16 left-0 right-0 z-40 border-t border-gray-100 bg-white/95 backdrop-blur-sm px-3 py-2">
      <div className="mx-auto flex max-w-md items-center gap-2">
        <button
          type="button"
          onClick={onActivityClick}
          disabled={disabled}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-100 text-violet-600 hover:bg-violet-200 transition-colors disabled:opacity-50"
          title={t('logActivity')}
        >
          🎯
        </button>
        <form onSubmit={handleSubmit} className="flex flex-1 items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('messagePlaceholder')}
            disabled={disabled || sending}
            className="flex-1 rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm outline-none focus:border-violet-400 focus:bg-white transition-colors disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!text.trim() || sending || disabled}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-600 text-white hover:bg-violet-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  )
}
