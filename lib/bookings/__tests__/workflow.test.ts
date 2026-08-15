import { describe, expect, it } from 'vitest'
import type { ProviderBookingWorkflowStateEditorView } from '../contracts'
import {
  canonicalBookingWorkflowGraph,
  isSafeBookingWorkflowLabel,
  validateBookingWorkflowGraph,
} from '../workflow'

const ids = {
  initial: '00000000-0000-4000-8000-000000000001',
  waiting: '00000000-0000-4000-8000-000000000002',
  confirmed: '00000000-0000-4000-8000-000000000003',
}

function state(
  id: string,
  logicalKey: string,
  sortOrder: number,
  overrides: Partial<ProviderBookingWorkflowStateEditorView> = {},
): ProviderBookingWorkflowStateEditorView {
  return {
    id,
    logicalKey,
    systemLabelKey: null,
    providerLabel: logicalKey,
    customerLabel: logicalKey,
    sortOrder,
    isInitial: false,
    semanticKind: 'active',
    attentionSide: 'provider',
    ...overrides,
  }
}

function validGraph() {
  return {
    states: [
      state(ids.initial, 'new', 0, { isInitial: true }),
      state(ids.waiting, 'waiting', 1, { attentionSide: 'customer' }),
      state(ids.confirmed, 'confirmed', 2, { semanticKind: 'confirmed', attentionSide: 'none' }),
    ],
    transitions: [
      { fromStateId: ids.initial, toStateId: ids.waiting },
      { fromStateId: ids.waiting, toStateId: ids.confirmed },
    ],
  }
}

describe('booking workflow graph', () => {
  it('accepts plain labels and rejects HTML or Markdown-like labels', () => {
    expect(isSafeBookingWorkflowLabel('Bíður eftir viðskiptavini')).toBe(true)
    expect(isSafeBookingWorkflowLabel('<strong>Bíður</strong>')).toBe(false)
    expect(isSafeBookingWorkflowLabel('**Bíður**')).toBe(false)
  })

  it('accepts a reachable graph with one initial and protected confirmed state', () => {
    expect(validateBookingWorkflowGraph(validGraph())).toEqual([])
  })

  it('reports unreachable, duplicate and confirmed-outgoing edges', () => {
    const graph = validGraph()
    graph.transitions = [
      { fromStateId: ids.initial, toStateId: ids.waiting },
      { fromStateId: ids.confirmed, toStateId: ids.waiting },
      { fromStateId: ids.confirmed, toStateId: ids.waiting },
    ]
    expect(validateBookingWorkflowGraph(graph)).toEqual(expect.arrayContaining([
      'duplicate_transition',
      'confirmed_outgoing_transition',
      'unreachable_state',
    ]))
  })

  it('canonicalizes semantically equal state and transition order', () => {
    const left = validGraph()
    const right = {
      states: [...left.states].reverse(),
      transitions: [...left.transitions].reverse(),
    }
    expect(canonicalBookingWorkflowGraph(left)).toBe(canonicalBookingWorkflowGraph(right))
  })

  it('enforces the published 20-state and 100-edge caps', () => {
    const base = validGraph()
    expect(validateBookingWorkflowGraph({
      ...base,
      states: Array.from({ length: 21 }, (_, index) => state(
        `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        `state_${index}`,
        index,
        { isInitial: index === 0, semanticKind: index === 20 ? 'confirmed' : 'active' },
      )),
    })).toContain('state_count')
    expect(validateBookingWorkflowGraph({
      ...base,
      transitions: Array.from({ length: 101 }, () => ({
        fromStateId: ids.initial,
        toStateId: ids.waiting,
      })),
    })).toContain('transition_count')
  })
})
