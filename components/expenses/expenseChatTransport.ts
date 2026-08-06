'use client'

import type { ScopedChatTransport } from '@/components/chat/ScopedChatPanel'

export function createExpenseChatTransport(expenseId: string): ScopedChatTransport {
  return {
    async loadMessages(threadId, options) {
      const params = new URLSearchParams({
        expenseId,
        threadId,
        limit: String(options?.limit ?? 20),
      })
      if (options?.before) params.set('before', options.before)
      const response = await fetch(`/api/auth-mvp/expenses/chat/messages?${params}`)
      if (!response.ok) throw new Error('expense chat load failed')
      return response.json()
    },
    async markRead(threadId) {
      const response = await fetch('/api/auth-mvp/expenses/chat/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expenseId, threadId }),
      })
      if (!response.ok) throw new Error('expense chat mark read failed')
    },
    async sendMessage(threadId, body, options) {
      if (!options) throw new Error('expense chat request envelope missing')
      const response = await fetch('/api/auth-mvp/expenses/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expenseId,
          threadId,
          body,
          clientMessageId: options.clientMessageId,
          idempotencyKey: options.idempotencyKey,
        }),
      })
      if (!response.ok) throw new Error('expense chat send failed')
      return response.json()
    },
  }
}
