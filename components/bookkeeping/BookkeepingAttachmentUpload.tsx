'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  finalizeBookkeepingAttachmentUpload,
  prepareBookkeepingAttachmentUpload,
} from '@/lib/bookkeeping/actions'
import {
  BOOKKEEPING_ATTACHMENT_MAX_BYTES,
  BOOKKEEPING_ATTACHMENT_MIME_TYPES,
} from '@/lib/bookkeeping/constants'
import { useBookkeepingTranslations } from './i18n.client'
import { bookkeepingPrimaryButtonClass, bookkeepingSectionClass, createBookkeepingRequestId } from './ui'

export function BookkeepingAttachmentUpload({
  entityId,
  transactionId = null,
}: {
  entityId: string
  transactionId?: string | null
}) {
  const t = useBookkeepingTranslations()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function upload() {
    const file = fileRef.current?.files?.[0]
    if (!file || !BOOKKEEPING_ATTACHMENT_MIME_TYPES.includes(file.type as never)
      || file.size < 1 || file.size > BOOKKEEPING_ATTACHMENT_MAX_BYTES) {
      setError(t('ledger.upload.invalid'))
      return
    }
    setError(null)
    startTransition(async () => {
      const prepared = await prepareBookkeepingAttachmentUpload({
        request_id: createBookkeepingRequestId(),
        entity_id: entityId,
        transaction_id: transactionId,
        filename: file.name,
        mime_type: file.type,
        size_bytes: file.size,
      })
      if (!prepared.ok) { setError(t(`errors.${prepared.error.code}`)); return }
      const uploaded = await createClient().storage
        .from('bookkeeping-private')
        .uploadToSignedUrl(prepared.data.path, prepared.data.token, file, {
          contentType: file.type,
          upsert: false,
        })
      if (uploaded.error) { setError(t('ledger.upload.failed')); return }
      const finalized = await finalizeBookkeepingAttachmentUpload({
        request_id: createBookkeepingRequestId(),
        attachment_id: prepared.data.attachmentId,
      })
      if (!finalized.ok) { setError(t(`errors.${finalized.error.code}`)); return }
      router.push(`/auth-mvp/bokhaldid/einingar/${entityId}/faerslur/${finalized.data.transactionId}`)
      router.refresh()
    })
  }

  return (
    <section className={`${bookkeepingSectionClass} space-y-3`} aria-labelledby="ledger-upload-title">
      <div>
        <h2 id="ledger-upload-title" className="text-base font-semibold">{t('ledger.upload.title')}</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{t('ledger.upload.help')}</p>
      </div>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={isPending} className="block min-h-11 w-full text-base file:mr-3 file:min-h-10 file:rounded-xl file:border file:border-border file:bg-background file:px-3 file:text-sm" />
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <button type="button" onClick={upload} disabled={isPending} className={`${bookkeepingPrimaryButtonClass} w-full`}>{isPending ? t('ledger.upload.uploading') : t('ledger.upload.action')}</button>
    </section>
  )
}
