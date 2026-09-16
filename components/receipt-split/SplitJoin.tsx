'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { joinSplit } from '@/lib/receipt-split/actions'
import { createRequestId, expensePrimaryButtonClass as primary } from '@/components/expenses/ui'

const KEY = 'teskeid:pending-split-invite'
export function SplitJoin() {
  const t = useTranslations('teskeid.receiptSplit')
  const router = useRouter()
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [login, setLogin] = useState(false)
  const [pending, start] = useTransition()
  const request = useRef('')
  useEffect(() => {
    request.current = createRequestId()
    const fragment = location.hash.slice(1)
    history.replaceState(history.state, '', location.pathname)
    try {
      if (/^[0-9a-f]{64}$/.test(fragment)) {
        sessionStorage.setItem(KEY, fragment)
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
  }, [t])
  function join() {
    setError(null)
    start(async () => {
      try {
        const result = await joinSplit({ token, requestId: request.current })
        if (!result.ok) {
          if (result.error === 'login') { setLogin(true); return }
          setError(t('missingLink')); return
        }
        sessionStorage.removeItem(KEY)
        router.replace('/auth-mvp/splitta-reikningnum/' + result.data.id)
        router.refresh()
      } catch { setError(t('failed')) }
    })
  }
  return <main className="mx-auto w-full max-w-lg space-y-5 px-4 py-8">
    <h1 className="text-xl font-semibold text-primary">{t('joinTitle')}</h1>
    <p className="leading-7">{t('joinHelp')}</p>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {login ? <button type="button" className={primary + ' w-full'} disabled={pending} onClick={() => start(() => router.push('/innskraning?next=%2Fsplitt'))}>{pending ? t('pending') : t('signedIn')}</button>
      : <button type="button" className={primary + ' w-full'} disabled={pending || !token} onClick={join}>{pending ? t('pending') : t('join')}</button>}
  </main>
}
