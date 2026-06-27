'use client'

import { useRef, useState } from 'react'
import { sendLoanChatMessage } from '@/lib/loans/actions'

export interface ChatLabels {
  fieldLabel: string
  placeholder: string
  send: string
  error: string
}

export function LoanChatForm({ loanId, labels }: { loanId: string; labels: ChatLabels }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLTextAreaElement>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const body = ref.current?.value ?? ''
    if (!body.trim()) return
    setPending(true)
    setError(null)
    const result = await sendLoanChatMessage(loanId, { body })
    setPending(false)
    if (result.ok) {
      if (ref.current) ref.current.value = ''
    } else {
      setError(labels.error)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 pt-3 border-t border-black/10">
      <label htmlFor={`chat-${loanId}`} className="text-xs font-medium text-[#72796e]">
        {labels.fieldLabel}
      </label>
      <textarea
        id={`chat-${loanId}`}
        ref={ref}
        placeholder={labels.placeholder}
        maxLength={1000}
        disabled={pending}
        className="w-full text-base rounded-xl border border-black/10 px-3 py-2 min-h-[72px] resize-none bg-white placeholder:text-[#72796e]/60 text-[#1b1c19] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#154212]/30"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-end h-9 px-4 rounded-lg bg-[#154212] text-white text-sm font-medium hover:bg-[#2d5a27] transition-colors disabled:opacity-50"
      >
        {labels.send}
      </button>
    </form>
  )
}
