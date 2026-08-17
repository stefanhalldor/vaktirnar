'use client'

import { useLocale } from 'next-intl'
import { CheckCircle2, EllipsisVertical } from 'lucide-react'
import { TeskeidActionSheet } from '@/components/teskeid/TeskeidActionSheet'
import type {
  ExpenseEventIdentityCandidatesView,
  ExpenseMemberView,
  ExpenseParticipantOption,
  ExpenseSettlementTransferView,
} from '@/lib/expenses/contracts'
import type { ExpenseMemberRepaymentStatus } from '@/lib/expenses/repayment-status'
import { formatExpenseMinor } from '@/lib/expenses/input-money'
import { ExpenseRepaymentDialog } from './ExpenseRepaymentDialog'
import { ExpenseRepaymentStatusLines } from './ExpenseRepaymentStatusLines'
import { ExpenseSettlementIdentityActions } from './ExpenseSettlementIdentityActions'
import { ExpenseShareCollaboratorPicker } from './ExpenseShareCollaboratorPicker'
import { useExpenseTranslations } from './i18n.client'

type SettlementCategory = 'outstanding' | 'completed' | 'credit'
type SettlementSection = SettlementCategory | 'reported'

export interface ExpenseSettlementParticipantRow {
  id: string
  name: string
  isSelf: boolean
  currency: string
  shareAmountMinor: number | null
  paymentAmountMinor: number | null
  category: SettlementCategory
  repaymentStatus?: ExpenseMemberRepaymentStatus
  remainingAmountMinor: number
  actionableRemainingAmountMinor: number
  actionTransfer: ExpenseSettlementTransferView | null
  identities: ExpenseMemberView[]
  isShared: boolean
  canAddCollaborator: boolean
  expenseId: string
  shareMemberId: string
}

const SECTION_ORDER: SettlementSection[] = ['outstanding', 'reported', 'credit', 'completed']

function sectionFor(row: ExpenseSettlementParticipantRow): SettlementSection {
  if (row.category === 'credit') return 'credit'
  if (
    (row.repaymentStatus?.reportedAmountMinor ?? 0) > 0
    && row.actionableRemainingAmountMinor === 0
  ) return 'reported'
  return row.category
}

function canManageIdentity(member: ExpenseMemberView, canLinkGuests: boolean): boolean {
  return canLinkGuests
    && member.status === 'active'
    && !member.isSelf
    && !member.isRegistered
}

function SettlementIdentityHeading({ row }: { row: ExpenseSettlementParticipantRow }) {
  const t = useExpenseTranslations()
  if (row.identities.length === 1) {
    const identity = row.identities[0]!
    const invitation = identity.identityInvitation
    const identityLabel = invitation?.recipientLabel ?? identity.displayName
    return (
      <p className="break-words font-medium">
        {identityLabel}{identity.isSelf ? ` ${t('expenseForm.youSuffix')}` : ''}
        {invitation
          ? ` · ${t('expenseForm.invitationPending')}`
          : identity.isRegistered
            ? ` ${t('expenseForm.registeredMarker')}`
            : ` (${t('expenseForm.guestMarker')})`}
      </p>
    )
  }
  return (
    <>
      <p className="break-words font-medium">{row.name}</p>
      <div className="mt-0.5 space-y-0.5 text-xs leading-5 text-muted-foreground">
        {row.identities.map((identity) => {
          const invitation = identity.identityInvitation
          const identityLabel = invitation?.recipientLabel ?? identity.displayName
          const identityStatus = invitation
            ? t('expenseForm.invitationPending')
            : identity.isRegistered
              ? t('expenseForm.registeredMarker')
              : t('expenseForm.guestMarker')
          return (
            <p key={identity.id} className="break-words">
              {identityLabel}{identity.isSelf ? ` ${t('expenseForm.youSuffix')}` : ''} · {identityStatus}
            </p>
          )
        })}
      </div>
    </>
  )
}

function SettlementParticipantActions({
  row,
  groupId,
  initialDate,
  participantOptions,
  participantOptionsError,
  canLinkGuests,
  canRenameGuests,
  financialVersion,
  eventIdentityCandidates,
}: {
  row: ExpenseSettlementParticipantRow
  groupId: string
  initialDate: string
  participantOptions: ExpenseParticipantOption[]
  participantOptionsError: boolean
  canLinkGuests: boolean
  canRenameGuests: boolean
  financialVersion: number
  eventIdentityCandidates: ExpenseEventIdentityCandidatesView | null
}) {
  const t = useExpenseTranslations()
  const hasActions = Boolean(
    row.actionTransfer
    || row.canAddCollaborator
    || row.identities.some((identity) => canManageIdentity(identity, canLinkGuests))
    || row.identities.some((identity) => (
      identity.id === row.shareMemberId
      && canManageIdentity(identity, canRenameGuests)
    ))
    || Boolean(eventIdentityCandidates && row.identities.some((identity) => (
      identity.status === 'active' && !identity.isSelf && !identity.isRegistered
    ))),
  )
  if (!hasActions) return null

  return (
    <TeskeidActionSheet
      trigger={(
        <button
          type="button"
          aria-label={t('expense.settlementActions.open', { name: row.name })}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <EllipsisVertical aria-hidden size={20} />
        </button>
      )}
      title={t('expense.settlementActions.title', { name: row.name })}
      description={t('expense.settlementActions.description')}
      closeLabel={t('expense.settlementActions.close')}
    >
      {row.actionTransfer ? (
        <ExpenseRepaymentDialog
          groupId={groupId}
          transfer={row.actionTransfer}
          initialDate={initialDate}
          actionSheetTrigger
        />
      ) : null}
      {row.identities.map((identity) => (
        <ExpenseSettlementIdentityActions
          key={`actions:${identity.id}`}
          groupId={groupId}
          member={identity}
          canLinkGuests={canLinkGuests}
          canRenameGuest={canRenameGuests && identity.id === row.shareMemberId}
          showIdentityHeading={row.isShared}
          expenseId={row.expenseId}
          financialVersion={financialVersion}
          eventIdentityCandidates={eventIdentityCandidates}
        />
      ))}
      {row.canAddCollaborator ? (
        <ExpenseShareCollaboratorPicker
          groupId={groupId}
          expenseId={row.expenseId}
          shareMemberId={row.shareMemberId}
          options={participantOptions}
          optionsError={participantOptionsError}
        />
      ) : null}
    </TeskeidActionSheet>
  )
}

