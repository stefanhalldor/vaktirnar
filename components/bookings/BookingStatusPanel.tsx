'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import type {
  BookingRequestStatus,
  BookingWorkflowStateView,
  StoredBookingCancellationReason,
} from '@/lib/bookings/contracts'
import {
  resolveBookingCancellationReason,
  resolveBookingWorkflowAttention,
  resolveBookingWorkflowLabel,
  type BookingWorkflowLabelAudience,
} from './workflow-label'

export interface BookingStatusPanelProps {
  audience: BookingWorkflowLabelAudience
  lifecycleStatus: BookingRequestStatus
  workflowState: BookingWorkflowStateView | null
  cancellationReason: StoredBookingCancellationReason | null
  canTransition: boolean
  pending: boolean
  onTransition: (targetStateId: string) => void
}

export function BookingStatusPanel({
  audience,
  lifecycleStatus,
  workflowState,
  cancellationReason,
  canTransition,
  pending,
  onTransition,
}: BookingStatusPanelProps) {
  const t = useTranslations('bookings')
  const [targetStateId, setTargetStateId] = useState('')
  const providerState = workflowState?.audience === 'provider' ? workflowState : null
  const audienceMatches = workflowState === null || workflowState.audience === audience

  useEffect(() => {
    setTargetStateId('')
  }, [providerState?.stateId])

  if (lifecycleStatus === 'cancelled') {
    return (
      <section aria-labelledby="booking-status-heading" className="space-y-2 border-y border-border py-5">
        <h3 id="booking-status-heading" className="text-sm font-medium text-muted-foreground">
          {t('workflow.statusPanel.heading')}
        </h3>
        <p className="break-words text-lg font-semibold text-primary">
          {t(`workflow.statusPanel.cancelled.${audience}`)}
        </p>
        {cancellationReason ? (
          <p className="text-sm leading-6 text-muted-foreground">
            {t('workflow.statusPanel.cancellationReason', {
              reason: resolveBookingCancellationReason(key => t(key), cancellationReason),
            })}
          </p>
        ) : null}
      </section>
    )
  }

  if (!workflowState || !audienceMatches) {
    return (
      <section aria-labelledby="booking-status-heading" className="space-y-2 border-y border-border py-5">
        <h3 id="booking-status-heading" className="text-sm font-medium text-muted-foreground">
          {t('workflow.statusPanel.heading')}
        </h3>
        <p className="text-sm leading-6 text-muted-foreground">{t('workflow.statusPanel.unavailable')}</p>
      </section>
    )
  }

  const currentLabel = resolveBookingWorkflowLabel(key => t(key), workflowState, audience)
  const attention = resolveBookingWorkflowAttention(key => t(key), workflowState.attentionSide, audience)
  const targets = providerState?.allowedNextStates ?? []

  return (
    <section aria-labelledby="booking-status-heading" className="space-y-4 border-y border-border py-5">
      <div className="space-y-1">
        <h3 id="booking-status-heading" className="text-sm font-medium text-muted-foreground">
          {t('workflow.statusPanel.heading')}
        </h3>
        <p className="break-words text-lg font-semibold text-primary">{currentLabel}</p>
        <p className="text-sm leading-6 text-muted-foreground">{attention}</p>
      </div>

      {audience === 'provider' && providerState && canTransition ? (
        targets.length > 0 ? (
          <form
            className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
            onSubmit={event => {
              event.preventDefault()
              if (!targetStateId || pending) return
              onTransition(targetStateId)
            }}
          >
            <label className="grid min-w-0 gap-1 text-sm font-medium">
              {t('workflow.statusPanel.nextState')}
              <select
                value={targetStateId}
                onChange={event => setTargetStateId(event.target.value)}
                disabled={pending}
                className="min-h-11 min-w-0 rounded-xl border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-60"
              >
                <option value="">{t('workflow.statusPanel.chooseState')}</option>
                {targets.map(target => (
                  <option key={target.stateId} value={target.stateId}>
                    {resolveBookingWorkflowLabel(key => t(key), target, 'provider')}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={pending || !targetStateId}
              className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-55"
            >
              {pending ? t('workflow.statusPanel.changing') : t('workflow.statusPanel.change')}
            </button>
          </form>
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">{t('workflow.statusPanel.noNextStates')}</p>
        )
      ) : null}
    </section>
  )
}
