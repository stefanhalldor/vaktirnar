'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { mutateSplit, openSplitImage } from '@/lib/receipt-split/actions'
import { splitSummary, splitDecimal, parseSplitDecimal, UNCLAIMED, type SplitView, type SplitCommand } from '@/lib/receipt-split/contracts'
import { TeskeidMultiSelectPillFilter } from '@/components/teskeid/TeskeidMultiSelectPillFilter'
import { expenseCurrencyMinorDigits } from '@/lib/expenses/input-money'
import { formatSplitMoney } from '@/lib/receipt-split/format'
import { createRequestId, expenseInputClass as input, expensePrimaryButtonClass as primary, expenseSecondaryButtonClass as secondary, expenseDangerButtonClass as danger } from '@/components/expenses/ui'
import { SplitImport } from './SplitImport'
import { AddSplitItem } from './AddSplitItem'

export function SplitBoard({ view }: { view: SplitView }) {
  const t = useTranslations('teskeid.receiptSplit')
  const locale = useLocale()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [copied, setCopied] = useState(false)
  const [origin, setOrigin] = useState('')
  const [activeItem, setActiveItem] = useState<string | null>(null)
  const request = useRef<{ key: string; id: string } | null>(null)
  const self = view.members.find(m => m.isSelf)!
  const money = (amount: number) => formatSplitMoney(amount, view.currency, locale)
  useEffect(() => { setOrigin(location.origin) }, [])
  useEffect(() => {
    if (view.state !== 'sharing') return
    const refresh = () => { if (!document.hidden) router.refresh() }
    const interval = window.setInterval(refresh, 8000)
    window.addEventListener('focus', refresh)
    return () => { window.clearInterval(interval); window.removeEventListener('focus', refresh) }
  }, [view.state, router])
  function run(value: SplitCommand) {
    setActiveItem(value.command === 'claim' ? value.itemId : null)
    const key = JSON.stringify(value)
    if (request.current?.key !== key) request.current = { key, id: createRequestId() }
    const requestId = request.current.id
    setError(null)
    start(async () => {
      try {
        const result = await mutateSplit({ ...value, requestId })
        if (!result.ok) { setError(t(result.error)); return }
        request.current = null
        if (value.command === 'delete') router.replace('/auth-mvp/splitta-reikningnum')
        router.refresh()
      } catch { setError(t('failed')) }
    })
  }
  function claim(itemId: string, quantity: number) {
    const previous = view.claims.find(c => c.itemId === itemId && c.memberToken === self.token)?.quantityMilli ?? 0
    run({ command: 'claim', id: view.id, itemId, previous, quantity })
  }
  async function copy() {
    try { await navigator.clipboard.writeText(location.origin + '/splitt#' + view.inviteToken); setCopied(true) }
    catch { setError(t('failed')) }
  }
  const summary = view.state === 'sharing' ? splitSummary(view) : null
  const filtered = view.items.filter(item => !selected.length || view.claims.some(c => c.itemId === item.id && selected.includes(c.memberToken)))
  return <div className="space-y-6" aria-busy={pending}>
    {view.deleteScope ? <button type="button" disabled={pending} className={danger + ' w-full'}
      onClick={() => run({ command: view.deleteScope === 'split' ? 'delete' : 'delete_image', id: view.id, version: view.version })}>{t('retryDelete')}</button>
      : view.state === 'uploading' || view.state === 'extracting' ? <SplitImport id={view.id} />
      : view.state === 'review' ? <SplitReview key={view.version} view={view} />
      : <>
        <header className="space-y-2"><h2 className="break-words text-xl font-semibold">{view.title}</h2>
          <p className="text-lg">{money(view.totalMinor)}</p></header>
        {view.isOwner && <section className="space-y-3 rounded-2xl border border-border p-4">
          <h3 className="font-semibold">{t('share')}</h3>
          <p className="text-sm leading-6 text-muted-foreground">{t('shareHelp')}</p>
          {view.inviteToken && <input readOnly value={origin ? origin + '/splitt#' + view.inviteToken : ''} aria-label={t('share')}
            className={input} onFocus={event => event.target.select()} />}
          {view.inviteToken && <button type="button" className={primary + ' w-full'} onClick={copy}>{copied ? t('copied') : t('copy')}</button>}
          <button type="button" className={secondary + ' w-full'} disabled={pending} onClick={() => {
            if (window.confirm(t('rotateHelp'))) { setCopied(false); run({ command: 'rotate_invite', id: view.id }) }
          }}>{t('rotate')}</button>
        </section>}
        <section className="space-y-3">
          <h3 className="font-semibold">{t('people')}</h3>
          <TeskeidMultiSelectPillFilter options={view.members.map(m => ({ id: m.token, disabled: pending, label: (m.name ?? t('unnamed')) + ' · ' + money(summary!.totals.get(m.token) ?? 0) }))}
            selectedIds={selected} onChange={setSelected} ariaLabel={t('people')} clearLabel={t('clear')} />
          <p className="text-sm text-muted-foreground">{t('unclaimed')}: {money(summary!.totals.get(UNCLAIMED) ?? 0)}</p>
        </section>
        {view.isOwner && <AddSplitItem currency={view.currency} disabled={pending || view.items.length >= 100} sharing onAdd={async (item, requestId) => {
          const result = await mutateSplit({ command: 'add_item', id: view.id, requestId, ...item })
          if (result.ok) router.refresh()
          return result
        }} />}
        <div className="space-y-3">
          {filtered.map(item => {
            const claims = view.claims.filter(c => c.itemId === item.id)
            const mine = claims.find(c => c.memberToken === self.token)?.quantityMilli ?? 0
            const left = summary!.remaining.get(item.id) ?? 0
            const visibleClaims = claims.filter(c => !selected.length || selected.includes(c.memberToken))
            return <article key={item.id} className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3"><h4 className="min-w-0 break-words font-semibold">{item.description}</h4>
                <span className="shrink-0 text-sm">{money(selected.length
                  ? selected.reduce((sum, token) => sum + (summary!.lineTotals.get(item.id)?.get(token) ?? 0), 0)
                  : item.totalMinor)}</span></div>
              {item.kind === 'item' && item.totalMinor > 0 ? <>
                <p className="text-sm text-muted-foreground">{t('remaining')}: {splitDecimal(left, 3)} / {splitDecimal(item.quantityMilli, 3)}</p>
                <div className="flex flex-wrap gap-2">{visibleClaims.map(c => <span key={c.memberToken}
                  className="min-w-0 max-w-full break-words rounded-xl bg-primary/10 px-3 py-2 text-sm text-primary">
                  {view.members.find(m => m.token === c.memberToken)?.name ?? t('unnamed')} · {splitDecimal(c.quantityMilli, 3)}
                </span>)}</div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={pending || left === 0} className={primary + ' flex-1'}
                    onClick={() => claim(item.id, mine + Math.min(1000, left))}>{pending && activeItem === item.id ? t('pending') : t('take', { quantity: splitDecimal(Math.min(1000, left), 3) })}</button>
                  {mine > 0 && <button type="button" disabled={pending} className={secondary} onClick={() => claim(item.id, Math.max(0, mine - 1000))}>{t('release')}</button>}
                </div>
                <QuantityControl key={item.id + ':' + mine} mine={mine} disabled={pending} onSave={quantity => claim(item.id, quantity)} />
                {error && activeItem === item.id && <p role="alert" className="text-sm text-destructive">{error}</p>}
              </> : item.totalMinor === 0 ? <p className="text-sm text-muted-foreground">{t('zeroKept')}</p> : null}
            </article>
          })}
          {!filtered.length && <p>{t('noItems')}</p>}
        </div>
      </>}
    {pending && <p role="status">{t('pending')}</p>}
    {error && !activeItem && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <button type="button" className={secondary + ' w-full'} disabled={pending} onClick={() => {
      if (view.state !== 'review' || window.confirm(t('refreshWarning'))) router.refresh()
    }}>{t('refresh')}</button>
    {view.isOwner && <div className="space-y-3 border-t border-border pt-4">
      {view.imageAvailable && <div className="flex flex-wrap gap-2">
        <button type="button" className={secondary} disabled={pending} onClick={() => {
          const tab = window.open('', '_blank')
          if (tab) tab.opener = null
          start(async () => {
            try {
              const result = await openSplitImage(view.id)
              if (result.ok && tab) tab.location.href = result.data.url
              else { tab?.close(); setError(t('failed')) }
            } catch { tab?.close(); setError(t('failed')) }
          })
        }}>{t('openImage')}</button>
        <button type="button" className={danger} disabled={pending} onClick={() => {
          if (window.confirm(t('deleteImageConfirm'))) run({ command: 'delete_image', id: view.id, version: view.version })
        }}>{t('deleteImage')}</button>
      </div>}
      <button type="button" className={danger + ' w-full'} disabled={pending} onClick={() => {
        if (window.confirm(t('deleteConfirm'))) run({ command: 'delete', id: view.id, version: view.version })
      }}>{t('delete')}</button>
    </div>}
  </div>
}

function QuantityControl({ mine, disabled, onSave }: { mine: number; disabled: boolean; onSave: (value: number) => void }) {
  const t = useTranslations('teskeid.receiptSplit')
  const [value, setValue] = useState(splitDecimal(mine, 3))
  const parsed = parseSplitDecimal(value, 3)
  return <details><summary className="min-h-11 cursor-pointer py-2 text-sm">{t('mine')}: {splitDecimal(mine, 3)}</summary>
    <div className="flex gap-2"><input aria-label={t('mine')} inputMode="decimal" value={value} disabled={disabled}
      onChange={e => setValue(e.target.value)} className={input + ' min-w-0 flex-1'} />
      <button type="button" className={secondary} disabled={disabled || parsed === null || parsed < 0 || parsed > 1000000} onClick={() => parsed !== null && onSave(parsed)}>{t('setQuantity')}</button></div>
  </details>
}

function SplitReview({ view }: { view: SplitView }) {
  const locale = useLocale()
  const t = useTranslations('teskeid.receiptSplit')
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [title, setTitle] = useState(view.title)
  const [date, setDate] = useState(view.incurredOn)
  const [currency, setCurrency] = useState(view.currency)
  const [total, setTotal] = useState(splitDecimal(view.totalMinor, expenseCurrencyMinorDigits(currency)))
  const [items, setItems] = useState(view.items.map(i => ({ ...i, zero: i.kind === 'item' && i.totalMinor === 0,
    quantity: splitDecimal(i.quantityMilli, 3), amount: splitDecimal(i.totalMinor, expenseCurrencyMinorDigits(currency)) })))
  const request = useRef<{ key: string; id: string } | null>(null)
  function update(id: string, patch: { amount?: string; quantity?: string; description?: string }) {
    setDirty(true); setItems(rows => rows.map(i => i.id === id ? { ...i, ...patch } : i))
  }
  function submit(confirm: boolean) {
    const parsed = items.map(i => ({ kind: i.kind, description: i.description,
      quantity_milli: parseSplitDecimal(i.quantity, 3), total_minor: parseSplitDecimal(i.amount, expenseCurrencyMinorDigits(currency)),
      confidence_basis_points: 10000, needs_review: false }))
    const totalMinor = parseSplitDecimal(total, expenseCurrencyMinorDigits(currency))
    if (!confirm && (!title.trim() || !date || totalMinor === null || totalMinor <= 0 || parsed.some(i => i.quantity_milli === null || i.quantity_milli <= 0 || i.total_minor === null))) {
      setError(t('invalid')); return
    }
    const payload = confirm ? { command: 'confirm' as const, id: view.id, version: view.version }
      : { command: 'review' as const, id: view.id, version: view.version, text: JSON.stringify({ title, currency, incurred_on: date, receipt_total_minor: totalMinor, items: parsed }) }
    const key = JSON.stringify(payload)
    if (request.current?.key !== key) request.current = { key, id: createRequestId() }
    const requestId = request.current.id
    setError(null)
    start(async () => {
      try {
        const result = await mutateSplit({ ...payload, requestId })
        if (!result.ok) { setError(t(result.error)); return }
        router.refresh()
      } catch { setError(t('failed')) }
    })
  }
  function rows(zero: boolean) { return items.filter(i => i.zero === zero).map(i => <div key={i.id} className="space-y-2 border-t border-border pt-3">
    <input aria-label={t('description')} value={i.description} className={input} disabled={pending} onChange={e => update(i.id, { description: e.target.value })} />
    <div className="grid grid-cols-2 gap-3">
      <label className="text-sm">{t('quantity')}<input inputMode="decimal" value={i.quantity} className={input} disabled={pending} onChange={e => update(i.id, { quantity: e.target.value })} /></label>
      <label className="text-sm">{t('amount')}<input inputMode="decimal" value={i.amount} className={input} disabled={pending} onChange={e => update(i.id, { amount: e.target.value })} /></label>
    </div>
  </div>) }
  const currentTotal = parseSplitDecimal(total, expenseCurrencyMinorDigits(currency))
  const currentAmounts = items.map(i => parseSplitDecimal(i.amount, expenseCurrencyMinorDigits(currency)))
  const difference = currentTotal === null || currentAmounts.some(amount => amount === null)
    ? null
    : BigInt(currentTotal) - currentAmounts.reduce<bigint>((sum, amount) => sum + BigInt(amount!), BigInt(0))
  const matches = difference === BigInt(0)
  const differenceMessage = difference === null ? t('mismatch') : difference === BigInt(0) ? null
    : t(difference > BigInt(0) ? 'missingAmount' : 'excessAmount', {
      amount: formatSplitMoney(difference < BigInt(0) ? -difference : difference, currency, locale),
    })
  return <section className="space-y-4">
    <h2 className="font-semibold">{t('review')}</h2>
    <label className="block text-sm">{t('name')}<input value={title} disabled={pending} onChange={e => { setTitle(e.target.value); setDirty(true) }} className={input} /></label>
    <div className="grid grid-cols-2 gap-3">
      <label className="min-w-0 text-sm">{t('date')}<input type="date" value={date} disabled={pending} onChange={e => { setDate(e.target.value); setDirty(true) }} className={input} /></label>
      <label className="text-sm">{t('currency')}<select value={currency} disabled={pending} onChange={e => { setCurrency(e.target.value as SplitView['currency']); setDirty(true) }} className={input}>
        {['ISK','EUR','USD','GBP','DKK','NOK','SEK'].map(c => <option key={c}>{c}</option>)}</select></label>
    </div>
    <label className="block text-sm">{t('total')}<input value={total} inputMode="decimal" disabled={pending} onChange={e => { setTotal(e.target.value); setDirty(true) }} className={input} /></label>
    {items.some(i => i.zero) && <fieldset className="space-y-3 rounded-2xl border border-primary/30 p-4"><legend className="px-2 font-semibold">{t('zeroTitle')}</legend>
      <p className="text-sm leading-6 text-muted-foreground">{t('zeroHelp')}</p>{rows(true)}</fieldset>}
    {rows(false)}
    <AddSplitItem currency={currency} disabled={pending || items.length >= 100} onAdd={async item => {
      setItems(rows => [...rows, { id: createRequestId(), kind: 'item', description: item.description,
        quantityMilli: item.quantity, totalMinor: item.amount, zero: false,
        quantity: splitDecimal(item.quantity, 3), amount: splitDecimal(item.amount, expenseCurrencyMinorDigits(currency)) }])
      setDirty(true)
      return { ok: true, data: null }
    }} />
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <button type="button" onClick={() => submit(false)} disabled={pending} className={secondary + ' w-full'}>{pending ? t('pending') : t('save')}</button>
    {view.reviewSaved && !dirty && <p role="status" className="text-sm text-primary">{t('saved')}</p>}
    <div role="status" aria-live="polite" className="min-h-6 break-words text-sm text-destructive">{differenceMessage}</div>
    <p className="text-sm text-muted-foreground">{t('confirmHelp')}</p>
    <button type="button" onClick={() => submit(true)} disabled={pending || dirty || !matches || !view.reviewSaved} className={primary + ' w-full'}>{pending ? t('pending') : t('confirm')}</button>
  </section>
}
