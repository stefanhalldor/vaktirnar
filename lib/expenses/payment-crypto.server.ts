import 'server-only'
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
} from 'node:crypto'
import {
  canonicalExpensePaymentProfile,
  normalizeExpensePaymentProfile,
  type ExpensePaymentProfileDetails,
  type NormalizedExpensePaymentProfileDetails,
} from './payment-profile'

const ENVELOPE_VERSION = 1 as const
const ALGORITHM = 'A256GCM' as const
const IV_LENGTH = 12
const TAG_LENGTH = 16

export interface ExpensePaymentEnvelope {
  v: typeof ENVELOPE_VERSION
  alg: typeof ALGORITHM
  kid: string
  iv: string
  ciphertext: string
  tag: string
}

interface ExpensePaymentKeyring {
  activeKid: string
  keys: Map<string, Buffer>
}

export class ExpensePaymentCryptoUnavailableError extends Error {
  constructor() {
    super('expense_payment_crypto_unavailable')
  }
}

export class ExpensePaymentCryptoInvalidError extends Error {
  constructor() {
    super('expense_payment_crypto_invalid')
  }
}

function base64Url(value: Buffer): string {
  return value.toString('base64url')
}

function parseBase64Url(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new ExpensePaymentCryptoInvalidError()
  return Buffer.from(value, 'base64url')
}

function readKeyring(): ExpensePaymentKeyring {
  const raw = process.env.EXPENSE_PAYMENT_ENCRYPTION_KEYS
  if (!raw) throw new ExpensePaymentCryptoUnavailableError()
  try {
    const parsed = JSON.parse(raw) as { activeKid?: unknown; keys?: unknown }
    if (
      typeof parsed.activeKid !== 'string'
      || !/^[A-Za-z0-9._-]{1,40}$/.test(parsed.activeKid)
      || !parsed.keys
      || typeof parsed.keys !== 'object'
      || Array.isArray(parsed.keys)
    ) throw new ExpensePaymentCryptoUnavailableError()

    const keys = new Map<string, Buffer>()
    for (const [kid, encoded] of Object.entries(parsed.keys as Record<string, unknown>)) {
      if (!/^[A-Za-z0-9._-]{1,40}$/.test(kid) || typeof encoded !== 'string') {
        throw new ExpensePaymentCryptoUnavailableError()
      }
      const key = Buffer.from(encoded, 'base64')
      if (key.length !== 32) throw new ExpensePaymentCryptoUnavailableError()
      keys.set(kid, key)
    }
    if (!keys.has(parsed.activeKid)) throw new ExpensePaymentCryptoUnavailableError()
    return { activeKid: parsed.activeKid, keys }
  } catch (error) {
    if (error instanceof ExpensePaymentCryptoUnavailableError) throw error
    throw new ExpensePaymentCryptoUnavailableError()
  }
}

function aad(ownerUserId: string, profileId: string): Buffer {
  return Buffer.from(`teskeid:expense-payment-profile:${ownerUserId}:${profileId}:v${ENVELOPE_VERSION}`, 'utf8')
}

function fingerprintKey(key: Buffer): Buffer {
  return Buffer.from(hkdfSync('sha256', key, Buffer.alloc(0), 'teskeid:expense-payment-fingerprint:v1', 32))
}

export function expensePaymentCryptoConfigured(): boolean {
  try {
    readKeyring()
    return true
  } catch {
    return false
  }
}

export function encryptExpensePaymentProfile(input: {
  ownerUserId: string
  profileId: string
  details: NormalizedExpensePaymentProfileDetails
}): { envelope: ExpensePaymentEnvelope; fingerprint: string } {
  const keyring = readKeyring()
  const key = keyring.keys.get(keyring.activeKid)
  if (!key) throw new ExpensePaymentCryptoUnavailableError()

  const plaintext = canonicalExpensePaymentProfile(input.details)
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(aad(input.ownerUserId, input.profileId))
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  const fingerprint = createHmac('sha256', fingerprintKey(key))
    .update(aad(input.ownerUserId, input.profileId))
    .update('\0')
    .update(plaintext)
    .digest('hex')

  return {
    envelope: {
      v: ENVELOPE_VERSION,
      alg: ALGORITHM,
      kid: keyring.activeKid,
      iv: base64Url(iv),
      ciphertext: base64Url(ciphertext),
      tag: base64Url(tag),
    },
    fingerprint,
  }
}

function isEnvelope(value: unknown): value is ExpensePaymentEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const envelope = value as Record<string, unknown>
  return envelope.v === ENVELOPE_VERSION
    && envelope.alg === ALGORITHM
    && typeof envelope.kid === 'string'
    && typeof envelope.iv === 'string'
    && typeof envelope.ciphertext === 'string'
    && typeof envelope.tag === 'string'
    && Object.keys(envelope).every((key) => ['v', 'alg', 'kid', 'iv', 'ciphertext', 'tag'].includes(key))
}

export function decryptExpensePaymentProfile(input: {
  ownerUserId: string
  profileId: string
  envelope: unknown
}): NormalizedExpensePaymentProfileDetails {
  if (!isEnvelope(input.envelope)) throw new ExpensePaymentCryptoInvalidError()
  const keyring = readKeyring()
  const key = keyring.keys.get(input.envelope.kid)
  if (!key) throw new ExpensePaymentCryptoInvalidError()

  try {
    const iv = parseBase64Url(input.envelope.iv)
    const ciphertext = parseBase64Url(input.envelope.ciphertext)
    const tag = parseBase64Url(input.envelope.tag)
    if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH || ciphertext.length === 0) {
      throw new ExpensePaymentCryptoInvalidError()
    }
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAAD(aad(input.ownerUserId, input.profileId))
    decipher.setAuthTag(tag)
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
    const parsed = JSON.parse(plaintext) as ExpensePaymentProfileDetails
    const normalized = normalizeExpensePaymentProfile(parsed)
    if (!normalized.ok) throw new ExpensePaymentCryptoInvalidError()
    return normalized.value
  } catch (error) {
    if (error instanceof ExpensePaymentCryptoUnavailableError) throw error
    throw new ExpensePaymentCryptoInvalidError()
  }
}
