'use client'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { getSplitImageAvailability, mutateSplit, prepareSplitImage, extractSplitImage } from '@/lib/receipt-split/actions'
import { createRequestId, expenseInputClass as input, expensePrimaryButtonClass as primary, expenseSecondaryButtonClass as secondary } from '@/components/expenses/ui'
import { TeskeidLoader } from '@/components/teskeid/TeskeidLoader'

export function SplitImport({ id, recoveryReason }: { id?: string; recoveryReason?: 'quota' | 'capacity' }) {
  const t = useTranslations('teskeid.receiptSplit')
  const receiptText = useTranslations('teskeid.expenses.receipt')
  const router = useRouter()
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [promptCopied, setPromptCopied] = useState(false)
  const [imagePending, setImagePending] = useState(false)
  const [pending, start] = useTransition()
  const [availability, setAvailability] = useState<'checking' | 'available' | 'quota' | 'capacity' | 'unknown' | 'login'>('checking')
  const availabilityRequest = useRef({ sequence: 0 })
  const checkAvailability = useCallback(async () => {
    const request = ++availabilityRequest.current.sequence
    setAvailability('checking')
    try {
      const result = await getSplitImageAvailability()
      if (request !== availabilityRequest.current.sequence) return
      setAvailability(result.ok ? 'available' : result.error === 'quota' || result.error === 'capacity' || result.error === 'login' ? result.error : 'unknown')
    } catch {
      if (request === availabilityRequest.current.sequence) setAvailability('unknown')
    }
  }, [])
  useEffect(() => {
    if (id || imagePending) return
    const requests = availabilityRequest.current
    void checkAvailability()
    const refresh = () => { if (document.visibilityState === 'visible') void checkAvailability() }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      requests.sequence++
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [id, imagePending, checkAvailability])
  const attempt = useRef<{ text: string; id: string; requestId: string } | null>(null)
  const imageAttempt = useRef<{ file: File; id: string; requestId: string } | null>(null)
  const imageReady = Boolean(availability === 'available' && file
    && ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
    && file.size > 0
    && file.size <= 10485760)
  const textReady = Boolean(text.trim())
  function navigate(splitId: string, reason?: 'quota' | 'capacity') {
    router.push('/auth-mvp/splitta-reikningnum/' + splitId + (reason ? '?reason=' + reason : ''))
    router.refresh()
  }
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
    if (availability !== 'available') return
    if (!file || !['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 10485760 || file.size === 0) { setError(t('imageHelp')); return }
    if (!imageAttempt.current || imageAttempt.current.file !== file) imageAttempt.current = { file, id: createRequestId(), requestId: createRequestId() }
    const current = imageAttempt.current
    setError(null)
    setImagePending(true)
    start(async () => {
      try {
        const prepared = await prepareSplitImage({ id: current.id, requestId: current.requestId, mime: file.type, size: file.size })
        if (!prepared.ok) {
          if (prepared.error !== 'quota' && prepared.error !== 'capacity' && prepared.error !== 'login') setError(t(prepared.error))
          setAvailability(prepared.error === 'quota' || prepared.error === 'capacity' || prepared.error === 'login' ? prepared.error : 'unknown')
          setImagePending(false)
          return
        }
        const uploaded = await createClient().storage.from('bill-split-receipts').uploadToSignedUrl(prepared.data.path, prepared.data.token, file, { contentType: file.type })
        if (uploaded.error) { setError(t('failed')); setImagePending(false); return }
        const extracted = await extractSplitImage(current.id)
        // The saved receipt route provides JSON recovery on extraction failure.
        navigate(current.id, !extracted.ok && (extracted.error === 'quota' || extracted.error === 'capacity') ? extracted.error : undefined)
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
  return <div className="space-y-4">
    {!id && <p className="text-sm leading-6 text-muted-foreground">{t('methodHelp')}</p>}
    {!id && <section className="space-y-3 rounded-2xl border border-border p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('methodOne')}</p>
      <h2 className="text-lg font-semibold">{t('teskeidMethod')}</h2>
      <p className="text-sm leading-6 text-muted-foreground">{t('teskeidMethodHelp')}</p>
      {availability !== 'available' && !imagePending && <div className="flex items-start gap-2">
        <p id="split-image-availability" role="status" className="flex-1 text-sm leading-6 text-muted-foreground">
          {t(availability === 'checking' ? 'quotaChecking' : availability === 'quota' ? 'quotaRecovery' : availability === 'capacity' ? 'capacityRecovery' : availability === 'login' ? 'login' : 'quotaUnavailable')}
        </p>
        <button type="button" onClick={() => void checkAvailability()} disabled={availability === 'checking' || pending}
          aria-label={t('quotaRetry')} title={t('quotaRetry')} className={secondary + ' flex h-11 w-11 shrink-0 items-center justify-center p-0'}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>}
      {imagePending ? <TeskeidLoader
        ideaTitles={[t('analyzingIdea')]}
        loadingLabel={t('analyzingLabel')}
        fallbackIdeaTitle={t('analyzingIdea')}
        className="py-4"
      /> : <>
        <input type="file" accept="image/jpeg,image/png,image/webp" aria-label={t('image')} disabled={pending || availability !== 'available'}
          aria-describedby={availability !== 'available' ? 'split-image-availability' : undefined}
          onChange={e => { setFile(e.target.files?.[0] ?? null); setError(null) }} className={input + ' py-2'} />
        <p className="text-sm text-muted-foreground">{t('imageHelp')}</p>
        <button type="button" onClick={submitImage} disabled={pending || !imageReady}
          className={(imageReady ? primary : secondary) + ' w-full'}>{pending ? t('pending') : t('image')}</button>
        <p className="text-sm leading-6 text-muted-foreground">{receiptText('providerNotice')}</p>
      </>}
    </section>}
    <section className="space-y-3 rounded-2xl border border-border p-4">
      {!id && <>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('methodTwo')}</p>
        <h2 className="text-lg font-semibold">{t('otherAiMethod')}</h2>
      </>}
      {id && <p className="text-sm">{t(recoveryReason === 'quota' ? 'quotaRecovery' : recoveryReason === 'capacity' ? 'capacityRecovery' : 'recovery')}</p>}
      <p className="text-sm leading-6">{t('copyPromptHelp')}</p>
      <button type="button" onClick={copyPrompt} className={secondary + ' w-full'}>{promptCopied ? t('copiedPrompt') : t('copyPrompt')}</button>
      <label className="block font-medium" htmlFor="split-json">{t('json')}</label>
      <textarea id="split-json" value={text} onChange={e => setText(e.target.value)} disabled={pending} className={input + ' min-h-48 py-3 font-mono'} />
      <p className="text-sm leading-6 text-muted-foreground">{t('jsonHelp')}</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <button type="button" onClick={submitJson} disabled={pending || !textReady}
        className={(textReady ? primary : secondary) + ' w-full'}>{pending ? t('pending') : t('create')}</button>
    </section>
  </div>
}
