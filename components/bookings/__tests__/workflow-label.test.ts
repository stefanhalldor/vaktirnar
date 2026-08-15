import { describe, expect, it, vi } from 'vitest'
import {
  bookingCancellationReasonOptions,
  resolveBookingCancellationReason,
  resolveBookingWorkflowAttention,
  resolveBookingWorkflowLabel,
} from '../workflow-label'

describe('booking workflow labels', () => {
  it('translates only an allowlisted default for the requested audience', () => {
    const t = vi.fn((key: string) => `translated:${key}`)

    expect(resolveBookingWorkflowLabel(t, {
      systemLabelKey: 'new_request',
      label: null,
    }, 'provider')).toBe('translated:workflow.systemLabels.new_request.provider')
    expect(t).toHaveBeenCalledOnce()
  })

  it('renders a custom label verbatim without treating it as a translation key', () => {
    const t = vi.fn((key: string) => `translated:${key}`)
    const custom = '<b>Viðskiptavinur velur þetta</b>'

    expect(resolveBookingWorkflowLabel(t, {
      systemLabelKey: null,
      label: custom,
    }, 'customer')).toBe(custom)
    expect(t).not.toHaveBeenCalled()
  })

  it('keeps attention and cancellation copy on fixed translation keys', () => {
    const t = (key: string) => key

    expect(resolveBookingWorkflowAttention(t, 'provider', 'customer'))
      .toBe('workflow.attention.customer.provider')
    expect(resolveBookingCancellationReason(t, 'legacy_unspecified'))
      .toBe('workflow.cancellationReasons.legacy_unspecified')
    expect(bookingCancellationReasonOptions(t).map(option => option.value)).toEqual([
      'customer_cancelled',
      'provider_unavailable',
      'other',
    ])
  })
})
