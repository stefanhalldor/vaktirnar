import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  parseCreateMapNoteInput,
  parseMapNoteAnchor,
  parseMapNoteHours,
  parseRouteFeedbackContext,
} from '@/lib/map-notes/contracts'

const ids = {
  clientMessageId: '00000000-0000-4000-8000-000000000001',
  idempotencyKey: '00000000-0000-4000-8000-000000000002',
}

describe('map note contracts', () => {
  it('keeps the map visible behind a viewport-bounded community sheet', () => {
    const source = readFileSync(join(process.cwd(), 'components/weather/RoadMapPrototypeMap.tsx'), 'utf8')
    expect(source).toContain('pointer-events-none absolute inset-0')
    expect(source).toContain('max-h-[46dvh]')
    expect(source).toContain('pointer-events-auto')
    expect(source).toMatch(/min-h-0 flex-1 overscroll-contain overflow-y-auto/)
  })

  it('opens in browse mode and confirms a completed submission', () => {
    const source = readFileSync(join(process.cwd(), 'components/weather/MapNotesPanel.tsx'), 'utf8')
    expect(source).toContain("const [view, setView] = useState<'actions' | 'composer' | 'list'>('actions')")
    expect(source).toContain('setSendSuccess(kind)')
    expect(source).toContain("setView('actions')")
    expect(source).toContain('role="status"')
    expect(source).toContain("t('mapNotesCommunitySent')")
    expect(source).toContain("t('mapNotesFeedbackSent')")
  })

  it('defaults to all notes and supports the requested short age windows', () => {
    const source = readFileSync(join(process.cwd(), 'components/weather/MapNotesPanel.tsx'), 'utf8')
    expect(source).toContain("const [hours, setHours] = useState('all')")
    expect(source).toContain("['0.1666666667', t('mapNotesTimeTenMinutes')]")
    expect(source).toContain("['0.5', t('mapNotesTimeThirtyMinutes')]")
    expect(source).toContain('ageMenuRef.current.open = false')
    expect(parseMapNoteHours('all')).toBeNull()
    expect(parseMapNoteHours('0.5')).toBe(0.5)
  })

  it('keeps weather-station feed and the scrubber out of community mode', () => {
    const source = readFileSync(join(process.cwd(), 'components/weather/RoadMapPrototypeMap.tsx'), 'utf8')
    expect(source).not.toContain('<ConditionsFeedPreview')
    expect(source).toContain('isChatOpen\n          || isPanelOpen')
    expect(source).toContain('hideOverviewStationMarkers()')
    expect(source).toContain('const showOverview = !isChatOpenRef.current')
    expect(source).toContain('setCommunitySheetCollapsed(false)')
    expect(source).toContain("onClick={() => setCommunitySheetCollapsed(false)}")
    expect(source).toContain('mapRef.current?.fitBounds(')
    expect(source).toContain('[-25, 63]')
    expect(source).toContain('[-12, 67]')
  })

  it('opens a map comment in the bottom drawer without changing zoom', () => {
    const source = readFileSync(join(process.cwd(), 'components/weather/RoadMapPrototypeMap.tsx'), 'utf8')
    expect(source).toContain('zoom: mapRef.current.getZoom()')
    expect(source).not.toMatch(/setSelectedCommunityNoteId\(note\.id\)[\s\S]{0,120}focusMapNoteAnchor/)
    expect(source).toContain('id="selected-map-note-title"')
    expect(source).toContain('background:#f59e0b')
    expect(source).toContain('selectedCommunityNote.body')
    expect(source).not.toContain("element.textContent = selected ? note.body")
  })

  it('keeps V4 activation behind the existing authenticated admin refresh endpoint', () => {
    const source = readFileSync(join(process.cwd(), 'components/teskeid/RoadGraphAdminSection.tsx'), 'utf8')
    expect(source).toContain("fetch('/api/admin/weather/refresh-road-graph'")
    expect(source).toContain("method: 'POST'")
    expect(source).toContain("result?.status === 'ok'")
    expect(source).toContain("result?.status === 'error'")
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
    expect(isMessages.teskeid.vedrid.overview.roadMapPrototypePanelMessages).toBe('Samfélagið')
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
