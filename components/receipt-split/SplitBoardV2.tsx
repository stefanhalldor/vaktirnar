'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { ChevronDown, Minus, Plus } from 'lucide-react'
import { TeskeidMultiSelectPillFilter } from '@/components/teskeid/TeskeidMultiSelectPillFilter'
import { createRequestId, expenseDangerButtonClass as danger, expenseInputClass as input, expensePrimaryButtonClass as primary, expenseSecondaryButtonClass as secondary } from '@/components/expenses/ui'
import { expenseCurrencyMinorDigits } from '@/lib/expenses/input-money'
import { mutateSplitV2, openSplitImage } from '@/lib/receipt-split/actions'
import { parseSplitDecimal, splitDecimal } from '@/lib/receipt-split/contracts'
import { formatSplitMoney } from '@/lib/receipt-split/format'
import { formatQuantity, parseQuantityUnits, quantityInput, stepQuantity } from '@/lib/receipt-split/quantity-v2'
import { splitSummaryV2, UNSPLIT_V2 } from '@/lib/receipt-split/summary-v2'
import type { SplitViewV2 } from '@/lib/receipt-split/view-v2'
import { SplitImport } from './SplitImport'

type Item = SplitViewV2['items'][number]
type Group = 'remaining' | 'done' | 'info'
type Command = { command: string; id: string; [key: string]: unknown }

