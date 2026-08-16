'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { InvitationDecisionButtons } from '@/components/teskeid/InvitationDecisionButtons'
import { TeskeidActionButton } from '@/components/teskeid/TeskeidActionButton'
import { createRequestId } from '@/components/expenses/ui'
import {
  leaveEventAttendance,
  respondEventGuestAttendanceInvitation,
} from '@/lib/events/actions'
import {
  EVENTS_PATH,
  eventDetailPath,
  eventGuestAttendanceInvitationPath,
} from '@/lib/events/contracts'

export function EventAttendanceInvitationActions({
  invitationId,
  eventId,
  hasEventAccess,
  status,
}: {
  invitationId: string
  eventId: string
  hasEventAccess: boolean
  status: 'pending' | 'accepted'
}) {
  const t = useTranslations('teskeid.events')
  const router = useRouter()
  const requestIdsRef = useRef(new Map<'accept' | 'decline' | 'leave', string>())
  const inFlightRef = useRef(false)
  const previousStatusRef = useRef(status)
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [isNavigating, setIsNavigating] = useState(false)
  const [pendingAction, setPendingAction] = useState<'accept' | 'decline' | 'leave' | null>(null)
  const [isPending, startTransition] = useTransition()
  const isBusy = isPending || isNavigating

  useEffect(() => {
    if (error) {
      containerRef.current?.querySelector<HTMLElement>('[role="alert"]')?.focus()
    }
  }, [error])

  useEffect(() => {
    if (previousStatusRef.current === status) return
    previousStatusRef.current = status
    inFlightRef.current = false
    setIsNavigating(false)
    setPendingAction(null)
    setError(null)
  }, [status])

  function respond(action: 'accept' | 'decline') {
    if (inFlightRef.current || isBusy) return
    let requestId = requestIdsRef.current.get(action)
    if (!requestId) {
      requestId = createRequestId()
      requestIdsRef.current.set(action, requestId)
    }
    const submittedRequestId = requestId
    inFlightRef.current = true
    setError(null)
    setPendingAction(action)
    startTransition(async () => {
      let navigationStarted = false
      try {
        const result = await respondEventGuestAttendanceInvitation({
          invitation_id: invitationId,
          action,
          request_id: submittedRequestId,
        })
        if (!result.ok) {
          setError(t(`errors.${result.error}`))
          return
        }
        requestIdsRef.current.delete(action)
        const destination = result.data.status === 'accepted'
          ? hasEventAccess
            ? eventDetailPath(eventId)
            : eventGuestAttendanceInvitationPath(invitationId)
          : hasEventAccess ? EVENTS_PATH : '/auth-mvp/heim'
        navigationStarted = true
        setIsNavigating(true)
        if (result.data.status === 'accepted' && !hasEventAccess) router.replace(destination)
        else router.push(destination)
        router.refresh()
      } catch {
        setError(t('errors.save_failed'))
      } finally {
        if (!navigationStarted) {
          inFlightRef.current = false
          setPendingAction(null)
        }
      }
    })
  }

  function leave() {
    if (inFlightRef.current || isBusy || !window.confirm(t('attendance.leaveConfirm'))) return
    let requestId = requestIdsRef.current.get('leave')
    if (!requestId) {
      requestId = createRequestId()
      requestIdsRef.current.set('leave', requestId)
    }
    const submittedRequestId = requestId
    inFlightRef.current = true
    setError(null)
    setPendingAction('leave')
    startTransition(async () => {
      let navigationStarted = false
      try {
        const result = await leaveEventAttendance({
          event_id: eventId,
          request_id: submittedRequestId,
        })
        if (!result.ok) {
          setError(t(`errors.${result.error}`))
          return
        }
        requestIdsRef.current.delete('leave')
        navigationStarted = true
        setIsNavigating(true)
        router.push(hasEventAccess ? EVENTS_PATH : '/auth-mvp/heim')
        router.refresh()
      } catch {
        setError(t('errors.save_failed'))
      } finally {
        if (!navigationStarted) {
          inFlightRef.current = false
          setPendingAction(null)
        }
      }
    })
  }

  return (
    <div ref={containerRef}>
      {status === 'pending' ? (
        <InvitationDecisionButtons
          acceptLabel={pendingAction === 'accept'
            ? t('invitation.accepting')
            : t('invitation.accept')}
          declineLabel={pendingAction === 'decline'
            ? t('invitation.declining')
            : t('invitation.decline')}
          isPending={isBusy}
          error={error}
          onAccept={() => respond('accept')}
          onDecline={() => respond('decline')}
        />
      ) : (
        <div className="space-y-3">
          <p role="status" className="text-sm text-primary">
            {t('invitation.acceptedStatus')}
          </p>
          {error ? (
            <p tabIndex={-1} role="alert" className="text-sm text-destructive">{error}</p>
          ) : null}
          <TeskeidActionButton
            type="button"
            variant="danger"
            className="w-full"
            pending={isBusy}
            disabled={isBusy}
            onClick={leave}
          >
            {isBusy ? t('attendance.leaving') : t('attendance.leave')}
          </TeskeidActionButton>
        </div>
      )}
    </div>
  )
}
