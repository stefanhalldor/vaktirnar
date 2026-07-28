import 'server-only'
import { createHmac, randomBytes } from 'node:crypto'

const PAIRING_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
const TOKEN_PREFIX = 'tsa_'
const TOKEN_PATTERN = /^tsa_[A-Za-z0-9_-]{43}$/

function getAgentHashKey(): Buffer {
  const rootSecret = process.env.AUTH_CODE_SECRET
  if (!rootSecret || Buffer.byteLength(rootSecret, 'utf8') < 32) {
    console.error('[agent-collaboration] pairing key unavailable')
    throw new Error('agent collaboration unavailable')
  }

  // Domain separation prevents hashes for this service from overlapping with
  // login-code hashes even though both are rooted in the existing server key.
  return createHmac('sha256', rootSecret)
    .update('teskeid-agent-collaboration:v1')
    .digest()
}

function keyedHash(kind: 'pairing' | 'token', value: string): string {
  return createHmac('sha256', getAgentHashKey())
    .update(`${kind}\0${value}`)
    .digest('hex')
}

export function generatePairingCode(): string {
  const bytes = randomBytes(12)
  let value = ''
  for (const byte of bytes) value += PAIRING_ALPHABET[byte % PAIRING_ALPHABET.length]
  return `${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}`
}

export function normalizePairingCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function hashPairingCode(code: string): string {
  return keyedHash('pairing', normalizePairingCode(code))
}

export function generateConnectorToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString('base64url')
}

export function hashConnectorToken(token: string): string {
  return keyedHash('token', token)
}

export function readBearerToken(request: Request): string | null {
  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return null
  const token = authorization.slice(7).trim()
  if (!TOKEN_PATTERN.test(token)) return null
  return token
}
