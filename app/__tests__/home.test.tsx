import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

import Home from '../page';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Home Page', () => {
  it('renders the start button', () => {
    render(<Home />);
    expect(screen.getByText('Start New Playdate')).toBeInTheDocument();
  });

  it('renders the dashboard link', () => {
    render(<Home />);
    expect(screen.getByText('View Usage Dashboard')).toBeInTheDocument();
  });

  it('renders how it works section', () => {
    render(<Home />);
    expect(screen.getByText('How it works:')).toBeInTheDocument();
  });

  it('creates session and navigates on button click', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ sessionId: 'abc123def456', editKey: 'testkey123' }),
    });

    render(<Home />);
    await user.click(screen.getByText('Start New Playdate'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/sessions', { method: 'POST' });
      expect(mockPush).toHaveBeenCalledWith('/s/abc123def456?key=testkey123');
    });
  });

  it('shows creating state while request is in progress', async () => {
    const user = userEvent.setup();
    mockFetch.mockReturnValueOnce(new Promise(() => {})); // Never resolves

    render(<Home />);
    await user.click(screen.getByText('Start New Playdate'));

    expect(screen.getByText('Creating...')).toBeInTheDocument();
  });

  it('shows alert on failure and re-enables button', async () => {
    const user = userEvent.setup();
    const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {});
    mockFetch.mockResolvedValueOnce({ ok: false });

    render(<Home />);
    await user.click(screen.getByText('Start New Playdate'));

    await waitFor(() => {
      expect(alertMock).toHaveBeenCalledWith('Failed to create playdate session. Please try again.');
      expect(screen.getByText('Start New Playdate')).toBeInTheDocument();
    });

    alertMock.mockRestore();
  });

  it('dashboard link points to /dashboard', () => {
    render(<Home />);
    const link = screen.getByText('View Usage Dashboard').closest('a');
    expect(link).toHaveAttribute('href', '/dashboard');
  });
});
