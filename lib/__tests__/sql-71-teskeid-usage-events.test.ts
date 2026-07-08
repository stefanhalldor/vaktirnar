/**
 * Static checks for sql/71_teskeid_usage_events.sql
 *
 * Verifies security properties of the migration without running SQL.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const sql = readFileSync(
  join(process.cwd(), 'sql/71_teskeid_usage_events.sql'),
  'utf8',
)

describe('sql/71_teskeid_usage_events.sql — static checks', () => {
  it('creates the teskeid_usage_events table', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.teskeid_usage_events/)
  })

  it('enables RLS on the table', () => {
    expect(sql).toMatch(/ALTER TABLE public\.teskeid_usage_events ENABLE ROW LEVEL SECURITY/)
  })

  it('revokes access from anon', () => {
    expect(sql).toMatch(/REVOKE ALL ON public\.teskeid_usage_events FROM PUBLIC, anon, authenticated/)
  })

  it('does not grant access to anon', () => {
    expect(sql).not.toMatch(/GRANT.*TO anon/)
  })

  it('does not grant access to authenticated', () => {
    expect(sql).not.toMatch(/GRANT.*TO authenticated/)
  })

  it('grants only SELECT and INSERT to service_role', () => {
    expect(sql).toMatch(/GRANT SELECT, INSERT ON public\.teskeid_usage_events TO service_role/)
  })

  it('enforces metadata as a JSONB object', () => {
    expect(sql).toMatch(/jsonb_typeof\(metadata\)\s*=\s*'object'/)
  })

  it('is wrapped in a transaction', () => {
    expect(sql).toMatch(/^\s*BEGIN\s*;/m)
    expect(sql).toMatch(/^\s*COMMIT\s*;/m)
  })
})
