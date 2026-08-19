import { describe, expect, it, vi } from 'vitest'
import { HouseholdChoreRequestIds } from '@/lib/household-chores/request-id.client'

describe('HouseholdChoreRequestIds', () => {
  it('blocks a double submit and reuses the id after an uncertain failure', () => {
    const generate = vi.fn()
      .mockReturnValueOnce('85000000-0000-4000-8000-000000000001')
      .mockReturnValueOnce('85000000-0000-4000-8000-000000000002')
    const requests = new HouseholdChoreRequestIds(generate)

    const first = requests.begin('create:home')
    expect(requests.begin('create:home')).toBeNull()
    requests.uncertain('create:home')
    expect(requests.begin('create:home')).toBe(first)
    requests.returned('create:home', { ok: false, error: 'save_failed' })
    expect(requests.begin('create:home')).toBe(first)
    requests.returned('create:home', { ok: true })
    expect(requests.begin('create:home')).toBe('85000000-0000-4000-8000-000000000002')
  })

  it('uses a new id after a definitive business failure or input fingerprint change', () => {
    const generate = vi.fn()
      .mockReturnValueOnce('85000000-0000-4000-8000-000000000001')
      .mockReturnValueOnce('85000000-0000-4000-8000-000000000002')
      .mockReturnValueOnce('85000000-0000-4000-8000-000000000003')
    const requests = new HouseholdChoreRequestIds(generate)

    expect(requests.begin('assign:v1')).toBe('85000000-0000-4000-8000-000000000001')
    requests.returned('assign:v1', { ok: false, error: 'stale' })
    expect(requests.begin('assign:v1')).toBe('85000000-0000-4000-8000-000000000002')
    requests.uncertain('assign:v1')
    expect(requests.begin('assign:v2')).toBe('85000000-0000-4000-8000-000000000003')
  })
})
