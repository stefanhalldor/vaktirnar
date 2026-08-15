import { describe, expect, it } from 'vitest'
import enMessages from '@/messages/en.json'
import isMessages from '@/messages/is.json'

function leafKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object') return [prefix]
  return Object.entries(value).flatMap(([key, child]) => (
    leafKeys(child, prefix ? `${prefix}.${key}` : key)
  ))
}

describe('booking messages', () => {
  it('keeps Icelandic and English booking keys in parity', () => {
    expect(leafKeys(isMessages.bookings).sort()).toEqual(leafKeys(enMessages.bookings).sort())
  })

  it('uses explicit localized guest identity and enquiry language', () => {
    expect(isMessages.bookings.chat.actorGuest).toBe('Gestur')
    expect(enMessages.bookings.chat.actorGuest).toBe('Guest')
    expect(isMessages.bookings.chat.messageLabel).toBe('Skilaboð')
    expect(enMessages.bookings.chat.messageLabel).toBe('Message')
    expect(isMessages.bookings.form.submit).toBe('Senda fyrirspurn')
    expect(enMessages.bookings.form.submit).toBe('Send enquiry')
  })

  it('localizes every allowlisted default for both audiences and typed history', () => {
    const keys = [
      'new_request',
      'under_review',
      'waiting_customer',
      'waiting_provider',
      'confirmed',
    ] as const
    for (const key of keys) {
      expect(isMessages.bookings.workflow.systemLabels[key].provider).toBeTruthy()
      expect(isMessages.bookings.workflow.systemLabels[key].customer).toBeTruthy()
      expect(enMessages.bookings.workflow.systemLabels[key].provider).toBeTruthy()
      expect(enMessages.bookings.workflow.systemLabels[key].customer).toBeTruthy()
    }
    expect(isMessages.bookings.activity.workflow_state_changed).toContain('{from}')
    expect(isMessages.bookings.activity.request_cancelled_with_reason).toContain('{reason}')
    expect(enMessages.bookings.activity.workflow_state_changed).toContain('{to}')
  })
})
