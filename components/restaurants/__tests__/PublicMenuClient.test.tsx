import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PublicMenuClient } from '../PublicMenuClient'

const mocks = vi.hoisted(() => ({ submit: vi.fn() }))
vi.mock('@/lib/restaurants/actions', () => ({ submitRestaurantMenuItem: mocks.submit }))

const ids = {
  venue: '10000000-0000-4000-8000-000000000001',
  menu: '10000000-0000-4000-8000-000000000002',
  first: '10000000-0000-4000-8000-000000000003',
  second: '10000000-0000-4000-8000-000000000004',
  session: '10000000-0000-4000-8000-000000000005',
  split: '10000000-0000-4000-8000-000000000006',
}
const menu = {
  venue: { id: ids.venue, slug: 'stadur', name: 'Staður', timezone: 'Atlantic/Reykjavik' },
  menu: { id: ids.menu, version: 1, title: 'Matseðill', currency: 'ISK' },
  items: [
    { id: ids.first, name: 'Súpa', description: '', priceMinor: 1900, available: true, modifiers: [] },
    { id: ids.second, name: 'Brauð', description: '', priceMinor: 900, available: true, modifiers: [] },
  ],
}
const copy = { draft: 'Drög', add: 'Bæta við', remove: 'Fjarlægja', quantity: 'Magn', empty: 'Tómt', submit: 'Setja í Splitt', sending: 'Sendi', login: 'Skrá inn', conflict: 'Árekstur', failed: 'Villa' }

describe('PublicMenuClient retry contract', () => {
  beforeEach(() => { sessionStorage.clear(); mocks.submit.mockReset() })

  it('removes confirmed lines and reuses the uncertain line request and revision on retry', async () => {
    mocks.submit.mockResolvedValueOnce({ ok: true, splitVersion: 2 }).mockResolvedValueOnce({ ok: false, error: 'failed' })
    render(<PublicMenuClient menu={menu} tableSessionId={ids.session} splitId={ids.split} splitVersion={1} copy={copy} />)
    for (const button of screen.getAllByRole('button', { name: copy.add })) fireEvent.click(button)
    fireEvent.click(screen.getByRole('button', { name: copy.submit }))

    await screen.findByRole('alert')
    const firstAttempt = mocks.submit.mock.calls[1][0]
    const stored = JSON.parse(sessionStorage.getItem(`teskeid:menu-draft:${ids.venue}:${ids.menu}:1`) ?? '[]')
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({ menuItemId: ids.second, requestId: firstAttempt.requestId, expectedSplitVersion: 2 })

    mocks.submit.mockResolvedValueOnce({ ok: true, splitVersion: 3 })
    fireEvent.click(screen.getByRole('button', { name: copy.submit }))
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(3))
    expect(mocks.submit.mock.calls[2][0]).toMatchObject({ requestId: firstAttempt.requestId, expectedSplitVersion: 2 })
    await waitFor(() => expect(JSON.parse(sessionStorage.getItem(`teskeid:menu-draft:${ids.venue}:${ids.menu}:1`) ?? '[]')).toEqual([]))
  })
})
