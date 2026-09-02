export type ExpenseDashboardPresentationState =
  | 'private_draft'
  | 'shared_draft'
  | 'confirmed'
  | 'settled'
  | 'cancelled'

export type ExpenseDashboardPersonFacetKind = 'durable' | 'manual'

export interface ExpenseDashboardPersonFacetView {
  key: string
  label: string
  kind: ExpenseDashboardPersonFacetKind
}

export interface ExpenseDashboardCircleFacetView {
  key: string
  label: string
}

export interface ExpenseDashboardPresentationView {
  presentationKey: string
  presentationState: ExpenseDashboardPresentationState
  title: string | null
  needsAttention: boolean
  totalMinor: number | null
  currency: string | null
  href: string | null
  order: {
    basis: 'visible_updated_at' | 'incurred_on'
    primary: string
    secondary: string
    tieBreaker: string
  }
  personFacets: ExpenseDashboardPersonFacetView[]
  circleFacets: ExpenseDashboardCircleFacetView[]
}

export type ExpenseDashboardPresentationResult =
  | { status: 'ready'; rows: ExpenseDashboardPresentationView[] }
  | { status: 'none' | 'unavailable'; rows: [] }

export type ExpenseDashboardPresentationDiagnostic =
  | {
      classification: 'rpc_error'
      sqlState: string | null
      errorCategory: 'postgres' | 'postgrest' | 'unknown'
    }
  | {
      classification: 'sql_unavailable' | 'invalid_envelope' | 'parser_rejected_ready_payload'
      predicate: string
      contractVersion: 1 | 'other'
      returnedStatus: 'ready' | 'none' | 'unavailable' | 'other'
      rowCount: number | 'not_array' | 'over_limit'
    }

export interface ExpenseDashboardPresentationClassification {
  result: ExpenseDashboardPresentationResult
  diagnostic: ExpenseDashboardPresentationDiagnostic | null
}

const OPAQUE_KEY = /^[0-9a-f]{32}$/
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const APP_ROOT = '/auth-mvp/utlagt-og-endurgreitt'
const PRIVATE_HREFS = [
  new RegExp(`^${APP_ROOT}/nytt\\?draft=${UUID}$`, 'i'),
  new RegExp(`^${APP_ROOT}/hopar/${UUID}/nytt-utgjald\\?draft=${UUID}$`, 'i'),
  new RegExp(`^${APP_ROOT}/utgjold/${UUID}/breyta\\?step=split&draft=${UUID}$`, 'i'),
]
const SHARED_HREF = new RegExp(`^${APP_ROOT}/drog/${UUID}$`, 'i')
const CANONICAL_HREF = new RegExp(`^${APP_ROOT}/utgjold/${UUID}$`, 'i')
const CURRENCY = /^(ISK|EUR|USD|GBP|DKK|NOK|SEK)$/
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/
const EMAIL_SHAPED = /(?:^|\s)[^\s@]+@[^\s@]+\.[^\s@]+(?:$|\s)/

function exactObject(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const source = value as Record<string, unknown>
  const actual = Object.keys(source).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index])
    ? source
    : null
}

function safeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string' || value !== value.trim()) return null
  if (value.length < 1 || value.length > maxLength) return null
  if (UNSAFE_TEXT.test(value) || EMAIL_SHAPED.test(value)) return null
  return value
}

function safeLabel(value: unknown): string | null {
  const label = safeText(value, 120)
  return label && !label.includes('@') ? label : null
}

function validDate(value: string, pattern: RegExp) {
  if (!pattern.test(value)) return false
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return false
  if (pattern === ISO_DATE) return parsed.toISOString().slice(0, 10) === value
  const normalized = value.includes('.') ? value : value.replace('Z', '.000Z')
  return parsed.toISOString() === normalized
}

