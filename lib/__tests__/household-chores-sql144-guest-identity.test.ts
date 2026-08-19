import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const migration = readFileSync(
  join(root, 'sql/144_household_chore_guest_identity.sql'),
  'utf8',
).replace(/\r\n/g, '\n')
const validators = [
  'sql/validation/144-household-chore-guest-identity/preflight.sql',
  'sql/validation/144-household-chore-guest-identity/postflight.sql',
].map((path) => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n'))

describe('SQL144 guest identity contract', () => {
  it('is atomic and preserves the existing participant id on accepted links', () => {
    expect(migration.match(/^BEGIN;$/gm)).toHaveLength(1)
    expect(migration.match(/^COMMIT;$/gm)).toHaveLength(1)
    expect(migration.trimEnd()).toMatch(/COMMIT;$/)
    expect(migration).toContain('target_participant_id uuid NULL')
    expect(migration).toContain('household_chore_invitations_pending_target_idx')
    expect(migration).toContain('v_invitation.target_participant_id IS NOT NULL')
    expect(migration).toContain('participant_id, initial_type, membership_type')
    expect(migration).toContain('v_participant.id')
  })

  it('keeps email resolution server-side and requires exact feature access', () => {
    expect(migration).toContain("access_row.feature_key = 'heimilisverkin'")
    expect(migration).toContain('public.normalize_email_canonical(account.email) = v_email')
    expect(migration).toContain('public.household_chore_private_lock_user')
    expect(migration).not.toMatch(/INSERT INTO public\.household_chore_invitations[\s\S]{0,300}recipient_email/)
  })

  it('limits callable functions to service_role and guards pending links from archive', () => {
    expect(migration).toContain('FROM PUBLIC, anon, authenticated')
    expect(migration).toContain('TO service_role')
    expect(migration).toContain('household_chore_participant_pending_link_guard')
    expect(migration).toContain("invitation_row.status = 'pending'")
  })

  it('ships bounded read-only preflight and postflight checks', () => {
    for (const validator of validators) {
      expect(validator.match(/^BEGIN;$/gm)).toHaveLength(1)
      expect(validator.match(/^SET TRANSACTION READ ONLY;$/gm)).toHaveLength(1)
      expect(validator.match(/^ROLLBACK;$/gm)).toHaveLength(1)
      expect(validator).not.toMatch(
        /^\s*(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|TRUNCATE|CALL)\b/im,
      )
    }
    expect(validators[0]).toContain('AS prerequisites_ok')
    expect(validators[1]).toContain('AS postconditions_ok')
  })
})
