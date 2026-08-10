/**
 * @vitest-environment-options {"url":"https://teskeid.is/auth-mvp/kviss/lota/session-1?syn=stillingar"}
 */

import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { KvissHostProjection, KvissPublicStatus } from '@/lib/kviss/contracts'

const navigation = vi.hoisted(() => ({ push: vi.fn() }))
const realtime = vi.hoisted(() => ({
  channel: vi.fn(),
  on: vi.fn(),
  subscribe: vi.fn(),
  removeChannel: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
}))

vi.mock('@/lib/supabase/client', () => {
  const channel = {
    on: (...args: unknown[]) => {
      realtime.on(...args)
      return channel
    },
    subscribe: (...args: unknown[]) => {
      realtime.subscribe(...args)
      return channel
    },
  }
  return {
    createClient: () => ({
      channel: (topic: string) => {
        realtime.channel(topic)
        return channel
      },
      removeChannel: (selected: unknown) => realtime.removeChannel(selected),
    }),
  }
})

const translations: Record<string, string> = {
  creatorTabs: 'Kviss-sýn',
  bankTab: 'Spurningasafn',
  quizzesTab: 'Kvissin mín',
  creatorLoadError: 'Ekki tókst að sækja kviss.',
  conflict: 'Gögnin breyttust.',
  saveError: 'Ekki tókst að vista.',
  questionBankTitle: 'Spurningasafn',
  questionBankDescription: 'Búðu til endurnýtanlegar spurningar.',
  questionSearchLabel: 'Leita í spurningum',
  questionSearchPlaceholder: 'Leita',
  noBankQuestions: 'Engar spurningar.',
  noQuestionResults: 'Engar niðurstöður.',
  newBankQuestion: 'Ný spurning',
  editBankQuestion: 'Breyta spurningu',
  questionRevision: 'Útgáfa {count}',
  optionCount: '{count} svarmöguleikar',
  editQuestion: 'Breyta spurningu',
  deleteQuestion: 'Eyða spurningu',
  deleteQuestionConfirm: 'Eyða?',
  questionTextLabel: 'Spurning',
  questionTextRequired: 'Spurningu vantar.',
  answerOptions: 'Svarmöguleikar',
  optionLabel: 'Svarmöguleiki {number}',
  markCorrect: 'Rétt svar {number}',
  correctAnswersHint: 'Veldu rétt svar.',
  questionNeedsOptions: 'Tvo svarmöguleika vantar.',
  questionNeedsCorrect: 'Veldu rétt svar.',
  durationSeconds: 'Tími í sekúndum',
  pointWeight: 'Stigavægi',
  confidenceMode: 'Sýna Meðidda',
  numberError_required: 'Gildi vantar.',
  numberError_invalid: 'Ógilt gildi.',
  numberError_too_small: 'Minnst {limit}.',
  saveQuestion: 'Vista spurningu',
  savingQuestion: 'Vista spurningu...',
  cancel: 'Hætta við',
  savedQuizzes: 'Vistuð kviss',
  noSavedQuizzes: 'Engin vistuð kviss.',
  questionCount: '{count} spurningar',
  optionalPassword: 'Lykilorð, valfrjálst',
  createSession: 'Búa til lifandi lotu',
  creatingSession: 'Bý til lifandi lotu...',
  liveSessions: 'Lifandi lotur',
  noSessions: 'Engar lotur.',
  audienceView: 'Áhorfendasýn',
  audienceJoinPrompt: 'Farðu á teskeid.is/kviss',
  participantCount: '{count} þátttakendur',
  seconds: '{count} sek.',
  questionNumber: 'Spurning {number}',
  answerProgress: '{answered} af {total} hafa svarað',
  leaderboard: 'Staðan',
  leaderboardEmpty: 'Staðan er tóm.',
  points: '{count} stig',
  liveMode: 'Lifandi lota',
  sessionStatus_lobby: 'Biðstofa',
  liveViews: 'Sýnir lifandi lotu',
  settingsView: 'Stillingar',
  performerView: 'Flytjandi',
  joinDetails: 'Tengingarupplýsingar',
  codeLabel: 'Kóði',
  statusLabel: 'Staða',
  copyLink: 'Afrita hlekk',
  linkCopied: 'Hlekkur afritaður',
  openAudienceWindow: 'Opna áhorfendasýn',
  participants: 'Þátttakendur',
  noParticipants: 'Enginn kominn inn.',
  endSession: 'Ljúka lotu',
  backToWorkspace: 'Til baka í kviss',
}

