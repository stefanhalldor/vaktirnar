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

  it('keeps canonical people-picker copy in locale parity and owns the settled source labels', () => {
    expect(leafKeys(isMessages.teskeid.peoplePicker).sort())
      .toEqual(leafKeys(enMessages.teskeid.peoplePicker).sort())
    expect(isMessages.teskeid.peoplePicker.relationships).toBe('Tengsl')
    expect(isMessages.teskeid.peoplePicker.events).toBe('Úr viðburði')
    expect(isMessages.teskeid.peoplePicker.manual).toBe('Nafn eða netfang')
    expect(enMessages.teskeid.peoplePicker.relationships).toBe('Relationships')
    expect(enMessages.teskeid.peoplePicker.events).toBe('From an event')
    expect(enMessages.teskeid.peoplePicker.manual).toBe('Name or email')
    expect(leafKeys(isMessages.teskeid.events.personPicker).sort())
      .toEqual(leafKeys(enMessages.teskeid.events.personPicker).sort())
  })

  it('owns generic attendee fallbacks in each locale instead of SQL', () => {
    expect(isMessages.teskeid.events.attendance.genericGuest).toBe('Gestur')
    expect(enMessages.teskeid.events.attendance.genericGuest).toBe('Guest')
    expect(isMessages.teskeid.events.invitation.emailV1.unknownGuest).toBe('Gestur')
    expect(enMessages.teskeid.events.invitation.emailV1.unknownGuest).toBe('a guest')
    expect(enMessages.teskeid.events.invitation.unknownInviter)
      .not.toBe(isMessages.teskeid.events.invitation.unknownInviter)
  })

  it('keeps the invitation email directions and congratulations exact in each locale', () => {
    const isEmail = isMessages.teskeid.events.invitation.emailV1
    const enEmail = enMessages.teskeid.events.invitation.emailV1

    expect(isEmail.instructions).toBe(
      'Boðið bíður þín á Teskeið.is þar sem þú skráir þig inn með netfanginu sem þessi póstur er sendur á.',
    )
    expect(isEmail.tagline)
      .toBe('... til hamingju með að vera skrefi nær því að vera með allt í Teskeið!')
    expect(enEmail.instructions).toBe(
      'Your invitation is waiting for you at Teskeið.is, where you sign in with the email address this message was sent to.',
    )
    expect(enEmail.tagline)
      .toBe('... congratulations on being one step closer to having everything in Teskeið!')

    const serializedEmailCopy = JSON.stringify({ isEmail, enEmail })
    expect(serializedEmailCopy).not.toContain(
      'Skráðu þig inn í Teskeið. Boðið bíður undir Ólesið á forsíðunni.',
    )
    expect(serializedEmailCopy).not.toContain(
      'Til hamingju með að vera skrefi nær því að vera með allt í Teskeið!',
    )
  })
})
