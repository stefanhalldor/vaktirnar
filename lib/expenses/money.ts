import { failExpenseDomain } from './domain-error'

export const PERCENT_BASIS_POINTS = 10_000
const MAX_ALLOCATION_WEIGHT_TOTAL = 1_000_000

export function normalizeCurrency(currency: string): string {
  if (typeof currency !== 'string') {
    failExpenseDomain('invalid_currency')
  }
  const normalized = currency.trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(normalized)) {
    failExpenseDomain('invalid_currency', { currency })
  }
  return normalized
}

export function assertPartyId(partyId: string): string {
  if (typeof partyId !== 'string' || partyId.trim().length === 0) {
    failExpenseDomain('invalid_party_id')
  }
  return partyId
}

export function assertMinorAmount(amountMinor: number, allowZero = false): number {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0 || (!allowZero && amountMinor === 0)) {
    failExpenseDomain('invalid_amount', { amountMinor })
  }
  return amountMinor
}

export function assertSignedMinorAmount(amountMinor: number): number {
  if (!Number.isSafeInteger(amountMinor)) {
    failExpenseDomain('invalid_amount', { amountMinor })
  }
  return amountMinor
}

export function addMinorAmounts(left: number, right: number): number {
  assertSignedMinorAmount(left)
  assertSignedMinorAmount(right)
  const result = left + right
  if (!Number.isSafeInteger(result)) {
    failExpenseDomain('amount_overflow')
  }
  return result
}

export function sumMinorAmounts(amounts: readonly number[]): number {
  return amounts.reduce((sum, amount) => addMinorAmounts(sum, amount), 0)
}

/** Stable Unicode code-unit ordering, independent of UI order and locale. */
export function compareStableIds(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

export function assertUniquePartyIds(
  partyIds: readonly string[],
  duplicateCode: 'duplicate_participant' | 'duplicate_payer',
): void {
  const seen = new Set<string>()
  for (const rawPartyId of partyIds) {
    const partyId = assertPartyId(rawPartyId)
    if (seen.has(partyId)) {
      failExpenseDomain(duplicateCode, { partyId })
    }
    seen.add(partyId)
  }
}

export interface WeightedMinorAllocation {
  partyId: string
  weight: number
}

export interface AllocatedMinorAmount {
  partyId: string
  amountMinor: number
}

/**
 * Largest-remainder allocation without floating-point multiplication.
 * Tied remainder units go to the lexicographically smallest stable party ID.
 */
/** @internal Shared by the split implementations; not part of the public barrel API. */
export function allocateMinorByWeights(
  totalMinor: number,
  allocations: readonly WeightedMinorAllocation[],
  expectedWeightTotal: number,
): AllocatedMinorAmount[] {
  assertMinorAmount(totalMinor, true)
  if (
    !Number.isSafeInteger(expectedWeightTotal) ||
    expectedWeightTotal <= 0 ||
    expectedWeightTotal > MAX_ALLOCATION_WEIGHT_TOTAL
  ) {
    failExpenseDomain('invalid_amount', { expectedWeightTotal })
  }
  if (allocations.length === 0) {
    failExpenseDomain('participant_required')
  }
  assertUniquePartyIds(allocations.map((allocation) => allocation.partyId), 'duplicate_participant')

  let weightTotal = 0
  const calculated = allocations.map(({ partyId, weight }) => {
    if (!Number.isSafeInteger(weight) || weight < 0) {
      failExpenseDomain('invalid_amount', { weight })
    }
    if (weight > expectedWeightTotal) {
      failExpenseDomain('invalid_amount', { weight })
    }
    weightTotal = addMinorAmounts(weightTotal, weight)

    // total = quotient * denominator + residual. Both products below remain
    // within Number.MAX_SAFE_INTEGER, unlike total * weight in the general case.
    const quotient = Math.floor(totalMinor / expectedWeightTotal)
    const residual = totalMinor % expectedWeightTotal
    const amountMinor = addMinorAmounts(
      quotient * weight,
      Math.floor((residual * weight) / expectedWeightTotal),
    )
    const remainderNumerator = (residual * weight) % expectedWeightTotal
    return { partyId, amountMinor, remainderNumerator }
  })

  if (weightTotal !== expectedWeightTotal) {
    failExpenseDomain('percentage_total_mismatch', {
      expected: expectedWeightTotal,
      actual: weightTotal,
    })
  }

  const allocatedTotal = sumMinorAmounts(calculated.map((allocation) => allocation.amountMinor))
  const unitsToDistribute = totalMinor - allocatedTotal
  const remainderOrder = [...calculated].sort((left, right) => {
    if (left.remainderNumerator !== right.remainderNumerator) {
      return right.remainderNumerator - left.remainderNumerator
    }
    return compareStableIds(left.partyId, right.partyId)
  })

  for (let index = 0; index < unitsToDistribute; index += 1) {
    const allocation = remainderOrder[index]
    if (!allocation) {
      failExpenseDomain('amount_overflow')
    }
    allocation.amountMinor = addMinorAmounts(allocation.amountMinor, 1)
  }

  return calculated
    .map(({ partyId, amountMinor }) => ({ partyId, amountMinor }))
    .sort((left, right) => compareStableIds(left.partyId, right.partyId))
}
