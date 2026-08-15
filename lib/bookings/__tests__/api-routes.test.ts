import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  authorize: vi.fn(),
  requireProvider: vi.fn(),
  requireWorkflowActor: vi.fn(),
  resolvePublic: vi.fn(),
  resolveReplay: vi.fn(),
  createRequest: vi.fn(),
  exchange: vi.fn(),
  loadDetail: vi.fn(),
  cancel: vi.fn(),
  transitionRequest: vi.fn(),
  claim: vi.fn(),
  manageMember: vi.fn(),
  listMessages: vi.fn(),
  sendMessage: vi.fn(),
  loadWorkspace: vi.fn(),
  saveService: vi.fn(),
  transitionService: vi.fn(),
  loadWorkflow: vi.fn(),
  ensureWorkflowDraft: vi.fn(),
  saveWorkflowDraft: vi.fn(),
  publishWorkflowDraft: vi.fn(),
}))

vi.mock('../api.server', () => ({
  currentBookingUser: mocks.currentUser,
  authorizeBookingRequest: mocks.authorize,
  bookingActionErrorStatus: (error: string) => ({
    invalid_input: 400,
    unauthorized: 401,
    not_found: 404,
    feature_disabled: 404,
    conflict: 409,
    rate_limited: 429,
    save_failed: 503,
  })[error] ?? 503,
}))

vi.mock('../access.server', () => ({
  requireBookingProviderApi: mocks.requireProvider,
  requireBookingWorkflowMutationActorApi: mocks.requireWorkflowActor,
  authorizeBookingAccess: mocks.authorize,
}))

vi.mock('../repository.server', () => ({
  resolvePublicBookingService: mocks.resolvePublic,
  resolveBookingCreateReplay: mocks.resolveReplay,
  createBookingRequest: mocks.createRequest,
  exchangeBookingCapability: mocks.exchange,
  createdBookingPath: (slug: string, publicId: string) => `/bokanir/${slug}/fyrirspurn/${publicId}`,
  loadBookingDetail: mocks.loadDetail,
  cancelBookingRequest: mocks.cancel,
  transitionBookingRequest: mocks.transitionRequest,
  claimBookingRequest: mocks.claim,
  manageBookingMember: mocks.manageMember,
  listBookingMessages: mocks.listMessages,
  sendBookingMessage: mocks.sendMessage,
  loadProviderBookingWorkspace: mocks.loadWorkspace,
  saveBookingServiceSettings: mocks.saveService,
  transitionBookingService: mocks.transitionService,
  loadProviderBookingWorkflow: mocks.loadWorkflow,
  ensureProviderBookingWorkflowDraft: mocks.ensureWorkflowDraft,
  saveProviderBookingWorkflowDraft: mocks.saveWorkflowDraft,
  publishProviderBookingWorkflowDraft: mocks.publishWorkflowDraft,
}))

import { POST as createPost } from '@/app/api/bookings/public/requests/route'
import { POST as exchangePost } from '@/app/api/bookings/public/requests/[publicId]/exchange/route'
import { POST as actionsPost } from '@/app/api/bookings/requests/[publicId]/actions/route'
import { POST as messagesPost } from '@/app/api/bookings/requests/[publicId]/messages/route'
import { GET as providerGet, POST as providerPost } from '@/app/api/bookings/provider/route'
import {
  GET as workflowGet,
  POST as workflowPost,
} from '@/app/api/bookings/provider/services/[serviceId]/workflow/route'
import { digestBookingToken } from '../security.server'

const SERVICE_ID = '00000000-0000-4000-8000-000000000001'
const REQUEST_ID = '00000000-0000-4000-8000-000000000002'
const PUBLIC_ID = '00000000-0000-4000-8000-000000000003'
const MEMBER_ID = '00000000-0000-4000-8000-000000000004'
const IDEMPOTENCY_ID = '00000000-0000-4000-8000-000000000005'

function jsonRequest(url: string, body: unknown, extraHeaders: Record<string, string> = {}) {
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: new URL(url).origin,
      'sec-fetch-site': 'same-origin',
      'x-forwarded-for': '203.0.113.44',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  })
}

