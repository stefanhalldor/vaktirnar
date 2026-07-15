/**
 * Tests for selectDecisiveProvider — provider-neutral comparator.
 *
 * Tie-break order (v141 spec):
 * 1. Worse severity wins (lower WIND_DISPLAY_STATUS_PRIORITY_ORDER index).
 * 2. Same severity: higher windMs wins.
 * 3. Same severity and same windMs: stable provider order (vegagerdin > vedurstofan > metno).
 */

import { describe, it, expect } from 'vitest'
import { selectDecisiveProvider, type ProviderSlotAssessment } from '@/lib/weather/providerComparator'

const vedurstofan = (status: ProviderSlotAssessment['status'], windMs: number | null): ProviderSlotAssessment =>
  ({ provider: 'vedurstofan', status, windMs })

const metno = (status: ProviderSlotAssessment['status'], windMs: number | null): ProviderSlotAssessment =>
  ({ provider: 'metno', status, windMs })

const vegagerdin = (status: ProviderSlotAssessment['status'], windMs: number | null): ProviderSlotAssessment =>
  ({ provider: 'vegagerdin', status, windMs })

describe('selectDecisiveProvider', () => {
  describe('severity wins first', () => {
    it('Veðurstofan worse severity beats MET/Yr milder severity', () => {
      const result = selectDecisiveProvider(
        vedurstofan('othaegilegt', 10),
        metno('innan-marka', 5),
      )
      expect(result.provider).toBe('vedurstofan')
    })

    it('MET/Yr worse severity beats Veðurstofan milder severity', () => {
      const result = selectDecisiveProvider(
        vedurstofan('innan-marka', 5),
        metno('haettulegt', 18),
      )
      expect(result.provider).toBe('metno')
    })

    it('haettulegt always beats othaegilegt regardless of provider order', () => {
      expect(selectDecisiveProvider(metno('haettulegt', 16), vedurstofan('othaegilegt', 20)).provider).toBe('metno')
      expect(selectDecisiveProvider(vedurstofan('haettulegt', 16), metno('othaegilegt', 20)).provider).toBe('vedurstofan')
    })
  })

  describe('same severity: higher windMs wins', () => {
    it('MET/Yr higher wind beats Veðurstofan lower wind in same severity band', () => {
      const result = selectDecisiveProvider(
        vedurstofan('othaegilegt', 8),
        metno('othaegilegt', 11),
      )
      expect(result.provider).toBe('metno')
    })

    it('Veðurstofan higher wind beats MET/Yr lower wind in same severity band', () => {
      const result = selectDecisiveProvider(
        vedurstofan('othaegilegt', 13),
        metno('othaegilegt', 9),
      )
      expect(result.provider).toBe('vedurstofan')
    })
  })

  describe('same severity and same windMs: stable provider order', () => {
    it('Veðurstofan beats MET/Yr when both are equal', () => {
      const result = selectDecisiveProvider(
        vedurstofan('othaegilegt', 10),
        metno('othaegilegt', 10),
      )
      expect(result.provider).toBe('vedurstofan')
    })

    it('Veðurstofan beats MET/Yr when both have null windMs', () => {
      const result = selectDecisiveProvider(
        vedurstofan('nalgast-othaegindi', null),
        metno('nalgast-othaegindi', null),
      )
      expect(result.provider).toBe('vedurstofan')
    })

    it('Vegagerðin beats Veðurstofan in stable order', () => {
      const result = selectDecisiveProvider(
        vegagerdin('othaegilegt', 10),
        vedurstofan('othaegilegt', 10),
      )
      expect(result.provider).toBe('vegagerdin')
    })

    it('Vegagerðin beats MET/Yr in stable order', () => {
      const result = selectDecisiveProvider(
        metno('othaegilegt', 10),
        vegagerdin('othaegilegt', 10),
      )
      expect(result.provider).toBe('vegagerdin')
    })
  })

  describe('argument order does not affect result', () => {
    it('severity check is symmetric', () => {
      const ab = selectDecisiveProvider(vedurstofan('haettulegt', 5), metno('innan-marka', 15))
      const ba = selectDecisiveProvider(metno('innan-marka', 15), vedurstofan('haettulegt', 5))
      expect(ab.provider).toBe('vedurstofan')
      expect(ba.provider).toBe('vedurstofan')
    })

    it('windMs check is symmetric', () => {
      const ab = selectDecisiveProvider(vedurstofan('othaegilegt', 8), metno('othaegilegt', 12))
      const ba = selectDecisiveProvider(metno('othaegilegt', 12), vedurstofan('othaegilegt', 8))
      expect(ab.provider).toBe('metno')
      expect(ba.provider).toBe('metno')
    })
  })
})
