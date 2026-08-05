import { describe, expect, it } from 'vitest'
import {
  ExpenseDomainError,
  splitByFixedAmounts,
  splitByPercentage,
  splitByWeights,
  splitEqual,
  splitMixedEqualRemainder,
  splitMixedPercentageRemainder,
} from '@/lib/expenses'
import type { ExpenseDomainErrorCode } from '@/lib/expenses/domain-error'
import { allocateMinorByWeights } from '@/lib/expenses/money'

function expectDomainError(run: () => unknown, code: ExpenseDomainErrorCode): void {
  try {
    run()
    throw new Error(`Expected ${code}`)
  } catch (error) {
    expect(error).toBeInstanceOf(ExpenseDomainError)
    expect((error as ExpenseDomainError).code).toBe(code)
  }
}

describe('expense split domain', () => {
  it('splits an exactly divisible amount equally', () => {
    expect(splitEqual(12_000, 'isk', ['c', 'a', 'b'])).toEqual([
      { participantId: 'a', amountMinor: 4_000, currency: 'ISK' },
      { participantId: 'b', amountMinor: 4_000, currency: 'ISK' },
      { participantId: 'c', amountMinor: 4_000, currency: 'ISK' },
    ])
  })

  it('distributes remainder units by stable ID, not UI order', () => {
    const first = splitEqual(10_000, 'ISK', ['stefan', 'anna', 'jon'])
    const reordered = splitEqual(10_000, 'ISK', ['jon', 'stefan', 'anna'])

    expect(first).toEqual(reordered)
    expect(first).toEqual([
      { participantId: 'anna', amountMinor: 3_334, currency: 'ISK' },
      { participantId: 'jon', amountMinor: 3_333, currency: 'ISK' },
      { participantId: 'stefan', amountMinor: 3_333, currency: 'ISK' },
    ])
  })

  it('allocates a valid percentage split with deterministic largest remainders', () => {
    expect(splitByPercentage(101, 'eur', [
      { participantId: 'b', basisPoints: 5_000 },
      { participantId: 'a', basisPoints: 3_000 },
      { participantId: 'c', basisPoints: 2_000 },
    ])).toEqual([
      { participantId: 'a', amountMinor: 30, currency: 'EUR' },
      { participantId: 'b', amountMinor: 51, currency: 'EUR' },
      { participantId: 'c', amountMinor: 20, currency: 'EUR' },
    ])
  })

  it('rejects percentage totals below or above exactly 100 percent', () => {
    expectDomainError(
      () => splitByPercentage(1_000, 'ISK', [
        { participantId: 'a', basisPoints: 5_000 },
        { participantId: 'b', basisPoints: 4_999 },
      ]),
      'percentage_total_mismatch',
    )
    expectDomainError(
      () => splitByPercentage(1_000, 'ISK', [
        { participantId: 'a', basisPoints: 5_001 },
        { participantId: 'b', basisPoints: 5_000 },
      ]),
      'percentage_total_mismatch',
    )
  })

  it('splits by integer proportions with deterministic rounding', () => {
    expect(splitByWeights(101, 'ISK', [
      { participantId: 'b', weight: 2 },
      { participantId: 'a', weight: 1 },
    ])).toEqual([
      { participantId: 'a', amountMinor: 34, currency: 'ISK' },
      { participantId: 'b', amountMinor: 67, currency: 'ISK' },
    ])
  })

  it('rejects empty and all-zero proportions', () => {
    expectDomainError(() => splitByWeights(100, 'ISK', []), 'invalid_amount')
    expectDomainError(() => splitByWeights(100, 'ISK', [
      { participantId: 'a', weight: 0 },
      { participantId: 'b', weight: 0 },
    ]), 'invalid_amount')
  })

  it('rejects negative percentage input even when another input could offset it', () => {
    expectDomainError(
      () => splitByPercentage(1_000, 'ISK', [
        { participantId: 'a', basisPoints: 11_000 },
        { participantId: 'b', basisPoints: -1_000 },
      ]),
      'invalid_amount',
    )
  })

  it('accepts an exact fixed split and preserves a zero-share participant', () => {
    expect(splitByFixedAmounts(10_000, 'ISK', [
      { participantId: 'c', amountMinor: 0 },
      { participantId: 'a', amountMinor: 6_000 },
      { participantId: 'b', amountMinor: 4_000 },
    ])).toEqual([
      { participantId: 'a', amountMinor: 6_000, currency: 'ISK' },
      { participantId: 'b', amountMinor: 4_000, currency: 'ISK' },
      { participantId: 'c', amountMinor: 0, currency: 'ISK' },
    ])
  })

  it('rejects a fixed split that is either under or over the expense total', () => {
    expectDomainError(
      () => splitByFixedAmounts(10_000, 'ISK', [{ participantId: 'a', amountMinor: 9_999 }]),
      'fixed_total_mismatch',
    )
    expectDomainError(
      () => splitByFixedAmounts(10_000, 'ISK', [{ participantId: 'a', amountMinor: 10_001 }]),
      'fixed_total_mismatch',
    )
  })

  it('splits a mixed fixed amount and equal remainder', () => {
    expect(splitMixedEqualRemainder(15_001, 'ISK', [
      { participantId: 'anna', fixedMinor: 5_000, participatesInRemainder: false },
      { participantId: 'stefan', fixedMinor: 0, participatesInRemainder: true },
      { participantId: 'jon', fixedMinor: 0, participatesInRemainder: true },
    ])).toEqual([
      { participantId: 'anna', amountMinor: 5_000, currency: 'ISK' },
      { participantId: 'jon', amountMinor: 5_001, currency: 'ISK' },
      { participantId: 'stefan', amountMinor: 5_000, currency: 'ISK' },
    ])
  })

  it('allows a participant to have both a fixed amount and a percentage of the remainder', () => {
    expect(splitMixedPercentageRemainder(20_000, 'ISK', [
      { participantId: 'anna', fixedMinor: 5_000, remainderBasisPoints: 2_000 },
      { participantId: 'stefan', fixedMinor: 0, remainderBasisPoints: 6_000 },
      { participantId: 'jon', fixedMinor: 0, remainderBasisPoints: 2_000 },
    ])).toEqual([
      { participantId: 'anna', amountMinor: 8_000, currency: 'ISK' },
      { participantId: 'jon', amountMinor: 3_000, currency: 'ISK' },
      { participantId: 'stefan', amountMinor: 9_000, currency: 'ISK' },
    ])
  })

  it('accepts mixed splits fully covered by fixed amounts', () => {
    expect(splitMixedEqualRemainder(5_000, 'ISK', [
      { participantId: 'b', fixedMinor: 2_000, participatesInRemainder: false },
      { participantId: 'a', fixedMinor: 3_000, participatesInRemainder: false },
    ])).toEqual([
      { participantId: 'a', amountMinor: 3_000, currency: 'ISK' },
      { participantId: 'b', amountMinor: 2_000, currency: 'ISK' },
    ])
    expect(splitMixedPercentageRemainder(5_000, 'ISK', [
      { participantId: 'b', fixedMinor: 2_000, remainderBasisPoints: 0 },
      { participantId: 'a', fixedMinor: 3_000, remainderBasisPoints: 0 },
    ])).toEqual([
      { participantId: 'a', amountMinor: 3_000, currency: 'ISK' },
      { participantId: 'b', amountMinor: 2_000, currency: 'ISK' },
    ])
  })

  it('rejects mixed splits that exceed the total or leave a remainder without recipients', () => {
    expectDomainError(
      () => splitMixedEqualRemainder(5_000, 'ISK', [
        { participantId: 'a', fixedMinor: 5_001, participatesInRemainder: true },
      ]),
      'fixed_total_exceeds_expense',
    )
    expectDomainError(
      () => splitMixedEqualRemainder(5_000, 'ISK', [
        { participantId: 'a', fixedMinor: 1_000, participatesInRemainder: false },
      ]),
      'remainder_participant_required',
    )
  })

  it('rejects duplicate participants and an empty participant list', () => {
    expectDomainError(() => splitEqual(100, 'ISK', ['a', 'a']), 'duplicate_participant')
    expectDomainError(() => splitEqual(100, 'ISK', []), 'participant_required')
  })

  it('does exact percentage arithmetic near Number.MAX_SAFE_INTEGER', () => {
    const totalMinor = Number.MAX_SAFE_INTEGER
    const shares = splitByPercentage(totalMinor, 'USD', [
      { participantId: 'a', basisPoints: 5_000 },
      { participantId: 'b', basisPoints: 5_000 },
    ])
    expect(shares[0]!.amountMinor + shares[1]!.amountMinor).toBe(totalMinor)
    expect(shares).toEqual([
      { participantId: 'a', amountMinor: 4_503_599_627_370_496, currency: 'USD' },
      { participantId: 'b', amountMinor: 4_503_599_627_370_495, currency: 'USD' },
    ])
  })

  it('rejects an unsafe general allocation denominator before multiplication', () => {
    expectDomainError(
      () => allocateMinorByWeights(100, [{ partyId: 'a', weight: 1_000_001 }], 1_000_001),
      'invalid_amount',
    )
  })

  it('preserves totals and stable ordering across a deterministic stress range', () => {
    for (let totalMinor = 1; totalMinor <= 257; totalMinor += 1) {
      for (let participantCount = 1; participantCount <= 7; participantCount += 1) {
        const ids = Array.from({ length: participantCount }, (_, index) => `party-${index}`)
        const forward = splitEqual(totalMinor, 'ISK', ids)
        const reverse = splitEqual(totalMinor, 'ISK', [...ids].reverse())
        expect(forward).toEqual(reverse)
        expect(forward.reduce((sum, item) => sum + item.amountMinor, 0)).toBe(totalMinor)
      }
    }

    let seed = 17
    const next = () => {
      seed = (seed * 48_271) % 2_147_483_647
      return seed
    }
    for (let caseIndex = 0; caseIndex < 80; caseIndex += 1) {
      const participantCount = 2 + (next() % 5)
      const cuts = Array.from({ length: participantCount - 1 }, () => next() % 10_001)
        .sort((left, right) => left - right)
      const boundaries = [0, ...cuts, 10_000]
      const percentages = Array.from({ length: participantCount }, (_, index) => ({
        participantId: `party-${index}`,
        basisPoints: boundaries[index + 1]! - boundaries[index]!,
      }))
      const totalMinor = 1 + (next() % 1_000_000)
      const forward = splitByPercentage(totalMinor, 'ISK', percentages)
      const reverse = splitByPercentage(totalMinor, 'ISK', [...percentages].reverse())
      expect(forward).toEqual(reverse)
      expect(forward.reduce((sum, item) => sum + item.amountMinor, 0)).toBe(totalMinor)
    }
  })
})