vi.mock('next-intl', () => {
  const translate = (key: string, values?: Record<string, string | number>) => {
    let text = translations[key] ?? key
    for (const [name, value] of Object.entries(values ?? {})) {
      text = text.replaceAll(`{${name}}`, String(value))
    }
    return text
  }
  return { useTranslations: () => translate }
})

import { KvissAudienceView } from '@/components/kviss/KvissAudienceView'
import { KvissCreatorClient } from '@/components/kviss/KvissCreatorClient'
import { KvissLiveClient } from '@/components/kviss/KvissLiveClient'

type AuthoringState = {
  questions: Record<string, unknown>[]
  templates: Record<string, unknown>[]
  templateQuestions: Record<string, unknown>[]
  sessions: Record<string, unknown>[]
  sessionQuestions: Record<string, unknown>[]
  sessionParticipants: Record<string, unknown>[]
}

const EMPTY_STATE: AuthoringState = {
  questions: [],
  templates: [],
  templateQuestions: [],
  sessions: [],
  sessionQuestions: [],
  sessionParticipants: [],
}

function response(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => { resolve = next })
  return { promise, resolve }
}

function hostProjection(status: KvissPublicStatus): KvissHostProjection {
  return {
    session: {
      id: 'session-1',
      joinCode: 'ABC234',
      title: 'Föstudagskviss',
      status,
      revision: 3,
      activeQuestionId: status === 'lobby' ? null : 'question-1',
      questionStartedAt: '2026-08-10T12:00:00.000Z',
      teamNames: [],
      createdAt: '2026-08-10T11:55:00.000Z',
      endedAt: status === 'ended' ? '2026-08-10T12:10:00.000Z' : null,
    },
    questions: [{
      id: 'question-1',
      sortOrder: 0,
      text: 'Hvað er rétt?',
      options: ['Rangt', 'Rétt'],
      correctOptionIndices: [1],
      durationSeconds: 20,
      pointWeight: 1,
      confidenceMode: false,
    }],
    activatedQuestionIds: ['question-1'],
    activeAnswerCount: 1,
    participants: [{
      id: 'participant-1',
      nickname: 'Anna',
      teamIndex: null,
      teamName: null,
      joinedAt: '2026-08-10T11:58:00.000Z',
      lastSeenAt: '2026-08-10T12:00:00.000Z',
    }],
    leaderboard: [{
      participantId: 'participant-1',
      nickname: 'Anna',
      teamIndex: null,
      teamName: null,
      points: 1000,
      correctCount: 1,
    }],
    realtimeTopic: null,
  }
}

