/**
 * Unit tests for lib/weather/question.ts
 * — extractPlace, detectIntent, parseTimeWindow
 */

import { describe, it, expect } from 'vitest'
import {
  extractPlace,
  detectIntent,
  parseTimeWindow,
  extractTrailerKind,
  extractRouteOrigin,
  extractRouteDestination,
} from '@/lib/weather/question'
import { resolvePlace } from '@/lib/weather/places'

// ── extractPlace ──────────────────────────────────────────────────────────────

describe('extractPlace — accent normalisation (mosó regression)', () => {
  it('extracts mosó (partial accent: no accent on m, accent on o)', () => {
    expect(extractPlace('Er grillveður í mosó í kvöld?')).not.toBeNull()
  })

  it('extracts Mósó (fully accented)', () => {
    expect(extractPlace('Er grillveður í Mósó í kvöld?')).not.toBeNull()
  })

  it('extracts moso (no accents)', () => {
    expect(extractPlace('Er grillveður í moso í kvöld?')).not.toBeNull()
  })

  it('extracted pattern resolves to Mosfellsbær via resolvePlace', () => {
    const pattern = extractPlace('Er grillveður í mosó í kvöld?')
    expect(pattern).not.toBeNull()
    const place = resolvePlace(pattern!)
    expect(place).not.toBeNull()
    expect(place!.name).toBe('Mosfellsbær')
  })
})

