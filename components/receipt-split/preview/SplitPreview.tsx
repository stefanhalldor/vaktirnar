'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Minus, Plus, ChevronDown, FlaskConical } from 'lucide-react'
import { TeskeidMultiSelectPillFilter } from '@/components/teskeid/TeskeidMultiSelectPillFilter'
import { expenseInputClass as input, expensePrimaryButtonClass as primary, expenseSecondaryButtonClass as secondary, createRequestId } from '@/components/expenses/ui'
import { parseSplitDecimal, splitDecimal } from '@/lib/receipt-split/contracts'
import { formatSplitMoney } from '@/lib/receipt-split/format'
import { formatQuantity, parseQuantityUnits, quantityInput, stepQuantity } from '@/lib/receipt-split/quantity-v2'
import { claimedUnits, previewApply, previewGroup, previewLineShares, previewTotals, type PreviewCommand, type PreviewItem, type PreviewResult, type PreviewState } from '@/lib/receipt-split/preview-model'

type Translate = ReturnType<typeof useTranslations>
type Group = ReturnType<typeof previewGroup>
type Commit = (command: PreviewCommand, requestId: string) => Promise<PreviewResult>

function seed(t: Translate): PreviewState {
  const line = (id: string, name: string, explanation: string, units: number, amount: number, claims: Record<string, number> = {}): PreviewItem =>
    ({ id, name, originalName: name, explanation, units, amount, claims, revision: 1, needsReview: false })
  return { phase: 'sharing', receiptTotal: 10000, revision: 1, owner: 'self',
    members: [{ id: 'self', name: t('memberSelf') }, { id: 'anna', name: t('memberAnna') }, { id: 'bjorn', name: t('memberBjorn') }],
    items: [
      line('wine', t('sampleWine'), t('sampleWineHelp'), 3000, 4800),
      line('espresso', t('sampleCoffee'), '', 12000, 1600, { anna: 3000 }),
      line('beer', t('sampleBeer'), t('sampleBeerHelp'), 12000, 2800, { self: 3000 }),
      line('water', t('sampleWater'), '', 3000, 400, { bjorn: 3000 }),
      { ...line('cake', t('sampleCake'), '', 3000, 0), needsReview: true },
    ],
  }
}

