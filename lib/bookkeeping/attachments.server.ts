import 'server-only'

import { createHash } from 'node:crypto'
import {
  BOOKKEEPING_ATTACHMENT_MAX_BYTES,
  type BookkeepingAttachmentMimeType,
} from './constants'

export interface VerifiedBookkeepingAttachment {
  mimeType: BookkeepingAttachmentMimeType
  sizeBytes: number
  sha256Hex: string
}

function detectedMime(bytes: Uint8Array): BookkeepingAttachmentMimeType | null {
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return 'image/png'
  }
  if (bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') {
    return 'image/webp'
  }
  if (bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-') {
    return 'application/pdf'
  }
  return null
}

export function verifyBookkeepingAttachment(
  bytes: Uint8Array,
  declaredMimeType: string,
  declaredSizeBytes: number,
): VerifiedBookkeepingAttachment {
  if (bytes.byteLength < 1 || bytes.byteLength > BOOKKEEPING_ATTACHMENT_MAX_BYTES) {
    throw new Error('bookkeeping_attachment_size_invalid')
  }
  if (bytes.byteLength !== declaredSizeBytes) {
    throw new Error('bookkeeping_attachment_size_mismatch')
  }
  const mimeType = detectedMime(bytes)
  if (!mimeType || mimeType !== declaredMimeType) {
    throw new Error('bookkeeping_attachment_mime_mismatch')
  }
  return {
    mimeType,
    sizeBytes: bytes.byteLength,
    sha256Hex: createHash('sha256').update(bytes).digest('hex'),
  }
}
