import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(join(process.cwd(), 'sql/106_expense_context_chat.sql'), 'utf8')
const preflight = readFileSync(join(
  process.cwd(),
  'sql/validation/106-expense-context-chat/preflight.sql',
), 'utf8')
const postflight = readFileSync(join(
  process.cwd(),
  'sql/validation/106-expense-context-chat/postflight.sql',
), 'utf8')

function withoutLineComments(sql: string): string {
  return sql.replace(/--.*$/gm, '')
}

describe('SQL106 reusable expense context chat', () => {
  it('extends the generic chat core with a closed weather/expense scope and retry fences', () => {
    expect(migration).toContain('BEGIN;')
    expect(migration).toContain('COMMIT;')
    expect(migration).toContain("domain = 'weather'")
    expect(migration).toContain("target_type IN ('vedurstofan_station', 'vegagerdin_station')")
    expect(migration).toContain("domain = 'expenses'")
    expect(migration).toContain("target_type = 'expense_item'")
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS client_message_id uuid')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS idempotency_key uuid')
    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS teskeid_chat_messages_client_message_unique_idx')
    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS teskeid_chat_messages_idempotency_unique_idx')
    expect(migration).toContain('ADD CONSTRAINT teskeid_chat_threads_scope_check')
    expect(migration).toContain('NOT VALID')
    expect(migration).toContain('VALIDATE CONSTRAINT teskeid_chat_threads_scope_check')
  })

  it('does not weaken grants, policies or row-level security', () => {
    const executable = withoutLineComments(migration)
    expect(executable).not.toMatch(/\b(?:GRANT|REVOKE)\b/i)
    expect(executable).not.toMatch(/\b(?:CREATE|DROP)\s+POLICY\b/i)
    expect(executable).not.toMatch(/DISABLE\s+ROW\s+LEVEL\s+SECURITY/i)
  })

  it('keeps preflight and postflight read-only and checks default-deny boundaries', () => {
    for (const validation of [preflight, postflight]) {
      const executable = withoutLineComments(validation).replace(/'(?:''|[^'])*'/g, "''")
      expect(executable).not.toMatch(/\bAS\s+constraint\b/i)
      expect(executable).not.toMatch(
        /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE|TRUNCATE)\b/i,
      )
      expect(validation).toContain("grantee IN ('anon', 'authenticated')")
      expect(validation).toContain('transactions_older_than_five_minutes')
    }
    expect(postflight).toContain('browser_policies')
    expect(postflight).toContain('client_message_id_violations')
    expect(postflight).toContain('idempotency_key_violations')
  })
})
