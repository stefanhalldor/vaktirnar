import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
const read = (file: string) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
const sql = read('sql/184_receipt_split_v2.sql')
const pre = read('sql/validation/184-receipt-split-v2/preflight.sql')
const post = read('sql/validation/184-receipt-split-v2/postflight.sql')
function body(name: string) {
  const start = sql.indexOf('FUNCTION ' + name + '(')
  const first = sql.indexOf('$fn$', start) + 4
  return sql.slice(first, sql.indexOf('$fn$;', first))
}
describe('SQL184 artifact contracts (static only, not database runtime)', () => {
  it('preserves installed predecessor artifact bytes and guards exact predecessors', () => {
    for (const [file, hash] of [
      ['sql/182_standalone_receipt_splits.sql', '80c3810ed9ca4992f0d18edbdef23c85cc7d25c980044da7b20cbb7c6b037a2c'],
      ['sql/183_receipt_split_add_item.sql', '7d9aa3fc40d3e282bf6bebe549ce2ea15de16f798bb508799d590d1005afb10a'],
    ]) expect(createHash('sha256').update(readFileSync(file)).digest('hex')).toBe(hash)
    expect(sql).toContain(pre.slice(pre.indexOf('WITH predecessor'), pre.lastIndexOf(';')))
    expect(pre).toContain("predecessor.operator_state='EXACT_INSTALLED'")
    expect(pre).toContain('targets_absent')
  })
  it('makes quantity storage version explicit without reinterpreting milli or dropping old checks', () => {
    expect(sql).toContain('CHECK((quantity_milli IS NULL) <> (quantity_units IS NULL))')
    expect(sql).not.toMatch(/DROP (?:CONSTRAINT|TABLE|POLICY|SCHEMA)/)
    expect(body('public.receipt_split_command_v2')).toContain('quantity_units=quantity_milli*3,quantity_milli=NULL')
    expect(body('public.receipt_split_read_v2')).toContain('coalesce(i.quantity_units,i.quantity_milli*3)')
    expect(body('public.receipt_split_read_v2')).not.toContain("'quantityMilli'")
  })
  it('serializes old and new writers request-first then parent; stale v1 fails closed', () => {
    const guard = body('receipt_split.guard_legacy_v1')
    expect(guard.indexOf('pg_advisory_xact_lock')).toBeLessThan(guard.indexOf('FOR UPDATE'))
    expect(guard).toContain("v=2 THEN RAISE EXCEPTION 'split_upgrade_required'")
    expect(guard).toContain('m.user_id=p_actor')
    const command = body('public.receipt_split_command_v2')
    expect(command.indexOf('pg_advisory_xact_lock')).toBeLessThan(command.indexOf('FOR UPDATE'))
    expect(command.indexOf('FOR UPDATE')).toBeLessThan(command.indexOf('IF s.contract_version=1'))
    expect(command).toContain("r.command <> 'v2:' || p_command")
    expect(command).toContain('r.payload_hash <> sha256')
    expect(command).toContain("'receipt_total') AND")
    expect(command).not.toContain("'receipt_total','claim') AND")
    expect(command).toContain('::numeric <> i.item_revision')
  })
  it('preserves claims through edits and enforces owner, quantity and zero-price guards', () => {
    const command = body('public.receipt_split_command_v2')
    const edit = command.slice(command.indexOf("WHEN 'edit_item'"), command.indexOf("WHEN 'add_item'"))
    expect(command).toContain("p_command <> 'claim' AND s.owner_id <> p_actor_id")
    expect(edit).toContain('split_quantity_claimed')
    expect(edit).toContain('split_return_claims_first')
    expect(edit).toContain('item_revision=item_revision+1')
    expect(edit).not.toMatch(/(?:UPDATE|DELETE FROM|INSERT INTO) receipt_split.claims/)
    const add = command.slice(command.indexOf("WHEN 'add_item'"), command.indexOf("WHEN 'delete'"))
    expect(add).not.toContain('SET total_minor')
    const confirm = command.slice(command.indexOf("WHEN 'confirm'"), command.indexOf("WHEN 'rotate_invite'"))
    expect(confirm).not.toContain('<> s.total_minor')
  })
  it('pins every installed function body, forbids new client rights and keeps the schema private', () => {
    for (const match of sql.matchAll(/CREATE (?:OR REPLACE )?FUNCTION ([^(]+)\([^]*?AS \$fn\$([^]*?)\$fn\$;/g)) {
      expect(post).toContain(createHash('md5').update(match[2]).digest('hex'))
    }
    expect(sql).not.toMatch(/GRANT .* TO (?:anon|authenticated|PUBLIC)/)
    expect(post).toContain('tables_private')
    expect(post).toContain('aclexplode')
    expect(post).toContain("'SQL184:v2:'")
    expect(sql).toContain('REVOKE ALL ON FUNCTION receipt_split.command_legacy_v1')
  })
})