beforeEach(() => {
  navigation.push.mockReset()
  realtime.channel.mockReset()
  realtime.on.mockReset()
  realtime.subscribe.mockReset()
  realtime.removeChannel.mockReset()
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Kviss creator UI', () => {
  it('keeps the question editor closed until Ný spurning is selected', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(EMPTY_STATE)))

    render(<KvissCreatorClient />)

    const openEditor = await screen.findByRole('button', { name: 'Ný spurning' })
    expect(screen.queryByRole('textbox', { name: 'Spurning' })).not.toBeInTheDocument()

    fireEvent.click(openEditor)

    expect(screen.getByRole('textbox', { name: 'Spurning' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Vista spurningu' })).toBeDisabled()
  })

  it('freezes the draft and actions and shows an explicit label while a question is saved', async () => {
    const post = deferred<Response>()
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') return post.promise
      return Promise.resolve(response(EMPTY_STATE))
    }))

    render(<KvissCreatorClient />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ný spurning' }))

    const question = screen.getByRole('textbox', { name: 'Spurning' })
    fireEvent.change(question, { target: { value: 'Hvað er rétt?' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Svarmöguleiki 1' }), {
      target: { value: 'Rangt' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Svarmöguleiki 2' }), {
      target: { value: 'Rétt' },
    })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Rétt svar 2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Vista spurningu' }))

    expect(await screen.findByRole('button', { name: 'Vista spurningu...' })).toBeDisabled()
    expect(question).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Hætta við' })).toBeDisabled()
    expect(screen.getByRole('tab', { name: 'Kvissin mín' })).toBeDisabled()

    act(() => {
      post.resolve(response({ data: { id: 'question-1' }, revision: 1 }))
    })
    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: 'Spurning' })).not.toBeInTheDocument()
    })
  })

  it('shows pending feedback and navigates to the live route returned by session creation', async () => {
    const state: AuthoringState = {
      ...EMPTY_STATE,
      templates: [{ id: 'template-1', title: 'Föstudagskviss' }],
      templateQuestions: [{ template_id: 'template-1' }],
    }
    const post = deferred<Response>()
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') return post.promise
      return Promise.resolve(response(state))
    }))

    render(<KvissCreatorClient />)
    fireEvent.click(await screen.findByRole('tab', { name: 'Kvissin mín' }))
    fireEvent.click(screen.getByRole('button', { name: 'Búa til lifandi lotu' }))

    expect(await screen.findByRole('button', { name: 'Bý til lifandi lotu...' })).toBeDisabled()
    expect(screen.getByRole('tab', { name: 'Spurningasafn' })).toBeDisabled()

    act(() => {
      post.resolve(response({ data: { id: 'session-returned-by-api' }, revision: 1 }))
    })
    await waitFor(() => {
      expect(navigation.push).toHaveBeenCalledWith('/auth-mvp/kviss/lota/session-returned-by-api')
    })
  })
})

describe('Kviss audience answer visibility', () => {
  it('does not identify the correct option before reveal, then marks it during reveal', () => {
    const { container, rerender } = render(
      <KvissAudienceView projection={hostProjection('question')} remaining={12} />,
    )

    expect(container.querySelector('[data-correct="true"]')).not.toBeInTheDocument()

    rerender(<KvissAudienceView projection={hostProjection('reveal')} remaining={null} />)

    const correct = container.querySelector('[data-correct="true"]')
    expect(correct).toBeInTheDocument()
    expect(correct).toHaveTextContent('Rétt')
  })

  it.each(['leaderboard', 'ended'] as const)('shows the leaderboard only in the %s state without retaining answer options', (status) => {
    const { container } = render(
      <KvissAudienceView projection={hostProjection(status)} remaining={null} />,
    )

    expect(screen.getByRole('heading', { name: 'Staðan' })).toBeInTheDocument()
    expect(screen.getByText('Anna')).toBeInTheDocument()
    expect(container.querySelector('[data-correct="true"]')).not.toBeInTheDocument()
    expect(screen.queryByText('Hvað er rétt?')).not.toBeInTheDocument()
  })

  it('does not show the leaderboard in the lobby', () => {
    render(<KvissAudienceView projection={hostProjection('lobby')} remaining={null} />)

    expect(screen.queryByRole('heading', { name: 'Staðan' })).not.toBeInTheDocument()
    expect(screen.getByText('ABC234')).toBeInTheDocument()
  })
})

describe('Kviss live settings', () => {
  it('copies the canonical public join URL with pending and copied feedback', async () => {
    const projection = { ...hostProjection('lobby'), realtimeTopic: 'kviss-live-topic' }
    const clipboard = deferred<void>()
    const writeText = vi.fn(() => clipboard.promise)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    vi.stubGlobal('fetch', vi.fn(async () => response(projection)))
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout')

    const { unmount } = render(
      <KvissLiveClient sessionId="session-1" initialView="settings" />,
    )
    const copy = await screen.findByRole('button', { name: 'Afrita hlekk' })
    await waitFor(() => expect(realtime.channel).toHaveBeenCalledWith('kviss-live-topic'))

    fireEvent.click(copy)

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith('https://teskeid.is/kviss/ABC234')
    expect(copy).toBeDisabled()
    expect(copy.querySelector('.animate-spin')).toBeInTheDocument()

    act(() => clipboard.resolve())
    expect(await screen.findByRole('button', { name: 'Hlekkur afritaður' })).toBeEnabled()

    unmount()
    expect(realtime.removeChannel).toHaveBeenCalledTimes(1)
    expect(clearTimeoutSpy).toHaveBeenCalled()
  })
})