function validCreate() {
  return {
    businessProfileSlug: 'quizbadour',
    requestId: REQUEST_ID,
    requestedDate: '2026-09-12',
    requestedTime: '18:30',
    contactName: 'Stebbi',
    contactEmail: 'stebbi@example.com',
    contactPhone: '5551234',
    message: 'Kviss fyrir afmæli',
    website: '',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.BOOKINGS_ENABLED = 'true'
  process.env.AUTH_CODE_SECRET = 'booking-test-secret-that-is-at-least-32-bytes'
  mocks.currentUser.mockResolvedValue(null)
  mocks.resolveReplay.mockResolvedValue(null)
  mocks.resolvePublic.mockResolvedValue({
    serviceId: SERVICE_ID,
    businessProfileSlug: 'quizbadour',
    view: {
      businessProfile: { slug: 'quizbadour', displayName: 'Quizbadour' },
      service: { title: 'Kviss', timezone: 'Atlantic/Reykjavik', signedInDiscountBps: 1000 },
    },
  })
  mocks.createRequest.mockResolvedValue({
    id: REQUEST_ID,
    publicId: PUBLIC_ID,
    businessProfileSlug: 'quizbadour',
    accessMode: 'link',
    accessVersion: 1,
    status: 'requested',
    revision: 1,
    appliedDiscountBps: null,
    created: true,
  })
  mocks.exchange.mockImplementation(async (input: { publicId: string; sessionExpiresAt: string }) => ({
    publicId: input.publicId,
    accessVersion: 1,
    sessionExpiresAt: input.sessionExpiresAt,
  }))
  mocks.authorize.mockResolvedValue({ actorKind: 'guest' })
  mocks.requireProvider.mockResolvedValue({
    ok: true,
    user: { id: 'provider-1', email: 'provider@example.com' },
    spaceId: 'space-1',
  })
  mocks.requireWorkflowActor.mockResolvedValue({
    ok: true,
    user: { id: 'provider-1', email: 'provider@example.com' },
    spaceId: 'space-1',
  })
  mocks.loadWorkspace.mockResolvedValue({ profiles: [], services: [], requests: [] })
})

