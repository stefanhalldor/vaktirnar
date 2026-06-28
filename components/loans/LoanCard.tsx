'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Pencil, AlertTriangle } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import {
  markReturned,
  undoReturn,
  deleteLoan,
  sendInvitationEmail,
  cancelInvitation,
  claimInvitation,
  declineInvitation,
} from '@/lib/loans/actions'
import { getLoanCardControls, loanedAtWeekday } from '@/lib/loans/types'
import type { LoanItem } from '@/lib/loans/types'

interface Props {
  item: LoanItem
  afterDeleteHref?: string
  recipientDisplay?: string
}

function isOverdue(item: LoanItem): boolean {
  if (!item.due_at || item.returned_at) return false
  return item.due_at < new Date().toISOString().slice(0, 10)
}

const LOCALE_MAP: Record<string, string> = { is: 'is-IS', en: 'en-GB' }

export function LoanCard({ item, afterDeleteHref, recipientDisplay }: Props) {
  const t = useTranslations('teskeid.loans')
  const locale = useLocale()
  const displayLocale = LOCALE_MAP[locale] ?? locale

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString(displayLocale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }

  function buildDateString(year: number, month: number, day: number): string {
    if (locale === 'en') {
      return new Date(year, month - 1, day).toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    }
    return `${day}. ${t(`months.${month - 1}`)} ${year}`
  }

  function formatLoanedAt(dateStr: string): string {
    const weekdayIndex = loanedAtWeekday(dateStr)
    const weekday = t(`weekdays.${weekdayIndex}`)
    const [year, month, day] = dateStr.split('-').map(Number)
    return t('loanedAtFull', { weekday, date: buildDateString(year, month, day) })
  }

  function formatDueAt(dateStr: string): string {
    const [year, month, day] = dateStr.split('-').map(Number)
    return buildDateString(year, month, day)
  }

  function formatReturnedAt(timestamp: string): string {
    const localDate = new Date(timestamp).toLocaleDateString('sv-SE', { timeZone: 'Atlantic/Reykjavik' })
    const [year, month, day] = localDate.split('-').map(Number)
    const weekdayIndex = new Date(year, month - 1, day).getDay()
    const weekday = t(`weekdays.${weekdayIndex}`)
    return t('returnedAtFull', { weekday, date: buildDateString(year, month, day) })
  }

  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [actionError, setActionError] = useState('')

  const isReturned = item.returned_at !== null
  const overdue = isOverdue(item)
  const showInvitationStatus =
    item.invitation_status !== null &&
    item.invitation_status !== 'accepted' &&
    !(item.invitation_status === 'pending' && item.requires_acknowledgement)
  const {
    canToggleReturned,
    canEdit,
    canDelete,
    canEditItemDetails,
    showSendInvite,
    showInviteSent,
    showCancelInvite,
    isResend,
    showAddParty,
    canAcknowledge,
    canDeclineAcknowledgement,
    canSwitchRole,
  } = getLoanCardControls(item)

  function handleMarkReturned() {
    setActionError('')
    startTransition(async () => {
      const result = await markReturned(item.id)
      if (!result.ok) {
        if (result.error === 'invitation_not_accepted') {
          setActionError(t('errors.invitationNotAccepted'))
        } else {
          setActionError(t('errors.saveFailed'))
        }
      }
    })
  }

  function handleUndoReturn() {
    setActionError('')
    startTransition(async () => {
      const result = await undoReturn(item.id)
      if (!result.ok) {
        if (result.error === 'invitation_not_accepted') {
          setActionError(t('errors.invitationNotAccepted'))
        } else {
          setActionError(t('errors.saveFailed'))
        }
      }
    })
  }

  function handleDelete() {
    setActionError('')
    startTransition(async () => {
      const result = await deleteLoan(item.id)
      if (result.ok) {
        if (afterDeleteHref) router.push(afterDeleteHref)
      } else {
        setActionError(t('errors.deleteFailed'))
      }
    })
  }

  function handleSendInvite() {
    if (!item.invitation_id) return
    setActionError('')
    startTransition(async () => {
      const result = await sendInvitationEmail(item.invitation_id!)
      if (!result.ok) {
        if (result.error === 'send_uncertain') {
          setActionError(t('errors.sendUncertain'))
        } else {
          setActionError(t('errors.sendFailed'))
        }
      }
    })
  }

  function handleCancelInvite() {
    setActionError('')
    startTransition(async () => {
      const result = await cancelInvitation(item.id)
      if (!result.ok) setActionError(t('errors.saveFailed'))
    })
  }

  function handleAcknowledge() {
    if (!item.invitation_id) return
    setActionError('')
    startTransition(async () => {
      const result = await claimInvitation(item.invitation_id!)
      if (!result.ok) {
        if (result.error === 'wrong_email')          setActionError(t('errors.wrongEmail'))
        else if (result.error === 'already_claimed') setActionError(t('errors.alreadyClaimed'))
        else if (result.error === 'not_claimable')   setActionError(t('errors.notClaimable'))
        else if (result.error === 'expired')         setActionError(t('errors.expiredInvite'))
        else if (result.error === 'self_claim')      setActionError(t('errors.selfClaim'))
        else                                         setActionError(t('errors.claimFailed'))
      }
    })
  }

  function handleDeclineAcknowledgement() {
    if (!item.invitation_id) return
    setActionError('')
    startTransition(async () => {
      const result = await declineInvitation(item.invitation_id!)
      if (!result.ok) setActionError(t('errors.saveFailed'))
    })
  }

  return (
    <div className="bg-white border border-black/5 rounded-2xl p-4 flex flex-col gap-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-[#1b1c19] text-sm leading-tight truncate">
            {item.item_name}
          </p>
          <p className="text-xs text-[#72796e] mt-0.5">
            {item.requires_acknowledgement && item.other_display_name
              ? t('newEntryFrom', { name: item.other_display_name })
              : item.my_role === 'lender' ? t('lent') : t('borrowed')}
            {!item.requires_acknowledgement && (
              item.other_display_name
                ? ` · ${item.other_display_name}`
                : recipientDisplay
                  ? ` · ${recipientDisplay}`
                  : ''
            )}
          </p>
        </div>
        {canEditItemDetails && (
          <Link
            href={`/auth-mvp/lanad-og-skilad/breyta/${item.id}`}
            className="text-[#72796e] hover:text-[#154212] transition-colors shrink-0"
            aria-label={t('editTitle')}
            title={t('editTitle')}
          >
            <Pencil size={14} aria-hidden />
          </Link>
        )}
      </div>

      {/* Dates */}
      <div className="flex flex-col gap-0.5 text-xs text-[#72796e]">
        <span>{formatLoanedAt(item.loaned_at)}</span>
        {item.returned_at && (
          <span>{formatReturnedAt(item.returned_at)}</span>
        )}
        {!item.returned_at && item.due_at && (
          <span className={`flex items-center gap-1 ${overdue ? 'text-amber-600 font-medium' : ''}`}>
            {overdue && <AlertTriangle size={12} aria-hidden />}
            {t('dueAtFull', { date: formatDueAt(item.due_at) })}
            {overdue && <span className="sr-only">{t('overdue')}</span>}
          </span>
        )}
      </div>

      {/* Note */}
      {item.note && (
        <p className="text-xs text-[#72796e] leading-relaxed">{item.note}</p>
      )}

      {/* Invitation status */}
      {showInvitationStatus && (
        <p className="text-xs text-[#72796e]">
          {t(`inviteStatus.${item.invitation_status}`)}
        </p>
      )}

      {/* Error */}
      {actionError && (
        <p className="text-xs text-red-600">{actionError}</p>
      )}

      {/* Delete confirmation */}
      {confirmDelete ? (
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            disabled={isPending}
            className="flex-1 h-8 rounded-lg border border-gray-200 text-xs text-[#42493e] hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="flex-1 h-8 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {t('deleteItem')}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 pt-1">
          {/* Acknowledge / decline for pending recipient rows */}
          {(canAcknowledge || canDeclineAcknowledgement) && (
            <div className="flex gap-2">
              {canDeclineAcknowledgement && (
                <button
                  type="button"
                  onClick={handleDeclineAcknowledgement}
                  disabled={isPending}
                  className="flex-1 h-8 rounded-lg border border-gray-200 text-xs text-[#42493e] hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  {t('declineAcknowledgement')}
                </button>
              )}
              {canAcknowledge && (
                <button
                  type="button"
                  onClick={handleAcknowledge}
                  disabled={isPending}
                  className="flex-1 h-8 rounded-lg bg-[#154212] text-white text-xs font-medium hover:bg-[#2d5a27] transition-colors disabled:opacity-50"
                >
                  {t('acknowledge')}
                </button>
              )}
            </div>
          )}

          {/* Role correction link for pending recipients */}
          {canSwitchRole && (
            <Link
              href={`/auth-mvp/lanad-og-skilad/breyta/${item.id}`}
              className="inline-flex items-center min-h-[40px] text-xs text-[#72796e] hover:text-[#154212] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded"
            >
              {t('switchRole.correctRole')}
            </Link>
          )}

          {/* Return / undo row */}
          {(canToggleReturned || canDelete) && (
            <div className="flex gap-2 justify-end">
              {canToggleReturned && (
                !isReturned ? (
                  <button
                    type="button"
                    onClick={handleMarkReturned}
                    disabled={isPending}
                    className="flex-1 h-8 rounded-lg bg-[#154212] text-white text-xs font-medium hover:bg-[#2d5a27] transition-colors disabled:opacity-50"
                  >
                    {t('markReturned')}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleUndoReturn}
                    disabled={isPending}
                    className="flex-1 h-8 rounded-lg border border-gray-200 text-xs text-[#42493e] hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    {t('undoReturn')}
                  </button>
                )
              )}
              {canDelete && (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  disabled={isPending}
                  className="h-8 px-3 rounded-lg border border-gray-200 text-xs text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  {t('deleteItem')}
                </button>
              )}
            </div>
          )}

          {/* Add party */}
          {showAddParty && !isReturned && (
            <div className="flex gap-2">
              <Link
                href={`/auth-mvp/lanad-og-skilad/baeta-vid-adila/${item.id}`}
                className="flex-1 h-8 rounded-lg border border-[#154212] text-xs text-[#154212] hover:bg-[#154212]/5 transition-colors flex items-center justify-center"
              >
                {t('addParty')}
              </Link>
            </div>
          )}

          {/* Invite actions row */}
          {(showSendInvite || showInviteSent || showCancelInvite) && (
            <div className="flex gap-2 items-center">
              {showInviteSent && (
                <span className="min-w-0 flex-1 text-xs leading-snug text-[#154212]">
                  {t('inviteSent')}
                </span>
              )}
              {showSendInvite && (
                <button
                  type="button"
                  onClick={handleSendInvite}
                  disabled={isPending}
                  className="flex-1 h-8 rounded-lg border border-[#154212] text-xs text-[#154212] hover:bg-[#154212]/5 transition-colors disabled:opacity-50"
                >
                  {isResend ? t('resendInvite') : t('sendInvite')}
                </button>
              )}
              {showCancelInvite && (
                <button
                  type="button"
                  onClick={handleCancelInvite}
                  disabled={isPending}
                  className="h-8 px-3 rounded-lg border border-gray-200 text-xs text-[#72796e] hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  {t('cancelInvite')}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
