import { render, screen } from '@testing-library/react'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  guardSession: vi.fn(),
  hasBetaAccess: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
}))

vi.mock('next-intl/server', () => ({
  getLocale: vi.fn(async () => 'is'),
  getTranslations: vi.fn(async () => (key: string) => key),
}))

vi.mock('next/link', () => ({
  default: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))

vi.mock('@/lib/auth/guard', () => ({
  guardTeskeidSession: mocks.guardSession,
}))

vi.mock('@/lib/agent-collaboration/access.server', () => ({
  hasAgentCollaborationBetaAccess: mocks.hasBetaAccess,
}))

vi.mock('@/components/teskeid/TeskeidMenu', () => ({
  TeskeidMenu: () => <div data-testid="menu" />,
}))

vi.mock('@/app/auth-mvp/samvinna/AgentCollaborationClient', () => ({
  AgentCollaborationClient: () => <div data-testid="agent-collaboration-client" />,
}))

import SamvinnaPage from '@/app/auth-mvp/samvinna/page'

let savedAuthMvp: string | undefined
let savedCollaboration: string | undefined

beforeAll(() => {
  savedAuthMvp = process.env.AUTH_MVP_ENABLED
  savedCollaboration = process.env.AGENT_COLLABORATION_ENABLED
})

afterAll(() => {
  if (savedAuthMvp === undefined) delete process.env.AUTH_MVP_ENABLED
  else process.env.AUTH_MVP_ENABLED = savedAuthMvp
  if (savedCollaboration === undefined) delete process.env.AGENT_COLLABORATION_ENABLED
  else process.env.AGENT_COLLABORATION_ENABLED = savedCollaboration
})

beforeEach(() => {
  vi.clearAllMocks()
  process.env.AUTH_MVP_ENABLED = 'true'
  process.env.AGENT_COLLABORATION_ENABLED = 'true'
  mocks.guardSession.mockResolvedValue({
    user: { id: 'user-1', email: 'user@example.com' },
  })
  mocks.hasBetaAccess.mockResolvedValue(true)
})

describe('Samvinna page private-beta gate', () => {
  it('returns not found for an authenticated user without beta access', async () => {
    mocks.hasBetaAccess.mockResolvedValue(false)
    await expect(SamvinnaPage()).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('renders the collaboration client for an entitled user', async () => {
    render(await SamvinnaPage())
    expect(screen.getByTestId('agent-collaboration-client')).toBeInTheDocument()
    expect(mocks.hasBetaAccess).toHaveBeenCalledWith('user@example.com')
  })
})