function parseHref(
  value: unknown,
  state: ExpenseDashboardPresentationState,
): string | null | undefined {
  if (value === null) return null
  if (typeof value !== 'string' || value.length > 512) return undefined
  if (state === 'private_draft') {
    return PRIVATE_HREFS.some((pattern) => pattern.test(value)) ? value : undefined
  }
  if (state === 'shared_draft') {
    return SHARED_HREF.test(value) || PRIVATE_HREFS.some((pattern) => pattern.test(value))
      ? value
      : undefined
  }
  return CANONICAL_HREF.test(value) ? value : undefined
}

type Parsed<T> = { ok: true; value: T } | { ok: false; predicate: string }

function accepted<T>(value: T): Parsed<T> {
  return { ok: true, value }
}

function rejected<T>(predicate: string): Parsed<T> {
  return { ok: false, predicate }
}

function parsePersonFacets(value: unknown): Parsed<ExpenseDashboardPersonFacetView[]> {
  if (!Array.isArray(value) || value.length > 50) return rejected('row.person_facets_shape')
  const seen = new Set<string>()
  const facets: ExpenseDashboardPersonFacetView[] = []
  for (const candidate of value) {
    const source = exactObject(candidate, ['key', 'label', 'kind'])
    const key = source?.key
    const label = safeLabel(source?.label)
    const kind = source?.kind
    if (!source || typeof key !== 'string' || !OPAQUE_KEY.test(key) || !label
      || (kind !== 'durable' && kind !== 'manual') || seen.has(key)) {
      return rejected('row.person_facets_entry')
    }
    seen.add(key)
    facets.push({ key, label, kind })
  }
  return accepted(facets)
}

function parseCircleFacets(value: unknown): Parsed<ExpenseDashboardCircleFacetView[]> {
  if (!Array.isArray(value) || value.length > 1) return rejected('row.circle_facets_shape')
  const facets: ExpenseDashboardCircleFacetView[] = []
  for (const candidate of value) {
    const source = exactObject(candidate, ['key', 'label'])
    const key = source?.key
    const label = safeLabel(source?.label)
    if (!source || typeof key !== 'string' || !OPAQUE_KEY.test(key) || !label) {
      return rejected('row.circle_facets_entry')
    }
    facets.push({ key, label })
  }
  return accepted(facets)
}

