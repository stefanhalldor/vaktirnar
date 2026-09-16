import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(process.cwd(), 'sql/188_receipt_split_owner_list_controls.sql'), 'utf8')

describe('SQL188 owner list controls', () => {
  it('adds actor-derived ownership and version to the list projection', () => {
    expect(sql).toContain("''version'',split_row.version,''isOwner'',split_row.owner_id=p_actor_id")
    expect(sql).toContain('FROM receipt_split.splits split_row JOIN receipt_split.members m ON m.split_id=split_row.id')
  })

  it('preserves service-only execution and fails closed', () => {
    expect(sql).toContain("RAISE EXCEPTION 'SQL188 prerequisite mismatch; stop'")
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.receipt_split_read_v2(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.receipt_split_read_v2(uuid,uuid) TO service_role')
  })
})
