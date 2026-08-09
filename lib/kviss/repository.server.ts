import 'server-only'
import { createHash } from 'node:crypto'
import { getAdmin } from '@/lib/supabase/admin'
import type { KvissJoinPreview, KvissParticipantProjection } from './contracts'
import { normalizeKvissCode } from './contracts'

type DbRecord = Record<string, unknown>

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asNumber(value: unknown): number {
  return Number.isFinite(Number(value)) ? Number(value) : 0
}

export async function loadKvissAuthoring(spaceId: string) {
  const admin = getAdmin()
  const [questionsResult, templatesResult, templateQuestionsResult, sessionsResult] = await Promise.all([
    admin.from('kviss_questions').select('*').eq('space_id', spaceId).is('archived_at', null).order('sort_order'),
    admin.from('kviss_templates').select('*').eq('space_id', spaceId).is('archived_at', null).order('updated_at', { ascending: false }),
    admin.from('kviss_template_questions').select('*').eq('space_id', spaceId).order('sort_order'),
    admin.from('kviss_sessions').select('id,template_id,join_code,title,status,revision,active_question_id,created_at').eq('space_id', spaceId).order('created_at', { ascending: false }).limit(50),
  ])
  const error = questionsResult.error || templatesResult.error || templateQuestionsResult.error || sessionsResult.error
  if (error) throw new Error('kviss_authoring_load_failed')
  const sessionIds = (sessionsResult.data ?? []).map(row => row.id)
  const sessionQuestionsResult = sessionIds.length > 0
    ? await admin.from('kviss_session_questions').select('id,session_id,sort_order,question_text').in('session_id', sessionIds).order('sort_order')
    : { data: [], error: null }
  if (sessionQuestionsResult.error) throw new Error('kviss_authoring_load_failed')
  const sessionParticipantsResult = sessionIds.length > 0
    ? await admin.from('kviss_participants').select('id,session_id,nickname,team_index,joined_at').in('session_id', sessionIds).is('revoked_at', null).order('joined_at')
    : { data: [], error: null }
  if (sessionParticipantsResult.error) throw new Error('kviss_authoring_load_failed')
  return {
    questions: questionsResult.data ?? [],
    templates: templatesResult.data ?? [],
    templateQuestions: templateQuestionsResult.data ?? [],
    sessions: sessionsResult.data ?? [],
    sessionQuestions: sessionQuestionsResult.data ?? [],
    sessionParticipants: sessionParticipantsResult.data ?? [],
  }
}

export async function upsertKvissQuestion(actorId: string, spaceId: string, input: {
  id?: string | null
  expectedRevision?: number | null
  text: string
  options: string[]
  correctOptionIndices: number[]
  durationSeconds: number
  pointWeight: number
  confidenceMode: boolean
  labels: string[]
  sortOrder: number
}) {
  const { data, error } = await getAdmin().rpc('kviss_upsert_question', {
    p_actor_id: actorId, p_space_id: spaceId, p_question_id: input.id ?? null,
    p_expected_revision: input.expectedRevision ?? null, p_question_text: input.text,
    p_options: input.options, p_correct_option_indices: input.correctOptionIndices,
    p_duration_seconds: input.durationSeconds, p_point_weight: input.pointWeight,
    p_confidence_mode: input.confidenceMode, p_labels: input.labels,
    p_sort_order: input.sortOrder,
  })
  if (error) throw error
  return data
}

export async function archiveKvissQuestion(actorId: string, spaceId: string, questionId: string, expectedRevision: number) {
  const { error } = await getAdmin().rpc('kviss_archive_question', {
    p_actor_id: actorId, p_space_id: spaceId, p_question_id: questionId,
    p_expected_revision: expectedRevision,
  })
  if (error) throw error
}

export async function saveKvissTemplate(actorId: string, spaceId: string, input: {
  id?: string | null
  expectedRevision?: number | null
  title: string
  teamNames: string[]
  questions: Array<{ id: string; sourceQuestionId: string; sourceQuestionRevision: number }>
}) {
  const { data, error } = await getAdmin().rpc('kviss_save_template', {
    p_actor_id: actorId, p_space_id: spaceId, p_template_id: input.id ?? null,
    p_expected_revision: input.expectedRevision ?? null, p_title: input.title,
    p_team_names: input.teamNames, p_questions: input.questions,
  })
  if (error) throw error
  return data
}

export async function createKvissSession(actorId: string, spaceId: string, templateId: string, password: string | null, topic: string) {
  const { data, error } = await getAdmin().rpc('kviss_create_session', {
    p_actor_id: actorId, p_space_id: spaceId, p_template_id: templateId,
    p_password: password, p_broadcast_topic: topic,
  })
  if (error) throw error
  const row = data as DbRecord
  return {
    id: asString(row.id),
    joinCode: asString(row.join_code),
    title: asString(row.title),
    status: asString(row.status),
    revision: asNumber(row.revision),
  }
}

