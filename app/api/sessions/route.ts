// app/api/sessions/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/lib/store';
import { generateSessionId, generateEditKey } from '@/lib/utils';
import { Session } from '@/lib/types';

export async function POST(request: NextRequest) {
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
    console.error('Error creating session:', error);
    return NextResponse.json(
      { error: 'Failed to create session' },
      { status: 500 }
    );
  }
}
