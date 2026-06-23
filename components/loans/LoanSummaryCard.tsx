'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { claimInvitation, declineInvitation } from '@/lib/loans/actions'
import { loanedAtWeekday } from '@/lib/loans/types'
import type { LoanItem } from '@/lib/loans/types'

interface Props {
  item: LoanItem
}

export function LoanSummaryCard({ item }: Props) {
  const t = useTranslations('teskeid.loans')
  const locale = useLocale()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [actionError, setActionError] = useState('')

  const isReturned = item.returned_at !== null
  const isOverdue = !isReturned && !!item.due_at && item.due_at < new Date().toISOString().slice(0, 10)

  const roleLabel = item.requires_acknowledgement && item.other_display_name
    ? t('newEntryFrom', { name: item.other_display_name })
    : item.my_role === 'lender'
      ? t('lent')
      : t('borrowed')

  const counterpartName = !item.requires_acknowledgement
    ? (item.other_display_name ?? item.recipient_email)
    : null
  const counterpart = counterpartName ? ` · ${counterpartName}` : ''

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

  const [lYear, lMonth, lDay] = item.loaned_at.split('-').map(Number)
  const loanedWeekday = t(`weekdays.${loanedAtWeekday(item.loaned_at)}`)
  const loanedDateStr = t('loanedAtFull', { weekday: loanedWeekday, date: buildDateString(lYear, lMonth, lDay) })

  let dueDateStr: string | null = null
  if (!isReturned && item.due_at) {
    const [dYear, dMonth, dDay] = item.due_at.split('-').map(Number)
    dueDateStr = t('dueAtFull', { date: buildDateString(dYear, dMonth, dDay) })
  }

  function handleAcknowledge() {
    if (!item.invitation_id) return
    setActionError('')
    startTransition(async () => {
      const result = await claimInvitation(item.invitation_id!)
      if (result.ok) {
        router.refresh()
      } else {
        if (result.error === 'wrong_email')          setActionError(t('errors.wrongEmail'))
        else if (result.error === 'already_claimed') setActionError(t('errors.alreadyClaimed'))
        else if (result.error === 'not_claimable')   setActionError(t('errors.notClaimable'))
        else if (result.error === 'expired')         setActionError(t('errors.expiredInvite'))
        else if (result.error === 'self_claim')      setActionError(t('errors.selfClaim'))
        else                                         setActionError(t('errors.claimFailed'))
      }
    })
  }

  function handleDecline() {
    if (!item.invitation_id) return
    setActionError('')
    startTransition(async () => {
      const result = await declineInvitation(item.invitation_id!)
      if (result.ok) {
        router.refresh()
      } else {
        setActionError(t('errors.saveFailed'))
      }
    })
  }

  const cardBody = (
    <>
      <p className="font-medium text-[#1b1c19] text-sm leading-tight truncate">
        {item.item_name}
      </p>
      <p className="text-xs text-[#72796e] mt-0.5 truncate">
        {roleLabel}{counterpart}
      </p>
      <div className="flex flex-col gap-0.5 mt-0.5">
        <p className="text-xs text-[#72796e]">
          {loanedDateStr}
          {isReturned && ` · ${t('returned')}`}
        </p>
        {dueDateStr && (
          <p className={`text-xs flex items-center gap-1 ${isOverdue ? 'text-amber-600 font-medium' : 'text-[#72796e]'}`}>
            {isOverdue && <AlertTriangle size={11} aria-hidden />}
            {dueDateStr}
          </p>
        )}
      </div>
    </>
  )

  if (item.requires_acknowledgement) {
    return (
      <article className="bg-white border border-black/5 rounded-2xl hover:border-[#154212]/30 transition-colors">
        <Link
          href={`/auth-mvp/lanad-og-skilad/${item.id}`}
          className="block p-4 pb-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-t-2xl"
        >
          {cardBody}
        </Link>
        {actionError && (
          <p className="px-4 pb-1 text-xs text-red-600">{actionError}</p>
        )}
        <div className="px-4 pb-4 flex gap-2">
          <button
            type="button"
            onClick={handleDecline}
            disabled={isPending}
            className="flex-1 h-8 rounded-lg border border-gray-200 text-xs text-[#42493e] hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {t('declineAcknowledgement')}
          </button>
          <button
            type="button"
            onClick={handleAcknowledge}
            disabled={isPending}
            className="flex-1 h-8 rounded-lg bg-[#154212] text-white text-xs font-medium hover:bg-[#2d5a27] transition-colors disabled:opacity-50"
          >
            {t('acknowledge')}
          </button>
        </div>
      </article>
    )
  }

  return (
    <Link
      href={`/auth-mvp/lanad-og-skilad/${item.id}`}
      className="block bg-white border border-black/5 rounded-2xl p-4 hover:border-[#154212]/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
    >
      {cardBody}
    </Link>
  )
}
