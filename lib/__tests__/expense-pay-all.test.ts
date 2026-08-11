import { describe, expect, it } from 'vitest'
import type {
  ExpensePayAllBlockedContextView,
  ExpensePayAllContextView,
  ExpensePayAllPairContextView,
  ExpensePayAllPaymentDetailsView,
  ExpensePaymentSnapshotView,
} from '@/lib/expenses/contracts'
import {
  buildExpensePayAllCounterpartyViews,
  buildExpensePayAllView,
  buildExpensePayAllContext,
  buildExpensePayAllPairContext,
  combineExpensePayAllPaymentDetails,
  expensePayAllCanonicalPairDirection,
  expensePayAllSafeFirstName,
  expensePayAllSelfMemberIds,
  planExpensePayAllSettlement,
  type ExpensePayAllCandidate,
  type ExpensePayAllPairCandidate,
} from '@/lib/expenses/pay-all'

function context(overrides: Partial<ExpensePayAllContextView> = {}): ExpensePayAllContextView {
  return {
    groupId: 'group-1',
    groupKind: 'group',
    groupName: 'Bústaðarferð',
    emoji: '🏡',
    amountMinor: 5_000,
    currency: 'ISK',
    expenses: [{ id: 'expense-1', title: 'Matur', incurredOn: '2026-08-08', amountMinor: 5_000 }],
    nettingAdjustmentMinor: 0,
    transfer: {
      fromMemberId: 'self', fromDisplayName: 'Ég', toMemberId: 'creditor', toDisplayName: 'Anna',
      amountMinor: 5_000, currency: 'ISK', expectedFinancialVersion: 1, canReport: true,
      paymentInstruction: null,
    },
    ...overrides,
  }
}

function instruction(overrides: Partial<ExpensePaymentSnapshotView> = {}): ExpensePaymentSnapshotView {
  return {
    title: 'payment_profile_v2',
    kind: 'bank_account',
    currency: 'ISK',
    details: { accountNumber: '0159-26-123456', nationalId: '010180-9999' },
    visibility: 'debt_context',
    capturedAt: '2026-08-09T12:00:00.000Z',
    ...overrides,
  }
}

function candidate(
  overrides: Partial<Extract<
    ExpensePayAllCandidate,
    { paymentDetailsState: 'available' }
  >> = {},
): ExpensePayAllCandidate {
  return {
    creditorKey: 'user:creditor-a',
    recipientDisplayName: 'Anna',
    amountMinor: 5_000,
    currency: 'ISK',
    paymentInstruction: instruction(),
    paymentDetailsState: 'available',
    expectedPaymentProfile: {
      profileId: '80000000-0000-4000-8000-000000000001',
      version: 3,
      stateToken: '0123456789abcdef0123456789abcdef',
    },
    context: context(),
    ...overrides,
  }
}

function pairContext(input: {
  groupId?: string
  amountMinor?: number
  currency?: string
  fromMemberId?: string
  toMemberId?: string
  expectedFinancialVersion?: number
} = {}): ExpensePayAllPairContextView {
  const groupId = input.groupId ?? 'group-1'
  const amountMinor = input.amountMinor ?? 5_000
  const currency = input.currency ?? 'ISK'
  const fromMemberId = input.fromMemberId ?? 'actor-member'
  const toMemberId = input.toMemberId ?? 'counterparty-member'
  const expectedFinancialVersion = input.expectedFinancialVersion ?? 1
  return buildExpensePayAllPairContext(context({
    groupId,
    amountMinor,
    currency,
    transfer: {
      fromMemberId,
      fromDisplayName: 'Ég',
      toMemberId,
      toDisplayName: 'Anna',
      amountMinor,
      currency,
      expectedFinancialVersion,
      canReport: true,
      paymentInstruction: null,
    },
  }))
}

