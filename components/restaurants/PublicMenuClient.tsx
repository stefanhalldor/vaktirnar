'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import type { MenuDraftLine, PublicMenu } from '@/lib/restaurants/contracts'
import { submitRestaurantMenuItem } from '@/lib/restaurants/actions'

type Copy = { draft: string; add: string; remove: string; quantity: string; empty: string; submit: string; sending: string; login: string; conflict: string; failed: string }
const units = 3000

export function PublicMenuClient({ menu, tableSessionId, splitId, splitVersion, copy }: {
  menu: PublicMenu; tableSessionId?: string; splitId?: string; splitVersion?: number; copy: Copy
}) {
  const key = `teskeid:menu-draft:${menu.venue.id}:${menu.menu.id}:${menu.menu.version}`
  const [lines, setLines] = useState<MenuDraftLine[]>([])
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  useEffect(() => {
    try {
      const stored = JSON.parse(sessionStorage.getItem(key) ?? '[]') as Array<Partial<MenuDraftLine>>
      setLines(stored.flatMap(line => typeof line.menuItemId === 'string' && typeof line.name === 'string'
        && typeof line.unitPriceMinor === 'number' && typeof line.quantity === 'number'
        ? [{ ...line, requestId: typeof line.requestId === 'string' ? line.requestId : crypto.randomUUID(),
          menuItemId: line.menuItemId, name: line.name, unitPriceMinor: line.unitPriceMinor,
          quantity: line.quantity, modifiers: Array.isArray(line.modifiers) ? line.modifiers : [],
          serviceNote: typeof line.serviceNote === 'string' ? line.serviceNote : '' }]
        : []))
    } catch { setLines([]) }
  }, [key])
  useEffect(() => { sessionStorage.setItem(key, JSON.stringify(lines)) }, [key, lines])
  const total = useMemo(() => lines.reduce((sum, line) => sum + line.unitPriceMinor * line.quantity, 0), [lines])
  const money = (minor: number) => new Intl.NumberFormat('is-IS', { style: 'currency', currency: menu.menu.currency, maximumFractionDigits: menu.menu.currency === 'ISK' ? 0 : 2 }).format(minor / (menu.menu.currency === 'ISK' ? 1 : 100))
  function add(item: PublicMenu['items'][number]) {
    setLines(current => {
      const found = current.find(line => line.menuItemId === item.id)
      return found ? current.map(line => line.menuItemId === item.id ? { ...line, quantity: line.quantity + 1 } : line)
        : [...current, { requestId: crypto.randomUUID(), menuItemId: item.id, name: item.name, unitPriceMinor: item.priceMinor, quantity: 1, modifiers: [], serviceNote: '' }]
    })
  }
  function send() {
    if (!tableSessionId || !splitId || !splitVersion) { setError(copy.login); return }
    setError('')
    startTransition(async () => {
      let version = splitVersion
      let remaining = [...lines]
      for (const line of lines) {
        const expectedSplitVersion = line.expectedSplitVersion ?? version
        remaining = remaining.map(value => value.requestId === line.requestId
          ? { ...value, expectedSplitVersion }
          : value)
        setLines(remaining)
        sessionStorage.setItem(key, JSON.stringify(remaining))
        const result = await submitRestaurantMenuItem({ requestId: line.requestId, tableSessionId, splitId,
          expectedSplitVersion, menuItemId: line.menuItemId, quantity: line.quantity,
          modifiers: line.modifiers, serviceNote: line.serviceNote })
        if (!result.ok) { setError(result.error === 'conflict' ? copy.conflict : result.error === 'login' ? copy.login : copy.failed); return }
        version = result.splitVersion ?? version + 1
        remaining = remaining.filter(value => value.requestId !== line.requestId)
        setLines(remaining)
        sessionStorage.setItem(key, JSON.stringify(remaining))
      }
    })
  }
  return <div className="mx-auto w-full max-w-2xl px-4 pb-28 pt-6 sm:px-6">
    <header className="mb-6"><p className="text-sm text-muted-foreground">{menu.venue.name}</p><h1 className="text-2xl font-semibold">{menu.menu.title}</h1></header>
    <section className="space-y-3">{menu.items.map(item => <article key={item.id} className="rounded-xl border border-black/10 bg-background p-4">
      <div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><h2 className="font-medium">{item.name}</h2>{item.description && <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>}<p className="mt-2 text-sm font-medium">{money(item.priceMinor)}</p></div>
      <button type="button" disabled={!item.available} onClick={() => add(item)} className="min-h-10 shrink-0 rounded-lg border px-3 text-sm font-medium disabled:opacity-40">{copy.add}</button></div>
    </article>)}</section>
    <section className="mt-8 border-t pt-5"><h2 className="text-lg font-semibold">{copy.draft}</h2>{lines.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{copy.empty}</p> : <div className="mt-3 space-y-3">{lines.map(line => <div key={line.menuItemId} className="flex items-center gap-3">
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{line.name}</p><label className="mt-1 flex items-center gap-2 text-sm">{copy.quantity}<input aria-label={`${copy.quantity}: ${line.name}`} className="h-10 w-20 rounded-lg border px-2 text-base" min={1} max={1000} type="number" value={line.quantity} onChange={e => setLines(current => current.map(value => value.menuItemId === line.menuItemId ? { ...value, quantity: Math.max(1, Number(e.target.value) || 1) } : value))}/></label></div>
      <button type="button" className="min-h-10 rounded-lg px-3 text-sm" onClick={() => setLines(current => current.filter(value => value.menuItemId !== line.menuItemId))}>{copy.remove}</button></div>)}</div>}
      {lines.length > 0 && <div className="mt-5 flex items-center justify-between gap-4"><strong>{money(total)}</strong><button type="button" disabled={pending} onClick={send} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">{pending ? copy.sending : copy.submit}</button></div>}
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    </section>
  </div>
}
