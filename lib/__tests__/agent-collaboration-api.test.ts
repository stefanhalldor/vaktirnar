import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  userRpc: vi.fn(),
  adminRpc: vi.fn(),
  hasBetaAccess: vi.fn(),
}))

vi.mock('@/lib/agent-collaboration/access.server', () => ({
  AGENT_COLLABORATION_FEATURE_KEY: 'agent-collaboration-private-beta',
  hasAgentCollaborationBetaAccess: mocks.hasBetaAccess,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.userRpc,
  })),
}))

vi.mock('@/lib/supabase/admin', () => ({
  getAdmin: vi.fn(() => ({ rpc: mocks.adminRpc })),
}))

import { GET as bootstrapGet } from '@/app/api/auth-mvp/agent-collaboration/bootstrap/route'
import { GET as summaryGet } from '@/app/api/auth-mvp/agent-collaboration/summary/route'
import {
  GET as messagesGet,
  POST as messagesPost,
} from '@/app/api/auth-mvp/agent-collaboration/messages/route'
import { POST as readPost } from '@/app/api/auth-mvp/agent-collaboration/read/route'
import { POST as userPairingPost } from '@/app/api/auth-mvp/agent-collaboration/pairings/route'
import { DELETE as connectorDelete } from '@/app/api/auth-mvp/agent-collaboration/connectors/[id]/route'
import { POST as pairPost } from '@/app/api/agent-bridge/v1/pair/route'
import { POST as claimPost } from '@/app/api/agent-bridge/v1/claim/route'
import { POST as completePost } from '@/app/api/agent-bridge/v1/complete/route'
import { POST as heartbeatPost } from '@/app/api/agent-bridge/v1/heartbeat/route'
import { POST as failPost } from '@/app/api/agent-bridge/v1/fail/route'
import { resetPairingRateLimitsForTests } from '@/lib/agent-collaboration/pair-rate-limit.server'

const CONVERSATION_ID = '00000000-0000-4000-8000-000000000001'
const MESSAGE_ID = '00000000-0000-4000-8000-000000000002'
const RUN_ID = '00000000-0000-4000-8000-000000000003'
const LEASE_ID = '00000000-0000-4000-8000-000000000004'
const RUNNER_ID = '00000000-0000-4000-8000-000000000005'
const CONNECTOR_ID = '00000000-0000-4000-8000-000000000006'
const VALID_TOKEN = `tsa_${'A'.repeat(43)}`

function jsonRequest(url: string, body: unknown, headers?: Record<string, string>) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

let savedAuthMvp: string | undefined
let savedAgentCollaboration: string | undefined
let savedAuthCodeSecret: string | undefined

beforeAll(() => {
  savedAuthMvp = process.env.AUTH_MVP_ENABLED
  savedAgentCollaboration = process.env.AGENT_COLLABORATION_ENABLED
  savedAuthCodeSecret = process.env.AUTH_CODE_SECRET
})

afterAll(() => {
  if (savedAuthMvp === undefined) delete process.env.AUTH_MVP_ENABLED
  else process.env.AUTH_MVP_ENABLED = savedAuthMvp
  if (savedAgentCollaboration === undefined) delete process.env.AGENT_COLLABORATION_ENABLED
  else process.env.AGENT_COLLABORATION_ENABLED = savedAgentCollaboration
  if (savedAuthCodeSecret === undefined) delete process.env.AUTH_CODE_SECRET
  else process.env.AUTH_CODE_SECRET = savedAuthCodeSecret
})

beforeEach(() => {
  vi.clearAllMocks()
  resetPairingRateLimitsForTests()
  process.env.AUTH_MVP_ENABLED = 'true'
  process.env.AGENT_COLLABORATION_ENABLED = 'true'
  process.env.AUTH_CODE_SECRET = 'test-agent-collaboration-secret-'.repeat(2)
  mocks.getUser.mockResolvedValue({
    data: { user: { id: 'user-1', email: 'user@example.com' } },
  })
  mocks.hasBetaAccess.mockResolvedValue(true)
})

