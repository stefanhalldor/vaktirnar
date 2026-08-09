import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('production Kviss source security contracts', () => {
  it('keeps all new Icelandic and English message keys in parity', () => {
    const isMessages = JSON.parse(source('messages/is.json')) as Record<string, unknown>
    const enMessages = JSON.parse(source('messages/en.json')) as Record<string, unknown>
    const keys = (value: unknown, prefix = ''): string[] => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix]
      return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) => keys(nested, prefix ? `${prefix}.${key}` : key))
    }
    expect(keys(isMessages.kviss).sort()).toEqual(keys(enMessages.kviss).sort())
  })

  it('keeps the raw participant capability in an HttpOnly same-origin cookie only', () => {
    const security = source('lib/kviss/security.server.ts')
    const joinRoute = source('app/api/kviss/public/join/route.ts')
    expect(security).toMatch(/httpOnly:\s*true/)
    expect(security).toMatch(/sameSite:\s*'lax'/)
    expect(security).toMatch(/secure:\s*process\.env\.NODE_ENV === 'production'/)
    expect(joinRoute).toMatch(/setCapabilityCookie\(response/)
    expect(joinRoute).toMatch(/NextResponse\.json\(\{ joinCode: joined\.joinCode \}/)
    expect(joinRoute).not.toMatch(/NextResponse\.json\(\{[^}]*\b(?:token|capability):/)
  })

  it('treats Broadcast as a content-free invalidation signal', () => {
    const realtime = source('lib/kviss/realtime.server.ts')
    const participant = source('components/kviss/KvissParticipantClient.tsx')
    expect(realtime).toMatch(/event: 'invalidate'/)
    expect(realtime).toMatch(/payload: revision === undefined \? \{ kind: 'invalidate' \}/)
    expect(realtime).not.toMatch(/nickname|answer|question|chat|capability|sessionId/)
    expect(participant).toMatch(/on\('broadcast', \{ event: 'invalidate' \}/)
    expect(participant).toMatch(/void refresh\(\)/)
    expect(participant).not.toMatch(/payload\.(?:question|answer|chat|state)/)
  })

  it('gates correct answers until reveal', () => {
    const repository = source('lib/kviss/repository.server.ts')
    expect(repository).toMatch(/const reveal = status === 'reveal' \|\| status === 'leaderboard' \|\| status === 'ended'/)
    expect(repository).toMatch(/correctOptionIndices: displayedCorrect/)
    expect(repository).toMatch(/leaderboard: status === 'leaderboard' \|\| status === 'ended'/)
  })

  it('keeps raw database rows and credential verifiers out of public responses', () => {
    const repository = source('lib/kviss/repository.server.ts')
    const creatorRoute = source('app/api/auth-mvp/kviss/route.ts')
    const answerRoute = source('app/api/kviss/public/answer/route.ts')
    const chatRoute = source('app/api/kviss/public/chat/route.ts')
    expect(repository).toMatch(/joinCode: asString\(row\.join_code\)/)
    expect(repository).not.toMatch(/return data as DbRecord/)
    expect(creatorRoute).not.toMatch(/password_hash|broadcast_topic/)
    expect(answerRoute).toMatch(/NextResponse\.json\(\{ ok: true \}/)
    expect(chatRoute).toMatch(/NextResponse\.json\(\{ ok: true \}/)
    expect(answerRoute).not.toMatch(/NextResponse\.json\(\{ answer \}/)
    expect(chatRoute).not.toMatch(/NextResponse\.json\(\{ message \}/)
  })

  it('returns the newest bounded chat window in chronological order', () => {
    const repository = source('lib/kviss/repository.server.ts')
    expect(repository).toMatch(/order\('created_at', \{ ascending: false \}\)\.limit\(100\)/)
    expect(repository).toMatch(/messagesResult\.data \?\? \[\]\)[\s\S]*\.reverse\(\)/)
  })

  it('keeps participant heartbeat mutation behind the throttled SQL RPC', () => {
    const repository = source('lib/kviss/repository.server.ts')
    expect(repository).toMatch(/admin\.rpc\('kviss_touch_participant'/)
    expect(repository).not.toMatch(/from\('kviss_participants'\)\.update\(/)
  })

  it('aligns creator and guest passwords with the pgcrypto bcrypt byte limit', () => {
    const validation = source('lib/kviss/validation.ts')
    const creator = source('components/kviss/KvissCreatorClient.tsx')
    const participant = source('components/kviss/KvissParticipantClient.tsx')
    expect(validation).toMatch(/new TextEncoder\(\)\.encode\(value\)\.length <= 72/)
    expect(creator).toMatch(/type="password"[\s\S]*?maxLength=\{72\}/)
    expect(participant).toMatch(/type="password"[\s\S]*?maxLength=\{72\}/)
  })
})
