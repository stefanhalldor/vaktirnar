// app/api/sessions/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server'
import { store } from '@/lib/store';
import { generateSessionId, generateEditKey } from '@/lib/utils';
import { Session } from '@/lib/types';
import { legacyGuard } from '@/lib/legacy/guard';
import { guardLegacyAccess } from '@/lib/legacy/access'

export async function POST(request: NextRequest) {
  const guard = legacyGuard(); if (guard) return guard;

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ag = await guardLegacyAccess(user.id)
  if (ag) return ag

  try {
    const sessionId = generateSessionId();
    const editKey = generateEditKey();

    const session: Session = {
      id: sessionId,
      editKey,
      createdAt: new Date().toISOString(),
      status: 'open',
    };

    await store.createSession(session);

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const viewLink = `${baseUrl}/s/${sessionId}`;
    const editLink = `${baseUrl}/s/${sessionId}?key=${editKey}`;

    return NextResponse.json({
      sessionId,
      editKey,
      viewLink,
      editLink,
    });
  } catch (error) {
    console.error('[sessions] create failed');
    return NextResponse.json(
      { error: 'Failed to create session' },
      { status: 500 }
    );
  }
}
