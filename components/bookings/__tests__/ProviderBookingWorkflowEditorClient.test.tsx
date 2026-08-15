import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  BookingWorkflowMutationAck,
  ProviderBookingWorkflowGraphView,
  ProviderBookingWorkflowView,
} from '@/lib/bookings/contracts'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    const defaults: Record<string, string> = {
      'workflow.systemLabels.new_request.provider': 'Ný fyrirspurn',
      'workflow.systemLabels.new_request.customer': 'Fyrirspurn móttekin',
      'workflow.systemLabels.confirmed.provider': 'Staðfest',
      'workflow.systemLabels.confirmed.customer': 'Bókunin staðfest',
    }
    return defaults[key] ?? (values ? `${key}:${Object.values(values).join(':')}` : key)
  },
}))

import { ProviderBookingWorkflowEditorClient } from '../ProviderBookingWorkflowEditorClient'

const SERVICE_ID = '11111111-1111-4111-8111-111111111111'
const WORKFLOW_ID = '22222222-2222-4222-8222-222222222222'
const ACTIVE_ID = '33333333-3333-4333-8333-333333333333'
const DRAFT_ID = '44444444-4444-4444-8444-444444444444'
const NEW_ID = '55555555-5555-4555-8555-555555555555'
const CONFIRMED_ID = '66666666-6666-4666-8666-666666666666'
const REVIEW_ID = '77777777-7777-4777-8777-777777777777'

function graph(status: 'draft' | 'published', overrides: Partial<ProviderBookingWorkflowGraphView> = {}): ProviderBookingWorkflowGraphView {
  return {
    id: status === 'draft' ? DRAFT_ID : ACTIVE_ID,
    versionNumber: status === 'draft' ? 2 : 1,
    status,
    revision: 1,
    graphFingerprint: `${status}-fingerprint`,
    publishedAt: status === 'published' ? '2026-08-15T10:00:00.000Z' : null,
    states: [{
      id: NEW_ID,
      logicalKey: 'new_request',
      systemLabelKey: 'new_request',
      providerLabel: null,
      customerLabel: null,
      sortOrder: 0,
      isInitial: true,
      semanticKind: 'active',
      attentionSide: 'provider',
    }, {
      id: CONFIRMED_ID,
      logicalKey: 'confirmed',
      systemLabelKey: 'confirmed',
      providerLabel: null,
      customerLabel: null,
      sortOrder: 1,
      isInitial: false,
      semanticKind: 'confirmed',
      attentionSide: 'none',
    }],
    transitions: [{ fromStateId: NEW_ID, toStateId: CONFIRMED_ID }],
    ...overrides,
  }
}