export function SplitPreview() {
  const t = useTranslations('teskeid.receiptSplitPreview')
  const locale = useLocale()
  const [state, setState] = useState<PreviewState>(() => seed(t))
  const server = useRef(state)
  const journal = useRef(new Map<string, { key: string; result: PreviewResult }>())
  const [actor, setActor] = useState('self')
  const [selected, setSelected] = useState<string[]>([])
  const [doneOpen, setDoneOpen] = useState(false)
  const [locks, setLocks] = useState<Record<string, Group>>({})
  const [status, setStatus] = useState('')
  const [remoteQueued, setRemoteQueued] = useState(false)
  const [adding, setAdding] = useState(false)
  const summaryRef = useRef<HTMLHeadingElement>(null)
  const totals = previewTotals(state)
  const money = (amount: number | bigint) => formatSplitMoney(amount, 'EUR', locale)
  const owner = actor === state.owner
  const refresh = useCallback(() => { setState(server.current); setRemoteQueued(false) }, [])
  useEffect(() => {
    const poll = window.setInterval(() => { if (!document.hidden) refresh() }, 8000)
    window.addEventListener('focus', refresh)
    return () => { window.clearInterval(poll); window.removeEventListener('focus', refresh) }
  }, [refresh])
  const lock = useCallback((id: string, group: Group | null) => {
    setLocks(previous => {
      if (previous[id] === group || (group === null && !(id in previous))) return previous
      const next = { ...previous }
      if (group === null) delete next[id]
      else if (!(id in next)) next[id] = group
      return next
    })
  }, [])
  async function commit(command: PreviewCommand, requestId: string): Promise<PreviewResult> {
    // Simulated latency and request journal. All data stay in this mounted component.
    await new Promise(resolve => window.setTimeout(resolve, 120))
    const key = JSON.stringify({ actor, command })
    const previous = journal.current.get(requestId)
    if (previous) return previous.key === key ? previous.result : { ok: false, error: 'stale' }
    const result = previewApply(server.current, actor, command)
    if (result.ok) {
      server.current = result.state
      journal.current.set(requestId, { key, result })
      setState(result.state)
      setStatus(t('savedLocal'))
    }
    return result
  }
  function releaseFocus(id: string) {
    summaryRef.current?.focus()
    lock(id, null)
  }
  function simulate() {
    const item = server.current.items.find(i => i.id === 'wine')!
    const other = actor === 'anna' ? 'bjorn' : 'anna'
    const amount = Math.min(item.units - claimedUnits(item), 1500)
    const result = previewApply(server.current, other, { type: 'claim', itemId: item.id, revision: item.revision,
      units: (item.claims[other] ?? 0) + amount })
    if (result.ok && amount > 0) { server.current = result.state; setRemoteQueued(true); setStatus(t('queued')) }
    else setStatus(t('nothingToSimulate'))
  }
  const groups: Record<Group, PreviewItem[]> = { remaining: [], done: [], info: [] }
  for (const item of state.items) groups[locks[item.id] ?? previewGroup(item)].push(item)
  const row = (item: PreviewItem) => <PreviewRow key={item.id} item={item} state={state} actor={actor}
    selected={selected} group={locks[item.id] ?? previewGroup(item)} commit={commit} lock={lock}
    onFinished={() => releaseFocus(item.id)} />
  const filtered = state.items.filter(i => selected.some(id => (i.claims[id] ?? 0) > 0))
  const doneAmount = groups.done.reduce((sum, item) => sum + BigInt(item.amount), BigInt(0))
  return <main className="mx-auto w-full max-w-lg space-y-6 px-4 pb-16 pt-6">
    <header className="space-y-3">
      <h1 className="text-xl font-semibold text-primary">{t('title')}</h1>
      <div className="space-y-1 rounded-xl border border-primary/25 bg-primary/5 p-3 text-sm">
        <p className="flex items-center gap-2 font-medium"><FlaskConical size={16} aria-hidden />{t('preview')}</p>
        <p className="leading-6">{t('previewHelp')}</p>
      </div>
    </header>
    <section aria-labelledby="preview-summary" className="space-y-3">
      <h2 id="preview-summary" ref={summaryRef} tabIndex={-1} className="text-lg font-semibold outline-none">{t('summary')}</h2>
      <dl className="space-y-2 text-sm">
        {([[t('receiptTotal'), money(state.receiptTotal)], [t('linesTotal'), money(totals.lines)]]).map(([label, value]) =>
          <div key={label} className="flex justify-between gap-3"><dt>{label}</dt><dd className="text-right font-medium">{value}</dd></div>)}
      </dl>
      <p className="rounded-lg border border-border p-3 text-sm" aria-live="polite">
        {totals.difference === BigInt(0) ? t('matched') : t(totals.difference > BigInt(0) ? 'missing' : 'excess',
          { amount: money(totals.difference < BigInt(0) ? -totals.difference : totals.difference) })}
      </p>
      <dl className="flex flex-wrap justify-between gap-3 text-sm">
        <div><dt className="text-muted-foreground">{t('claimedTotal')}</dt><dd className="font-semibold">{money(totals.claimed)}</dd></div>
        <div><dt className="text-muted-foreground">{t('unclaimedTotal')}</dt><dd className="font-semibold">{money(totals.unclaimed)}</dd></div>
      </dl>
      {owner && <ReceiptEditor state={state} commit={commit} />}
      {state.phase === 'review' && owner && <StartButton commit={commit} />}
      {state.phase === 'review' && <p className="text-sm text-muted-foreground">{t('reviewHelp')}</p>}
    </section>
    <section className="space-y-2" aria-label={t('people')}>
      <h2 className="font-semibold">{t('people')}</h2>
      <TeskeidMultiSelectPillFilter options={state.members.map(m => ({ id: m.id, label: m.name + ' · ' + money(totals.people.get(m.id) ?? BigInt(0)) }))}
        selectedIds={selected} onChange={ids => {
          if (Object.keys(locks).length) { setStatus(t('finishChanges')); return }
          setSelected(ids)
        }} ariaLabel={t('people')} clearLabel={t('clear')} />
      {!!selected.length && <p className="text-sm text-muted-foreground">{t('filteredHelp')}</p>}
    </section>
    <p role="status" className="min-h-6 text-sm text-primary">{status}</p>
    {selected.length ? <section className="space-y-3">
      <h2 className="font-semibold">{t('selectedItems')}</h2>
      {filtered.length ? filtered.map(row) : <p className="text-sm text-muted-foreground">{t('emptyFilter')}</p>}
    </section> : <>
      <section className="space-y-3">
        <h2 className="font-semibold">{t('remainingTitle')}</h2>
        {groups.remaining.length ? groups.remaining.map(row) : <p className="text-sm text-muted-foreground">{t('allChosen')}</p>}
      </section>
      <section className="border-t border-border pt-3">
        <button type="button" aria-expanded={doneOpen} aria-controls="preview-done" onClick={() => setDoneOpen(!doneOpen)}
          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span><span className="block font-semibold">{t('doneTitle', { count: groups.done.length })}</span>
            <span className="text-sm text-muted-foreground">{money(doneAmount)}</span></span>
          <ChevronDown aria-hidden size={20} className={doneOpen ? 'rotate-180' : ''} />
        </button>
        <div id="preview-done" hidden={!doneOpen} className="space-y-3 pt-3">
          {groups.done.length ? groups.done.map(row) : <p className="text-sm text-muted-foreground">{t('emptyDone')}</p>}
        </div>
      </section>
      {!!groups.info.length && <section className="space-y-3">
        <h2 className="font-semibold">{t('zeroTitle')}</h2>{groups.info.map(row)}
      </section>}
    </>}
    {owner && <section className="space-y-3">
      <button type="button" className={secondary + ' w-full'} aria-expanded={adding} onClick={() => setAdding(!adding)}>{t('add')}</button>
      {adding && <NewItem commit={commit} onDone={() => setAdding(false)} />}
    </section>}
    <section className="space-y-3 border-t border-border pt-5" aria-label={t('demoControls')}>
      <h2 className="font-semibold">{t('demoControls')}</h2>
      <label className="block text-sm">{t('viewAs')}<select className={input} value={actor} disabled={Object.keys(locks).length > 0}
        onChange={e => { setActor(e.target.value); setSelected([]) }}>
        {state.members.map(m => <option key={m.id} value={m.id}>{m.name}{m.id === state.owner ? ' · ' + t('owner') : ''}</option>)}
      </select></label>
      <p className="text-sm leading-6 text-muted-foreground">{t('pollHelp')}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={secondary + ' flex-1'} disabled={state.phase !== 'sharing' || remoteQueued} onClick={simulate}>{t('simulate')}</button>
        <button type="button" className={secondary} onClick={refresh}>{t('refresh')}</button>
      </div>
      <button type="button" className={secondary + ' w-full'} disabled={Object.keys(locks).length > 0}
        onClick={() => {
          const next: PreviewState = { ...seed(t), phase: 'review', items: seed(t).items.map(item => ({ ...item, claims: {} })) }
          server.current = next; journal.current.clear(); setState(next); setActor('self'); setSelected([])
          setDoneOpen(false); setRemoteQueued(false); setStatus(''); setAdding(false)
          summaryRef.current?.focus()
        }}>{t('resetReview')}</button>
    </section>
  </main>
}

