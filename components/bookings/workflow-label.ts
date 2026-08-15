import type {
  BookingCancellationReason,
  BookingWorkflowAttentionSide,
  BookingWorkflowLabelView,
  BookingWorkflowSystemLabelKey,
  StoredBookingCancellationReason,
} from '@/lib/bookings/contracts'

export type BookingWorkflowLabelAudience = 'provider' | 'customer'
export type BookingWorkflowTranslate = (key: string) => string

const SYSTEM_LABEL_KEYS: Record<
  BookingWorkflowSystemLabelKey,
  Record<BookingWorkflowLabelAudience, string>
> = {
  new_request: {
    provider: 'workflow.systemLabels.new_request.provider',
    customer: 'workflow.systemLabels.new_request.customer',
  },
  under_review: {
    provider: 'workflow.systemLabels.under_review.provider',
    customer: 'workflow.systemLabels.under_review.customer',
  },
  waiting_customer: {
    provider: 'workflow.systemLabels.waiting_customer.provider',
    customer: 'workflow.systemLabels.waiting_customer.customer',
  },
  waiting_provider: {
    provider: 'workflow.systemLabels.waiting_provider.provider',
    customer: 'workflow.systemLabels.waiting_provider.customer',
  },
  confirmed: {
    provider: 'workflow.systemLabels.confirmed.provider',
    customer: 'workflow.systemLabels.confirmed.customer',
  },
}

const ATTENTION_KEYS: Record<
  BookingWorkflowLabelAudience,
  Record<BookingWorkflowAttentionSide, string>
> = {
  provider: {
    provider: 'workflow.attention.provider.yours',
    customer: 'workflow.attention.provider.customer',
    none: 'workflow.attention.provider.none',
  },
  customer: {
    provider: 'workflow.attention.customer.provider',
    customer: 'workflow.attention.customer.yours',
    none: 'workflow.attention.customer.none',
  },
}

const CANCELLATION_REASON_KEYS: Record<StoredBookingCancellationReason, string> = {
  customer_cancelled: 'workflow.cancellationReasons.customer_cancelled',
  provider_unavailable: 'workflow.cancellationReasons.provider_unavailable',
  other: 'workflow.cancellationReasons.other',
  legacy_unspecified: 'workflow.cancellationReasons.legacy_unspecified',
}

/** Translate only allowlisted Teskeið defaults; custom labels remain plain React text. */
export function resolveBookingWorkflowLabel(
  t: BookingWorkflowTranslate,
  value: BookingWorkflowLabelView,
  audience: BookingWorkflowLabelAudience,
): string {
  if (value.systemLabelKey) return t(SYSTEM_LABEL_KEYS[value.systemLabelKey][audience])
  return value.label?.trim() || t('workflow.statusPanel.unavailable')
}

export function resolveBookingWorkflowAttention(
  t: BookingWorkflowTranslate,
  attentionSide: BookingWorkflowAttentionSide,
  audience: BookingWorkflowLabelAudience,
): string {
  return t(ATTENTION_KEYS[audience][attentionSide])
}

export function resolveBookingCancellationReason(
  t: BookingWorkflowTranslate,
  reason: StoredBookingCancellationReason,
): string {
  return t(CANCELLATION_REASON_KEYS[reason])
}

export function bookingCancellationReasonOptions(
  t: BookingWorkflowTranslate,
): Array<{ value: BookingCancellationReason; label: string }> {
  return (['customer_cancelled', 'provider_unavailable', 'other'] as const).map(value => ({
    value,
    label: resolveBookingCancellationReason(t, value),
  }))
}
