import { getTranslations } from 'next-intl/server'
import type { User } from '@supabase/supabase-js'
import type { LoanItem } from '@/lib/loans/types'
import { loadRecentEventInbox } from '@/lib/recent-events/inbox.server'
import type { RecentEventSource } from '@/lib/recent-events/types'
import { RecentEventsSection, type RecentLabels } from './RecentEventsSection'

export async function TeskeidUnreadSection({
  user,
  source,
  knownLoans,
}: {
  user: Pick<User, 'id' | 'email'>
  source: RecentEventSource
  knownLoans?: readonly LoanItem[]
}) {
  const [inbox, t] = await Promise.all([
    loadRecentEventInbox(user, {
      sources: [source],
      knownLoans,
      linkContext: 'feature',
    }),
    getTranslations('teskeid.home'),
  ])
  if (!inbox.ok || inbox.rows.length === 0) return null

  const labels: RecentLabels = {
    recent: t('recent'),
    markAllRead: t('recentMarkAllRead'),
    markOneRead: t('recentMarkRead'),
    viewItem: t('recentView'),
    closeDrawer: t('recentClose'),
  }
  return (
    <RecentEventsSection
      key={inbox.rows.map((row) => row.id).join('.')}
      rows={inbox.rows}
      labels={labels}
      source={source}
      className="mb-6"
    />
  )
}