function workflow(draftVersion: ProviderBookingWorkflowGraphView | null = graph('draft')): ProviderBookingWorkflowView {
  return {
    service: { id: SERVICE_ID, title: 'Kvissveisla' },
    workflow: { id: WORKFLOW_ID, serviceId: SERVICE_ID, revision: 2 },
    activeVersion: graph('published'),
    draftVersion,
    limits: { maxStates: 20, maxTransitions: 100 },
  }
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function ack(): BookingWorkflowMutationAck {
  return {
    workflowId: WORKFLOW_ID,
    versionId: DRAFT_ID,
    workflowRevision: 3,
    versionRevision: 2,
    replayed: false,
  }
}

describe('ProviderBookingWorkflowEditorClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('renders translated defaults and the locked global cancellation row', () => {
    render(<ProviderBookingWorkflowEditorClient initialWorkflow={workflow()} />)

    expect(screen.getByText('Ný fyrirspurn')).toBeInTheDocument()
    expect(screen.getByText('Fyrirspurn móttekin', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('workflow.editor.cancelledTitle')).toBeInTheDocument()
    expect(screen.getByText('workflow.editor.cancelledBody')).toBeInTheDocument()
  })

  it('turns an edited default into bounded custom labels and saves the full graph', async () => {
    const updatedDraft = graph('draft', {
      revision: 2,
      states: [{
        ...graph('draft').states[0]!,
        systemLabelKey: null,
        providerLabel: 'Ný sérstaða',
        customerLabel: 'Fyrirspurn móttekin',
      }, graph('draft').states[1]!],
    })
    const updated = workflow(updatedDraft)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ ok: true, data: ack() }))
      .mockResolvedValueOnce(response(updated))
    vi.stubGlobal('fetch', fetchMock)
    render(<ProviderBookingWorkflowEditorClient initialWorkflow={workflow()} />)

    await userEvent.click(screen.getByRole('button', { name: /workflow.editor.editState:Ný fyrirspurn/ }))
    const providerLabel = screen.getByLabelText('workflow.editor.providerLabel')
    await userEvent.clear(providerLabel)
    await userEvent.type(providerLabel, 'Ný sérstaða')
    await userEvent.click(screen.getByRole('button', { name: 'workflow.editor.save' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(payload).toMatchObject({ action: 'saveDraft', draftVersionId: DRAFT_ID, expectedRevision: 1 })
    expect(payload.graph.states[0]).toMatchObject({
      id: NEW_ID,
      systemLabelKey: null,
      providerLabel: 'Ný sérstaða',
      customerLabel: 'Fyrirspurn móttekin',
    })
    expect(await screen.findByRole('status')).toHaveTextContent('workflow.editor.success.draftSaved')
  })

  it('preserves an invalid new state locally and does not call the API', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<ProviderBookingWorkflowEditorClient initialWorkflow={workflow()} />)

    await userEvent.click(screen.getByRole('button', { name: 'workflow.editor.addState' }))
    expect(screen.getAllByLabelText('workflow.editor.providerLabel')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'workflow.editor.save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('workflow.editor.errors.invalid')
    expect(screen.getByText('workflow.editor.errors.label')).toBeInTheDocument()
    expect(screen.getByText('workflow.editor.errors.unreachable_state')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByLabelText('workflow.editor.providerLabel')).toHaveValue('')
  })

  it('reorders states, changes the initial state, keeps edges and locks confirmed deletion', async () => {
    const draft = graph('draft', {
      states: [
        graph('draft').states[0]!,
        {
          id: REVIEW_ID,
          logicalKey: 'review',
          systemLabelKey: null,
          providerLabel: 'Review',
          customerLabel: 'Under review',
          sortOrder: 1,
          isInitial: false,
          semanticKind: 'active',
          attentionSide: 'provider',
        },
        { ...graph('draft').states[1]!, sortOrder: 2 },
      ],
      transitions: [
        { fromStateId: NEW_ID, toStateId: REVIEW_ID },
        { fromStateId: REVIEW_ID, toStateId: CONFIRMED_ID },
      ],
    })
    render(<ProviderBookingWorkflowEditorClient initialWorkflow={workflow(draft)} />)

    await userEvent.click(screen.getByRole('button', { name: 'workflow.editor.editState:Review' }))
    expect(screen.getByRole('checkbox', {
      name: 'Staðfest',
    })).toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: 'workflow.editor.initialState' }))
    await userEvent.click(screen.getByRole('button', { name: 'workflow.editor.moveUp:Review' }))

    await userEvent.click(screen.getByRole('button', {
      name: 'workflow.editor.editState:Ný fyrirspurn',
    }))
    await userEvent.click(screen.getByRole('button', {
      name: 'workflow.editor.deleteState:Ný fyrirspurn',
    }))

    expect(screen.queryByText('Ný fyrirspurn')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', {
      name: 'workflow.editor.deleteState:Staðfest',
    })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'workflow.editor.save' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'workflow.editor.publish' })).toBeDisabled()
  })

  it('disables adding a twenty-first state', () => {
    const states = Array.from({ length: 20 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      logicalKey: index === 19 ? 'confirmed' : `state_${index}`,
      systemLabelKey: null,
      providerLabel: index === 19 ? 'Confirmed' : `State ${index}`,
      customerLabel: index === 19 ? 'Confirmed' : `Customer state ${index}`,
      sortOrder: index,
      isInitial: index === 0,
      semanticKind: index === 19 ? 'confirmed' as const : 'active' as const,
      attentionSide: index === 19 ? 'none' as const : 'provider' as const,
    }))
    const transitions = states.slice(0, -1).map((state, index) => ({
      fromStateId: state.id,
      toStateId: states[index + 1]!.id,
    }))
    render(<ProviderBookingWorkflowEditorClient initialWorkflow={workflow(graph('draft', {
      states,
      transitions,
    }))} />)

    expect(screen.getByRole('button', { name: 'workflow.editor.addState' })).toBeDisabled()
  })

  it('reuses the same idempotency key when POST commits but authoritative reload fails', async () => {
    const updatedDraft = graph('draft', {
      revision: 2,
      states: [{
        ...graph('draft').states[0]!,
        systemLabelKey: null,
        providerLabel: 'Ný sérstaða',
        customerLabel: 'Fyrirspurn móttekin',
      }, graph('draft').states[1]!],
    })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ ok: true, data: ack() }))
      .mockResolvedValueOnce(response({ error: 'temporary' }, 503))
      .mockResolvedValueOnce(response({ ok: true, data: { ...ack(), replayed: true } }))
      .mockResolvedValueOnce(response(workflow(updatedDraft)))
    vi.stubGlobal('fetch', fetchMock)
    render(<ProviderBookingWorkflowEditorClient initialWorkflow={workflow()} />)

    await userEvent.click(screen.getByRole('button', {
      name: /workflow.editor.editState:Ný fyrirspurn/,
    }))
    const providerLabel = screen.getByLabelText('workflow.editor.providerLabel')
    await userEvent.clear(providerLabel)
    await userEvent.type(providerLabel, 'Ný sérstaða')
    await userEvent.click(screen.getByRole('button', { name: 'workflow.editor.save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('workflow.editor.errors.load')

    await userEvent.click(screen.getByRole('button', { name: 'workflow.editor.save' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4))

    const firstPayload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    const retryPayload = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))
    expect(retryPayload.idempotencyKey).toBe(firstPayload.idempotencyKey)
    expect(await screen.findByRole('status')).toHaveTextContent('workflow.editor.success.draftSaved')
  })

  it('creates a draft explicitly before exposing mutation controls', async () => {
    const withDraft = workflow(graph('draft'))
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ ok: true, data: ack() }))
      .mockResolvedValueOnce(response(withDraft))
    vi.stubGlobal('fetch', fetchMock)
    render(<ProviderBookingWorkflowEditorClient initialWorkflow={workflow(null)} />)

    await userEvent.click(screen.getByRole('button', { name: 'workflow.editor.ensureDraft' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      action: 'ensureDraft',
      expectedWorkflowRevision: 2,
    })
    expect(await screen.findByRole('status')).toHaveTextContent('workflow.editor.success.draftCreated')
    expect(screen.getByRole('button', { name: 'workflow.editor.publish' })).toBeEnabled()
  })

  it('publishes only a saved draft and reloads the authoritative active version', async () => {
    const published = workflow(null)
    published.activeVersion = graph('published', { id: DRAFT_ID, versionNumber: 2, revision: 2 })
    published.workflow.revision = 3
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ ok: true, data: { ...ack(), activeVersionId: DRAFT_ID } }))
      .mockResolvedValueOnce(response(published))
    vi.stubGlobal('fetch', fetchMock)
    render(<ProviderBookingWorkflowEditorClient initialWorkflow={workflow()} />)

    await userEvent.click(screen.getByRole('button', { name: 'workflow.editor.publish' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      action: 'publishDraft',
      draftVersionId: DRAFT_ID,
      expectedRevision: 1,
    })
    expect(await screen.findByRole('status')).toHaveTextContent('workflow.editor.success.published')
    expect(screen.getByRole('button', { name: 'workflow.editor.ensureDraft' })).toBeInTheDocument()
  })
})
