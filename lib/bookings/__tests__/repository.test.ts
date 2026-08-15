import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  adminRpc: vi.fn(),
  adminFrom: vi.fn(),
  getUser: vi.fn(),
  authorize: vi.fn(),
  cookieGet: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  getAdmin: vi.fn(() => ({ rpc: mocks.adminRpc, from: mocks.adminFrom })),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: mocks.cookieGet })),
}))

vi.mock('../access.server', () => ({
  authorizeBookingAccess: mocks.authorize,
}))

import type { BookingAuthorization } from '../access.server'
import { digestBookingToken } from '../security.server'
import {
  cancelBookingRequest,
  createBookingRequest,
  ensureProviderBookingWorkflowDraft,
  loadBookingDetail,
  loadBookingDetailForPage,
  loadProviderBookingWorkflow,
  loadProviderBookingWorkspace,
  manageBookingMember,
  publishProviderBookingWorkflowDraft,
  resolveBookingCreateReplay,
  saveProviderBookingWorkflowDraft,
  saveBookingServiceSettings,
  transitionBookingRequest,
  transitionBookingService,
} from '../repository.server'

const SERVICE_ID = '00000000-0000-4000-8000-000000000001'
const REQUEST_ID = '00000000-0000-4000-8000-000000000002'
const PUBLIC_ID = '00000000-0000-4000-8000-000000000003'
const MEMBER_ID = '00000000-0000-4000-8000-000000000004'
const PROFILE_ID = '00000000-0000-4000-8000-000000000005'
const IDEMPOTENCY_ID = '00000000-0000-4000-8000-000000000006'
const WORKFLOW_ID = '00000000-0000-4000-8000-000000000007'
const VERSION_ID = '00000000-0000-4000-8000-000000000008'
const STATE_ID = '00000000-0000-4000-8000-000000000009'

const workflowSummary = {
  id: WORKFLOW_ID,
  revision: 1,
  activeVersionId: VERSION_ID,
  activeVersionNumber: 1,
}

function authorization(signedIn: boolean): BookingAuthorization {
  return {
    user: signedIn ? ({ id: 'user-1' } as never) : null,
    actorUserId: signedIn ? 'user-1' : null,
    canonicalEmail: signedIn ? 'user@example.com' : null,
    sessionHash: 'f'.repeat(64),
    actorKind: 'guest',
    signedIn,
    permissions: {
      canCancel: true,
      canClaim: true,
      canManageMembers: false,
      canMessage: true,
      canTransition: false,
    },
    projection: {
      booking: {
        publicId: PUBLIC_ID,
        status: 'requested',
        accessMode: 'link',
        revision: 1,
        accessVersion: 1,
        requestedLocalDate: '2026-09-12',
        requestedLocalTime: '18:30:00',
        requestedAt: '2026-09-12T18:30:00.000Z',
        contactName: 'Stebbi',
        contactEmail: 'stebbi@example.com',
        contactMessage: 'Kviss',
        createdAt: '2026-08-11T12:00:00.000Z',
      },
      provider: { slug: 'quizbadour', displayName: 'Quizbadour' },
      service: { title: 'Kviss', timezone: 'Atlantic/Reykjavik' },
      discount: { eligibleBps: 1000, appliedBps: null },
      workflowState: {
        systemLabelKey: 'new_request',
        label: null,
        attentionSide: 'provider',
        semanticKind: 'active',
      },
      members: [],
    },
  }
}

function profileChain(data: unknown[] = []) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
  }
  chain.select.mockReturnValue(chain)
  chain.eq.mockReturnValue(chain)
  chain.is.mockReturnValue(chain)
  chain.order.mockReturnValue(chain)
  chain.limit.mockResolvedValue({ data, error: null })
  return chain
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.BOOKINGS_ENABLED = 'true'
  process.env.AUTH_CODE_SECRET = 'booking-test-secret-that-is-at-least-32-bytes'
  mocks.getUser.mockResolvedValue({ data: { user: null } })
  mocks.adminFrom.mockReturnValue(profileChain())
  mocks.adminRpc.mockImplementation(async (name: string) => {
    if (name === 'booking_list_events' || name === 'booking_list_messages') {
      return { data: [], error: null }
    }
    return { data: null, error: null }
  })
})

