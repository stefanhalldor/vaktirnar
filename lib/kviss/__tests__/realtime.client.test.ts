import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }))

vi.mock('@/lib/supabase/client', () => ({ createClient }))

import {
  KVISS_REALTIME_DEFAULT_THROTTLE_MS,
  createKvissRealtimeSubscription,
} from '../realtime.client'

describe('createKvissRealtimeSubscription', () => {
  beforeEach(() => {
    createClient.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not create a provider subscription without an opaque topic', () => {
    expect(createKvissRealtimeSubscription(null)).toBeUndefined()
    expect(createClient).not.toHaveBeenCalled()
  })

  it('throttles broadcast storms while subscribed recovery remains immediate', async () => {
    const on = vi.fn()
    const subscribe = vi.fn()
    const channel = { on, subscribe }
    on.mockReturnValue(channel)
    subscribe.mockReturnValue(channel)
    const removeChannel = vi.fn().mockResolvedValue(undefined)
    createClient.mockReturnValue({ channel: vi.fn().mockReturnValue(channel), removeChannel })
    const onInvalidate = vi.fn()

    let now = 1_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const subscription = createKvissRealtimeSubscription('opaque-topic', 300)
    const cleanup = subscription?.(onInvalidate)

    expect(createClient).toHaveBeenCalledTimes(1)
    expect(createClient.mock.results[0].value.channel).toHaveBeenCalledWith('opaque-topic')
    expect(on).toHaveBeenCalledWith(
      'broadcast',
      { event: 'invalidate' },
      expect.any(Function),
    )

    const broadcast = on.mock.calls[0][2] as (payload: unknown) => void
    const onStatus = subscribe.mock.calls[0][0] as (status: string) => void
    broadcast({ payload: { untrusted: 'ignored' } })
    now = 1_299
    broadcast({ payload: { untrusted: 'ignored' } })
    expect(onInvalidate).toHaveBeenCalledTimes(1)
    now = 1_300
    broadcast({ payload: { untrusted: 'ignored' } })
    onStatus('CHANNEL_ERROR')
    onStatus('SUBSCRIBED')
    expect(onInvalidate).toHaveBeenCalledTimes(3)

    cleanup?.()
    cleanup?.()
    expect(removeChannel).toHaveBeenCalledTimes(1)
    expect(removeChannel).toHaveBeenCalledWith(channel)

    broadcast({ payload: { untrusted: 'still ignored' } })
    onStatus('SUBSCRIBED')
    expect(onInvalidate).toHaveBeenCalledTimes(3)
    await Promise.resolve()
  })

  it('falls back to the safe default for an invalid throttle', () => {
    const on = vi.fn()
    const subscribe = vi.fn()
    const channel = { on, subscribe }
    on.mockReturnValue(channel)
    subscribe.mockReturnValue(channel)
    createClient.mockReturnValue({
      channel: vi.fn().mockReturnValue(channel),
      removeChannel: vi.fn().mockResolvedValue(undefined),
    })
    const onInvalidate = vi.fn()
    let now = 10_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)

    createKvissRealtimeSubscription('opaque-topic', -1)?.(onInvalidate)
    const broadcast = on.mock.calls[0][2] as () => void
    broadcast()
    now += KVISS_REALTIME_DEFAULT_THROTTLE_MS - 1
    broadcast()
    expect(onInvalidate).toHaveBeenCalledTimes(1)
    now += 1
    broadcast()
    expect(onInvalidate).toHaveBeenCalledTimes(2)
  })
})
