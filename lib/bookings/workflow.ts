import type {
  ProviderBookingWorkflowStateEditorView,
  ProviderBookingWorkflowTransitionView,
} from './contracts'

export const BOOKING_WORKFLOW_LIMITS = {
  maxStates: 20,
  maxTransitions: 100,
} as const

const BOOKING_WORKFLOW_MARKUP_CHARACTERS = /[<>`*_#~()[\]]/u

/** Labels are stored and rendered as plain text, never HTML or Markdown input. */
export function isSafeBookingWorkflowLabel(value: string | null): boolean {
  if (!value) return false
  const trimmed = value.trim()
  return trimmed.length >= 1
    && trimmed.length <= 80
    && !/[\u0000-\u001f\u007f-\u009f]/u.test(trimmed)
    && !BOOKING_WORKFLOW_MARKUP_CHARACTERS.test(trimmed)
}

export type BookingWorkflowGraphInput = {
  states: ProviderBookingWorkflowStateEditorView[]
  transitions: ProviderBookingWorkflowTransitionView[]
}

export type BookingWorkflowGraphIssue =
  | 'state_count'
  | 'transition_count'
  | 'duplicate_state_id'
  | 'duplicate_logical_key'
  | 'duplicate_system_label_key'
  | 'invalid_sort_order'
  | 'initial_state_count'
  | 'confirmed_state_count'
  | 'transition_endpoint'
  | 'duplicate_transition'
  | 'self_transition'
  | 'confirmed_outgoing_transition'
  | 'unreachable_state'

/**
 * Mirrors the database publish gates for immediate editor feedback. SQL is
 * authoritative and repeats every invariant inside the publishing transaction.
 */
export function validateBookingWorkflowGraph(
  graph: BookingWorkflowGraphInput,
): BookingWorkflowGraphIssue[] {
  const issues = new Set<BookingWorkflowGraphIssue>()
  if (graph.states.length < 1 || graph.states.length > BOOKING_WORKFLOW_LIMITS.maxStates) {
    issues.add('state_count')
  }
  if (graph.transitions.length > BOOKING_WORKFLOW_LIMITS.maxTransitions) {
    issues.add('transition_count')
  }

  const ids = new Set<string>()
  const logicalKeys = new Set<string>()
  const systemKeys = new Set<string>()
  for (const state of graph.states) {
    if (ids.has(state.id)) issues.add('duplicate_state_id')
    ids.add(state.id)
    if (logicalKeys.has(state.logicalKey)) issues.add('duplicate_logical_key')
    logicalKeys.add(state.logicalKey)
    if (state.systemLabelKey) {
      if (systemKeys.has(state.systemLabelKey)) issues.add('duplicate_system_label_key')
      systemKeys.add(state.systemLabelKey)
    }
  }

  const sortOrders = graph.states.map((state) => state.sortOrder).sort((a, b) => a - b)
  if (sortOrders.some((order, index) => order !== index)) issues.add('invalid_sort_order')
  if (graph.states.filter((state) => state.isInitial).length !== 1) issues.add('initial_state_count')
  if (graph.states.filter((state) => state.semanticKind === 'confirmed').length !== 1) {
    issues.add('confirmed_state_count')
  }

  const transitionKeys = new Set<string>()
  const reachable = new Map<string, string[]>()
  for (const state of graph.states) reachable.set(state.id, [])
  for (const transition of graph.transitions) {
    if (!ids.has(transition.fromStateId) || !ids.has(transition.toStateId)) {
      issues.add('transition_endpoint')
      continue
    }
    if (transition.fromStateId === transition.toStateId) issues.add('self_transition')
    const key = `${transition.fromStateId}:${transition.toStateId}`
    if (transitionKeys.has(key)) issues.add('duplicate_transition')
    transitionKeys.add(key)
    reachable.get(transition.fromStateId)?.push(transition.toStateId)
    const from = graph.states.find((state) => state.id === transition.fromStateId)
    if (from?.semanticKind === 'confirmed') issues.add('confirmed_outgoing_transition')
  }

  const initial = graph.states.find((state) => state.isInitial)
  if (initial) {
    const visited = new Set<string>([initial.id])
    const pending = [initial.id]
    while (pending.length > 0) {
      const current = pending.shift()!
      for (const next of reachable.get(current) ?? []) {
        if (visited.has(next)) continue
        visited.add(next)
        pending.push(next)
      }
    }
    if (graph.states.some((state) => !visited.has(state.id))) issues.add('unreachable_state')
  }

  return [...issues]
}

/** Stable semantic envelope for client idempotency-key reuse. */
export function canonicalBookingWorkflowGraph(graph: BookingWorkflowGraphInput): string {
  return JSON.stringify({
    states: [...graph.states]
      .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id))
      .map((state) => ({
        id: state.id,
        logicalKey: state.logicalKey,
        systemLabelKey: state.systemLabelKey,
        providerLabel: state.providerLabel,
        customerLabel: state.customerLabel,
        sortOrder: state.sortOrder,
        isInitial: state.isInitial,
        semanticKind: state.semanticKind,
        attentionSide: state.attentionSide,
      })),
    transitions: [...graph.transitions]
      .sort((left, right) => (
        left.fromStateId.localeCompare(right.fromStateId)
        || left.toStateId.localeCompare(right.toStateId)
      )),
  })
}
