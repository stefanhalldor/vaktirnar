import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql133 = readFileSync(join(process.cwd(), 'sql/133_event_guest_identity_linking.sql'), 'utf8')
const sql134 = readFileSync(join(process.cwd(), 'sql/134_event_home_invitation_feed.sql'), 'utf8')
const migration = readFileSync(join(process.cwd(), 'sql/147_event_in_app_invitation_authority.sql'), 'utf8')
const validationRoot = join(process.cwd(), 'sql/validation/147-event-in-app-invitation-authority')
const preflight = readFileSync(join(validationRoot, 'preflight.sql'), 'utf8')
const postflight = readFileSync(join(validationRoot, 'postflight.sql'), 'utf8')
const recovery = readFileSync(join(validationRoot, 'recovery.sql'), 'utf8')

function functionBody(source: string, name: string): string {
  const marker = `CREATE FUNCTION public.${name}(`
  const start = source.indexOf(marker)
  expect(start).toBeGreaterThanOrEqual(0)
  const bodyStart = source.indexOf('AS $function$', start) + 'AS $function$'.length
  const bodyEnd = source.indexOf('$function$;', bodyStart)
  expect(bodyStart).toBeGreaterThan('AS $function$'.length - 1)
  expect(bodyEnd).toBeGreaterThan(bodyStart)
  return source.slice(bodyStart, bodyEnd).replaceAll('\r\n', '\n')
}

function md5(value: string): string {
  return createHash('md5').update(value, 'utf8').digest('hex')
}

function replaceExpected(source: string, needle: string, replacement: string, count: number): string {
  expect(source.split(needle)).toHaveLength(count + 1)
  return source.replaceAll(needle, replacement)
}

function rewriteListActor(source: string): string {
  return replaceExpected(source, '\n          AND candidate.attempt_number > 0', '', 1)
}

function rewritePreview(source: string): string {
  return replaceExpected(source, '\n    AND invitation.attempt_number > 0', '', 1)
}

function rewriteUnreadFeed(source: string): string {
  return replaceExpected(source, '\n      AND candidate.attempt_number > 0', '', 1)
}

function rewriteResponse(source: string): string {
  let result = replaceExpected(source, '\n    AND invitation.attempt_number > 0', '', 2)
  result = replaceExpected(result, '\n      AND invitation.attempt_number > 0', '', 1)
  result = replaceExpected(
    result,
    '     OR v_probe_owner_user_id IS NULL\n     OR v_probe_actor_recipient_rate_hash IS NULL THEN',
    '     OR v_probe_owner_user_id IS NULL THEN',
    1,
  )
  result = replaceExpected(
    result,
    '      AND invitation.actor_recipient_rate_hash =\n        v_probe_actor_recipient_rate_hash',
    '      AND invitation.actor_recipient_rate_hash IS NOT DISTINCT FROM\n        v_probe_actor_recipient_rate_hash',
    1,
  )
  return replaceExpected(
    result,
    "  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(\n    'teskeid:event-attendance:actor-recipient-cooldown:'\n      || v_probe_actor_recipient_rate_hash,\n    13305\n  ));",
    "  IF v_probe_actor_recipient_rate_hash IS NOT NULL THEN\n    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(\n      'teskeid:event-attendance:actor-recipient-cooldown:'\n        || v_probe_actor_recipient_rate_hash,\n      13305\n    ));\n  END IF;",
    1,
  )
}

function rewriteResponseWithSql147Regex(source: string): string {
  let result = source.replaceAll('\n    AND invitation.attempt_number > 0', '')
  result = result.replaceAll('\n      AND invitation.attempt_number > 0', '')
  result = result.replace(
    /OR\s+v_probe_owner_user_id\s+IS\s+NULL\s+OR\s+v_probe_actor_recipient_rate_hash\s+IS\s+NULL\s+THEN/,
    'OR v_probe_owner_user_id IS NULL THEN',
  )
  result = result.replace(
    /invitation[.]actor_recipient_rate_hash\s*=\s*v_probe_actor_recipient_rate_hash/,
    'invitation.actor_recipient_rate_hash IS NOT DISTINCT FROM\n        v_probe_actor_recipient_rate_hash',
  )
  result = result.replace(
    /PERFORM\s+pg_catalog[.]pg_advisory_xact_lock[(]pg_catalog[.]hashtextextended[(]\s*'teskeid:event-attendance:actor-recipient-cooldown:'\s*[|][|]\s*v_probe_actor_recipient_rate_hash,\s*13305\s*[)][)][;]/,
    "IF v_probe_actor_recipient_rate_hash IS NOT NULL THEN\n    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(\n      'teskeid:event-attendance:actor-recipient-cooldown:'\n        || v_probe_actor_recipient_rate_hash,\n      13305\n    ));\n  END IF;",
  )
  return result
}

