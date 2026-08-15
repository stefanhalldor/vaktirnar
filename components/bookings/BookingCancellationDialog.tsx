'use client'

import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { BookingCancellationReason } from '@/lib/bookings/contracts'
import {
  bookingCancellationReasonOptions,
  type BookingWorkflowLabelAudience,
} from './workflow-label'

export interface BookingCancellationDialogProps {
  audience: BookingWorkflowLabelAudience
  pending: boolean
  onConfirm: (reason: BookingCancellationReason | null) => boolean | Promise<boolean>
}

export function BookingCancellationDialog({
  audience,
  pending,
  onConfirm,
}: BookingCancellationDialogProps) {
  const t = useTranslations('bookings')
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<BookingCancellationReason | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [failed, setFailed] = useState(false)
  const busy = pending || submitting

  function changeOpen(nextOpen: boolean) {
    if (!nextOpen && busy) return
    setOpen(nextOpen)
    if (nextOpen) {
      setReason(null)
      setFailed(false)
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    if (audience === 'provider' && !reason) {
      setFailed(true)
      return
    }
    setSubmitting(true)
    setFailed(false)
    try {
      const accepted = await onConfirm(audience === 'provider' ? reason : null)
      if (accepted) {
        setOpen(false)
        setReason(null)
      } else {
        setFailed(true)
      }
    } catch {
      setFailed(true)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          disabled={pending}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-destructive/30 px-4 text-sm font-medium text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-55"
        >
          {t('workflow.cancel.open')}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45" />
        <Dialog.Content
          aria-busy={busy || undefined}
          onEscapeKeyDown={event => { if (busy) event.preventDefault() }}
          onPointerDownOutside={event => { if (busy) event.preventDefault() }}
          className="fixed inset-x-0 bottom-0 z-50 max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-t-2xl bg-background p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl focus:outline-none sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-[min(28rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:pb-5"
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="break-words text-lg font-semibold">
                {t('workflow.cancel.title')}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm leading-6 text-muted-foreground">
                {t(`workflow.cancel.description.${audience}`)}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                disabled={busy}
                aria-label={t('workflow.cancel.close')}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-55"
              >
                <X aria-hidden size={20} />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={submit} className="mt-5 space-y-4">
            {audience === 'provider' ? (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">{t('workflow.cancel.reasonLabel')}</legend>
                {bookingCancellationReasonOptions(key => t(key)).map(option => (
                  <label
                    key={option.value}
                    className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border px-3 py-2.5 text-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1"
                  >
                    <input
                      type="radio"
                      name="booking-cancellation-reason"
                      value={option.value}
                      checked={reason === option.value}
                      onChange={() => { setReason(option.value); setFailed(false) }}
                      disabled={busy}
                      className="mt-0.5 size-5 shrink-0 accent-primary"
                    />
                    <span className="min-w-0 break-words leading-5">{option.label}</span>
                  </label>
                ))}
              </fieldset>
            ) : null}

            {failed ? (
              <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                {audience === 'provider' && !reason
                  ? t('workflow.cancel.chooseReason')
                  : t('workflow.cancel.failed')}
              </p>
            ) : null}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Dialog.Close asChild>
                <button
                  type="button"
                  disabled={busy}
                  className="min-h-11 rounded-xl border border-border px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-55"
                >
                  {t('workflow.cancel.keep')}
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={busy || (audience === 'provider' && !reason)}
                className="min-h-11 rounded-xl bg-destructive px-4 text-sm font-semibold text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-55"
              >
                {busy ? t('workflow.cancel.cancelling') : t('workflow.cancel.confirm')}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
