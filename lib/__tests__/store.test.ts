import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Session, Kid, LogEntry } from '../types';

// Mock the supabase module before importing store
const mockFrom = vi.fn();

vi.mock('../supabase', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

// Import store after mock is set up
const { store } = await import('../store');

// Helper to build a chainable query mock
function mockQuery(result: { data?: unknown; error?: unknown; count?: number | null }) {
  const chain: Record<string, unknown> = {};
  const handler = () => chain;
  chain.select = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(result);
  // For queries that don't call .single() (list queries)
  chain.then = vi.fn().mockImplementation((resolve: (val: unknown) => void) => resolve(result));
  // Make it thenable for await
  Object.defineProperty(chain, 'then', {
    value: (resolve: (val: unknown) => void) => Promise.resolve(result).then(resolve),
    writable: true,
  });
  // Override for list-style queries
  if (Array.isArray(result.data)) {
    chain.order = vi.fn().mockReturnValue({
      ...chain,
      then: (resolve: (val: unknown) => void) => Promise.resolve(result).then(resolve),
      [Symbol.toStringTag]: 'Promise',
    });
    // Direct await on chain
    Object.defineProperty(chain, 'then', {
      value: (resolve: (val: unknown) => void) => Promise.resolve(result).then(resolve),
      writable: true,
    });
  }
  return chain;
}

function mockQueryResolvesDirectly(result: { data?: unknown; error?: unknown; count?: number | null }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const self = new Proxy(chain, {
    get(target, prop) {
      if (prop === 'then') {
        return (resolve: (val: unknown) => void) => Promise.resolve(result).then(resolve);
      }
      if (!target[prop as string]) {
        target[prop as string] = vi.fn().mockReturnValue(self);
      }
      return target[prop as string];
    },
  });
  return self;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('store.createSession', () => {
  it('creates a session and returns mapped data', async () => {
    const dbRow = { id: 'abc123', edit_key: 'key123', created_at: '2024-01-01', status: 'open' };
    mockFrom.mockReturnValue(mockQueryResolvesDirectly({ data: dbRow, error: null }));

    const session: Session = { id: 'abc123', editKey: 'key123', createdAt: '2024-01-01', status: 'open' };
    const result = await store.createSession(session);

    expect(result).toEqual(session);
    expect(mockFrom).toHaveBeenCalledWith('sessions');
  });

  it('throws on error', async () => {
    const error = { message: 'DB error', code: '500' };
    mockFrom.mockReturnValue(mockQueryResolvesDirectly({ data: null, error }));

    const session: Session = { id: 'abc', editKey: 'key', createdAt: '2024-01-01', status: 'open' };
    await expect(store.createSession(session)).rejects.toEqual(error);
  });
});

describe('store.getSession', () => {
  it('returns mapped session on success', async () => {
    const dbRow = { id: 'abc', edit_key: 'key', created_at: '2024-01-01', status: 'open' };
    mockFrom.mockReturnValue(mockQueryResolvesDirectly({ data: dbRow, error: null }));

    const result = await store.getSession('abc');
    expect(result).toEqual({ id: 'abc', editKey: 'key', createdAt: '2024-01-01', status: 'open' });
  });

  it('returns null for PGRST116 (not found)', async () => {
    mockFrom.mockReturnValue(mockQueryResolvesDirectly({ data: null, error: { code: 'PGRST116', message: 'Not found' } }));

    const result = await store.getSession('nonexistent');
    expect(result).toBeNull();
  });

  it('throws on other errors', async () => {
    const error = { code: '500', message: 'Server error' };
    mockFrom.mockReturnValue(mockQueryResolvesDirectly({ data: null, error }));

    await expect(store.getSession('abc')).rejects.toEqual(error);
  });
});

describe('store.createKid', () => {
  it('creates a kid and maps snake_case to camelCase', async () => {
    const dbRow = { id: 'k1', session_id: 's1', name: 'Emma', created_at: '2024-01-01' };
    mockFrom.mockReturnValue(mockQueryResolvesDirectly({ data: dbRow, error: null }));

    const kid: Kid = { id: 'k1', sessionId: 's1', name: 'Emma', createdAt: '2024-01-01' };
    const result = await store.createKid(kid);
    expect(result).toEqual(kid);
  });
});

describe('store.getKidsBySession', () => {
  it('returns mapped array of kids', async () => {
    const dbRows = [
      { id: 'k1', session_id: 's1', name: 'Emma', created_at: '2024-01-01' },
      { id: 'k2', session_id: 's1', name: 'Liam', created_at: '2024-01-02' },
    ];
    mockFrom.mockReturnValue(mockQueryResolvesDirectly({ data: dbRows, error: null }));

    const result = await store.getKidsBySession('s1');
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: 'k1', sessionId: 's1', name: 'Emma', createdAt: '2024-01-01' });
    expect(result[1]).toEqual({ id: 'k2', sessionId: 's1', name: 'Liam', createdAt: '2024-01-02' });
  });

  it('returns empty array when data is null', async () => {
    mockFrom.mockReturnValue(mockQueryResolvesDirectly({ data: null, error: null }));

    const result = await store.getKidsBySession('s1');
    expect(result).toEqual([]);
  });
});

describe('store.deleteKid', () => {
  it('returns true on success', async () => {
    mockFrom.mockReturnValue(mockQueryResolvesDirectly({ data: null, error: null }));

    const result = await store.deleteKid('k1');
    expect(result).toBe(true);
  });

  it('throws on error', async () => {
    const error = { message: 'Delete failed', code: '500' };
    mockFrom.mockReturnValue(mockQueryResolvesDirectly({ data: null, error }));

    await expect(store.deleteKid('k1')).rejects.toEqual(error);
  });
});