describe('booking create repository contract', () => {
  it('passes only the provider/day HMAC limiter fields into the atomic create RPC', async () => {
    mocks.adminRpc.mockResolvedValue({
      data: {
        id: REQUEST_ID,
        publicId: PUBLIC_ID,
        businessProfileSlug: 'quizbadour',
        accessMode: 'link',
        accessVersion: 1,
        status: 'requested',
        revision: 1,
        discountBps: null,
        created: true,
      },
      error: null,
    })
    await createBookingRequest({
      serviceId: SERVICE_ID,
      input: {
        businessProfileSlug: 'quizbadour',
        requestId: REQUEST_ID,
        requestedDate: '2026-09-12',
        requestedTime: '18:30',
        contactName: 'Stebbi',
        contactEmail: 'stebbi@example.com',
        contactPhone: '5551234',
        message: 'Kviss',
      },
      requestedAtUtc: '2026-09-12T18:30:00.000Z',
      user: null,
      guestCapabilityDigest: 'b'.repeat(64),
      rateLimit: { hash: 'a'.repeat(64), windowDate: '2026-08-11', maxRequests: 20 },
    })
    expect(mocks.adminRpc).toHaveBeenCalledWith('booking_create_request_for_contact_owner', expect.objectContaining({
      p_rate_limit_hash: 'a'.repeat(64),
      p_rate_limit_window_date: '2026-08-11',
      p_rate_limit_max: 20,
    }))
    expect(JSON.stringify(mocks.adminRpc.mock.calls[0][1])).not.toContain('203.0.113')
  })

  it('never propagates arbitrary database details through repository errors', async () => {
    mocks.adminRpc.mockResolvedValue({
      data: null,
      error: { message: 'private database host and secret detail', code: 'P0001' },
    })
    await expect(createBookingRequest({
      serviceId: SERVICE_ID,
      input: {
        businessProfileSlug: 'quizbadour', requestId: REQUEST_ID,
        requestedDate: '2026-09-12', requestedTime: '18:30', contactName: 'A',
        contactEmail: 'a@example.com', contactPhone: '5551234', message: 'B',
      },
      requestedAtUtc: '2026-09-12T18:30:00.000Z',
      user: null,
      guestCapabilityDigest: 'b'.repeat(64),
      rateLimit: { hash: 'a'.repeat(64), windowDate: '2026-08-11', maxRequests: 20 },
    })).rejects.toThrow('booking_save_failed')
  })

  it('preserves the allowlisted bounded rate-limit code', async () => {
    mocks.adminRpc.mockResolvedValue({
      data: null,
      error: { message: 'booking_rate_limited', details: 'private details' },
    })
    await expect(createBookingRequest({
      serviceId: SERVICE_ID,
      input: {
        businessProfileSlug: 'quizbadour', requestId: REQUEST_ID,
        requestedDate: '2026-09-12', requestedTime: '18:30', contactName: 'A',
        contactEmail: 'a@example.com', contactPhone: '5551234', message: 'B',
      },
      requestedAtUtc: '2026-09-12T18:30:00.000Z',
      user: null,
      guestCapabilityDigest: 'b'.repeat(64),
      rateLimit: { hash: 'a'.repeat(64), windowDate: '2026-08-11', maxRequests: 20 },
    })).rejects.toThrow('booking_rate_limited')
  })

  it('resolves create replay from semantic inputs before current public service state', async () => {
    mocks.adminRpc.mockResolvedValue({
      data: {
        id: REQUEST_ID,
        publicId: PUBLIC_ID,
        businessProfileSlug: 'quizbadour',
        accessMode: 'link',
        accessVersion: 1,
        status: 'requested',
        revision: 1,
        discountBps: null,
        created: false,
      },
      error: null,
    })
    const replay = await resolveBookingCreateReplay({
      input: {
        businessProfileSlug: 'quizbadour', requestId: REQUEST_ID,
        requestedDate: '2026-09-12', requestedTime: '18:30', contactName: 'A',
        contactEmail: 'a@example.com', contactPhone: '5551234', message: 'B',
      },
      user: null,
      guestCapabilityDigest: 'b'.repeat(64),
    })
    expect(replay).toMatchObject({ publicId: PUBLIC_ID, created: false })
    expect(mocks.adminRpc).toHaveBeenCalledWith('booking_resolve_create_replay', {
      p_request_id: REQUEST_ID,
      p_business_profile_slug: 'quizbadour',
      p_creator_user_id: null,
      p_contact_name: 'A',
      p_contact_email: 'a@example.com',
      p_contact_phone: '5551234',
      p_contact_message: 'B',
      p_requested_local_date: '2026-09-12',
      p_requested_local_time: '18:30',
      p_guest_capability_hash: 'b'.repeat(64),
    })
  })
})

