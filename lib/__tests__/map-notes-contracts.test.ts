import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  parseCreateMapNoteInput,
  parseMapNoteAnchor,
  parseRouteFeedbackContext,
} from '@/lib/map-notes/contracts'

const ids = {
  clientMessageId: '00000000-0000-4000-8000-000000000001',
  idempotencyKey: '00000000-0000-4000-8000-000000000002',
}

describe('map note contracts', () => {
  it('keeps the desktop notes drawer viewport-bounded and internally scrollable', () => {
    const source = readFileSync(join(process.cwd(), 'components/weather/RoadMapPrototypeMap.tsx'), 'utf8')
    expect(source).toMatch(/sm:bottom-3[^"\n]*sm:top-14/)
    expect(source).toMatch(/min-h-0 flex-1 overscroll-contain overflow-y-auto/)
  })

  it('keeps the changed weather-overview message namespace in is/en parity', () => {
    const isMessages = JSON.parse(readFileSync(join(process.cwd(), 'messages/is.json'), 'utf8'))
    const enMessages = JSON.parse(readFileSync(join(process.cwd(), 'messages/en.json'), 'utf8'))
    const keys = (value: unknown, prefix = ''): string[] => (
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) => keys(nested, prefix ? `${prefix}.${key}` : key))
        : [prefix]
    )
    expect(keys(isMessages.teskeid.vedrid.overview).sort()).toEqual(
      keys(enMessages.teskeid.vedrid.overview).sort(),
    )
    expect(isMessages.teskeid.vedrid.overview.mapNotesRouteFeedbackAction).toBe(
      'Láttu okkur endilega vita hvað Teskeiðarleiðarkerfið gæti gert betur',
    )
  })

  it('requires one explicit Iceland anchor for a community note', () => {
    expect(parseMapNoteAnchor({ lat: 64.1, lon: -21.9, label: 'Hellisheiði' })).toEqual({
      lat: 64.1, lon: -21.9, label: 'Hellisheiði',
    })
    expect(parseMapNoteAnchor({ lat: 10, lon: -21.9 })).toBeNull()
    expect(parseCreateMapNoteInput({
      kind: 'community', body: 'Grófur kafli', anchor: null,
      sourceContext: 'map', routeContext: null, ...ids,
    })).toBeNull()
  })

  it('never permits private route context on a community note', () => {
    expect(parseCreateMapNoteInput({
      kind: 'community', body: 'Athugasemd', anchor: { lat: 64.1, lon: -21.9 },
      sourceContext: 'route_choice',
      routeContext: { from: 'Reykjavík', to: 'Selfoss', routeId: null, provider: 'teskeid', distanceKm: 58, durationMinutes: 50 },
      ...ids,
    })).toBeNull()
  })

  it('accepts an explicitly location-independent community note without coordinates', () => {
    expect(parseCreateMapNoteInput({
      kind: 'community', body: 'Almenn ábending', anchor: null,
      locationMode: 'general', sourceContext: 'map', routeContext: null, ...ids,
    })).toMatchObject({
      kind: 'community', anchor: null, locationMode: 'general', body: 'Almenn ábending',
    })
  })

  it('accepts bounded route feedback without requiring exact GPS', () => {
    const routeContext = parseRouteFeedbackContext({
      from: 'Reykjavík', to: 'Selfoss', routeId: 'route-1', provider: 'teskeid', distanceKm: 58, durationMinutes: 50,
    })
    expect(parseCreateMapNoteInput({
      kind: 'teskeid_feedback', body: 'Leiðin fer óþarfa krók', anchor: null,
      sourceContext: 'route_choice', routeContext, ...ids,
    })).toMatchObject({ kind: 'teskeid_feedback', anchor: null, routeContext })
  })

  it('keeps SQL118 default-deny and structurally separates public and private scopes', () => {
    const sql = readFileSync(join(process.cwd(), 'sql/118_map_notes_chat_context.sql'), 'utf8')
    expect(sql).toContain("target_type = 'map_community'")
    expect(sql).toContain("target_type = 'teskeid_feedback'")
    expect(sql).not.toMatch(/GRANT\s+[^;]+\s+TO\s+(anon|authenticated)/i)
    expect(sql).not.toMatch(/CREATE\s+POLICY/i)
    expect(sql).toMatch(/metadata ->> 'locationMode' = 'general'/)
  })
})