function pairCandidate(
  direction: 'outgoing' | 'incoming',
  input: {
    counterpartyUserId?: string
    counterpartyDisplayName?: string
    groupId?: string
    amountMinor?: number
    currency?: string
    fromMemberId?: string
    toMemberId?: string
    expectedFinancialVersion?: number
    actionable?: boolean
    paymentDetails?: ExpensePayAllPaymentDetailsView
  } = {},
): ExpensePayAllPairCandidate {
  const base = {
    counterpartyUserId: input.counterpartyUserId ?? 'counterparty-user',
    counterpartyDisplayName: input.counterpartyDisplayName ?? 'Anna Jónsdóttir',
    actionable: input.actionable ?? true,
    context: pairContext(input),
  }
  return direction === 'outgoing'
    ? {
        ...base,
        direction,
        paymentDetails: input.paymentDetails ?? {
          paymentDetailsState: 'available',
          paymentInstruction: instruction(),
          expectedPaymentProfile: {
            profileId: '80000000-0000-4000-8000-000000000001',
            version: 3,
            stateToken: '0123456789abcdef0123456789abcdef',
          },
        },
      }
    : { ...base, direction, paymentDetails: null }
}

describe('buildExpensePayAllView', () => {
  it('recognizes direct and canonical linked self balances regardless of debt count', () => {
    const ids = expensePayAllSelfMemberIds({
      balances: [
        { memberId: 'direct-self', displayName: 'Ég', currency: 'ISK', amountMinor: 0, isSelf: true },
        { memberId: 'linked-self', displayName: 'Pabbi', currency: 'ISK', amountMinor: -25_000, isSelf: true },
        { memberId: 'guest', displayName: 'Gestur', currency: 'ISK', amountMinor: -5_000, isSelf: false },
      ],
    })

    expect([...ids].sort()).toEqual(['direct-self', 'linked-self'])
  })

  it('combines the same creditor, currency and payment destination across contexts', () => {
    const view = buildExpensePayAllView([
      candidate(),
      candidate({
        amountMinor: 7_500,
        paymentInstruction: instruction({ capturedAt: '2026-08-09T12:00:01.000Z' }),
        context: context({
          groupId: 'group-2',
          groupName: 'Skíðaferð',
          amountMinor: 7_500,
          expenses: [{ id: 'expense-2', title: 'Gisting', incurredOn: '2026-08-07', amountMinor: 7_500 }],
        }),
      }),
    ], [])

    expect(view.payments).toHaveLength(1)
    expect(view.payments[0]).toMatchObject({
      id: 'payment-1',
      recipientDisplayName: 'Anna',
      amountMinor: 12_500,
      currency: 'ISK',
    })
    expect(view.payments[0]?.contexts.map((entry) => entry.groupName)).toEqual([
      'Bústaðarferð',
      'Skíðaferð',
    ])
  })

  it('never combines different creditors, currencies or payment destinations', () => {
    const view = buildExpensePayAllView([
      candidate(),
      candidate({ creditorKey: 'user:creditor-b', context: context({ groupId: 'group-2' }) }),
      candidate({
        currency: 'EUR',
        paymentInstruction: instruction({ currency: 'EUR' }),
        context: context({ groupId: 'group-3', currency: 'EUR' }),
      }),
      candidate({
        paymentInstruction: instruction({ details: { accountNumber: '0301-26-654321' } }),
        context: context({ groupId: 'group-4' }),
      }),
    ], [])

    expect(view.payments).toHaveLength(4)
  })

  it('keeps canonical creditor identities server-only and preserves blocked review contexts', () => {
    const blocked: ExpensePayAllBlockedContextView = {
      ...context({ groupId: 'review-group', groupName: 'Yfirferð' }),
      recipientDisplayName: 'Bjarni',
    }
    const view = buildExpensePayAllView([candidate()], [blocked])

    expect(JSON.stringify(view)).not.toContain('user:creditor-a')
    expect(view.blockedContexts).toEqual([blocked])
  })

  it('explains an exact transfer with only debt-causing entries and a reconciling adjustment', () => {
    const transfer = context().transfer
    const result = buildExpensePayAllContext({
      id: 'group-1', kind: 'group', name: 'Bústaðarferð', description: null, emoji: '🏡',
      defaultCurrency: 'ISK', defaultIncludeCreator: true, financialVersion: 1,
      status: 'active', role: 'member', canManage: false, canLeave: true,
      canCreateExpense: false, createdAt: '2026-08-01T00:00:00.000Z', members: [],
      expenses: [{
        id: 'expense-1', groupId: 'group-1', title: 'Matur', totalMinor: 10_000,
        currency: 'ISK', incurredOn: '2026-08-08', category: null, note: null,
        status: 'active', splitMethod: 'fixed', createdBySelf: false,
        createdAt: '2026-08-08T00:00:00.000Z', revisions: [],
        payments: [{ memberId: 'creditor', displayName: 'Anna', amountMinor: 10_000 }],
        shares: [
          { memberId: 'self', displayName: 'Ég', amountMinor: 8_000 },
          { memberId: 'creditor', displayName: 'Anna', amountMinor: 2_000 },
        ],
      }, {
        id: 'expense-2', groupId: 'group-1', title: 'Bensín', totalMinor: 5_000,
        currency: 'ISK', incurredOn: '2026-08-07', category: null, note: null,
        status: 'active', splitMethod: 'fixed', createdBySelf: true,
        createdAt: '2026-08-07T00:00:00.000Z', revisions: [],
        payments: [{ memberId: 'self', displayName: 'Ég', amountMinor: 5_000 }],
        shares: [
          { memberId: 'self', displayName: 'Ég', amountMinor: 2_000 },
          { memberId: 'creditor', displayName: 'Anna', amountMinor: 3_000 },
        ],
      }, {
        id: 'cancelled', groupId: 'group-1', title: 'Fellt niður', totalMinor: 2_000,
        currency: 'ISK', incurredOn: '2026-08-06', category: null, note: null,
        status: 'cancelled', splitMethod: 'fixed', createdBySelf: false,
        createdAt: '2026-08-06T00:00:00.000Z', revisions: [], payments: [],
        shares: [{ memberId: 'self', displayName: 'Ég', amountMinor: 2_000 }],
      }],
      balances: [], settlementTransfers: [transfer], settlementRequiresReview: false,
      repayments: [], activity: [],
    }, transfer)

    expect(result.expenses).toEqual([{
      id: 'expense-1', title: 'Matur', incurredOn: '2026-08-08', amountMinor: 8_000,
    }])
    expect(result.nettingAdjustmentMinor).toBe(-3_000)
    expect(result.expenses.reduce((sum, expense) => sum + expense.amountMinor, 0)
      + result.nettingAdjustmentMinor).toBe(result.amountMinor)
  })

  it('shows two exact debt entries when their amounts make up the whole transfer', () => {
    const transfer = {
      ...context().transfer,
      amountMinor: 25_000,
    }
    const baseExpense = {
      groupId: 'group-1', currency: 'ISK', category: null, note: null,
      status: 'active' as const, splitMethod: 'fixed' as const,
      createdBySelf: false, revisions: [],
    }
    const result = buildExpensePayAllContext({
      id: 'group-1', kind: 'group', name: 'Fjölskyldan', description: null, emoji: null,
      defaultCurrency: 'ISK', defaultIncludeCreator: true, financialVersion: 1,
      status: 'active', role: 'member', canManage: false, canLeave: true,
      canCreateExpense: false, createdAt: '2026-08-01T00:00:00.000Z', members: [],
      expenses: [{
        ...baseExpense, id: 'expense-1', title: 'Færsla A', totalMinor: 10_000,
        incurredOn: '2026-08-08', createdAt: '2026-08-08T00:00:00.000Z',
        payments: [{ memberId: 'creditor', displayName: 'Anna', amountMinor: 10_000 }],
        shares: [{ memberId: 'self', displayName: 'Ég', amountMinor: 10_000 }],
      }, {
        ...baseExpense, id: 'expense-2', title: 'Færsla B', totalMinor: 15_000,
        incurredOn: '2026-08-09', createdAt: '2026-08-09T00:00:00.000Z',
        payments: [{ memberId: 'creditor', displayName: 'Anna', amountMinor: 15_000 }],
        shares: [{ memberId: 'self', displayName: 'Ég', amountMinor: 15_000 }],
      }],
      balances: [], settlementTransfers: [transfer], settlementRequiresReview: false,
      repayments: [], activity: [],
    }, transfer)

    expect(result.expenses.map((expense) => [expense.title, expense.amountMinor])).toEqual([
      ['Færsla A', 10_000],
      ['Færsla B', 15_000],
    ])
    expect(result.nettingAdjustmentMinor).toBe(0)
  })
})