describe('booking detail access projection', () => {
  it('shows claim only to a signed-in holder of the guest link', async () => {
    mocks.authorize.mockResolvedValueOnce(authorization(false))
    const anonymous = await loadBookingDetail({ publicId: PUBLIC_ID })
    mocks.authorize.mockResolvedValueOnce(authorization(true))
    const signedIn = await loadBookingDetail({ publicId: PUBLIC_ID })
    expect(anonymous?.permissions).toMatchObject({ signedIn: false, canClaim: false })
    expect(signedIn?.permissions).toMatchObject({ signedIn: true, canClaim: true })
  })

  it('reads and digests the exact HttpOnly session cookie for SSR detail access', async () => {
    const rawSession = 'raw-cookie-token-that-never-enters-the-projection'
    const expectedDigest = digestBookingToken(rawSession)
    mocks.cookieGet.mockReturnValue({ value: rawSession })
    mocks.authorize.mockImplementation(async (input: { sessionHash?: string | null }) => (
      input.sessionHash === expectedDigest ? authorization(false) : null
    ))
    expect(await loadBookingDetailForPage({ publicId: PUBLIC_ID })).not.toBeNull()
    expect(mocks.authorize).toHaveBeenCalledWith(expect.objectContaining({ sessionHash: expectedDigest }))

    mocks.cookieGet.mockReturnValue({ value: 'revoked-or-old-version-token' })
    expect(await loadBookingDetailForPage({ publicId: PUBLIC_ID })).toBeNull()
  })

  it('uses the current live provider slug for canonical detail redirects over the snapshot slug', async () => {
    const current = authorization(false)
    current.projection = {
      ...current.projection,
      businessProfileSlug: 'gamla-slugid',
      provider: { slug: 'nya-slugid', displayName: 'Quizbadour' },
    }
    mocks.authorize.mockResolvedValue(current)
    expect((await loadBookingDetail({ publicId: PUBLIC_ID }))?.businessProfileSlug).toBe('nya-slugid')
  })

  it('marks only the verified current membership email as self', async () => {
    const current = authorization(true)
    current.actorKind = 'member'
    current.projection = {
      ...current.projection,
      booking: { ...(current.projection.booking as object), accessMode: 'members' },
      members: [
        {
          id: MEMBER_ID,
          emailCanonical: 'user@example.com',
          role: 'owner',
          status: 'active',
          createdAt: '2026-08-11T12:00:00.000Z',
        },
        {
          id: '00000000-0000-4000-8000-000000000007',
          emailCanonical: 'other@example.com',
          role: 'member',
          status: 'active',
          createdAt: '2026-08-11T12:01:00.000Z',
        },
      ],
    }
    mocks.authorize.mockResolvedValue(current)
    const detail = await loadBookingDetail({ publicId: PUBLIC_ID })
    expect(detail?.members.map(member => [member.emailCanonical, member.isSelf])).toEqual([
      ['user@example.com', true],
      ['other@example.com', false],
    ])
  })

  it('strips workflow identifiers and provider targets from a customer DTO', async () => {
    const current = authorization(true)
    current.actorKind = 'member'
    current.projection = {
      ...current.projection,
      workflowState: {
        workflowId: WORKFLOW_ID,
        versionId: VERSION_ID,
        stateId: STATE_ID,
        logicalKey: 'custom_customer_safe',
        systemLabelKey: null,
        providerLabel: 'Provider private state',
        customerLabel: 'Customer-safe state',
        attentionSide: 'provider',
        semanticKind: 'active',
      },
      allowedWorkflowTargets: [{
        stateId: MEMBER_ID,
        logicalKey: 'private_target',
        label: 'Provider private target',
        attentionSide: 'provider',
        semanticKind: 'active',
      }],
    }
    mocks.adminRpc.mockImplementation(async (name: string) => {
      if (name === 'booking_list_messages') return { data: [], error: null }
      if (name === 'booking_list_events') {
        return {
          data: [{
            id: REQUEST_ID,
            eventType: 'workflow_state_changed',
            actorName: null,
            createdAt: '2026-08-11T12:01:00.000Z',
            workflowTransition: {
              from: {
                providerLabel: 'Provider private from',
                customerLabel: 'Customer-safe from',
              },
              to: {
                providerLabel: 'Provider private to',
                customerLabel: 'Customer-safe to',
              },
            },
          }],
          error: null,
        }
      }
      return { data: null, error: { message: 'unexpected_rpc' } }
    })
    mocks.authorize.mockResolvedValue(current)
    const detail = await loadBookingDetail({ publicId: PUBLIC_ID })
    expect(detail?.workflowState).toEqual({
      audience: 'customer',
      systemLabelKey: null,
      label: 'Customer-safe state',
      attentionSide: 'provider',
      semanticKind: 'active',
    })
    expect(JSON.stringify(detail?.workflowState)).not.toContain(WORKFLOW_ID)
    expect(JSON.stringify(detail?.workflowState)).not.toContain('private_target')
    expect(detail?.activity[0]?.workflowTransition).toEqual({
      from: { systemLabelKey: null, label: 'Customer-safe from' },
      to: { systemLabelKey: null, label: 'Customer-safe to' },
    })
    expect(JSON.stringify(detail)).not.toContain('Provider private')
  })

  it('returns provider-owned targets but lets cancellation dominate the pinned state', async () => {
    const current = authorization(true)
    current.actorKind = 'provider'
    current.permissions.canTransition = true
    current.projection = {
      ...current.projection,
      workflowState: {
        workflowId: WORKFLOW_ID,
        versionId: VERSION_ID,
        stateId: STATE_ID,
        logicalKey: 'new_request',
        systemLabelKey: 'new_request',
        label: null,
        attentionSide: 'provider',
        semanticKind: 'active',
      },
      allowedWorkflowTargets: [{
        stateId: MEMBER_ID,
        logicalKey: 'under_review',
        systemLabelKey: 'under_review',
        label: null,
        attentionSide: 'provider',
        semanticKind: 'active',
      }],
    }
    mocks.authorize.mockResolvedValue(current)
    const active = await loadBookingDetail({ publicId: PUBLIC_ID })
    expect(active?.workflowState).toMatchObject({
      audience: 'provider',
      workflowId: WORKFLOW_ID,
      allowedNextStates: [{ stateId: MEMBER_ID, logicalKey: 'under_review' }],
    })

    current.projection = {
      ...current.projection,
      booking: {
        ...(current.projection.booking as object),
        status: 'cancelled',
        lifecycleStatus: 'cancelled',
        cancellationReason: 'provider_unavailable',
      },
    }
    mocks.authorize.mockResolvedValue(current)
    const cancelled = await loadBookingDetail({ publicId: PUBLIC_ID })
    expect(cancelled).toMatchObject({
      lifecycleStatus: 'cancelled',
      workflowState: null,
      cancellationReason: 'provider_unavailable',
    })
  })
})

