import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  issueTeskeidLauncherCommitProof,
  verifyTeskeidLauncherCommitProof,
} from '@/lib/teskeid/launcherCommitProof.server'

beforeEach(() => {
  process.env.AUTH_CODE_SECRET = 'launcher-proof-test-secret-at-least-32-bytes-long'
})

describe('launcher commit account proof', () => {
  it('is opaque, stable for one account and invalid for another account', () => {
    const proof = issueTeskeidLauncherCommitProof('account-a')
    expect(proof).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(proof).not.toContain('account-a')
    expect(verifyTeskeidLauncherCommitProof('account-a', proof)).toBe(true)
    expect(verifyTeskeidLauncherCommitProof('account-b', proof)).toBe(false)
  })

  it('fails closed for missing secrets and malformed proofs', () => {
    const proof = issueTeskeidLauncherCommitProof('account-a')
    expect(verifyTeskeidLauncherCommitProof('account-a', `${proof}x`)).toBe(false)
    expect(verifyTeskeidLauncherCommitProof('account-a', null)).toBe(false)
    delete process.env.AUTH_CODE_SECRET
    expect(issueTeskeidLauncherCommitProof('account-a')).toBeNull()
    expect(verifyTeskeidLauncherCommitProof('account-a', proof)).toBe(false)
  })
})
