'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { TeskeidActionButton } from '@/components/teskeid/TeskeidActionButton'
import { createRequestId } from '@/components/expenses/ui'
import { leaveEventAttendance } from '@/lib/events/actions'
import type { EventAttendeeDetailView } from '@/lib/events/contracts'
import { EVENTS_PATH } from '@/lib/events/contracts'

export function EventAttendeeDetail({ event }: { event: EventAttendeeDetailView }) {
  const t = useTranslations('teskeid.events')
  const router = useRouter()
  const requestIdRef = useRef<string | null>(null)
  const inFlightRef = useRef(false)
  const alertRef = useRef<HTMLParagraphElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [isNavigating, setIsNavigating] = useState(false)
  const [isPending, startTransition] = useTransition()
  const isBusy = isPending || isNavigating

  useEffect(() => {
    if (error) alertRef.current?.focus()
  }, [error])

  function leave() {
    if (inFlightRef.current || isBusy || !window.confirm(t('attendance.leaveConfirm'))) return
    if (!requestIdRef.current) requestIdRef.current = createRequestId()
    const requestId = requestIdRef.current
    inFlightRef.current = true
    setError(null)
    startTransition(async () => {
      let navigationStarted = false
      try {
        const result = await leaveEventAttendance({
          event_id: event.id,
          request_id: requestId,
        })
        if (!result.ok) {
          setError(t(`errors.${result.error}`))
          return
        }
        navigationStarted = true
        setIsNavigating(true)
        router.push(EVENTS_PATH)
        router.refresh()
      } catch {
        setError(t('errors.save_failed'))
      } finally {
        if (!navigationStarted) inFlightRef.current = false
      }
    })
  }

  return (
    <div className="space-y-7">
      <section className="space-y-2 border-y border-border py-5">
        <p className="text-sm leading-6 text-muted-foreground">{t('attendance.readOnlyHint')}</p>
        <p className="break-words text-xs text-muted-foreground">
          {t('attendance.invitedBy', {
            name: event.ownerDisplayName ?? t('invitation.unknownInviter'),
          })}
        </p>
      </section>

      <section aria-labelledby="attendee-roster-heading">
        <h2 id="attendee-roster-heading" className="mb-2 text-sm font-semibold">
          {t('attendance.participants')}
        </h2>
        {event.guests.length === 0 ? (
          <p className="border-y border-border py-5 text-sm text-muted-foreground">
            {t('attendance.noParticipants')}
          </p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {event.guests.map((guest) => (
              <li key={guest.id} className="min-h-12 break-words py-3 text-sm">
                {guest.displayName ?? t('attendance.genericGuest')}
                {guest.isSelf ? (
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({t('attendance.you')})
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div>
        {error ? (
          <p
            ref={alertRef}
            tabIndex={-1}
            role="alert"
            className="mb-3 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
        <TeskeidActionButton
          type="button"
          variant="danger"
          pending={isBusy}
          disabled={isBusy}
          className="w-full"
          onClick={leave}
        >
          {isBusy ? t('attendance.leaving') : t('attendance.leave')}
        </TeskeidActionButton>
      </div>
    </div>
  )
}
