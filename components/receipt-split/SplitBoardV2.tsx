'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { ChevronDown, Minus, Plus } from 'lucide-react'
import QRCode from 'qrcode'
import { TeskeidMultiSelectPillFilter } from '@/components/teskeid/TeskeidMultiSelectPillFilter'
import { createRequestId, expenseDangerButtonClass as danger, expenseInputClass as input, expensePrimaryButtonClass as primary, expenseSecondaryButtonClass as secondary } from '@/components/expenses/ui'
import { expenseCurrencyMinorDigits } from '@/lib/expenses/input-money'
import { mutateSplitV2, openSplitImage, saveSplitExchange, setSplitItemDismissed } from '@/lib/receipt-split/actions'
import { parseSplitDecimal, splitDecimal } from '@/lib/receipt-split/contracts'
import { formatSplitMoney } from '@/lib/receipt-split/format'
import { convertSplitMoney, formatConvertedMoney } from '@/lib/receipt-split/exchange'
import { formatQuantity, parseProportionUnits, parseQuantityUnits, proportionInput, quantityInput, stepQuantity } from '@/lib/receipt-split/quantity-v2'
import { splitSummaryV2, UNSPLIT_V2 } from '@/lib/receipt-split/summary-v2'
import type { SplitViewV2 } from '@/lib/receipt-split/view-v2'
import { SplitImport } from './SplitImport'

type Item = SplitViewV2['items'][number]
type Group = 'remaining' | 'done' | 'info'
type StatusFilter = 'remaining' | 'done'
type Command = { command: string; id: string; [key: string]: unknown }

