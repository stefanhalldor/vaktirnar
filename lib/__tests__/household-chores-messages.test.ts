import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

type MessageTree = { [key: string]: string | MessageTree }

function householdMessages(locale: 'is' | 'en'): MessageTree {
  const messages = JSON.parse(
    readFileSync(join(process.cwd(), `messages/${locale}.json`), 'utf8'),
  ) as { teskeid: { householdChores: MessageTree } }
  return messages.teskeid.householdChores
}

function leafPaths(value: MessageTree, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof child === 'string' ? [path] : leafPaths(child, path)
  }).sort()
}

describe('Household Chores message contract', () => {
  it('keeps the complete Icelandic and English namespaces in parity', () => {
    expect(leafPaths(householdMessages('is'))).toEqual(leafPaths(householdMessages('en')))
  })

  it('contains the guest identity controls used at runtime', () => {
    for (const locale of ['is', 'en'] as const) {
      const messages = householdMessages(locale)
      expect(messages.common).toMatchObject({ cancel: expect.any(String) })
      expect(messages.manage).toMatchObject({
        renameParticipant: expect.any(String),
        linkGuest: expect.any(String),
        linkEmail: expect.any(String),
        sendLinkInvite: expect.any(String),
        cancelLinkInvite: expect.any(String),
      })
    }
  })
})
