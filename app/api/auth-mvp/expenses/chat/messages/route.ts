import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isValidTimestampCursor, isValidUuid } from '@/lib/chat/api.server'
import {
  EXPENSE_CHAT_DOMAIN,
  EXPENSE_CHAT_TARGET_TYPE,
  resolveExpenseChatAccess,
} from '@/lib/chat/adapters/expense.server'
import { assertThreadTarget, listMessages, postMessage } from '@/lib/chat/repository.server'

function accessError(status: 'no-session' | 'disabled' | 'forbidden' | 'not-found') {
  if (status === 'no-session') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (status === 'disabled') return NextResponse.json({ error: 'Chat disabled' }, { status: 503 })
  if (status === 'not-found') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

async function authorize(expenseId: string, threadId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const access = await resolveExpenseChatAccess(user, expenseId)
  if (access.status !== 'allowed') {
    return { ok: false, response: accessError(access.status) } as const
  }
  try {
    await assertThreadTarget(threadId, {
      domain: EXPENSE_CHAT_DOMAIN,
      targetType: EXPENSE_CHAT_TARGET_TYPE,
      targetId: expenseId,
    })
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Not found' }, { status: 404 }),
    } as const
  }
  return { ok: true, access } as const
}

export async function GET(request: NextRequest) {
  const expenseId = request.nextUrl.searchParams.get('expenseId')
  const threadId = request.nextUrl.searchParams.get('threadId')
  if (!isValidUuid(expenseId) || !isValidUuid(threadId)) {
    return NextResponse.json({ error: 'Invalid context' }, { status: 400 })
  }
  const beforeRaw = request.nextUrl.searchParams.get('before')
  if (beforeRaw !== null && !isValidTimestampCursor(beforeRaw)) {
    return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 })
  }
  const limitRaw = Number.parseInt(request.nextUrl.searchParams.get('limit') ?? '20', 10)
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 20
  const authorization = await authorize(expenseId, threadId)
  if (!authorization.ok) return authorization.response
  try {
    const messages = await listMessages(threadId, {
      limit,
      before: beforeRaw ?? undefined,
      authorNameMode: 'full',
    })
    return NextResponse.json(messages)
  } catch {
    return NextResponse.json({ error: 'Messages unavailable' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const expenseId = body?.expenseId
  const threadId = body?.threadId
  const messageBody = body?.body
  const clientMessageId = body?.clientMessageId
  const idempotencyKey = body?.idempotencyKey
  if (
    !isValidUuid(expenseId)
    || !isValidUuid(threadId)
    || !isValidUuid(clientMessageId)
    || !isValidUuid(idempotencyKey)
  ) {
    return NextResponse.json({ error: 'Invalid context' }, { status: 400 })
  }
  if (typeof messageBody !== 'string' || messageBody.trim().length === 0) {
    return NextResponse.json({ error: 'Message required' }, { status: 400 })
  }
  if (messageBody.length > 1000) {
    return NextResponse.json({ error: 'Message too long' }, { status: 400 })
  }
  const authorization = await authorize(expenseId, threadId)
  if (!authorization.ok) return authorization.response
  try {
    const message = await postMessage(
      threadId,
      authorization.access.user.id,
      { body: messageBody, messageKind: 'chat' },
      { clientMessageId, idempotencyKey, authorNameMode: 'full' },
    )
    return NextResponse.json(message, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'chat: idempotency conflict') {
      return NextResponse.json({ error: 'Message conflict' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Message send failed' }, { status: 500 })
  }
}
