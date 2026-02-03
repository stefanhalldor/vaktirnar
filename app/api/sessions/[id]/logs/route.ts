// app/api/sessions/[id]/logs/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { store } from '@/lib/store';
import { LogEntry, ActivityCategory, LogStatus } from '@/lib/types';

const createLogSchema = z.object({
  kidIds: z.array(z.string()).min(1),
  category: z.enum(['screen', 'physical', 'other'] as const),
  minutes: z.number().optional(),
  startedAt: z.string(),
  note: z.string().optional(),
  status: z.enum(['active', 'completed'] as const),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const sessionId = params.id;
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
    const data = createLogSchema.parse(body);

    const log: LogEntry = {
      id: crypto.randomUUID(),
      sessionId,
      ...data,
      createdAt: new Date().toISOString(),
    };

    await store.createLog(log);

    return NextResponse.json(log);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error creating log:', error);
    return NextResponse.json(
      { error: 'Failed to create log' },
      { status: 500 }
    );
  }
}