describe('member and provider mutation boundaries', () => {
  it('passes only the stable member id so SQL derives the revoke target email', async () => {
    mocks.adminRpc.mockResolvedValue({ data: {}, error: null })
    await manageBookingMember('actor-1', PUBLIC_ID, {
      expectedAccessVersion: 2,
      targetMemberId: MEMBER_ID,
      action: 'revoke',
      idempotencyKey: IDEMPOTENCY_ID,
    })
    expect(mocks.adminRpc).toHaveBeenCalledWith('booking_manage_member', expect.objectContaining({
      p_actor_user_id: 'actor-1',
      p_target_selector: MEMBER_ID,
      p_expected_access_version: 2,
    }))
  })

  it('writes typed cancellation reason and transition target through exact RPCs', async () => {
    mocks.adminRpc.mockResolvedValue({ data: { publicId: PUBLIC_ID, revision: 2 }, error: null })
    await cancelBookingRequest(
      { actorUserId: 'provider-1', sessionHash: null },
      PUBLIC_ID,
      {
        expectedRevision: 1,
        idempotencyKey: IDEMPOTENCY_ID,
        reason: 'provider_unavailable',
      },
    )
    expect(mocks.adminRpc).toHaveBeenCalledWith(
      'booking_cancel_request_with_reason',
      expect.objectContaining({
        p_requested_reason: 'provider_unavailable',
        p_expected_revision: 1,
        p_idempotency_key: IDEMPOTENCY_ID,
      }),
    )

    await transitionBookingRequest('provider-1', PUBLIC_ID, {
      expectedRevision: 1,
      targetStateId: STATE_ID,
      idempotencyKey: IDEMPOTENCY_ID,
    })
    expect(mocks.adminRpc).toHaveBeenCalledWith(
      'booking_transition_request',
      expect.objectContaining({
        p_actor_user_id: 'provider-1',
        p_target_state_id: STATE_ID,
      }),
    )
  })

  it('does not perform a service-role profile read until SQL has asserted provider ownership', async () => {
    mocks.adminRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'booking_provider_not_allowed' },
    })
    await expect(loadProviderBookingWorkspace('actor-1', 'space-1'))
      .rejects.toThrow('booking_provider_load_failed')
    expect(mocks.adminFrom).not.toHaveBeenCalled()
  })

  it('passes stable workflow and attention filters to the authoritative provider RPC', async () => {
    mocks.adminRpc.mockImplementation(async (name: string) => {
      if (name === 'booking_provider_list_services') return { data: [], error: null }
      if (name === 'booking_provider_list_requests') {
        return { data: { items: [], facets: { states: [], attention: [] } }, error: null }
      }
      return { data: null, error: { message: 'unexpected_rpc' } }
    })
    await loadProviderBookingWorkspace('actor-1', 'space-1', {
      workflowId: WORKFLOW_ID,
      stateLogicalKey: 'new_request',
      attentionSide: 'provider',
    })
    expect(mocks.adminRpc).toHaveBeenCalledWith('booking_provider_list_requests', {
      p_actor_id: 'actor-1',
      p_space_id: 'space-1',
      p_service_id: null,
      p_workflow_id: WORKFLOW_ID,
      p_state_logical_key: 'new_request',
      p_attention_side: 'provider',
      p_before_created_at: null,
      p_before_id: null,
      p_limit: 100,
    })
  })

  it('returns an exact null-id create replay and conflicts on changed semantics', async () => {
    const current = {
      id: SERVICE_ID,
      businessProfileId: PROFILE_ID,
      revision: 1,
      title: 'Kviss',
      summary: 'Spurningar og stemning',
      timezone: 'Atlantic/Reykjavik',
      signedInDiscountBps: 1000,
      status: 'draft',
      updatedAt: '2026-08-11T12:00:00.000Z',
      workflow: workflowSummary,
    }
    mocks.adminRpc.mockImplementation(async (name: string) => {
      if (name === 'booking_provider_list_services') return { data: [current], error: null }
      if (name === 'booking_provider_list_requests') {
        return { data: { items: [], facets: { states: [], attention: [] } }, error: null }
      }
      return { data: null, error: null }
    })
    const input = {
      id: null,
      expectedRevision: null,
      businessProfileId: PROFILE_ID,
      title: current.title,
      summary: current.summary,
      timezone: current.timezone,
      signedInDiscountBps: current.signedInDiscountBps,
    }
    await expect(saveBookingServiceSettings('actor-1', 'space-1', input)).resolves.toEqual(current)
    expect(mocks.adminRpc.mock.calls.map((call) => call[0])).not.toContain('booking_upsert_service')
    await expect(saveBookingServiceSettings('actor-1', 'space-1', {
      ...input,
      title: 'Önnur þjónusta',
    })).rejects.toThrow('booking_service_conflict')
  })

  it('forwards the provider transition idempotency key to the upsert RPC', async () => {
    const current = {
      id: SERVICE_ID,
      businessProfileId: PROFILE_ID,
      revision: 1,
      title: 'Kviss',
      summary: null,
      timezone: 'Atlantic/Reykjavik',
      signedInDiscountBps: 1000,
      status: 'draft',
      updatedAt: '2026-08-11T12:00:00.000Z',
      workflow: workflowSummary,
    }
    mocks.adminRpc.mockImplementation(async (name: string) => {
      if (name === 'booking_provider_list_services') return { data: [current], error: null }
      if (name === 'booking_provider_list_requests') {
        return { data: { items: [], facets: { states: [], attention: [] } }, error: null }
      }
      if (name === 'booking_upsert_service') {
        return { data: { ...current, revision: 2, status: 'published' }, error: null }
      }
      return { data: null, error: null }
    })
    await transitionBookingService('actor-1', 'space-1', {
      serviceId: SERVICE_ID,
      expectedRevision: 1,
      transition: 'publish',
      idempotencyKey: IDEMPOTENCY_ID,
    })
    expect(mocks.adminRpc).toHaveBeenCalledWith('booking_upsert_service', expect.objectContaining({
      p_idempotency_key: IDEMPOTENCY_ID,
      p_status: 'published',
    }))
  })

  it('reaches SQL with the original revision/key on a lost provider transition response', async () => {
    const replayed = {
      id: SERVICE_ID,
      businessProfileId: PROFILE_ID,
      revision: 2,
      title: 'Kviss',
      summary: null,
      timezone: 'Atlantic/Reykjavik',
      signedInDiscountBps: 1000,
      status: 'published',
      updatedAt: '2026-08-11T12:01:00.000Z',
      workflow: workflowSummary,
    }
    mocks.adminRpc.mockImplementation(async (name: string) => {
      if (name === 'booking_provider_list_services') return { data: [replayed], error: null }
      if (name === 'booking_provider_list_requests') {
        return { data: { items: [], facets: { states: [], attention: [] } }, error: null }
      }
      if (name === 'booking_upsert_service') return { data: replayed, error: null }
      return { data: null, error: null }
    })
    await transitionBookingService('actor-1', 'space-1', {
      serviceId: SERVICE_ID,
      expectedRevision: 1,
      transition: 'publish',
      idempotencyKey: IDEMPOTENCY_ID,
    })
    expect(mocks.adminRpc).toHaveBeenCalledWith('booking_upsert_service', expect.objectContaining({
      p_expected_revision: 1,
      p_idempotency_key: IDEMPOTENCY_ID,
      p_status: 'published',
    }))
  })

  it('maps nullable system labels and keeps workflow mutations receipt-only', async () => {
    const service = {
      id: SERVICE_ID,
      businessProfileId: PROFILE_ID,
      revision: 1,
      title: 'Kviss',
      summary: null,
      timezone: 'Atlantic/Reykjavik',
      signedInDiscountBps: null,
      status: 'published',
      updatedAt: '2026-08-11T12:00:00.000Z',
      workflow: workflowSummary,
    }
    const graph = {
      id: VERSION_ID,
      versionNumber: 1,
      status: 'published',
      revision: 1,
      graphFingerprint: 'a'.repeat(64),
      publishedAt: '2026-08-11T12:00:00.000Z',
      states: [{
        id: STATE_ID,
        logicalKey: 'new_request',
        systemLabelKey: 'new_request',
        providerLabel: null,
        customerLabel: null,
        sortOrder: 0,
        isInitial: true,
        semanticKind: 'active',
        attentionSide: 'provider',
      }],
      transitions: [],
    }
    const ack = {
      workflowId: WORKFLOW_ID,
      versionId: VERSION_ID,
      workflowRevision: 2,
      versionRevision: 2,
      replayed: false,
    }
    mocks.adminRpc.mockImplementation(async (name: string) => {
      if (name === 'booking_provider_list_services') return { data: [service], error: null }
      if (name === 'booking_provider_read_workflow') {
        return {
          data: {
            workflow: { id: WORKFLOW_ID, serviceId: SERVICE_ID, revision: 1 },
            activeVersion: graph,
            draftVersion: null,
          },
          error: null,
        }
      }
      return { data: ack, error: null }
    })

    await expect(loadProviderBookingWorkflow('provider-1', 'space-1', SERVICE_ID))
      .resolves.toMatchObject({
        workflow: { id: WORKFLOW_ID },
        activeVersion: { states: [{ systemLabelKey: 'new_request', providerLabel: null }] },
      })
    await expect(ensureProviderBookingWorkflowDraft('provider-1', 'space-1', SERVICE_ID, {
      expectedWorkflowRevision: 1,
      idempotencyKey: IDEMPOTENCY_ID,
    })).resolves.toMatchObject(ack)
    await expect(saveProviderBookingWorkflowDraft('provider-1', 'space-1', SERVICE_ID, {
      draftVersionId: VERSION_ID,
      expectedRevision: 1,
      graph: { states: graph.states as never, transitions: [] },
      idempotencyKey: IDEMPOTENCY_ID,
    })).resolves.toMatchObject(ack)
    await expect(publishProviderBookingWorkflowDraft('provider-1', 'space-1', SERVICE_ID, {
      draftVersionId: VERSION_ID,
      expectedRevision: 1,
      idempotencyKey: IDEMPOTENCY_ID,
    })).resolves.toMatchObject(ack)
    expect(mocks.adminRpc).toHaveBeenCalledWith(
      'booking_provider_save_workflow_draft',
      expect.objectContaining({ p_graph: expect.any(Object) }),
    )
  })

  it('separates a hidden workflow from an operational editor load failure', async () => {
    mocks.adminRpc.mockImplementation(async (name: string) => {
      if (name === 'booking_provider_list_services') return { data: [], error: null }
      return { data: null, error: { message: 'booking_workflow_not_found', code: 'P0001' } }
    })
    await expect(loadProviderBookingWorkflow('provider-1', 'space-1', SERVICE_ID))
      .resolves.toBeNull()

    mocks.adminRpc.mockImplementation(async (name: string) => {
      if (name === 'booking_provider_list_services') return { data: [], error: null }
      return { data: null, error: { message: 'private connection failure', code: '08006' } }
    })
    await expect(loadProviderBookingWorkflow('provider-1', 'space-1', SERVICE_ID))
      .rejects.toThrow('booking_provider_load_failed')
  })
})
