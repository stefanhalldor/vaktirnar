import { describe, expect, it } from 'vitest'
import { canonicalKvissPath, KVISS_JOIN_ALPHABET, normalizeKvissCode } from '@/lib/kviss/contracts'
import { createBroadcastTopic, createParticipantCapability, digestParticipantCapability } from '@/lib/kviss/security.server'
import { creatorMutationSchema, publicJoinSchema } from '@/lib/kviss/validation'

describe('Kviss guest security contracts', () => {
  it('uses the canonical CrowdSync-safe alphabet and uppercase path', () => {
    expect(KVISS_JOIN_ALPHABET).toBe('ABCDEFGHJKMNPQRSTUVWXYZ23456789')
    expect(normalizeKvissCode(' ab2def ')).toBe('AB2DEF')
    expect(canonicalKvissPath('ab2def')).toBe('/kviss/AB2DEF')
  })

  it('generates separate high-entropy capability and realtime values', () => {
    const capability = createParticipantCapability()
    const topic = createBroadcastTopic()
    expect(capability.token).toHaveLength(43)
    expect(capability.digest).toMatch(/^[a-f0-9]{64}$/)
    expect(digestParticipantCapability(capability.token)).toBe(capability.digest)
    expect(topic.length).toBeGreaterThanOrEqual(43)
    expect(topic).not.toBe(capability.token)
  })

  it('rejects passwords beyond bcrypt\'s 72-byte boundary', () => {
    expect(publicJoinSchema.safeParse({
      code: 'AB2DEF', nickname: 'Gestur', password: 'a'.repeat(72),
    }).success).toBe(true)
    expect(publicJoinSchema.safeParse({
      code: 'AB2DEF', nickname: 'Gestur', password: 'a'.repeat(73),
    }).success).toBe(false)
    expect(creatorMutationSchema.safeParse({
      action: 'createSession',
      templateId: '4f0f6760-e08e-46cb-aeae-948e4fe05d83',
      password: '😀'.repeat(19),
    }).success).toBe(false)
  })
})
