import { describe, expect, it } from 'vitest'
import {
  buildNormalizedSearchText,
  cleanPlaceText,
  normalizeFixedNumericCode,
  normalizePlaceSearchText,
} from '@/lib/places/normalize'

describe('normalizePlaceSearchText', () => {
  it('normalizes Icelandic accents and letters for forgiving search', () => {
    expect(normalizePlaceSearchText('Reykjavík')).toBe('reykjavik')
    expect(normalizePlaceSearchText('Egilsstaðir')).toBe('egilsstadir')
    expect(normalizePlaceSearchText('Þingholtsstræti')).toBe('thingholtsstraeti')
  })

  it('treats composed and decomposed Unicode equally', () => {
    const composed = 'Ísafjörður'
    const decomposed = composed.normalize('NFD')

    expect(normalizePlaceSearchText(decomposed)).toBe(
      normalizePlaceSearchText(composed),
    )
  })

  it('keeps house numbers and letters while normalizing spacing and punctuation', () => {
    expect(normalizePlaceSearchText('  Laugavegur,  10 B  ')).toBe(
      'laugavegur 10 b',
    )
  })

  it('collapses repeated whitespace without joining distinct tokens', () => {
    expect(normalizePlaceSearchText('Stora\tBorg\nEyjafirdi')).toBe(
      'stora borg eyjafirdi',
    )
  })

  it('returns an empty string for punctuation and whitespace only', () => {
    expect(normalizePlaceSearchText(' ,  , ')).toBe('')
  })
})

describe('HMS normalization helpers', () => {
  it('preserves leading zeroes and tolerates spreadsheet integer decimals', () => {
    expect(normalizeFixedNumericCode('7', 4)).toBe('0007')
    expect(normalizeFixedNumericCode('007', 4)).toBe('0007')
    expect(normalizeFixedNumericCode('7.0', 4)).toBe('0007')
  })

  it('rejects malformed and over-wide fixed numeric codes', () => {
    expect(normalizeFixedNumericCode('7.5', 4)).toBeNull()
    expect(normalizeFixedNumericCode('12345', 4)).toBeNull()
    expect(normalizeFixedNumericCode('12A', 4)).toBeNull()
  })

  it('cleans source whitespace without changing Icelandic display text', () => {
    expect(cleanPlaceText('  Efstidalur\n  II  ')).toBe('Efstidalur II')
  })

  it('builds ordered, duplicate-free normalized search text', () => {
    expect(buildNormalizedSearchText([
      'Þingholtsstræti',
      'thingholtsstraeti',
      '101 Reykjavík',
      '',
      null,
    ])).toBe('thingholtsstraeti 101 reykjavik')
  })
})
