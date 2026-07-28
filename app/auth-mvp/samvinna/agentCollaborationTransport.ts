'use client'

import type { ScopedChatTransport } from '@/components/chat/ScopedChatPanel'
import type { MessageDto } from '@/lib/chat/types'

const BASE_PATH = '/api/auth-mvp/agent-collaboration'

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error('agent collaboration request failed')
  return response.json() as Promise<T>
}

export const AGENT_COLLABORATION_TRANSPORT: ScopedChatTransport = {
  async loadMessages(conversationId, opts) {
    const params = new URLSearchParams({
      conversationId,
      limit: String(opts?.limit ?? 30),
    })
    if (opts?.before) params.set('before', opts.before)
    if (opts?.beforeId) params.set('beforeId', opts.beforeId)

    const response = await fetch(`${BASE_PATH}/messages?${params}`, {
      cache: 'no-store',
    })
    return readJson<MessageDto[]>(response)
  },

  async markRead(conversationId, opts) {
    if (!opts?.lastReadMessageId) return
    const response = await fetch(`${BASE_PATH}/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId,
        lastReadMessageId: opts.lastReadMessageId,
      }),
    })
    if (!response.ok) throw new Error('mark read failed')
  },

  async sendMessage(conversationId, body, opts) {
    if (!opts) throw new Error('idempotency metadata missing')
    const response = await fetch(`${BASE_PATH}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId,
        body,
        clientMessageId: opts.clientMessageId,
        idempotencyKey: opts.idempotencyKey,
      }),
    })
    return readJson<MessageDto>(response)
  },
}