describe('canonical pay-all pairs', () => {
  const member = (
    id: string,
    userId: string | null,
    status: 'invited' | 'active' | 'declined' | 'removed' | 'left' = 'active',
  ) => ({ id, userId, displayName: id, status })

  it('accepts only the exact direct active actor and an active registered counterparty', () => {
    const actor = member('actor-member', 'actor-user')
    expect(expensePayAllCanonicalPairDirection({
      actorUserId: 'actor-user',
      actorMember: actor,
      fromMember: actor,
      toMember: member('anna-member', 'anna-user'),
    })).toEqual({
      direction: 'outgoing',
      counterpartyUserId: 'anna-user',
      displayName: 'anna-member',
    })
    expect(expensePayAllCanonicalPairDirection({
      actorUserId: 'actor-user',
      actorMember: actor,
      fromMember: member('anna-member', 'anna-user'),
      toMember: actor,
    })?.direction).toBe('incoming')

    expect(expensePayAllCanonicalPairDirection({
      actorUserId: 'actor-user',
      actorMember: actor,
      fromMember: member('shared-share-member', null),
      toMember: member('anna-member', 'anna-user'),
    })).toBeNull()
    expect(expensePayAllCanonicalPairDirection({
      actorUserId: 'actor-user',
      actorMember: actor,
      fromMember: actor,
      toMember: member('guest-member', null),
    })).toBeNull()
    expect(expensePayAllCanonicalPairDirection({
      actorUserId: 'actor-user',
      actorMember: actor,
      fromMember: actor,
      toMember: member('inactive-member', 'anna-user', 'left'),
    })).toBeNull()
    expect(expensePayAllCanonicalPairDirection({
      actorUserId: 'actor-user',
      actorMember: member('actor-member', 'different-user'),
      fromMember: actor,
      toMember: member('anna-member', 'anna-user'),
    })).toBeNull()
  })

  it('groups by canonical user and currency across different member ids, never display name', () => {
    const views = buildExpensePayAllCounterpartyViews([
      pairCandidate('outgoing', {
        groupId: 'group-a', amountMinor: 20_000,
        fromMemberId: 'actor-a', toMemberId: 'anna-a',
      }),
      pairCandidate('outgoing', {
        groupId: 'group-b', amountMinor: 10_000,
        fromMemberId: 'actor-b', toMemberId: 'anna-b',
      }),
      pairCandidate('incoming', {
        groupId: 'group-c', amountMinor: 5_000,
        fromMemberId: 'anna-c', toMemberId: 'actor-c',
      }),
      pairCandidate('outgoing', {
        counterpartyUserId: 'different-user',
        counterpartyDisplayName: 'Anna Jónsdóttir',
        groupId: 'group-d', amountMinor: 7_000,
        fromMemberId: 'actor-d', toMemberId: 'different-anna-d',
      }),
    ])

    expect(views).toHaveLength(2)
    const anna = views.find((view) => view.counterpartyUserId === 'counterparty-user')
    expect(anna).toMatchObject({
      counterpartyDisplayName: 'Anna Jónsdóttir',
      counterpartyFirstName: 'Anna',
      currency: 'ISK',
      grossPayableMinor: 30_000,
      grossReceivableMinor: 5_000,
      offsetMinor: 5_000,
      netPayableMinor: 25_000,
      netReceivableMinor: 0,
      counterpartyCanSettle: true,
    })
    expect(anna?.outgoingContexts.map((entry) => ({
      groupId: entry.groupId,
      version: entry.expectedFinancialVersion,
      from: entry.fromMemberId,
      to: entry.toMemberId,
      amount: entry.amountMinor,
    }))).toEqual([
      { groupId: 'group-a', version: 1, from: 'actor-a', to: 'anna-a', amount: 20_000 },
      { groupId: 'group-b', version: 1, from: 'actor-b', to: 'anna-b', amount: 10_000 },
    ])
  })

  it('keeps blocked contexts visible but out of actionable totals', () => {
    const [view] = buildExpensePayAllCounterpartyViews([
      pairCandidate('outgoing', { amountMinor: 30_000 }),
      pairCandidate('incoming', { groupId: 'blocked', amountMinor: 5_000, actionable: false }),
    ])
    expect(view).toMatchObject({
      grossPayableMinor: 30_000,
      grossReceivableMinor: 0,
      offsetMinor: 0,
    })
    expect(view?.blockedContexts).toHaveLength(1)
    expect(view?.blockedContexts[0]?.direction).toBe('incoming')
  })

  it('derives friendly copy only from a safe display first name', () => {
    expect(expensePayAllSafeFirstName('  Sigurveig Stefánsdóttir ')).toBe('Sigurveig')
    expect(expensePayAllSafeFirstName('sigurveig@example.com')).toBeNull()
    expect(expensePayAllSafeFirstName('12345')).toBeNull()
  })
})