export function SplitBoardV2({ view, recoveryReason }: { view: SplitViewV2; recoveryReason?: 'quota' | 'capacity' }) {
  const t = useTranslations('teskeid.receiptSplit'); const pv = useTranslations('teskeid.receiptSplitPreview')
  const locale = useLocale(); const router = useRouter(); const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null); const [selected, setSelected] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('remaining'); const [dismissedOpen, setDismissedOpen] = useState(false)
  const [locks, setLocks] = useState<Record<string, Group>>({})
  const [copied, setCopied] = useState(false); const [origin, setOrigin] = useState('')
  const request = useRef<{ key: string; id: string } | null>(null)
  const money = (amount: number | bigint) => formatSplitMoney(amount, view.currency, locale)
  const summary = splitSummaryV2(view)
  useEffect(() => { setOrigin(location.origin) }, [])
  useEffect(() => { if (view.state !== 'sharing') return; const refresh = () => { if (!document.hidden) router.refresh() }
    const timer = window.setInterval(refresh, 8000); window.addEventListener('focus', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh) } }, [router, view.state])
  function lock(id: string, group: Group | null) { setLocks(old => { const next = { ...old }; if (group) next[id] ??= group; else delete next[id]; return next }) }
  function run(value: Command, after?: () => void) {
    const key = JSON.stringify(value); if (request.current?.key !== key) request.current = { key, id: createRequestId() }
    const requestId = request.current.id; setError(null); start(async () => {
      const result = await mutateSplitV2({ ...value, requestId }); if (!result.ok) { setError(t(result.error)); return }
      request.current = null; after?.(); router.refresh()
    })
  }
  function dismiss(itemId: string, dismissed: boolean) {
    const key = JSON.stringify({ itemId, dismissed }); if (request.current?.key !== key) request.current = { key, id: createRequestId() }
    const requestId = request.current.id; setError(null); start(async () => {
      const result = await setSplitItemDismissed({ id: view.id, itemId, dismissed, requestId })
      if (!result.ok) { setError(t(result.error)); return }
      request.current = null; router.refresh()
    })
  }
  if (view.deleteScope) return <button className={danger + ' w-full'} disabled={pending} onClick={() => run({ command: view.deleteScope === 'split' ? 'delete' : 'delete_image', id: view.id, version: view.version })}>{t('retryDelete')}</button>
  if (view.state === 'uploading' || view.state === 'extracting') return <SplitImport id={view.id} recoveryReason={recoveryReason} />
  const classify = (item: Item): Group => item.kind !== 'item' || item.totalMinor === 0 ? 'info' : (summary.remaining.get(item.id) ?? 0) === 0 ? 'done' : 'remaining'
  const groups: Record<Group, Item[]> = { remaining: [], done: [], info: [] }
  for (const item of view.items) groups[locks[item.id] ?? classify(item)].push(item)
  const dismissed = new Set(view.dismissedItemIds)
  const matchesPeople = (item: Item) => !selected.length || view.claims.some(c => c.itemId === item.id && selected.includes(c.memberToken))
  const statusItems = groups[statusFilter].filter(matchesPeople)
  const visibleItems = statusFilter === 'remaining' && !selected.length ? statusItems.filter(item => !dismissed.has(item.id)) : statusItems
  const dismissedItems = statusFilter === 'remaining' && !selected.length ? groups.remaining.filter(item => dismissed.has(item.id)) : []
  const row = (item: Item) => view.state === 'review'
    ? <ReviewItemRow key={item.id} item={item} view={view} pending={pending} run={run} />
    : <ItemRow key={item.id} item={item} view={view} summary={summary} selected={selected} pending={pending} money={money} run={run} lock={lock} dismiss={dismiss} dismissed={dismissed.has(item.id)} />
  const totalsDiffer = summary.receiptDifferenceMinor !== BigInt(0)
  const confirmReview = () => <section className={totalsDiffer ? 'space-y-3 rounded-2xl border border-border p-4' : ''}>{totalsDiffer && <p className="text-sm text-muted-foreground">{pv('reviewHelp')}</p>}
    <button className={primary + ' w-full'} disabled={pending} onClick={() => run(
      { command: 'confirm_review', id: view.id, version: view.version },
      () => window.scrollTo({ top: 0, behavior: 'smooth' }),
    )}>{t('confirm')}</button></section>
  return <div className="space-y-6" aria-busy={pending}>
    <header><h2 className="break-words text-xl font-semibold">{view.title}</h2></header>
    <section className="space-y-3 rounded-2xl border border-border p-4"><h3 className="font-semibold">{pv('summary')}</h3>
      <dl className="space-y-2 text-sm">{view.isOwner && view.state === 'review' ? <div className="space-y-2"><dt>{pv('receiptTotal')}</dt><ReviewTotalEditor view={view} pending={pending} run={run} /></div> : <div className="flex justify-between"><dt>{pv('receiptTotal')}</dt><dd>{money(view.receiptTotalMinor)}</dd></div>}
        <div className="flex justify-between"><dt>{pv('linesTotal')}</dt><dd>{money(summary.linesTotalMinor)}</dd></div></dl>
      {totalsDiffer && <p className="rounded-lg border border-border p-3 text-sm" aria-live="polite">{pv(summary.receiptDifferenceMinor > BigInt(0) ? 'missing' : 'excess', { amount: money(summary.receiptDifferenceMinor < BigInt(0) ? -summary.receiptDifferenceMinor : summary.receiptDifferenceMinor) })}</p>}
      {view.isOwner && view.state === 'sharing' && <TotalEditor view={view} pending={pending} run={run} />}
      <ExchangeCalculator view={view} totals={summary.totals} pending={pending} locale={locale} onError={setError} />
    </section>
    {view.isOwner && view.state === 'sharing' && <Share view={view} pending={pending} origin={origin} copied={copied} run={run} onCopy={async () => {
      try { await navigator.clipboard.writeText(location.origin + '/splitt#' + view.inviteToken); setCopied(true) } catch { setError(t('failed')) }
    }} />}
    {view.state === 'sharing' && <section className="space-y-3"><h3 className="font-semibold">{t('people')}</h3>
      <TeskeidMultiSelectPillFilter options={view.members.map(m => ({ id: m.token, label: (m.name ?? t('unnamed')) + ' · ' + money(summary.totals.get(m.token) ?? BigInt(0)), disabled: pending }))}
        selectedIds={selected} onChange={setSelected} ariaLabel={t('people')} clearLabel={t('clear')} />
      <div className="flex flex-wrap gap-2" aria-label={pv('statusFilter')}>
        <button type="button" aria-pressed={statusFilter === 'remaining'} className={(statusFilter === 'remaining' ? primary : secondary) + ' rounded-full px-4'} onClick={() => setStatusFilter('remaining')}>{pv('outstanding')} · {money(summary.totals.get(UNSPLIT_V2) ?? BigInt(0))}</button>
        <button type="button" aria-pressed={statusFilter === 'done'} className={(statusFilter === 'done' ? primary : secondary) + ' rounded-full px-4'} onClick={() => setStatusFilter('done')}>{pv('settled')} · {money(summary.linesTotalMinor - (summary.totals.get(UNSPLIT_V2) ?? BigInt(0)))}</button>
      </div></section>}
    {view.state === 'review' && view.isOwner && confirmReview()}
    {view.state === 'review' ? <section className="space-y-3"><h3 className="font-semibold">{pv('reviewItems')}</h3>{view.items.map(row)}</section>
      : <><section className="space-y-3"><h3 className="font-semibold">{selected.length ? pv('selectedItems') : pv(statusFilter === 'remaining' ? 'remainingTitle' : 'settledTitle')}</h3>
        {visibleItems.length ? visibleItems.map(row) : <p>{selected.length ? pv('emptyFilter') : pv(statusFilter === 'remaining' ? 'allChosen' : 'emptyDone')}</p>}
        {statusFilter === 'remaining' && !selected.length && groups.info.map(row)}</section>
      {dismissedItems.length > 0 && <section className="rounded-2xl border border-border"><button type="button" className="flex min-h-11 w-full items-center justify-between p-4 font-semibold" aria-expanded={dismissedOpen} onClick={() => setDismissedOpen(!dismissedOpen)}>{pv('notMineTitle', { count: dismissedItems.length })}<ChevronDown aria-hidden size={18} className={dismissedOpen ? 'rotate-180' : ''} /></button>
        {dismissedOpen && <div className="space-y-3 border-t border-border p-4">{dismissedItems.map(row)}</div>}</section>}</>}
    {view.isOwner && <AddItem view={view} pending={pending} run={run} />}
    {view.state === 'review' && view.isOwner && confirmReview()}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{pending && <p role="status">{t('pending')}</p>}
    <button className={secondary + ' w-full'} disabled={pending} onClick={() => router.refresh()}>{t('refresh')}</button>
    {view.isOwner && <DangerZone view={view} pending={pending} run={run} />}
  </div>
}

