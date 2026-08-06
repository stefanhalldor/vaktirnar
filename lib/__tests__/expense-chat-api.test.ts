import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  resolveAccess: vi.fn(),
  assertThreadTarget: vi.fn(),
  listMessages: vi.fn(),
  postMessage: vi.fn(),
  markThreadRead: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}))
vi.mock('@/lib/chat/adapters/expense.server', () => ({
  EXPENSE_CHAT_DOMAIN: 'expenses',
  EXPENSE_CHAT_TARGET_TYPE: 'expense_item',
  resolveExpenseChatAccess: mocks.resolveAccess,
}))
vi.mock('@/lib/chat/repository.server', () => ({
  assertThreadTarget: mocks.assertThreadTarget,
  listMessages: mocks.listMessages,
  postMessage: mocks.postMessage,
  markThreadRead: mocks.markThreadRead,
}))

import { GET as getMessages, POST as postMessage } from '@/app/api/auth-mvp/expenses/chat/messages/route'
import { POST as markRead } from '@/app/api/auth-mvp/expenses/chat/read/route'

const expenseId = '00000000-0000-4000-8000-000000000001'
const threadId = '00000000-0000-4000-8000-000000000002'
const clientMessageId = '00000000-0000-4000-8000-000000000003'
const idempotencyKey = '00000000-0000-4000-8000-000000000004'
const user = { id: 'user-1', email: 'stefan@example.com' }

function request(body: unknown, path = '/api/auth-mvp/expenses/chat/messages') {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUser.mockResolvedValue({ data: { user } })
  mocks.resolveAccess.mockResolvedValue({ status: 'allowed', user, expense: { id: expenseId } })
  mocks.assertThreadTarget.mockResolvedValue(undefined)
  mocks.listMessages.mockResolvedValue([])
  mocks.postMessage.mockResolvedValue({ id: 'message-1', body: 'Sæl' })
  mocks.markThreadRead.mockResolvedValue(undefined)
})

describe('expense context chat API', () => {
  it('re-authorizes and exact-fences every message read', async () => {
    const url = new URL('http://localhost/api/auth-mvp/expenses/chat/messages')
    url.searchParams.set('expenseId', expenseId)
    url.searchParams.set('threadId', threadId)
    const response = await getMessages(new NextRequest(url))

    expect(response.status).toBe(200)
    expect(mocks.resolveAccess).toHaveBeenCalledWith(user, expenseId)
    expect(mocks.assertThreadTarget).toHaveBeenCalledWith(threadId, {
      domain: 'expenses', targetType: 'expense_item', targetId: expenseId,
    })
    expect(mocks.listMessages).toHaveBeenCalledWith(threadId, expect.objectContaining({
      authorNameMode: 'full',
    }))
  })

  it('returns 404 before reading when a thread does not belong to the expense', async () => {
    mocks.assertThreadTarget.mockRejectedValueOnce(new Error('chat: not found'))
    const url = new URL('http://localhost/api/auth-mvp/expenses/chat/messages')
    url.searchParams.set('expenseId', expenseId)
    url.searchParams.set('threadId', threadId)
    const response = await getMessages(new NextRequest(url))

    expect(response.status).toBe(404)
    expect(mocks.listMessages).not.toHaveBeenCalled()
  })

  it('passes durable retry identifiers when posting a message', async () => {
    const response = await postMessage(request({
      expenseId, threadId, body: '  Sæl  ', clientMessageId, idempotencyKey,
    }))

    expect(response.status).toBe(201)
    expect(mocks.postMessage).toHaveBeenCalledWith(
      threadId,
      user.id,
      { body: '  Sæl  ', messageKind: 'chat' },
      { clientMessageId, idempotencyKey, authorNameMode: 'full' },
    )
  })

  it('re-authorizes and exact-fences read-cursor writes', async () => {
    const response = await markRead(request(
      { expenseId, threadId },
      '/api/auth-mvp/expenses/chat/read',
    ))

    expect(response.status).toBe(204)
    expect(mocks.assertThreadTarget).toHaveBeenCalledWith(threadId, {
      domain: 'expenses', targetType: 'expense_item', targetId: expenseId,
    })
    expect(mocks.markThreadRead).toHaveBeenCalledWith(threadId, user.id)
  })

  it('fails closed when expense access is denied', async () => {
    mocks.resolveAccess.mockResolvedValueOnce({ status: 'forbidden' })
    const response = await postMessage(request({
      expenseId, threadId, body: 'Sæl', clientMessageId, idempotencyKey,
    }))

    expect(response.status).toBe(403)
    expect(mocks.assertThreadTarget).not.toHaveBeenCalled()
    expect(mocks.postMessage).not.toHaveBeenCalled()
  })
})
