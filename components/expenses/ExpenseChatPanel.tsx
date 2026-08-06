'use client'

import { useMemo } from 'react'
import { useLocale } from 'next-intl'
import { ScopedChatPanel } from '@/components/chat/ScopedChatPanel'
import type { TeskeidContextTimelineEvent } from '@/components/chat/TeskeidContextTimeline'
import { useExpenseTranslations } from './i18n.client'
import { createExpenseChatTransport } from './expenseChatTransport'

export function ExpenseChatPanel({ expenseId, threadId, timelineEvents }: {
  expenseId: string
  threadId: string
  timelineEvents: readonly TeskeidContextTimelineEvent[]
}) {
  const t = useExpenseTranslations()
  const locale = useLocale()
  const transport = useMemo(() => createExpenseChatTransport(expenseId), [expenseId])

  return (
    <ScopedChatPanel
      threadId={threadId}
      transport={transport}
      locale={locale}
      pageSize={20}
      composerMaxLength={1000}
      composerMultiline
      timelineEvents={timelineEvents}
      timelineOrder="ascending"
      listClassName="flex flex-col"
      labels={{
        empty: t('history.chatEmpty'),
        loading: t('history.chatLoading'),
        inputPlaceholder: t('history.chatPlaceholder'),
        send: t('history.chatSend'),
        sendError: t('history.chatSendError'),
        loadError: t('history.chatLoadError'),
        retry: t('history.chatRetry'),
        deleted: t('history.chatDeleted'),
        loadOlder: t('history.chatLoadOlder'),
      }}
    />
  )
}