export async function applyKvissHostCommand(actorId: string, input: {
  sessionId: string; expectedRevision: number; commandId: string
  commandType: 'activate_question' | 'reveal' | 'leaderboard' | 'end'
  questionId?: string | null
}) {
  const { data, error } = await getAdmin().rpc('kviss_host_command', {
    p_actor_id: actorId, p_session_id: input.sessionId,
    p_expected_revision: input.expectedRevision, p_command_id: input.commandId,
    p_command_type: input.commandType, p_question_id: input.questionId ?? null,
  })
  if (error) throw error
  return Number(data)
}

export async function lookupKviss(code: string): Promise<KvissJoinPreview | null> {
  const normalized = normalizeKvissCode(code)
  const { data, error } = await getAdmin().from('kviss_sessions')
    .select('join_code,title,status,password_hash').eq('join_code', normalized).maybeSingle()
  if (error || !data) return null
  return {
    joinCode: data.join_code,
    title: data.title,
    passwordRequired: data.password_hash !== null,
    status: data.status === 'ended' ? 'ended' : 'open',
  }
}

export async function joinKviss(input: {
  code: string; nickname: string; password?: string
  capabilityDigest: string; actorScopeHash: string
}) {
  const { data, error } = await getAdmin().rpc('kviss_join_session', {
    p_join_code: normalizeKvissCode(input.code), p_nickname: input.nickname,
    p_password: input.password ?? null, p_capability_digest: input.capabilityDigest,
    p_actor_scope_hash: input.actorScopeHash,
  })
  if (error) throw error
  const result = data as { participantId?: string; sessionId?: string; joinCode?: string; error?: string }
  if (result.error === 'rate_limited') throw new Error('kviss_join_rate_limited')
  if (result.error || !result.participantId || !result.sessionId || !result.joinCode) throw new Error('kviss_join_failed')
  return result as { participantId: string; sessionId: string; joinCode: string }
}

function optionPermutation(participantId: string, questionId: string, count: number): number[] {
  const values = Array.from({ length: count }, (_, index) => index)
  return values.sort((left, right) => {
    const leftHash = createHash('sha256').update(`${participantId}:${questionId}:${left}`).digest('hex')
    const rightHash = createHash('sha256').update(`${participantId}:${questionId}:${right}`).digest('hex')
    return leftHash.localeCompare(rightHash)
  })
}

export async function resolveParticipantSelection(capabilityDigest: string, questionId: string, displayedIndex: number): Promise<number | null> {
  const admin = getAdmin()
  const participantResult = await admin.from('kviss_participants').select('id,session_id,expires_at,revoked_at')
    .eq('capability_digest', capabilityDigest).maybeSingle()
  const participant = participantResult.data
  if (participantResult.error || !participant || participant.revoked_at || new Date(participant.expires_at) <= new Date()) return null
  const questionResult = await admin.from('kviss_session_questions').select('id,options')
    .eq('session_id', participant.session_id).eq('id', questionId).maybeSingle()
  if (questionResult.error || !questionResult.data || !Array.isArray(questionResult.data.options)) return null
  return optionPermutation(participant.id, questionId, questionResult.data.options.length)[displayedIndex] ?? null
}

export async function answerKviss(capabilityDigest: string, questionId: string, originalOption: number, commandId: string) {
  const { data, error } = await getAdmin().rpc('kviss_answer_question', {
    p_capability_digest: capabilityDigest, p_question_id: questionId,
    p_selected_option: originalOption, p_command_id: commandId,
  })
  if (error) throw error
  return data
}

export async function sendKvissMessage(capabilityDigest: string, body: string, clientMessageId: string) {
  const { data, error } = await getAdmin().rpc('kviss_send_message', {
    p_capability_digest: capabilityDigest, p_client_message_id: clientMessageId, p_body: body,
  })
  if (error) throw error
  return data
}

