'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { LoanCard } from './LoanCard'
import type { LoanItem } from '@/lib/loans/types'

type RoleFilter = 'all' | 'lender' | 'borrower'
type Tab = 'open' | 'returned'

interface Props {
  items: LoanItem[]
}

export function LoanList({ items }: Props) {
  const t = useTranslations('teskeid.loans')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [tab, setTab] = useState<Tab>('open')

  const filtered = items.filter((item) => {
    const matchesTab =
      tab === 'open' ? item.returned_at === null : item.returned_at !== null
    const matchesRole =
      roleFilter === 'all' || item.my_role === roleFilter
    return matchesTab && matchesRole
  })

  return (
    <div className="flex flex-col gap-4">
      {/* Role filter */}
      <div className="flex rounded-xl border border-gray-200 overflow-hidden">
        {(['all', 'lender', 'borrower'] as RoleFilter[]).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRoleFilter(r)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              roleFilter === r
                ? 'bg-[#154212] text-white'
                : 'bg-white text-[#42493e] hover:bg-gray-50'
            }`}
          >
            {r === 'all' ? t('all') : r === 'lender' ? t('lent') : t('borrowed')}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-100">
        {(['open', 'returned'] as Tab[]).map((t_) => (
          <button
            key={t_}
            type="button"
            onClick={() => setTab(t_)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t_
                ? 'border-[#154212] text-[#154212]'
                : 'border-transparent text-[#72796e] hover:text-[#154212]'
            }`}
          >
            {t_ === 'open' ? t('open') : t('returned')}
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <p className="text-sm text-[#72796e] py-8 text-center">
          {tab === 'open' ? t('noOpen') : t('noReturned')}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((item) => (
            <LoanCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* Add button */}
      <Link
        href="/auth-mvp/lanad-og-skilad/ny"
        className="flex items-center justify-center h-10 rounded-xl border border-dashed border-[#154212]/30 text-sm text-[#154212] hover:bg-[#154212]/5 transition-colors"
      >
        + {t('newItem')}
      </Link>
    </div>
  )
}
