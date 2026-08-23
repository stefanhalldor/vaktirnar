'use client'

import { useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import { createRequestId } from '@/components/expenses/ui'
import { useTeskeidNavigation } from '@/components/teskeid/TeskeidNavigationFeedback'
import { EVENTS_PATH } from '@/lib/events/contracts'
import { leaveEventParticipationV3Action } from '@/lib/events/participant-identity-v3.actions'

export function EventParticipationLeaveControl({
  eventId,
  eventGuestId,
  identityGeneration,
  identityVersion,
  accessVersion,
}: {
  eventId: string
  eventGuestId: string
  identityGeneration: string
  identityVersion: string
  accessVersion: string
}) {
  const t = useTranslations('teskeid.events')
  const router = useRouter()
  const { navigate } = useTeskeidNavigation()
  const requestRef = useRef<{ key: string; id: string } | null>(null)
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [leaveComplete, setLeaveComplete] = useState(false)

  useEffect(() => {
    if (!leaveComplete) return

    const commitNavigation = () => navigate(EVENTS_PATH, 'replace')
    const usesAnimationFrame = typeof window.requestAnimationFrame === 'function'
    const scheduledNavigation = usesAnimationFrame
      ? window.requestAnimationFrame(commitNavigation)
      : window.setTimeout(commitNavigation, 0)

    return () => {
      if (usesAnimationFrame && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(scheduledNavigation)
      } else {
        window.clearTimeout(scheduledNavigation)
      }
    }
  }, [leaveComplete, navigate])

  async function leave() {
    if (pending) return
    let completed = false
    const key = `${eventId}:${eventGuestId}:${identityGeneration}:${identityVersion}:${accessVersion}`
    if (requestRef.current?.key !== key) requestRef.current = { key, id: createRequestId() }
    setPending(true)
    setError(null)
    setStatusMessage(null)
    try {
      const result = await leaveEventParticipationV3Action({
        event_id: eventId,
        event_guest_id: eventGuestId,
        identity_generation: identityGeneration,
        expected_identity_version: identityVersion,
        expected_access_version: accessVersion,
        request_id: requestRef.current.id,
      })
      if (!result.ok) {
        setError(t(result.error === 'conflict' ? 'attendance.leaveConflict' : `errors.${result.error}`))
        if (result.error === 'conflict' || result.error === 'not_found') router.refresh()
        return
      }
      requestRef.current = null
      completed = true
      setStatusMessage(t('attendance.leaveSuccess'))
      setLeaveComplete(true)
    } catch {
      setError(t('attendance.leaveError'))
    } finally {
      if (!completed) setPending(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => {
      if (pending) return
      setOpen(next)
      if (next) { setError(null); setStatusMessage(null) }
    }}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-destructive/40 px-4 text-sm font-semibold text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t('attendance.leave')}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45" />
        <Dialog.Content
          aria-busy={pending || undefined}
          onEscapeKeyDown={(event) => { if (pending) event.preventDefault() }}
          onPointerDownOutside={(event) => { if (pending) event.preventDefault() }}
          className="fixed inset-x-0 bottom-0 z-50 max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-t-2xl bg-background p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl focus:outline-none sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-[min(28rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:pb-5"
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="break-words text-lg font-semibold">{t('attendance.leaveTitle')}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm leading-6 text-muted-foreground">
                {t('attendance.leaveConfirm')}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                disabled={pending}
                aria-label={t('attendance.leaveClose')}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-55"
              >
                <X aria-hidden size={20} />
              </button>
            </Dialog.Close>
          </div>
          {error ? <p role="alert" className="mt-4 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
          <p role="status" aria-live="polite" className="sr-only">
            {statusMessage ?? (pending ? t('attendance.leaving') : null)}
          </p>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Dialog.Close asChild>
              <button
                type="button"
                disabled={pending}
                className="min-h-11 rounded-xl border border-border px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-55"
              >
                {t('attendance.leaveKeep')}
              </button>
            </Dialog.Close>
            <button
              type="button"
              disabled={pending}
              onClick={() => void leave()}
              className="min-h-11 rounded-xl bg-destructive px-4 text-sm font-semibold text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-55"
            >
              {pending ? t('attendance.leaving') : t('attendance.leaveConfirmAction')}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