function ExchangeCalculator({ view, totals, pending, locale, onError }: {
  view: SplitViewV2; totals: Map<string, bigint>; pending: boolean; locale: string; onError: (error: string | null) => void
}) {
  const pv = useTranslations('teskeid.receiptSplitPreview')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<string>(view.exchangeCurrency ?? (view.currency === 'ISK' ? 'EUR' : 'ISK'))
  const [rate, setRate] = useState(view.exchangeRate ?? '')
  const [saving, startSaving] = useTransition()
  const saveRequest = useRef<{ key: string; id: string } | null>(null)
  const canonicalRate = rate.trim().replace(',', '.')
  const valid = convertSplitMoney(BigInt(1), view.currency, target, canonicalRate) !== null && target !== view.currency
  const dirty = target !== view.exchangeCurrency || canonicalRate !== (view.exchangeRate ?? '')
  useEffect(() => { setTarget(view.exchangeCurrency ?? (view.currency === 'ISK' ? 'EUR' : 'ISK')); setRate(view.exchangeRate ?? '') }, [view.currency, view.exchangeCurrency, view.exchangeRate])
  function save() {
    if (!valid || !dirty) return
    const key = target + ':' + canonicalRate + ':' + view.version
    if (saveRequest.current?.key !== key) saveRequest.current = { key, id: createRequestId() }
    const requestId = saveRequest.current.id; onError(null); startSaving(async () => {
      const result = await saveSplitExchange({ id: view.id, requestId, version: view.version, currency: target, rate: canonicalRate })
      if (!result.ok) { onError(result.error); return }
      saveRequest.current = null
      router.refresh()
    })
  }
  return <div className="border-t border-border pt-3">
    <button type="button" className="flex min-h-11 w-full items-center justify-between text-left font-medium" aria-expanded={open} onClick={() => setOpen(!open)}>{pv('conversion')}<ChevronDown aria-hidden size={18} className={open ? 'rotate-180' : ''} /></button>
    {open && <div className="space-y-3 pt-2">
      <p className="text-sm text-muted-foreground">{pv('conversionHelp')}</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">{pv('targetCurrency')}<input disabled={pending || saving} className={input + ' mt-1 w-full text-base uppercase'} value={target} maxLength={3} autoCapitalize="characters" autoCorrect="off" spellCheck={false} onChange={event => setTarget(event.target.value.replace(/[^A-Za-z]/g, '').toUpperCase())} placeholder={pv('currencyPlaceholder')} /></label>
        <label className="text-sm">{pv('exchangeRate')}<input disabled={pending || saving} className={input + ' mt-1 w-full text-base'} inputMode="decimal" value={rate} onChange={event => setRate(event.target.value)} placeholder={pv('ratePlaceholder')} /></label>
      </div>
      {valid && <div className="space-y-2 border-y border-border py-3 text-sm" aria-live="polite">
        <p>{pv('rateSummary', { source: view.currency, rate, target })}</p>
        <dl className="divide-y divide-border">{view.members.map(member => {
          const source = totals.get(member.token) ?? BigInt(0); const converted = convertSplitMoney(source, view.currency, target, canonicalRate)!
          return <div key={member.token} className="flex items-center justify-between gap-3 py-2"><dt className="min-w-0 break-words">{member.name ?? pv('unnamedParticipant')}</dt><dd className="shrink-0 text-right"><span className="block">{formatSplitMoney(source, view.currency, locale)}</span><span className="block font-medium text-primary">{formatConvertedMoney(converted, target, locale)}</span></dd></div>
        })}{(totals.get(UNSPLIT_V2) ?? BigInt(0)) !== BigInt(0) && <div className="flex items-center justify-between gap-3 py-2"><dt>{pv('convertedOutstanding')}</dt><dd className="shrink-0 text-right"><span className="block">{formatSplitMoney(totals.get(UNSPLIT_V2)!, view.currency, locale)}</span><span className="block font-medium text-primary">{formatConvertedMoney(convertSplitMoney(totals.get(UNSPLIT_V2)!, view.currency, target, canonicalRate)!, target, locale)}</span></dd></div>}</dl>
      </div>}
      <button type="button" className={(valid && dirty ? primary : secondary) + ' w-full'} disabled={!valid || !dirty || pending || saving} onClick={save}>{saving ? pv('savingExchange') : pv('saveExchange')}</button>
    </div>}
  </div>
}