describe('store.createLog', () => {
  it('creates a log and maps fields correctly', async () => {
    const dbRow = {
      id: 'l1', session_id: 's1', kid_ids: ['k1'], category: 'screen',
      minutes: 30, started_at: '2024-01-01T10:00:00Z', note: 'Minecraft',
      status: 'completed', created_at: '2024-01-01T10:30:00Z',
    };
    mockFrom.mockReturnValue(mockQueryResolvesDirectly({ data: dbRow, error: null }));

    const log: LogEntry = {
      id: 'l1', sessionId: 's1', kidIds: ['k1'], category: 'screen',
      minutes: 30, startedAt: '2024-01-01T10:00:00Z', note: 'Minecraft',
      status: 'completed', createdAt: '2024-01-01T10:30:00Z',
    };
    const result = await store.createLog(log);
    expect(result).toEqual(log);
  });
});

describe('store.getLog', () => {
  it('returns mapped log on success', async () => {
    const dbRow = {
      id: 'l1', session_id: 's1', kid_ids: ['k1'], category: 'physical',
      minutes: 60, started_at: '2024-01-01T10:00:00Z', note: null,
      status: 'completed', created_at: '2024-01-01T11:00:00Z',
    };
    mockFrom.mockReturnValue(mockQueryResolvesDirectly({ data: dbRow, error: null }));

    const result = await store.getLog('l1');
    expect(result).toEqual({
      id: 'l1', sessionId: 's1', kidIds: ['k1'], category: 'physical',
      minutes: 60, startedAt: '2024-01-01T10:00:00Z', note: null,
      status: 'completed', createdAt: '2024-01-01T11:00:00Z',
    });
  });

  it('returns null for not found', async () => {
    mockFrom.mockReturnValue(mockQueryResolvesDirectly({ data: null, error: { code: 'PGRST116', message: 'Not found' } }));

    const result = await store.getLog('nonexistent');
    expect(result).toBeNull();
  });
});

describe('store.updateLog', () => {
  it('maps partial updates to snake_case and returns updated log', async () => {
    const dbRow = {
      id: 'l1', session_id: 's1', kid_ids: ['k1', 'k2'], category: 'screen',
      minutes: 45, started_at: '2024-01-01T10:00:00Z', note: 'Updated',
      status: 'completed', created_at: '2024-01-01T10:00:00Z',
    };
    mockFrom.mockReturnValue(mockQueryResolvesDirectly({ data: dbRow, error: null }));

    const result = await store.updateLog('l1', { minutes: 45, note: 'Updated' });
    expect(result?.minutes).toBe(45);
    expect(result?.note).toBe('Updated');
  });

  it('returns null for not found', async () => {
    mockFrom.mockReturnValue(mockQueryResolvesDirectly({ data: null, error: { code: 'PGRST116', message: 'Not found' } }));

    const result = await store.updateLog('nonexistent', { minutes: 10 });
    expect(result).toBeNull();
  });
});

describe('store.deleteLog', () => {
  it('returns true on success', async () => {
    mockFrom.mockReturnValue(mockQueryResolvesDirectly({ data: null, error: null }));

    const result = await store.deleteLog('l1');
    expect(result).toBe(true);
  });
});

describe('store.getDashboardStats', () => {
  it('aggregates stats correctly', async () => {
    const logs = [
      { category: 'screen', minutes: 30 },
      { category: 'screen', minutes: 20 },
      { category: 'physical', minutes: 60 },
      { category: 'other', minutes: 15 },
    ];

    let callIndex = 0;
    mockFrom.mockImplementation(() => {
      callIndex++;
      if (callIndex === 1) return mockQueryResolvesDirectly({ data: null, error: null, count: 5 });
      if (callIndex === 2) return mockQueryResolvesDirectly({ data: null, error: null, count: 2 });
      if (callIndex === 3) return mockQueryResolvesDirectly({ data: null, error: null, count: 10 });
      return mockQueryResolvesDirectly({ data: logs, error: null, count: null });
    });

    const stats = await store.getDashboardStats();

    expect(stats.totalSessions).toBe(5);
    expect(stats.activeSessions).toBe(2);
    expect(stats.totalKids).toBe(10);
    expect(stats.totalActivities).toBe(4);
    expect(stats.totalMinutes).toBe(125);
    expect(stats.categoryBreakdown.screen).toBe(50);
    expect(stats.categoryBreakdown.physical).toBe(60);
    expect(stats.categoryBreakdown.other).toBe(15);
    expect(stats.activityCounts.screen).toBe(2);
    expect(stats.activityCounts.physical).toBe(1);
    expect(stats.activityCounts.other).toBe(1);
    expect(stats.avgKidsPerSession).toBe(2);
  });

  it('handles zero sessions without division by zero', async () => {
    let callIndex = 0;
    mockFrom.mockImplementation(() => {
      callIndex++;
      if (callIndex === 1) return mockQueryResolvesDirectly({ data: null, error: null, count: 0 });
      if (callIndex === 2) return mockQueryResolvesDirectly({ data: null, error: null, count: 0 });
      if (callIndex === 3) return mockQueryResolvesDirectly({ data: null, error: null, count: 0 });
      return mockQueryResolvesDirectly({ data: [], error: null, count: null });
    });

    const stats = await store.getDashboardStats();

    expect(stats.totalSessions).toBe(0);
    expect(stats.avgKidsPerSession).toBe(0);
    expect(stats.avgActivitiesPerSession).toBe(0);
  });
});
