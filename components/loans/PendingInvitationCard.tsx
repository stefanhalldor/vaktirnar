'use client'

import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import type { PendingInvitation } from '@/lib/loans/types'
import { formatDateOnly } from '@/lib/date-format'

interface Props {
  invitation: PendingInvitation
}

export function PendingInvitationCard({ invitation }: Props) {
  const t = useTranslations('teskeid.loans')
  const locale = useLocale()

  return (
    <div className="bg-[#f0f7ef] border border-[#154212]/10 rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-[#1b1c19] text-sm leading-tight">
          {invitation.item_name}
        </p>
        <p className="text-xs text-[#72796e] mt-0.5">
          {invitation.recipient_role === 'lender' ? t('directionLent') : t('directionBorrowed')}
          {invitation.creator_display_name
            ? ` · ${t('invitedBy')}: ${invitation.creator_display_name}`
            : ''}
        </p>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#72796e]">
        <span>{t('loanedAt')}: {formatDateOnly(invitation.loaned_at, locale)}</span>
        {invitation.due_at && (
          <span>{formatDateOnly(invitation.due_at, locale)}</span>
        )}
      </div>

      <Link
        href={`/auth-mvp/lanad-og-skilad/claim/${invitation.invitation_id}`}
        className="flex items-center justify-center h-8 rounded-lg bg-[#154212] text-white text-xs font-medium hover:bg-[#2d5a27] transition-colors"
      >
        {t('claimTitle')}
      </Link>
    </div>
  )
}