function ReviewItemRow({ item, view, pending, run }: { item: Item; view: SplitViewV2; pending: boolean; run: (v: Command, after?: () => void) => void }) {
  const pv = useTranslations('teskeid.receiptSplitPreview'); const digits = expenseCurrencyMinorDigits(view.currency)
  const [quantity, setQuantity] = useState(quantityInput(item.quantityUnits)); const [amount, setAmount] = useState(splitDecimal(item.totalMinor, digits))
  const units = parseQuantityUnits(quantity); const minor = parseSplitDecimal(amount, digits)
  const dirty = quantity !== quantityInput(item.quantityUnits) || amount !== splitDecimal(item.totalMinor, digits)
  const explanation = item.explanation || (item.description !== item.originalDescription ? item.description : '')
  return <article aria-label={item.originalDescription} className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
    <div><h4 className="break-words font-semibold">{item.originalDescription}</h4>
      {explanation && <p className="mt-1 break-words text-sm text-muted-foreground">{explanation}{item.explanationNeedsReview ? ' · ' + pv('needsReview') : ''}</p>}</div>
    <fieldset className="grid grid-cols-2 gap-3" disabled={pending}>
      <label className="text-sm">{pv('quantity')}<span className="mt-1 flex min-h-11 items-center rounded-xl border border-border bg-background px-3 focus-within:ring-2 focus-within:ring-ring"><input className="min-w-0 flex-1 bg-transparent text-base outline-none" aria-label={pv('quantity')} inputMode="decimal" value={quantity} onChange={e => setQuantity(e.target.value)} /><span className="ml-2 shrink-0 text-sm text-muted-foreground">{pv('pieces')}</span></span></label>
      <label className="text-sm">{pv('lineAmount')}<span className="mt-1 flex min-h-11 items-center rounded-xl border border-border bg-background px-3 focus-within:ring-2 focus-within:ring-ring"><input className="min-w-0 flex-1 bg-transparent text-base outline-none" aria-label={pv('lineAmount')} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /><span className="ml-2 shrink-0 text-sm text-muted-foreground">{view.currency}</span></span></label>
    </fieldset>
    {dirty && <button className={primary + ' w-full'} type="button" disabled={units === null || units === 0 || minor === null || (item.kind === 'item' && minor < 0) || (item.kind !== 'item' && units !== 3000)}
      onClick={() => run({ command: 'edit_item', id: view.id, contractVersion: 2, quantityScale: 3000, itemId: item.id, itemRevision: item.itemRevision, description: item.description, explanation: item.explanation, quantityUnits: units!, totalMinor: minor! })}>{pv('saveLine')}</button>}
  </article>
}