describe('agent collaboration feature boundary', () => {
  it('fails closed in every browser handler before auth or RPC work', async () => {
    process.env.AGENT_COLLABORATION_ENABLED = 'false'
    const disabledCalls = [
      () => bootstrapGet(),
      () => summaryGet(),
      () => messagesGet(new NextRequest(
        `http://localhost/api/auth-mvp/agent-collaboration/messages?conversationId=${CONVERSATION_ID}`,
      )),
      () => messagesPost(jsonRequest(
        'http://localhost/api/auth-mvp/agent-collaboration/messages',
        {},
      )),
      () => readPost(jsonRequest(
        'http://localhost/api/auth-mvp/agent-collaboration/read',
        {},
      )),
      () => userPairingPost(jsonRequest(
        'http://localhost/api/auth-mvp/agent-collaboration/pairings',
        {},
      )),
      () => connectorDelete(
        new NextRequest(
          `http://localhost/api/auth-mvp/agent-collaboration/connectors/${CONNECTOR_ID}`,
          { method: 'DELETE' },
        ),
        { params: Promise.resolve({ id: CONNECTOR_ID }) },
      ),
    ]

    for (const call of disabledCalls) {
      const response = await call()
      expect(response.status).toBe(404)
      expect(response.headers.get('cache-control')).toBe('private, no-store')
      expect(await response.json()).toEqual({ error: 'not_found' })
    }
    expect(mocks.getUser).not.toHaveBeenCalled()
    expect(mocks.userRpc).not.toHaveBeenCalled()
    expect(mocks.adminRpc).not.toHaveBeenCalled()
  })

  it('fails closed in every public bridge handler before token or RPC work', async () => {
    process.env.AGENT_COLLABORATION_ENABLED = 'False'
    const request = () => jsonRequest(
      'http://localhost/api/agent-bridge/v1/action',
      {},
      { authorization: `Bearer ${VALID_TOKEN}` },
    )
    for (const handler of [pairPost, claimPost, heartbeatPost, completePost, failPost]) {
      const response = await handler(request())
      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({ error: 'not_found' })
    }
    expect(mocks.adminRpc).not.toHaveBeenCalled()
  })
})