export function ExpenseSettlementParticipantList({
  rows,
  groupId,
  initialDate,
  participantOptions,
  participantOptionsError,
  canLinkGuests,
  canRenameGuests,
  financialVersion,
  eventIdentityCandidates = null,
}: {
  rows: ExpenseSettlementParticipantRow[]
  groupId: string
  initialDate: string
  participantOptions: ExpenseParticipantOption[]
  participantOptionsError: boolean
  canLinkGuests: boolean
  canRenameGuests: boolean
  financialVersion: number
  eventIdentityCandidates?: ExpenseEventIdentityCandidatesView | null
}) {
  const t = useExpenseTranslations()
  const locale = useLocale()
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' })
  const sortedRows = [...rows].sort((left, right) => (
    collator.compare(left.name, right.name) || left.id.localeCompare(right.id)
  ))

  return (
    <div className="space-y-6">
      {SECTION_ORDER.map((section) => {
        const sectionRows = sortedRows.filter((row) => sectionFor(row) === section)
        if (sectionRows.length === 0) return null
        const headingId = `expense-settlement-${section}`
        return (
          <section key={section} aria-labelledby={headingId}>
            <div className="flex min-h-10 items-center gap-2 border-b border-border">
              <h3
                id={headingId}
                aria-label={`${t(`expense.settlementFilters.${section}`)} ${sectionRows.length}`}
                className="flex items-center gap-2 text-sm font-semibold"
              >
                {t(`expense.settlementFilters.${section}`)}
                <span className="inline-flex min-w-5 justify-center rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">
                  {sectionRows.length}
                </span>
              </h3>
            </div>
            {sectionRows.length > 0 ? (
              <div role="list" className="divide-y divide-border">
                {sectionRows.map((row) => {
                  const reportedAmountMinor = row.repaymentStatus?.reportedAmountMinor ?? 0
                  const reportedTotalMinor = reportedAmountMinor + row.actionableRemainingAmountMinor
                  return (
                    <div role="listitem" key={row.id} className="min-h-14 py-3 text-sm">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <SettlementIdentityHeading row={row} />
                        </div>
                        <SettlementParticipantActions
                          row={row}
                          groupId={groupId}
                          initialDate={initialDate}
                          participantOptions={participantOptions}
                          participantOptionsError={participantOptionsError}
                          canLinkGuests={canLinkGuests}
                          canRenameGuests={canRenameGuests}
                          financialVersion={financialVersion}
                          eventIdentityCandidates={eventIdentityCandidates}
                        />
                      </div>
                      {row.shareAmountMinor !== null ? (
                        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                          {t(row.isShared ? 'expenseForm.sharedParticipantShare' : 'expenseForm.participantShare', {
                            amount: formatExpenseMinor(row.shareAmountMinor, row.currency, locale),
                          })}
                        </p>
                      ) : null}
                      {reportedAmountMinor > 0 ? (
                        <span className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                          {t(row.actionableRemainingAmountMinor > 0
                            ? 'repayment.reportedProgress'
                            : 'repayment.reportedFull', {
                            reported: formatExpenseMinor(reportedAmountMinor, row.currency, locale),
                            total: formatExpenseMinor(reportedTotalMinor, row.currency, locale),
                            amount: formatExpenseMinor(reportedAmountMinor, row.currency, locale),
                          })}
                        </span>
                      ) : null}
                      {row.paymentAmountMinor !== null ? (
                        <p className="mt-0.5 flex items-start gap-1.5 text-xs leading-5 text-emerald-700">
                          <CheckCircle2 aria-hidden size={15} className="mt-0.5 shrink-0" />
                          <span>{t('expenseForm.paidAtPurchase', {
                            amount: formatExpenseMinor(row.paymentAmountMinor, row.currency, locale),
                          })}</span>
                        </p>
                      ) : null}
                      {(row.repaymentStatus?.confirmedAmountMinor ?? 0) > 0 ? (
                        <div className="mt-1 space-y-1">
                          <ExpenseRepaymentStatusLines
                            status={row.repaymentStatus}
                            currency={row.currency}
                            remainingAmountMinor={row.remainingAmountMinor}
                            showReported={false}
                          />
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}
