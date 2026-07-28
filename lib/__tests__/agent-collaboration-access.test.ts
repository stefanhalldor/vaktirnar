import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const maybeSingle = vi.fn()
  const eq = vi.fn()
  const query = { eq, maybeSingle }
  eq.mockReturnValue(query)
  const select = vi.fn(() => query)
  const from = vi.fn(() => ({ select }))
  return { maybeSingle, eq, select, from }
})

vi.mock('@/lib/supabase/admin', () => ({
  getAdmin: vi.fn(() => ({ from: mocks.from })),
}))

import {
  AGENT_COLLABORATION_FEATURE_KEY,
  hasAgentCollaborationBetaAccess,
} from '@/lib/agent-collaboration/access.server'

describe('agent collaboration private-beta access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.eq.mockReturnValue({ eq: mocks.eq, maybeSingle: mocks.maybeSingle })
  })

  it('canonicalizes email and requires the dedicated feature row', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { email: 'user@example.com' }, error: null })

    await expect(hasAgentCollaborationBetaAccess(' User@Example.COM ')).resolves.toBe(true)
    expect(mocks.from).toHaveBeenCalledWith('feature_access')
    expect(mocks.eq).toHaveBeenNthCalledWith(1, 'email', 'user@example.com')
    expect(mocks.eq).toHaveBeenNthCalledWith(2, 'feature_key', AGENT_COLLABORATION_FEATURE_KEY)
  })

  it('denies access when the entitlement row is absent', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null })
    await expect(hasAgentCollaborationBetaAccess('user@example.com')).resolves.toBe(false)
  })

  it('fails closed without logging identity when the lookup fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { code: 'offline' } })

    await expect(hasAgentCollaborationBetaAccess('private@example.com')).resolves.toBe(false)
    expect(errorSpy).toHaveBeenCalledWith(
      '[agent-collaboration/access] entitlement lookup failed',
    )
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('private@example.com')
    errorSpy.mockRestore()
  })
})
