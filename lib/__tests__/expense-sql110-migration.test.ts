import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(join(process.cwd(), 'sql/110_expense_unified_participant_invitations.sql'), 'utf8')
const preflight = readFileSync(join(process.cwd(), 'sql/validation/110-expense-unified-participants/preflight.sql'), 'utf8')
const postflight = readFileSync(join(process.cwd(), 'sql/validation/110-expense-unified-participants/postflight.sql'), 'utf8')

describe('SQL110 unified participant invitations', () => {
  it('keeps the migration transactional and the validation scripts read-only', () => {
    expect(migration).toMatch(/^--[\s\S]*\nBEGIN;/)
    expect(migration.trimEnd()).toMatch(/COMMIT;$/)
    for (const probe of [preflight, postflight]) {
      expect(probe).not.toMatch(/\b(?:insert|update|delete|alter|create|drop|grant|revoke|truncate)\b\s/i)
      expect(probe.match(/\bSELECT\b/gi)?.length).toBeGreaterThan(0)
    }
  })

  it('uses exact-email scoped consent without granting the browser or feature access', () => {
    expect(migration).toContain('expense_get_scoped_member_invitation')
    expect(migration).toContain('expense_respond_scoped_member_invitation')
    expect(migration).toContain('invitation.id = p_invitation_id')
    expect(migration).toContain('invitation.recipient_email_canonical = public.normalize_email_canonical(account.email)')
    expect(migration).not.toMatch(/INSERT INTO public\.feature_access/i)
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION[\s\S]+FROM PUBLIC,anon,authenticated/)
  })

  it('links identity on the same member and never rewrites financial rows', () => {
    expect(migration).toMatch(/UPDATE public\.expense_group_members SET user_id=p_actor_id/)
    expect(migration).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM) public\.expense_(?:shares|payments|obligations)/i)
    expect(migration).toContain("participant_source IN ('guest_link', 'manual_email', 'relationship')")
    expect(migration).toContain("email_template_version IN ('v1', 'v2')")
  })
})
