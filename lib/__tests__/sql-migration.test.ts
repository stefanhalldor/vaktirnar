/**
 * Static checks for sql/46_recent_events.sql and sql/47_fix_href_constraint.sql
 *
 * Verifies security properties of the migrations without running SQL.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const sql = readFileSync(
  join(process.cwd(), 'sql/46_recent_events.sql'),
  'utf8'
)

const sql47 = readFileSync(
  join(process.cwd(), 'sql/47_fix_href_constraint.sql'),
  'utf8'
)

describe('sql/46_recent_events.sql — static checks', () => {
  it('creates the recent_events table', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.recent_events/)
  })

  it('enables RLS on the table', () => {
    expect(sql).toMatch(/ALTER TABLE public\.recent_events ENABLE ROW LEVEL SECURITY/)
  })

  it('does not grant access to anon', () => {
    expect(sql).toMatch(/REVOKE ALL.*FROM.*anon|REVOKE ALL.*anon/)
    expect(sql).not.toMatch(/GRANT.*TO anon/)
  })

  it('does not grant access to authenticated', () => {
    expect(sql).toMatch(/REVOKE ALL.*FROM.*authenticated|REVOKE ALL.*authenticated/)
    expect(sql).not.toMatch(/GRANT.*TO authenticated/)
  })

  it('grants narrow access to service_role only', () => {
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON public\.recent_events TO service_role/)
  })

  it('enforces payload as JSON object', () => {
    expect(sql).toMatch(/jsonb_typeof\(payload\)\s*=\s*'object'/)
  })

  it('enforces href must be a local path (weakly — tightened in migration 47)', () => {
    expect(sql).toMatch(/href LIKE '\/%'/)
  })

  it('has UNIQUE constraint on (user_id, event_key)', () => {
    expect(sql).toMatch(/UNIQUE\s*\(user_id,\s*event_key\)/)
  })

  it('has an unread partial index', () => {
    expect(sql).toMatch(/WHERE ack_at IS NULL/)
  })

  it('wraps in a transaction', () => {
    expect(sql).toMatch(/BEGIN/)
    expect(sql).toMatch(/COMMIT/)
  })
})

describe('sql/47_fix_href_constraint.sql — static checks', () => {
  it('drops and re-adds the href constraint', () => {
    expect(sql47).toMatch(/DROP CONSTRAINT IF EXISTS recent_events_href_local/)
    expect(sql47).toMatch(/ADD CONSTRAINT recent_events_href_local/)
  })

  it('rejects protocol-relative URLs', () => {
    expect(sql47).toMatch(/href NOT LIKE '\/\/%'/)
  })

  it('still requires local path prefix', () => {
    expect(sql47).toMatch(/href LIKE '\/%'/)
  })

  it('wraps in a transaction', () => {
    expect(sql47).toMatch(/BEGIN/)
    expect(sql47).toMatch(/COMMIT/)
  })
})