describe('authenticated agent collaboration API', () => {
  it('rejects cross-origin and non-JSON browser mutations before auth', async () => {
    const crossOrigin = await messagesPost(jsonRequest(
      'http://localhost/api/auth-mvp/agent-collaboration/messages',
      {},
      { origin: 'https://attacker.example', 'sec-fetch-site': 'cross-site' },
    ))
    expect(crossOrigin.status).toBe(403)

    const nonJson = await messagesPost(new NextRequest(
      'http://localhost/api/auth-mvp/agent-collaboration/messages',
      { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' },
    ))
    expect(nonJson.status).toBe(415)
    expect(mocks.getUser).not.toHaveBeenCalled()
    expect(mocks.userRpc).not.toHaveBeenCalled()
  })

  it('rejects a missing session before touching collaboration data', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    const response = await bootstrapGet()
    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.userRpc).not.toHaveBeenCalled()
    expect(mocks.hasBetaAccess).not.toHaveBeenCalled()
  })

  it('hides every browser surface from a signed-in user outside the private beta', async () => {
    mocks.hasBetaAccess.mockResolvedValue(false)
    const deniedCalls = [
      () => bootstrapGet(),
      () => summaryGet(),
      () => messagesGet(new NextRequest(
        `http://localhost/api/auth-mvp/agent-collaboration/messages?conversationId=${CONVERSATION_ID}`,
      )),
      () => messagesPost(jsonRequest(
        'http://localhost/api/auth-mvp/agent-collaboration/messages',
        {
          conversationId: CONVERSATION_ID,
          body: 'Private beta request',
          clientMessageId: MESSAGE_ID,
          idempotencyKey: 'private-beta-denied',
        },
      )),
      () => readPost(jsonRequest(
        'http://localhost/api/auth-mvp/agent-collaboration/read',
        { conversationId: CONVERSATION_ID, lastReadMessageId: MESSAGE_ID },
      )),
      () => userPairingPost(jsonRequest(
        'http://localhost/api/auth-mvp/agent-collaboration/pairings',
        { conversationId: CONVERSATION_ID, providerKey: 'codex', displayName: 'Codex' },
      )),
      () => connectorDelete(
        new NextRequest(
          `http://localhost/api/auth-mvp/agent-collaboration/connectors/${CONNECTOR_ID}`,
          { method: 'DELETE' },
        ),
        { params: Promise.resolve({ id: CONNECTOR_ID }) },
      ),
    ]

    for (const call of deniedCalls) {
      const response = await call()
      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({ error: 'not_found' })
    }
    expect(mocks.userRpc).not.toHaveBeenCalled()
  })

  it('returns a tenant-scoped bootstrap without exposing owner identity', async () => {
    mocks.userRpc.mockResolvedValue({
      data: {
        conversation: { id: CONVERSATION_ID, title: 'Vinnuspjall' },
        connectors: [],
        unreadCount: 2,
        latestRun: null,
      },
      error: null,
    })
    const response = await bootstrapGet()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      conversation: { id: CONVERSATION_ID, title: 'Vinnuspjall' },
      connectors: [],
      unreadCount: 2,
      latestRun: null,
    })
    expect(mocks.userRpc).toHaveBeenCalledWith('teskeid_agent_bootstrap', undefined)
  })

  it('rejects malformed messages before RPC work', async () => {
    const response = await messagesPost(jsonRequest(
      'http://localhost/api/auth-mvp/agent-collaboration/messages',
      { conversationId: CONVERSATION_ID, body: '' },
    ))
    expect(response.status).toBe(400)
    expect(mocks.userRpc).not.toHaveBeenCalled()
  })

  it('rejects an idempotency key outside the SQL character contract', async () => {
    const response = await messagesPost(jsonRequest(
      'http://localhost/api/auth-mvp/agent-collaboration/messages',
      {
        conversationId: CONVERSATION_ID,
        body: 'Valid body',
        clientMessageId: MESSAGE_ID,
        idempotencyKey: 'invalid key!',
      },
    ))
    expect(response.status).toBe(400)
    expect(mocks.userRpc).not.toHaveBeenCalled()
  })

  it('maps a user message to the reusable chat DTO and keeps mode server-controlled', async () => {
    mocks.userRpc.mockResolvedValue({
      data: {
        id: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        body: 'Já, deployaðu þessu',
        actorType: 'user',
        authorName: 'Notandi',
        createdAt: '2026-07-27T20:00:00.000Z',
      },
      error: null,
    })
    const response = await messagesPost(jsonRequest(
      'http://localhost/api/auth-mvp/agent-collaboration/messages',
      {
        conversationId: CONVERSATION_ID,
        body: 'Já, deployaðu þessu',
        clientMessageId: MESSAGE_ID,
        idempotencyKey: 'message-idempotency-1',
      },
    ))
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({
      id: MESSAGE_ID,
      threadId: CONVERSATION_ID,
      messageKind: 'chat',
      body: 'Já, deployaðu þessu',
    })
    expect(mocks.userRpc).toHaveBeenCalledWith('teskeid_agent_send_message', {
      p_conversation_id: CONVERSATION_ID,
      p_body: 'Já, deployaðu þessu',
      p_client_message_id: MESSAGE_ID,
      p_idempotency_key: 'message-idempotency-1',
    })
    // No client field can request write/deploy/SQL capability. SQL95 always
    // creates read_only_reply runs for this RPC.
    expect(JSON.stringify(mocks.userRpc.mock.calls[0][1])).not.toMatch(/capabilit|deploy_mode|write_mode/)
  })

  it('returns a bounded rate-limit response without exposing database details', async () => {
    mocks.userRpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'agent_rate_limited', details: 'private details' },
    })
    const response = await messagesPost(jsonRequest(
      'http://localhost/api/auth-mvp/agent-collaboration/messages',
      {
        conversationId: CONVERSATION_ID,
        body: 'One more message',
        clientMessageId: MESSAGE_ID,
        idempotencyKey: 'message-idempotency-2',
      },
    ))
    expect(response.status).toBe(429)
    expect(await response.json()).toEqual({ error: 'rate_limited' })
  })

  it('maps a foreign or missing conversation to the same 404', async () => {
    mocks.userRpc.mockResolvedValue({ data: null, error: { code: '42501' } })
    const url = new URL('http://localhost/api/auth-mvp/agent-collaboration/messages')
    url.searchParams.set('conversationId', CONVERSATION_ID)
    const response = await messagesGet(new NextRequest(url))
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'not_found' })
  })

  it('requires both timestamp and id for stable pagination', async () => {
    const url = new URL('http://localhost/api/auth-mvp/agent-collaboration/messages')
    url.searchParams.set('conversationId', CONVERSATION_ID)
    url.searchParams.set('before', '2026-07-27T20:00:00.000Z')
    const response = await messagesGet(new NextRequest(url))
    expect(response.status).toBe(400)
    expect(mocks.userRpc).not.toHaveBeenCalled()
  })

  it('marks only the exact message observed by the browser as read', async () => {
    mocks.userRpc.mockResolvedValue({ data: true, error: null })
    const response = await readPost(jsonRequest(
      'http://localhost/api/auth-mvp/agent-collaboration/read',
      { conversationId: CONVERSATION_ID, lastReadMessageId: MESSAGE_ID },
    ))
    expect(response.status).toBe(200)
    expect(mocks.userRpc).toHaveBeenCalledWith('teskeid_agent_mark_read', {
      p_conversation_id: CONVERSATION_ID,
      p_last_read_message_id: MESSAGE_ID,
    })
  })
})

