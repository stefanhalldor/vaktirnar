'use client'

import { useRef } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { CircleAlert, X } from 'lucide-react'
import { expensePrimaryButtonClass } from './ui'

export function ExpenseMutationErrorDialog({
  open,
  title,
  message,
  dismissLabel,
  closeLabel,
  returnFocusRef,
  onDismiss,
}: {
  open: boolean
  title: string
  message: string
  dismissLabel: string
  closeLabel: string
  returnFocusRef: { current: HTMLElement | null }
  onDismiss: () => void
}) {
  const dismissRef = useRef<HTMLButtonElement>(null)

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onDismiss()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/55" />
        <Dialog.Content
          role="alertdialog"
          className="fixed inset-x-0 bottom-0 z-50 max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-t-2xl bg-background px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-5 shadow-xl focus:outline-none sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-[min(28rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:pb-5"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            dismissRef.current?.focus()
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            const returnTarget = returnFocusRef.current
            returnFocusRef.current = null
            returnTarget?.focus()
          }}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="break-words text-lg font-semibold">
                {title}
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label={closeLabel}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X aria-hidden size={20} />
              </button>
            </Dialog.Close>
          </div>

          <Dialog.Description className="mt-4 flex gap-3 rounded-xl bg-destructive/10 p-4 text-sm leading-6 text-destructive">
            <CircleAlert aria-hidden className="mt-0.5 shrink-0" size={20} />
            <span className="min-w-0 break-words">{message}</span>
          </Dialog.Description>

          <Dialog.Close asChild>
            <button
              ref={dismissRef}
              type="button"
              className={`${expensePrimaryButtonClass} mt-5 w-full`}
            >
              {dismissLabel}
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
