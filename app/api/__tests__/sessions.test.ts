import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock Supabase server client — used by sessions/route.ts and dashboard/route.ts
// after auth was added in the security hardening phase.
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user-id' } } }),
    },
  })),
}))

// Mock legacy access guard — allow access for all sessions/dashboard tests.
vi.mock('@/lib/legacy/access', () => ({
  guardLegacyAccess: vi.fn().mockResolvedValue(null),
}))

// Mock store
const mockStore = {
  createSession: vi.fn(),
  getSession: vi.fn(),
  getKidsBySession: vi.fn(),
  getLogsBySession: vi.fn(),
  createKid: vi.fn(),
  createLog: vi.fn(),
  getLog: vi.fn(),
  updateLog: vi.fn(),
  deleteLog: vi.fn(),
};

vi.mock('@/lib/store', () => ({ store: mockStore }));
vi.mock('@/lib/utils', async () => {
  const actual = await vi.importActual('@/lib/utils');
  return {
    ...actual,
    generateSessionId: () => 'test12session',
    generateEditKey: () => 'testEditKey12345678901234567890ab',
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_BASE_URL = 'http://localhost:3000';
  process.env.LEGACY_ENABLED = 'true';
});

afterEach(() => {
  delete process.env.LEGACY_ENABLED;
});

describe('POST /api/sessions', () => {
  it('creates a session and returns session data', async () => {
    mockStore.createSession.mockResolvedValue({
      id: 'test12session',
      editKey: 'testEditKey12345678901234567890ab',
      createdAt: '2024-01-01',
      status: 'open',
    });

    const { POST } = await import('../sessions/route');
    const request = new NextRequest('http://localhost:3000/api/sessions', { method: 'POST' });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sessionId).toBe('test12session');
    expect(data.editKey).toBe('testEditKey12345678901234567890ab');
    expect(data.viewLink).toContain('/s/test12session');
    expect(data.editLink).toContain('?key=');
  });

  it('returns 500 when store throws', async () => {
    mockStore.createSession.mockRejectedValue(new Error('DB error'));

    const { POST } = await import('../sessions/route');
    const request = new NextRequest('http://localhost:3000/api/sessions', { method: 'POST' });
    const response = await POST(request);

    expect(response.status).toBe(500);
  });
});

