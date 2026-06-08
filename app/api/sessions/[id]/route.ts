// app/api/sessions/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/lib/store';
import { SessionData } from '@/lib/types';
import { legacyGuard } from '@/lib/legacy/guard';

const SESSION_ID_PATTERN = /^[a-z0-9]{6,16}$/;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = legacyGuard(); if (guard) return guard;
  try {
    const { id } = await params;

    if (!SESSION_ID_PATTERN.test(id)) {
      return NextResponse.json({ error: 'Invalid session ID' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    const session = await store.getSession(id);
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    const hasEditAccess = key === session.editKey;
    const [kids, logs] = await Promise.all([
      store.getKidsBySession(id),
      store.getLogsBySession(id),
    ]);

    const data: SessionData = {
      session: hasEditAccess ? session : { ...session, editKey: '' },
      kids,
      logs,
      hasEditAccess,
    };

    return NextResponse.json(data);
  } catch (error) {
    console.error('[sessions/id] fetch failed');
    return NextResponse.json(
      { error: 'Failed to fetch session' },
      { status: 500 }
    );
  }
}