export function SplitBoardV2({ view }: { view: SplitViewV2 }) {
  const t = useTranslations('teskeid.receiptSplit'); const pv = useTranslations('teskeid.receiptSplitPreview')
  const locale = useLocale(); const router = useRouter(); const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null); const [selected, setSelected] = useState<string[]>([])
  const [doneOpen, setDoneOpen] = useState(false); const [locks, setLocks] = useState<Record<string, Group>>({})
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
  if (view.deleteScope) return <button className={danger + ' w-full'} disabled={pending} onClick={() => run({ command: view.deleteScope === 'split' ? 'delete' : 'delete_image', id: view.id, version: view.version })}>{t('retryDelete')}</button>
  if (view.state === 'uploading' || view.state === 'extracting') return <SplitImport id={view.id} />
  const classify = (item: Item): Group => item.kind !== 'item' || item.totalMinor === 0 ? 'info' : (summary.remaining.get(item.id) ?? 0) === 0 ? 'done' : 'remaining'
  const groups: Record<Group, Item[]> = { remaining: [], done: [], info: [] }
  for (const item of view.items) groups[locks[item.id] ?? classify(item)].push(item)
  const filtered = selected.length ? view.items.filter(item => view.claims.some(c => c.itemId === item.id && selected.includes(c.memberToken))) : []
  const row = (item: Item) => view.state === 'review'
    ? <ReviewItemRow key={item.id} item={item} view={view} pending={pending} run={run} />
    : <ItemRow key={item.id} item={item} view={view} summary={summary} selected={selected} pending={pending} money={money} run={run} lock={lock} />
  return <div className="space-y-6" aria-busy={pending}>
    <header><h2 className="break-words text-xl font-semibold">{view.title}</h2></header>
    <section className="space-y-3 rounded-2xl border border-border p-4"><h3 className="font-semibold">{pv('summary')}</h3>
      <dl className="space-y-2 text-sm">{view.isOwner && view.state === 'review' ? <div className="space-y-2"><dt>{pv('receiptTotal')}</dt><ReviewTotalEditor view={view} pending={pending} run={run} /></div> : <div className="flex justify-between"><dt>{pv('receiptTotal')}</dt><dd>{money(view.receiptTotalMinor)}</dd></div>}
        <div className="flex justify-between"><dt>{pv('linesTotal')}</dt><dd>{money(summary.linesTotalMinor)}</dd></div></dl>
      <p className="rounded-lg border border-border p-3 text-sm" aria-live="polite">{summary.receiptDifferenceMinor === BigInt(0) ? pv('matched')
        : pv(summary.receiptDifferenceMinor > BigInt(0) ? 'missing' : 'excess', { amount: money(summary.receiptDifferenceMinor < BigInt(0) ? -summary.receiptDifferenceMinor : summary.receiptDifferenceMinor) })}</p>
      {view.isOwner && view.state === 'sharing' && <TotalEditor view={view} pending={pending} run={run} />}</section>
    {view.isOwner && view.state === 'sharing' && <Share view={view} pending={pending} origin={origin} copied={copied} run={run} onCopy={async () => {
      try { await navigator.clipboard.writeText(location.origin + '/splitt#' + view.inviteToken); setCopied(true) } catch { setError(t('failed')) }
    }} />}
    {view.state === 'sharing' && <section className="space-y-3"><h3 className="font-semibold">{t('people')}</h3>
      <TeskeidMultiSelectPillFilter options={view.members.map(m => ({ id: m.token, label: (m.name ?? t('unnamed')) + ' · ' + money(summary.totals.get(m.token) ?? BigInt(0)), disabled: pending }))}
        selectedIds={selected} onChange={setSelected} ariaLabel={t('people')} clearLabel={t('clear')} />
      <p className="text-sm text-muted-foreground">{t('unclaimed')}: {money(summary.totals.get(UNSPLIT_V2) ?? BigInt(0))}</p></section>}
    {view.state === 'review' ? <section className="space-y-3"><h3 className="font-semibold">{pv('reviewItems')}</h3>{view.items.map(row)}</section>
      : selected.length ? <section className="space-y-3"><h3 className="font-semibold">{pv('selectedItems')}</h3>{filtered.length ? filtered.map(row) : <p>{pv('emptyFilter')}</p>}</section> : <>
      <section className="space-y-3"><h3 className="font-semibold">{pv('remainingTitle')}</h3>{groups.remaining.length ? groups.remaining.map(row) : <p>{pv('allChosen')}</p>}{groups.info.map(row)}</section>
      <section className="rounded-2xl border border-border"><button className="flex min-h-11 w-full items-center justify-between p-4 font-semibold" aria-expanded={doneOpen} onClick={() => setDoneOpen(!doneOpen)}>{pv('doneTitle', { count: groups.done.length })}<ChevronDown aria-hidden size={18} className={doneOpen ? 'rotate-180' : ''} /></button>
        {doneOpen && <div className="space-y-3 border-t border-border p-4">{groups.done.length ? groups.done.map(row) : <p>{pv('emptyDone')}</p>}</div>}</section></>}
    {view.isOwner && <AddItem view={view} pending={pending} run={run} />}
    {view.state === 'review' && view.isOwner && <section className="space-y-3 rounded-2xl border border-border p-4"><p className="text-sm text-muted-foreground">{pv('reviewHelp')}</p>
      <button className={primary + ' w-full'} disabled={pending} onClick={() => run({ command: 'confirm_review', id: view.id, version: view.version })}>{t('confirm')}</button></section>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{pending && <p role="status">{t('pending')}</p>}
    <button className={secondary + ' w-full'} disabled={pending} onClick={() => router.refresh()}>{t('refresh')}</button>
    {view.isOwner && <DangerZone view={view} pending={pending} run={run} />}
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
  const t = useTranslations('teskeid.receiptSplit'); return <section className="space-y-3 rounded-2xl border border-border p-4"><h3 className="font-semibold">{t('share')}</h3><p className="text-sm text-muted-foreground">{t('shareHelp')}</p>
    {view.inviteToken && <input readOnly value={origin ? origin + '/splitt#' + view.inviteToken : ''} className={input} aria-label={t('share')} onFocus={e => e.target.select()} />}
    {view.inviteToken && <button className={primary + ' w-full'} onClick={onCopy}>{copied ? t('copied') : t('copy')}</button>}
    <button className={secondary + ' w-full'} disabled={pending} onClick={() => { if (window.confirm(t('rotateHelp'))) run({ command: 'rotate_invite', id: view.id }) }}>{t('rotate')}</button></section>
}

