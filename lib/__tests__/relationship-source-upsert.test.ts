import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  checkFeatureAccess: vi.fn(),
  from: vi.fn(),
  getUserByEmail: vi.fn(),
}))

vi.mock('@/lib/loans/guard', () => ({
  checkFeatureAccess: mocks.checkFeatureAccess,
}))

vi.mock('@/lib/supabase/admin', () => ({
  getAdmin: vi.fn(() => ({
    from: mocks.from,
    auth: { admin: { getUserByEmail: mocks.getUserByEmail } },
  })),
}))

import { upsertLoanRelationship } from '@/lib/relationships/actions'
import { upsertSourceRelationship } from '@/lib/relationships/upsert-source.server'

type BuilderOptions = {
  maybeData?: unknown
  singleData?: unknown
  error?: unknown
}

function makeBuilder({ maybeData = null, singleData = null, error = null }: BuilderOptions = {}) {
  const insert = vi.fn()
  const update = vi.fn()
  const builder: Record<string, unknown> = { error }

  for (const method of ['select', 'eq', 'is']) {
    builder[method] = vi.fn(() => builder)
  }
  builder.insert = insert.mockImplementation(() => builder)
  builder.update = update.mockImplementation(() => builder)
  builder.maybeSingle = vi.fn(async () => ({ data: maybeData, error }))
  builder.single = vi.fn(async () => ({ data: singleData, error }))

  return { builder, insert, update }
}

function useTableQueues(queues: Record<string, Array<ReturnType<typeof makeBuilder>>>) {
  mocks.from.mockImplementation((table: string) => {
    const next = queues[table]?.shift()
    if (!next) throw new Error(`Unexpected table call: ${table}`)
    return next.builder
  })
}

