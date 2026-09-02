import React from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import enMessages from '@/messages/en.json'
import isMessages from '@/messages/is.json'

const mocks = vi.hoisted(() => ({
  guardExpenseAccess: vi.fn(),
}))

const translations: Record<string, string> = {
  'guide.title': 'Leiðbeiningar',
  'guide.intro': 'Kostnaður fer í gegnum skýr skref frá drögum að uppgjöri.',
  'guide.lifecycleTitle': 'Frá drögum í uppgjör',
  'guide.lifecycle.draft.title': '1. Drög',
  'guide.lifecycle.draft.body': 'Drög hafa ekki áhrif á stöðu eða uppgjör.',
  'guide.lifecycle.draft.private': 'Drög fyrir mig',
  'guide.lifecycle.draft.shared': 'Drög með öðrum · valfrjálst',
  'guide.lifecycle.confirmed.title': '2. Staðfestur kostnaður',
  'guide.lifecycle.confirmed.body': 'Staðfesting gerir kostnaðinn virkan.',
  'guide.lifecycle.confirmed.editBody': 'Ef kostnaðinum er breytt fer hann aftur í drög þar til ný skipting er staðfest.',
  'guide.lifecycle.settlement.title': '3. Uppgjör',
  'guide.lifecycle.settlement.body': 'Aðeins staðfestur kostnaður án opinna breytinga fer í uppgjör.',
  'guide.lifecycle.done.title': '4. Lokið',
  'guide.lifecycle.done.body': 'Kostnaðurinn er uppgerður þegar greiðslur hafa verið staðfestar.',
  'guide.editTitle': 'Þegar staðfestum kostnaði er breytt',
  'guide.privateDraft.title': 'Drög fyrir mig',
  'guide.privateDraft.body': 'Aðeins þú sérð breytingarnar.',
  'guide.sharedDraft.title': 'Drög með öðrum',
  'guide.sharedDraft.body': 'Deildu breytingum svo aðrir sjái nýjustu tillöguna.',
  'guide.editWhileOpen': 'Síðasta staðfesta staðan gildir áfram, en þessi kostnaður bíður með uppgjör.',
  'guide.exitTitle': 'Tvær leiðir út úr breytingum',
  'guide.discard.title': 'Hætta við breytingar',
  'guide.discard.body': 'Gamla staðfesta útgáfan stendur.',
  'guide.save.title': 'Vista breytingar',
  'guide.save.body': 'Nýja staðfesta útgáfan tekur við.',
  'guide.otherExpenses': 'Aðrir staðfestir kostnaðir geta áfram farið í uppgjör.',
  'guide.betaTitle': 'Takmörkun í lokaðri prufu',
  'guide.betaBody': 'Sumir eldri kostnaðir sem tengjast greiðslusögu geta ekki farið aftur í drög.',
  homeLabel: 'Heim',
  back: 'Til baka',
}

vi.mock('@/lib/expenses/guard', () => ({ guardExpenseAccess: mocks.guardExpenseAccess }))
vi.mock('@/components/expenses/i18n.server', () => ({
  getExpenseTranslations: vi.fn().mockResolvedValue((key: string) => translations[key] ?? key),
}))
vi.mock('@/components/expenses/ExpenseShell', () => ({
  ExpenseShell: ({ title, backHref, children }: {
    title: string
    backHref: string
    children: React.ReactNode
  }) => <main><h1>{title}</h1><a href={backHref}>Til baka</a>{children}</main>,
}))
vi.mock('@/components/expenses/ExpenseRouteLoading', () => ({
  ExpenseRouteLoading: () => <div role="status">Hleð leiðbeiningum</div>,
}))

import ExpenseGuidePage from '../leidbeiningar/page'
import LoadingExpenseGuide from '../leidbeiningar/loading'

function nestedKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix]
  return Object.entries(value).flatMap(([key, child]) => (
    nestedKeys(child, prefix ? `${prefix}.${key}` : key)
  ))
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.guardExpenseAccess.mockResolvedValue({ user: { id: 'actor-1' } })
})

describe('Expense lifecycle guide route', () => {
  it('is access-guarded and explains the complete lifecycle in semantic order', async () => {
    render(await ExpenseGuidePage())

    expect(mocks.guardExpenseAccess).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('heading', { level: 1, name: 'Leiðbeiningar' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Frá drögum í uppgjör' })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(4)
    expect(screen.getByText('1. Drög')).toBeInTheDocument()
    expect(screen.getByText('2. Staðfestur kostnaður')).toBeInTheDocument()
    expect(screen.getByText('3. Uppgjör')).toBeInTheDocument()
    expect(screen.getByText('4. Lokið')).toBeInTheDocument()
    expect(screen.getByText(/Aðeins staðfestur kostnaður án opinna breytinga/)).toBeInTheDocument()
  })

  it('keeps private/shared modes inside one draft stage and avoids a duplicated edit section', async () => {
    const { container } = render(await ExpenseGuidePage())

    expect(screen.getByText('Drög fyrir mig')).toBeInTheDocument()
    expect(screen.getByText('Drög með öðrum · valfrjálst')).toBeInTheDocument()
    expect(screen.getByText(/Ef kostnaðinum er breytt fer hann aftur í drög/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Þegar staðfestum kostnaði er breytt' })).not.toBeInTheDocument()
    expect(screen.getByText('Hætta við breytingar')).toBeInTheDocument()
    expect(screen.getByText('Vista breytingar')).toBeInTheDocument()
    expect(screen.getByText('Takmörkun í lokaðri prufu')).toBeInTheDocument()
    expect(container).not.toHaveTextContent(/binding|publication|revision identity|financial version|SQL/i)
  })

  it('keeps the Icelandic and English guide copy complete and in locale parity', () => {
    const isGuide = isMessages.teskeid.expenses.guide
    const enGuide = enMessages.teskeid.expenses.guide

    expect(nestedKeys(isGuide).sort()).toEqual(nestedKeys(enGuide).sort())
    expect(JSON.stringify(isGuide)).not.toMatch(/binding|publication|revision identity|financial version|SQL/i)
    expect(JSON.stringify(enGuide)).not.toMatch(/binding|publication|revision identity|financial version|SQL/i)
  })

  it('uses the canonical expense loader while the guide route is opening', () => {
    render(<LoadingExpenseGuide />)

    expect(screen.getByRole('status')).toHaveTextContent('Hleð leiðbeiningum')
  })
})