function ItemRow({ item, view, summary, selected, pending, money, run, lock }: { item: Item; view: SplitViewV2; summary: ReturnType<typeof splitSummaryV2>; selected: string[]; pending: boolean; money: (v: number | bigint) => string; run: (v: Command, after?: () => void) => void; lock: (id: string, group: Group | null) => void }) {
  const t = useTranslations('teskeid.receiptSplit'); const pv = useTranslations('teskeid.receiptSplitPreview')
  const self = view.members.find(m => m.isSelf)!; const claims = view.claims.filter(c => c.itemId === item.id); const mine = claims.find(c => c.memberToken === self.token)?.quantityUnits ?? 0
  const left = summary.remaining.get(item.id) ?? 0; const [value, setValue] = useState(quantityInput(mine)); const [editing, setEditing] = useState(false); const parsed = parseQuantityUnits(value)
  const save = (units: number) => run({ command: 'claim', id: view.id, contractVersion: 2, quantityScale: 3000, itemId: item.id, itemRevision: item.itemRevision, previousUnits: mine, quantityUnits: units }, () => lock(item.id, null))
  const visible = claims.filter(c => !selected.length || selected.includes(c.memberToken)); const amount = selected.length ? selected.reduce((sum, token) => sum + (summary.lineTotals.get(item.id)?.get(token) ?? BigInt(0)), BigInt(0)) : BigInt(item.totalMinor)
  const pin: Group = item.kind !== 'item' || item.totalMinor === 0 ? 'info' : left === 0 ? 'done' : 'remaining'
  return <article aria-label={item.description} className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h4 className="break-words font-semibold">{item.description}</h4>
    {item.originalDescription !== item.description && <p className="text-xs text-muted-foreground">{pv('original', { name: item.originalDescription })}</p>}{item.explanation && <p className="break-words text-sm text-muted-foreground">{item.explanation}{item.explanationNeedsReview ? ' · ' + pv('needsReview') : ''}</p>}</div><span className="shrink-0 text-sm">{money(amount)}</span></div>
    {item.kind === 'item' && item.totalMinor > 0 && <><p className="text-sm text-muted-foreground">{pv('remaining', { remaining: formatQuantity(left), total: formatQuantity(item.quantityUnits) })}</p>
      <div className="flex flex-wrap gap-2">{visible.map(c => <span key={c.memberToken} className="rounded-xl bg-primary/10 px-3 py-2 text-sm text-primary">{view.members.find(m => m.token === c.memberToken)?.name ?? t('unnamed')} · {formatQuantity(c.quantityUnits)}</span>)}</div>
      <div className="grid grid-cols-[44px_1fr_44px] gap-2"><button aria-label={pv('decrease')} className={secondary} disabled={pending || mine === 0} onClick={() => save(stepQuantity(mine, -1, mine + left))}><Minus aria-hidden size={18} /></button><div className="flex min-h-11 items-center justify-center rounded-xl border border-border font-semibold">{formatQuantity(mine)}</div><button aria-label={pv('increase')} className={secondary} disabled={pending || left === 0} onClick={() => save(stepQuantity(mine, 1, mine + left))}><Plus aria-hidden size={18} /></button></div>
      <div className="grid grid-cols-4 gap-2" aria-label={pv('fractions')}>{[750,1000,1500,3000].map(units => <button key={units} className={mine === units ? primary : secondary} disabled={pending || units > mine + left} onClick={() => save(units)}>{formatQuantity(units)}</button>)}</div>
      <details onToggle={e => lock(item.id, e.currentTarget.open ? pin : null)}><summary className="min-h-11 cursor-pointer py-2 text-sm">{pv('otherQuantity')}</summary><div className="flex gap-2"><input className={input + ' min-w-0 flex-1'} aria-label={pv('myQuantity')} inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} /><button className={secondary} disabled={pending || parsed === null || parsed > mine + left} onClick={() => parsed !== null && save(parsed)}>{pv('saveQuantity')}</button></div></details></>}
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