export async function loadParticipantProjection(capabilityDigest: string, expectedCode: string): Promise<KvissParticipantProjection | null> {
  const admin = getAdmin()
  const participantResult = await admin.from('kviss_participants').select('*')
    .eq('capability_digest', capabilityDigest).maybeSingle()
  const participant = participantResult.data as DbRecord | null
  if (participantResult.error || !participant || participant.revoked_at || new Date(asString(participant.expires_at)) <= new Date()) return null

  const sessionResult = await admin.from('kviss_sessions').select('*')
    .eq('id', participant.session_id).eq('join_code', normalizeKvissCode(expectedCode)).maybeSingle()
  const session = sessionResult.data as DbRecord | null
  if (sessionResult.error || !session) return null

  const sessionId = asString(session.id)
  const participantId = asString(participant.id)
  await admin.rpc('kviss_touch_participant', {
    p_capability_digest: capabilityDigest,
    p_session_id: sessionId,
  })
  const [participantsResult, questionsResult, answersResult, messagesResult] = await Promise.all([
    admin.from('kviss_participants').select('id,nickname,team_index,joined_at').eq('session_id', sessionId).is('revoked_at', null).order('joined_at'),
    admin.from('kviss_session_questions').select('*').eq('session_id', sessionId).order('sort_order'),
    admin.from('kviss_answers').select('*').eq('session_id', sessionId).order('answered_at'),
    admin.from('kviss_session_messages').select('id,participant_id,body,created_at').eq('session_id', sessionId).order('created_at', { ascending: false }).limit(100),
  ])
  if (participantsResult.error || questionsResult.error || answersResult.error || messagesResult.error) return null
  const participants = (participantsResult.data ?? []) as DbRecord[]
  const questions = (questionsResult.data ?? []) as DbRecord[]
  const answers = (answersResult.data ?? []) as DbRecord[]
  const messages = ((messagesResult.data ?? []) as DbRecord[]).reverse()
  const activeQuestion = questions.find(question => question.id === session.active_question_id)
  const activeOptions: unknown[] = activeQuestion && Array.isArray(activeQuestion.options)
    ? activeQuestion.options
    : []
  const status = asString(session.status) as KvissParticipantProjection['status']
  const permutation = activeQuestion
    ? optionPermutation(participantId, asString(activeQuestion.id), activeOptions.length)
    : []
  const displayedOptions = activeQuestion
    ? permutation.map(index => String(activeOptions[index]))
    : []
  const reveal = status === 'reveal' || status === 'leaderboard' || status === 'ended'
  const originalCorrect = activeQuestion && Array.isArray(activeQuestion.correct_option_indices)
    ? activeQuestion.correct_option_indices.map(Number)
    : []
  const displayedCorrect = reveal
    ? originalCorrect.map(original => permutation.indexOf(original)).filter(index => index >= 0)
    : null
  const ownAnswer = activeQuestion
    ? answers.find(answer => answer.participant_id === participantId && answer.question_id === activeQuestion.id)
    : undefined
  const ownDisplayedAnswer = ownAnswer ? permutation.indexOf(asNumber(ownAnswer.selected_option)) : -1

  const scores = new Map<string, { points: number; correct: number }>()
  participants.forEach(row => scores.set(asString(row.id), { points: 0, correct: 0 }))
  for (const question of questions) {
    const correct = answers
      .filter(answer => answer.question_id === question.id && answer.is_correct === true)
      .sort((left, right) => asString(left.answered_at).localeCompare(asString(right.answered_at)) || asString(left.id).localeCompare(asString(right.id)))
    correct.forEach((answer, rank) => {
      const current = scores.get(asString(answer.participant_id)) ?? { points: 0, correct: 0 }
      current.correct += 1
      current.points += Math.max(0, 1000 * asNumber(question.point_weight) - rank * 500)
      scores.set(asString(answer.participant_id), current)
    })
  }
  const names = new Map(participants.map(row => [asString(row.id), asString(row.nickname)]))
  const teamNames = Array.isArray(session.team_names) ? session.team_names.map(String) : []
  return {
    joinCode: asString(session.join_code), title: asString(session.title), status,
    revision: asNumber(session.revision),
    participant: {
      nickname: asString(participant.nickname),
      teamIndex: participant.team_index === null ? null : asNumber(participant.team_index),
      teamName: participant.team_index === null ? null : teamNames[asNumber(participant.team_index)] ?? null,
    },
    participantAnswer: ownAnswer ? {
      id: asString(ownAnswer.id), selectedOption: ownDisplayedAnswer,
      answeredAt: asString(ownAnswer.answered_at),
    } : null,
    activeQuestion: activeQuestion ? {
      id: asString(activeQuestion.id), text: asString(activeQuestion.question_text),
      options: displayedOptions, durationSeconds: asNumber(activeQuestion.duration_seconds),
      confidenceMode: activeQuestion.confidence_mode === true,
      correctOptionIndices: displayedCorrect,
    } : null,
    questionStartedAt: session.question_started_at ? asString(session.question_started_at) : null,
    leaderboard: status === 'leaderboard' || status === 'ended'
      ? [...scores.entries()].map(([id, score]) => ({ nickname: names.get(id) ?? '', points: score.points, correctCount: score.correct }))
        .sort((left, right) => right.points - left.points || left.nickname.localeCompare(right.nickname, 'is'))
      : [],
    chat: messages.map(message => ({ id: asString(message.id), authorName: names.get(asString(message.participant_id)) ?? '', body: asString(message.body), createdAt: asString(message.created_at) })),
    realtimeTopic: process.env.KVISS_REALTIME_ENABLED === 'true' && status !== 'ended' ? asString(session.broadcast_topic) : null,
  }
}

export async function getSessionTopicForAuthor(actorId: string, sessionId: string): Promise<string | null> {
  const { data } = await getAdmin().from('kviss_sessions').select('broadcast_topic,created_by').eq('id', sessionId).maybeSingle()
  return data?.created_by === actorId ? data.broadcast_topic : null
}
