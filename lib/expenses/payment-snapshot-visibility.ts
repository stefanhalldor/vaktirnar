import { canViewPaymentPreference } from './payment-preferences'
import type { ExpensePaymentSnapshotView } from './contracts'
import type {
  PaymentPreferenceDetails,
  PaymentPreferenceKind,
  PaymentPreferenceVisibility,
} from './types'
import { PAYMENT_DETAIL_KEYS_BY_KIND } from './payment-detail-policy'

const KINDS = new Set<PaymentPreferenceKind>([
  'bank_account',
  'payment_app_phone',
  'payment_link',
  'cash',
  'other',
])
const VISIBILITIES = new Set<PaymentPreferenceVisibility>([
  'private',
  'debt_context',
  'explicit_share',
])
export interface PaymentSnapshotViewerContext {
  viewerUserId: string
  ownerUserId: string
  viewerOwesOwner: boolean
  sharesSettlementWithOwner: boolean
  explicitlySharedWithViewer: boolean
}

/**
 * Payment details are financial personal data. Parse from an allowlist and
 * fail closed unless both the snapshot and the viewer context are valid.
 */
export function paymentSnapshotForViewer(
  raw: Record<string, unknown> | null,
  context: PaymentSnapshotViewerContext,
): ExpensePaymentSnapshotView | null {
  if (!raw) return null
  const title = typeof raw.title === 'string' ? raw.title.trim() : ''
  const kind = raw.kind
  const currency = typeof raw.currency === 'string' ? raw.currency.trim().toUpperCase() : ''
  const visibility = raw.visibility
  const capturedAt = typeof raw.captured_at === 'string' ? raw.captured_at : ''
  const snapshotOwner = typeof raw.owner_user_id === 'string' ? raw.owner_user_id : ''
  if (
    !title ||
    !KINDS.has(kind as PaymentPreferenceKind) ||
    !currency ||
    !VISIBILITIES.has(visibility as PaymentPreferenceVisibility) ||
    !capturedAt ||
    Number.isNaN(Date.parse(capturedAt)) ||
    !snapshotOwner ||
    snapshotOwner !== context.ownerUserId
  ) return null

  const canView = canViewPaymentPreference({
    viewerId: context.viewerUserId,
    ownerId: context.ownerUserId,
    visibility: visibility as PaymentPreferenceVisibility,
    viewerOwesOwner: context.viewerOwesOwner,
    sharesSettlementWithOwner: context.sharesSettlementWithOwner,
    explicitlySharedWithViewer: context.explicitlySharedWithViewer,
  })
  if (!canView) return null

  const rawDetails = raw.details
  if (!rawDetails || typeof rawDetails !== 'object' || Array.isArray(rawDetails)) return null
  const details: PaymentPreferenceDetails = {}
  for (const key of PAYMENT_DETAIL_KEYS_BY_KIND[kind as PaymentPreferenceKind]) {
    const value = (rawDetails as Record<string, unknown>)[key]
    if (typeof value === 'string' && value.trim()) details[key] = value
  }

  return {
    title,
    kind: kind as PaymentPreferenceKind,
    currency,
    details,
    visibility: visibility as PaymentPreferenceVisibility,
    capturedAt: new Date(capturedAt).toISOString(),
  }
}