describe('GET /api/sessions/[id]', () => {
  it('returns 400 for invalid session ID', async () => {
    const { GET } = await import('../sessions/[id]/route');
    const request = new NextRequest('http://localhost:3000/api/sessions/INVALID!');
    const response = await GET(request, { params: Promise.resolve({ id: 'INVALID!' }) });

    expect(response.status).toBe(400);
  });

  it('returns 404 for nonexistent session', async () => {
    mockStore.getSession.mockResolvedValue(null);

    const { GET } = await import('../sessions/[id]/route');
    const request = new NextRequest('http://localhost:3000/api/sessions/abc123def456');
    const response = await GET(request, { params: Promise.resolve({ id: 'abc123def456' }) });

    expect(response.status).toBe(404);
  });

  it('returns session with hasEditAccess true when key matches', async () => {
    const session = { id: 'abc123def456', editKey: 'correctkey', createdAt: '2024-01-01', status: 'open' };
    mockStore.getSession.mockResolvedValue(session);
    mockStore.getKidsBySession.mockResolvedValue([]);
    mockStore.getLogsBySession.mockResolvedValue([]);

    const { GET } = await import('../sessions/[id]/route');
    const request = new NextRequest('http://localhost:3000/api/sessions/abc123def456?key=correctkey');
    const response = await GET(request, { params: Promise.resolve({ id: 'abc123def456' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.hasEditAccess).toBe(true);
    expect(data.session.editKey).toBe('correctkey');
  });

  it('strips editKey when no edit access', async () => {
    const session = { id: 'abc123def456', editKey: 'secretkey', createdAt: '2024-01-01', status: 'open' };
    mockStore.getSession.mockResolvedValue(session);
    mockStore.getKidsBySession.mockResolvedValue([]);
    mockStore.getLogsBySession.mockResolvedValue([]);

    const { GET } = await import('../sessions/[id]/route');
    const request = new NextRequest('http://localhost:3000/api/sessions/abc123def456?key=wrongkey');
    const response = await GET(request, { params: Promise.resolve({ id: 'abc123def456' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.hasEditAccess).toBe(false);
    expect(data.session.editKey).toBe('');
  });

  it('fetches kids and logs in parallel', async () => {
    const session = { id: 'abc123def456', editKey: 'key', createdAt: '2024-01-01', status: 'open' };
    mockStore.getSession.mockResolvedValue(session);
    mockStore.getKidsBySession.mockResolvedValue([{ id: 'k1', sessionId: 'abc123def456', name: 'Emma', createdAt: '2024-01-01' }]);
    mockStore.getLogsBySession.mockResolvedValue([]);

    const { GET } = await import('../sessions/[id]/route');
    const request = new NextRequest('http://localhost:3000/api/sessions/abc123def456');
    const response = await GET(request, { params: Promise.resolve({ id: 'abc123def456' }) });
    const data = await response.json();

    expect(data.kids).toHaveLength(1);
    expect(data.kids[0].name).toBe('Emma');
  });
});

describe('POST /api/sessions/[id]/kids', () => {
  it('returns 400 for invalid session ID', async () => {
    const { POST } = await import('../sessions/[id]/kids/route');
    const request = new NextRequest('http://localhost:3000/api/sessions/BAD/kids', {
      method: 'POST',
      body: JSON.stringify({ name: 'Emma' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await POST(request, { params: Promise.resolve({ id: 'BAD' }) });

    expect(response.status).toBe(400);
  });

  it('returns 404 for nonexistent session', async () => {
    mockStore.getSession.mockResolvedValue(null);

    const { POST } = await import('../sessions/[id]/kids/route');
    const request = new NextRequest('http://localhost:3000/api/sessions/abc123def456/kids?key=key', {
      method: 'POST',
      body: JSON.stringify({ name: 'Emma' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await POST(request, { params: Promise.resolve({ id: 'abc123def456' }) });

    expect(response.status).toBe(404);
  });

  it('returns 403 for wrong edit key', async () => {
    mockStore.getSession.mockResolvedValue({ id: 'abc123def456', editKey: 'correctkey', createdAt: '2024-01-01', status: 'open' });

    const { POST } = await import('../sessions/[id]/kids/route');
    const request = new NextRequest('http://localhost:3000/api/sessions/abc123def456/kids?key=wrongkey', {
      method: 'POST',
      body: JSON.stringify({ name: 'Emma' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await POST(request, { params: Promise.resolve({ id: 'abc123def456' }) });

    expect(response.status).toBe(403);
  });

  it('returns 400 for invalid body (empty name)', async () => {
    mockStore.getSession.mockResolvedValue({ id: 'abc123def456', editKey: 'key', createdAt: '2024-01-01', status: 'open' });

    const { POST } = await import('../sessions/[id]/kids/route');
    const request = new NextRequest('http://localhost:3000/api/sessions/abc123def456/kids?key=key', {
      method: 'POST',
      body: JSON.stringify({ name: '' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await POST(request, { params: Promise.resolve({ id: 'abc123def456' }) });

    expect(response.status).toBe(400);
  });

  it('returns 400 for name exceeding max length', async () => {
    mockStore.getSession.mockResolvedValue({ id: 'abc123def456', editKey: 'key', createdAt: '2024-01-01', status: 'open' });

    const { POST } = await import('../sessions/[id]/kids/route');
    const request = new NextRequest('http://localhost:3000/api/sessions/abc123def456/kids?key=key', {
      method: 'POST',
      body: JSON.stringify({ name: 'A'.repeat(51) }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await POST(request, { params: Promise.resolve({ id: 'abc123def456' }) });

    expect(response.status).toBe(400);
  });

  it('creates kid on success', async () => {
    mockStore.getSession.mockResolvedValue({ id: 'abc123def456', editKey: 'key', createdAt: '2024-01-01', status: 'open' });
    mockStore.createKid.mockResolvedValue({ id: 'k1', sessionId: 'abc123def456', name: 'Emma', createdAt: '2024-01-01' });

    const { POST } = await import('../sessions/[id]/kids/route');
    const request = new NextRequest('http://localhost:3000/api/sessions/abc123def456/kids?key=key', {
      method: 'POST',
      body: JSON.stringify({ name: '  Emma  ' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await POST(request, { params: Promise.resolve({ id: 'abc123def456' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.name).toBe('Emma');
  });
});

describe('POST /api/sessions/[id]/logs', () => {
  const validSession = { id: 'abc123def456', editKey: 'key', createdAt: '2024-01-01', status: 'open' };

  it('returns 400 for invalid session ID', async () => {
    const { POST } = await import('../sessions/[id]/logs/route');
    const request = new NextRequest('http://localhost:3000/api/sessions/BAD!/logs', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await POST(request, { params: Promise.resolve({ id: 'BAD!' }) });

    expect(response.status).toBe(400);
  });

  it('returns 403 for wrong edit key', async () => {
    mockStore.getSession.mockResolvedValue(validSession);

    const { POST } = await import('../sessions/[id]/logs/route');
    const request = new NextRequest('http://localhost:3000/api/sessions/abc123def456/logs?key=wrong', {
      method: 'POST',
      body: JSON.stringify({
        kidIds: ['550e8400-e29b-41d4-a716-446655440000'],
        category: 'screen',
        startedAt: '2024-01-01T10:00:00.000Z',
        status: 'completed',
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await POST(request, { params: Promise.resolve({ id: 'abc123def456' }) });

    expect(response.status).toBe(403);
  });

  it('returns 400 for invalid body (empty kidIds)', async () => {
    mockStore.getSession.mockResolvedValue(validSession);

    const { POST } = await import('../sessions/[id]/logs/route');
    const request = new NextRequest('http://localhost:3000/api/sessions/abc123def456/logs?key=key', {
      method: 'POST',
      body: JSON.stringify({
        kidIds: [],
        category: 'screen',
        startedAt: '2024-01-01T10:00:00.000Z',
        status: 'completed',
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await POST(request, { params: Promise.resolve({ id: 'abc123def456' }) });

    expect(response.status).toBe(400);
  });

  it('returns 400 for note exceeding max length', async () => {
    mockStore.getSession.mockResolvedValue(validSession);

    const { POST } = await import('../sessions/[id]/logs/route');
    const request = new NextRequest('http://localhost:3000/api/sessions/abc123def456/logs?key=key', {
      method: 'POST',
      body: JSON.stringify({
        kidIds: ['550e8400-e29b-41d4-a716-446655440000'],
        category: 'screen',
        startedAt: '2024-01-01T10:00:00.000Z',
        note: 'X'.repeat(501),
        status: 'completed',
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await POST(request, { params: Promise.resolve({ id: 'abc123def456' }) });

    expect(response.status).toBe(400);
  });

  it('returns 400 for invalid category', async () => {
    mockStore.getSession.mockResolvedValue(validSession);

    const { POST } = await import('../sessions/[id]/logs/route');
    const request = new NextRequest('http://localhost:3000/api/sessions/abc123def456/logs?key=key', {
      method: 'POST',
      body: JSON.stringify({
        kidIds: ['550e8400-e29b-41d4-a716-446655440000'],
        category: 'invalid',
        startedAt: '2024-01-01T10:00:00.000Z',
        status: 'completed',
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await POST(request, { params: Promise.resolve({ id: 'abc123def456' }) });

    expect(response.status).toBe(400);
  });

  it('returns 400 for minutes exceeding max', async () => {
    mockStore.getSession.mockResolvedValue(validSession);

    const { POST } = await import('../sessions/[id]/logs/route');
    const request = new NextRequest('http://localhost:3000/api/sessions/abc123def456/logs?key=key', {
      method: 'POST',
      body: JSON.stringify({
        kidIds: ['550e8400-e29b-41d4-a716-446655440000'],
        category: 'screen',
        minutes: 1441,
        startedAt: '2024-01-01T10:00:00.000Z',
        status: 'completed',
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await POST(request, { params: Promise.resolve({ id: 'abc123def456' }) });

    expect(response.status).toBe(400);
  });

  it('creates log on success', async () => {
    mockStore.getSession.mockResolvedValue(validSession);
    mockStore.createLog.mockResolvedValue({
      id: 'l1', sessionId: 'abc123def456', kidIds: ['550e8400-e29b-41d4-a716-446655440000'],
      category: 'screen', minutes: 30, startedAt: '2024-01-01T10:00:00.000Z',
      note: undefined, status: 'completed', createdAt: '2024-01-01T10:30:00.000Z',
    });

    const { POST } = await import('../sessions/[id]/logs/route');
    const request = new NextRequest('http://localhost:3000/api/sessions/abc123def456/logs?key=key', {
      method: 'POST',
      body: JSON.stringify({
        kidIds: ['550e8400-e29b-41d4-a716-446655440000'],
        category: 'screen',
        minutes: 30,
        startedAt: '2024-01-01T10:00:00.000Z',
        status: 'completed',
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await POST(request, { params: Promise.resolve({ id: 'abc123def456' }) });

    expect(response.status).toBe(200);
  });
});

describe('PATCH /api/sessions/[id]/logs/[logId]', () => {
  const validSession = { id: 'abc123def456', editKey: 'key', createdAt: '2024-01-01', status: 'open' };
  const validLogId = '550e8400-e29b-41d4-a716-446655440000';
  const validLog = { id: validLogId, sessionId: 'abc123def456', kidIds: ['k1'], category: 'screen', minutes: 30, startedAt: '2024-01-01T10:00:00.000Z', status: 'completed', createdAt: '2024-01-01' };

  it('returns 400 for invalid IDs', async () => {
    const { PATCH } = await import('../sessions/[id]/logs/[logId]/route');
    const request = new NextRequest('http://localhost:3000/api/sessions/BAD/logs/notauuid', {
      method: 'PATCH',
      body: JSON.stringify({ minutes: 10 }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await PATCH(request, { params: Promise.resolve({ id: 'BAD', logId: 'notauuid' }) });

    expect(response.status).toBe(400);
  });

  it('returns 404 when log belongs to different session', async () => {
    mockStore.getSession.mockResolvedValue(validSession);
    mockStore.getLog.mockResolvedValue({ ...validLog, sessionId: 'differentSession' });

    const { PATCH } = await import('../sessions/[id]/logs/[logId]/route');
    const request = new NextRequest(`http://localhost:3000/api/sessions/abc123def456/logs/${validLogId}?key=key`, {
      method: 'PATCH',
      body: JSON.stringify({ minutes: 10 }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await PATCH(request, { params: Promise.resolve({ id: 'abc123def456', logId: validLogId }) });

    expect(response.status).toBe(404);
  });

  it('updates log on success', async () => {
    mockStore.getSession.mockResolvedValue(validSession);
    mockStore.getLog.mockResolvedValue(validLog);
    mockStore.updateLog.mockResolvedValue({ ...validLog, minutes: 45 });

    const { PATCH } = await import('../sessions/[id]/logs/[logId]/route');
    const request = new NextRequest(`http://localhost:3000/api/sessions/abc123def456/logs/${validLogId}?key=key`, {
      method: 'PATCH',
      body: JSON.stringify({ minutes: 45 }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await PATCH(request, { params: Promise.resolve({ id: 'abc123def456', logId: validLogId }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.minutes).toBe(45);
  });
});

describe('DELETE /api/sessions/[id]/logs/[logId]', () => {
  const validSession = { id: 'abc123def456', editKey: 'key', createdAt: '2024-01-01', status: 'open' };
  const validLogId = '550e8400-e29b-41d4-a716-446655440000';
  const validLog = { id: validLogId, sessionId: 'abc123def456', kidIds: ['k1'], category: 'screen', minutes: 30, startedAt: '2024-01-01T10:00:00.000Z', status: 'completed', createdAt: '2024-01-01' };

  it('returns 400 for invalid IDs', async () => {
    const { DELETE } = await import('../sessions/[id]/logs/[logId]/route');
    const request = new NextRequest('http://localhost:3000/api/sessions/!!!/logs/notauuid', { method: 'DELETE' });
    const response = await DELETE(request, { params: Promise.resolve({ id: '!!!', logId: 'notauuid' }) });

    expect(response.status).toBe(400);
  });

  it('returns 403 for wrong key', async () => {
    mockStore.getSession.mockResolvedValue(validSession);

    const { DELETE } = await import('../sessions/[id]/logs/[logId]/route');
    const request = new NextRequest(`http://localhost:3000/api/sessions/abc123def456/logs/${validLogId}?key=wrong`, { method: 'DELETE' });
    const response = await DELETE(request, { params: Promise.resolve({ id: 'abc123def456', logId: validLogId }) });

    expect(response.status).toBe(403);
  });

  it('deletes log on success', async () => {
    mockStore.getSession.mockResolvedValue(validSession);
    mockStore.getLog.mockResolvedValue(validLog);
    mockStore.deleteLog.mockResolvedValue(true);

    const { DELETE } = await import('../sessions/[id]/logs/[logId]/route');
    const request = new NextRequest(`http://localhost:3000/api/sessions/abc123def456/logs/${validLogId}?key=key`, { method: 'DELETE' });
    const response = await DELETE(request, { params: Promise.resolve({ id: 'abc123def456', logId: validLogId }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });
});

describe('GET /api/dashboard', () => {
  let savedLegacy: string | undefined
  beforeEach(() => {
    savedLegacy = process.env.LEGACY_ENABLED
    process.env.LEGACY_ENABLED = 'true'
  })
  afterEach(() => {
    if (savedLegacy !== undefined) process.env.LEGACY_ENABLED = savedLegacy
    else delete process.env.LEGACY_ENABLED
  })

  it('returns stats with cache-control header', async () => {
    const mockStats = {
      totalSessions: 5, activeSessions: 2, totalKids: 10, totalActivities: 20,
      totalMinutes: 500, avgKidsPerSession: 2, avgActivitiesPerSession: 4,
      categoryBreakdown: { screen: 200, physical: 200, other: 100 },
      activityCounts: { screen: 8, physical: 8, other: 4 },
    };

    const mockGetDashboardStats = vi.fn().mockResolvedValue(mockStats);
    vi.doMock('@/lib/store', () => ({
      store: { ...mockStore, getDashboardStats: mockGetDashboardStats },
    }));

    const { GET } = await import('../dashboard/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate');
    expect(data.totalSessions).toBe(5);
  });
});
