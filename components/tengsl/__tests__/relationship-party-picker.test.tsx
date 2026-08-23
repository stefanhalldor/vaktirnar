import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createRef, type ComponentProps } from 'react'
import {
  RelationshipPartyPicker,
  type RelationshipPartyPickerCopy,
  type RelationshipPartyPickerSource,
} from '../RelationshipPartyPicker'

const copy: RelationshipPartyPickerCopy = {
  triggerLabel: 'Bæta við aðila',
  title: 'Veldu aðila',
  description: 'Veldu þekktan aðila eða sláðu inn gildi.',
  closeLabel: 'Loka vali',
  searchLabel: 'Leita',
  searchPlaceholder: 'Nafn eða label',
  filterLabel: 'Sía eftir labelum',
  allFilterLabel: 'Allir',
  noResultsLabel: 'Enginn fannst',
  loadErrorLabel: 'Ekki tókst að sækja tengsl',
  circleSectionLabel: 'Tengslahringir',
  manual: {
    sourceLabel: 'Leið til að bæta við',
    knownModeLabel: 'Þekktur aðili',
    manualModeLabel: 'Handvirkt',
    inputLabel: 'Nafn eða netfang',
    inputPlaceholder: 'Nafn eða nafn@netfang.is',
    hint: 'Sláðu inn nafn eða netfang.',
    submitLabel: 'Bæta við',
  },
}

const options = [
  {
    id: 'relationship-a',
    primaryLabel: 'Anna vinkona',
    secondaryLabel: 'anna@example.is',
    note: 'Hittumst í kórnum',
    searchAliases: ['Anna Jónsdóttir'],
    customLabels: [{ id: 'friends', name: 'Vinir' }],
  },
  {
    id: 'relationship-b',
    primaryLabel: 'Bjarni bróðir',
    secondaryLabel: 'bjarni@example.is',
    customLabels: [{ id: 'family', name: 'Fjölskylda' }],
  },
]

function openPicker(overrides: Partial<ComponentProps<typeof RelationshipPartyPicker>> = {}) {
  const onSelectOption = vi.fn(() => true)
  const onSelectManual = vi.fn(() => ({ accepted: true }))
  const onSelectCircle = vi.fn(() => true)
  const view = render(
    <RelationshipPartyPicker
      options={options}
      copy={copy}
      onSelectOption={onSelectOption}
      onSelectManual={onSelectManual}
      circles={[{ id: 'circle-a', primaryLabel: 'Fjölskyldan', secondaryLabel: '4 þátttakendur' }]}
      onSelectCircle={onSelectCircle}
      {...overrides}
    />,
  )
  const trigger = screen.getByRole('button', { name: 'Bæta við aðila' })
  fireEvent.click(trigger)
  return { onSelectOption, onSelectManual, onSelectCircle, trigger, ...view }
}

