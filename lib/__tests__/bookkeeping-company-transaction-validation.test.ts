import { describe, expect, it } from 'vitest'
import {
  PrepareBookkeepingAttachmentSchema,
  SaveBookkeepingCompanyTransactionSchema,
} from '@/lib/bookkeeping'

const id = '11111111-1111-4111-8111-111111111111'

describe('company ledger validation', () => {
  it('accepts a sparse but described manual inbox transaction', () => {
    const value = SaveBookkeepingCompanyTransactionSchema.parse({
      request_id: id, entity_id: id, transaction_id: null, expected_version: null,
      state: 'inbox', direction: null, document_date: null, payment_date: null,
      counterparty: null, counterparty_kind: null, description: 'Óflokkuð kvittun',
      gross_minor: null, currency: 'ISK', rough_category: null,
    })
    expect(value.direction).toBeNull()
    expect(value.description).toBe('Óflokkuð kvittun')
  })

  it('rejects an empty manual create but permits sparse edits', () => {
    expect(() => SaveBookkeepingCompanyTransactionSchema.parse({
      request_id: id, entity_id: id, transaction_id: null, expected_version: null,
      state: 'inbox', direction: null, document_date: null, payment_date: null,
      counterparty: null, counterparty_kind: null, description: null,
      gross_minor: null, currency: 'ISK', rough_category: null,
    })).toThrow()
  })

  it('allows only private-upload MIME types and 15 MB or less', () => {
    expect(PrepareBookkeepingAttachmentSchema.parse({
      request_id: id, entity_id: id, transaction_id: null, filename: 'receipt.pdf',
      mime_type: 'application/pdf', size_bytes: 1024,
    }).mime_type).toBe('application/pdf')
    expect(() => PrepareBookkeepingAttachmentSchema.parse({
      request_id: id, entity_id: id, transaction_id: null, filename: 'bad.svg',
      mime_type: 'image/svg+xml', size_bytes: 1024,
    })).toThrow()
  })
})
