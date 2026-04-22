// app/api/sessions/[id]/kids/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { store } from '@/lib/store';
import { Kid } from '@/lib/types';

const SESSION_ID_PATTERN = /^[a-z0-9]{6,16}$/;

const addKidSchema = z.object({
  name: z.string().min(1).max(50),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;

    if (!SESSION_ID_PATTERN.test(sessionId)) {
      return NextResponse.json({ error: 'Invalid session ID' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    const session = await store.getSession(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // Check edit access
    if (key !== session.editKey) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name } = addKidSchema.parse(body);

    const kid: Kid = {
      id: crypto.randomUUID(),
      sessionId,
      name: name.trim(),
      createdAt: new Date().toISOString(),
    };

    await store.createKid(kid);

    return NextResponse.json(kid);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error adding kid:', error);
    return NextResponse.json(
      { error: 'Failed to add kid' },
      { status: 500 }
    );
  }
}
