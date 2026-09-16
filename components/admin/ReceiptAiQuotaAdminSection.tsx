'use client'

import { useEffect, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'

type Entry = { userId: string; email: string; enabled: boolean; note: string; updatedAt: string }

export function ReceiptAiQuotaAdminSection() {
  const t = useTranslations('teskeid.admin.receiptAiQuota')
  const [items, setItems] = useState<Entry[]>([])
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [status, setStatus] = useState('')
  const [pending, startTransition] = useTransition()

  async function load() {
    const response = await fetch('/api/admin/receipt-ai-quota', { cache: 'no-store' })
    const body = await response.json().catch(() => ({}))
    if (!response.ok || !Array.isArray(body.items)) throw new Error('load')
    setItems(body.items)
  }

  useEffect(() => { load().catch(() => setStatus(t('loadFailed'))) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function save(targetEmail: string, enabled: boolean, targetNote = '') {
    setStatus('')
    startTransition(async () => {
      const response = await fetch('/api/admin/receipt-ai-quota', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail, enabled, note: targetNote }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) { setStatus(t(body.error === 'notFound' ? 'notFound' : 'saveFailed')); return }
      setEmail(''); setNote(''); setStatus(t(enabled ? 'granted' : 'revoked'))
      await load().catch(() => setStatus(t('loadFailed')))
    })
  }

  return <section className="space-y-4 rounded-xl border border-[#c2c9bb] bg-white p-5">
    <div><h2 className="text-base font-semibold text-gray-900">{t('title')}</h2><p className="mt-1 text-sm text-gray-600">{t('help')}</p></div>
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
      <label className="text-sm font-medium text-gray-700">{t('email')}<input value={email} onChange={event => setEmail(event.target.value)} type="email" className="mt-1 min-h-11 w-full rounded-lg border border-[#c2c9bb] px-3 text-base" /></label>
      <label className="text-sm font-medium text-gray-700">{t('note')}<input value={note} onChange={event => setNote(event.target.value)} maxLength={240} className="mt-1 min-h-11 w-full rounded-lg border border-[#c2c9bb] px-3 text-base" /></label>
      <button type="button" disabled={pending || !email.trim()} onClick={() => save(email.trim(), true, note)} className="min-h-11 self-end rounded-lg bg-[#154212] px-4 text-sm font-semibold text-white disabled:opacity-50">{t('grant')}</button>
    </div>
    {status && <p role="status" className="text-sm text-gray-700">{status}</p>}
    {items.length > 0 && <ul className="divide-y divide-[#e1e4de]">
      {items.map(item => <li key={item.userId} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0"><p className="break-all text-sm font-medium text-gray-900">{item.email}</p>{item.note && <p className="text-xs text-gray-500">{item.note}</p>}</div>
        <button type="button" disabled={pending} onClick={() => save(item.email, false, item.note)} className="min-h-10 rounded-lg border border-[#c2c9bb] px-3 text-sm font-medium text-[#154212] disabled:opacity-50">{t('revoke')}</button>
      </li>)}
    </ul>}
  </section>
}
