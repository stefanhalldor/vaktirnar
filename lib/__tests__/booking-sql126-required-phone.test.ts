import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(join(process.cwd(), 'sql/126_booking_required_contact_phone.sql'), 'utf8')
const preflight = readFileSync(join(process.cwd(), 'sql/validation/126-booking-required-contact-phone/preflight.sql'), 'utf8')
const postflight = readFileSync(join(process.cwd(), 'sql/validation/126-booking-required-contact-phone/postflight.sql'), 'utf8')

describe('SQL126 required booking phone', () => {
  it('guards new inserts without rewriting historical booking rows', () => {
    expect(migration).toContain('BEGIN;')
    expect(migration).toContain('BEFORE INSERT ON public.booking_requests')
    expect(migration).toContain('NEW.contact_phone IS NULL')
    expect(migration).not.toMatch(/UPDATE\s+public\.booking_requests/i)
    expect(migration).not.toMatch(/ALTER\s+TABLE[\s\S]*contact_phone\s+SET\s+NOT\s+NULL/i)
    expect(migration.trimEnd().endsWith('COMMIT;')).toBe(true)
  })

  it('keeps the trigger function private and ships read-only gates', () => {
    expect(migration).toContain('SET search_path = \'\'')
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.booking_require_contact_phone() FROM PUBLIC, anon, authenticated, service_role')
    expect(preflight).toContain('prerequisites_ok')
    expect(postflight).toContain('no_direct_execute_ok')
    expect(postflight).toContain('postconditions_ok')
  })
})