function Share({ view, pending, origin, copied, run, onCopy }: { view: SplitViewV2; pending: boolean; origin: string; copied: boolean; run: (v: Command) => void; onCopy: () => void }) {
  const t = useTranslations('teskeid.receiptSplit'); const [showQr, setShowQr] = useState(false); const [qrError, setQrError] = useState(false); const canvas = useRef<HTMLCanvasElement>(null)
  const shareUrl = view.inviteToken && origin ? origin + '/splitt#' + view.inviteToken : ''
  useEffect(() => {
    if (!showQr || !shareUrl || !canvas.current) return
    setQrError(false)
    QRCode.toCanvas(canvas.current, shareUrl, { width: 240, margin: 2, color: { dark: '#154212', light: '#ffffff' } }).catch(() => setQrError(true))
  }, [shareUrl, showQr])
  return <section className="space-y-3 rounded-2xl border border-border p-4"><h3 className="font-semibold">{t('share')}</h3><p className="text-sm text-muted-foreground">{t('shareHelp')}</p>
    {view.inviteToken && <input readOnly value={origin ? origin + '/splitt#' + view.inviteToken : ''} className={input} aria-label={t('share')} onFocus={e => e.target.select()} />}
    {view.inviteToken && <button className={primary + ' w-full'} onClick={onCopy}>{copied ? t('copied') : t('copy')}</button>}
    {view.inviteToken && <button type="button" className={secondary + ' w-full'} disabled={!shareUrl} aria-expanded={showQr} onClick={() => setShowQr(!showQr)}>{t(showQr ? 'hideQr' : 'showQr')}</button>}
    {showQr && shareUrl && <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-white p-4"><canvas ref={canvas} className="h-auto max-w-full" aria-label={t('qrLabel')} />
      <p className="text-center text-sm text-muted-foreground">{t('qrHelp')}</p>{qrError && <p role="alert" className="text-sm text-destructive">{t('qrFailed')}</p>}</div>}
    <button className={secondary + ' w-full'} disabled={pending} onClick={() => { if (window.confirm(t('rotateHelp'))) run({ command: 'rotate_invite', id: view.id }) }}>{t('rotate')}</button></section>
}

