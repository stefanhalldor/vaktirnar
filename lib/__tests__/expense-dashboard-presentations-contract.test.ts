import { describe, expect, it } from 'vitest'
import {
  classifyExpenseDashboardPresentationResponse,
  formatExpenseDashboardPresentationDiagnostic,
  parseExpenseDashboardPresentations,
} from '@/lib/expenses/dashboard-presentations'

const KEY_A = 'a'.repeat(32)
const KEY_B = 'b'.repeat(32)
const KEY_C = 'c'.repeat(32)

function row(overrides: Record<string, unknown> = {}) {
  return {
    presentation_key: KEY_A,
    presentation_state: 'confirmed',
    title: 'Kvöldmatur',
    total_minor: 12_500,
    currency: 'ISK',
    href: '/auth-mvp/utlagt-og-endurgreitt/utgjold/10000000-0000-4000-8000-000000000001',
    order: {
      basis: 'incurred_on',
      primary: '2026-08-31',
      secondary: '2026-08-31T10:00:00.000Z',
      tie_breaker: KEY_A,
    },
    person_facets: [{ key: KEY_B, label: 'Siggi golf', kind: 'durable' }],
    circle_facets: [{ key: KEY_C, label: 'Golfvinir' }],
    ...overrides,
  }
}

function privateRow(overrides: Record<string, unknown> = {}) {
  return row({
    presentation_state: 'private_draft',
    href: '/auth-mvp/utlagt-og-endurgreitt/nytt?draft=10000000-0000-4000-8000-000000000001',
    order: {
      basis: 'visible_updated_at',
      primary: '2026-08-31T10:00:00.000Z',
      secondary: '2026-08-31T09:00:00.000Z',
      tie_breaker: KEY_A,
    },
    ...overrides,
  })
}

