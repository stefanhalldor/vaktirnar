'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { LoanCard } from './LoanCard'
import type { LoanItem } from '@/lib/loans/types'

type Status = 'open' | 'returned' | 'all'
type RoleFilter = 'lender' | 'borrower' | null
type Sort = 'newest' | 'oldest'

interface Props {
  items: LoanItem[]
}

export function LoanList({ items }: Props) {
  const t = useTranslations('teskeid.loans')
  const [status, setStatus] = useState<Status>('open')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>(null)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<Sort>('newest')

  // Counts — stable, not affected by role or search
  const openCount = items.filter((i) => i.returned_at === null).length
  const returnedCount = items.filter((i) => i.returned_at !== null).length
  const allCount = items.length

  // Status-filtered items, before role/search — used for role pill counts
  const statusItems = items.filter((i) => {
    if (status === 'open') return i.returned_at === null
    if (status === 'returned') return i.returned_at !== null
    return true
  })
  const lentCount = statusItems.filter((i) => i.my_role === 'lender').length
  const borrowedCount = statusItems.filter((i) => i.my_role === 'borrower').length

  // Final filtered + sorted list
  const query = search.trim().toLocaleLowerCase('is-IS')
  const filtered = statusItems
    .filter((i) => roleFilter === null || i.my_role === roleFilter)
    .filter((i) => {
      if (!query) return true
      return (
        i.item_name.toLocaleLowerCase('is-IS').includes(query) ||
        (i.note?.toLocaleLowerCase('is-IS').includes(query) ?? false) ||
        (i.other_display_name?.toLocaleLowerCase('is-IS').includes(query) ?? false)
      )
    })
    .slice()
    .sort((a, b) => {
      // Pending acknowledgement rows always float to top (newest) or bottom (oldest)
      const ackA = a.requires_acknowledgement ? 1 : 0
      const ackB = b.requires_acknowledgement ? 1 : 0
      if (ackA !== ackB) return sort === 'newest' ? ackB - ackA : ackA - ackB
      const dateA = status === 'returned' ? (a.returned_at ?? a.loaned_at) : a.loaned_at
      const dateB = status === 'returned' ? (b.returned_at ?? b.loaned_at) : b.loaned_at
      const cmp = dateA < dateB ? -1 : dateA > dateB ? 1 : 0
      const byDate = sort === 'newest' ? -cmp : cmp
      if (byDate !== 0) return byDate
      return sort === 'newest'
        ? b.id.localeCompare(a.id)
        : a.id.localeCompare(b.id)
    })

  const hasActiveFilter = query !== '' || roleFilter !== null
  const emptyKey = hasActiveFilter
    ? 'noSearchResults'
    : status === 'open'
      ? 'noOpen'
      : status === 'returned'
        ? 'noReturned'
        : 'noOpen'

  const pillBase =
    'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors min-h-[32px]'
  const pillActive = 'bg-[#154212] text-white border-[#154212]'
  const pillInactive = 'bg-white text-[#42493e] border-gray-200 hover:border-[#154212]'

  return (
    <div className="flex flex-col gap-4">

      {/* Status pills */}
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          aria-pressed={status === 'open'}
          onClick={() => setStatus('open')}
          className={`${pillBase} ${status === 'open' ? pillActive : pillInactive}`}
        >
          {t('open')}
          <span className="opacity-70">({openCount})</span>
        </button>
        <button
          type="button"
          aria-pressed={status === 'returned'}
          onClick={() => setStatus('returned')}
          className={`${pillBase} ${status === 'returned' ? pillActive : pillInactive}`}
        >
          {t('returned')}
          <span className="opacity-70">({returnedCount})</span>
        </button>
        <button
          type="button"
          aria-pressed={status === 'all'}
          onClick={() => setStatus('all')}
          className={`${pillBase} ${status === 'all' ? pillActive : pillInactive}`}
        >
          {t('all')}
          <span className="opacity-70">({allCount})</span>
        </button>
      </div>

      {/* Role pills */}
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          aria-pressed={roleFilter === 'lender'}
          onClick={() => setRoleFilter(roleFilter === 'lender' ? null : 'lender')}
          className={`${pillBase} ${roleFilter === 'lender' ? pillActive : pillInactive}`}
        >
          {t('lent')}
          <span className="opacity-70">({lentCount})</span>
        </button>
        <button
          type="button"
          aria-pressed={roleFilter === 'borrower'}
          onClick={() => setRoleFilter(roleFilter === 'borrower' ? null : 'borrower')}
          className={`${pillBase} ${roleFilter === 'borrower' ? pillActive : pillInactive}`}
        >
          {t('borrowed')}
          <span className="opacity-70">({borrowedCount})</span>
        </button>
        <button
          type="button"
          aria-pressed={roleFilter === null}
          onClick={() => setRoleFilter(null)}
          className={`${pillBase} ${roleFilter === null ? pillActive : pillInactive}`}
        >
          {t('all')}
          <span className="opacity-70">({lentCount + borrowedCount})</span>
        </button>
      </div>

      {/* Search + Sort */}
      <div className="flex gap-2 items-center">
        <label className="flex-1 min-w-0">
          <span className="sr-only">{t('searchLabel')}</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchLabel')}
            className="w-full h-9 rounded-xl border border-gray-200 px-3 text-base outline-none focus:border-[#2d5a27] focus:ring-2 focus:ring-[#2d5a27]/10"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-[#72796e] shrink-0">
          <span className="sr-only">{t('sortLabel')}</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            aria-label={t('sortLabel')}
            className="text-xs text-[#42493e] border border-gray-200 rounded-xl px-2 py-2 bg-white outline-none focus:border-[#2d5a27] h-9"
          >
            <option value="newest">{t('sortNewest')}</option>
            <option value="oldest">{t('sortOldest')}</option>
          </select>
        </label>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <p className="text-sm text-[#72796e] py-8 text-center">{t(emptyKey)}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((item) => (
            <LoanCard key={item.id} item={item} />
          ))}
        </div>
      )}

    </div>
  )
}
