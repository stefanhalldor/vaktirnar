import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import DashboardPage from '../dashboard/page';

const mockStats = {
  totalSessions: 5,
  activeSessions: 2,
  totalKids: 10,
  totalActivities: 20,
  totalMinutes: 500,
  avgKidsPerSession: 2,
  avgActivitiesPerSession: 4,
  categoryBreakdown: { screen: 200, physical: 200, other: 100 },
  activityCounts: { screen: 8, physical: 8, other: 4 },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

describe('Dashboard Page', () => {
  it('shows loading spinner initially', () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<DashboardPage />);
    expect(screen.getByText('Loading dashboard...')).toBeInTheDocument();
  });

  it('renders stats after loading', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockStats),
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument(); // totalSessions
      expect(screen.getByText('10')).toBeInTheDocument(); // totalKids
      expect(screen.getByText('20')).toBeInTheDocument(); // totalActivities
      expect(screen.getByText('500')).toBeInTheDocument(); // totalMinutes
    });
  });

  it('shows active sessions count', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockStats),
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('2 active now')).toBeInTheDocument();
    });
  });

  it('shows error state and retry button on failure', async () => {
    mockFetch.mockResolvedValue({ ok: false });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load dashboard statistics')).toBeInTheDocument();
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });
  });

  it('refresh button triggers re-fetch', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockStats),
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Refresh')).toBeInTheDocument();
    });

    mockFetch.mockClear();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ...mockStats, totalSessions: 10 }),
    });

    await user.click(screen.getByText('Refresh'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  it('displays activity breakdown percentages', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockStats),
    });

    render(<DashboardPage />);

    await waitFor(() => {
      // 200/500 = 40% for screen and physical
      expect(screen.getAllByText('40%')).toHaveLength(2);
      // 100/500 = 20% for other
      expect(screen.getByText('20%')).toBeInTheDocument();
    });
  });

  it('formats minutes correctly', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockStats),
    });

    render(<DashboardPage />);

    await waitFor(() => {
      // 500 minutes = 8h 20m
      expect(screen.getAllByText('8h 20m').length).toBeGreaterThan(0);
    });
  });

  it('handles zero total category minutes without NaN', async () => {
    const zeroStats = {
      ...mockStats,
      categoryBreakdown: { screen: 0, physical: 0, other: 0 },
      totalMinutes: 0,
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(zeroStats),
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getAllByText('0%')).toHaveLength(3);
    });
  });

  it('create session button navigates to session page', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockStats) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ sessionId: 'newsession12', editKey: 'newkey' }) });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Start Your Own Playdate')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Start Your Own Playdate'));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/s/newsession12?key=newkey');
    });
  });
});