describe('public booking intake routes', () => {
  it('creates a guest booking with atomic HMAC limiter inputs and an HttpOnly session cookie', async () => {
    const response = await createPost(jsonRequest(
      'http://localhost/api/bookings/public/requests',
      validCreate(),
    ))
    const body = await response.json()
    expect(response.status).toBe(201)
    expect(body).toMatchObject({
      publicId: PUBLIC_ID,
      accessMode: 'link',
      currentActorHasAccess: true,
      bookingPath: `/bokanir/quizbadour/fyrirspurn/${PUBLIC_ID}`,
    })
    expect(body.guestCapability).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(response.headers.get('set-cookie')).toContain('HttpOnly')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(mocks.createRequest).toHaveBeenCalledWith(expect.objectContaining({
      guestCapabilityDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
      rateLimit: {
        hash: expect.stringMatching(/^[0-9a-f]{64}$/),
        windowDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        maxRequests: 20,
      },
    }))
    expect(mocks.exchange).toHaveBeenCalledWith(expect.objectContaining({
      capabilityDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
      sessionDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
    }))
    expect(JSON.stringify(mocks.exchange.mock.calls[0][0])).not.toContain(body.guestCapability)
  })

  it('creates signed-in access without returning or exchanging a guest capability', async () => {
    mocks.currentUser.mockResolvedValue({
      id: 'user-1',
      email: 'stebbi@example.com',
      email_confirmed_at: '2026-08-11T12:00:00.000Z',
    })
    mocks.createRequest.mockResolvedValue({
      id: REQUEST_ID,
      publicId: PUBLIC_ID,
      businessProfileSlug: 'quizbadour',
      accessMode: 'members',
      accessVersion: 1,
      status: 'requested',
      revision: 1,
      appliedDiscountBps: 1000,
      created: true,
    })
    const response = await createPost(jsonRequest(
      'http://localhost/api/bookings/public/requests',
      validCreate(),
    ))
    expect(await response.json()).toMatchObject({
      accessMode: 'members', guestCapability: null, appliedDiscountBps: 1000,
      currentActorHasAccess: true,
    })
    expect(mocks.exchange).not.toHaveBeenCalled()
    expect(mocks.createRequest).toHaveBeenCalledWith(expect.objectContaining({
      guestCapabilityDigest: null,
    }))
  })

  it('does not claim that a signed-in submitter can open another contact email owner booking', async () => {
    mocks.currentUser.mockResolvedValue({
      id: 'user-1',
      email: 'other@example.com',
      email_confirmed_at: '2026-08-11T12:00:00.000Z',
    })
    mocks.createRequest.mockResolvedValue({
      id: REQUEST_ID,
      publicId: PUBLIC_ID,
      businessProfileSlug: 'quizbadour',
      accessMode: 'members',
      accessVersion: 1,
      status: 'requested',
      revision: 1,
      appliedDiscountBps: 1000,
      created: true,
    })

    const response = await createPost(jsonRequest(
      'http://localhost/api/bookings/public/requests',
      validCreate(),
    ))

    expect(await response.json()).toMatchObject({
      accessMode: 'members',
      currentActorHasAccess: false,
      guestCapability: null,
    })
    expect(mocks.exchange).not.toHaveBeenCalled()
  })

  it('rejects cross-origin mutations before resolving a public service', async () => {
    const response = await createPost(jsonRequest(
      'http://localhost/api/bookings/public/requests',
      validCreate(),
      { origin: 'https://attacker.example', 'sec-fetch-site': 'cross-site' },
    ))
    expect(response.status).toBe(400)
    expect(mocks.resolvePublic).not.toHaveBeenCalled()
  })

  it('returns a bounded 429 without database detail when atomic create exhausts quota', async () => {
    mocks.createRequest.mockRejectedValue(new Error('booking_rate_limited: private detail'))
    const response = await createPost(jsonRequest(
      'http://localhost/api/bookings/public/requests',
      validCreate(),
    ))
    expect(response.status).toBe(429)
    expect(await response.json()).toEqual({ error: 'rate_limited' })
  })

  it('recovers an exact lost-response replay before paused/renamed current provider state', async () => {
    mocks.resolveReplay.mockResolvedValue({
      id: REQUEST_ID,
      publicId: PUBLIC_ID,
      businessProfileSlug: 'quizbadour',
      accessMode: 'link',
      accessVersion: 1,
      status: 'requested',
      revision: 1,
      appliedDiscountBps: null,
      created: false,
    })
    mocks.resolvePublic.mockResolvedValue(null)
    const response = await createPost(jsonRequest(
      'http://localhost/api/bookings/public/requests',
      validCreate(),
    ))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      publicId: PUBLIC_ID,
      businessProfileSlug: 'quizbadour',
      accessMode: 'link',
    })
    expect(mocks.resolvePublic).not.toHaveBeenCalled()
    expect(mocks.createRequest).not.toHaveBeenCalled()
  })

  it('returns conflict for changed semantics with the same create request id before public state', async () => {
    mocks.resolveReplay.mockRejectedValue(new Error('booking_idempotency_conflict'))
    const response = await createPost(jsonRequest(
      'http://localhost/api/bookings/public/requests',
      { ...validCreate(), message: 'Breytt skilaboð' },
    ))
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'conflict' })
    expect(mocks.resolvePublic).not.toHaveBeenCalled()
    expect(mocks.createRequest).not.toHaveBeenCalled()
  })

  it('exchanges a fragment capability for an HttpOnly cookie while sending only hashes to SQL', async () => {
    const capability = 'A'.repeat(43)
    const response = await exchangePost(
      jsonRequest(
        `http://localhost/api/bookings/public/requests/${PUBLIC_ID}/exchange`,
        { capability },
      ),
      { params: Promise.resolve({ publicId: PUBLIC_ID }) },
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toContain('HttpOnly')
    expect(mocks.exchange).toHaveBeenCalledWith(expect.objectContaining({
      publicId: PUBLIC_ID,
      capabilityDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
      sessionDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
    }))
    expect(JSON.stringify(mocks.exchange.mock.calls[0][0])).not.toContain(capability)
  })

  it('canonicalizes an uppercase publicId before exchange and cookie naming', async () => {
    const upper = PUBLIC_ID.toUpperCase()
    const response = await exchangePost(
      jsonRequest(
        `http://localhost/api/bookings/public/requests/${upper}/exchange`,
        { capability: 'B'.repeat(43) },
      ),
      { params: Promise.resolve({ publicId: upper }) },
    )
    expect(response.status).toBe(200)
    expect(mocks.exchange).toHaveBeenCalledWith(expect.objectContaining({ publicId: PUBLIC_ID }))
    expect(response.headers.get('set-cookie')).toContain(PUBLIC_ID.replaceAll('-', ''))
  })

  it('reuses the same valid cookie session across repeated same-browser exchanges', async () => {
    const existingToken = 'C'.repeat(43)
    const cookieName = `teskeid_booking_${PUBLIC_ID.replaceAll('-', '')}`
    mocks.authorize.mockResolvedValue({ actorKind: 'guest' })
    for (let index = 0; index < 2; index += 1) {
      const response = await exchangePost(
        jsonRequest(
          `http://localhost/api/bookings/public/requests/${PUBLIC_ID}/exchange`,
          { capability: 'D'.repeat(43) },
          { cookie: `${cookieName}=${existingToken}` },
        ),
        { params: Promise.resolve({ publicId: PUBLIC_ID }) },
      )
      expect(response.status).toBe(200)
      expect(response.headers.get('set-cookie')).toContain(`${cookieName}=${existingToken}`)
    }
    const sessionDigests = mocks.exchange.mock.calls.map((call) => call[0].sessionDigest)
    expect(new Set(sessionDigests).size).toBe(1)
    expect(mocks.authorize).toHaveBeenCalledTimes(2)
  })

  it('issues a fresh session when the existing cookie is not a valid guest session', async () => {
    const oldToken = 'E'.repeat(43)
    const cookieName = `teskeid_booking_${PUBLIC_ID.replaceAll('-', '')}`
    mocks.authorize.mockResolvedValue(null)
    const response = await exchangePost(
      jsonRequest(
        `http://localhost/api/bookings/public/requests/${PUBLIC_ID}/exchange`,
        { capability: 'F'.repeat(43) },
        { cookie: `${cookieName}=${oldToken}` },
      ),
      { params: Promise.resolve({ publicId: PUBLIC_ID }) },
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).not.toContain(`${cookieName}=${oldToken}`)
    expect(mocks.exchange.mock.calls[0][0].sessionDigest).not.toBe(digestBookingToken(oldToken))
  })
})