describe('SQL170 strict dashboard wire parser', () => {
  it('accepts the exact ready, none and unavailable result states', () => {
    expect(parseExpenseDashboardPresentations({
      contract_version: 1,
      status: 'ready',
      rows: [row()],
    })).toMatchObject({ status: 'ready', rows: [{ presentationState: 'confirmed' }] })
    expect(parseExpenseDashboardPresentations({
      contract_version: 1, status: 'none', rows: [],
    })).toEqual({ status: 'none', rows: [] })
    expect(parseExpenseDashboardPresentations({
      contract_version: 1, status: 'unavailable', rows: [],
    })).toEqual({ status: 'unavailable', rows: [] })
  })

  it.each([
    { contract_version: 1, status: 'ready', rows: [] },
    { contract_version: 1, status: 'none', rows: [row()] },
    { contract_version: 1, status: 'ready', rows: [row(), row()] },
    { contract_version: 1, status: 'ready', rows: [row({ extra: true })] },
    { contract_version: 1, status: 'ready', rows: [row({ presentation_key: 'raw-uuid' })] },
    { contract_version: 1, status: 'ready', rows: [row({ href: 'https://example.com' })] },
    { contract_version: 1, status: 'ready', rows: [row({
      order: {
        basis: 'incurred_on', primary: '2026-02-30',
        secondary: '2026-08-31T10:00:00.000Z', tie_breaker: KEY_A,
      },
    })] },
    { contract_version: 1, status: 'ready', rows: [row({ title: 'siggi@example.is' })] },
    { contract_version: 1, status: 'ready', rows: [row({
      person_facets: [{ key: KEY_B, label: 'siggi@example.is', kind: 'durable' }],
    })] },
    { contract_version: 1, status: 'ready', rows: [row({
      person_facets: [{ key: KEY_B, label: 'Siggi@heima', kind: 'durable' }],
    })] },
    { contract_version: 1, status: 'ready', rows: [row({
      person_facets: [
        { key: KEY_B, label: 'Siggi', kind: 'durable' },
        { key: KEY_B, label: 'Siggi', kind: 'durable' },
      ],
    })] },
  ])('fails malformed or ambiguous input closed without partial rows', (input) => {
    expect(parseExpenseDashboardPresentations(input)).toEqual({ status: 'unavailable', rows: [] })
  })

  it('keeps same-name manual guests distinct by opaque context key', () => {
    const parsed = parseExpenseDashboardPresentations({
      contract_version: 1,
      status: 'ready',
      rows: [
        row({
          person_facets: [{ key: KEY_B, label: 'Siggi', kind: 'manual' }],
          circle_facets: [],
        }),
        row({
          presentation_key: KEY_C,
          order: {
            basis: 'incurred_on',
            primary: '2026-08-30',
            secondary: '2026-08-30T10:00:00.000Z',
            tie_breaker: KEY_C,
          },
          person_facets: [{ key: 'd'.repeat(32), label: 'Siggi', kind: 'manual' }],
          circle_facets: [],
        }),
      ],
    })

    expect(parsed.status).toBe('ready')
    if (parsed.status === 'ready') {
      expect(parsed.rows.flatMap((item) => item.personFacets).map((facet) => facet.key))
        .toEqual([KEY_B, 'd'.repeat(32)])
    }
  })

  it('accepts an incomplete private draft without inventing amount or href', () => {
    const parsed = parseExpenseDashboardPresentations({
      contract_version: 1,
      status: 'ready',
      rows: [row({
        presentation_state: 'private_draft',
        title: 'Ónefnd drög',
        total_minor: null,
        currency: null,
        href: null,
        order: {
          basis: 'visible_updated_at',
          primary: '2026-08-31T10:00:00.000Z',
          secondary: '2026-08-31T09:00:00.000Z',
          tie_breaker: KEY_A,
        },
      })],
    })
    expect(parsed).toMatchObject({ status: 'ready', rows: [{ totalMinor: null, href: null }] })
  })

  it('keeps legacy SQL171 rows compatible while accepting the exact SQL172 attention shape', () => {
    const legacy = parseExpenseDashboardPresentations({
      contract_version: 1,
      status: 'ready',
      rows: [privateRow()],
    })
    expect(legacy).toMatchObject({ status: 'ready', rows: [{ needsAttention: false }] })

    const sql172 = parseExpenseDashboardPresentations({
      contract_version: 1,
      status: 'ready',
      rows: [privateRow({
        needs_attention: true,
      })],
    })
    expect(sql172).toMatchObject({
      status: 'ready', rows: [{ title: 'Kvöldmatur', needsAttention: true }],
    })

    expect(parseExpenseDashboardPresentations({
      contract_version: 1,
      status: 'ready',
      rows: [privateRow({
        total_minor: null,
        currency: null,
        needs_attention: true,
      })],
    })).toMatchObject({
      status: 'ready', rows: [{ totalMinor: null, needsAttention: true }],
    })

    expect(parseExpenseDashboardPresentations({
      contract_version: 1,
      status: 'ready',
      rows: [privateRow({ needs_attention: false })],
    })).toMatchObject({
      status: 'ready', rows: [{ presentationState: 'private_draft', needsAttention: false }],
    })

    expect(parseExpenseDashboardPresentations({
      contract_version: 1,
      status: 'ready',
      rows: [row({ needs_attention: false })],
    })).toMatchObject({
      status: 'ready', rows: [{ presentationState: 'confirmed', needsAttention: false }],
    })
  })

  it('accepts a null title only for an explicit SQL172 private attention row', () => {
    expect(parseExpenseDashboardPresentations({
      contract_version: 1,
      status: 'ready',
      rows: [privateRow({
        title: null,
        needs_attention: true,
      })],
    })).toMatchObject({ status: 'ready', rows: [{ title: null, needsAttention: true }] })

    for (const overrides of [
      { presentation_state: 'private_draft', title: null },
      { presentation_state: 'private_draft', title: null, needs_attention: false },
      { presentation_state: 'shared_draft', title: null, needs_attention: true },
      { presentation_state: 'confirmed', title: null, needs_attention: false },
      { presentation_state: 'settled', title: null, needs_attention: false },
      { presentation_state: 'cancelled', title: null, needs_attention: false },
      { presentation_state: 'confirmed', needs_attention: true },
      {
        presentation_state: 'private_draft',
        total_minor: null,
        currency: null,
        needs_attention: false,
      },
      { presentation_state: 'private_draft', needs_attention: 'true' },
    ]) {
      expect(parseExpenseDashboardPresentations({
        contract_version: 1,
        status: 'ready',
        rows: [overrides.presentation_state === 'private_draft'
          ? privateRow(overrides)
          : row(overrides)],
      })).toEqual({ status: 'unavailable', rows: [] })
    }
  })

  it.each(['', ' siggi ', 'siggi@example.is', 'control\u0001', '\u202Ahidden']) (
    'keeps unsafe private title strings fail-closed: %j',
    (title) => {
      expect(parseExpenseDashboardPresentations({
        contract_version: 1,
        status: 'ready',
        rows: [privateRow({
          title,
          needs_attention: true,
        })],
      })).toEqual({ status: 'unavailable', rows: [] })
    },
  )
})

