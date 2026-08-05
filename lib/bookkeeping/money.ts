import { failBookkeepingDomain } from './domain-error'

export function assertSafeIskAmount(amountMinor: number, allowZero = false): number {
  if (
    !Number.isSafeInteger(amountMinor)
    || amountMinor < 0
    || (!allowZero && amountMinor === 0)
  ) {
    failBookkeepingDomain('invalid_amount', { amountMinor })
  }
  return amountMinor
}

export function assertSafeSignedIskAmount(amountMinor: number): number {
  if (!Number.isSafeInteger(amountMinor)) {
    failBookkeepingDomain('invalid_amount', { amountMinor })
  }
  return amountMinor
}

export function addIskAmounts(left: number, right: number): number {
  assertSafeSignedIskAmount(left)
  assertSafeSignedIskAmount(right)
  const result = left + right
  if (!Number.isSafeInteger(result)) {
    failBookkeepingDomain('amount_overflow')
  }
  return result
}

export function sumIskAmounts(amounts: readonly number[]): number {
  return amounts.reduce(addIskAmounts, 0)
}

/**
 * Strict ISK parser for financial inputs. ISK uses zero minor digits. Plain
 * digits and correctly grouped Icelandic thousands dots/spaces are accepted;
 * decimals and ambiguous grouping are rejected.
 */
export function parseIskAmount(
  raw: string,
  options: { allowZero?: boolean } = {},
): number {
  if (typeof raw !== 'string') failBookkeepingDomain('invalid_amount')
  const trimmed = raw.trim()
  const valid = /^\d+$/.test(trimmed)
    || /^\d{1,3}(?:\.\d{3})+$/.test(trimmed)
    || /^\d{1,3}(?:[ \u00a0\u202f]\d{3})+$/.test(trimmed)
  if (!valid) failBookkeepingDomain('invalid_amount')
  const normalized = trimmed.replace(/[.\s\u00a0\u202f]/g, '')

  const amountMinor = Number(normalized)
  return assertSafeIskAmount(amountMinor, options.allowZero ?? false)
}

export function formatIskInteger(amountMinor: number): string {
  assertSafeSignedIskAmount(amountMinor)
  const sign = amountMinor < 0 ? '-' : ''
  return `${sign}${String(Math.abs(amountMinor)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
}

/** Formats a non-negative editable ISK integer while preserving an empty input. */
export function formatIskInput(raw: string): string {
  const compact = raw.replace(/[.\s\u00a0\u202f]/g, '')
  if (compact === '') return ''
  if (!/^\d+$/.test(compact)) return raw
  const value = Number(compact)
  return Number.isSafeInteger(value) ? formatIskInteger(value) : raw
}

export function formatSignedIskInput(raw: string): string {
  const compact = raw.replace(/[.\s\u00a0\u202f]/g, '')
  if (compact === '' || compact === '-') return compact
  if (!/^-?\d+$/.test(compact)) return raw
  const value = Number(compact)
  return Number.isSafeInteger(value) ? formatIskInteger(value) : raw
}

export function formatIskAmount(amountMinor: number, _locale = 'is-IS'): string {
  return `ISK ${formatIskInteger(amountMinor)}`
}

/** Plain signed integer suitable for copying into skattur.is. */
export function formatIskForCopy(amountMinor: number): string {
  assertSafeSignedIskAmount(amountMinor)
  return String(amountMinor)
}