describe('booking mutation boundaries', () => {
  it('passes a provider-selected cancellation reason and only the target state intent', async () => {
    mocks.authorize.mockResolvedValue({ actorKind: 'provider', actorUserId: 'provider-1' })
    const cancelResponse = await actionsPost(
      jsonRequest(`http://localhost/api/bookings/requests/${PUBLIC_ID}/actions`, {
        action: 'cancel',
        expectedRevision: 3,
        reason: 'provider_unavailable',
        idempotencyKey: IDEMPOTENCY_ID,
      }),
      { params: Promise.resolve({ publicId: PUBLIC_ID }) },
    )
    expect(cancelResponse.status).toBe(200)
    expect(mocks.cancel).toHaveBeenCalledWith(
      expect.anything(),
      PUBLIC_ID,
      expect.objectContaining({ reason: 'provider_unavailable' }),
    )

    const transitionResponse = await actionsPost(
      jsonRequest(`http://localhost/api/bookings/requests/${PUBLIC_ID}/actions`, {
        action: 'transitionWorkflow',
        expectedRevision: 3,
        targetStateId: MEMBER_ID,
        idempotencyKey: IDEMPOTENCY_ID,
      }),
      { params: Promise.resolve({ publicId: PUBLIC_ID }) },
    )
    expect(transitionResponse.status).toBe(200)
    expect(mocks.transitionRequest).toHaveBeenCalledWith('provider-1', PUBLIC_ID, {
      action: 'transitionWorkflow',
      expectedRevision: 3,
      targetStateId: MEMBER_ID,
      idempotencyKey: IDEMPOTENCY_ID,
    })
  })

  it('passes only memberId from revoke payload into the server-derived member repository path', async () => {
    mocks.authorize.mockResolvedValue({ actorKind: 'member', actorUserId: 'owner-1' })
    const response = await actionsPost(
      jsonRequest(`http://localhost/api/bookings/requests/${PUBLIC_ID}/actions`, {
        action: 'revokeMember',
        expectedAccessVersion: 2,
        memberId: MEMBER_ID,
        idempotencyKey: IDEMPOTENCY_ID,
      }),
      { params: Promise.resolve({ publicId: PUBLIC_ID }) },
    )
    expect(response.status).toBe(200)
    expect(mocks.manageMember).toHaveBeenCalledWith('owner-1', PUBLIC_ID, {
      action: 'revoke',
      expectedAccessVersion: 2,
      targetMemberId: MEMBER_ID,
      idempotencyKey: IDEMPOTENCY_ID,
    })
  })

  it('clears the link session cookie after a successful claim', async () => {
    const response = await actionsPost(
      jsonRequest(`http://localhost/api/bookings/requests/${PUBLIC_ID}/actions`, {
        action: 'claim',
        expectedAccessVersion: 1,
        additionalEmails: [],
        idempotencyKey: IDEMPOTENCY_ID,
      }),
      { params: Promise.resolve({ publicId: PUBLIC_ID }) },
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toMatch(/Max-Age=0/i)
    expect(mocks.claim).toHaveBeenCalled()
  })

  it('hides a failed central authorization behind the same bounded 404', async () => {
    mocks.authorize.mockResolvedValue(null)
    const response = await actionsPost(
      jsonRequest(`http://localhost/api/bookings/requests/${PUBLIC_ID}/actions`, {
        action: 'cancel',
        expectedRevision: 1,
        idempotencyKey: IDEMPOTENCY_ID,
      }),
      { params: Promise.resolve({ publicId: PUBLIC_ID }) },
    )
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ ok: false, error: 'not_found' })
    expect(mocks.cancel).not.toHaveBeenCalled()
  })

  it('lets a verified former owner reach only the SQL replay check after read access is lost', async () => {
    mocks.authorize.mockResolvedValue(null)
    mocks.currentUser.mockResolvedValue({
      id: 'former-owner-1',
      email: 'former-owner@example.com',
      email_confirmed_at: '2026-08-11T12:00:00.000Z',
    })
    const response = await actionsPost(
      jsonRequest(`http://localhost/api/bookings/requests/${PUBLIC_ID}/actions`, {
        action: 'revokeMember',
        expectedAccessVersion: 2,
        memberId: MEMBER_ID,
        idempotencyKey: IDEMPOTENCY_ID,
      }),
      { params: Promise.resolve({ publicId: PUBLIC_ID }) },
    )
    expect(response.status).toBe(200)
    expect(mocks.manageMember).toHaveBeenCalledWith('former-owner-1', PUBLIC_ID, {
      action: 'revoke',
      expectedAccessVersion: 2,
      targetMemberId: MEMBER_ID,
      idempotencyKey: IDEMPOTENCY_ID,
    })
  })

  it('normalizes a rejected verified-user replay fallback to the same bounded 404', async () => {
    mocks.authorize.mockResolvedValue(null)
    mocks.currentUser.mockResolvedValue({
      id: 'unrelated-user-1',
      email: 'unrelated@example.com',
      email_confirmed_at: '2026-08-11T12:00:00.000Z',
    })
    mocks.manageMember.mockRejectedValue(new Error('booking_invalid_input'))
    const response = await actionsPost(
      jsonRequest(`http://localhost/api/bookings/requests/${PUBLIC_ID}/actions`, {
        action: 'revokeMember',
        expectedAccessVersion: 2,
        memberId: MEMBER_ID,
        idempotencyKey: IDEMPOTENCY_ID,
      }),
      { params: Promise.resolve({ publicId: PUBLIC_ID }) },
    )
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ ok: false, error: 'not_found' })
  })

  it('lets SQL resolve cancel and claim lost-response replays after state/actor changes', async () => {
    const cancelPayload = {
      action: 'cancel',
      expectedRevision: 1,
      idempotencyKey: IDEMPOTENCY_ID,
    }
    const firstCancel = await actionsPost(
      jsonRequest(`http://localhost/api/bookings/requests/${PUBLIC_ID}/actions`, cancelPayload),
      { params: Promise.resolve({ publicId: PUBLIC_ID }) },
    )
    mocks.authorize.mockResolvedValue({ actorKind: 'provider' })
    const cancelReplay = await actionsPost(
      jsonRequest(`http://localhost/api/bookings/requests/${PUBLIC_ID}/actions`, cancelPayload),
      { params: Promise.resolve({ publicId: PUBLIC_ID }) },
    )
    expect(firstCancel.status).toBe(200)
    expect(cancelReplay.status).toBe(200)
    expect(mocks.cancel).toHaveBeenCalledTimes(2)

    mocks.authorize
      .mockResolvedValueOnce({ actorKind: 'guest' })
      .mockResolvedValueOnce({ actorKind: 'member' })
    const claimPayload = {
      action: 'claim',
      expectedAccessVersion: 1,
      additionalEmails: [],
      idempotencyKey: '00000000-0000-4000-8000-000000000006',
    }
    const firstClaim = await actionsPost(
      jsonRequest(`http://localhost/api/bookings/requests/${PUBLIC_ID}/actions`, claimPayload),
      { params: Promise.resolve({ publicId: PUBLIC_ID }) },
    )
    const claimReplay = await actionsPost(
      jsonRequest(`http://localhost/api/bookings/requests/${PUBLIC_ID}/actions`, claimPayload),
      { params: Promise.resolve({ publicId: PUBLIC_ID }) },
    )
    expect(firstClaim.status).toBe(200)
    expect(claimReplay.status).toBe(200)
    expect(mocks.claim).toHaveBeenCalledTimes(2)
    expect(mocks.authorize).toHaveBeenLastCalledWith(expect.anything(), PUBLIC_ID, 'read')
  })

  it('lets SQL resolve a send replay after cancellation instead of pre-blocking on canMessage', async () => {
    mocks.sendMessage.mockResolvedValue({
      id: MEMBER_ID,
      threadId: PUBLIC_ID,
      body: 'Sæl!',
      messageKind: 'chat',
      createdAt: '2026-08-11T12:00:00.000Z',
      isDeleted: false,
      isHidden: false,
      authorName: null,
      senderSide: 'customer',
      senderKind: 'guest',
    })
    const payload = {
      body: 'Sæl!',
      clientMessageId: MEMBER_ID,
      idempotencyKey: IDEMPOTENCY_ID,
    }
    for (const actorKind of ['guest', 'member']) {
      mocks.authorize.mockResolvedValueOnce({ actorKind })
      const response = await messagesPost(
        jsonRequest(`http://localhost/api/bookings/requests/${PUBLIC_ID}/messages`, payload),
        { params: Promise.resolve({ publicId: PUBLIC_ID }) },
      )
      expect(response.status).toBe(201)
    }
    expect(mocks.sendMessage).toHaveBeenCalledTimes(2)
    expect(mocks.authorize).toHaveBeenLastCalledWith(expect.anything(), PUBLIC_ID, 'read')
  })
})