function parseRow(value: unknown): Parsed<ExpenseDashboardPresentationView> {
  const legacyKeys = [
    'presentation_key', 'presentation_state', 'title', 'total_minor', 'currency',
    'href', 'order', 'person_facets', 'circle_facets',
  ] as const
  const valueObject = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
  const hasNeedsAttention = valueObject !== null
    && Object.prototype.hasOwnProperty.call(valueObject, 'needs_attention')
  const source = exactObject(value, hasNeedsAttention
    ? [...legacyKeys, 'needs_attention']
    : legacyKeys)
  if (!source) return rejected('row.exact_shape')
  const presentationKey = source.presentation_key
  const presentationState = source.presentation_state
  if (typeof presentationKey !== 'string' || !OPAQUE_KEY.test(presentationKey)) {
    return rejected('row.presentation_key')
  }
  if (!['private_draft', 'shared_draft', 'confirmed', 'settled', 'cancelled']
    .includes(String(presentationState))) return rejected('row.presentation_state')

  const state = presentationState as ExpenseDashboardPresentationState
  const needsAttention = hasNeedsAttention ? source.needs_attention : false
  if (typeof needsAttention !== 'boolean'
    || (needsAttention && state !== 'private_draft')) {
    return rejected('row.needs_attention')
  }
  const title = source.title === null ? null : safeText(source.title, 200)
  const totalMinor = source.total_minor
  const currency = source.currency
  if ((source.title !== null && title === null)
    || (title === null
      && (!hasNeedsAttention || state !== 'private_draft' || !needsAttention))) {
    return rejected('row.title')
  }
  if (!(totalMinor === null || Number.isSafeInteger(totalMinor) && Number(totalMinor) > 0)
    || !(currency === null || typeof currency === 'string' && CURRENCY.test(currency))
    || (totalMinor === null) !== (currency === null)
    || (state !== 'private_draft' && totalMinor === null)) return rejected('row.amount_currency')
  if (hasNeedsAttention && state === 'private_draft'
    && totalMinor === null && !needsAttention) return rejected('row.needs_attention')

  const href = parseHref(source.href, state)
  if (href === undefined) return rejected('row.href')
  const order = exactObject(source.order, ['basis', 'primary', 'secondary', 'tie_breaker'])
  if (!order) return rejected('row.order_shape')
  if (order.tie_breaker !== presentationKey) return rejected('row.order_tie_breaker')
  if ((order.basis !== 'visible_updated_at' && order.basis !== 'incurred_on')
    || typeof order.primary !== 'string' || typeof order.secondary !== 'string'
    || !validDate(order.secondary, ISO_TIMESTAMP)
    || (order.basis === 'visible_updated_at'
      ? !validDate(order.primary, ISO_TIMESTAMP)
      : !validDate(order.primary, ISO_DATE))
    || (state === 'private_draft' || state === 'shared_draft'
      ? order.basis !== 'visible_updated_at'
      : order.basis !== 'incurred_on')) return rejected('row.order_metadata')

  const personFacets = parsePersonFacets(source.person_facets)
  const circleFacets = parseCircleFacets(source.circle_facets)
  if (!personFacets.ok) return personFacets
  if (!circleFacets.ok) return circleFacets
  return accepted({
    presentationKey,
    presentationState: state,
    title,
    needsAttention,
    totalMinor: totalMinor as number | null,
    currency: currency as string | null,
    href,
    order: {
      basis: order.basis,
      primary: order.primary,
      secondary: order.secondary,
      tieBreaker: presentationKey,
    },
    personFacets: personFacets.value,
    circleFacets: circleFacets.value,
  })
}

type SafeEnvelopeMetadata = {
  contractVersion: 1 | 'other'
  returnedStatus: 'ready' | 'none' | 'unavailable' | 'other'
  rowCount: number | 'not_array' | 'over_limit'
}

function safeEnvelopeMetadata(value: unknown): SafeEnvelopeMetadata {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
  const rows = source?.rows
  const status = source?.status
  return {
    contractVersion: source?.contract_version === 1 ? 1 as const : 'other' as const,
    returnedStatus: status === 'ready' || status === 'none' || status === 'unavailable'
      ? status
      : 'other',
    rowCount: !Array.isArray(rows)
      ? 'not_array' as const
      : rows.length > 100
        ? 'over_limit' as const
        : rows.length,
  }
}

