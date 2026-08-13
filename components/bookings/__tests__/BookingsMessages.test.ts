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
})
