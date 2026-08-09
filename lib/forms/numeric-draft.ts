export interface IntegerDraftConstraints {
  required?: boolean
  min?: number
  max?: number
}

export type NumericDraftError =
  | 'required'
  | 'not-a-number'
  | 'not-an-integer'
  | 'below-minimum'
  | 'above-maximum'

export type NumericDraftValidation =
  | {
      valid: true
      value: number | null
      error: null
    }
  | {
      valid: false
      value: null
      error: NumericDraftError
    }

const DECIMAL_NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/

/**
 * Parses and validates an integer draft without modifying the user's raw input.
 * Empty optional drafts are valid and intentionally have no numeric value.
 */
export function validateIntegerDraft(
  rawValue: string,
  constraints: IntegerDraftConstraints = {},
): NumericDraftValidation {
  const value = rawValue.trim()

  if (value === '') {
    return constraints.required
      ? { valid: false, value: null, error: 'required' }
      : { valid: true, value: null, error: null }
  }

  if (!DECIMAL_NUMBER_PATTERN.test(value)) {
    return { valid: false, value: null, error: 'not-a-number' }
  }

  const parsedValue = Number(value)
  if (!Number.isFinite(parsedValue)) {
    return { valid: false, value: null, error: 'not-a-number' }
  }

  if (!Number.isSafeInteger(parsedValue)) {
    return { valid: false, value: null, error: 'not-an-integer' }
  }

  if (constraints.min !== undefined && parsedValue < constraints.min) {
    return { valid: false, value: null, error: 'below-minimum' }
  }

  if (constraints.max !== undefined && parsedValue > constraints.max) {
    return { valid: false, value: null, error: 'above-maximum' }
  }

  return { valid: true, value: parsedValue, error: null }
}
