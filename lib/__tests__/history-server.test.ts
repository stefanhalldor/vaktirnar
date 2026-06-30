/**
 * Unit tests for getLoanHistory (lib/loans/history.server.ts)
 *
 * Tests the mapping of raw DB rows to LoanHistoryItem[], focusing on
 * loan_role_switched event rendering.
 */

import { describe, it, expect, vi } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase/admin', () => ({
  getAdmin: vi.fn(),
}))

import { getLoanHistory } from '../loans/history.server'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeAdmin(rows: unknown[]) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: rows, error: null }),
  } as unknown as ReturnType<typeof import('@/lib/supabase/admin').getAdmin>
}

function makeTHome(key: string, params?: Record<string, string>): string {
  if (key === 'eventLoanRoleSwitchedToRole')  return `Hlutverki breytt: ${params?.roleName ?? ''}`
  if (key === 'eventLoanRoleSwitched')        return `Hlutverki breytt: ${params?.itemName ?? ''}`
  if (key === 'eventLoanPartyAdded')          return `Aðila bætt við: ${params?.itemName ?? ''}`
  if (key === 'eventLoanInvitationAccepted')  return `Lánaboð samþykkt: ${params?.itemName ?? ''}`
  if (key === 'eventLoanInvitationDeclined')  return `Lánaboði hafnað: ${params?.itemName ?? ''}`
  return key
}

function makeTLoans(key: string, params?: Record<string, string>): string {
  if (key === 'history.roleLender')      return 'Ég lánaði'
  if (key === 'history.roleBorrower')    return 'Ég fékk lánað'
  if (key === 'history.actor')           return `Framkvæmt af ${params?.name ?? ''}`
  if (key === 'history.chatLabel')       return `${params?.name ?? ''}`
  if (key === 'history.chatLabelUnknown') return 'Óþekktur'
  return key
}

function baseRow(overrides: Record<string, unknown>) {
  return {
    event_key:          'key-1',
    event_type:         'loan_role_switched',
    payload:            {},
    occurred_at:        '2026-06-28T12:00:00Z',
    actor_display_name: null,
    row_kind:           'event',
    chat_body:          null,
    chat_message_id:    null,
    ...overrides,
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('getLoanHistory — loan_role_switched', () => {
  it('shows "Hlutverki breytt: Ég lánaði" when newRole is lender', async () => {
    const admin = makeAdmin([
      baseRow({ payload: { itemName: 'Bók', newRole: 'lender' } }),
    ])

    const rows = await getLoanHistory(admin, 'loan-1', 'actor-1', makeTHome, makeTLoans, 'is')

    expect(rows).toHaveLength(1)
    expect(rows[0].label).toBe('Hlutverki breytt: Ég lánaði')
    expect(rows[0].detailLines).toHaveLength(0)
  })

  it('shows "Hlutverki breytt: Ég fékk lánað" when newRole is borrower', async () => {
    const admin = makeAdmin([
      baseRow({ payload: { itemName: 'Bók', newRole: 'borrower' } }),
    ])

    const rows = await getLoanHistory(admin, 'loan-1', 'actor-1', makeTHome, makeTLoans, 'is')

    expect(rows).toHaveLength(1)
    expect(rows[0].label).toBe('Hlutverki breytt: Ég fékk lánað')
    expect(rows[0].detailLines).toHaveLength(0)
  })

  it('falls back to itemName label for old events without newRole', async () => {
    const admin = makeAdmin([
      baseRow({ payload: { itemName: 'Bók' } }),
    ])

    const rows = await getLoanHistory(admin, 'loan-1', 'actor-1', makeTHome, makeTLoans, 'is')

    expect(rows).toHaveLength(1)
    expect(rows[0].label).toBe('Hlutverki breytt: Bók')
  })

  it('renders actor label when actor_display_name is present', async () => {
    const admin = makeAdmin([
      baseRow({
        payload:            { newRole: 'lender' },
        actor_display_name: 'Jón Jónsson',
      }),
    ])

    const rows = await getLoanHistory(admin, 'loan-1', 'actor-1', makeTHome, makeTLoans, 'is')

    expect(rows[0].actorLabel).toBe('Framkvæmt af Jón Jónsson')
  })

  it('returns [] on RPC error', async () => {
    const admin = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'fail' } }),
    } as unknown as ReturnType<typeof import('@/lib/supabase/admin').getAdmin>

    const rows = await getLoanHistory(admin, 'loan-1', 'actor-1', makeTHome, makeTLoans, 'is')

    expect(rows).toEqual([])
  })
})

describe('getLoanHistory — loan_party_added', () => {
  it('shows "Aðila bætt við: {itemName}" label', async () => {
    const admin = makeAdmin([
      baseRow({ event_type: 'loan_party_added', payload: { itemName: 'Bók' } }),
    ])

    const rows = await getLoanHistory(admin, 'loan-1', 'actor-1', makeTHome, makeTLoans, 'is')

    expect(rows).toHaveLength(1)
    expect(rows[0].label).toBe('Aðila bætt við: Bók')
  })

  it('renders actor label when actor_display_name is present', async () => {
    const admin = makeAdmin([
      baseRow({
        event_type:         'loan_party_added',
        payload:            { itemName: 'Bók' },
        actor_display_name: 'Jón Jónsson',
      }),
    ])

    const rows = await getLoanHistory(admin, 'loan-1', 'actor-1', makeTHome, makeTLoans, 'is')

    expect(rows[0].actorLabel).toBe('Framkvæmt af Jón Jónsson')
  })
})

describe('getLoanHistory — loan_invitation_accepted / loan_invitation_declined', () => {
  it('shows "Lánaboð samþykkt" for loan_invitation_accepted', async () => {
    const admin = makeAdmin([
      baseRow({ event_type: 'loan_invitation_accepted', payload: { itemName: 'Reiðhjól' } }),
    ])

    const rows = await getLoanHistory(admin, 'loan-1', 'actor-1', makeTHome, makeTLoans, 'is')

    expect(rows[0].label).toBe('Lánaboð samþykkt: Reiðhjól')
  })

  it('shows "Lánaboði hafnað" for loan_invitation_declined', async () => {
    const admin = makeAdmin([
      baseRow({ event_type: 'loan_invitation_declined', payload: { itemName: 'Reiðhjól' } }),
    ])

    const rows = await getLoanHistory(admin, 'loan-1', 'actor-1', makeTHome, makeTLoans, 'is')

    expect(rows[0].label).toBe('Lánaboði hafnað: Reiðhjól')
  })

  it('renders actor label for loan_invitation_accepted', async () => {
    const admin = makeAdmin([
      baseRow({
        event_type:         'loan_invitation_accepted',
        payload:            { itemName: 'Reiðhjól' },
        actor_display_name: 'Anna Sigríður',
      }),
    ])

    const rows = await getLoanHistory(admin, 'loan-1', 'actor-1', makeTHome, makeTLoans, 'is')

    expect(rows[0].actorLabel).toBe('Framkvæmt af Anna Sigríður')
  })
})