function PreviewRow({ item, state, actor, selected, group, commit, lock, onFinished }: {
  item: PreviewItem; state: PreviewState; actor: string; selected: string[]; group: Group
  commit: Commit; lock: (id: string, group: Group | null) => void; onFinished: () => void
}) {
  const t = useTranslations('teskeid.receiptSplitPreview')
  const locale = useLocale()
  const [base, setBase] = useState(item)
  const [value, setValue] = useState(quantityInput(item.claims[actor] ?? 0))
  const [focused, setFocused] = useState(false)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(item.name)
  const [explanation, setExplanation] = useState(item.explanation)
  const [quantity, setQuantity] = useState(quantityInput(item.units))
  const [amount, setAmount] = useState(splitDecimal(item.amount, 2))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const request = useRef<{ key: string; id: string } | null>(null)
  const myBase = base.claims[actor] ?? 0
  const dirty = value !== quantityInput(myBase) || name !== base.name || explanation !== base.explanation
    || quantity !== quantityInput(base.units) || amount !== splitDecimal(base.amount, 2)
  const stale = base.revision !== item.revision && (dirty || focused || editing)
  const parsed = parseQuantityUnits(value)
  const maximum = base.units - claimedUnits(base) + myBase
  const remaining = item.units - claimedUnits(item)
  const shares = previewLineShares(item)
  const visible = Object.entries(item.claims).filter(([id, units]) => units > 0 && (!selected.length || selected.includes(id)))
  const shownAmount = selected.length ? selected.reduce((sum, id) => sum + (shares.get(id) ?? 0), 0) : item.amount
  const proposedShare = parsed !== null && parsed <= maximum && base.amount > 0
    ? previewLineShares({ ...base, claims: { ...base.claims, [actor]: parsed } }).get(actor) ?? 0 : null
  const money = (n: number) => formatSplitMoney(n, 'EUR', locale)
  function reset() {
    setBase(item); setValue(quantityInput(item.claims[actor] ?? 0)); setName(item.name)
    setExplanation(item.explanation); setQuantity(quantityInput(item.units)); setAmount(splitDecimal(item.amount, 2))
    setError(''); setEditing(false); setFocused(false); request.current = null
  }
  useEffect(() => {
    if (!focused && !dirty && !editing && !pending) {
      setBase(item); setValue(quantityInput(item.claims[actor] ?? 0)); setName(item.name)
      setExplanation(item.explanation); setQuantity(quantityInput(item.units)); setAmount(splitDecimal(item.amount, 2))
    }
  }, [item, actor, focused, dirty, editing, pending])
  useEffect(() => { lock(item.id, focused || dirty || editing || pending ? group : null) },
    [item.id, group, focused, dirty, editing, pending, lock])
  async function save() {
    let command: PreviewCommand
    if (editing) {
      const units = parseQuantityUnits(quantity)
      const price = parseSplitDecimal(amount, 2)
      if (units === null || price === null) { setError(t('invalidInput')); return }
      command = { type: 'edit', itemId: item.id, revision: base.revision, name, explanation, units, amount: price }
    } else {
      if (parsed === null) { setError(t('invalidFraction')); return }
      command = { type: 'claim', itemId: item.id, revision: base.revision, units: parsed }
    }
    const key = JSON.stringify(command)
    if (request.current?.key !== key) request.current = { key, id: createRequestId() }
    setPending(true); setError('')
    const result = await commit(command, request.current.id)
    setPending(false)
    if (!result.ok) { setError(t(result.error)); return }
    const next = result.state.items.find(i => i.id === item.id)!
    setBase(next); setValue(quantityInput(next.claims[actor] ?? 0)); setName(next.name); setExplanation(next.explanation)
    setQuantity(quantityInput(next.units)); setAmount(splitDecimal(next.amount, 2)); setEditing(false); setFocused(false)
    request.current = null
    onFinished()
  }
  return <article aria-label={item.name} className="space-y-3 rounded-xl border border-border bg-card p-4"
    onFocusCapture={() => { setFocused(true); lock(item.id, group) }}
    onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false) }}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="break-words font-semibold">{item.name}</h3>
        {item.name !== item.originalName && <p className="break-words text-xs text-muted-foreground">{t('original', { name: item.originalName })}</p>}
        {item.explanation && <p className="break-words text-sm text-muted-foreground">{item.explanation}</p>}
        {item.needsReview && <p className="text-xs text-muted-foreground">{t('needsReview')}</p>}
      </div>
      <span className="shrink-0 text-sm font-medium">{money(shownAmount)}</span>
    </div>
    <p className="text-sm text-muted-foreground">{item.amount === 0 ? t('zeroHelp')
      : t('remaining', { remaining: formatQuantity(remaining), total: formatQuantity(item.units) })}</p>
    {!!item.amount && <div className="flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
      {Object.entries(item.claims).filter(([, units]) => units > 0).map(([id, units], i) =>
        <span key={id} className={i % 2 ? 'border-l border-card bg-primary/45' : 'border-l border-card bg-primary'}
          style={{ width: (units / item.units * 100) + '%' }} />)}
    </div>}
    {!!visible.length && <ul className="flex flex-wrap gap-2 text-sm">
      {visible.map(([id, units]) => <li key={id} className="max-w-full break-words rounded-lg bg-primary/5 px-2 py-1">
        {state.members.find(m => m.id === id)?.name} · {formatQuantity(units)} · {money(shares.get(id) ?? 0)}
      </li>)}
    </ul>}
    {editing ? <fieldset className="space-y-3 border-t border-border pt-3" disabled={pending}>
      <legend className="text-sm font-medium">{t('edit')}</legend>
      <label className="block text-sm">{t('name')}<input className={input} value={name} maxLength={200} onChange={e => setName(e.target.value)} /></label>
      <label className="block text-sm">{t('explanation')}<input className={input} value={explanation} maxLength={240} onChange={e => setExplanation(e.target.value)} /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="min-w-0 text-sm">{t('quantity')}<input className={input} inputMode="text" value={quantity} onChange={e => setQuantity(e.target.value)} /></label>
        <label className="min-w-0 text-sm">{t('lineAmount')}<input className={input} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></label>
      </div>
    </fieldset> : state.phase === 'sharing' && item.amount > 0 ? <div className="space-y-3 border-t border-border pt-3">
      <p className="text-sm font-medium">{t('myQuantity')}</p>
      <div className="grid grid-cols-[44px_1fr_44px] items-center gap-3">
        <button type="button" className={secondary + ' px-0'} aria-label={t('decrease')} disabled={pending || parsed === 0}
          onClick={() => setValue(quantityInput(stepQuantity(parsed ?? 0, -1, maximum)))}><Minus size={18} aria-hidden /></button>
        <output aria-live="polite" className="min-w-0 break-all text-center text-2xl font-semibold tabular-nums">{parsed === null ? value || '0' : formatQuantity(parsed)}</output>
        <button type="button" className={secondary + ' px-0'} aria-label={t('increase')} disabled={pending || (parsed ?? 0) >= maximum}
          onClick={() => setValue(quantityInput(stepQuantity(parsed ?? 0, 1, maximum)))}><Plus size={18} aria-hidden /></button>
      </div>
      <div role="group" aria-label={t('fractions')} className="grid grid-cols-4 gap-2">
        {[750, 1000, 1500, 3000].map(units => <button key={units} type="button" aria-pressed={parsed === units}
          disabled={pending || units > maximum} onClick={() => setValue(quantityInput(units))}
          className={secondary + ' px-1 text-lg aria-pressed:border-primary aria-pressed:bg-primary/10'}>{formatQuantity(units)}</button>)}
      </div>
      <label className="block text-sm">{t('otherQuantity')}<input className={input} inputMode="text" maxLength={40} value={value} disabled={pending}
        onChange={e => setValue(e.target.value)} aria-describedby={'quantity-help-' + item.id} /></label>
      <p id={'quantity-help-' + item.id} className="text-xs text-muted-foreground">{t('quantityHelp')}</p>
      {dirty && proposedShare !== null && <p className="text-sm text-primary">{t('proposedShare', { amount: money(proposedShare) })}</p>}
      <button type="button" className="min-h-10 text-sm text-primary underline" disabled={pending} onClick={() => setValue(quantityInput(maximum))}>{t('allAvailable', { quantity: formatQuantity(maximum) })}</button>
    </div> : null}
    {dirty && <p className="text-sm text-muted-foreground">{t('unsaved')}</p>}
    {stale && <p role="alert" className="text-sm text-destructive">{t('stale')}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {(editing || (state.phase === 'sharing' && item.amount > 0)) && <div className="flex flex-wrap gap-2">
      <button type="button" className={primary + ' flex-1'} disabled={pending || !dirty || stale} onClick={save}>{pending ? t('pending') : t(editing ? 'saveLine' : 'saveQuantity')}</button>
      {(dirty || editing || stale) && <button type="button" className={secondary} disabled={pending} onClick={() => { reset(); onFinished() }}>{t(stale ? 'reloadLine' : 'cancel')}</button>}
    </div>}
    {actor === state.owner && !editing && <button type="button" className="min-h-10 text-sm font-medium text-primary underline"
      disabled={pending || dirty} onClick={() => setEditing(true)}>{t('edit')}</button>}
  </article>
}