function ItemRow({ item, view, summary, selected, pending, money, run, lock, dismiss, dismissed }: { item: Item; view: SplitViewV2; summary: ReturnType<typeof splitSummaryV2>; selected: string[]; pending: boolean; money: (v: number | bigint) => string; run: (v: Command, after?: () => void) => void; lock: (id: string, group: Group | null) => void; dismiss: (itemId: string, dismissed: boolean) => void; dismissed: boolean }) {
  const t = useTranslations('teskeid.receiptSplit'); const pv = useTranslations('teskeid.receiptSplitPreview')
  const self = view.members.find(m => m.isSelf)!; const claims = view.claims.filter(c => c.itemId === item.id); const mine = claims.find(c => c.memberToken === self.token)?.quantityUnits ?? 0
  const left = summary.remaining.get(item.id) ?? 0; const [value, setValue] = useState(quantityInput(mine)); const [proportion, setProportion] = useState(proportionInput(mine, item.quantityUnits)); const [editing, setEditing] = useState(false)
  const parsed = parseQuantityUnits(value); const parsedProportion = parseProportionUnits(proportion, item.quantityUnits)
  useEffect(() => { setValue(quantityInput(mine)); setProportion(proportionInput(mine, item.quantityUnits)) }, [mine, item.quantityUnits])
  const save = (units: number) => run({ command: 'claim', id: view.id, contractVersion: 2, quantityScale: 3000, itemId: item.id, itemRevision: item.itemRevision, previousUnits: mine, quantityUnits: units }, () => lock(item.id, null))
  const amount = selected.length ? selected.reduce((sum, token) => sum + (summary.lineTotals.get(item.id)?.get(token) ?? BigInt(0)), BigInt(0)) : BigInt(item.totalMinor)
  const pin: Group = item.kind !== 'item' || item.totalMinor === 0 ? 'info' : left === 0 ? 'done' : 'remaining'
  return <article aria-label={item.description} className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h4 className="break-words font-semibold">{item.description}</h4>
    {item.originalDescription !== item.description && <p className="text-xs text-muted-foreground">{pv('original', { name: item.originalDescription })}</p>}{item.explanation && <p className="break-words text-sm text-muted-foreground">{item.explanation}{item.explanationNeedsReview ? ' · ' + pv('needsReview') : ''}</p>}</div><span className="shrink-0 text-sm">{money(amount)}</span></div>
    {item.kind === 'item' && item.totalMinor > 0 && <><p className="text-sm text-muted-foreground">{pv('remaining', { remaining: formatQuantity(left), total: formatQuantity(item.quantityUnits) })}</p>
      <div className="flex flex-wrap gap-2">{claims.map(c => <span key={c.memberToken} className={'rounded-xl px-3 py-2 text-sm ' + (selected.includes(c.memberToken) ? 'bg-primary/15 font-medium text-primary ring-1 ring-primary/30' : 'bg-primary/10 text-primary')}>{view.members.find(m => m.token === c.memberToken)?.name ?? t('unnamed')} · {formatQuantity(c.quantityUnits)}</span>)}</div>
      <div className="grid grid-cols-[44px_1fr_44px] gap-2"><button aria-label={pv('decrease')} className={secondary} disabled={pending || mine === 0} onClick={() => save(stepQuantity(mine, -1, mine + left))}><Minus aria-hidden size={18} /></button><div className="flex min-h-11 items-center justify-center rounded-xl border border-border font-semibold">{formatQuantity(mine)}</div><button aria-label={pv('increase')} className={secondary} disabled={pending || left === 0} onClick={() => save(stepQuantity(mine, 1, mine + left))}><Plus aria-hidden size={18} /></button></div>
      <div className="grid grid-cols-4 gap-2" aria-label={pv('fractions')}>{[750,1000,1500,3000].map(units => <button key={units} className={mine === units ? primary : secondary} disabled={pending || units > mine + left} onClick={() => save(units)}>{formatQuantity(units)}</button>)}</div>
      <details onToggle={e => lock(item.id, e.currentTarget.open ? pin : null)}><summary className="min-h-11 cursor-pointer py-2 text-sm">{pv('otherQuantity')}</summary><div className="space-y-3 pt-2">
        <label className="block text-sm">{pv('quantity')}<div className="mt-1 flex gap-2"><input className={input + ' min-w-0 flex-1'} aria-label={pv('myQuantity')} inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} /><button className={secondary} disabled={pending || parsed === null || parsed > mine + left} onClick={() => parsed !== null && save(parsed)}>{pv('saveQuantity')}</button></div></label>
        <label className="block text-sm">{pv('proportion')}<div className="mt-1 flex gap-2"><input className={input + ' min-w-0 flex-1'} aria-label={pv('myProportion')} inputMode="decimal" placeholder="10% eða 1/10" value={proportion} onChange={e => setProportion(e.target.value)} /><button className={secondary} disabled={pending || parsedProportion === null || parsedProportion > mine + left} onClick={() => parsedProportion !== null && save(parsedProportion)}>{pv('saveProportion')}</button></div></label>
        {parsedProportion !== null && <p className="text-xs text-muted-foreground">{pv('normalizedProportion', { proportion: proportionInput(parsedProportion, item.quantityUnits), quantity: formatQuantity(parsedProportion) })}</p>}
      </div></details>
      {left > 0 && <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-sm"><button type="button" className="min-h-10 text-primary underline-offset-4 hover:underline" disabled={pending} onClick={() => save(mine + left)}>{pv('takeRest')}</button>
        {mine === 0 && <button type="button" className="min-h-10 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" disabled={pending} onClick={() => dismiss(item.id, !dismissed)}>{pv(dismissed ? 'undoNotMine' : 'notMine')}</button>}</div>}</>}
    {item.kind === 'item' && item.totalMinor === 0 && <p className="text-sm text-muted-foreground">{pv('zeroHelp')}</p>}
    {view.isOwner && <><button className={secondary + ' w-full'} onClick={() => { setEditing(!editing); lock(item.id, editing ? null : pin) }}>{pv('edit')}</button>{editing && <EditItem item={item} view={view} pending={pending} run={run} close={() => { setEditing(false); lock(item.id, null) }} />}</>}
  </article>
}

