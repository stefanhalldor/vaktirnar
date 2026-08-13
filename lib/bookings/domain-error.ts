import type { BookingActionError } from './contracts'

export class BookingDomainError extends Error {
  constructor(public readonly code: BookingActionError) {
    super(`booking_${code}`)
    this.name = 'BookingDomainError'
  }
}

export function mapBookingError(error: unknown): BookingActionError {
  if (error instanceof BookingDomainError) return error.code
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  if (message.includes('rate_limited')) return 'rate_limited'
  if (message.includes('unavailable') || message.includes('disabled')) return 'feature_disabled'
  if (message.includes('not_found') || message.includes('not_allowed')) return 'not_found'
  if (message.includes('unauthorized') || message.includes('no_session')) return 'unauthorized'
  if (message.includes('conflict') || message.includes('last_owner') || message.includes('cancelled')) {
    return 'conflict'
  }
  if (message.includes('invalid') || message.includes('required') || message.includes('member_limit')) {
    return 'invalid_input'
  }
  return 'save_failed'
}
