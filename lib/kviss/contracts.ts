export const KVISS_JOIN_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const KVISS_CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/

export type KvissPublicStatus = 'lobby' | 'question' | 'reveal' | 'leaderboard' | 'ended'

export interface KvissSafeQuestion {
  id: string
  text: string
  options: string[]
  durationSeconds: number
  confidenceMode: boolean
  correctOptionIndices: number[] | null
}

export interface KvissParticipantProjection {
  joinCode: string
  title: string
  status: KvissPublicStatus
  revision: number
  participant: {
    nickname: string
    teamIndex: number | null
    teamName: string | null
  }
  participantAnswer: {
    id: string
    selectedOption: number
    answeredAt: string
  } | null
  activeQuestion: KvissSafeQuestion | null
  questionStartedAt: string | null
  leaderboard: Array<{
    nickname: string
    points: number
    correctCount: number
  }>
  chat: Array<{
    id: string
    authorName: string
    body: string
    createdAt: string
  }>
  realtimeTopic: string | null
}

export interface KvissJoinPreview {
  joinCode: string
  title: string
  passwordRequired: boolean
  status: 'open' | 'ended'
}

export function normalizeKvissCode(value: string): string {
  return value.trim().toUpperCase()
}

export function canonicalKvissPath(code: string): string {
  return `/kviss/${normalizeKvissCode(code)}`
}