describe('upsertSourceRelationship', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.checkFeatureAccess.mockResolvedValue(true)
    mocks.getUserByEmail.mockResolvedValue({ data: { user: null } })
  })

  it('uses the explicit consent-bound identity without looking up auth or overwriting private metadata', async () => {
    const existingRelationship = makeBuilder({
      maybeData: {
        id: 'relationship-1',
        counterpart_user_id: 'accepted-user',
        private_display_name: 'Einkanafn eiganda',
      },
    })
    const sourceLookup = makeBuilder({ maybeData: null })
    const sourceInsert = makeBuilder()

    useTableQueues({
      relationships: [existingRelationship],
      relationship_sources: [sourceLookup, sourceInsert],
    })

    await expect(upsertSourceRelationship({
      ownerUserId: 'owner-1',
      ownerEmail: 'owner@example.com',
      counterpart: {
        mode: 'verified-counterpart',
        userId: 'accepted-user',
        emailCanonical: 'accepted@example.com',
        privateDisplayName: 'Nýtt nafn sem má ekki yfirskrifa',
      },
      sourceType: 'expenses',
      sourceId: 'expense-member-1',
    })).resolves.toBeUndefined()

    expect(mocks.getUserByEmail).not.toHaveBeenCalled()
    expect(existingRelationship.update).not.toHaveBeenCalled()
    expect(sourceInsert.insert).toHaveBeenCalledWith({
      relationship_id: 'relationship-1',
      source_type: 'expenses',
      source_id: 'expense-member-1',
    })
  })

  it('keeps the Loans wrapper email-lookup contract and writes a loans source', async () => {
    const emailLookup = makeBuilder({ maybeData: null })
    const relationshipInsert = makeBuilder({ singleData: { id: 'relationship-2' } })
    const tagInsert = makeBuilder()
    const sourceLookup = makeBuilder({ maybeData: null })
    const sourceInsert = makeBuilder()

    useTableQueues({
      relationships: [emailLookup, relationshipInsert],
      relationship_tags: [tagInsert],
      relationship_sources: [sourceLookup, sourceInsert],
    })

    await upsertLoanRelationship(
      'owner-2',
      'owner@example.com',
      ' Dotted.User+teskeid@gmail.com ',
      'loan-1',
    )

    expect(mocks.getUserByEmail).toHaveBeenCalledWith('dotteduser+teskeid@gmail.com')
    expect(relationshipInsert.insert).toHaveBeenCalledWith({
      owner_id: 'owner-2',
      counterpart_user_id: null,
      email_canonical: 'dotteduser+teskeid@gmail.com',
      private_display_name: null,
    })
    expect(tagInsert.insert).toHaveBeenCalledWith({
      relationship_id: 'relationship-2',
      tag: 'unclassified',
    })
    expect(sourceInsert.insert).toHaveBeenCalledWith({
      relationship_id: 'relationship-2',
      source_type: 'loans',
      source_id: 'loan-1',
    })
  })

  it('enriches the verified counterpart that wins a concurrent insert race', async () => {
    const initialCounterpart = makeBuilder({ maybeData: null })
    const initialEmail = makeBuilder({ maybeData: null })
    const failedInsert = makeBuilder({ error: { code: '23505' } })
    const concurrentCounterpart = makeBuilder({
      maybeData: {
        id: 'relationship-race-user',
        counterpart_user_id: 'accepted-user',
        private_display_name: null,
      },
    })
    const nameUpdate = makeBuilder()
    const sourceLookup = makeBuilder({ maybeData: null })
    const sourceInsert = makeBuilder()

    useTableQueues({
      relationships: [
        initialCounterpart,
        initialEmail,
        failedInsert,
        concurrentCounterpart,
        nameUpdate,
      ],
      relationship_sources: [sourceLookup, sourceInsert],
    })

    await upsertSourceRelationship({
      ownerUserId: 'owner-race',
      ownerEmail: 'owner@example.com',
      counterpart: {
        mode: 'verified-counterpart',
        userId: 'accepted-user',
        emailCanonical: 'accepted@example.com',
        privateDisplayName: 'Einkanafn',
      },
      sourceType: 'expenses',
      sourceId: 'expense-member-race-user',
    })

    expect(nameUpdate.update).toHaveBeenCalledWith({ private_display_name: 'Einkanafn' })
    expect(sourceInsert.insert).toHaveBeenCalledWith({
      relationship_id: 'relationship-race-user',
      source_type: 'expenses',
      source_id: 'expense-member-race-user',
    })
  })

  it('links and names a compatible email row that wins a concurrent insert race', async () => {
    const initialCounterpart = makeBuilder({ maybeData: null })
    const initialEmail = makeBuilder({ maybeData: null })
    const failedInsert = makeBuilder({ error: { code: '23505' } })
    const concurrentCounterpartLookup = makeBuilder({ maybeData: null })
    const concurrentEmail = makeBuilder({
      maybeData: {
        id: 'relationship-race-email',
        counterpart_user_id: null,
        private_display_name: null,
      },
    })
    const counterpartUpdate = makeBuilder({
      maybeData: {
        id: 'relationship-race-email',
        counterpart_user_id: 'accepted-user',
        private_display_name: null,
      },
    })
    const nameUpdate = makeBuilder()
    const sourceLookup = makeBuilder({ maybeData: null })
    const sourceInsert = makeBuilder()

    useTableQueues({
      relationships: [
        initialCounterpart,
        initialEmail,
        failedInsert,
        concurrentCounterpartLookup,
        concurrentEmail,
        counterpartUpdate,
        nameUpdate,
      ],
      relationship_sources: [sourceLookup, sourceInsert],
    })

    await upsertSourceRelationship({
      ownerUserId: 'owner-race',
      ownerEmail: 'owner@example.com',
      counterpart: {
        mode: 'verified-counterpart',
        userId: 'accepted-user',
        emailCanonical: 'accepted@example.com',
        privateDisplayName: 'Einkanafn',
      },
      sourceType: 'expenses',
      sourceId: 'expense-member-race-email',
    })

    expect(counterpartUpdate.update).toHaveBeenCalledWith({
      counterpart_user_id: 'accepted-user',
    })
    expect(nameUpdate.update).toHaveBeenCalledWith({ private_display_name: 'Einkanafn' })
    expect(sourceInsert.insert).toHaveBeenCalledWith({
      relationship_id: 'relationship-race-email',
      source_type: 'expenses',
      source_id: 'expense-member-race-email',
    })
  })

  it('never throws or logs identifiers when best-effort persistence fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.checkFeatureAccess.mockRejectedValue(new Error('accepted@example.com'))

    await expect(upsertSourceRelationship({
      ownerUserId: 'owner-3',
      ownerEmail: 'owner@example.com',
      counterpart: {
        mode: 'verified-counterpart',
        userId: 'accepted-user',
        emailCanonical: 'accepted@example.com',
      },
      sourceType: 'expenses',
      sourceId: 'expense-member-2',
    })).resolves.toBeUndefined()

    expect(errorSpy).toHaveBeenCalledWith('[relationships] source upsert failed')
    expect(errorSpy.mock.calls.flat().join(' ')).not.toContain('accepted@example.com')
    errorSpy.mockRestore()
  })
})
