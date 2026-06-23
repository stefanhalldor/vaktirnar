'use client'

import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { loanedAtWeekday } from '@/lib/loans/types'
import type { LoanItem } from '@/lib/loans/types'

interface Props {
  item: LoanItem
}

export function LoanSummaryCard({ item }: Props) {
  const t = useTranslations('teskeid.loans')
  const locale = useLocale()

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

  return (
    <Link
      href={`/auth-mvp/lanad-og-skilad/${item.id}`}
      className="block bg-white border border-black/5 rounded-2xl p-4 hover:border-[#154212]/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
    >
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
    </Link>
  )
}
