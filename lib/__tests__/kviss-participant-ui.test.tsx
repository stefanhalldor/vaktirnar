import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { KvissParticipantProjection } from '@/lib/kviss/contracts'

const realtime = vi.hoisted(() => ({
  channel: vi.fn(),
  on: vi.fn(),
  subscribe: vi.fn(),
  removeChannel: vi.fn(),
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

vi.mock('@/components/kviss/PublicQuizAdCard', () => ({
  PublicQuizAdCard: () => null,
}))

const translations: Record<string, string> = {
  title: 'Kviss',
  loading: 'Sæki kviss...',
  connectionError: 'Náði ekki sambandi. Reyndu aftur eftir smástund.',
  tryAgain: 'Reyna aftur',
  notFound: 'Kvissið fannst ekki.',
  joinedAs: 'Þú tekur þátt sem',
  seconds: '{count} sek.',
  answering: 'Skrái svarið...',
  answerLocked: 'Svarið þitt er skráð.',
  answerFailed: 'Ekki tókst að skrá svarið.',
  chatTitle: 'Spjall lotunnar',
  chatEmpty: 'Engin skilaboð enn.',
  chatPlaceholder: 'Skrifa skilaboð',
  send: 'Senda',
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

import { KvissParticipantClient } from '@/components/kviss/KvissParticipantClient'

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

function participantProjection(answered = false): KvissParticipantProjection {
  return {
    joinCode: 'ABC234',
    title: 'Föstudagskviss',
    status: 'question',
    revision: answered ? 3 : 2,
    participant: {
      nickname: 'Anna',
      teamIndex: null,
      teamName: null,
    },
    participantAnswer: answered ? {
      id: 'answer-1',
      selectedOption: 1,
      answeredAt: new Date().toISOString(),
    } : null,
    activeQuestion: {
      id: 'question-1',
      text: 'Hvað er rétt?',
      options: ['Rangt', 'Rétt'],
      durationSeconds: 120,
      confidenceMode: false,
      correctOptionIndices: null,
    },
    questionStartedAt: new Date().toISOString(),
    leaderboard: [],
    chat: [],
    realtimeTopic: null,
  }
}

beforeEach(() => {
  realtime.channel.mockReset()
  realtime.on.mockReset()
  realtime.subscribe.mockReset()
  realtime.removeChannel.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Kviss participant loading and answer refresh', () => {
  it('leaves the initial loader on a lookup connection failure and shows loading again during retry', async () => {
    const retrySession = deferred<Response>()
    let sessionRequests = 0
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/session?')) {
        sessionRequests += 1
        return sessionRequests === 1
          ? Promise.resolve(response({}, 401))
          : retrySession.promise
      }
      if (url.includes('/lookup?')) return Promise.reject(new TypeError('network unavailable'))
      throw new Error(`Unexpected request: ${url}`)
    }))

    render(<KvissParticipantClient code="ABC234" />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Náði ekki sambandi. Reyndu aftur eftir smástund.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reyna aftur' }))

    expect(screen.getByRole('status', { name: 'Sæki kviss...' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reyna aftur' })).not.toBeInTheDocument()

    act(() => retrySession.resolve(response({}, 404)))
    expect(await screen.findByRole('alert')).toHaveTextContent('Kvissið fannst ekki.')
  })

  it('waits for an older GET and then performs a fresh GET before clearing answer pending state', async () => {
    const staleGet = deferred<Response>()
    const freshGet = deferred<Response>()
    let sessionRequests = 0
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/session?')) {
        sessionRequests += 1
        if (sessionRequests === 1) return Promise.resolve(response(participantProjection(false)))
        if (sessionRequests === 2) return staleGet.promise
        if (sessionRequests === 3) return freshGet.promise
      }
      if (url.includes('/answer') && init?.method === 'POST') {
        return Promise.resolve(response({ ok: true }))
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const { unmount } = render(<KvissParticipantClient code="ABC234" />)
    const answer = await screen.findByRole('button', { name: 'Rétt' })
    window.dispatchEvent(new Event('online'))
    await waitFor(() => expect(sessionRequests).toBe(2))

    fireEvent.click(answer)

    expect(await screen.findByRole('status')).toHaveTextContent('Skrái svarið...')
    expect(answer).toBeDisabled()
    expect(sessionRequests).toBe(2)

    act(() => staleGet.resolve(response(participantProjection(false))))
    await waitFor(() => expect(sessionRequests).toBe(3))
    expect(screen.getByRole('status')).toHaveTextContent('Skrái svarið...')
    expect(screen.queryByText('Svarið þitt er skráð.')).not.toBeInTheDocument()

    act(() => freshGet.resolve(response(participantProjection(true))))
    expect(await screen.findByText('Svarið þitt er skráð.')).toBeInTheDocument()
    expect(screen.queryByText('Skrái svarið...')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rétt' })).toBeDisabled()

    unmount()
  })

  it('keeps a non-success answer error visible instead of erasing it with a refresh', async () => {
    let sessionRequests = 0
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/session?')) {
        sessionRequests += 1
        return Promise.resolve(response(participantProjection(false)))
      }
      if (url.includes('/answer') && init?.method === 'POST') {
        return Promise.resolve(response({}, 500))
      }
      throw new Error(`Unexpected request: ${url}`)
    }))

    render(<KvissParticipantClient code="ABC234" />)
    const answer = await screen.findByRole('button', { name: 'Rétt' })
    expect(sessionRequests).toBe(1)

    fireEvent.click(answer)

    expect(await screen.findByRole('alert')).toHaveTextContent('Ekki tókst að skrá svarið.')
    expect(screen.queryByText('Skrái svarið...')).not.toBeInTheDocument()
    expect(sessionRequests).toBe(1)
  })
})
