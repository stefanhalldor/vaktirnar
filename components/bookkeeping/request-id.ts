'use client'

import { useRef } from 'react'
import { createBookkeepingRequestId } from './ui'

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
  if (typeof value !== 'object') throw new TypeError('Unsupported mutation payload')
  if (ancestors.has(value)) throw new TypeError('Mutation payload cannot be cyclic')

  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      return `array:[${value.map((item) => semanticPayloadKey(item, ancestors)).join(',')}]`
    }
    return `object:{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${semanticPayloadKey(item, ancestors)}`)
      .join(',')}}`
  } finally {
    ancestors.delete(value)
  }
}

export interface BookkeepingMutationRequestIds {
  forPayload(payload: unknown): string
  succeeded(payload: unknown): void
}

export function createBookkeepingMutationRequestIds(
  idFactory: () => string = createBookkeepingRequestId,
): BookkeepingMutationRequestIds {
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
      if (current?.payloadKey === semanticPayloadKey(payload)) current = null
    },
  }
}

export function useBookkeepingMutationRequestIds(): BookkeepingMutationRequestIds {
  const value = useRef<BookkeepingMutationRequestIds | null>(null)
  if (value.current === null) value.current = createBookkeepingMutationRequestIds()
  return value.current
}
