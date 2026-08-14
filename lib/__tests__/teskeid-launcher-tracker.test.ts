import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  enqueueTeskeidLauncherCommit,
  flushTeskeidLauncherCommitsForTests,
  resetTeskeidLauncherCommitsForTests,
} from '@/lib/teskeid/launcherTracker'

beforeEach(() => resetTeskeidLauncherCommitsForTests())

describe('launcher committed-path coordinator', () => {
  it('serializes delayed A1 → B → A2 without dropping the later A', async () => {
    const starts: string[] = []
    const releases: Array<() => void> = []
    const transport = vi.fn((id: string) => new Promise<void>((resolve) => {
      starts.push(id)
      releases.push(resolve)
    }))

    enqueueTeskeidLauncherCommit('vedrid', 'commit-a1', 'account-proof', transport)
    enqueueTeskeidLauncherCommit('bokanir', 'commit-b', 'account-proof', transport)
    enqueueTeskeidLauncherCommit('vedrid', 'commit-a2', 'account-proof', transport)
    await vi.waitFor(() => expect(starts).toHaveLength(1))
    expect(starts).toEqual(['vedrid'])
    releases.shift()!()
    await vi.waitFor(() => expect(starts).toHaveLength(2))
    expect(starts).toEqual(['vedrid', 'bokanir'])
    releases.shift()!()
    await vi.waitFor(() => expect(starts).toHaveLength(3))
    expect(starts).toEqual(['vedrid', 'bokanir', 'vedrid'])
    releases.shift()!()
    await flushTeskeidLauncherCommitsForTests()
  })

  it('dedupes only the same React commit token and continues after failure', async () => {
    const transport = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined)
    enqueueTeskeidLauncherCommit('vedrid', 'same-commit', 'account-proof', transport)
    enqueueTeskeidLauncherCommit('vedrid', 'same-commit', 'account-proof', transport)
    enqueueTeskeidLauncherCommit('bokanir', 'next-commit', 'account-proof', transport)
    await flushTeskeidLauncherCommitsForTests()
    expect(transport.mock.calls.map(([id]) => id)).toEqual(['vedrid', 'bokanir'])
  })

  it('captures each account proof in the serialized queue instead of resolving identity at send time', async () => {
    const sent: Array<[string, string]> = []
    const releases: Array<() => void> = []
    const transport = vi.fn((id: string, proof: string) => new Promise<void>((resolve) => {
      sent.push([id, proof])
      releases.push(resolve)
    }))

    enqueueTeskeidLauncherCommit('vedrid', 'commit-a', 'proof-for-account-a', transport)
    enqueueTeskeidLauncherCommit('bokanir', 'commit-b', 'proof-for-account-b', transport)
    await vi.waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toEqual(['vedrid', 'proof-for-account-a'])
    releases.shift()!()
    await vi.waitFor(() => expect(sent).toHaveLength(2))
    expect(sent[1]).toEqual(['bokanir', 'proof-for-account-b'])
    releases.shift()!()
    await flushTeskeidLauncherCommitsForTests()
  })

  it('scopes React commit-token dedupe to the account proof', async () => {
    const transport = vi.fn().mockResolvedValue(undefined)
    enqueueTeskeidLauncherCommit('vedrid', 'same-commit', 'account-a', transport)
    enqueueTeskeidLauncherCommit('bokanir', 'same-commit', 'account-b', transport)
    await flushTeskeidLauncherCommitsForTests()
    expect(transport.mock.calls).toEqual([
      ['vedrid', 'account-a'],
      ['bokanir', 'account-b'],
    ])
  })
})