describe('connector bridge API', () => {
  it('fails closed with the platform auth kill switch', async () => {
    process.env.AUTH_MVP_ENABLED = 'false'
    const response = await claimPost(jsonRequest(
      'http://localhost/api/agent-bridge/v1/claim',
      { protocolVersion: 1, leaseOwnerId: RUNNER_ID },
      { authorization: `Bearer ${VALID_TOKEN}` },
    ))
    expect(response.status).toBe(404)
    expect(mocks.adminRpc).not.toHaveBeenCalled()
  })

  it('exchanges a one-time code for a token while persisting only HMAC hashes', async () => {
    mocks.adminRpc.mockResolvedValue({
      data: {
        connectorId: CONNECTOR_ID,
        providerKey: 'codex',
        displayName: 'Codex',
        tokenExpiresAt: '2026-08-26T20:00:00.000Z',
      },
      error: null,
    })
    const response = await pairPost(jsonRequest(
      'http://localhost/api/agent-bridge/v1/pair',
      {
        protocolVersion: 1,
        code: 'ABCD-EFGH-JKLM',
        provider: 'codex',
        capabilities: ['chat.reply.read_only'],
      },
      { 'x-forwarded-for': '203.0.113.10' },
    ))
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.accessToken).toMatch(/^tsa_[A-Za-z0-9_-]+$/)
    expect(body.tokenExpiresAt).toBe('2026-08-26T20:00:00.000Z')
    expect(mocks.adminRpc).toHaveBeenCalledWith('teskeid_agent_exchange_pairing', {
      p_code_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_token_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_provider_type: 'codex',
    })
    const persisted = JSON.stringify(mocks.adminRpc.mock.calls[0][1])
    expect(persisted).not.toContain('ABCD-EFGH-JKLM')
    expect(persisted).not.toContain(body.accessToken)
  })

  it('requires the single Phase-1 read-only capability', async () => {
    const response = await pairPost(jsonRequest(
      'http://localhost/api/agent-bridge/v1/pair',
      {
        protocolVersion: 1,
        code: 'ABCD-EFGH-JKLM',
        provider: 'codex',
        capabilities: ['workspace.write'],
      },
      { 'x-forwarded-for': '203.0.113.11' },
    ))
    expect(response.status).toBe(400)
    expect(mocks.adminRpc).not.toHaveBeenCalled()
  })

  it('maps invalid pairing credentials to a bounded 401 without database details', async () => {
    mocks.adminRpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'agent_pairing_unavailable', details: 'private details' },
    })
    const response = await pairPost(jsonRequest(
      'http://localhost/api/agent-bridge/v1/pair',
      {
        protocolVersion: 1,
        code: 'ABCD-EFGH-JKLM',
        provider: 'codex',
        capabilities: ['chat.reply.read_only'],
      },
      { 'x-forwarded-for': '203.0.113.12' },
    ))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'connector_unauthorized' })
  })

  it('rejects claim requests without a bearer token before queue access', async () => {
    const response = await claimPost(jsonRequest(
      'http://localhost/api/agent-bridge/v1/claim',
      { protocolVersion: 1, leaseOwnerId: RUNNER_ID },
    ))
    expect(response.status).toBe(401)
    expect(mocks.adminRpc).not.toHaveBeenCalled()
  })

  it('returns only the normalized read-only run envelope', async () => {
    mocks.adminRpc.mockResolvedValue({
      data: {
        id: RUN_ID,
        leaseId: LEASE_ID,
        conversationId: CONVERSATION_ID,
        prompt: 'Rýndu þetta',
        createdAt: '2026-07-27T20:00:00.000Z',
      },
      error: null,
    })
    const response = await claimPost(jsonRequest(
      'http://localhost/api/agent-bridge/v1/claim',
      { protocolVersion: 1, leaseOwnerId: RUNNER_ID },
      { authorization: `Bearer ${VALID_TOKEN}` },
    ))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      run: { id: RUN_ID, mode: 'read_only_reply', prompt: 'Rýndu þetta' },
    })
    const args = mocks.adminRpc.mock.calls[0][1]
    expect(args.p_token_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(args)).not.toContain(VALID_TOKEN)
  })

  it('maps invalid connector and lease credentials to the same bounded 401', async () => {
    mocks.adminRpc.mockResolvedValueOnce({
      data: null,
      error: { code: 'P0001', message: 'agent_connector_unavailable', details: 'do not expose' },
    })
    const claimResponse = await claimPost(jsonRequest(
      'http://localhost/api/agent-bridge/v1/claim',
      { protocolVersion: 1, leaseOwnerId: RUNNER_ID },
      { authorization: `Bearer ${VALID_TOKEN}` },
    ))
    expect(claimResponse.status).toBe(401)
    expect(await claimResponse.json()).toEqual({ error: 'connector_unauthorized' })

    mocks.adminRpc.mockResolvedValueOnce({
      data: null,
      error: { code: 'P0001', message: 'agent_run_lease_unavailable', details: 'do not expose' },
    })
    const heartbeatResponse = await heartbeatPost(jsonRequest(
      'http://localhost/api/agent-bridge/v1/heartbeat',
      {
        protocolVersion: 1,
        runId: RUN_ID,
        leaseId: LEASE_ID,
        leaseOwnerId: RUNNER_ID,
      },
      { authorization: `Bearer ${VALID_TOKEN}` },
    ))
    expect(heartbeatResponse.status).toBe(401)
    expect(await heartbeatResponse.json()).toEqual({ error: 'connector_unauthorized' })
  })

  it('makes duplicate completion idempotent from the immutable run id', async () => {
    mocks.adminRpc.mockResolvedValue({ data: { ok: true, messageId: MESSAGE_ID }, error: null })
    const response = await completePost(jsonRequest(
      'http://localhost/api/agent-bridge/v1/complete',
      {
        protocolVersion: 1,
        runId: RUN_ID,
        leaseId: LEASE_ID,
        leaseOwnerId: RUNNER_ID,
        body: 'Read-only niðurstaða',
      },
      { authorization: `Bearer ${VALID_TOKEN}` },
    ))
    expect(response.status).toBe(200)
    expect(mocks.adminRpc).toHaveBeenCalledWith('teskeid_agent_complete_run', expect.objectContaining({
      p_run_id: RUN_ID,
      p_lease_id: LEASE_ID,
      p_client_message_id: RUN_ID,
      p_idempotency_key: `run:${RUN_ID}:complete`,
    }))
  })

  it('maps a conflicting completion replay to a bounded 409', async () => {
    mocks.adminRpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'agent_run_completion_conflict', details: 'do not expose' },
    })
    const response = await completePost(jsonRequest(
      'http://localhost/api/agent-bridge/v1/complete',
      {
        protocolVersion: 1,
        runId: RUN_ID,
        leaseId: LEASE_ID,
        leaseOwnerId: RUNNER_ID,
        body: 'Different replay',
      },
      { authorization: `Bearer ${VALID_TOKEN}` },
    ))
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'idempotency_conflict' })
  })

  it('rejects invalid supplied completion and failure idempotency headers', async () => {
    const completeResponse = await completePost(jsonRequest(
      'http://localhost/api/agent-bridge/v1/complete',
      {
        protocolVersion: 1,
        runId: RUN_ID,
        leaseId: LEASE_ID,
        leaseOwnerId: RUNNER_ID,
        body: 'Reply',
      },
      { authorization: `Bearer ${VALID_TOKEN}`, 'idempotency-key': 'invalid key!' },
    ))
    expect(completeResponse.status).toBe(400)

    const failResponse = await failPost(jsonRequest(
      'http://localhost/api/agent-bridge/v1/fail',
      {
        protocolVersion: 1,
        runId: RUN_ID,
        leaseId: LEASE_ID,
        leaseOwnerId: RUNNER_ID,
        failureCategory: 'runner_error',
        retryable: true,
      },
      { authorization: `Bearer ${VALID_TOKEN}`, 'idempotency-key': 'invalid key!' },
    ))
    expect(failResponse.status).toBe(400)
    expect(mocks.adminRpc).not.toHaveBeenCalled()
  })

  it('requires and forwards the exact lease generation on heartbeat', async () => {
    mocks.adminRpc.mockResolvedValue({ data: true, error: null })
    const response = await heartbeatPost(jsonRequest(
      'http://localhost/api/agent-bridge/v1/heartbeat',
      {
        protocolVersion: 1,
        runId: RUN_ID,
        leaseId: LEASE_ID,
        leaseOwnerId: RUNNER_ID,
      },
      { authorization: `Bearer ${VALID_TOKEN}` },
    ))
    expect(response.status).toBe(200)
    expect(mocks.adminRpc).toHaveBeenCalledWith('teskeid_agent_heartbeat_run', expect.objectContaining({
      p_run_id: RUN_ID,
      p_lease_id: LEASE_ID,
      p_lease_owner_id: RUNNER_ID,
    }))
  })

  it('uses one stable failure key for a leased run generation', async () => {
    mocks.adminRpc.mockResolvedValue({ data: { ok: true }, error: null })
    const response = await failPost(jsonRequest(
      'http://localhost/api/agent-bridge/v1/fail',
      {
        protocolVersion: 1,
        runId: RUN_ID,
        leaseId: LEASE_ID,
        leaseOwnerId: RUNNER_ID,
        failureCategory: 'runner_error',
        retryable: true,
      },
      { authorization: `Bearer ${VALID_TOKEN}` },
    ))
    expect(response.status).toBe(200)
    expect(mocks.adminRpc).toHaveBeenCalledWith('teskeid_agent_fail_run', expect.objectContaining({
      p_run_id: RUN_ID,
      p_lease_id: LEASE_ID,
      p_failure_idempotency_key: `run:${RUN_ID}:${LEASE_ID}:fail`,
    }))
  })
})
