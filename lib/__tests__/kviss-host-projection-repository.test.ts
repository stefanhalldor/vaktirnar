import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  getAdmin: () => ({ from: mocks.from, rpc: mocks.rpc }),
}))

import {
  createKvissSession,
  getSessionTopicAfterJoin,
  getSessionTopicForAuthor,
  loadKvissHostProjection,
} from '@/lib/kviss/repository.server'

type QueryResult = { data: unknown; error: unknown }

function query(result: QueryResult) {
  const builder: Record<string, ReturnType<typeof vi.fn>> & {
    then?: Promise<QueryResult>['then']
  } = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    order: vi.fn(),
    maybeSingle: vi.fn(async () => result),
  }
  builder.select.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  builder.is.mockReturnValue(builder)
  builder.order.mockReturnValue(builder)
  builder.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  return builder
}

const actorId = '00000000-0000-4000-8000-000000000021'
const spaceId = '00000000-0000-4000-8000-000000000022'
const sessionId = '00000000-0000-4000-8000-000000000023'
const topic = 'a'.repeat(43)

function projectionQueries(status: 'question' | 'ended' = 'question') {
  const session = query({
    data: {
      id: sessionId,
      join_code: 'ABC234',
      title: 'Lifandi kviss',
      status,
      revision: 8,
      active_question_id: 'question-1',
      activation_id: 'activation-current',
      question_started_at: '2026-08-10T10:05:00.000Z',
      broadcast_topic: topic,
      team_names: ['Graena lidid'],
      created_at: '2026-08-10T10:00:00.000Z',
      ended_at: status === 'ended' ? '2026-08-10T10:20:00.000Z' : null,
    },
    error: null,
  })
  const questions = query({
    data: [
      {
        id: 'question-1', sort_order: 0, question_text: 'Fyrsta?',
        options: ['A', 'B'], correct_option_indices: [0], duration_seconds: 20,
        point_weight: 1, confidence_mode: false,
      },
      {
        id: 'question-2', sort_order: 1, question_text: 'Onnur?',
        options: ['C', 'D'], correct_option_indices: [1], duration_seconds: 30,
        point_weight: 2, confidence_mode: true,
      },
    ],
    error: null,
  })
  const participants = query({
    data: [
      {
        id: 'participant-1', nickname: 'Anna', team_index: 0,
        joined_at: '2026-08-10T10:01:00.000Z', last_seen_at: '2026-08-10T10:06:00.000Z',
      },
      {
        id: 'participant-2', nickname: 'Bjarni', team_index: null,
        joined_at: '2026-08-10T10:02:00.000Z', last_seen_at: '2026-08-10T10:06:30.000Z',
      },
    ],
    error: null,
  })
  const answers = query({
    data: [
      {
        id: 'answer-1', participant_id: 'participant-1', question_id: 'question-1',
        activation_id: 'activation-current', is_correct: true, answered_at: '2026-08-10T10:05:01.000Z',
      },
      {
        id: 'answer-2', participant_id: 'participant-2', question_id: 'question-1',
        activation_id: 'activation-old', is_correct: true, answered_at: '2026-08-10T10:05:02.000Z',
      },
      {
        id: 'answer-3', participant_id: 'participant-2', question_id: 'question-2',
        activation_id: 'activation-2', is_correct: true, answered_at: '2026-08-10T10:07:01.000Z',
      },
      {
        id: 'answer-4', participant_id: 'participant-1', question_id: 'question-2',
        activation_id: 'activation-2', is_correct: false, answered_at: '2026-08-10T10:07:02.000Z',
      },
    ],
    error: null,
  })
  const commands = query({
    data: [
      { question_id: 'question-1', resulting_revision: 2 },
      { question_id: 'question-2', resulting_revision: 5 },
      { question_id: 'question-1', resulting_revision: 7 },
    ],
    error: null,
  })
  const builders = { session, questions, participants, answers, commands }
  mocks.from.mockImplementation((table: string) => {
    if (table === 'kviss_sessions') return session
    if (table === 'kviss_session_questions') return questions
    if (table === 'kviss_participants') return participants
    if (table === 'kviss_answers') return answers
    if (table === 'kviss_session_commands') return commands
    throw new Error(`Unexpected table: ${table}`)
  })
  return builders
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.KVISS_REALTIME_ENABLED = 'true'
})