function parseExpenseDashboardPresentationsDetailed(value: unknown): {
  result: ExpenseDashboardPresentationResult
  rejection: { classification: 'invalid_envelope' | 'parser_rejected_ready_payload'; predicate: string } | null
} {
  const unavailable = { status: 'unavailable' as const, rows: [] as [] }
  const source = exactObject(value, ['contract_version', 'status', 'rows'])
  if (!source) return { result: unavailable, rejection: { classification: 'invalid_envelope', predicate: 'envelope.exact_shape' } }
  if (source.contract_version !== 1) {
    return { result: unavailable, rejection: { classification: 'invalid_envelope', predicate: 'envelope.contract_version' } }
  }
  if (!Array.isArray(source.rows)) {
    return { result: unavailable, rejection: { classification: 'invalid_envelope', predicate: 'envelope.rows_array' } }
  }
  if (source.rows.length > 100) {
    return { result: unavailable, rejection: { classification: 'invalid_envelope', predicate: 'envelope.row_limit' } }
  }
  if (!['ready', 'none', 'unavailable'].includes(String(source.status))) {
    return { result: unavailable, rejection: { classification: 'invalid_envelope', predicate: 'envelope.status' } }
  }
  if (source.status !== 'ready') {
    return source.rows.length === 0
      ? { result: { status: source.status as 'none' | 'unavailable', rows: [] }, rejection: null }
      : { result: unavailable, rejection: { classification: 'invalid_envelope', predicate: 'envelope.nonready_rows_empty' } }
  }
  if (source.rows.length === 0) {
    return { result: unavailable, rejection: { classification: 'invalid_envelope', predicate: 'envelope.ready_rows_nonempty' } }
  }

  const rows = source.rows.map(parseRow)
  const rejectedRow = rows.find((row) => !row.ok)
  if (rejectedRow && !rejectedRow.ok) {
    return {
      result: unavailable,
      rejection: { classification: 'parser_rejected_ready_payload', predicate: rejectedRow.predicate },
    }
  }
  const parsed = rows.map((row) => (row as { ok: true; value: ExpenseDashboardPresentationView }).value)
  if (new Set(parsed.map((row) => row.presentationKey)).size !== parsed.length) {
    return { result: unavailable, rejection: { classification: 'parser_rejected_ready_payload', predicate: 'rows.presentation_key_unique' } }
  }

  const personLabels = new Map<string, string>()
  const circleLabels = new Map<string, string>()
  for (const row of parsed) {
    for (const facet of row.personFacets) {
      const evidence = `${facet.kind}:${facet.label}`
      const previous = personLabels.get(facet.key)
      if (previous && previous !== evidence) {
        return { result: unavailable, rejection: { classification: 'parser_rejected_ready_payload', predicate: 'rows.person_facet_key_consistent' } }
      }
      personLabels.set(facet.key, evidence)
    }
    for (const facet of row.circleFacets) {
      const previous = circleLabels.get(facet.key)
      if (previous && previous !== facet.label) {
        return { result: unavailable, rejection: { classification: 'parser_rejected_ready_payload', predicate: 'rows.circle_facet_key_consistent' } }
      }
      circleLabels.set(facet.key, facet.label)
    }
  }
  return { result: { status: 'ready', rows: parsed }, rejection: null }
}

function safeSqlState(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) return null
  const code = String(error.code).toUpperCase()
  return /^[A-Z0-9]{5}$/.test(code) ? code : null
}

export function classifyExpenseDashboardPresentationResponse(
  value: unknown,
  error: unknown,
): ExpenseDashboardPresentationClassification {
  const unavailable = { status: 'unavailable' as const, rows: [] as [] }
  if (error) {
    const rawCode = error && typeof error === 'object' && 'code' in error
      ? String(error.code).toUpperCase()
      : ''
    return {
      result: unavailable,
      diagnostic: {
        classification: 'rpc_error',
        sqlState: safeSqlState(error),
        errorCategory: rawCode.startsWith('PGRST')
          ? 'postgrest'
          : /^[A-Z0-9]{5}$/.test(rawCode) ? 'postgres' : 'unknown',
      },
    }
  }

  const parsed = parseExpenseDashboardPresentationsDetailed(value)
  const metadata = safeEnvelopeMetadata(value)
  if (parsed.rejection) {
    return {
      result: parsed.result,
      diagnostic: { ...parsed.rejection, ...metadata },
    }
  }
  if (parsed.result.status === 'unavailable') {
    return {
      result: parsed.result,
      diagnostic: {
        classification: 'sql_unavailable',
        predicate: 'envelope.status_unavailable',
        ...metadata,
      },
    }
  }
  return { result: parsed.result, diagnostic: null }
}

export function formatExpenseDashboardPresentationDiagnostic(
  diagnostic: ExpenseDashboardPresentationDiagnostic,
): string {
  return `[expenses] dashboard presentation diagnostic ${JSON.stringify(diagnostic)}`
}

export function parseExpenseDashboardPresentations(
  value: unknown,
): ExpenseDashboardPresentationResult {
  return parseExpenseDashboardPresentationsDetailed(value).result
}
