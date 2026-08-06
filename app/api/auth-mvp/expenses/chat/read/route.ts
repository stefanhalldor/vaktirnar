import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isValidUuid } from '@/lib/chat/api.server'
import {
  EXPENSE_CHAT_DOMAIN,
  EXPENSE_CHAT_TARGET_TYPE,
  resolveExpenseChatAccess,
} from '@/lib/chat/adapters/expense.server'
import { assertThreadTarget, markThreadRead } from '@/lib/chat/repository.server'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const expenseId = body?.expenseId
  const threadId = body?.threadId
  if (!isValidUuid(expenseId) || !isValidUuid(threadId)) {
    return NextResponse.json({ error: 'Invalid context' }, { status: 400 })
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const access = await resolveExpenseChatAccess(user, expenseId)
  if (access.status === 'no-session') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (access.status !== 'allowed') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  try {
    await assertThreadTarget(threadId, {
      domain: EXPENSE_CHAT_DOMAIN,
      targetType: EXPENSE_CHAT_TARGET_TYPE,
      targetId: expenseId,
    })
    await markThreadRead(threadId, access.user.id)
    return new NextResponse(null, { status: 204 })
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}