function recoverResponseWithSql147Regex(source: string): string {
  let result = source.replaceAll(
    '\n    AND invitation.recipient_email_canonical = v_actor_email',
    '\n    AND invitation.attempt_number > 0\n    AND invitation.recipient_email_canonical = v_actor_email',
  )
  result = result.replaceAll(
    '\n      AND invitation.recipient_email_canonical = v_actor_email',
    '\n      AND invitation.attempt_number > 0\n      AND invitation.recipient_email_canonical = v_actor_email',
  )
  result = result.replace(
    /OR\s+v_probe_owner_user_id\s+IS\s+NULL\s+THEN/,
    'OR v_probe_owner_user_id IS NULL\n     OR v_probe_actor_recipient_rate_hash IS NULL THEN',
  )
  result = result.replace(
    /invitation[.]actor_recipient_rate_hash\s+IS\s+NOT\s+DISTINCT\s+FROM\s+v_probe_actor_recipient_rate_hash/,
    'invitation.actor_recipient_rate_hash =\n        v_probe_actor_recipient_rate_hash',
  )
  return result.replace(
    /IF\s+v_probe_actor_recipient_rate_hash\s+IS\s+NOT\s+NULL\s+THEN\s+PERFORM\s+pg_catalog[.]pg_advisory_xact_lock[(]pg_catalog[.]hashtextextended[(]\s*'teskeid:event-attendance:actor-recipient-cooldown:'\s*[|][|]\s*v_probe_actor_recipient_rate_hash,\s*13305\s*[)][)][;]\s+END\s+IF[;]/,
    "PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(\n    'teskeid:event-attendance:actor-recipient-cooldown:'\n      || v_probe_actor_recipient_rate_hash,\n    13305\n  ));",
  )
}

describe('SQL147 in-app Event invitation authority', () => {
  it('rewrites only the frozen SQL133/134 targets to exact reviewed bodies', () => {
    const targets = [
      [functionBody(sql133, 'teskeid_event_list_for_actor'), rewriteListActor, 'b932c0d12fdb09e4ea184ead2607e4ff', '4ccf01e6251a7e7ee187fcba21a88c36'],
      [functionBody(sql133, 'teskeid_event_get_guest_attendance_preview'), rewritePreview, '347c46a906dd1e1ce57807e2b399e80d', 'e268003d1f916f6a987e8d47dbef5971'],
      [functionBody(sql133, 'teskeid_event_respond_guest_attendance'), rewriteResponse, '6a9c34c368384415aa0a8ac4545b8f07', '45bab121e346e77fa4a4035b7cf88f16'],
      [functionBody(sql134, 'teskeid_event_list_my_pending_invitations'), rewriteUnreadFeed, '9b7a49a9f84649656045e6a2120e2f43', '295ca440e9caa334986f664ce2bc7398'],
    ] as const

    for (const [before, rewrite, beforeHash, afterHash] of targets) {
      expect(md5(before)).toBe(beforeHash)
      expect(md5(rewrite(before))).toBe(afterHash)
      expect(migration).toContain(beforeHash)
      expect(migration).toContain(afterHash)
      expect(recovery).toContain(beforeHash)
      expect(recovery).toContain(afterHash)
    }
  })

  it('keeps confirmed exact-email and active-guest authorization in every projection', () => {
    for (const body of [
      rewriteListActor(functionBody(sql133, 'teskeid_event_list_for_actor')),
      rewritePreview(functionBody(sql133, 'teskeid_event_get_guest_attendance_preview')),
      rewriteResponse(functionBody(sql133, 'teskeid_event_respond_guest_attendance')),
      rewriteUnreadFeed(functionBody(sql134, 'teskeid_event_list_my_pending_invitations')),
    ]) {
      expect(body).toContain('recipient_email_canonical = v_actor_email')
      expect(body).toContain("status = 'pending'")
      expect(body).toMatch(/(?:candidate_guest|guest|probe_guest)\.status = 'active'|v_guest\.status/)
    }
  })

  it('applies the whitespace-tolerant response rewrite to the exact reviewed body', () => {
    const before = functionBody(sql133, 'teskeid_event_respond_guest_attendance')
    const after = rewriteResponseWithSql147Regex(before)
    expect(after).toBe(rewriteResponse(before))
    expect(recoverResponseWithSql147Regex(after)).toBe(before)

    const crlfBefore = before.replaceAll('\n', '\r\n')
    expect(rewriteResponseWithSql147Regex(crlfBefore)).not.toBe(after)
    expect(rewriteResponseWithSql147Regex(crlfBefore.replaceAll('\r\n', '\n'))).toBe(after)
  })

  it('changes function bodies only and ships read-only validation', () => {
    expect(migration).not.toMatch(/\b(?:ALTER TABLE|UPDATE|INSERT INTO|DELETE FROM|GRANT|REVOKE)\b/)
    expect(migration).toContain('pg_get_function_arguments')
    expect(migration).toContain('AS %L')
    expect(migration).toContain('-- SQL147_EVENT_IN_APP_INVITATION_AUTHORITY')
    expect(migration).toContain('sql147_applied_shape_mismatch')
    expect(migration).toContain("v_source := pg_catalog.replace(v_source, E'\\r\\n', E'\\n')")
    expect(migration).toContain('sql147_exact_body_mismatch')
    expect(migration).not.toContain('pg_get_functiondef')
    expect(recovery).toContain('pg_get_function_arguments')
    expect(recovery).toContain('AS %L')
    expect(recovery).not.toContain('pg_get_functiondef')
    expect(recovery).not.toContain('v_definition')
    expect(preflight).toContain('SET TRANSACTION READ ONLY')
    expect(postflight).toContain('SET TRANSACTION READ ONLY')
    expect(`${preflight}\n${postflight}`).not.toContain('pg_catalog.current_user')
    expect(postflight).toContain('visibility_email_independent_ok')
    expect(postflight).toContain('projection_identity_guards_ok')
    expect(postflight).toContain('response_email_independent_ok')
    expect(postflight).toContain('function_sources_exact_ok')
  })
})
