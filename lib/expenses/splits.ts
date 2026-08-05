import { failExpenseDomain } from './domain-error'
import {
  PERCENT_BASIS_POINTS,
  addMinorAmounts,
  allocateMinorByWeights,
  assertMinorAmount,
  assertUniquePartyIds,
  compareStableIds,
  normalizeCurrency,
  sumMinorAmounts,
} from './money'
import type { ExpenseShare } from './types'

export interface FixedShareInput {
  participantId: string
  amountMinor: number
}

export interface PercentageShareInput {
  participantId: string
  basisPoints: number
}

export interface WeightedShareInput {
  participantId: string
  weight: number
}

export interface MixedEqualShareInput {
  participantId: string
  fixedMinor: number
  participatesInRemainder: boolean
}

export interface MixedPercentageShareInput {
  participantId: string
  fixedMinor: number
  remainderBasisPoints: number
}

function toShares(
  currency: string,
  allocations: readonly { partyId: string; amountMinor: number }[],
): ExpenseShare[] {
  const normalizedCurrency = normalizeCurrency(currency)
  return allocations
    .map(({ partyId, amountMinor }) => ({
      participantId: partyId,
      amountMinor,
      currency: normalizedCurrency,
    }))
    .sort((left, right) => compareStableIds(left.participantId, right.participantId))
}

function combineAllocations(
  fixed: readonly FixedShareInput[],
  remainder: readonly { partyId: string; amountMinor: number }[],
): Array<{ partyId: string; amountMinor: number }> {
  const amounts = new Map<string, number>()
  for (const allocation of fixed) {
    amounts.set(allocation.participantId, allocation.amountMinor)
  }
  for (const allocation of remainder) {
    amounts.set(
      allocation.partyId,
      addMinorAmounts(amounts.get(allocation.partyId) ?? 0, allocation.amountMinor),
    )
  }
  return [...amounts.entries()]
    .map(([partyId, amountMinor]) => ({ partyId, amountMinor }))
    .sort((left, right) => compareStableIds(left.partyId, right.partyId))
}

function validateFixedInputs(allocations: readonly FixedShareInput[]): number {
  if (allocations.length === 0) {
    failExpenseDomain('participant_required')
  }
  assertUniquePartyIds(
    allocations.map((allocation) => allocation.participantId),
    'duplicate_participant',
  )
  for (const allocation of allocations) {
    assertMinorAmount(allocation.amountMinor, true)
  }
  return sumMinorAmounts(allocations.map((allocation) => allocation.amountMinor))
}

export function splitEqual(
  totalMinor: number,
  currency: string,
  participantIds: readonly string[],
): ExpenseShare[] {
  assertMinorAmount(totalMinor)
  if (participantIds.length === 0) {
    failExpenseDomain('participant_required')
  }
  const allocations = allocateMinorByWeights(
    totalMinor,
    participantIds.map((partyId) => ({ partyId, weight: 1 })),
    participantIds.length,
  )
  return toShares(currency, allocations)
}

export function splitByPercentage(
  totalMinor: number,
  currency: string,
  allocations: readonly PercentageShareInput[],
): ExpenseShare[] {
  assertMinorAmount(totalMinor)
  const weighted = allocations.map(({ participantId, basisPoints }) => ({
    partyId: participantId,
    weight: basisPoints,
  }))
  return toShares(
    currency,
    allocateMinorByWeights(totalMinor, weighted, PERCENT_BASIS_POINTS),
  )
}

export function splitByWeights(
  totalMinor: number,
  currency: string,
  allocations: readonly WeightedShareInput[],
): ExpenseShare[] {
  assertMinorAmount(totalMinor)
  const weightTotal = allocations.reduce((sum, allocation) => {
    if (!Number.isSafeInteger(allocation.weight) || allocation.weight < 0) {
      failExpenseDomain('invalid_amount', { weight: allocation.weight })
    }
    return addMinorAmounts(sum, allocation.weight)
  }, 0)
  return toShares(currency, allocateMinorByWeights(
    totalMinor,
    allocations.map(({ participantId, weight }) => ({ partyId: participantId, weight })),
    weightTotal,
  ))
}

export function splitByFixedAmounts(
  totalMinor: number,
  currency: string,
  allocations: readonly FixedShareInput[],
): ExpenseShare[] {
  assertMinorAmount(totalMinor)
  const fixedTotal = validateFixedInputs(allocations)
  if (fixedTotal !== totalMinor) {
    failExpenseDomain('fixed_total_mismatch', { expected: totalMinor, actual: fixedTotal })
  }
  return toShares(
    currency,
    allocations.map(({ participantId, amountMinor }) => ({ partyId: participantId, amountMinor })),
  )
}

export function splitMixedEqualRemainder(
  totalMinor: number,
  currency: string,
  allocations: readonly MixedEqualShareInput[],
): ExpenseShare[] {
  assertMinorAmount(totalMinor)
  const fixed = allocations.map(({ participantId, fixedMinor }) => ({
    participantId,
    amountMinor: fixedMinor,
  }))
  const fixedTotal = validateFixedInputs(fixed)
  if (fixedTotal > totalMinor) {
    failExpenseDomain('fixed_total_exceeds_expense', { totalMinor, fixedTotal })
  }
  if (fixedTotal === totalMinor) {
    return toShares(
      currency,
      fixed.map(({ participantId, amountMinor }) => ({ partyId: participantId, amountMinor })),
    )
  }

  const remainderParticipantIds = allocations
    .filter((allocation) => allocation.participatesInRemainder)
    .map((allocation) => allocation.participantId)
  if (remainderParticipantIds.length === 0) {
    failExpenseDomain('remainder_participant_required')
  }

  const remainderMinor = totalMinor - fixedTotal
  const remainder = allocateMinorByWeights(
    remainderMinor,
    remainderParticipantIds.map((partyId) => ({ partyId, weight: 1 })),
    remainderParticipantIds.length,
  )
  return toShares(currency, combineAllocations(fixed, remainder))
}

export function splitMixedPercentageRemainder(
  totalMinor: number,
  currency: string,
  allocations: readonly MixedPercentageShareInput[],
): ExpenseShare[] {
  assertMinorAmount(totalMinor)
  const fixed = allocations.map(({ participantId, fixedMinor }) => ({
    participantId,
    amountMinor: fixedMinor,
  }))
  const fixedTotal = validateFixedInputs(fixed)
  if (fixedTotal > totalMinor) {
    failExpenseDomain('fixed_total_exceeds_expense', { totalMinor, fixedTotal })
  }
  if (fixedTotal === totalMinor) {
    return toShares(
      currency,
      fixed.map(({ participantId, amountMinor }) => ({ partyId: participantId, amountMinor })),
    )
  }

  const remainderMinor = totalMinor - fixedTotal
  const remainder = allocateMinorByWeights(
    remainderMinor,
    allocations.map(({ participantId, remainderBasisPoints }) => ({
      partyId: participantId,
      weight: remainderBasisPoints,
    })),
    PERCENT_BASIS_POINTS,
  )
  return toShares(currency, combineAllocations(fixed, remainder))
}