describe('extractPlace — standard places', () => {
  it('extracts Reykjavík', () => {
    expect(extractPlace('Er grillveður í Reykjavík á morgun?')).not.toBeNull()
  })

  it('extracts reykjavik (ASCII)', () => {
    expect(extractPlace('Er grillveður í reykjavik?')).not.toBeNull()
  })

  it('extracts selfoss', () => {
    expect(extractPlace('Er grillveður í Selfoss seinnipartinn?')).not.toBeNull()
  })

  it('extracts akureyri', () => {
    expect(extractPlace('Er grillveður í Akureyri?')).not.toBeNull()
  })

  it('extracts hafnarfjörður', () => {
    expect(extractPlace('hafnarfjörður')).not.toBeNull()
  })

  it('extracts kópavogur', () => {
    expect(extractPlace('Kópavogur')).not.toBeNull()
  })

  it('extracts mosfellsbær (full canonical name)', () => {
    expect(extractPlace('Mosfellsbær')).not.toBeNull()
  })

  it('returns null for unknown place', () => {
    expect(extractPlace('Er grillveður á Tunglinu í kvöld?')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(extractPlace('')).toBeNull()
  })
})

// ── detectIntent ──────────────────────────────────────────────────────────────

describe('detectIntent — grill', () => {
  it('detects grill intent from "grillveður"', () => {
    expect(detectIntent('Er grillveður í Mósó í kvöld?')).toBe('grill')
  })

  it('detects grill intent from "grill"', () => {
    expect(detectIntent('Má ég grill í Selfoss á morgun?')).toBe('grill')
  })

  it('detects grill intent from "grilla"', () => {
    expect(detectIntent('Get ég grilla í kvöld?')).toBe('grill')
  })

  it('returns unknown for unrelated question', () => {
    expect(detectIntent('Má ég mála húsið?')).toBe('unknown')
  })

  it('returns unknown for empty string', () => {
    expect(detectIntent('')).toBe('unknown')
  })
})

describe('detectIntent — golf', () => {
  it('detects golf intent from "golf"', () => {
    expect(detectIntent('Hvenær er best að spila golf í Grafarholti á morgun?')).toBe('activity_window_golf')
  })

  it('detects golf intent from "golfvöllur"', () => {
    expect(detectIntent('Er gott veður á golfvelli í dag?')).toBe('activity_window_golf')
  })

  it('detects golf intent from "golfveður"', () => {
    expect(detectIntent('Er golfveður á Keili á morgun?')).toBe('activity_window_golf')
  })

  it('grill takes priority over golf if both present', () => {
    expect(detectIntent('Má ég grilla á golfvellinum?')).toBe('grill')
  })
})

describe('detectIntent — route / trailer', () => {
  it('detects route intent from "hjólhýsi"', () => {
    expect(detectIntent('Er mér óhætt að keyra með hjólhýsi frá Reykjavík að Apavatni?')).toBe('route_towable_trailer')
  })

  it('detects route intent from "eftirvagn"', () => {
    expect(detectIntent('Má ég keyra með eftirvagn í dag?')).toBe('route_towable_trailer')
  })

  it('detects route intent from "hestakerra"', () => {
    expect(detectIntent('Er gott veður til að keyra með hestakerra?')).toBe('route_towable_trailer')
  })

  it('detects route intent from "karavan"', () => {
    expect(detectIntent('Er hægt að keyra með karavan til Akureyrar?')).toBe('route_towable_trailer')
  })
})

// ── extractPlace — golf courses ───────────────────────────────────────────────

describe('extractPlace — golf courses', () => {
  it('extracts grafarholt from golf question', () => {
    const p = extractPlace('Hvenær er best að spila golf í Grafarholti á morgun?')
    expect(p).not.toBeNull()
    expect(resolvePlace(p!)?.name).toBe('Grafarholt')
  })

  it('extracts keilir (nominative)', () => {
    const p = extractPlace('Er golfveður á Keili?')
    expect(p).not.toBeNull()
    expect(resolvePlace(p!)?.name).toBe('Keilir')
  })

  it('extracts keilir from "Keilir" in question', () => {
    const p = extractPlace('Hvenær er best að spila golf á Keilir?')
    expect(p).not.toBeNull()
    expect(resolvePlace(p!)?.name).toBe('Keilir')
  })

  it('extracts korpa (nominative)', () => {
    const p = extractPlace('Er golfveður í Korpu í dag?')
    expect(p).not.toBeNull()
    expect(resolvePlace(p!)?.name).toBe('Korpa')
  })

  it('returns null for unknown golf course', () => {
    expect(extractPlace('Hvenær er best að spila golf á Eyrarási?')).toBeNull()
  })
})

// ── extractPlace — travel destinations ───────────────────────────────────────

describe('extractPlace — travel destinations', () => {
  it('extracts apavatn', () => {
    const p = extractPlace('Er mér óhætt að keyra með hjólhýsi að Apavatni?')
    expect(p).not.toBeNull()
    expect(resolvePlace(p!)?.name).toBe('Apavatn')
  })

  it('extracts húsavík', () => {
    const p = extractPlace('Hvernig er veðrið í Húsavík?')
    expect(p).not.toBeNull()
    expect(resolvePlace(p!)?.name).toBe('Húsavík')
  })

  it('extracts mývatn', () => {
    const p = extractPlace('Er gott veður við Mývatn?')
    expect(p).not.toBeNull()
    expect(resolvePlace(p!)?.name).toBe('Mývatn')
  })

  it('extracts vík via mýrdal', () => {
    const p = extractPlace('Hvernig er veðrið í Mýrdal?')
    expect(p).not.toBeNull()
    expect(resolvePlace(p!)?.name).toBe('Vík')
  })

  it('extracts þingvellir', () => {
    const p = extractPlace('Hvernig er veðrið á Þingvöllum?')
    expect(p).not.toBeNull()
    expect(resolvePlace(p!)?.name).toBe('Þingvellir')
  })

  it('extracts geysir via gullfoss alias', () => {
    const p = extractPlace('Hvernig er veðrið við Gullfoss?')
    expect(p).not.toBeNull()
    expect(resolvePlace(p!)?.name).toBe('Geysir')
  })
})

// ── extractTrailerKind ────────────────────────────────────────────────────────

describe('extractTrailerKind', () => {
  it('detects horse_trailer from "hestakerra"', () => {
    expect(extractTrailerKind('Er mér óhætt að keyra með hestakerra?')).toBe('horse_trailer')
  })

  it('detects caravan from "hjólhýsi"', () => {
    expect(extractTrailerKind('Er gott veður til að keyra með hjólhýsi?')).toBe('caravan')
  })

  it('detects caravan from "karavan"', () => {
    expect(extractTrailerKind('Keyri ég með karavan?')).toBe('caravan')
  })

  it('detects generic_trailer from "eftirvagn"', () => {
    expect(extractTrailerKind('Keyri ég með eftirvagn?')).toBe('generic_trailer')
  })

  it('returns generic_trailer when no kind matches', () => {
    expect(extractTrailerKind('Hvernig er veðrið?')).toBe('generic_trailer')
  })
})

// ── extractRouteOrigin / extractRouteDestination ──────────────────────────────

describe('extractRouteOrigin', () => {
  it('extracts origin from "frá Reykjavík"', () => {
    expect(extractRouteOrigin('keyra frá Reykjavík að Apavatni')).toBe('Reykjavík')
  })

  it('returns null when no origin pattern', () => {
    expect(extractRouteOrigin('Hvernig er veðrið?')).toBeNull()
  })
})

describe('extractRouteDestination', () => {
  it('extracts destination from "að Apavatni"', () => {
    expect(extractRouteDestination('keyra frá Reykjavík að Apavatni')).toBe('Apavatni')
  })

  it('extracts destination from "til Akureyrar"', () => {
    expect(extractRouteDestination('keyra til Akureyrar')).toBe('Akureyrar')
  })

  it('returns null when no destination pattern', () => {
    expect(extractRouteDestination('Hvernig er veðrið?')).toBeNull()
  })
})

// ── parseTimeWindow ───────────────────────────────────────────────────────────

// Use a fixed "now" in the morning so evening/tomorrow windows are always in the future
const NOW_MORNING = '2026-07-03T10:00:00.000Z'

describe('parseTimeWindow — í kvöld', () => {
  it('sets window to 18:00–23:00 same day when now is before 18:00', () => {
    const { fromIso, toIso } = parseTimeWindow('í kvöld', NOW_MORNING)
    const from = new Date(fromIso)
    const to   = new Date(toIso)
    expect(from.getUTCHours()).toBe(18)
    expect(to.getUTCHours()).toBe(23)
    expect(from.toISOString().slice(0, 10)).toBe('2026-07-03')
  })

  it('advances to next day when now is after 18:00', () => {
    const { fromIso } = parseTimeWindow('í kvöld', '2026-07-03T20:00:00.000Z')
    expect(new Date(fromIso).toISOString().slice(0, 10)).toBe('2026-07-04')
  })
})

describe('parseTimeWindow — á morgun', () => {
  it('sets window to next day 08:00–22:00', () => {
    const { fromIso, toIso } = parseTimeWindow('á morgun', NOW_MORNING)
    const from = new Date(fromIso)
    const to   = new Date(toIso)
    expect(from.getUTCHours()).toBe(8)
    expect(to.getUTCHours()).toBe(22)
    expect(from.toISOString().slice(0, 10)).toBe('2026-07-04')
  })
})

describe('parseTimeWindow — seinnipartinn', () => {
  it('sets window to 14:00–18:00 same day when now is before 14:00', () => {
    const { fromIso, toIso } = parseTimeWindow('seinnipartinn', NOW_MORNING)
    const from = new Date(fromIso)
    const to   = new Date(toIso)
    expect(from.getUTCHours()).toBe(14)
    expect(to.getUTCHours()).toBe(18)
  })
})

describe('parseTimeWindow — default (next 6 hours)', () => {
  it('returns a 6-hour window from now when no keyword matches', () => {
    const { fromIso, toIso } = parseTimeWindow('Hvað er veðrið?', NOW_MORNING)
    const diffMs = new Date(toIso).getTime() - new Date(fromIso).getTime()
    expect(diffMs).toBe(6 * 60 * 60 * 1000)
  })
})
