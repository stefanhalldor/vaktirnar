'use client'

import { useMemo } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { ScopedChatPanel } from '@/components/chat/ScopedChatPanel'
import {
  TeskeidContextTimeline,
  type TeskeidContextTimelineEvent,
} from '@/components/chat/TeskeidContextTimeline'
import type { BookingActivityView } from '@/lib/bookings/contracts'
import { createBookingChatTransport } from './bookingChatTransport'
import { formatBookingDateTime } from './format'
import {
  resolveBookingCancellationReason,
  resolveBookingWorkflowLabel,
} from './workflow-label'

function useActivityEvents(
  activity: readonly BookingActivityView[],
  timeZone: string,
  audience: 'provider' | 'customer',
): TeskeidContextTimelineEvent[] {
  const locale = useLocale()
  const t = useTranslations('bookings')
  return useMemo(() => activity.filter(event => event.eventType !== 'discount_applied').map(event => {
    const content = event.eventType === 'workflow_state_changed' && event.workflowTransition
      ? t('activity.workflow_state_changed', {
        from: resolveBookingWorkflowLabel(
          (key) => t(key),
          event.workflowTransition.from,
          audience,
        ),
        to: resolveBookingWorkflowLabel(
          (key) => t(key),
          event.workflowTransition.to,
          audience,
        ),
      })
      : event.eventType === 'request_cancelled' && event.cancellationReason
        ? t('activity.request_cancelled_with_reason', {
          reason: resolveBookingCancellationReason((key) => t(key), event.cancellationReason),
        })
        : t(`activity.${event.eventType}`)
    return {
      id: event.id,
      createdAt: event.createdAt,
      content: (
        <div className="text-sm">
          <p className="font-medium">{content}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {event.actorName ? `${event.actorName} · ` : ''}{formatBookingDateTime(event.createdAt, locale, timeZone)}
          </p>
        </div>
      ),
    }
  }), [activity, audience, locale, t, timeZone])
}

export function BookingChatPanel({
  publicId,
  activity,
  timeZone,
  canMessage,
  audience = 'customer',
}: {
  publicId: string
  activity: readonly BookingActivityView[]
  timeZone: string
  canMessage: boolean
  audience?: 'provider' | 'customer'
}) {
  const locale = useLocale()
  const t = useTranslations('bookings')
  const timelineEvents = useActivityEvents(activity, timeZone, audience)
  const actorLabels = useMemo(() => ({
    guest: t('chat.actorGuest'),
    member: t('chat.actorMember'),
    provider: t('chat.actorProvider'),
  }), [t])
  const transport = useMemo(
    () => createBookingChatTransport(publicId, actorLabels),
    [actorLabels, publicId],
  )
  return (
    <TeskeidContextTimeline title={t('chat.title')}>
      <ScopedChatPanel
        threadId={publicId}
        transport={transport}
        locale={locale}
        pageSize={20}
        composerMaxLength={1000}
        composerMultiline
        timelineEvents={timelineEvents}
        timelineOrder="ascending"
        listClassName="flex max-h-[55vh] flex-col overflow-y-auto pr-0.5"
        readOnly={!canMessage}
        labels={{
          empty: t('chat.empty'),
          loading: t('chat.loading'),
          inputLabel: t('chat.messageLabel'),
          inputPlaceholder: t('chat.placeholder'),
          send: t('chat.send'),
          sendError: t('chat.sendError'),
          loadError: t('chat.loadError'),
          retry: t('retry'),
          deleted: t('chat.deleted'),
          loadOlder: t('chat.loadOlder'),
        }}
      />
      {!canMessage && (
        <p className="pt-3 text-xs leading-5 text-muted-foreground">{t('chat.closed')}</p>
      )}
    </TeskeidContextTimeline>
  )
}
