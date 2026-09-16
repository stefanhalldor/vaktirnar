import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
const sql = readFileSync('sql/183_receipt_split_add_item.sql', 'utf8')
const pre = readFileSync('sql/validation/183-receipt-split-add-item/preflight.sql', 'utf8')
const post = readFileSync('sql/validation/183-receipt-split-add-item/postflight.sql', 'utf8')
describe('SQL183 static boundaries; not database runtime', () => {
  it('leaves the installed SQL182 artifact immutable and requires its seal', () => {
    expect(createHash('sha256').update(readFileSync('sql/182_standalone_receipt_splits.sql')).digest('hex'))
      .toBe('80c3810ed9ca4992f0d18edbdef23c85cc7d25c980044da7b20cbb7c6b037a2c')
    expect(pre).toContain('seal_ok AND functions_ok AND tables_ok')
    expect(sql).toContain(pre.slice(pre.indexOf('WITH entries'), pre.lastIndexOf(';')))
    expect(sql).not.toContain('CREATE OR REPLACE')
  })
  it('preserves existing items, claims and access policies', () => {
    expect(sql).not.toMatch(/(?:UPDATE|DELETE FROM) receipt_split\.(?:claims|items)/)
    expect(sql).not.toMatch(/(?:CREATE|ALTER|DROP) (?:TABLE|POLICY)/)
    expect(sql).toContain('owner_id=p_actor_id FOR UPDATE')
    expect(sql).toContain("s.state <> 'sharing'")
    expect(sql).toContain('pg_advisory_xact_lock')
    expect(sql).toContain('r.payload_hash <> sha256')
    expect(sql).toContain('total_minor=total_minor+amount')
    expect(sql).toContain('next_ordinal > 100')
    expect(sql).toContain('s.total_minor::numeric + amount > 9007199254740991')
  })
  it('pins the new body and exact service-only grants in postflight', () => {
    const body = sql.split('AS $fn$')[1].split('$fn$;')[0]
    expect(post).toContain(createHash('md5').update(body).digest('hex'))
    expect(post).toContain('aclexplode')
    expect(sql).toContain('FROM PUBLIC,anon,authenticated,service_role')
    expect(sql).toContain('TO service_role')
  })
})