describe('truthful pay-all payment details', () => {
  it('preserves one consistent available snapshot and fails closed on mixed states', () => {
    const available: ExpensePayAllPaymentDetailsView = {
      paymentDetailsState: 'available',
      paymentInstruction: instruction(),
      expectedPaymentProfile: {
        profileId: '80000000-0000-4000-8000-000000000001',
        version: 3,
        stateToken: '0123456789abcdef0123456789abcdef',
      },
    }
    expect(combineExpensePayAllPaymentDetails([
      available,
      {
        paymentDetailsState: 'available',
        paymentInstruction: instruction({ capturedAt: '2026-08-10T10:00:00.000Z' }),
        expectedPaymentProfile: {
          profileId: '80000000-0000-4000-8000-000000000001',
          version: 3,
          stateToken: '0123456789abcdef0123456789abcdef',
        },
      },
    ])).toEqual(available)
    expect(combineExpensePayAllPaymentDetails([
      available,
      {
        paymentDetailsState: 'not_configured',
        paymentInstruction: null,
        expectedPaymentProfile: null,
      },
    ])).toEqual({
      paymentDetailsState: 'unavailable',
      paymentInstruction: null,
      expectedPaymentProfile: null,
    })
    expect(combineExpensePayAllPaymentDetails([
      {
        paymentDetailsState: 'not_configured',
        paymentInstruction: null,
        expectedPaymentProfile: null,
      },
      {
        paymentDetailsState: 'not_configured',
        paymentInstruction: null,
        expectedPaymentProfile: null,
      },
    ])).toEqual({
      paymentDetailsState: 'not_configured',
      paymentInstruction: null,
      expectedPaymentProfile: null,
    })
  })

  it('does not combine otherwise identical payment details from different profile versions', () => {
    const profileId = '80000000-0000-4000-8000-000000000001'
    expect(combineExpensePayAllPaymentDetails([
      {
        paymentDetailsState: 'available',
        paymentInstruction: instruction(),
        expectedPaymentProfile: {
          profileId,
          version: 3,
          stateToken: '0123456789abcdef0123456789abcdef',
        },
      },
      {
        paymentDetailsState: 'available',
        paymentInstruction: instruction(),
        expectedPaymentProfile: {
          profileId,
          version: 4,
          stateToken: 'fedcba9876543210fedcba9876543210',
        },
      },
    ])).toEqual({
      paymentDetailsState: 'unavailable',
      paymentInstruction: null,
      expectedPaymentProfile: null,
    })
  })
})

