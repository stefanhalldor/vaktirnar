import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type {
  CustomerBookingWorkflowStateView,
  ProviderBookingWorkflowStateView,
} from '@/lib/bookings/contracts'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => (
    values?.reason ? `${key}:${values.reason}` : key
  ),
}))

import { BookingStatusPanel } from '../BookingStatusPanel'

const providerState: ProviderBookingWorkflowStateView = {
  audience: 'provider',
  workflowId: '11111111-1111-4111-8111-111111111111',
  versionId: '22222222-2222-4222-8222-222222222222',
  stateId: '33333333-3333-4333-8333-333333333333',
  logicalKey: 'new_request',
  systemLabelKey: 'new_request',
  label: null,
  attentionSide: 'provider',
  semanticKind: 'active',
  allowedNextStates: [{
    stateId: '44444444-4444-4444-8444-444444444444',
    logicalKey: 'review',
    systemLabelKey: null,
    label: 'Sérsniðin skoðun',
    attentionSide: 'provider',
    semanticKind: 'active',
  }],
}

describe('BookingStatusPanel', () => {
  it('shows provider-safe targets and returns only the selected state ID', async () => {
    const onTransition = vi.fn()
    render(
      <BookingStatusPanel
        audience="provider"
        lifecycleStatus="requested"
        workflowState={providerState}
        cancellationReason={null}
        canTransition
        pending={false}
        onTransition={onTransition}
      />,
    )

    expect(screen.getByText('workflow.systemLabels.new_request.provider')).toBeInTheDocument()
    expect(screen.getByText('workflow.attention.provider.yours')).toBeInTheDocument()
    await userEvent.selectOptions(
      screen.getByLabelText('workflow.statusPanel.nextState'),
      '44444444-4444-4444-8444-444444444444',
    )
    await userEvent.click(screen.getByRole('button', { name: 'workflow.statusPanel.change' }))

    expect(onTransition).toHaveBeenCalledWith('44444444-4444-4444-8444-444444444444')
    expect(onTransition).toHaveBeenCalledOnce()
  })

  it('renders a customer-safe projection without transition controls', () => {
    const state: CustomerBookingWorkflowStateView = {
      audience: 'customer',
      systemLabelKey: 'waiting_provider',
      label: null,
      attentionSide: 'provider',
      semanticKind: 'active',
    }
    render(
      <BookingStatusPanel
        audience="customer"
        lifecycleStatus="requested"
        workflowState={state}
        cancellationReason={null}
        canTransition={false}
        pending={false}
        onTransition={vi.fn()}
      />,
    )

    expect(screen.getByText('workflow.systemLabels.waiting_provider.customer')).toBeInTheDocument()
    expect(screen.getByText('workflow.attention.customer.provider')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain(providerState.stateId)
  })

  it('lets cancelled lifecycle presentation dominate the pinned workflow state', () => {
    render(
      <BookingStatusPanel
        audience="provider"
        lifecycleStatus="cancelled"
        workflowState={providerState}
        cancellationReason="provider_unavailable"
        canTransition={false}
        pending={false}
        onTransition={vi.fn()}
      />,
    )

    expect(screen.getByText('workflow.statusPanel.cancelled.provider')).toBeInTheDocument()
    expect(screen.getByText(/workflow.cancellationReasons.provider_unavailable/)).toBeInTheDocument()
    expect(screen.queryByText('workflow.systemLabels.new_request.provider')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('fails safe when the active projection audience does not match the page', () => {
    render(
      <BookingStatusPanel
        audience="customer"
        lifecycleStatus="requested"
        workflowState={providerState}
        cancellationReason={null}
        canTransition={false}
        pending={false}
        onTransition={vi.fn()}
      />,
    )

    expect(screen.getByText('workflow.statusPanel.unavailable')).toBeInTheDocument()
    expect(screen.queryByText('workflow.systemLabels.new_request.provider')).not.toBeInTheDocument()
  })
})
