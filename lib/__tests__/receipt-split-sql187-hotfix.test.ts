import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const migration = readFileSync(join(root, 'sql/187_receipt_split_read_v2_list_alias_hotfix.sql'), 'utf8')
const replacement = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION'), migration.indexOf('ALTER FUNCTION'))

describe('SQL187 receipt split list alias hotfix', () => {
  it('replaces the ambiguous table alias while preserving the v2 projection', () => {
    expect(replacement).toContain('FROM receipt_split.splits split_row JOIN receipt_split.members m ON m.split_id=split_row.id')
    expect(replacement).not.toContain('FROM receipt_split.splits s JOIN receipt_split.members m ON m.split_id=s.id')
    expect(replacement).toContain("'dismissedItemIds'")
    expect(replacement).toContain("'incurredOn'")
  })

  it('keeps the function service-only and fail-closed on the exact predecessor', () => {
    expect(migration).toContain("RAISE EXCEPTION 'SQL187 prerequisite mismatch; stop'")
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.receipt_split_read_v2(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role')
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.receipt_split_read_v2(uuid,uuid) TO service_role')
  })
})