function EditItem({ item, view, pending, run, close }: { item: Item; view: SplitViewV2; pending: boolean; run: (v: Command, after?: () => void) => void; close: () => void }) {
  const pv = useTranslations('teskeid.receiptSplitPreview'); const digits = expenseCurrencyMinorDigits(view.currency)
  const [name, setName] = useState(item.description); const [explanation, setExplanation] = useState(item.explanation)
  const [quantity, setQuantity] = useState(quantityInput(item.quantityUnits)); const [amount, setAmount] = useState(splitDecimal(item.totalMinor, digits))
  const units = parseQuantityUnits(quantity); const minor = parseSplitDecimal(amount, digits)
  return <fieldset className="space-y-3 rounded-xl border border-border p-3" disabled={pending}>
    <label className="block text-sm">{pv('name')}<input className={input} value={name} maxLength={200} onChange={e => setName(e.target.value)} /></label>
    <label className="block text-sm">{pv('explanation')}<input className={input} value={explanation} maxLength={240} onChange={e => setExplanation(e.target.value)} /></label>
    <div className="grid grid-cols-2 gap-3"><label className="text-sm">{pv('quantity')}<input className={input} inputMode="decimal" value={quantity} onChange={e => setQuantity(e.target.value)} /></label><label className="text-sm">{pv('lineAmount')}<input className={input} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></label></div>
    <div className="flex gap-2"><button className={secondary + ' flex-1'} type="button" onClick={close}>{pv('cancel')}</button><button className={primary + ' flex-1'} type="button" disabled={!name.trim() || units === null || units === 0 || minor === null}
      onClick={() => run({ command: 'edit_item', id: view.id, contractVersion: 2, quantityScale: 3000, itemId: item.id, itemRevision: item.itemRevision, description: name.trim(), explanation: explanation.trim(), quantityUnits: units!, totalMinor: minor! }, close)}>{pv('saveLine')}</button></div>
  </fieldset>
}

function TotalEditor({ view, pending, run }: { view: SplitViewV2; pending: boolean; run: (v: Command) => void }) {
  const pv = useTranslations('teskeid.receiptSplitPreview'); const [open, setOpen] = useState(false)
  const [value, setValue] = useState(splitDecimal(view.receiptTotalMinor, expenseCurrencyMinorDigits(view.currency)))
  const minor = parseSplitDecimal(value, expenseCurrencyMinorDigits(view.currency))
  return <div className="space-y-2"><button className={secondary + ' w-full'} onClick={() => setOpen(!open)}>{pv('editReceipt')}</button>{open && <div className="flex gap-2"><input className={input + ' min-w-0 flex-1'} aria-label={pv('receiptTotal')} inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} /><button className={primary} disabled={pending || minor === null || minor <= 0} onClick={() => minor !== null && run({ command: 'receipt_total', id: view.id, contractVersion: 2, quantityScale: 3000, version: view.version, receiptTotalMinor: minor })}>{pv('saveReceipt')}</button></div>}</div>
}