describe('createKvissSession', () => {
  it.each([
    ['object', {
      id: sessionId, join_code: 'ABC234', title: 'Lifandi kviss', status: 'lobby', revision: 1,
    }],
    ['PostgREST composite array', [{
      id: sessionId, join_code: 'ABC234', title: 'Lifandi kviss', status: 'lobby', revision: 1,
    }]],
  ])('normalizes the %s RPC response before returning the navigation id', async (_shape, data) => {
    mocks.rpc.mockResolvedValue({ data, error: null })

    await expect(createKvissSession(actorId, spaceId, sessionId, null, topic)).resolves.toEqual({
      id: sessionId,
      joinCode: 'ABC234',
      title: 'Lifandi kviss',
      status: 'lobby',
      revision: 1,
    })
  })

  it('fails closed when the RPC response has no usable session id', async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null })

    await expect(createKvissSession(actorId, spaceId, sessionId, null, topic))
      .rejects.toThrow('kviss_session_create_failed')
  })
})

describe('loadKvissHostProjection', () => {
  it('authorizes the parent row before returning a safe canonical live projection', async () => {
    const builders = projectionQueries()

    const projection = await loadKvissHostProjection(actorId, spaceId, sessionId)

    expect(builders.session.select).toHaveBeenCalledWith(
      'id,join_code,title,status,revision,active_question_id,activation_id,question_started_at,broadcast_topic,team_names,created_at,ended_at',
    )
    expect(builders.session.eq.mock.calls).toEqual([
      ['id', sessionId],
      ['space_id', spaceId],
      ['created_by', actorId],
    ])
    expect(builders.questions.select).toHaveBeenCalledWith(
      'id,sort_order,question_text,options,correct_option_indices,duration_seconds,point_weight,confidence_mode',
    )
    expect(builders.participants.select).toHaveBeenCalledWith('id,nickname,team_index,joined_at,last_seen_at')
    expect(builders.answers.select).toHaveBeenCalledWith(
      'id,participant_id,question_id,activation_id,is_correct,answered_at',
    )
    expect(builders.commands.select).toHaveBeenCalledWith('question_id,resulting_revision')
    expect(projection).toMatchObject({
      session: {
        id: sessionId,
        status: 'question',
        activeQuestionId: 'question-1',
        teamNames: ['Graena lidid'],
      },
      questions: [
        { id: 'question-1', options: ['A', 'B'], correctOptionIndices: [0], pointWeight: 1 },
        { id: 'question-2', options: ['C', 'D'], correctOptionIndices: [1], pointWeight: 2 },
      ],
      activatedQuestionIds: ['question-1', 'question-2'],
      activeAnswerCount: 1,
      participants: [
        { id: 'participant-1', nickname: 'Anna', teamIndex: 0, teamName: 'Graena lidid' },
        { id: 'participant-2', nickname: 'Bjarni', teamIndex: null, teamName: null },
      ],
      leaderboard: [
        { participantId: 'participant-2', nickname: 'Bjarni', points: 2500, correctCount: 2 },
        { participantId: 'participant-1', nickname: 'Anna', points: 1000, correctCount: 1 },
      ],
      realtimeTopic: topic,
    })
    const serialized = JSON.stringify(projection)
    expect(serialized).not.toMatch(/password|capability|digest|actor_scope|broadcast_topic/)
  })

  it('does not query child tables when the actor and space fence misses', async () => {
    const session = query({ data: null, error: null })
    mocks.from.mockImplementation((table: string) => {
      if (table === 'kviss_sessions') return session
      throw new Error(`Child table must not be queried: ${table}`)
    })

    await expect(loadKvissHostProjection(actorId, spaceId, sessionId)).resolves.toBeNull()
    expect(mocks.from).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['disabled realtime', 'question', 'false'],
    ['ended session', 'ended', 'true'],
  ] as const)('withholds the realtime topic for %s', async (_label, status, realtimeEnabled) => {
    process.env.KVISS_REALTIME_ENABLED = realtimeEnabled
    projectionQueries(status)

    const projection = await loadKvissHostProjection(actorId, spaceId, sessionId)

    expect(projection?.realtimeTopic).toBeNull()
  })
})

describe('session topic lookup', () => {
  it('binds author notifications to the authorized space rather than created_by', async () => {
    const session = query({ data: { broadcast_topic: topic, status: 'question' }, error: null })
    mocks.from.mockReturnValue(session)

    await expect(getSessionTopicForAuthor(spaceId, sessionId)).resolves.toBe(topic)
    expect(session.eq.mock.calls).toEqual([['id', sessionId], ['space_id', spaceId]])
  })

  it('skips the post-join lookup entirely when realtime is disabled', async () => {
    process.env.KVISS_REALTIME_ENABLED = 'false'

    await expect(getSessionTopicAfterJoin(sessionId)).resolves.toBeNull()
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