describe('planExpensePayAllSettlement', () => {
  const outgoing = [
    pairContext({
      groupId: 'group-a', amountMinor: 20_000,
      fromMemberId: 'actor-a', toMemberId: 'anna-a',
    }),
    pairContext({
      groupId: 'group-b', amountMinor: 10_000,
      fromMemberId: 'actor-b', toMemberId: 'anna-b',
    }),
  ]
  const incoming = [pairContext({
    groupId: 'group-c', amountMinor: 5_000,
    fromMemberId: 'anna-c', toMemberId: 'actor-c',
  })]

  it('allocates full binary offset in both directions before cash and counts it once', () => {
    const plan = planExpensePayAllSettlement(outgoing, incoming, {
      cashMinor: 25_000,
      applyFullOffset: true,
    })
    expect(plan).toMatchObject({
      valid: true,
      cashMinor: 25_000,
      offsetMinor: 5_000,
      totalSettledMinor: 30_000,
      remainingPayableMinor: 0,
      remainingReceivableMinor: 0,
    })
    if (!plan.valid) throw new Error('expected valid plan')
    expect(plan.outgoingOffsetAllocations.map((entry) => [entry.groupId, entry.allocatedMinor]))
      .toEqual([['group-a', 5_000]])
    expect(plan.incomingOffsetAllocations.map((entry) => [entry.groupId, entry.allocatedMinor]))
      .toEqual([['group-c', 5_000]])
    expect(plan.cashAllocations.map((entry) => [entry.groupId, entry.allocatedMinor]))
      .toEqual([['group-a', 15_000], ['group-b', 10_000]])
  })

  it('is input-order independent and uses stable group/from/to tie-breakers', () => {
    const tied = [
      pairContext({ groupId: 'group-b', amountMinor: 10_000, fromMemberId: 'actor-b', toMemberId: 'anna-b' }),
      pairContext({ groupId: 'group-a', amountMinor: 10_000, fromMemberId: 'actor-a', toMemberId: 'anna-a' }),
    ]
    const claim = [pairContext({ groupId: 'group-c', amountMinor: 5_000, fromMemberId: 'anna-c', toMemberId: 'actor-c' })]
    const first = planExpensePayAllSettlement(tied, claim, { cashMinor: 0, applyFullOffset: true })
    const second = planExpensePayAllSettlement([...tied].reverse(), claim, { cashMinor: 0, applyFullOffset: true })
    expect(first).toEqual(second)
    if (!first.valid) throw new Error('expected valid plan')
    expect(first.outgoingOffsetAllocations.map((entry) => entry.groupId)).toEqual(['group-a'])
  })

  it('keeps offset full when cash is lower and rejects cash above the applicable cap', () => {
    expect(planExpensePayAllSettlement(outgoing, incoming, {
      cashMinor: 20_000,
      applyFullOffset: true,
    })).toMatchObject({
      valid: true,
      offsetMinor: 5_000,
      remainingPayableMinor: 5_000,
    })
    expect(planExpensePayAllSettlement(outgoing, incoming, {
      cashMinor: 26_000,
      applyFullOffset: true,
    })).toEqual({
      valid: false,
      error: 'cash_exceeds_payable',
      requestedCashMinor: 26_000,
      appliedOffsetMinor: 5_000,
      maxCashMinor: 25_000,
    })
    expect(planExpensePayAllSettlement(outgoing, incoming, {
      cashMinor: 30_000,
      applyFullOffset: false,
    })).toMatchObject({ valid: true, cashMinor: 30_000, offsetMinor: 0 })
    expect(planExpensePayAllSettlement(outgoing, incoming, {
      cashMinor: 0,
      applyFullOffset: false,
    })).toMatchObject({ valid: false, error: 'settlement_amount_required' })
  })
})