describe('provider API boundary', () => {
  it('does not load service-role workspace data when the provider gate denies access', async () => {
    mocks.requireProvider.mockResolvedValue({ ok: false, status: 404 })
    const response = await providerGet(new NextRequest('http://localhost/api/bookings/provider'))
    expect(response.status).toBe(404)
    expect(mocks.loadWorkspace).not.toHaveBeenCalled()
  })

  it('passes transition idempotency through the gated provider endpoint', async () => {
    mocks.transitionService.mockResolvedValue({ id: SERVICE_ID, status: 'published' })
    const response = await providerPost(jsonRequest('http://localhost/api/bookings/provider', {
      action: 'transitionService',
      serviceId: SERVICE_ID,
      expectedRevision: 1,
      transition: 'publish',
      idempotencyKey: IDEMPOTENCY_ID,
    }))
    expect(response.status).toBe(200)
    expect(mocks.transitionService).toHaveBeenCalledWith('provider-1', 'space-1', expect.objectContaining({
      idempotencyKey: IDEMPOTENCY_ID,
    }))
  })

  it('validates and forwards server-side workflow inbox filters', async () => {
    const response = await providerGet(new NextRequest(
      `http://localhost/api/bookings/provider?workflowId=${MEMBER_ID}`
      + '&stateLogicalKey=new_request&attentionSide=provider',
    ))
    expect(response.status).toBe(200)
    expect(mocks.loadWorkspace).toHaveBeenCalledWith('provider-1', 'space-1', {
      workflowId: MEMBER_ID,
      stateLogicalKey: 'new_request',
      attentionSide: 'provider',
    })

    const invalid = await providerGet(new NextRequest(
      `http://localhost/api/bookings/provider?workflowId=${MEMBER_ID}`,
    ))
    expect(invalid.status).toBe(400)
    expect(mocks.loadWorkspace).toHaveBeenCalledTimes(1)
  })
})

