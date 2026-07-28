import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentCollaborationClient } from '../AgentCollaborationClient'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => ({
    loading: 'Loading',
    loadError: 'Load failed',
    retry: 'Retry',
    connectionTitle: 'Connected agents',
    connectedCount: 'Connected',
    noConnector: 'No connector',
    statusOnline: 'Online',
    statusPaired: 'Paired',
    statusWaiting: 'Waiting',
    statusPairing: 'Pairing',
    statusOffline: 'Offline',
    lastSeen: 'Last seen',
    disconnectAria: 'Disconnect',
    disconnectConfirm: 'Disconnect?',
    disconnectError: 'Disconnect failed',
    providerLabel: 'Agent type',
    providerCodex: 'Codex',
    providerClaude: 'Claude Code',
    providerOther: 'Another agent',
    replacementWarning: 'New connector replaces the current one',
    pairAgent: 'Connect agent',
    pairingLoading: 'Creating code',
    pairingError: 'Pairing failed',
    pairingInstructions: 'Enter this code',
    copyCode: 'Copy code',
    copied: 'Copied',
    pairingExpires: 'Expires',
    readOnlyTitle: 'Read only',
    readOnlyDescription: 'Messages do not grant permission.',
    conversationFallbackTitle: 'Work chat',
    conversationDescription: 'Private conversation',
    runQueued: 'Waiting for agent',
    runWorking: 'Agent working',
    runFailed: 'Agent could not reply',
    chatEmpty: 'Empty',
    chatLoading: 'Loading messages',
    chatLoadError: 'Messages failed',
    messagePlaceholder: 'Write',
    send: 'Send',
    sendError: 'Send failed',
    deleted: 'Deleted',
    loadOlder: 'Older',
  } as Record<string, string>)[key] ?? key,
}))

vi.mock('@/components/chat/ScopedChatPanel', () => ({
  ScopedChatPanel: () => <div data-testid="chat-panel" />,
}))

const mockFetch = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/bootstrap')) {
      return {
        ok: true,
        json: async () => ({
          conversation: { id: 'conversation-id', title: 'Stebbi og agent' },
          connectors: [],
          unreadCount: 0,
          latestRun: null,
        }),
      }
    }
    if (url.endsWith('/pairings') && init?.method === 'POST') {
      return {
        ok: true,
        json: async () => ({ code: 'ABC12345', expiresAt: '2026-07-27T23:00:00.000Z' }),
      }
    }
    throw new Error(`Unexpected request: ${url}`)
  })
  global.fetch = mockFetch
})

describe('AgentCollaborationClient', () => {
  it('pairs Codex, Claude Code, or another provider without free-form provider keys', async () => {
    render(<AgentCollaborationClient locale="en" />)

    const provider = await screen.findByRole('combobox', { name: 'Agent type' })
    expect(screen.getByRole('option', { name: 'Codex' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Claude Code' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Another agent' })).toBeInTheDocument()

    fireEvent.change(provider, { target: { value: 'claude-code' } })
    fireEvent.click(screen.getByRole('button', { name: 'Connect agent' }))

    expect(await screen.findByText('ABC12345')).toBeInTheDocument()
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith(
      '/api/auth-mvp/agent-collaboration/pairings',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ providerKey: 'claude-code', displayName: 'Claude Code' }),
      }),
    ))
  })

  it('uses the translated title and exposes a safe terminal failure state', async () => {
    mockFetch.mockImplementation(async (input: RequestInfo | URL) => {
      if (!String(input).endsWith('/bootstrap')) throw new Error('Unexpected request')
      return {
        ok: true,
        json: async () => ({
          conversation: { id: 'conversation-id', title: 'Database-only English title' },
          connectors: [],
          unreadCount: 0,
          latestRun: {
            id: 'run-id',
            status: 'failed',
            failureCategory: 'provider_auth',
          },
        }),
      }
    })

    render(<AgentCollaborationClient locale="en" />)

    expect(await screen.findByText('Work chat')).toBeInTheDocument()
    expect(screen.queryByText('Database-only English title')).not.toBeInTheDocument()
    expect(screen.getByText('Agent could not reply')).toBeInTheDocument()
    expect(screen.queryByText('provider_auth')).not.toBeInTheDocument()
  })
})