function ReviewTotalEditor({ view, pending, run }: { view: SplitViewV2; pending: boolean; run: (v: Command) => void }) {
  const pv = useTranslations('teskeid.receiptSplitPreview'); const digits = expenseCurrencyMinorDigits(view.currency)
  const initial = splitDecimal(view.receiptTotalMinor, digits); const [value, setValue] = useState(initial)
  const minor = parseSplitDecimal(value, digits); const dirty = value !== initial
  return <dd className="space-y-2"><span className="flex min-h-11 items-center rounded-xl border border-border bg-background px-3 focus-within:ring-2 focus-within:ring-ring"><input className="min-w-0 flex-1 bg-transparent text-base outline-none" aria-label={pv('receiptTotal')} inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} /><span className="ml-2 shrink-0 text-sm text-muted-foreground">{view.currency}</span></span>
    {dirty && <button className={primary + ' w-full'} disabled={pending || minor === null || minor <= 0} onClick={() => minor !== null && run({ command: 'receipt_total', id: view.id, contractVersion: 2, quantityScale: 3000, version: view.version, receiptTotalMinor: minor })}>{pv('saveReceipt')}</button>}</dd>
}

function AddItem({ view, pending, run }: { view: SplitViewV2; pending: boolean; run: (v: Command, after?: () => void) => void }) {
  const pv = useTranslations('teskeid.receiptSplitPreview'); const [open, setOpen] = useState(false)
  const [name, setName] = useState(''); const [explanation, setExplanation] = useState(''); const [quantity, setQuantity] = useState('1'); const [amount, setAmount] = useState('')
  const units = parseQuantityUnits(quantity); const minor = parseSplitDecimal(amount, expenseCurrencyMinorDigits(view.currency))
  return <section className="space-y-3"><button className={secondary + ' w-full'} disabled={pending || view.items.length >= 100} onClick={() => setOpen(!open)}>{pv('add')}</button>{open && <fieldset className="space-y-3 rounded-2xl border border-border p-4" disabled={pending}>
    <p className="text-sm text-muted-foreground">{pv('addHelp')}</p><label className="block text-sm">{pv('name')}<input className={input} value={name} maxLength={200} onChange={e => setName(e.target.value)} /></label><label className="block text-sm">{pv('explanation')}<input className={input} value={explanation} maxLength={240} onChange={e => setExplanation(e.target.value)} /></label>
    <div className="grid grid-cols-2 gap-3"><label className="text-sm">{pv('quantity')}<input className={input} inputMode="decimal" value={quantity} onChange={e => setQuantity(e.target.value)} /></label><label className="text-sm">{pv('lineAmount')}<input className={input} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></label></div>
    <button className={primary + ' w-full'} disabled={!name.trim() || units === null || units === 0 || minor === null || minor < 0} onClick={() => run({ command: 'add_item', id: view.id, contractVersion: 2, quantityScale: 3000, description: name.trim(), explanation: explanation.trim(), quantityUnits: units!, totalMinor: minor! }, () => setOpen(false))}>{pv('add')}</button>
  </fieldset>}</section>
}

function DangerZone({ view, pending, run }: { view: SplitViewV2; pending: boolean; run: (v: Command, after?: () => void) => void }) {
  const t = useTranslations('teskeid.receiptSplit'); const router = useRouter(); const [, start] = useTransition(); const [error, setError] = useState('')
  return <div className="space-y-3 border-t border-border pt-4">{view.imageAvailable && <div className="flex flex-wrap gap-2"><button className={secondary} disabled={pending} onClick={() => { const tab = window.open('', '_blank'); if (tab) tab.opener = null; start(async () => { const result = await openSplitImage(view.id); if (result.ok && tab) tab.location.href = result.data.url; else { tab?.close(); setError(t('failed')) } }) }}>{t('openImage')}</button><button className={danger} disabled={pending} onClick={() => { if (window.confirm(t('deleteImageConfirm'))) run({ command: 'delete_image', id: view.id, version: view.version }) }}>{t('deleteImage')}</button></div>}
    <button className={danger + ' w-full'} disabled={pending} onClick={() => { if (window.confirm(t('deleteConfirm'))) run({ command: 'delete', id: view.id, version: view.version }, () => router.replace('/auth-mvp/splitta-reikningnum')) }}>{t('delete')}</button>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</div>
}
