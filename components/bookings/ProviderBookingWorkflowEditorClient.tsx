'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type {
  BookingActionResult,
  BookingWorkflowAttentionSide,
  BookingWorkflowMutationAck,
  ProviderBookingWorkflowGraphView,
  ProviderBookingWorkflowStateEditorView,
  ProviderBookingWorkflowView,
} from '@/lib/bookings/contracts'
import {
  canonicalBookingWorkflowGraph,
  isSafeBookingWorkflowLabel,
  validateBookingWorkflowGraph,
  type BookingWorkflowGraphIssue,
} from '@/lib/bookings/workflow'
import { resolveBookingWorkflowLabel } from './workflow-label'

type PendingAction = 'ensureDraft' | 'saveDraft' | 'publishDraft' | null

class WorkflowRequestError extends Error {
  constructor(readonly code: string) {
    super(code)
  }
}

function cloneGraph(graph: ProviderBookingWorkflowGraphView): ProviderBookingWorkflowGraphView {
  return {
    ...graph,
    states: graph.states.map(state => ({ ...state })),
    transitions: graph.transitions.map(transition => ({ ...transition })),
  }
}

function randomUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  const values = new Uint8Array(16)
  globalThis.crypto.getRandomValues(values)
  values[6] = (values[6] & 0x0f) | 0x40
  values[8] = (values[8] & 0x3f) | 0x80
  const hex = Array.from(values, value => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function normalizeGraph(graph: ProviderBookingWorkflowGraphView): ProviderBookingWorkflowGraphView {
  return {
    ...graph,
    states: graph.states.map((state, sortOrder) => ({
      ...state,
      sortOrder,
      providerLabel: state.providerLabel?.trim() || null,
      customerLabel: state.customerLabel?.trim() || null,
    })),
    transitions: graph.transitions.map(transition => ({ ...transition })),
  }
}

function graphIssues(graph: ProviderBookingWorkflowGraphView): Array<BookingWorkflowGraphIssue | 'label'> {
  const issues: Array<BookingWorkflowGraphIssue | 'label'> = validateBookingWorkflowGraph(graph)
  if (graph.states.some(state => (
    state.systemLabelKey
      ? state.providerLabel !== null || state.customerLabel !== null
      : !isSafeBookingWorkflowLabel(state.providerLabel)
        || !isSafeBookingWorkflowLabel(state.customerLabel)
  ))) issues.push('label')
  return Array.from(new Set(issues))
}

function unwrapWorkflow(value: unknown): ProviderBookingWorkflowView | null {
  if (!value || typeof value !== 'object') return null
  if ('service' in value && 'workflow' in value && 'activeVersion' in value) {
    return value as ProviderBookingWorkflowView
  }
  return null
}

export function ProviderBookingWorkflowEditorClient({
  initialWorkflow,
}: {
  initialWorkflow: ProviderBookingWorkflowView
}) {
  const t = useTranslations('bookings')
  const [workflow, setWorkflow] = useState(initialWorkflow)
  const [draft, setDraft] = useState<ProviderBookingWorkflowGraphView | null>(
    initialWorkflow.draftVersion ? cloneGraph(initialWorkflow.draftVersion) : null,
  )
  const [expandedStateId, setExpandedStateId] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [successKey, setSuccessKey] = useState<string | null>(null)
  const [validationIssues, setValidationIssues] = useState<Array<BookingWorkflowGraphIssue | 'label'>>([])
  const mutationEnvelope = useRef<{ fingerprint: string; key: string } | null>(null)
  const pending = pendingAction !== null
  const endpoint = `/api/bookings/provider/services/${encodeURIComponent(workflow.service.id)}/workflow`

  useEffect(() => {
    setWorkflow(initialWorkflow)
    setDraft(initialWorkflow.draftVersion ? cloneGraph(initialWorkflow.draftVersion) : null)
    setExpandedStateId(null)
    setErrorKey(null)
    setSuccessKey(null)
    setValidationIssues([])
    mutationEnvelope.current = null
  }, [initialWorkflow])

  const savedDraftFingerprint = useMemo(
    () => workflow.draftVersion ? canonicalBookingWorkflowGraph(workflow.draftVersion) : null,
    [workflow.draftVersion],
  )
  const currentDraftFingerprint = useMemo(
    () => draft ? canonicalBookingWorkflowGraph(draft) : null,
    [draft],
  )
  const dirty = Boolean(draft && currentDraftFingerprint !== savedDraftFingerprint)

  function resetFeedback() {
    setErrorKey(null)
    setSuccessKey(null)
    setValidationIssues([])
    mutationEnvelope.current = null
  }

  function updateDraft(updater: (current: ProviderBookingWorkflowGraphView) => ProviderBookingWorkflowGraphView) {
    if (!draft || pending) return
    resetFeedback()
    setDraft(current => current ? updater(current) : current)
  }

  function idempotencyKey(fingerprint: string): string {
    if (!mutationEnvelope.current || mutationEnvelope.current.fingerprint !== fingerprint) {
      mutationEnvelope.current = { fingerprint, key: randomUuid() }
    }
    return mutationEnvelope.current.key
  }

  async function reloadWorkflow(): Promise<ProviderBookingWorkflowView> {
    const response = await fetch(endpoint, {
      cache: 'no-store',
      credentials: 'same-origin',
    })
    const value = unwrapWorkflow(await response.json().catch(() => null))
    if (!response.ok || !value) throw new WorkflowRequestError('load')
    setWorkflow(value)
    setDraft(value.draftVersion ? cloneGraph(value.draftVersion) : null)
    setExpandedStateId(null)
    return value
  }

  async function mutate(payload: Record<string, unknown>): Promise<BookingWorkflowMutationAck> {
    const response = await fetch(endpoint, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const result = await response.json().catch(() => null) as BookingActionResult<BookingWorkflowMutationAck> | null
    if (!response.ok || !result?.ok) {
      const code = result && !result.ok ? result.error : 'save_failed'
      throw new WorkflowRequestError(code)
    }
    return result.data
  }

  async function recoverFrom(error: unknown) {
    if (error instanceof WorkflowRequestError && error.code === 'conflict') {
      try {
        await reloadWorkflow()
        mutationEnvelope.current = null
        setErrorKey('workflow.editor.errors.conflict')
      } catch {
        setErrorKey('workflow.editor.errors.load')
      }
      return
    }
    setErrorKey(error instanceof WorkflowRequestError && error.code === 'invalid_input'
      ? 'workflow.editor.errors.invalid'
      : error instanceof WorkflowRequestError && error.code === 'load'
        ? 'workflow.editor.errors.load'
        : 'workflow.editor.errors.save')
  }

  async function ensureDraft() {
    if (pending || draft) return
    setPendingAction('ensureDraft')
    setErrorKey(null)
    setSuccessKey(null)
    try {
      const fingerprint = `ensureDraft:${workflow.workflow.id}:${workflow.workflow.revision}`
      await mutate({
        action: 'ensureDraft',
        expectedWorkflowRevision: workflow.workflow.revision,
        idempotencyKey: idempotencyKey(fingerprint),
      })
      const refreshed = await reloadWorkflow()
      mutationEnvelope.current = null
      setExpandedStateId(refreshed.draftVersion?.states[0]?.id ?? null)
      setSuccessKey('workflow.editor.success.draftCreated')
    } catch (error) {
      await recoverFrom(error)
    } finally {
      setPendingAction(null)
    }
  }

  async function saveDraft() {
    if (pending || !draft) return
    const normalized = normalizeGraph(draft)
    const issues = graphIssues(normalized)
    if (issues.length > 0) {
      setDraft(normalized)
      setValidationIssues(issues)
      setErrorKey('workflow.editor.errors.invalid')
      setSuccessKey(null)
      return
    }

    setPendingAction('saveDraft')
    setErrorKey(null)
    setSuccessKey(null)
    setValidationIssues([])
    try {
      const graph = { states: normalized.states, transitions: normalized.transitions }
      const fingerprint = `saveDraft:${draft.id}:${draft.revision}:${canonicalBookingWorkflowGraph(normalized)}`
      await mutate({
        action: 'saveDraft',
        draftVersionId: draft.id,
        expectedRevision: draft.revision,
        graph,
        idempotencyKey: idempotencyKey(fingerprint),
      })
      await reloadWorkflow()
      mutationEnvelope.current = null
      setSuccessKey('workflow.editor.success.draftSaved')
    } catch (error) {
      await recoverFrom(error)
    } finally {
      setPendingAction(null)
    }
  }

  async function publishDraft() {
    if (pending || !draft || dirty) return
    const issues = graphIssues(draft)
    if (issues.length > 0) {
      setValidationIssues(issues)
      setErrorKey('workflow.editor.errors.invalid')
      setSuccessKey(null)
      return
    }

    setPendingAction('publishDraft')
    setErrorKey(null)
    setSuccessKey(null)
    setValidationIssues([])
    try {
      const fingerprint = `publishDraft:${draft.id}:${draft.revision}`
      await mutate({
        action: 'publishDraft',
        draftVersionId: draft.id,
        expectedRevision: draft.revision,
        idempotencyKey: idempotencyKey(fingerprint),
      })
      await reloadWorkflow()
      mutationEnvelope.current = null
      setSuccessKey('workflow.editor.success.published')
    } catch (error) {
      await recoverFrom(error)
    } finally {
      setPendingAction(null)
    }
  }

  function stateLabel(state: ProviderBookingWorkflowStateEditorView, audience: 'provider' | 'customer') {
    return resolveBookingWorkflowLabel(key => t(key), {
      systemLabelKey: state.systemLabelKey,
      label: audience === 'provider' ? state.providerLabel : state.customerLabel,
    }, audience)
  }

  function updateStateLabel(
    stateId: string,
    audience: 'provider' | 'customer',
    label: string,
  ) {
    updateDraft(current => ({
      ...current,
      states: current.states.map(state => {
        if (state.id !== stateId) return state
        const defaultProvider = stateLabel(state, 'provider')
        const defaultCustomer = stateLabel(state, 'customer')
        return {
          ...state,
          systemLabelKey: null,
          providerLabel: audience === 'provider' ? label : state.providerLabel ?? defaultProvider,
          customerLabel: audience === 'customer' ? label : state.customerLabel ?? defaultCustomer,
        }
      }),
    }))
  }

  function setInitialState(stateId: string) {
    updateDraft(current => ({
      ...current,
      states: current.states.map(state => ({ ...state, isInitial: state.id === stateId })),
    }))
  }

  function setAttention(stateId: string, attentionSide: BookingWorkflowAttentionSide) {
    updateDraft(current => ({
      ...current,
      states: current.states.map(state => state.id === stateId ? { ...state, attentionSide } : state),
    }))
  }

  function moveState(stateId: string, direction: -1 | 1) {
    updateDraft(current => {
      const states = [...current.states].sort((left, right) => left.sortOrder - right.sortOrder)
      const index = states.findIndex(state => state.id === stateId)
      const target = index + direction
      if (index < 0 || target < 0 || target >= states.length) return current
      const [moved] = states.splice(index, 1)
      states.splice(target, 0, moved)
      return {
        ...current,
        states: states.map((state, sortOrder) => ({ ...state, sortOrder })),
      }
    })
  }

  function deleteState(stateId: string) {
    updateDraft(current => {
      const state = current.states.find(candidate => candidate.id === stateId)
      if (!state || state.semanticKind === 'confirmed' || state.isInitial) return current
      const states = current.states
        .filter(candidate => candidate.id !== stateId)
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((candidate, sortOrder) => ({ ...candidate, sortOrder }))
      return {
        ...current,
        states,
        transitions: current.transitions.filter(edge => (
          edge.fromStateId !== stateId && edge.toStateId !== stateId
        )),
      }
    })
    setExpandedStateId(current => current === stateId ? null : current)
  }

  function addState() {
    if (!draft || pending || draft.states.length >= workflow.limits.maxStates) return
    try {
      const id = randomUuid()
      const logicalKey = `custom_${id.replace(/-/g, '')}`
      updateDraft(current => ({
        ...current,
        states: [...current.states, {
          id,
          logicalKey,
          systemLabelKey: null,
          providerLabel: '',
          customerLabel: '',
          sortOrder: current.states.length,
          isInitial: false,
          semanticKind: 'active',
          attentionSide: 'provider',
        }],
      }))
      setExpandedStateId(id)
    } catch {
      setErrorKey('workflow.editor.errors.random')
    }
  }

  function toggleTransition(fromStateId: string, toStateId: string, checked: boolean) {
    updateDraft(current => {
      const exists = current.transitions.some(edge => (
        edge.fromStateId === fromStateId && edge.toStateId === toStateId
      ))
      if (checked && !exists) {
        if (current.transitions.length >= workflow.limits.maxTransitions) {
          setValidationIssues(issues => Array.from(new Set([...issues, 'transition_count'])))
          setErrorKey('workflow.editor.errors.invalid')
          return current
        }
        return {
          ...current,
          transitions: [...current.transitions, { fromStateId, toStateId }],
        }
      }
      if (!checked && exists) {
        return {
          ...current,
          transitions: current.transitions.filter(edge => !(
            edge.fromStateId === fromStateId && edge.toStateId === toStateId
          )),
        }
      }
      return current
    })
  }

  const orderedActiveStates = [...workflow.activeVersion.states]
    .sort((left, right) => left.sortOrder - right.sortOrder)
  const orderedDraftStates = draft
    ? [...draft.states].sort((left, right) => left.sortOrder - right.sortOrder)
    : []

  return (
    <div className="space-y-7">
      <section className="space-y-2 border-y border-border py-5">
        <p className="break-words font-medium">{t('workflow.editor.service', { title: workflow.service.title })}</p>
        <p className="text-sm text-muted-foreground">
          {t('workflow.editor.activeVersion', { version: workflow.activeVersion.versionNumber })}
        </p>
        {draft ? (
          <p className="text-sm text-muted-foreground">
            {t('workflow.editor.draftVersion', { version: draft.versionNumber })}
          </p>
        ) : null}
        <p className="text-sm leading-6 text-muted-foreground">{t('workflow.editor.publishNotice')}</p>
      </section>

      {errorKey ? (
        <div role="alert" className="space-y-2 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
          <p>{t(errorKey)}</p>
          {validationIssues.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5">
              {validationIssues.map(issue => <li key={issue}>{t(`workflow.editor.errors.${issue}`)}</li>)}
            </ul>
          ) : null}
        </div>
      ) : null}
      {successKey ? (
        <p role="status" aria-live="polite" className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm leading-6">
          {t(successKey)}
        </p>
      ) : null}

      {!draft ? (
        <section aria-labelledby="workflow-active-states" className="space-y-4">
          <div>
            <h2 id="workflow-active-states" className="text-lg font-semibold text-primary">{t('workflow.editor.statesTitle')}</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{t('workflow.editor.noDraft')}</p>
          </div>
          <ol className="divide-y divide-border border-y border-border">
            {orderedActiveStates.map((state, index) => (
              <li key={state.id} className="py-3 text-sm">
                <span className="mr-2 text-muted-foreground">{index + 1}.</span>
                <span className="break-words font-medium">{stateLabel(state, 'provider')}</span>
              </li>
            ))}
          </ol>
          <button
            type="button"
            disabled={pending}
            onClick={() => void ensureDraft()}
            className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-55"
          >
            {pendingAction === 'ensureDraft' ? t('workflow.editor.ensuringDraft') : t('workflow.editor.ensureDraft')}
          </button>
        </section>
      ) : (
        <section aria-labelledby="workflow-draft-states" className="space-y-4">
          <h2 id="workflow-draft-states" className="text-lg font-semibold text-primary">{t('workflow.editor.statesTitle')}</h2>
          <ol className="space-y-3">
            {orderedDraftStates.map((state, index) => {
              const providerLabel = stateLabel(state, 'provider')
              const customerLabel = stateLabel(state, 'customer')
              const expanded = expandedStateId === state.id
              const outgoing = draft.transitions.filter(edge => edge.fromStateId === state.id)
              return (
                <li key={state.id} className="min-w-0 rounded-xl border border-border p-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-medium">{providerLabel}</p>
                      <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
                        {t('workflow.editor.customerLabel')}: {customerLabel}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {t('workflow.editor.nextStates')}: {outgoing.length}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={pending}
                      aria-label={expanded
                        ? t('workflow.editor.closeState', { label: providerLabel })
                        : t('workflow.editor.editState', { label: providerLabel })}
                      onClick={() => setExpandedStateId(expanded ? null : state.id)}
                      className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-55"
                    >
                      {expanded ? <ChevronUp aria-hidden size={20} /> : <ChevronDown aria-hidden size={20} />}
                    </button>
                  </div>

                  {expanded ? (
                    <div className="mt-4 space-y-4 border-t border-border pt-4">
                      <p className="text-xs text-muted-foreground">
                        {t('workflow.editor.statePosition', { position: index + 1, count: orderedDraftStates.length })}
                      </p>
                      <label className="grid gap-1 text-sm font-medium">
                        {t('workflow.editor.providerLabel')}
                        <input
                          value={state.systemLabelKey ? providerLabel : state.providerLabel ?? ''}
                          onChange={event => updateStateLabel(state.id, 'provider', event.target.value)}
                          maxLength={80}
                          disabled={pending}
                          className="min-h-11 min-w-0 rounded-xl border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-60"
                        />
                      </label>
                      <label className="grid gap-1 text-sm font-medium">
                        {t('workflow.editor.customerLabel')}
                        <input
                          value={state.systemLabelKey ? customerLabel : state.customerLabel ?? ''}
                          onChange={event => updateStateLabel(state.id, 'customer', event.target.value)}
                          maxLength={80}
                          disabled={pending}
                          className="min-h-11 min-w-0 rounded-xl border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-60"
                        />
                      </label>
                      <label className="grid gap-1 text-sm font-medium">
                        {t('workflow.editor.attentionLabel')}
                        <select
                          value={state.attentionSide}
                          onChange={event => setAttention(state.id, event.target.value as BookingWorkflowAttentionSide)}
                          disabled={pending}
                          className="min-h-11 rounded-xl border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-60"
                        >
                          <option value="provider">{t('workflow.editor.attentionOptions.provider')}</option>
                          <option value="customer">{t('workflow.editor.attentionOptions.customer')}</option>
                          <option value="none">{t('workflow.editor.attentionOptions.none')}</option>
                        </select>
                      </label>

                      <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
                        <input
                          type="radio"
                          name="booking-workflow-initial-state"
                          checked={state.isInitial}
                          onChange={() => setInitialState(state.id)}
                          disabled={pending}
                          className="size-5 accent-primary"
                        />
                        {t('workflow.editor.initialState')}
                      </label>
                      {state.semanticKind === 'confirmed' ? (
                        <p className="rounded-xl bg-primary/5 p-3 text-sm font-medium text-primary">
                          {t('workflow.editor.confirmedState')}
                        </p>
                      ) : (
                        <fieldset className="space-y-2">
                          <legend className="text-sm font-medium">{t('workflow.editor.nextStates')}</legend>
                          {orderedDraftStates.filter(target => target.id !== state.id).map(target => {
                            const checked = draft.transitions.some(edge => (
                              edge.fromStateId === state.id && edge.toStateId === target.id
                            ))
                            return (
                              <label key={target.id} className="flex min-h-10 items-start gap-3 py-1 text-sm">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={event => toggleTransition(state.id, target.id, event.target.checked)}
                                  disabled={pending}
                                  className="mt-0.5 size-5 shrink-0 accent-primary"
                                />
                                <span className="min-w-0 break-words leading-5">{stateLabel(target, 'provider')}</span>
                              </label>
                            )
                          })}
                        </fieldset>
                      )}
                      {state.semanticKind === 'confirmed' ? (
                        <p className="text-xs leading-5 text-muted-foreground">{t('workflow.editor.confirmedHasNoNext')}</p>
                      ) : null}

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={pending || index === 0}
                          aria-label={t('workflow.editor.moveUp', { label: providerLabel })}
                          onClick={() => moveState(state.id, -1)}
                          className="inline-flex size-11 items-center justify-center rounded-xl border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-40"
                        >
                          <ArrowUp aria-hidden size={18} />
                        </button>
                        <button
                          type="button"
                          disabled={pending || index === orderedDraftStates.length - 1}
                          aria-label={t('workflow.editor.moveDown', { label: providerLabel })}
                          onClick={() => moveState(state.id, 1)}
                          className="inline-flex size-11 items-center justify-center rounded-xl border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-40"
                        >
                          <ArrowDown aria-hidden size={18} />
                        </button>
                        {state.semanticKind !== 'confirmed' ? (
                          <button
                            type="button"
                            disabled={pending || state.isInitial}
                            title={state.isInitial ? t('workflow.editor.deleteUnavailable') : undefined}
                            aria-label={t('workflow.editor.deleteState', { label: providerLabel })}
                            onClick={() => deleteState(state.id)}
                            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-destructive/30 px-3 text-sm font-medium text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-40"
                          >
                            <Trash2 aria-hidden size={17} />
                            {t('workflow.editor.deleteState', { label: providerLabel })}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ol>

          <button
            type="button"
            disabled={pending || draft.states.length >= workflow.limits.maxStates}
            onClick={addState}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary/20 px-4 text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-55"
          >
            <Plus aria-hidden size={18} />
            {t('workflow.editor.addState')}
          </button>

          <div className="space-y-1 border-y border-border py-4">
            <p className="font-medium">{t('workflow.editor.cancelledTitle')}</p>
            <p className="text-sm leading-6 text-muted-foreground">{t('workflow.editor.cancelledBody')}</p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={pending || !dirty}
              onClick={() => void saveDraft()}
              className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-55"
            >
              {pendingAction === 'saveDraft' ? t('workflow.editor.saving') : t('workflow.editor.save')}
            </button>
            <button
              type="button"
              disabled={pending || dirty}
              onClick={() => void publishDraft()}
              className="min-h-11 rounded-xl border border-primary/20 px-4 text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-55"
            >
              {pendingAction === 'publishDraft' ? t('workflow.editor.publishing') : t('workflow.editor.publish')}
            </button>
          </div>
          {dirty ? <p className="text-xs text-muted-foreground">{t('workflow.editor.saveBeforePublish')}</p> : null}
        </section>
      )}
    </div>
  )
}