describe('SQL170 dashboard runtime diagnostic classification', () => {
  const privateValues = {
    title: 'Leyndur kvöldmatur',
    href: '/auth-mvp/utlagt-og-endurgreitt/utgjold/10000000-0000-4000-8000-000000000001',
    actorId: '20000000-0000-4000-8000-000000000002',
    email: 'private@example.is',
    amount: 987654321,
  }

  function diagnosticLine(value: unknown, error: unknown = null) {
    const classified = classifyExpenseDashboardPresentationResponse(value, error)
    expect(classified.result).toEqual({ status: 'unavailable', rows: [] })
    expect(classified.diagnostic).not.toBeNull()
    return {
      classified,
      line: formatExpenseDashboardPresentationDiagnostic(classified.diagnostic!),
    }
  }

  it('distinguishes rpc_error without logging raw database messages', () => {
    const { classified, line } = diagnosticLine(null, {
      code: '42883',
      message: `${privateValues.title} ${privateValues.actorId} ${privateValues.email}`,
    })
    expect(classified.diagnostic).toEqual({
      classification: 'rpc_error', sqlState: '42883', errorCategory: 'postgres',
    })
    expect(line).not.toContain(privateValues.title)
    expect(line).not.toContain(privateValues.actorId)
    expect(line).not.toContain(privateValues.email)
  })

  it('distinguishes a valid SQL unavailable envelope', () => {
    const { classified } = diagnosticLine({ contract_version: 1, status: 'unavailable', rows: [] })
    expect(classified.diagnostic).toMatchObject({
      classification: 'sql_unavailable',
      predicate: 'envelope.status_unavailable',
      contractVersion: 1,
      returnedStatus: 'unavailable',
      rowCount: 0,
    })
  })

  it('distinguishes an invalid envelope using only allowlisted scalar metadata', () => {
    const value = {
      contract_version: 1,
      status: 'unexpected-private-status',
      rows: [],
      title: privateValues.title,
      actor_id: privateValues.actorId,
    }
    const { classified, line } = diagnosticLine(value)
    expect(classified.diagnostic).toMatchObject({
      classification: 'invalid_envelope',
      predicate: 'envelope.exact_shape',
      contractVersion: 1,
      returnedStatus: 'other',
      rowCount: 0,
    })
    expect(line).not.toContain('unexpected-private-status')
    expect(line).not.toContain(privateValues.title)
    expect(line).not.toContain(privateValues.actorId)
  })

  it('identifies the exact ready-payload parser predicate without rejected values', () => {
    const value = {
      contract_version: 1,
      status: 'ready',
      rows: [row({
        title: privateValues.title,
        total_minor: privateValues.amount,
        href: privateValues.href,
        person_facets: [{ key: KEY_B, label: privateValues.email, kind: 'durable' }],
      })],
    }
    const { classified, line } = diagnosticLine(value)
    expect(classified.diagnostic).toMatchObject({
      classification: 'parser_rejected_ready_payload',
      predicate: 'row.person_facets_entry',
      contractVersion: 1,
      returnedStatus: 'ready',
      rowCount: 1,
    })
    for (const privateValue of Object.values(privateValues)) {
      expect(line).not.toContain(String(privateValue))
    }
  })

  it('does not emit a diagnostic for a successful ready result', () => {
    const classified = classifyExpenseDashboardPresentationResponse({
      contract_version: 1, status: 'ready', rows: [row()],
    }, null)
    expect(classified.result.status).toBe('ready')
    expect(classified.diagnostic).toBeNull()
  })
})