function StartButton({ commit }: { commit: Commit }) {
  const t = useTranslations('teskeid.receiptSplitPreview')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  return <div><button type="button" className={primary + ' w-full'} disabled={pending} onClick={async () => {
    setPending(true)
    const result = await commit({ type: 'start' }, createRequestId())
    if (!result.ok) setError(t(result.error))
    setPending(false)
  }}>{pending ? t('pending') : t('start')}</button>{error && <p role="alert">{error}</p>}</div>
}
function ReceiptEditor({ state, commit }: { state: PreviewState; commit: Commit }) {
  const t = useTranslations('teskeid.receiptSplitPreview')
  const [draft, setDraft] = useState<{ value: string; revision: number } | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  if (!draft) return <button type="button" className="min-h-10 text-sm text-primary underline" onClick={() => setDraft({ value: splitDecimal(state.receiptTotal, 2), revision: state.revision })}>{t('editReceipt')}</button>
  return <div className="space-y-2">
    <label className="block text-sm">{t('receiptTotal')}<input className={input} value={draft.value} inputMode="decimal" disabled={pending} onChange={e => setDraft({ ...draft, value: e.target.value })} /></label>
    <p className="text-xs text-muted-foreground">{t('receiptHelp')}</p>
    <div className="flex gap-2"><button type="button" className={secondary} disabled={pending} onClick={async () => {
      const amount = parseSplitDecimal(draft.value, 2)
      if (amount === null) { setError(t('invalidInput')); return }
      setPending(true)
      const result = await commit({ type: 'receipt', revision: draft.revision, amount }, createRequestId())
      setPending(false)
      if (result.ok) { setDraft(null); setError('') } else setError(t(result.error))
    }}>{pending ? t('pending') : t('saveReceipt')}</button>
      <button type="button" className={secondary} disabled={pending} onClick={() => { setDraft(null); setError('') }}>{t('cancel')}</button></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>
}
function NewItem({ commit, onDone }: { commit: Commit; onDone: () => void }) {
  const t = useTranslations('teskeid.receiptSplitPreview')
  const [name, setName] = useState('')
  const [explanation, setExplanation] = useState('')
  const [units, setUnits] = useState('1')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  return <fieldset className="space-y-3 rounded-xl border border-border p-4" disabled={pending}>
    <legend className="px-2 font-medium">{t('add')}</legend>
    <p className="text-sm text-muted-foreground">{t('addHelp')}</p>
    <label className="block text-sm">{t('name')}<input className={input} value={name} onChange={e => setName(e.target.value)} /></label>
    <label className="block text-sm">{t('explanation')}<input className={input} value={explanation} onChange={e => setExplanation(e.target.value)} /></label>
    <div className="grid grid-cols-2 gap-3">
      <label className="min-w-0 text-sm">{t('quantity')}<input className={input} value={units} onChange={e => setUnits(e.target.value)} /></label>
      <label className="min-w-0 text-sm">{t('lineAmount')}<input className={input} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></label>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <button type="button" className={primary + ' w-full'} onClick={async () => {
      const quantity = parseQuantityUnits(units); const price = parseSplitDecimal(amount, 2)
      if (quantity === null || price === null) { setError(t('invalidInput')); return }
      setPending(true)
      const result = await commit({ type: 'add', itemId: createRequestId(), name, explanation, units: quantity, amount: price }, createRequestId())
      setPending(false)
      if (result.ok) onDone(); else setError(t(result.error))
    }}>{pending ? t('pending') : t('add')}</button>
  </fieldset>
}
