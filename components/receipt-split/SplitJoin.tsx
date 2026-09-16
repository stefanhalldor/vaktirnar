'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { joinSplit, previewSplitInvite } from '@/lib/receipt-split/actions'
import { createRequestId, expensePrimaryButtonClass as primary, expenseSecondaryButtonClass as secondary } from '@/components/expenses/ui'
import { TeskeidLoader } from '@/components/teskeid/TeskeidLoader'

const KEY = 'teskeid:pending-split-invite'
const INTENT_KEY = 'teskeid:pending-split-join'
export function SplitJoin() {
  const t = useTranslations('teskeid.receiptSplit')
  const router = useRouter()
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [pending, start] = useTransition()
  const request = useRef('')
  useEffect(() => {
    request.current = createRequestId()
    const fragment = location.hash.slice(1)
    history.replaceState(history.state, '', location.pathname)
    try {
      if (/^[0-9a-f]{64}$/.test(fragment)) {
        sessionStorage.setItem(KEY, fragment)
        sessionStorage.removeItem(INTENT_KEY)
        setToken(fragment)
      } else if (fragment) {
        sessionStorage.removeItem(KEY)
        setToken('')
        setError(t('missingLink'))
      } else {
        const saved = sessionStorage.getItem(KEY) ?? ''
        if (/^[0-9a-f]{64}$/.test(saved)) setToken(saved)
        else setError(t('missingLink'))
      }
    } catch { setError(t('storage')) }
  // The fragment is captured exactly once before it is removed from the URL.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (!token) return
    let active = true
    start(async () => {
      const preview = await previewSplitInvite(token)
      if (!active) return
      if (!preview.ok) { setError(t('missingLink')); setLoading(false); return }
      setTitle(preview.data.title); setLoading(false)
      try { if (sessionStorage.getItem(INTENT_KEY) === 'yes') join() } catch { /* handled when the user taps */ }
    })
    return () => { active = false }
  // join intentionally uses the token captured by this render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])
  function join() {
    setError(null)
    start(async () => {
      try {
        const result = await joinSplit({ token, requestId: request.current })
        if (!result.ok) {
          if (result.error === 'login') {
            try { sessionStorage.setItem(INTENT_KEY, 'yes') } catch { setError(t('storage')); return }
            router.push('/innskraning?next=%2Fsplitt')
            return
          }
          setError(t('missingLink')); return
        }
        sessionStorage.removeItem(KEY)
        sessionStorage.removeItem(INTENT_KEY)
        router.replace('/auth-mvp/splitta-reikningnum/' + result.data.id)
        router.refresh()
      } catch { setError(t('failed')) }
    })
  }
  function decline() {
    try { sessionStorage.removeItem(KEY); sessionStorage.removeItem(INTENT_KEY) } catch { /* navigation still works */ }
    router.push('/')
  }
  if (loading && token) return <main className="mx-auto w-full max-w-lg px-4 py-8"><TeskeidLoader ideaTitles={[t('joinLoading')]} loadingLabel={t('joinLoading')} fallbackIdeaTitle={t('joinLoading')} /></main>
  return <main className="mx-auto w-full max-w-lg space-y-5 px-4 py-8">
    <h1 className="break-words text-xl font-semibold text-primary">{title || t('joinTitle')}</h1>
    {title && <p className="leading-7">{t('joinQuestion')}</p>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {title && <div className="grid grid-cols-2 gap-3"><button type="button" className={secondary} disabled={pending} onClick={decline}>{t('joinNo')}</button>
      <button type="button" className={primary} disabled={pending || !token} onClick={join}>{pending ? t('pending') : t('joinYes')}</button></div>}
  </main>
}
