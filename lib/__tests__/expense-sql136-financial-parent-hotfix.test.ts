import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'sql/136_event_financial_parent_integrity_hotfix.sql'),
  'utf8',
)

describe('SQL136 Event financial parent trigger hotfix', () => {
  it('keeps one atomic replacement with private execution and the exact target body', () => {
    expect(sql.match(/^BEGIN;/gm)).toHaveLength(1)
    expect(sql.match(/^COMMIT;/gm)).toHaveLength(1)
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.teskeid_event_financial_parent_integrity_trigger()')
    expect(sql).toContain('FROM PUBLIC, anon, authenticated, service_role')

    const body = sql.match(/AS \$function\$([\s\S]*?)\$function\$;/)?.[1]
    expect(body).toBeDefined()
    const hash = createHash('md5').update(body!.replace(/\r\n/g, '\n')).digest('hex')
    expect(hash).toBe('f78470887e47d3d64fde529a71c7410c')
  })

  it('branches by relation before touching relation-specific record fields', () => {
    expect(sql).toContain("TG_TABLE_NAME = 'expense_groups'")
    expect(sql).toContain('v_group_id := NEW.id;')
    expect(sql).toContain("TG_TABLE_NAME = 'expense_group_members'")
    expect(sql).toContain("TG_TABLE_NAME = 'expenses'")
    expect(sql).toContain('v_group_id := NEW.group_id;')
    expect(sql).not.toMatch(/v_group_id\s*:=\s*CASE/)
  })

  it('pins the three existing deferred trigger bindings before replacement', () => {
    expect(sql).toContain('teskeid_event_expense_groups_integrity_deferred')
    expect(sql).toContain('teskeid_event_expense_members_integrity_deferred')
    expect(sql).toContain('teskeid_event_expenses_integrity_deferred')
    expect(sql).toContain('trigger_row.tgdeferrable')
    expect(sql).toContain('trigger_row.tginitdeferred')
  })
})
