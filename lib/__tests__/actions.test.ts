/**
 * Orchestration unit tests for lib/loans/actions.ts
 *
 * Tests performInvitationSend behaviour (via sendInvitationEmail) by mocking
 * the Supabase admin client, guardLoanAccess, and sendLoanInvitationEmail.
 *
 * Focus: correct mapping of DB return values to emailStatus.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }))
const { mockSendEmail } = vi.hoisted(() => ({ mockSendEmail: vi.fn() }))
const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))
const { mockGetUserByEmail } = vi.hoisted(() => ({ mockGetUserByEmail: vi.fn() }))
const { mockRecordEvent } = vi.hoisted(() => ({ mockRecordEvent: vi.fn() }))
const { mockAckRecentEventByKey } = vi.hoisted(() => ({ mockAckRecentEventByKey: vi.fn() }))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/loans/guard', () => ({
  guardLoanAccess: vi.fn().mockResolvedValue({ user: { id: 'actor-uuid' } }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  getAdmin: vi.fn(() => ({
    rpc: mockRpc,
    from: mockFrom,
    auth: { admin: { getUserByEmail: mockGetUserByEmail } },
  })),
}))

vi.mock('@/lib/recent-events/helpers.server', () => ({
  recordRecentEvent: mockRecordEvent,
  ackRecentEventByKey: mockAckRecentEventByKey,
}))

vi.mock('@/lib/loans/email', () => ({
  sendLoanInvitationEmail: mockSendEmail,
}))

import { sendInvitationEmail, createLoan, addLoanInvitation, updateLoanItemDetails, updateLoan, claimInvitation, declineInvitation, markReturned, undoReturn, deleteLoan } from '@/lib/loans/actions'
import { guardLoanAccess } from '@/lib/loans/guard'

// ── Helpers ──────────────────────────────────────────────────────────────────

const INV_ID = 'inv-uuid-9999'

function reserveOk(attemptNumber = 1) {
  return {
    data: [{
      attempt_number: attemptNumber,
      can_send: true,
      reason: 'ok',
      recipient_email: 'recipient@example.com',
    }],
    error: null,
  }
}

function reserveBlocked(reason: string) {
  return {
    data: [{ attempt_number: 0, can_send: false, reason, recipient_email: null }],
    error: null,
  }
}

function updateOk() {
  return { data: 'ok', error: null }
}

function updateResult(value: string) {
  return { data: value, error: null }
}

function updateTransportError() {
  return { data: null, error: { code: 'PGRST301', message: 'Transport error' } }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('sendInvitationEmail orchestration', () => {
  function setupMockFrom(role: 'borrower' | 'lender' = 'borrower') {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              recipient_role: role,
              item_name_snapshot: 'Test item',
              creator_display_name_snapshot: 'Test user',
              email_template_version: 'v2',
            },
            error: null,
          }),
        }),
      }),
    }))
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockSendEmail.mockResolvedValue('sent')
    mockRecordEvent.mockResolvedValue(undefined)
    // Default: recipient not registered — no event recorded
    mockGetUserByEmail.mockResolvedValue({ data: { user: null }, error: null })
    setupMockFrom()
  })

  it('returns ok with emailStatus "sent" on full happy path', async () => {
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'reserve_invitation_send') return reserveOk()
      if (name === 'update_invitation_delivery') return updateOk()
      return { data: null, error: null }
    })

    const result = await sendInvitationEmail(INV_ID)

    expect(result).toEqual({ ok: true, emailStatus: 'sent' })
  })

  it('returns uncertain when reserve returns "expired"', async () => {
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'reserve_invitation_send') return reserveBlocked('expired')
      return { data: null, error: null }
    })

    const result = await sendInvitationEmail(INV_ID)

    expect(result).toEqual({ ok: false, error: 'send_uncertain' })
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('returns ok with emailStatus "sent" when reserve reports already_sent', async () => {
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'reserve_invitation_send') return reserveBlocked('already_sent')
      return { data: null, error: null }
    })

    const result = await sendInvitationEmail(INV_ID)

    // already_sent means Resend previously confirmed delivery — this is a success
    expect(result).toEqual({ ok: true, emailStatus: 'sent' })
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('returns uncertain when reserve returns "rate_limited"', async () => {
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'reserve_invitation_send') return reserveBlocked('rate_limited')
      return { data: null, error: null }
    })

    const result = await sendInvitationEmail(INV_ID)

    expect(result).toEqual({ ok: false, error: 'send_uncertain' })
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('returns uncertain when delivery update returns "stale_attempt"', async () => {
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'reserve_invitation_send') return reserveOk()
      if (name === 'update_invitation_delivery') return updateResult('stale_attempt')
      return { data: null, error: null }
    })

    const result = await sendInvitationEmail(INV_ID)

    // Resend confirmed 'sent' but the DB could not record it
    expect(result).toEqual({ ok: false, error: 'send_uncertain' })
  })

  it('returns uncertain when delivery update returns "not_found"', async () => {
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'reserve_invitation_send') return reserveOk()
      if (name === 'update_invitation_delivery') return updateResult('not_found')
      return { data: null, error: null }
    })

    const result = await sendInvitationEmail(INV_ID)

    expect(result).toEqual({ ok: false, error: 'send_uncertain' })
  })

  it('returns uncertain when delivery update has a transport error', async () => {
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'reserve_invitation_send') return reserveOk()
      if (name === 'update_invitation_delivery') return updateTransportError()
      return { data: null, error: null }
    })

    const result = await sendInvitationEmail(INV_ID)

    expect(result).toEqual({ ok: false, error: 'send_uncertain' })
  })

  it('returns send_failed when Resend definitively rejects (email.ts returns "failed")', async () => {
    mockSendEmail.mockResolvedValue('failed')
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'reserve_invitation_send') return reserveOk()
      if (name === 'update_invitation_delivery') return updateOk()
      return { data: null, error: null }
    })

    const result = await sendInvitationEmail(INV_ID)

    expect(result).toEqual({ ok: false, error: 'send_failed' })
  })

  it('returns uncertain when Resend is uncertain (email.ts returns "uncertain")', async () => {
    mockSendEmail.mockResolvedValue('uncertain')
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'reserve_invitation_send') return reserveOk()
      return { data: null, error: null }
    })

    const result = await sendInvitationEmail(INV_ID)

    // update_invitation_delivery should NOT be called for uncertain sends
    const updateCalls = mockRpc.mock.calls.filter(
      (c: string[]) => c[0] === 'update_invitation_delivery',
    )
    expect(updateCalls).toHaveLength(0)
    expect(result).toEqual({ ok: false, error: 'send_uncertain' })
  })

  it('calls update_invitation_delivery with the attempt_number from reserve', async () => {
    const ATTEMPT = 2
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'reserve_invitation_send') return reserveOk(ATTEMPT)
      if (name === 'update_invitation_delivery') return updateOk()
      return { data: null, error: null }
    })

    await sendInvitationEmail(INV_ID)

    const updateCall = mockRpc.mock.calls.find(
      (c: string[]) => c[0] === 'update_invitation_delivery',
    )
    expect(updateCall).toBeDefined()
    expect(updateCall![1]).toMatchObject({
      p_attempt_number: ATTEMPT,
      p_status: 'sent',
    })
  })
})

// ── Preflight-first guard — explicit scenarios ────────────────────────────────

describe('sendInvitationEmail — preflight guard scenarios', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendEmail.mockResolvedValue('sent')
  })

  it('missing-column error → reserve_invitation_send never called', async () => {
    // Simulate pre-sql/36: column missing → query throws
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockRejectedValue(new Error('column "email_template_version" does not exist')),
        }),
      }),
    }))

    const result = await sendInvitationEmail(INV_ID)

    const reserveCalls = mockRpc.mock.calls.filter((c: string[]) => c[0] === 'reserve_invitation_send')
    expect(reserveCalls).toHaveLength(0)
    expect(mockSendEmail).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: false, error: 'send_uncertain' })
  })

  it('preflight success + fresh reservation → v2 email sent with immutable context', async () => {
    // Both admin.from() calls (preflight + post-reserve read) return the same data
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { recipient_role: 'lender', item_name_snapshot: 'Bók', creator_display_name_snapshot: 'Gunnar', email_template_version: 'v2' },
            error: null,
          }),
        }),
      }),
    }))
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'reserve_invitation_send') return {
        data: [{ attempt_number: 1, can_send: true, reason: 'ok', recipient_email: 'r@example.com' }],
        error: null,
      }
      if (name === 'update_invitation_delivery') return { data: 'ok', error: null }
      return { data: null, error: null }
    })

    const result = await sendInvitationEmail(INV_ID)

    expect(result).toEqual({ ok: true, emailStatus: 'sent' })
    expect(mockSendEmail).toHaveBeenCalledWith(
      'r@example.com',
      INV_ID,
      1,
      { recipientRole: 'lender', templateVersion: 'v2', itemName: 'Bók', creatorDisplayName: 'Gunnar' },
    )
  })

  it('existing reserved NULL version → reserve returns unknown_version → no email', async () => {
    // Preflight: columns exist, email_template_version = null (pre-sql/36 reserved attempt)
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { recipient_role: 'borrower', item_name_snapshot: null, creator_display_name_snapshot: null, email_template_version: null },
            error: null,
          }),
        }),
      }),
    }))
    // reserve blocks NULL version with unknown_version
    mockRpc.mockResolvedValue({
      data: [{ attempt_number: 0, can_send: false, reason: 'unknown_version', recipient_email: null }],
      error: null,
    })

    const result = await sendInvitationEmail(INV_ID)

    expect(mockSendEmail).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: false, error: 'send_uncertain' })
  })

  it('existing reserved v2 → same payload as fresh reservation', async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { recipient_role: 'borrower', item_name_snapshot: 'Reiðhjól', creator_display_name_snapshot: 'Anna', email_template_version: 'v2' },
            error: null,
          }),
        }),
      }),
    }))
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'reserve_invitation_send') return {
        // attempt_number same as a previous reservation — retry
        data: [{ attempt_number: 1, can_send: true, reason: 'ok', recipient_email: 'r@example.com' }],
        error: null,
      }
      if (name === 'update_invitation_delivery') return { data: 'ok', error: null }
      return { data: null, error: null }
    })

    const result = await sendInvitationEmail(INV_ID)

    expect(result).toEqual({ ok: true, emailStatus: 'sent' })
    expect(mockSendEmail).toHaveBeenCalledWith(
      'r@example.com',
      INV_ID,
      1,
      { recipientRole: 'borrower', templateVersion: 'v2', itemName: 'Reiðhjól', creatorDisplayName: 'Anna' },
    )
  })
})

// ── email_template_version validation ────────────────────────────────────────
//
// performInvitationSend reads email_template_version from DB and validates it
// before building EmailContext. NULL (pre-sql/36) and unknown versions must
// block the send and return uncertain — never fall through to a mismatched template.

describe('sendInvitationEmail — email_template_version validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendEmail.mockResolvedValue('sent')
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'reserve_invitation_send') return reserveOk()
      if (name === 'update_invitation_delivery') return updateOk()
      return { data: null, error: null }
    })
  })

  it('does not call sendLoanInvitationEmail when email_template_version is null', async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { recipient_role: 'borrower', item_name_snapshot: null, creator_display_name_snapshot: null, email_template_version: null },
            error: null,
          }),
        }),
      }),
    }))

    const result = await sendInvitationEmail(INV_ID)

    expect(mockSendEmail).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: false, error: 'send_uncertain' })
  })

  it('does not call sendLoanInvitationEmail when email_template_version is unknown', async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { recipient_role: 'borrower', item_name_snapshot: null, creator_display_name_snapshot: null, email_template_version: 'v99' },
            error: null,
          }),
        }),
      }),
    }))

    const result = await sendInvitationEmail(INV_ID)

    expect(mockSendEmail).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: false, error: 'send_uncertain' })
  })
})

// ── Feature flag — no RPC when guard redirects ────────────────────────────────

describe('sendInvitationEmail — feature flag guard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not call any RPC when guard redirects (LOANS_ENABLED off)', async () => {
    // Simulate guardLoanAccess throwing as redirect() does in Next.js
    vi.mocked(guardLoanAccess).mockRejectedValueOnce(new Error('NEXT_REDIRECT:/'))

    await expect(sendInvitationEmail(INV_ID)).rejects.toThrow('NEXT_REDIRECT:/')
    expect(mockRpc).not.toHaveBeenCalled()
  })
})

// ── Preflight guard (context-query before reserve) ───────────────────────────
//
// performInvitationSend runs a preflight SELECT on loan_invitations BEFORE
// calling reserve_invitation_send. If the preflight fails (columns missing or
// query error), the function returns uncertain and reserve is NEVER called —
// no DB mutation occurs. This prevents reserved attempts with NULL
// email_template_version, which would be permanently stuck as unknown_version
// after sql/36 is deployed.

describe('sendInvitationEmail — context-query idempotency guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendEmail.mockResolvedValue('sent')
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'reserve_invitation_send') return reserveOk()
      if (name === 'update_invitation_delivery') return updateOk()
      return { data: null, error: null }
    })
  })

  it('does not call sendLoanInvitationEmail or reserve when preflight returns an error', async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST116', message: 'Not found' },
          }),
        }),
      }),
    }))

    const result = await sendInvitationEmail(INV_ID)

    expect(mockRpc).not.toHaveBeenCalled()
    expect(mockSendEmail).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: false, error: 'send_uncertain' })
  })

  it('does not call sendLoanInvitationEmail or reserve when preflight throws (columns missing)', async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockRejectedValue(new Error('column missing')),
        }),
      }),
    }))

    const result = await sendInvitationEmail(INV_ID)

    expect(mockRpc).not.toHaveBeenCalled()
    expect(mockSendEmail).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: false, error: 'send_uncertain' })
  })

  it('passes role context to sendLoanInvitationEmail when context query succeeds', async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { recipient_role: 'lender', item_name_snapshot: 'Test item', creator_display_name_snapshot: 'Test user', email_template_version: 'v2' }, error: null }),
        }),
      }),
    }))

    await sendInvitationEmail(INV_ID)

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.any(String),
      INV_ID,
      1,
      { recipientRole: 'lender', templateVersion: 'v2', itemName: 'Test item', creatorDisplayName: 'Test user' },
    )
  })

  it('retry after preflight error sends exactly once with role context on success', async () => {
    // First call: preflight fails → uncertain, reserve NOT called, no DB mutation
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST116', message: 'Not found' },
          }),
        }),
      }),
    }))

    const first = await sendInvitationEmail(INV_ID)
    expect(first).toEqual({ ok: false, error: 'send_uncertain' })
    expect(mockRpc).not.toHaveBeenCalled()
    expect(mockSendEmail).not.toHaveBeenCalled()

    // Second call: context query succeeds with same reserved attempt → email sent once
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { recipient_role: 'borrower', item_name_snapshot: 'Test item', creator_display_name_snapshot: 'Test user', email_template_version: 'v2' }, error: null }),
        }),
      }),
    }))

    const second = await sendInvitationEmail(INV_ID)
    expect(second).toEqual({ ok: true, emailStatus: 'sent' })
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.any(String),
      INV_ID,
      1,
      { recipientRole: 'borrower', templateVersion: 'v2', itemName: 'Test item', creatorDisplayName: 'Test user' },
    )
  })
})

// ── createLoan — no recipient email ──────────────────────────────────────────

describe('createLoan — no recipient email', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendEmail.mockResolvedValue('sent')
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { recipient_role: 'borrower', item_name_snapshot: null, creator_display_name_snapshot: null, email_template_version: 'v2' },
            error: null,
          }),
        }),
      }),
    }))
  })

  it('returns ok with no emailStatus when no invitation_id returned', async () => {
    mockRpc.mockResolvedValue({
      data: [{ loan_id: 'loan-uuid-1', invitation_id: null }],
      error: null,
    })

    const result = await createLoan({
      item_name: 'Bók',
      creator_role: 'lender',
      loaned_at: '2026-01-01',
      request_id: '00000000-0000-0000-0000-000000000001',
    })

    expect(result).toEqual({ ok: true, emailStatus: undefined })
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('does not call reserve_invitation_send when invitation_id is null', async () => {
    mockRpc.mockResolvedValue({
      data: [{ loan_id: 'loan-uuid-1', invitation_id: null }],
      error: null,
    })

    await createLoan({
      item_name: 'Bók',
      creator_role: 'lender',
      loaned_at: '2026-01-01',
      request_id: '00000000-0000-0000-0000-000000000001',
    })

    const reserveCalls = mockRpc.mock.calls.filter(
      (c: string[]) => c[0] === 'reserve_invitation_send',
    )
    expect(reserveCalls).toHaveLength(0)
  })
})

// ── addLoanInvitation orchestration ──────────────────────────────────────────

const LOAN_ID = 'loan-uuid-8888'
const ADD_INV_ID = 'inv-uuid-add-1'

describe('addLoanInvitation orchestration', () => {
  function setupMockFromForAdd() {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              recipient_role: 'borrower',
              item_name_snapshot: 'Reiðhjól',
              creator_display_name_snapshot: 'Jón',
              email_template_version: 'v2',
            },
            error: null,
          }),
        }),
      }),
    }))
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockSendEmail.mockResolvedValue('sent')
    setupMockFromForAdd()
  })

  it('returns ok with emailStatus "sent" on full happy path', async () => {
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'add_loan_invitation') return { data: [{ invitation_id: ADD_INV_ID }], error: null }
      if (name === 'reserve_invitation_send') return {
        data: [{ attempt_number: 1, can_send: true, reason: 'ok', recipient_email: 'r@example.com' }],
        error: null,
      }
      if (name === 'update_invitation_delivery') return { data: 'ok', error: null }
      return { data: null, error: null }
    })

    const result = await addLoanInvitation(LOAN_ID, { recipient_email: 'recipient@example.com' })

    expect(result).toEqual({ ok: true, emailStatus: 'sent' })
    expect(mockSendEmail).toHaveBeenCalledWith(
      'r@example.com',
      ADD_INV_ID,
      1,
      { recipientRole: 'borrower', templateVersion: 'v2', itemName: 'Reiðhjól', creatorDisplayName: 'Jón' },
    )
  })

  it('returns invalid_input for malformed email', async () => {
    const result = await addLoanInvitation(LOAN_ID, { recipient_email: 'not-an-email' })
    expect(result).toEqual({ ok: false, error: 'invalid_input' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns already_has_invitation when RPC raises that exception', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'already_has_invitation' },
    })

    const result = await addLoanInvitation(LOAN_ID, { recipient_email: 'r@example.com' })

    expect(result).toEqual({ ok: false, error: 'already_has_invitation' })
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('returns already_has_party when RPC raises that exception', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'already_has_party' },
    })

    const result = await addLoanInvitation(LOAN_ID, { recipient_email: 'r@example.com' })

    expect(result).toEqual({ ok: false, error: 'already_has_party' })
  })

  it('returns ok with emailStatus "uncertain" when send is uncertain', async () => {
    mockSendEmail.mockResolvedValue('uncertain')
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'add_loan_invitation') return { data: [{ invitation_id: ADD_INV_ID }], error: null }
      if (name === 'reserve_invitation_send') return {
        data: [{ attempt_number: 1, can_send: true, reason: 'ok', recipient_email: 'r@example.com' }],
        error: null,
      }
      return { data: null, error: null }
    })

    const result = await addLoanInvitation(LOAN_ID, { recipient_email: 'r@example.com' })

    expect(result).toEqual({ ok: true, emailStatus: 'uncertain' })
  })

  it('concurrent double-submit: both calls use identical arguments to sendLoanInvitationEmail', async () => {
    // Both calls land the same add_loan_invitation (idempotent) and same reserved attempt
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'add_loan_invitation') return { data: [{ invitation_id: ADD_INV_ID }], error: null }
      if (name === 'reserve_invitation_send') return {
        data: [{ attempt_number: 1, can_send: true, reason: 'ok', recipient_email: 'r@example.com' }],
        error: null,
      }
      if (name === 'update_invitation_delivery') return { data: 'ok', error: null }
      return { data: null, error: null }
    })

    await Promise.all([
      addLoanInvitation(LOAN_ID, { recipient_email: 'r@example.com' }),
      addLoanInvitation(LOAN_ID, { recipient_email: 'r@example.com' }),
    ])

    // Both concurrent calls must invoke sendLoanInvitationEmail with identical args.
    // Same args → same idempotency key → Resend concurrent_idempotent_requests → no double-send.
    expect(mockSendEmail).toHaveBeenCalledTimes(2)
    const expectedArgs = [
      'r@example.com',
      ADD_INV_ID,
      1,
      { recipientRole: 'borrower', templateVersion: 'v2', itemName: 'Reiðhjól', creatorDisplayName: 'Jón' },
    ]
    expect(mockSendEmail.mock.calls[0]).toEqual(expectedArgs)
    expect(mockSendEmail.mock.calls[1]).toEqual(expectedArgs)
  })
})

// ── v3 reservation scenarios ──────────────────────────────────────────────────

describe('sendInvitationEmail — v3 reservation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendEmail.mockResolvedValue('sent')
  })

  it('email_template_version = v3 → sendLoanInvitationEmail called with templateVersion v3', async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { recipient_role: 'borrower', item_name_snapshot: 'Bók', creator_display_name_snapshot: 'Anna', email_template_version: 'v3' },
            error: null,
          }),
        }),
      }),
    }))
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'reserve_invitation_send') return {
        data: [{ attempt_number: 1, can_send: true, reason: 'ok', recipient_email: 'r@example.com' }],
        error: null,
      }
      if (name === 'update_invitation_delivery') return { data: 'ok', error: null }
      return { data: null, error: null }
    })

    await sendInvitationEmail(INV_ID)

    expect(mockSendEmail).toHaveBeenCalledWith(
      'r@example.com',
      INV_ID,
      1,
      { recipientRole: 'borrower', templateVersion: 'v3', itemName: 'Bók', creatorDisplayName: 'Anna' },
    )
  })

  it('reserved v2 attempt → sendLoanInvitationEmail called with templateVersion v2 (unaffected by sql/37)', async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { recipient_role: 'lender', item_name_snapshot: 'Reiðhjól', creator_display_name_snapshot: 'Jón', email_template_version: 'v2' },
            error: null,
          }),
        }),
      }),
    }))
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'reserve_invitation_send') return {
        data: [{ attempt_number: 1, can_send: true, reason: 'ok', recipient_email: 'r@example.com' }],
        error: null,
      }
      if (name === 'update_invitation_delivery') return { data: 'ok', error: null }
      return { data: null, error: null }
    })

    await sendInvitationEmail(INV_ID)

    expect(mockSendEmail).toHaveBeenCalledWith(
      'r@example.com',
      INV_ID,
      1,
      { recipientRole: 'lender', templateVersion: 'v2', itemName: 'Reiðhjól', creatorDisplayName: 'Jón' },
    )
  })
})

// ── updateLoanItemDetails orchestration ──────────────────────────────────────

const ITEM_LOAN_ID = 'loan-uuid-item-1'

describe('updateLoanItemDetails orchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns ok on happy path', async () => {
    mockRpc.mockResolvedValue({ data: [{ status: 'ok', before_item_name: 'Bók', before_note: null, counterpart_user_id: null }], error: null })

    const result = await updateLoanItemDetails(ITEM_LOAN_ID, { item_name: 'Bók', note: null })

    expect(result).toEqual({ ok: true })
    const call = mockRpc.mock.calls.find((c: string[]) => c[0] === 'update_loan_item_details_with_diff')
    expect(call).toBeDefined()
    expect(call![1]).toMatchObject({
      p_loan_id:   ITEM_LOAN_ID,
      p_item_name: 'Bók',
      p_note:      null,
    })
  })

  it('returns invalid_input for empty item_name (fails schema)', async () => {
    const result = await updateLoanItemDetails(ITEM_LOAN_ID, { item_name: '' })
    expect(result).toEqual({ ok: false, error: 'invalid_input' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns not_found when RPC returns "not_found"', async () => {
    mockRpc.mockResolvedValue({ data: [{ status: 'not_found', before_item_name: null, before_note: null, counterpart_user_id: null }], error: null })
    const result = await updateLoanItemDetails(ITEM_LOAN_ID, { item_name: 'Bók' })
    expect(result).toEqual({ ok: false, error: 'not_found' })
  })

  it('returns invalid_input when RPC returns "invalid_item_name"', async () => {
    mockRpc.mockResolvedValue({ data: [{ status: 'invalid_item_name', before_item_name: null, before_note: null, counterpart_user_id: null }], error: null })
    const result = await updateLoanItemDetails(ITEM_LOAN_ID, { item_name: 'Bók' })
    expect(result).toEqual({ ok: false, error: 'invalid_input' })
  })

  it('returns invalid_input when RPC returns "invalid_note"', async () => {
    mockRpc.mockResolvedValue({ data: [{ status: 'invalid_note', before_item_name: null, before_note: null, counterpart_user_id: null }], error: null })
    const result = await updateLoanItemDetails(ITEM_LOAN_ID, { item_name: 'Bók' })
    expect(result).toEqual({ ok: false, error: 'invalid_input' })
  })

  it('returns save_failed on RPC transport error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST301', message: 'Transport error' } })
    const result = await updateLoanItemDetails(ITEM_LOAN_ID, { item_name: 'Bók' })
    expect(result).toEqual({ ok: false, error: 'save_failed' })
  })
})

// ── Revalidation — both loan paths revalidated ───────────────────────────────

import { revalidatePath } from 'next/cache'

describe('revalidation — createLoan revalidates both paths', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { recipient_role: 'borrower', item_name_snapshot: null, creator_display_name_snapshot: null, email_template_version: 'v2' },
            error: null,
          }),
        }),
      }),
    }))
  })

  it('createLoan revalidates /auth-mvp/lanad-og-skilad and /auth-mvp/heim', async () => {
    mockRpc.mockResolvedValue({
      data: [{ loan_id: 'loan-uuid-1', invitation_id: null }],
      error: null,
    })

    await createLoan({
      item_name: 'Revalidation test',
      creator_role: 'lender',
      loaned_at: '2026-01-01',
      request_id: '00000000-0000-0000-0000-000000000001',
    })

    const calls = vi.mocked(revalidatePath).mock.calls.map((c) => c[0])
    expect(calls).toContain('/auth-mvp/lanad-og-skilad')
    expect(calls).toContain('/auth-mvp/heim')
  })

  it('updateLoanItemDetails revalidates /auth-mvp/lanad-og-skilad and /auth-mvp/heim', async () => {
    mockRpc.mockResolvedValue({ data: [{ status: 'ok', before_item_name: 'Bók', before_note: null, counterpart_user_id: null }], error: null })

    await updateLoanItemDetails(ITEM_LOAN_ID, { item_name: 'Bók' })

    const calls = vi.mocked(revalidatePath).mock.calls.map((c) => c[0])
    expect(calls).toContain('/auth-mvp/lanad-og-skilad')
    expect(calls).toContain('/auth-mvp/heim')
  })
})

// ── loan_invitation_received event emission ───────────────────────────────────

describe('sendInvitationEmail — loan_invitation_received event', () => {
  function setupMockFrom(role: 'borrower' | 'lender' = 'borrower') {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              recipient_role: role,
              item_name_snapshot: 'Borvél',
              creator_display_name_snapshot: 'Anna',
              email_template_version: 'v3',
            },
            error: null,
          }),
        }),
      }),
    }))
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockSendEmail.mockResolvedValue('sent')
    mockRecordEvent.mockResolvedValue(undefined)
    setupMockFrom()
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'reserve_invitation_send') return {
        data: [{ attempt_number: 1, can_send: true, reason: 'ok', recipient_email: 'recipient@example.com' }],
        error: null,
      }
      if (name === 'update_invitation_delivery') return { data: 'ok', error: null }
      return { data: null, error: null }
    })
  })

  it('records loan_invitation_received for recipient when registered', async () => {
    mockGetUserByEmail.mockResolvedValue({ data: { user: { id: 'recipient-uuid' } }, error: null })

    await sendInvitationEmail(INV_ID)

    expect(mockRecordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId:           'recipient-uuid',
        eventType:        'loan_invitation_received',
        entityId:         INV_ID,
        updateOnConflict: false,
        payload:          { itemName: 'Borvél' },
      })
    )
  })

  it('does not record event when recipient has no Teskeid account', async () => {
    mockGetUserByEmail.mockResolvedValue({ data: { user: null }, error: null })

    await sendInvitationEmail(INV_ID)

    const invitationCalls = mockRecordEvent.mock.calls.filter(
      ([args]) => args?.eventType === 'loan_invitation_received'
    )
    expect(invitationCalls.length).toBe(0)
  })

  it('does not record event when getUserByEmail fails', async () => {
    mockGetUserByEmail.mockRejectedValue(new Error('auth error'))

    await sendInvitationEmail(INV_ID)

    const invitationCalls = mockRecordEvent.mock.calls.filter(
      ([args]) => args?.eventType === 'loan_invitation_received'
    )
    expect(invitationCalls.length).toBe(0)
  })

  it('does not record event for already_sent reserve (idempotent)', async () => {
    mockGetUserByEmail.mockResolvedValue({ data: { user: { id: 'recipient-uuid' } }, error: null })
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'reserve_invitation_send') return {
        data: [{ attempt_number: 0, can_send: false, reason: 'already_sent', recipient_email: null }],
        error: null,
      }
      return { data: null, error: null }
    })

    await sendInvitationEmail(INV_ID)

    const invitationCalls = mockRecordEvent.mock.calls.filter(
      ([args]) => args?.eventType === 'loan_invitation_received'
    )
    expect(invitationCalls.length).toBe(0)
  })

  it('email send still proceeds even if getUserByEmail throws', async () => {
    mockGetUserByEmail.mockRejectedValue(new Error('auth error'))

    const result = await sendInvitationEmail(INV_ID)

    expect(result).toEqual({ ok: true, emailStatus: 'sent' })
    expect(mockSendEmail).toHaveBeenCalled()
  })
})

// ── Manual / integration test plan (not runnable without live Supabase) ─────

describe.skip('sendInvitationEmail — integration (requires disposable Supabase env)', () => {
  it('full round-trip: create loan → auto-send → delivery recorded in DB')
  it('idempotency: calling sendInvitationEmail twice with same reserved attempt uses same key')
  it('rate limit: 11th invitation from same user within 24 hours returns rate_limited')
  it('expiry: invitation past expires_at is marked expired and cannot be sent')
  it('concurrent claim and send: one wins, the other sees appropriate status')
})

// ── updateLoan — diff events ──────────────────────────────────────────────────

const UL_LOAN_ID = 'loan-uuid-updateLoan'
const BASE_INPUT = { item_name: 'Bók', note: null as null, loaned_at: '2026-01-01', due_at: null as null }
const BASE_BEFORE = { status: 'ok', before_item_name: 'Bók', before_note: null, before_loaned_at: '2026-01-01', before_due_at: null }

describe('updateLoan — diff events', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRecordEvent.mockResolvedValue(undefined)
  })

  it('calls update_loan_with_diff RPC', async () => {
    mockRpc.mockResolvedValue({ data: [{ ...BASE_BEFORE, before_item_name: 'Gamla nafn' }], error: null })
    await updateLoan(UL_LOAN_ID, { ...BASE_INPUT, item_name: 'Nýtt nafn' })
    expect(mockRpc).toHaveBeenCalledWith('update_loan_with_diff', expect.objectContaining({ p_loan_id: UL_LOAN_ID }))
  })

  it('records event with changes and initiallyRead: true when field changed', async () => {
    mockRpc.mockResolvedValue({ data: [{ ...BASE_BEFORE, before_item_name: 'Gamla nafn' }], error: null })
    await updateLoan(UL_LOAN_ID, { ...BASE_INPUT, item_name: 'Nýtt nafn' })
    expect(mockRecordEvent).toHaveBeenCalledWith(expect.objectContaining({
      initiallyRead: true,
      payload: expect.objectContaining({
        changes: expect.arrayContaining([expect.objectContaining({ field: 'item_name' })]),
      }),
    }))
  })

  it('does not record event on no-op save', async () => {
    mockRpc.mockResolvedValue({ data: [BASE_BEFORE], error: null })
    await updateLoan(UL_LOAN_ID, BASE_INPUT)
    expect(mockRecordEvent).not.toHaveBeenCalled()
  })

  it('returns { ok: true } on no-op save', async () => {
    mockRpc.mockResolvedValue({ data: [BASE_BEFORE], error: null })
    const result = await updateLoan(UL_LOAN_ID, BASE_INPUT)
    expect(result).toEqual({ ok: true })
  })

  it('returns not_found for not_found status', async () => {
    mockRpc.mockResolvedValue({ data: [{ status: 'not_found', before_item_name: null, before_note: null, before_loaned_at: null, before_due_at: null }], error: null })
    const result = await updateLoan(UL_LOAN_ID, BASE_INPUT)
    expect(result).toEqual({ ok: false, error: 'not_found' })
    expect(mockRecordEvent).not.toHaveBeenCalled()
  })

  it('returns not_editable for not_editable status', async () => {
    mockRpc.mockResolvedValue({ data: [{ status: 'not_editable', before_item_name: null, before_note: null, before_loaned_at: null, before_due_at: null }], error: null })
    const result = await updateLoan(UL_LOAN_ID, BASE_INPUT)
    expect(result).toEqual({ ok: false, error: 'not_editable' })
  })

  it('returns save_failed when RPC transport error occurs', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST301' } })
    const result = await updateLoan(UL_LOAN_ID, BASE_INPUT)
    expect(result).toEqual({ ok: false, error: 'save_failed' })
  })
})

// ── updateLoanItemDetails — diff + counterpart events ─────────────────────────

const ULD_LOAN_ID = 'loan-uuid-updateLoanItemDetails'

function detailsDiffOk(counterpart_user_id: string | null = 'borrower-uuid') {
  return {
    data: [{ status: 'ok', before_item_name: 'Bók', before_note: null, counterpart_user_id }],
    error: null,
  }
}

describe('updateLoanItemDetails — diff + counterpart events', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRecordEvent.mockResolvedValue(undefined)
  })

  it('calls update_loan_item_details_with_diff RPC', async () => {
    mockRpc.mockResolvedValue(detailsDiffOk())
    await updateLoanItemDetails(ULD_LOAN_ID, { item_name: 'Borvél', note: null })
    expect(mockRpc).toHaveBeenCalledWith('update_loan_item_details_with_diff', expect.objectContaining({ p_loan_id: ULD_LOAN_ID }))
  })

  it('records actor event with initiallyRead: true when changes exist', async () => {
    mockRpc.mockResolvedValue(detailsDiffOk())
    await updateLoanItemDetails(ULD_LOAN_ID, { item_name: 'Borvél', note: null })
    const actorCall = mockRecordEvent.mock.calls.find(
      (c: unknown[]) => (c[0] as { userId: string }).userId === 'actor-uuid',
    )
    expect(actorCall).toBeDefined()
    expect((actorCall![0] as { initiallyRead: boolean }).initiallyRead).toBe(true)
  })

  it('records counterpart event (no initiallyRead) when counterpart differs from actor', async () => {
    mockRpc.mockResolvedValue(detailsDiffOk('borrower-uuid'))
    await updateLoanItemDetails(ULD_LOAN_ID, { item_name: 'Borvél', note: null })
    const counterpartCall = mockRecordEvent.mock.calls.find(
      (c: unknown[]) => (c[0] as { userId: string }).userId === 'borrower-uuid',
    )
    expect(counterpartCall).toBeDefined()
    expect((counterpartCall![0] as { initiallyRead?: boolean }).initiallyRead).toBeUndefined()
  })

  it('actor and counterpart share the same eventKey', async () => {
    mockRpc.mockResolvedValue(detailsDiffOk('borrower-uuid'))
    await updateLoanItemDetails(ULD_LOAN_ID, { item_name: 'Borvél', note: null })
    expect(mockRecordEvent).toHaveBeenCalledTimes(2)
    const keys = mockRecordEvent.mock.calls.map((c: unknown[]) => (c[0] as { eventKey: string }).eventKey)
    expect(keys[0]).toBe(keys[1])
  })

  it('records only actor event when counterpart_user_id is null', async () => {
    mockRpc.mockResolvedValue(detailsDiffOk(null))
    await updateLoanItemDetails(ULD_LOAN_ID, { item_name: 'Borvél', note: null })
    expect(mockRecordEvent).toHaveBeenCalledTimes(1)
    expect((mockRecordEvent.mock.calls[0][0] as { userId: string }).userId).toBe('actor-uuid')
  })

  it('records only actor event when counterpart_user_id equals actor', async () => {
    mockRpc.mockResolvedValue(detailsDiffOk('actor-uuid'))
    await updateLoanItemDetails(ULD_LOAN_ID, { item_name: 'Borvél', note: null })
    expect(mockRecordEvent).toHaveBeenCalledTimes(1)
  })

  it('does not record any event on no-op save', async () => {
    mockRpc.mockResolvedValue(detailsDiffOk())  // before_item_name: 'Bók'
    await updateLoanItemDetails(ULD_LOAN_ID, { item_name: 'Bók', note: null })
    expect(mockRecordEvent).not.toHaveBeenCalled()
  })

  it('returns { ok: true } on no-op save', async () => {
    mockRpc.mockResolvedValue(detailsDiffOk())
    const result = await updateLoanItemDetails(ULD_LOAN_ID, { item_name: 'Bók', note: null })
    expect(result).toEqual({ ok: true })
  })

  it('returns not_found when status is not_found', async () => {
    mockRpc.mockResolvedValue({ data: [{ status: 'not_found', before_item_name: null, before_note: null, counterpart_user_id: null }], error: null })
    const result = await updateLoanItemDetails(ULD_LOAN_ID, { item_name: 'Bók', note: null })
    expect(result).toEqual({ ok: false, error: 'not_found' })
    expect(mockRecordEvent).not.toHaveBeenCalled()
  })

  it('returns save_failed when data is null (defensive parse)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST301' } })
    const result = await updateLoanItemDetails(ULD_LOAN_ID, { item_name: 'Bók', note: null })
    expect(result).toEqual({ ok: false, error: 'save_failed' })
  })
})

// ── Actor initiallyRead: true — all own-action events ────────────────────────

describe('actor own-action events — initiallyRead: true', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRecordEvent.mockResolvedValue(undefined)
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: { item_name: 'Bók' } }),
          single: vi.fn().mockResolvedValue({
            data: { recipient_role: 'borrower', item_name_snapshot: null, creator_display_name_snapshot: null, email_template_version: 'v2' },
            error: null,
          }),
        }),
      }),
    }))
  })

  it('createLoan records loan_created with initiallyRead: true', async () => {
    mockRpc.mockResolvedValue({ data: [{ loan_id: 'loan-uuid-cl', invitation_id: null }], error: null })

    await createLoan({
      item_name: 'Bók',
      creator_role: 'lender',
      loaned_at: '2026-01-01',
      request_id: '00000000-0000-0000-0000-000000000099',
    })

    const call = mockRecordEvent.mock.calls.find(
      ([args]) => args?.eventType === 'loan_created',
    )
    expect(call).toBeDefined()
    expect(call![0]).toMatchObject({ eventType: 'loan_created', initiallyRead: true })
  })

  it('markReturned records loan_returned with initiallyRead: true', async () => {
    mockRpc.mockResolvedValue({ data: 'ok', error: null })

    await markReturned('loan-uuid-mr')

    expect(mockRecordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'loan_returned', initiallyRead: true }),
    )
  })

  it('undoReturn records loan_return_undone with initiallyRead: true', async () => {
    mockRpc.mockResolvedValue({ data: 'ok', error: null })

    await undoReturn('loan-uuid-ur')

    expect(mockRecordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'loan_return_undone', initiallyRead: true }),
    )
  })

  it('deleteLoan records loan_deleted with initiallyRead: true', async () => {
    mockRpc.mockResolvedValue({ data: 'ok', error: null })

    await deleteLoan('loan-uuid-dl')

    expect(mockRecordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'loan_deleted', initiallyRead: true }),
    )
  })
})

// ============================================================
// claimInvitation / declineInvitation — ackRecentEventByKey
// After success, the received event for this invitation should
// be acked so it no longer appears as unread in Nýlegt.
// ============================================================

describe('claimInvitation — acks received event on success', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAckRecentEventByKey.mockResolvedValue(undefined)
  })

  it('calls ackRecentEventByKey with correct key on success', async () => {
    mockRpc.mockResolvedValue({ data: 'ok', error: null })

    const result = await claimInvitation('inv-abc-123')

    expect(result.ok).toBe(true)
    expect(mockAckRecentEventByKey).toHaveBeenCalledWith(
      'actor-uuid',
      'loans:invitation:inv-abc-123:received',
    )
  })

  it('does not call ackRecentEventByKey when RPC returns an error result', async () => {
    mockRpc.mockResolvedValue({ data: 'wrong_email', error: null })

    await claimInvitation('inv-abc-123')

    expect(mockAckRecentEventByKey).not.toHaveBeenCalled()
  })

  it('does not call ackRecentEventByKey when RPC itself fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'db error' } })

    await claimInvitation('inv-abc-123')

    expect(mockAckRecentEventByKey).not.toHaveBeenCalled()
  })
})

describe('declineInvitation — acks received event on success', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAckRecentEventByKey.mockResolvedValue(undefined)
  })

  it('calls ackRecentEventByKey with correct key on success', async () => {
    mockRpc.mockResolvedValue({ data: 'ok', error: null })

    const result = await declineInvitation('inv-xyz-999')

    expect(result.ok).toBe(true)
    expect(mockAckRecentEventByKey).toHaveBeenCalledWith(
      'actor-uuid',
      'loans:invitation:inv-xyz-999:received',
    )
  })

  it('does not call ackRecentEventByKey when decline returns not_found', async () => {
    mockRpc.mockResolvedValue({ data: 'not_found', error: null })

    await declineInvitation('inv-xyz-999')

    expect(mockAckRecentEventByKey).not.toHaveBeenCalled()
  })
})

// ============================================================
// markReturned — counterpart events
// ============================================================

// actor-uuid is the actor (from guardLoanAccess mock); make them the lender
function makeLoanItemRow(overrides: Partial<{ item_name: string; lender_user_id: string | null; borrower_user_id: string | null }> = {}) {
  return {
    item_name: 'Borvél',
    lender_user_id: 'actor-uuid',
    borrower_user_id: 'borrower-uuid',
    ...overrides,
  }
}

describe('markReturned — counterpart event emission', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRecordEvent.mockResolvedValue(undefined)
    // Default: actor is lender; loan has both parties
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: makeLoanItemRow(), error: null }),
        }),
      }),
    }))
  })

  it('emits actor (initiallyRead) and counterpart events on ok', async () => {
    mockRpc.mockResolvedValue({ data: 'ok', error: null })

    const result = await markReturned('loan-aaa')

    expect(result.ok).toBe(true)
    expect(mockRecordEvent).toHaveBeenCalledTimes(2)
    const [actorCall, counterpartCall] = mockRecordEvent.mock.calls
    expect(actorCall[0]).toMatchObject({ userId: 'actor-uuid', eventType: 'loan_returned', initiallyRead: true })
    expect(counterpartCall[0]).toMatchObject({ userId: 'borrower-uuid', eventType: 'loan_returned' })
    expect(counterpartCall[0]).not.toHaveProperty('initiallyRead', true)
    // Same eventKey for independent ack
    expect(actorCall[0].eventKey).toBe(counterpartCall[0].eventKey)
  })

  it('does not emit any events for already_returned', async () => {
    mockRpc.mockResolvedValue({ data: 'already_returned', error: null })

    const result = await markReturned('loan-aaa')

    expect(result.ok).toBe(true)
    expect(mockRecordEvent).not.toHaveBeenCalled()
  })

  it('does not emit counterpart event when borrower_user_id is null (solo loan)', async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: makeLoanItemRow({ borrower_user_id: null }), error: null }),
        }),
      }),
    }))
    mockRpc.mockResolvedValue({ data: 'ok', error: null })

    await markReturned('loan-aaa')

    expect(mockRecordEvent).toHaveBeenCalledTimes(1)
    expect(mockRecordEvent.mock.calls[0][0]).toMatchObject({ userId: 'actor-uuid' })
  })
})

// ============================================================
// undoReturn — counterpart events
// ============================================================

describe('undoReturn — counterpart event emission', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRecordEvent.mockResolvedValue(undefined)
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: makeLoanItemRow(), error: null }),
        }),
      }),
    }))
  })

  it('emits actor and counterpart events on ok', async () => {
    mockRpc.mockResolvedValue({ data: 'ok', error: null })

    const result = await undoReturn('loan-bbb')

    expect(result.ok).toBe(true)
    expect(mockRecordEvent).toHaveBeenCalledTimes(2)
    const [actorCall, counterpartCall] = mockRecordEvent.mock.calls
    expect(actorCall[0]).toMatchObject({ userId: 'actor-uuid', eventType: 'loan_return_undone', initiallyRead: true })
    expect(counterpartCall[0]).toMatchObject({ userId: 'borrower-uuid', eventType: 'loan_return_undone' })
    expect(actorCall[0].eventKey).toBe(counterpartCall[0].eventKey)
  })

  it('does not emit counterpart event when no counterpart', async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: makeLoanItemRow({ lender_user_id: null, borrower_user_id: null }), error: null }),
        }),
      }),
    }))
    mockRpc.mockResolvedValue({ data: 'ok', error: null })

    await undoReturn('loan-bbb')

    expect(mockRecordEvent).toHaveBeenCalledTimes(1)
  })
})

// ============================================================
// claimInvitation — creator notification
// ============================================================

describe('claimInvitation — creator receives loan_invitation_accepted', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAckRecentEventByKey.mockResolvedValue(undefined)
    mockRecordEvent.mockResolvedValue(undefined)
    // Two sequential from() calls: loan_invitations, then loan_items
    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // loan_invitations query
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { invited_by: 'creator-uuid', loan_id: 'loan-ccc' }, error: null,
              }),
            }),
          }),
        }
      }
      // loan_items query
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { item_name: 'Reiðhjól' }, error: null }),
          }),
        }),
      }
    })
  })

  it('emits loan_invitation_accepted for the creator on ok with loan entityId', async () => {
    mockRpc.mockResolvedValue({ data: 'ok', error: null })

    const result = await claimInvitation('inv-ccc')

    expect(result.ok).toBe(true)
    expect(mockRecordEvent).toHaveBeenCalledOnce()
    const call = mockRecordEvent.mock.calls[0][0]
    expect(call).toMatchObject({
      userId:     'creator-uuid',
      eventType:  'loan_invitation_accepted',
      entityType: 'loan',
      entityId:   'loan-ccc',
      eventKey:   'loans:invitation:inv-ccc:accepted',
      payload:    { itemName: 'Reiðhjól' },
    })
    // Payload must not contain any email fields
    expect(call.payload).not.toHaveProperty('recipient_email')
    expect(call.payload).not.toHaveProperty('recipient_email_normalized')
  })

  it('does not emit creator event when claim fails', async () => {
    mockRpc.mockResolvedValue({ data: 'wrong_email', error: null })

    await claimInvitation('inv-ccc')

    expect(mockRecordEvent).not.toHaveBeenCalled()
  })

  it('does not emit creator event when creator equals actor', async () => {
    // invited_by === actor-uuid (same user)
    mockFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { invited_by: 'actor-uuid', loan_id: 'loan-ccc' }, error: null,
          }),
        }),
      }),
    })).mockImplementationOnce(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: { item_name: 'Reiðhjól' }, error: null }),
        }),
      }),
    }))
    mockRpc.mockResolvedValue({ data: 'ok', error: null })

    await claimInvitation('inv-ccc')

    expect(mockRecordEvent).not.toHaveBeenCalled()
  })
})

// ============================================================
// declineInvitation — creator notification
// ============================================================

describe('declineInvitation — creator receives loan_invitation_declined', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAckRecentEventByKey.mockResolvedValue(undefined)
    mockRecordEvent.mockResolvedValue(undefined)
    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { invited_by: 'creator-uuid', loan_id: 'loan-ddd' }, error: null,
              }),
            }),
          }),
        }
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { item_name: 'Bokvél' }, error: null }),
          }),
        }),
      }
    })
  })

  it('emits loan_invitation_declined for the creator on ok with loan entityId', async () => {
    mockRpc.mockResolvedValue({ data: 'ok', error: null })

    const result = await declineInvitation('inv-ddd')

    expect(result.ok).toBe(true)
    expect(mockRecordEvent).toHaveBeenCalledOnce()
    const call = mockRecordEvent.mock.calls[0][0]
    expect(call).toMatchObject({
      userId:     'creator-uuid',
      eventType:  'loan_invitation_declined',
      entityType: 'loan',
      entityId:   'loan-ddd',
      eventKey:   'loans:invitation:inv-ddd:declined',
      payload:    { itemName: 'Bokvél' },
    })
    // Payload must not contain any email fields
    expect(call.payload).not.toHaveProperty('recipient_email')
    expect(call.payload).not.toHaveProperty('recipient_email_normalized')
  })

  it('does not emit creator event when decline fails', async () => {
    mockRpc.mockResolvedValue({ data: 'not_found', error: null })

    await declineInvitation('inv-ddd')

    expect(mockRecordEvent).not.toHaveBeenCalled()
  })
})
