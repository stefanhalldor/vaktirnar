'use client'

import type { ScopedChatTransport } from '@/components/chat/ScopedChatPanel'
import type { BookingMessageView } from '@/lib/bookings/contracts'

export type BookingChatActorLabels = {
  guest: string
  member: string
  provider: string
}

export function bookingMessageForDisplay(
  message: BookingMessageView,
  actorLabels: BookingChatActorLabels,
): BookingMessageView {
  return {
    ...message,
    // A link-holder is one shared guest actor. Never turn contact data into
    // their chat identity, even if an older response contains authorName.
    authorName: message.senderKind === 'guest'
      ? actorLabels.guest
      : message.authorName || actorLabels[message.senderKind],
  }
}

export function createBookingChatTransport(
  publicId: string,
  actorLabels: BookingChatActorLabels,
): ScopedChatTransport {
  const base = `/api/bookings/requests/${encodeURIComponent(publicId)}`
  return {
    async loadMessages(_threadId, options) {
      const params = new URLSearchParams({ limit: String(options?.limit ?? 20) })
      if (options?.before) params.set('before', options.before)
      if (options?.beforeId) params.set('beforeId', options.beforeId)
      const response = await fetch(`${base}/messages?${params}`, {
        cache: 'no-store',
        credentials: 'same-origin',
      })
      if (!response.ok) throw new Error('booking message load failed')
      const messages = await response.json() as BookingMessageView[]
      return messages.map(message => bookingMessageForDisplay(message, actorLabels))
    },
    async markRead(_threadId, options) {
      const response = await fetch(`${base}/read`, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lastReadMessageId: options?.lastReadMessageId }),
      })
      if (!response.ok) throw new Error('booking read cursor failed')
    },
    async sendMessage(_threadId, body, options) {
      if (!options) throw new Error('booking message envelope missing')
      const response = await fetch(`${base}/messages`, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body,
          clientMessageId: options.clientMessageId,
          idempotencyKey: options.idempotencyKey,
        }),
      })
      if (!response.ok) throw new Error('booking message send failed')
      const message = await response.json() as BookingMessageView
      return bookingMessageForDisplay(message, actorLabels)
    },
  }
}
