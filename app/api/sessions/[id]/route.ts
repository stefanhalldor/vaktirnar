// app/api/sessions/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/lib/store';
import { SessionData } from '@/lib/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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
    const kids = await store.getKidsBySession(id);
    const logs = await store.getLogsBySession(id);

    const data: SessionData = {
      session,
      kids,
      logs,
      hasEditAccess,
    };

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching session:', error);
    return NextResponse.json(
      { error: 'Failed to fetch session' },
      { status: 500 }
    );
  }
}
