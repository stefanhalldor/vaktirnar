import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(join(process.cwd(), 'sql/129_booking_contact_email_owner.sql'), 'utf8')
const preflight = readFileSync(join(process.cwd(), 'sql/validation/129-booking-contact-email-owner/preflight.sql'), 'utf8')
const postflight = readFileSync(join(process.cwd(), 'sql/validation/129-booking-contact-email-owner/postflight.sql'), 'utf8')

describe('SQL129 booking contact email owner', () => {
  it('atomically delegates creation and changes only a newly created signed-in owner', () => {
    expect(migration).toContain('BEGIN;')
    expect(migration).toContain('public.booking_create_request(')
    expect(migration).toContain("COALESCE((v_result ->> 'created')::boolean, false)")
    expect(migration).toContain('SET canonical_email = v_contact_email')
    expect(migration).toContain("member.role = 'owner'")
    expect(migration).toContain("member.status = 'active'")
    expect(migration).toContain('v_updated_count <> 1')
    expect(migration.trimEnd()).toContain('COMMIT;')
  })

  it('does not backfill bookings or change guest capability and RLS contracts', () => {
    expect(migration).not.toMatch(/UPDATE\s+public\.booking_requests/i)
    expect(migration).not.toMatch(/ALTER\s+TABLE/i)
    expect(migration).not.toMatch(/CREATE\s+POLICY|DROP\s+POLICY/i)
    expect(migration).not.toMatch(/UPDATE\s+auth\.users/i)
    expect(migration).toContain('IF p_creator_user_id IS NOT NULL')
  })

  it('keeps the wrapper service-role-only and ships read-only gates', () => {
    expect(migration).toContain("SET search_path = ''")
    expect(migration).toContain('FROM PUBLIC, anon, authenticated')
    expect(migration).toContain('TO service_role')
    expect(preflight).toContain('prerequisites_ok')
    expect(postflight).toContain('exact_execute_acl_ok')
    expect(postflight).toContain('postconditions_ok')
  })
})
