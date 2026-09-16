'use client'
import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { mutateSplit, prepareSplitImage, extractSplitImage } from '@/lib/receipt-split/actions'
import { createRequestId, expenseInputClass as input, expensePrimaryButtonClass as primary, expenseSecondaryButtonClass as secondary } from '@/components/expenses/ui'
import { TeskeidLoader } from '@/components/teskeid/TeskeidLoader'

export function SplitImport({ id }: { id?: string }) {
  const t = useTranslations('teskeid.receiptSplit')
  const receiptText = useTranslations('teskeid.expenses.receipt')
  const router = useRouter()
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [promptCopied, setPromptCopied] = useState(false)
  const [imagePending, setImagePending] = useState(false)
  const [pending, start] = useTransition()
  const attempt = useRef<{ text: string; id: string; requestId: string } | null>(null)
  const imageAttempt = useRef<{ file: File; id: string; requestId: string } | null>(null)
  function navigate(splitId: string) { router.push('/auth-mvp/splitta-reikningnum/' + splitId); router.refresh() }
  function submitJson() {
    if (!attempt.current || attempt.current.text !== text) attempt.current = { text, id: id ?? createRequestId(), requestId: createRequestId() }
    const current = attempt.current
    setError(null)
    start(async () => {
      try {
        const result = await mutateSplit({ command: id ? 'apply_extraction' : 'create', ...current })
        if (!result.ok) { setError(t(result.error)); return }
        navigate(result.data.id)
      } catch { setError(t('failed')) }
    })
  }
  function submitImage() {
    if (!file || !['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 10485760 || file.size === 0) { setError(t('imageHelp')); return }
    if (!imageAttempt.current || imageAttempt.current.file !== file) imageAttempt.current = { file, id: createRequestId(), requestId: createRequestId() }
    const current = imageAttempt.current
    setError(null)
    setImagePending(true)
    start(async () => {
      try {
        const prepared = await prepareSplitImage({ id: current.id, requestId: current.requestId, mime: file.type, size: file.size })
        if (!prepared.ok) { setError(t(prepared.error)); setImagePending(false); return }
        const uploaded = await createClient().storage.from('bill-split-receipts').uploadToSignedUrl(prepared.data.path, prepared.data.token, file, { contentType: file.type })
        if (uploaded.error) { setError(t('failed')); setImagePending(false); return }
        await extractSplitImage(current.id)
        // The saved receipt route provides JSON recovery on extraction failure.
        navigate(current.id)
      } catch { setError(t('failed')); setImagePending(false) }
    })
  }
  async function copyPrompt() {
    setError(null)
    try {
      await navigator.clipboard.writeText(receiptText('manualPromptText'))
      setPromptCopied(true)
    } catch { setError(t('copyFailed')) }
  }
  return <div className="space-y-6">
    {!id && <section className="space-y-3 rounded-2xl border border-border p-4">
      <h2 className="font-semibold">{t('image')}</h2>
      {imagePending ? <TeskeidLoader
        ideaTitles={[t('analyzingIdea')]}
        loadingLabel={t('analyzingLabel')}
        fallbackIdeaTitle={t('analyzingIdea')}
        className="py-4"
      /> : <>
        <input type="file" accept="image/jpeg,image/png,image/webp" aria-label={t('image')} disabled={pending}
          onChange={e => { setFile(e.target.files?.[0] ?? null); setError(null) }} className={input + ' py-2'} />
        <p className="text-sm text-muted-foreground">{t('imageHelp')}</p>
        <button type="button" onClick={submitImage} disabled={pending} className={secondary + ' w-full'}>{pending ? t('pending') : t('image')}</button>
        <p className="text-sm leading-6 text-muted-foreground">{receiptText('providerNotice')}</p>
      </>}
    </section>}
    <section className="space-y-3 rounded-2xl border border-border p-4">
      {id && <p className="text-sm">{t('recovery')}</p>}
      <p className="text-sm leading-6">{t('copyPromptHelp')}</p>
      <button type="button" onClick={copyPrompt} className={secondary + ' w-full'}>{promptCopied ? t('copiedPrompt') : t('copyPrompt')}</button>
      <label className="block font-medium" htmlFor="split-json">{t('json')}</label>
      <textarea id="split-json" value={text} onChange={e => setText(e.target.value)} disabled={pending} className={input + ' min-h-48 py-3 font-mono'} />
      <p className="text-sm leading-6 text-muted-foreground">{t('jsonHelp')}</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <button type="button" onClick={submitJson} disabled={pending || !text.trim()} className={primary + ' w-full'}>{pending ? t('pending') : t('create')}</button>
    </section>
  </div>
}
