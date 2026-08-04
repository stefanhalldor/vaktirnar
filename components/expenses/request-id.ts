'use client'

import { useRef } from 'react'
import { createRequestId } from './ui'

function semanticPayloadKey(value: unknown, ancestors: Set<object> = new Set()): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'

  if (typeof value === 'string') return `string:${JSON.stringify(value)}`
  if (typeof value === 'boolean') return `boolean:${value}`
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'number:NaN'
    if (Object.is(value, -0)) return 'number:-0'
    return `number:${String(value)}`
  }
  if (typeof value === 'bigint') return `bigint:${value.toString()}`

  if (typeof value !== 'object') {
    throw new TypeError(`Unsupported semantic payload value: ${typeof value}`)
  }
  if (ancestors.has(value)) throw new TypeError('Semantic payload cannot be cyclic')

  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      return `array:[${value.map((item) => semanticPayloadKey(item, ancestors)).join(',')}]`
    }

    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${semanticPayloadKey(item, ancestors)}`)
    return `object:{${entries.join(',')}}`
  } finally {
    ancestors.delete(value)
  }
}

export interface ExpenseMutationRequestIds {
  forPayload(payload: unknown): string
  succeeded(payload: unknown): void
  reset(): void
}

/**
 * Keeps one idempotency key for the latest exact semantic mutation payload.
 * A failed or uncertain retry can therefore reuse the key, while a changed
 * payload and every post-success submission receive a new one.
 */
export function createExpenseMutationRequestIds(
  idFactory: () => string = createRequestId,
): ExpenseMutationRequestIds {
  let current: { payloadKey: string; requestId: string } | null = null

  return {
    forPayload(payload) {
      const payloadKey = semanticPayloadKey(payload)
      if (current?.payloadKey !== payloadKey) {
        current = { payloadKey, requestId: idFactory() }
      }
      return current.requestId
    },
    succeeded(payload) {
      const payloadKey = semanticPayloadKey(payload)
      if (current?.payloadKey === payloadKey) current = null
    },
    reset() {
      current = null
    },
  }
}

export function useExpenseMutationRequestIds(): ExpenseMutationRequestIds {
  const requestIds = useRef<ExpenseMutationRequestIds | null>(null)
  if (requestIds.current === null) {
    requestIds.current = createExpenseMutationRequestIds()
  }
  return requestIds.current
}