describe('RelationshipPartyPicker', () => {
  it('keeps the canonical mobile sheet and desktop dialog class contract', () => {
    openPicker()

    const dialog = screen.getByRole('dialog')
    expect(dialog.className).toContain('inset-x-0')
    expect(dialog.className).toContain('bottom-0')
    expect(dialog.className).toContain('max-h-[calc(100dvh-1rem)]')
    expect(dialog.className).toContain('overflow-y-auto')
    expect(dialog.className).toContain('safe-area-inset-bottom')
    expect(dialog.className).toContain('sm:left-1/2')
    expect(dialog.className).toContain('sm:top-1/2')
    expect(screen.getByRole('textbox', { name: 'Leita' }).className).toContain('text-base')
    expect(screen.getByRole('button', { name: 'Loka vali' }).className).toContain('size-11')
    expect(screen.getByText('Anna vinkona').className).toContain('break-words')
    expect(screen.getByText('Anna vinkona').className).not.toContain('truncate')
    const optionList = screen.getByRole('button', { name: /Anna vinkona/ }).parentElement
    expect(optionList).not.toBeNull()
    expect(optionList!.className).not.toContain('max-h-[40dvh]')
    expect(optionList!.className).not.toContain('overflow-y-auto')
  })

  it('filters by search and custom-label chips, while rendering owner-only details', () => {
    openPicker()

    expect(screen.getByText('Hittumst í kórnum')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'Leita' }), { target: { value: 'bróðir' } })
    expect(screen.queryByText('Anna vinkona')).not.toBeInTheDocument()
    expect(screen.getByText('Bjarni bróðir')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('textbox', { name: 'Leita' }), { target: { value: '' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Leita' }), { target: { value: 'Jónsdóttir' } })
    expect(screen.getByText('Anna vinkona')).toBeInTheDocument()
    expect(screen.queryByText('Anna Jónsdóttir')).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole('textbox', { name: 'Leita' }), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Vinir' }))
    expect(screen.getByText('Anna vinkona')).toBeInTheDocument()
    expect(screen.queryByText('Bjarni bróðir')).not.toBeInTheDocument()
  })

  it('returns only the stable option ID and closes after accepted selection', () => {
    const { onSelectOption } = openPicker()

    fireEvent.click(screen.getByRole('button', { name: /Anna vinkona/ }))

    expect(onSelectOption).toHaveBeenCalledWith('relationship-a')
    expect(onSelectOption).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes on Escape and outside pointer, returning focus after Escape', async () => {
    const { trigger } = openPicker()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(trigger).toHaveFocus())

    fireEvent.click(trigger)
    const dialog = screen.getByRole('dialog')
    const overlay = dialog.previousElementSibling
    expect(overlay).not.toBeNull()
    await new Promise((resolve) => setTimeout(resolve, 0))
    fireEvent.pointerDown(overlay!, { button: 0, pointerType: 'mouse' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('returns only the stable circle ID', () => {
    const { onSelectCircle } = openPicker()

    fireEvent.click(screen.getByRole('button', { name: /Fjölskyldan/ }))

    expect(onSelectCircle).toHaveBeenCalledWith('circle-a')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('passes raw manual input to the adapter and keeps the dialog open on validation error', () => {
    const onSelectManual = vi.fn(() => ({ accepted: false, error: 'Ógilt gildi' }))
    openPicker({ onSelectManual })
    fireEvent.click(screen.getByRole('button', { name: 'Handvirkt' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Nafn eða netfang' }), {
      target: { value: '  Raw Value  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Bæta við' }))

    expect(onSelectManual).toHaveBeenCalledWith('  Raw Value  ')
    expect(screen.getByRole('alert')).toHaveTextContent('Ógilt gildi')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('lets a domain adapter narrow the manual input presentation limit', () => {
    openPicker({ manualInputMaxLength: 120 })
    fireEvent.click(screen.getByRole('button', { name: 'Handvirkt' }))

    expect(screen.getByRole('textbox', { name: 'Nafn eða netfang' })).toHaveAttribute('maxlength', '120')
  })

  it('shows load and empty states and resets state on close', () => {
    openPicker({
      options,
      excludedOptionIds: options.map((option) => option.id),
      optionsError: true,
      circles: [],
      onSelectCircle: undefined,
    })

    expect(screen.getByText('Ekki tókst að sækja tengsl')).toBeInTheDocument()
    expect(screen.getByText('Enginn fannst')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Loka vali' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders optional adapter helper before sources and keeps it across source changes', () => {
    const { rerender } = render(
      <RelationshipPartyPicker
        copy={{ ...copy, sourceLabel: 'Leið til að bæta við' }}
        helperText="Aðeins gjaldgengir aðilar birtast hér."
        sources={[
          {
            id: 'known',
            label: 'Úr Tengslum',
            type: 'options',
            options: [],
            searchLabel: 'Leita',
            searchPlaceholder: 'Nafn',
            filterLabel: 'Sía',
            allFilterLabel: 'Allir',
            noResultsLabel: 'Enginn fannst',
            onSelectOption: () => true,
          },
          {
            id: 'manual',
            label: 'Skrá nafn',
            type: 'manual',
            inputLabel: 'Nafn',
            inputPlaceholder: 'Nafn',
            hint: 'Enginn aðgangur.',
            submitLabel: 'Halda áfram',
            onSelect: () => ({ accepted: true }),
          },
        ]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Bæta við aðila' }))
    const helper = screen.getByText('Aðeins gjaldgengir aðilar birtast hér.')
    const source = screen.getByRole('button', { name: 'Úr Tengslum' })
    expect(helper.compareDocumentPosition(source) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Skrá nafn' }))
    expect(helper).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Loka vali' }))
    rerender(<RelationshipPartyPicker copy={copy} options={options} onSelectOption={() => true} />)
    fireEvent.click(screen.getByRole('button', { name: 'Bæta við aðila' }))
    expect(screen.queryByText('Aðeins gjaldgengir aðilar birtast hér.')).not.toBeInTheDocument()
  })

  it('presents optional bounded pagination and blocks duplicate navigation while pending', () => {
    const onNext = vi.fn()
    const onPrevious = vi.fn()
    render(
      <RelationshipPartyPicker
        copy={copy}
        sources={[{
          id: 'known',
          label: 'Úr Tengslum',
          type: 'options',
          options,
          searchLabel: 'Leita',
          searchPlaceholder: 'Nafn',
          filterLabel: 'Sía',
          allFilterLabel: 'Allir',
          noResultsLabel: 'Enginn fannst',
          pagination: {
            pageKey: 0,
            hasPrevious: false,
            hasNext: true,
            pending: true,
            previousLabel: 'Fyrri',
            nextLabel: 'Næstu',
            loadingLabel: 'Sæki…',
            onPrevious,
            onNext,
          },
          onSelectOption: () => true,
        }]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Bæta við aðila' }))
    const loadingButtons = screen.getAllByRole('button', { name: 'Sæki…' })
    expect(loadingButtons).toHaveLength(2)
    loadingButtons.forEach((button) => expect(button).toBeDisabled())
    fireEvent.click(loadingButtons[1])
    expect(onNext).not.toHaveBeenCalled()
    expect(onPrevious).not.toHaveBeenCalled()
  })

  it('runs the post-selection hook only at the accepted close boundary', async () => {
    const onSelectionClosed = vi.fn()
    const first = openPicker({ onSelectionClosed })
    fireEvent.click(screen.getByRole('button', { name: /Anna vinkona/ }))
    await waitFor(() => expect(onSelectionClosed).toHaveBeenCalledOnce())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    first.unmount()

    const second = openPicker({ onSelectionClosed })
    fireEvent.click(screen.getAllByRole('button', { name: 'Loka vali' }).at(-1)!)
    expect(onSelectionClosed).toHaveBeenCalledOnce()
    expect(second.trigger).toBeInTheDocument()
  })

  it('distinguishes opening and dismissal from an accepted close', async () => {
    const onOpen = vi.fn()
    const onDismiss = vi.fn()
    const onSelectionClosed = vi.fn()
    const { trigger } = openPicker({ onOpen, onDismiss, onSelectionClosed })

    expect(onOpen).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Loka vali' }))
    expect(onDismiss).toHaveBeenCalledOnce()
    expect(onSelectionClosed).not.toHaveBeenCalled()

    fireEvent.click(trigger)
    expect(onOpen).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole('button', { name: /Anna vinkona/ }))

    await waitFor(() => expect(onSelectionClosed).toHaveBeenCalledOnce())
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('uses an available adapter focus target when the picker opens', async () => {
    const initialFocusRef = createRef<HTMLInputElement>()
    render(
      <RelationshipPartyPicker
        copy={copy}
        initialFocusRef={initialFocusRef}
        sources={[{
          id: 'custom',
          label: 'Sérval',
          type: 'custom',
          render: () => <input ref={initialFocusRef} aria-label="Fyrsti reitur" />,
        }]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Bæta við aðila' }))

    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Fyrsti reitur' })).toHaveFocus())
  })

  it('renders controlled option state and an accessible disabled reason', () => {
    const onSelectOption = vi.fn(() => ({ accepted: true, behavior: 'stay-open' as const }))
    render(
      <RelationshipPartyPicker
        copy={copy}
        sources={[{
          id: 'known',
          label: 'Þekktir aðilar',
          type: 'options',
          optionControl: 'checkbox',
          options: [
            { ...options[0], selected: true },
            { ...options[1], disabledReason: 'Þegar valinn á þessum stað.' },
          ],
          searchLabel: 'Leita',
          searchPlaceholder: 'Nafn',
          filterLabel: 'Sía',
          allFilterLabel: 'Allir',
          noResultsLabel: 'Enginn fannst',
          onSelectOption,
        }]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Bæta við aðila' }))

    const selected = screen.getByRole('checkbox', { name: /Anna vinkona/ })
    const unavailable = screen.getByRole('checkbox', { name: /Bjarni bróðir/ })
    expect(selected).toBeChecked()
    expect(unavailable).toHaveAttribute('aria-disabled', 'true')
    const reasonId = unavailable.getAttribute('aria-describedby')
    expect(reasonId).toBeTruthy()
    expect(document.getElementById(reasonId!)).toHaveTextContent('Þegar valinn á þessum stað.')

    fireEvent.click(unavailable)
    expect(onSelectOption).not.toHaveBeenCalled()
    fireEvent.click(selected)
    expect(onSelectOption).toHaveBeenCalledOnce()
    expect(onSelectOption).toHaveBeenCalledWith('relationship-a')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('lets a generic footer complete through the accepted close boundary', async () => {
    const onSelectionClosed = vi.fn()
    openPicker({
      onSelectionClosed,
      renderFooter: ({ completeSelection }) => (
        <button type="button" onClick={() => completeSelection({ accepted: true })}>
          Halda áfram
        </button>
      ),
    })

    fireEvent.click(screen.getByRole('button', { name: 'Halda áfram' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(onSelectionClosed).toHaveBeenCalledOnce())
  })

  it('honors excluded IDs without returning hidden options', () => {
    openPicker({ excludedOptionIds: ['relationship-a'] })
    const dialog = screen.getByRole('dialog')

    expect(within(dialog).queryByText('Anna vinkona')).not.toBeInTheDocument()
    expect(within(dialog).getByText('Bjarni bróðir')).toBeInTheDocument()
  })

  it('supports pluggable sources, stable panel wiring and retained source focus', async () => {
    const onSelectEventGuest = vi.fn()
    const sources: RelationshipPartyPickerSource[] = [
      {
        id: 'known',
        label: 'Þekktur aðili',
        type: 'options',
        options,
        searchLabel: 'Leita',
        searchPlaceholder: 'Nafn',
        filterLabel: 'Sía',
        allFilterLabel: 'Allir',
        noResultsLabel: 'Enginn fannst',
        onSelectOption: () => ({ accepted: true }),
      },
      {
        id: 'event',
        label: 'Úr viðburði',
        type: 'custom',
        render: ({ completeSelection }) => (
          <button
            type="button"
            onClick={() => {
              onSelectEventGuest('event-guest-a')
              completeSelection({ accepted: true, behavior: 'stay-open' })
            }}
          >
            Velja Önnu
          </button>
        ),
      },
      {
        id: 'manual',
        label: 'Nafn eða netfang',
        type: 'manual',
        inputLabel: 'Nafn eða netfang',
        inputPlaceholder: 'Nafn',
        hint: 'Sláðu inn gildi.',
        submitLabel: 'Bæta við',
        onSelect: () => ({ accepted: true }),
      },
    ]

    render(
      <RelationshipPartyPicker
        copy={{ ...copy, sourceLabel: 'Leið til að bæta við' }}
        sources={sources}
        initialSourceId="event"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Bæta við aðila' }))

    const knownSource = screen.getByRole('button', { name: 'Þekktur aðili' })
    const eventSource = screen.getByRole('button', { name: 'Úr viðburði' })
    const manualSource = screen.getByRole('button', { name: 'Nafn eða netfang' })
    await waitFor(() => expect(knownSource).toHaveFocus())
    const panelId = eventSource.getAttribute('aria-controls')
    expect(panelId).toBeTruthy()
    expect(knownSource).toHaveAttribute('aria-controls', panelId)
    expect(manualSource).toHaveAttribute('aria-controls', panelId)
    expect(knownSource).toHaveAttribute('aria-pressed', 'false')
    expect(eventSource).toHaveAttribute('aria-pressed', 'true')
    expect(manualSource).toHaveAttribute('aria-pressed', 'false')
    for (const sourceControl of [knownSource, eventSource, manualSource]) {
      expect(sourceControl.className).toContain('min-w-0')
      expect(sourceControl.className).toContain('whitespace-normal')
      expect(sourceControl.className).toContain('break-words')
      expect(sourceControl.className).toContain('[overflow-wrap:anywhere]')
      expect(sourceControl.className).not.toContain('truncate')
    }
    manualSource.focus()
    fireEvent.click(manualSource)
    expect(manualSource).toHaveFocus()
    expect(eventSource).toHaveAttribute('aria-pressed', 'false')
    expect(manualSource).toHaveAttribute('aria-pressed', 'true')
    expect(document.getElementById(panelId!)).toHaveAttribute('aria-labelledby', manualSource.id)
    fireEvent.click(eventSource)
    fireEvent.click(screen.getByRole('button', { name: 'Velja Önnu' }))
    expect(onSelectEventGuest).toHaveBeenCalledWith('event-guest-a')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
