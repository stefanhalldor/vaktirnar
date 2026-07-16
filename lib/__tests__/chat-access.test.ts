import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const { mockShellAccess, mockCheckFeatureAccess } = vi.hoisted(() => ({
  mockShellAccess: vi.fn(),
  mockCheckFeatureAccess: vi.fn(),
}))

vi.mock('@/lib/weather/weatherBaseAccess.server', () => ({
  resolveAuthenticatedWeatherShellAccess: mockShellAccess,
}))

vi.mock('@/lib/loans/guard', () => ({
  checkFeatureAccess: mockCheckFeatureAccess,
}))

import { checkChatAccess } from '@/lib/chat/access.server'
import type { User } from '@supabase/supabase-js'

function makeUser(email = 'test@example.com'): User {
  return { id: 'uid-1', email } as User
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('TESKEID_CHAT_ENABLED', 'true')
  // Default: per-user gate active. Tests that verify graduation unset/non-true override this.
  vi.stubEnv('WEATHER_PULSE_ACCESS_REQUIRED', 'true')
  mockShellAccess.mockResolvedValue({ mode: 'authenticated', userId: 'uid-1', hasPrivateVedrid: false })
  mockCheckFeatureAccess.mockResolvedValue(true)
})

describe('checkChatAccess — no-session', () => {
  it('returns no-session when user is null', async () => {
    expect(await checkChatAccess(null)).toBe('no-session')
  })

  it('returns no-session when user has no email', async () => {
    expect(await checkChatAccess({ id: 'uid-1' } as User)).toBe('no-session')
  })
})

describe('checkChatAccess — chat-disabled', () => {
  it('returns chat-disabled when TESKEID_CHAT_ENABLED is not set', async () => {
    vi.stubEnv('TESKEID_CHAT_ENABLED', '')
    expect(await checkChatAccess(makeUser())).toBe('chat-disabled')
  })

  it('returns chat-disabled when TESKEID_CHAT_ENABLED=false', async () => {
    vi.stubEnv('TESKEID_CHAT_ENABLED', 'false')
    expect(await checkChatAccess(makeUser())).toBe('chat-disabled')
  })
})

describe('checkChatAccess — no-weather', () => {
  it('returns no-weather when weather shell is blocked', async () => {
    mockShellAccess.mockResolvedValue({ mode: 'blocked' })
    expect(await checkChatAccess(makeUser())).toBe('no-weather')
  })
})

describe('checkChatAccess — no-vedurstofan', () => {
  it('returns no-vedurstofan when weather-provider-vedurstofan is missing', async () => {
    mockCheckFeatureAccess.mockImplementation(async (_uid, _email, key) => {
      if (key === 'weather-provider-vedurstofan') return false
      return true
    })
    expect(await checkChatAccess(makeUser())).toBe('no-vedurstofan')
  })
})

describe('checkChatAccess — no-pulse', () => {
  it('returns no-pulse when weather-pulse is missing', async () => {
    mockCheckFeatureAccess.mockImplementation(async (_uid, _email, key) => {
      if (key === 'weather-pulse') return false
      return true
    })
    expect(await checkChatAccess(makeUser())).toBe('no-pulse')
  })
})

describe('checkChatAccess — allowed', () => {
  it('returns allowed when all access layers pass', async () => {
    expect(await checkChatAccess(makeUser())).toBe('allowed')
  })

  it('returns allowed when WEATHER_PULSE_ACCESS_REQUIRED is absent/empty (graduated)', async () => {
    vi.stubEnv('WEATHER_PULSE_ACCESS_REQUIRED', '')
    // Even if weather-pulse check returns false, should be allowed — graduation pattern
    mockCheckFeatureAccess.mockImplementation(async (_uid, _email, key) => {
      if (key === 'weather-pulse') return false
      return true
    })
    expect(await checkChatAccess(makeUser())).toBe('allowed')
  })

  it('returns allowed when WEATHER_PULSE_ACCESS_REQUIRED=false (non-true treated as graduated)', async () => {
    vi.stubEnv('WEATHER_PULSE_ACCESS_REQUIRED', 'false')
    mockCheckFeatureAccess.mockImplementation(async (_uid, _email, key) => {
      if (key === 'weather-pulse') return false
      return true
    })
    expect(await checkChatAccess(makeUser())).toBe('allowed')
  })

  it('uses authenticated-public shell mode (no private vedrid required)', async () => {
    mockShellAccess.mockResolvedValue({ mode: 'authenticated-public', userId: 'uid-1', hasPrivateVedrid: false })
    expect(await checkChatAccess(makeUser())).toBe('allowed')
  })
})

describe('checkChatAccess — provider required even when pulse graduated', () => {
  it('returns no-vedurstofan even when WEATHER_PULSE_ACCESS_REQUIRED is not true', async () => {
    vi.stubEnv('WEATHER_PULSE_ACCESS_REQUIRED', '')
    mockCheckFeatureAccess.mockImplementation(async (_uid, _email, key) => {
      if (key === 'weather-provider-vedurstofan') return false
      return true
    })
    // Graduation of pulse must not bypass the Veðurstofan provider requirement
    expect(await checkChatAccess(makeUser())).toBe('no-vedurstofan')
  })
})
