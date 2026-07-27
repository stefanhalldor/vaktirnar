import { describe, expect, it } from 'vitest'
import isMessages from '@/messages/is.json'
import enMessages from '@/messages/en.json'
import {
  ROUTE_OPTION_LABEL_MESSAGE_KEYS,
  routeOptionLabelMessageKey,
} from '@/lib/weather/routeOptionLabels'

describe('route option label translations', () => {
  it('maps every Teskeið internal label to a message key in both locales', () => {
    const isOverview = isMessages.teskeid.vedrid.overview as Record<string, string>
    const enOverview = enMessages.teskeid.vedrid.overview as Record<string, string>

    for (const [label, key] of Object.entries(ROUTE_OPTION_LABEL_MESSAGE_KEYS)) {
      expect(routeOptionLabelMessageKey(label)).toBe(key)
      expect(isOverview[key]).toBeTruthy()
      expect(enOverview[key]).toBeTruthy()
      expect(isOverview[key]).not.toContain('TESKEID_')
      expect(enOverview[key]).not.toContain('TESKEID_')
    }
  })

  it('does not expose unknown implementation labels', () => {
    expect(routeOptionLabelMessageKey('TESKEID_FUTURE_INTERNAL_FLAG')).toBeNull()
  })
})
