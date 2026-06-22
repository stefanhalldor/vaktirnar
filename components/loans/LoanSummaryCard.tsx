'use client'

import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import type { LoanItem } from '@/lib/loans/types'

const LOCALE_MAP: Record<string, string> = { is: 'is-IS', en: 'en-GB' }

interface Props {
  item: LoanItem
}

export function LoanSummaryCard({ item }: Props) {
  const t = useTranslations('teskeid.loans')
  const locale = useLocale()
  const displayLocale = LOCALE_MAP[locale] ?? locale

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

  const [year, month, day] = item.loaned_at.split('-').map(Number)
  const dateStr = new Date(year, month - 1, day).toLocaleDateString(displayLocale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

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
      <p className={`text-xs mt-0.5 flex items-center gap-1 ${isOverdue ? 'text-amber-600 font-medium' : 'text-[#72796e]'}`}>
        {isOverdue && <AlertTriangle size={11} aria-hidden />}
        {dateStr}
        {isReturned && ` · ${t('returned')}`}
      </p>
    </Link>
  )
}
