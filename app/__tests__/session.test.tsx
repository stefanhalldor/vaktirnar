import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// Polyfill React.use for React 18 (it's a React 19 API used by Next.js for async params)
if (!(React as Record<string, unknown>).use) {
  (React as Record<string, unknown>).use = <T,>(usable: T): T => {
    return usable as T;
  };
}

// Mock next/navigation
const mockPush = vi.fn();
const mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock clipboard
Object.assign(navigator, {
  clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
});

import SessionPage from '../s/[sessionId]/page';

const mockSessionData = {
  session: { id: 'abc123def456', editKey: 'editkey123', createdAt: '2024-01-01', status: 'open' },
  kids: [
    { id: 'k1', sessionId: 'abc123def456', name: 'Emma', createdAt: '2024-01-01' },
    { id: 'k2', sessionId: 'abc123def456', name: 'Liam', createdAt: '2024-01-01' },
  ],
  logs: [
    {
      id: 'l1', sessionId: 'abc123def456', kidIds: ['k1'], category: 'screen',
      minutes: 30, startedAt: '2024-01-01T10:00:00.000Z', note: 'Minecraft',
      status: 'completed', createdAt: '2024-01-01T10:30:00.000Z',
    },
  ],
  hasEditAccess: true,
};

const readOnlySessionData = {
  ...mockSessionData,
  session: { ...mockSessionData.session, editKey: '' },
  hasEditAccess: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchParams.delete('key');
});

function renderSessionPage(withKey = true) {
  if (withKey) {
    mockSearchParams.set('key', 'editkey123');
  }
  return render(<SessionPage params={{ sessionId: 'abc123def456' } as unknown as Promise<{ sessionId: string }>} />);
}

describe('Session Page', () => {
  it('shows loading spinner initially', () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    renderSessionPage();
    expect(screen.getByText('Loading playdate...')).toBeInTheDocument();
  });

  it('shows not found when session does not exist', async () => {
    mockFetch.mockResolvedValue({ ok: false });
    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByText('Session Not Found')).toBeInTheDocument();
    });
  });

  it('renders kids names', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSessionData),
    });

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getAllByText('Emma').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Liam').length).toBeGreaterThan(0);
    });
  });

  it('shows session name from kid names', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSessionData),
    });

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByText('Emma & Liam')).toBeInTheDocument();
    });
  });

  it('shows editable badge when has edit access', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSessionData),
    });

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByText('Editable')).toBeInTheDocument();
    });
  });

  it('shows read-only badge without edit access', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(readOnlySessionData),
    });

    renderSessionPage(false);

    await waitFor(() => {
      expect(screen.getByText('Read-only')).toBeInTheDocument();
    });
  });

  it('shows add kid input in edit mode', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSessionData),
    });

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Add kid's name...")).toBeInTheDocument();
    });
  });

  it('hides add kid input in read-only mode', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(readOnlySessionData),
    });

    renderSessionPage(false);

    await waitFor(() => {
      expect(screen.getAllByText('Emma').length).toBeGreaterThan(0);
    });

    expect(screen.queryByPlaceholderText("Add kid's name...")).not.toBeInTheDocument();
  });

  it('renders timeline with activity logs', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSessionData),
    });

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByText('Timeline')).toBeInTheDocument();
      expect(screen.getAllByText('Screen time').length).toBeGreaterThan(0);
      expect(screen.getByText(/Minecraft/)).toBeInTheDocument();
    });
  });

  it('shows activity log buttons in edit mode', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSessionData),
    });

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByText('Log Activity')).toBeInTheDocument();
    });
  });

  it('shows summary stats', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSessionData),
    });

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByText('Summary')).toBeInTheDocument();
      expect(screen.getByText('Total Screen Time')).toBeInTheDocument();
    });
  });

  it('share link button is present in edit mode', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSessionData),
    });

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByText('Share Link')).toBeInTheDocument();
      const shareButton = screen.getByText('Share Link').closest('button');
      expect(shareButton).toBeTruthy();
    });
  });

  it('share link button is hidden in read-only mode', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(readOnlySessionData),
    });

    renderSessionPage(false);

    await waitFor(() => {
      expect(screen.getByText('Read-only')).toBeInTheDocument();
    });

    expect(screen.queryByText('Share Link')).not.toBeInTheDocument();
  });

  it('opens activity modal when category button is clicked', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSessionData),
    });

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByText('Log Activity')).toBeInTheDocument();
    });

    // Click "Screen time" category button
    const screenButtons = screen.getAllByText('Screen time');
    // The category button in the Log Activity section
    const categoryButton = screenButtons.find(el => el.closest('button'));
    if (categoryButton) {
      await user.click(categoryButton);
    }

    await waitFor(() => {
      expect(screen.getByText('Completed')).toBeInTheDocument();
      expect(screen.getByText('Start Activity')).toBeInTheDocument();
    });
  });

  it('shows active activity with complete button', async () => {
    const activeData = {
      ...mockSessionData,
      logs: [{
        id: 'l2', sessionId: 'abc123def456', kidIds: ['k1'], category: 'physical',
        minutes: undefined, startedAt: new Date().toISOString(),
        status: 'active', createdAt: new Date().toISOString(),
      }],
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(activeData),
    });

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByText('Active')).toBeInTheDocument();
      expect(screen.getByText('Complete & Log Duration')).toBeInTheDocument();
    });
  });

  it('adds a kid via the input field', async () => {
    const user = userEvent.setup();
    let callCount = 0;
    mockFetch.mockImplementation((url: string, options?: RequestInit) => {
      if (options?.method === 'POST' && String(url).includes('/kids')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 'k3', sessionId: 'abc123def456', name: 'Sofia', createdAt: '2024-01-01' }),
        });
      }
      callCount++;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(callCount <= 1 ? mockSessionData : {
          ...mockSessionData,
          kids: [...mockSessionData.kids, { id: 'k3', sessionId: 'abc123def456', name: 'Sofia', createdAt: '2024-01-01' }],
        }),
      });
    });

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Add kid's name...")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText("Add kid's name...");
    await user.type(input, 'Sofia');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/kids'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  it('shows per-kid totals in summary', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSessionData),
    });

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByText('Per Kid')).toBeInTheDocument();
    });
  });
});
