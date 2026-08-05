import { describe, expect, it } from 'vitest'
import { verifyBookkeepingAttachment } from '@/lib/bookkeeping/attachments.server'

describe('bookkeeping source document verification', () => {
  it.each([
    ['image/jpeg', [0xff, 0xd8, 0xff, 0xe0]],
    ['image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    ['image/webp', [...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')]],
    ['application/pdf', [...Buffer.from('%PDF-1.7')]],
  ] as const)('accepts %s only when magic bytes, MIME and size agree', (mimeType, header) => {
    const bytes = new Uint8Array(header)
    const verified = verifyBookkeepingAttachment(bytes, mimeType, bytes.length)
    expect(verified.mimeType).toBe(mimeType)
    expect(verified.sizeBytes).toBe(bytes.length)
    expect(verified.sha256Hex).toMatch(/^[0-9a-f]{64}$/)
  })

  it('rejects a renamed executable and declared-size mismatch', () => {
    const bytes = new Uint8Array(Buffer.from('MZ fake executable'))
    expect(() => verifyBookkeepingAttachment(bytes, 'application/pdf', bytes.length)).toThrow('mime_mismatch')
    const pdf = new Uint8Array(Buffer.from('%PDF-1.7'))
    expect(() => verifyBookkeepingAttachment(pdf, 'application/pdf', pdf.length + 1)).toThrow('size_mismatch')
  })
})
