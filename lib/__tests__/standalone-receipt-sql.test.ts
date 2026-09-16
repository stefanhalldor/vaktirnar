import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
const sql = readFileSync('sql/182_standalone_receipt_splits.sql', 'utf8')
const postflight = readFileSync('sql/validation/182-standalone-receipt-splits/postflight.sql', 'utf8')
describe('SQL182 static release boundaries (not SQL runtime)', () => {
  it('keeps the financial domain out of the new schema and RPC', () => {
    expect(sql).not.toMatch(/public\.expense/)
    expect(sql).not.toMatch(/expense_assert_beta_actor/)
    expect(sql).toContain("PERFORM receipt_split.assert_actor(p_actor_id)")
    expect(sql).toContain("REVOKE ALL ON SCHEMA receipt_split FROM PUBLIC, anon, authenticated, service_role")
    expect(sql.match(/FORCE ROW LEVEL SECURITY/g)).toHaveLength(5)
  })
  it('pins each reviewed routine body in postflight', () => {
    const functions = [...sql.matchAll(/CREATE FUNCTION ([\w.]+)\([^]*?AS \$fn\$([^]*?)\$fn\$;/g)]
    expect(functions).toHaveLength(4)
    for (const [, , body] of functions) {
      expect(postflight).toContain(createHash('md5').update(body.replaceAll('\r\n', '\n')).digest('hex'))
    }
  })
  it('serializes a receipt before checking quantities and uses session-derived membership', () => {
    expect(sql.indexOf("FOR UPDATE;\n    IF NOT FOUND THEN RAISE EXCEPTION 'split_not_found'; END IF;\n    SELECT token INTO member"))
      .toBeGreaterThan(0)
    expect(sql).toContain('used-mine+qty > i.quantity_milli')
    expect(sql).toContain("(p_payload->>'previous')::bigint <> mine")
    expect(sql).toContain('WHERE split_id = s.id AND user_id = p_actor_id')
    expect(sql).not.toContain("p_payload->>'memberToken'")
  })
  it('uses hashes for replay payloads and preserves resumable deletion', () => {
    expect(sql).toContain('payload_hash bytea NOT NULL')
    expect(sql).toContain("state='deleting'")
    expect(sql).toContain("WHEN 'complete_delete'")
    expect(sql).toContain('DELETE FROM receipt_split.claims')
    expect(sql).toContain('DELETE FROM receipt_split.items')
    expect(sql).toContain('DELETE FROM receipt_split.members')
  })
  it('protects the private bucket even if another storage policy is broad', () => {
    expect(sql).toContain('ON storage.objects AS RESTRICTIVE')
    expect(sql).toContain("USING (bucket_id <> 'bill-split-receipts')")
    expect(sql).toContain("WITH CHECK (bucket_id <> 'bill-split-receipts')")
    expect(sql).toContain("'bill-split-receipts',false,10485760")
  })
  it('uses the same catalog seal for apply and postflight', () => {
    const from = 'WITH entries AS ('
    const to = '), digest AS ('
    const extract = (text: string) => text.slice(text.indexOf(from), text.indexOf(to))
    expect(extract(sql)).toBe(extract(postflight))
  })
})
