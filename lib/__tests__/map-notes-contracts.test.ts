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
    expect(source).toMatch(/min-h-0 overscroll-contain overflow-y-auto/)
  })

  it('opens in browse mode and confirms a completed submission', () => {
    const source = readFileSync(join(process.cwd(), 'components/weather/MapNotesPanel.tsx'), 'utf8')
    expect(source).toContain("const [view, setView] = useState<'actions' | 'composer' | 'list' | 'age'>('actions')")
    expect(source).toContain('setSendSuccess(kind)')
    expect(source).toContain("setView('actions')")
    expect(source).toContain('role="status"')
    expect(source).toContain("t('mapNotesCommunitySent')")
    expect(source).toContain("t('mapNotesFeedbackSent')")
    expect(source).toContain('onClearAnchor()')
    expect(source).toContain('onCommunityItemsChange([')
    expect(source).toContain('if (!community.loading) onCommunityItemsChange(community.items)')
  })

  it('prefetches community notes and shows an accessible loading fallback', () => {
    const source = readFileSync(join(process.cwd(), 'components/weather/RoadMapPrototypeMap.tsx'), 'utf8')
    expect(source).toContain("fetch('/api/auth-mvp/map-notes?kind=community&hours=all&q='")
    expect(source).toContain('const [communityMapNotesLoading, setCommunityMapNotesLoading] = useState(true)')
    expect(source).toContain('communityMapNotesLoading && (')
    expect(source).toContain('role="status" aria-live="polite"')
    expect(source).toContain("t('mapNotesLoading')")
    expect(source).toContain('onCommunityLoadingChange={setCommunityMapNotesLoading}')
    const panelSource = readFileSync(join(process.cwd(), 'components/weather/MapNotesPanel.tsx'), 'utf8')
    expect(panelSource).toContain('onCommunityLoadingChange(community.loading)')
  })

  it('defaults to all notes and supports the requested short age windows', () => {
    const source = readFileSync(join(process.cwd(), 'components/weather/MapNotesPanel.tsx'), 'utf8')
    expect(source).toContain("const [hours, setHours] = useState('all')")
    expect(source).toContain("['0.1666666667', t('mapNotesTimeTenMinutes')]")
    expect(source).toContain("['0.5', t('mapNotesTimeThirtyMinutes')]")
    expect(source).toContain("t('mapNotesPeriodAction', { value: selectedAgeLabel })")
    expect(source).toContain("onClick={() => setView('age')}")
    expect(parseMapNoteHours('all')).toBeNull()
    expect(parseMapNoteHours('0.5')).toBe(0.5)
  })

  it('keeps weather-station feed and the scrubber out of community mode', () => {
    const source = readFileSync(join(process.cwd(), 'components/weather/RoadMapPrototypeMap.tsx'), 'utf8')
    expect(source).not.toContain('<ConditionsFeedPreview')
    expect(source).toMatch(/isChatOpen\r?\n\s+\|\| isPanelOpen/)
    expect(source).toContain('hideOverviewStationMarkers()')
    expect(source).toContain('const showOverview = !isChatOpenRef.current')
    expect(source).toContain('setCommunitySheetCollapsed(false)')
    expect(source).toContain("communitySheetCollapsed ? 'items-end justify-end'")
    expect(source).toContain("onClick={() => setCommunitySheetCollapsed(false)}")
    expect(source).toContain("aria-label={t('mapNotesExpand')}")
    expect(source).toContain('pointer-events-auto mb-20 min-h-11')
    expect(source).toContain('setCommunityFitRequestId(value => value + 1)')
    expect(source).toContain('map.fitBounds(')
    expect(source).toContain('[-25, 63]')
    expect(source).toContain('[-12, 67]')
    expect(source).toMatch(/const shouldShowWeatherChaseMarkers =\r?\n\s+!isChatOpen &&/)
    expect(source).toContain('hideCommunityWeatherMarkers')
  })

  it('keeps attribution compact at the upper-right and the thumb action at the lower-right', () => {
    const source = readFileSync(join(process.cwd(), 'components/weather/RoadMapPrototypeMap.tsx'), 'utf8')
    expect(source).toContain('attributionControl: false')
    expect(source).toContain("new maplibregl.AttributionControl({ compact: true })")
    expect(source).toContain("?.classList.remove('maplibregl-compact-show')")
    expect(source).toContain("?.removeAttribute('open')")
    expect(source).toMatch(/map\.addControl\(new maplibregl\.AttributionControl\(\{ compact: true \}\), 'bottom-right'\)\r?\n\s+collapseMapAttribution\(containerRef\.current\)/)
    expect(source).toMatch(/map\.on\('load',[\s\S]*map\.resize\(\)\r?\n\s+collapseMapAttribution\(containerRef\.current\)/)
    expect(source).toMatch(/function handleMessagesToggle\(\)[\s\S]*collapseMapAttribution\(containerRef\.current\)/)
    expect(source).toContain("'© Stadia Maps | © Stamen Design | © OpenMapTiles'")
    expect(source).not.toContain('`${OPENSTREETMAP_ATTRIBUTION} | © Stadia Maps')
    expect(source).toContain("[&_.maplibregl-ctrl-bottom-right]:!bottom-auto")
    expect(source).toContain("[&_.maplibregl-ctrl-bottom-right]:!top-2")
    expect(source).toContain("communitySheetCollapsed ? 'items-end justify-end'")
  })

  it('uses natural task height with a 75 percent viewport maximum', () => {
    const mapSource = readFileSync(join(process.cwd(), 'components/weather/RoadMapPrototypeMap.tsx'), 'utf8')
    const panelSource = readFileSync(join(process.cwd(), 'components/weather/MapNotesPanel.tsx'), 'utf8')
    expect(mapSource).toContain("communitySheetExpanded ? 'max-h-[75dvh]' : 'max-h-[46dvh]'")
    expect(mapSource).not.toContain("communitySheetExpanded ? 'h-[75dvh]")
    expect(mapSource).toContain('className="min-h-0 overscroll-contain overflow-y-auto p-3"')
    expect(mapSource).toContain('<h2 className="flex h-10 items-center text-sm font-semibold leading-none text-foreground">{t(\'mapNotesActions\')}</h2>')
    expect(panelSource).toContain("onExpandedChange(view !== 'actions')")
    expect(panelSource).not.toContain("t('mapNotesTitle')")
    expect(panelSource).not.toContain("t('mapNotesDescription')")
  })

  it('opens a map comment in the bottom drawer without changing zoom', () => {
    const source = readFileSync(join(process.cwd(), 'components/weather/RoadMapPrototypeMap.tsx'), 'utf8')
    expect(source).toContain('zoom: mapRef.current.getZoom()')
    expect(source).not.toMatch(/setSelectedCommunityNoteId\(note\.id\)[\s\S]{0,120}focusMapNoteAnchor/)
    expect(source).toContain('id="selected-map-note-title"')
    expect(source).toContain('background:#f59e0b')
    expect(source).toContain('selectedCommunityNote.body')
    expect(source).not.toContain("element.textContent = selected ? note.body")
    expect(source).toContain("aria-label={t('mapNotesMinimizeDetail')}")
    expect(source).toContain('<ChevronDown size={18} aria-hidden />')
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