describe('provider workflow API boundary', () => {
  it('uses the full provider gate and DB-authorized read for editor data', async () => {
    mocks.loadWorkflow.mockResolvedValue({
      service: { id: SERVICE_ID, title: 'Kviss' },
      workflow: { id: MEMBER_ID, serviceId: SERVICE_ID, revision: 1 },
      activeVersion: {},
      draftVersion: null,
      limits: { maxStates: 20, maxTransitions: 100 },
    })
    const response = await workflowGet(
      new NextRequest(`http://localhost/api/bookings/provider/services/${SERVICE_ID}/workflow`),
      { params: Promise.resolve({ serviceId: SERVICE_ID }) },
    )
    expect(response.status).toBe(200)
    expect(mocks.requireProvider).toHaveBeenCalledOnce()
    expect(mocks.loadWorkflow).toHaveBeenCalledWith('provider-1', 'space-1', SERVICE_ID)
  })

  it('lets a confirmed actor reach only SQL-owned draft replay/fresh authorization', async () => {
    mocks.ensureWorkflowDraft.mockResolvedValue({
      workflowId: MEMBER_ID,
      versionId: REQUEST_ID,
      workflowRevision: 2,
      versionRevision: 1,
      replayed: false,
    })
    const response = await workflowPost(
      jsonRequest(`http://localhost/api/bookings/provider/services/${SERVICE_ID}/workflow`, {
        action: 'ensureDraft',
        expectedWorkflowRevision: 1,
        idempotencyKey: IDEMPOTENCY_ID,
      }),
      { params: Promise.resolve({ serviceId: SERVICE_ID }) },
    )
    expect(response.status).toBe(200)
    expect(mocks.requireWorkflowActor).toHaveBeenCalledOnce()
    expect(mocks.ensureWorkflowDraft).toHaveBeenCalledWith(
      'provider-1',
      'space-1',
      SERVICE_ID,
      expect.objectContaining({ idempotencyKey: IDEMPOTENCY_ID }),
    )
  })

  it('rejects oversized or client-authored workflow mutation fields before SQL', async () => {
    const response = await workflowPost(
      jsonRequest(`http://localhost/api/bookings/provider/services/${SERVICE_ID}/workflow`, {
        action: 'ensureDraft',
        expectedWorkflowRevision: 1,
        idempotencyKey: IDEMPOTENCY_ID,
        actorUserId: 'attacker',
      }),
      { params: Promise.resolve({ serviceId: SERVICE_ID }) },
    )
    expect(response.status).toBe(400)
    expect(mocks.requireWorkflowActor).not.toHaveBeenCalled()
    expect(mocks.ensureWorkflowDraft).not.toHaveBeenCalled()
  })
})
