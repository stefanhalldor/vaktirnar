import { describe, expect, it } from 'vitest'
import isMessages from '@/messages/is.json'
import enMessages from '@/messages/en.json'

function leafKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix]
  return Object.entries(value).flatMap(([key, nested]) => (
    leafKeys(nested, prefix ? `${prefix}.${key}` : key)
  ))
}

describe('Event message parity', () => {
  it('keeps every Icelandic and English Event message key in exact parity', () => {
    expect(leafKeys(isMessages.teskeid.events).sort())
      .toEqual(leafKeys(enMessages.teskeid.events).sort())
  })

  it('owns generic attendee fallbacks in each locale instead of SQL', () => {
    expect(isMessages.teskeid.events.attendance.genericGuest).toBe('Gestur')
    expect(enMessages.teskeid.events.attendance.genericGuest).toBe('Guest')
    expect(isMessages.teskeid.events.invitation.emailV1.unknownGuest).toBe('Gestur')
    expect(enMessages.teskeid.events.invitation.emailV1.unknownGuest).toBe('a guest')
    expect(enMessages.teskeid.events.invitation.unknownInviter)
      .not.toBe(isMessages.teskeid.events.invitation.unknownInviter)
  })
})
