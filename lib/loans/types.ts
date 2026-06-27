import { z } from 'zod'

// ============================================================
// Presentation types (returned by RPCs)
// ============================================================

export interface LoanItem {
  id: string
  item_name: string
  note: string | null
  loaned_at: string         // YYYY-MM-DD
  due_at: string | null     // YYYY-MM-DD
  returned_at: string | null
  my_role: 'lender' | 'borrower'
  other_display_name: string | null
  invitation_id: string | null
  invitation_status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired' | null
  invitation_attempt_status: 'reserved' | 'sent' | 'failed' | null
  can_send_invitation: boolean
  is_creator: boolean
  requires_acknowledgement: boolean
  recipient_email: string | null
}

export interface PendingInvitation {
  invitation_id: string
  loan_id: string
  item_name: string
  recipient_role: 'lender' | 'borrower'
  loaned_at: string
  due_at: string | null
  status: string
  expires_at: string
  creator_display_name: string | null
}

export interface ClaimInvitationDetails {
  invitation_id: string
  loan_id: string
  item_name: string
  recipient_role: 'lender' | 'borrower'
  loaned_at: string
  due_at: string | null
  status: string
  expires_at: string
  creator_display_name: string | null
}

// ============================================================
// Validation schemas
// ============================================================

function isValidDate(s: string): boolean {
  const d = new Date(s)
  // Round-trip check: rejects overflowed dates like 2026-02-31 → 2026-03-03
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
  .refine(isValidDate, 'Invalid date')

export const CreateLoanSchema = z
  .object({
    item_name: z.string().trim().min(1, 'required').max(200),
    note: z
      .string()
      .max(1000)
      .nullable()
      .optional()
      .transform((v) => v?.trim() || null),
    loaned_at: dateField,
    due_at: dateField.nullable().optional().transform((v) => v ?? null),
    creator_role: z.enum(['lender', 'borrower']),
    recipient_email: z.preprocess(
      (v) => (v === '' || v == null ? undefined : v),
      z.string().trim().email().max(320).transform((v) => v.toLowerCase()).optional(),
    ),
    request_id: z.string().uuid(),
  })
  .refine((d) => !d.due_at || d.due_at >= d.loaned_at, {
    message: 'due_at must be on or after loaned_at',
    path: ['due_at'],
  })

export const EditLoanItemDetailsSchema = z
  .object({
    item_name: z.string().trim().min(1, 'required').max(200),
    note: z
      .string()
      .max(1000)
      .nullable()
      .optional()
      .transform((v) => v?.trim() || null),
    loaned_at: dateField,
    due_at: dateField.nullable().optional().transform((v) => v ?? null),
  })
  .refine((d) => !d.due_at || d.due_at >= d.loaned_at, {
    message: 'due_at must be on or after loaned_at',
    path: ['due_at'],
  })
export type EditLoanItemDetailsInput = z.infer<typeof EditLoanItemDetailsSchema>

export const EditLoanSchema = z
  .object({
    item_name: z.string().trim().min(1, 'required').max(200),
    note: z
      .string()
      .max(1000)
      .nullable()
      .optional()
      .transform((v) => v?.trim() || null),
    loaned_at: dateField,
    due_at: dateField.nullable().optional().transform((v) => v ?? null),
  })
  .refine((d) => !d.due_at || d.due_at >= d.loaned_at, {
    message: 'due_at must be on or after loaned_at',
    path: ['due_at'],
  })

export const AddInvitationSchema = z.object({
  recipient_email: z.string().trim().email('invalid_email').max(320).transform((v) => v.toLowerCase()),
})

export type CreateLoanInput = z.infer<typeof CreateLoanSchema>
export type EditLoanInput = z.infer<typeof EditLoanSchema>
export type AddInvitationInput = z.infer<typeof AddInvitationSchema>

/**
 * Returns 0 (Sun)–6 (Sat) for a YYYY-MM-DD string, parsed as a local date
 * to avoid UTC midnight timezone shift.
 */
export function loanedAtWeekday(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day).getDay()
}

// Return/undo controls appear only when both parties have joined.
export function canShowReturnControls(
  invitationStatus: LoanItem['invitation_status'],
): boolean {
  return invitationStatus === 'accepted'
}

// All control-visibility booleans derived from a LoanItem.
// Single source of truth used by both LoanCard and tests.
export interface LoanCardControls {
  bothPartiesJoined: boolean
  canToggleReturned: boolean
  canEdit: boolean
  canDelete: boolean
  showSendInvite: boolean
  showInviteSent: boolean
  showCancelInvite: boolean
  isResend: boolean
  showAddParty: boolean
  canEditItemDetails: boolean
  canAcknowledge: boolean
  canDeclineAcknowledgement: boolean
}

export function getLoanCardControls(
  item: Pick<LoanItem, 'invitation_status' | 'invitation_attempt_status' | 'can_send_invitation' | 'is_creator' | 'my_role' | 'requires_acknowledgement'>,
): LoanCardControls {
  const isPendingRecipient = item.requires_acknowledgement
  return {
    bothPartiesJoined: canShowReturnControls(item.invitation_status),
    canToggleReturned:
      item.invitation_status === 'accepted' ||
      (item.is_creator && item.invitation_status === 'pending' && !isPendingRecipient),
    canEdit:  item.is_creator && item.invitation_status !== 'accepted',
    canDelete: item.is_creator && item.invitation_status !== 'accepted',
    showSendInvite: item.can_send_invitation,
    showInviteSent:
      item.is_creator &&
      item.invitation_status === 'pending' &&
      item.invitation_attempt_status === 'sent' &&
      !item.can_send_invitation,
    showCancelInvite: item.is_creator && item.invitation_status === 'pending',
    isResend: item.invitation_attempt_status !== null,
    showAddParty:
      item.is_creator &&
      item.invitation_status !== 'pending' &&
      item.invitation_status !== 'accepted',
    // Accepted borrower may now edit via SQL58 (borrower_user_id authorized in new RPC).
    // Pending recipients cannot edit: borrower_user_id is only set after claim.
    canEditItemDetails: !isPendingRecipient && (item.is_creator || item.my_role === 'lender' || item.invitation_status === 'accepted'),
    canAcknowledge: isPendingRecipient,
    canDeclineAcknowledgement: isPendingRecipient,
  }
}
