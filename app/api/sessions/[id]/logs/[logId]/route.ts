// app/api/sessions/[id]/logs/[logId]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { store } from '@/lib/store';

const updateLogSchema = z.object({
  kidIds: z.array(z.string()).optional(),
  category: z.enum(['computer', 'tv', 'outdoors'] as const).optional(),
  minutes: z.number().optional(),
  startedAt: z.string().optional(),
  note: z.string().optional(),
  status: z.enum(['active', 'completed'] as const).optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; logId: string }> }
) {
  try {
    const params = await context.params;
    const sessionId = params.id;
    const logId = params.logId;
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

    const log = await store.getLog(logId);
    if (!log || log.sessionId !== sessionId) {
      return NextResponse.json(
        { error: 'Log not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const updates = updateLogSchema.parse(body);

    const updatedLog = await store.updateLog(logId, updates);

    return NextResponse.json(updatedLog);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error updating log:', error);
    return NextResponse.json(
      { error: 'Failed to update log' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; logId: string }> }
) {
  try {
    const params = await context.params;
    const sessionId = params.id;
    const logId = params.logId;
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

    const log = await store.getLog(logId);
    if (!log || log.sessionId !== sessionId) {
      return NextResponse.json(
        { error: 'Log not found' },
        { status: 404 }
      );
    }

    await store.deleteLog(logId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting log:', error);
    return NextResponse.json(
      { error: 'Failed to delete log' },
      { status: 500 }
    );
  }
}
