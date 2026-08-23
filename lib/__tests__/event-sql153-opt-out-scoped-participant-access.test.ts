import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const migration = readFileSync(
  join(root, 'sql/153_event_opt_out_scoped_participant_access.sql'),
  'utf8',
)
const validationRoot = join(
  root,
  'sql/validation/153-event-opt-out-scoped-participant-access',
)
const preflight = readFileSync(join(validationRoot, 'preflight.sql'), 'utf8')
const postflight = readFileSync(join(validationRoot, 'postflight.sql'), 'utf8')
const recovery = readFileSync(join(validationRoot, 'recovery.sql'), 'utf8')
const readme = readFileSync(join(validationRoot, 'README.md'), 'utf8')

const sha256 = (value: string) =>
  createHash('sha256').update(value, 'utf8').digest('hex').toUpperCase()
const md5 = (value: string) =>
  createHash('md5').update(value, 'utf8').digest('hex')

function functionBody(source: string, name: string): string {
  const create = `CREATE FUNCTION public.${name}(`
  const replace = `CREATE OR REPLACE FUNCTION public.${name}(`
  const start = Math.max(source.indexOf(create), source.indexOf(replace))
  expect(start, name).toBeGreaterThanOrEqual(0)
  const marker = 'AS $function$'
  const bodyStart = source.indexOf(marker, start) + marker.length
  const bodyEnd = source.indexOf('$function$;', bodyStart)
  expect(bodyStart, name).toBeGreaterThan(marker.length - 1)
  expect(bodyEnd, name).toBeGreaterThan(bodyStart)
  return source.slice(bodyStart, bodyEnd).replaceAll('\r\n', '\n')
}

describe('SQL153 focused opt-out scoped-participant safety contract', () => {
  it('freezes the reviewed package and the byte-exact SQL149-SQL152 boundary', () => {
    expect(sha256(migration)).toBe(
      '74A3CD263DF9374470AC28E13CE018D78C701F94417F7E01F4F7CC4E3B07B7CA',
    )
    expect(sha256(preflight)).toBe(
      '66D8FB5B1B89714989965C1DB50B651FF8A19C9923F1068E154634222062B966',
    )
    expect(sha256(postflight)).toBe(
      '97DBBF75AABA0CE19A567567ABFC8DCFC5775268B897F8BD82744FB6C514408F',
    )
    expect(sha256(recovery)).toBe(
      'D241A8FC481A2C4ED04ED2CFF2ABAD64FBF91280DD282B28AD7119822B67688A',
    )
    expect(sha256(readme)).toBe(
      '6F34BFB5BB0EBFFCC7F5D469DC0474FAA15EFAFCC9E88E4943256C1A7EF9A039',
    )

    const protectedMigrations = [
      ['149_event_participant_identity_display.sql', '2FD5F001038A3ECB24133C5C424FE5EDA02850603EE54AAF283B5B8287AEEF39'],
      ['150_event_actor_view_time_format_hotfix.sql', 'DEDF918D0373A11B743E80CE1962AEF14B1A05C1C284B16D4420543AC8A4F550'],
      ['151_event_viewer_relationship_greatest_hotfix.sql', 'E9CB15930B07296C245389E90CE68330EAAA0B0F7B8EDBE92D072F1DD323B174'],
      ['152_event_people_is_self_boolean_hotfix.sql', 'C437BED4904604BB659D7A3E0A59B99DE21C054459CE27DC3BF527652B381504'],
    ] as const
    for (const [file, expected] of protectedMigrations) {
      expect(sha256(readFileSync(join(root, 'sql', file), 'utf8')), file)
        .toBe(expected)
    }

    const names = [...migration.matchAll(
      /^CREATE (?:OR REPLACE )?FUNCTION public\.([a-zA-Z0-9_]+)\(/gm,
    )].map((match) => match[1])
    expect(names).toHaveLength(23)
    expect(new Set(names).size).toBe(23)
    for (const name of names) {
      const hash = md5(functionBody(migration, name))
      for (const source of [migration, postflight, recovery]) {
        expect(source, `${name}:${hash}`).toContain(`'${hash}'`)
      }
    }
    expect(md5(functionBody(migration, 'teskeid_event_set_rsvp_v2'))).toBe(
      '0eae77a1f1f9ef59049cd580694d3e41',
    )
    for (const source of [migration, preflight, recovery]) {
      expect(source).toContain('0b161601a4b91a521c42288b8279ff83')
    }

    for (const source of [migration, preflight, postflight, recovery]) {
      expect(source).toContain('7b69311a107381a1891da01c32780f5f')
      expect(source).not.toContain('f4496acf63af226f072fc24e397d57b8')
      expect(source).toContain(
        "expected.constraint_type<>'c' OR NOT constraint_row.connoinherit",
      )
    }
    expect(migration).not.toContain(
      '<> CASE WHEN v_expected.service_execute THEN 2 ELSE 1 END',
    )
    expect(migration.match(/1 \+ v_expected\.service_execute::integer/g))
      .toHaveLength(2)
    for (const source of [migration, postflight, recovery]) {
      expect(source).toContain(
        'andnotprivate_noteisdistinctfromteskeid_event_private_normalize_note_v3private_note',
      )
      expect(source).not.toContain(
        'andprivate_noteisnotdistinctfromteskeid_event_private_normalize_note_v3private_note',
      )
    }
    expect(recovery).not.toContain('(\\\\[\\\\])?')
    for (const source of [migration, preflight, postflight, recovery]) {
      const inventoryScopes = [...source.matchAll(/tgname LIKE '%sql153%'/g)]
      expect(inventoryScopes.length).toBeGreaterThan(0)
      for (const scope of inventoryScopes) {
        const inventory = source.slice(scope.index, scope.index + 320)
        expect(inventory).toContain(
          'teskeid_event_participation_requests_v3_guard',
        )
        expect(inventory).toContain('teskeid_event_rsvp_v3_integrity_deferred')
      }
    }
    for (const source of [preflight, postflight, recovery]) {
      expect(source).toContain('02b4f758f3cd967c63bfbb2389a89d68')
      expect(source).not.toContain('72d1d2c6a8f822e58d40cceb25894676')
    }
  })

  it('is transactional and keeps tables private behind exact service RPCs', () => {
    expect(migration.match(/^BEGIN;$/gm)).toHaveLength(1)
    expect(migration.match(/^COMMIT;$/gm)).toHaveLength(1)
    expect(migration.match(/^CREATE TABLE public\./gm)).toHaveLength(4)
    expect(migration.match(/ENABLE ROW LEVEL SECURITY/g)).toHaveLength(4)
    expect(migration.match(/FORCE ROW LEVEL SECURITY/g)).toHaveLength(4)
    expect(migration.match(/^CREATE (?:CONSTRAINT )?TRIGGER /gm)).toHaveLength(6)
    expect(migration.match(/^CREATE OR REPLACE FUNCTION public\./gm))
      .toHaveLength(1)
    expect(migration).not.toMatch(/^DROP\b/gm)
    expect(migration).not.toMatch(/\bDROP[^;]*\bCASCADE\b/i)
    expect(migration).not.toContain('CREATE POLICY')
    expect(migration).not.toContain('DISABLE ROW LEVEL SECURITY')
    expect(migration).not.toMatch(/\bexpense_/i)
    expect(migration).not.toMatch(/\bfeature_access\b/i)
    expect(migration).toContain(
      'FROM PUBLIC, anon, authenticated, service_role;',
    )
    expect(migration).toContain('TO service_role;')
    expect(migration).not.toMatch(/\bTO (?:anon|authenticated)\b/)

    for (const source of [preflight, postflight]) {
      expect(source.match(/^BEGIN;$/gm)).toHaveLength(1)
      expect(source).toContain('SET TRANSACTION READ ONLY;')
      expect(source.match(/^ROLLBACK;$/gm)).toHaveLength(1)
      expect(source).not.toMatch(
        /^(?:CREATE|ALTER|DROP|GRANT|REVOKE|INSERT|UPDATE|DELETE|TRUNCATE)\b/gm,
      )
    }
    expect(preflight).toContain('protected_caller_helper_closure_exact_ok')
    expect(preflight).toContain('protected_caller_helper_mismatches')
    expect(preflight).toContain('membership_constraints_exact_ok')
    expect(preflight).toContain('sql149_constraints_exact_ok')
    expect(preflight).toContain('sql149_check_definitions_exact_ok')
    expect(preflight).toContain('legacy_authority_constraints_exact_ok')
    expect(preflight).toContain('source_constraints_exact_ok')
    expect(preflight).toContain('AS prerequisites_ok')
    expect(postflight).toContain('functions_exact_ok')
    expect(postflight).toContain('constraints_exact_ok')
    expect(postflight).toContain('triggers_exact_ok')
    expect(postflight).toContain('AS postconditions_ok')
  })

  it('keeps predecessor and owner-only relation checks exact on PostgreSQL 17', () => {
    for (const source of [migration, preflight, postflight, recovery]) {
      const compact = source.replaceAll(/\s+/g, '')
      expect(compact).toContain(
        "signature<>'public.normalize_email_canonical(text)'",
      )
      expect(source).toContain("current_setting('server_version_num')")
      expect(compact).toContain('>=170000')
      expect(compact).toContain("privilege.privilege_type='MAINTAIN'")
      expect(source).not.toContain('72d1d2c6a8f822e58d40cceb25894676')
      expect(source).toContain('7b69311a107381a1891da01c32780f5f')
      expect(source).not.toContain('f4496acf63af226f072fc24e397d57b8')
    }
    for (const source of [preflight, postflight, recovery]) {
      expect(source).toContain('02b4f758f3cd967c63bfbb2389a89d68')
    }
    expect(
      md5(
        'checksource_kind=manual_nameandemail_canonicalisnullandrelationship_idisnullorsource_kind=manual_emailandemail_canonicalisnotnullandemail_canonical=normalize_email_canonicalemail_canonicalandteskeid_event_valid_textemail_canonical,3,320andemail_canonical~^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$andrelationship_idisnullorsource_kind=relationshipandemail_canonicalisnull',
      ),
    ).toBe('02b4f758f3cd967c63bfbb2389a89d68')
  })

  it('implements exact opt-out claim, four-state RSVP and private-note privacy', () => {
    const claim = functionBody(migration, 'teskeid_event_private_claim_scoped_v3')
    expect(claim).toContain('account.email_confirmed_at IS NOT NULL')
    expect(claim).toContain('participation.access_state = \'active\'')
    expect(claim).toContain('participation.recipient_user_id IS NULL')
    expect(claim).toContain('participation.recipient_email_canonical = v_email')
    expect(claim).toContain('IF v_invitation.id IS NULL THEN')
    expect(claim).toContain('IF v_anchor.invitation_id IS NOT NULL THEN')
    expect(claim).toContain(
      'v_anchor.invitation_id IS DISTINCT FROM v_invitation.id',
    )
    expect(claim).toContain('SET recipient_user_id = p_actor_id')
    expect(claim).toContain('recipient_email_canonical = NULL')

    const scope = functionBody(migration, 'teskeid_event_private_scope_v3')
    expect(scope).toContain('v_owner_id = p_actor_id')
    expect(scope).toContain('teskeid_event_assert_actor(p_actor_id)')
    expect(scope).toContain('participation.recipient_user_id = p_actor_id')
    expect(scope).toContain('participation.access_state = \'active\'')

    const resolver = functionBody(migration, 'teskeid_event_resolve_invitation_v3')
    expect(resolver).toContain(
      'teskeid_event_participation_invitation_generations_v3',
    )
    expect(resolver).toContain(
      "invitation.status IN ('pending','accepted','declined','expired')",
    )
    expect(resolver).toContain("terminalization.reason = 'identity_claim'")
    expect(resolver).not.toContain("'recipient_email_canonical'")
    expect(resolver).not.toContain("'private_note'")

    const rsvp = functionBody(migration, 'teskeid_event_set_rsvp_v3')
    expect(rsvp).toMatch(
      /'no_response','considering','attending','not_attending'/,
    )
    expect(rsvp).toContain("p_rsvp_state <> 'considering'")
    expect(rsvp).toContain(
      "pg_catalog.octet_length(COALESCE(p_private_note, '')) > 4096",
    )
    expect(rsvp).toContain(
      'p_private_note IS NOT NULL AND v_note IS NULL',
    )
    expect(rsvp).toMatch(
      /p_private_note !~\s+U&'\^\[[^']+\]\*\$'/,
    )
    expect(rsvp).not.toContain(
      "p_rsvp_state = 'considering' AND p_private_note IS NULL",
    )
    expect(rsvp).toContain(
      'v_decision.decision_version <> p_expected_decision_version',
    )
    expect(rsvp).toContain(
      "CASE WHEN p_rsvp_state = 'considering'\n          THEN 'no_response'",
    )
    expect(rsvp).toContain(
      'v_decision.private_note IS NOT DISTINCT FROM v_note',
    )
    expect(rsvp.slice(rsvp.lastIndexOf('v_result :='))).not.toContain(
      "'private_note'",
    )

    const people = functionBody(
      migration,
      'teskeid_event_private_people_projection_v3',
    )
    expect(people).toContain('participation.access_state = \'active\'')
    expect(people).toContain("p_viewer_role = 'owner'")
    expect(people).toContain('p_self_event_guest_id')
    expect(people).not.toMatch(/rsvp_state\s*=\s*'attending'/)

    const actorView = functionBody(
      migration,
      'teskeid_event_get_actor_view_v3',
    )
    expect(actorView).not.toContain('v_self_rsvp')
    expect(actorView).toContain('v_self_identity_generation')
    expect(actorView).toContain('LEFT JOIN LATERAL')
    expect(actorView).toContain('participation.recipient_user_id = p_actor_id')
    expect(actorView).toContain("participation.access_state = 'active'")
    expect(actorView).toContain('event_row.owner_user_id = p_actor_id')
    expect(actorView).toContain('teskeid_event_has_access(p_actor_id)')
    expect(actorView).toContain('current_self.event_guest_id IS NOT NULL')

    const personSourceRoster = functionBody(
      migration,
      'teskeid_event_get_person_source_roster_v3',
    )
    expect(personSourceRoster).toContain('v_self_identity_generation')
    expect(personSourceRoster).toContain('LEFT JOIN LATERAL')
    expect(personSourceRoster).toContain(
      'participation.recipient_user_id = p_actor_id',
    )
    expect(personSourceRoster).toContain(
      "participation.access_state = 'active'",
    )
    expect(personSourceRoster).toContain(
      'event_row.owner_user_id = p_actor_id',
    )
    expect(personSourceRoster).toContain(
      'teskeid_event_has_access(p_actor_id)',
    )

    const actorList = functionBody(
      migration,
      'teskeid_event_list_for_actor_v3',
    )
    expect(actorList).not.toContain('v_owned')
    expect(actorList).not.toContain('v_has_owner_access')
    expect(actorList).toContain('owner_authority.allowed')
    expect(actorList).toContain('teskeid_event_has_access(p_actor_id)')
    expect(actorList).toContain('candidate.owner_user_id = p_actor_id')
  })

  it('keeps claims bounded and leave closes every legacy Event authority', () => {
    const list = functionBody(
      migration,
      'teskeid_event_list_scoped_participations_v3',
    )
    expect(list).toContain('LIMIT 100')
    expect(list).toContain("'claim_has_more'")
    expect(list).toContain("'participating_has_more'")
    expect(list).not.toContain("'has_more'")
    expect(list).toContain('ORDER BY candidate.owner_user_id, candidate.event_id')

    const leave = functionBody(migration, 'teskeid_event_leave_participation_v3')
    expect(leave).toContain('participation.recipient_user_id = p_actor_id')
    expect(leave).toContain('participation.identity_generation <> p_identity_generation')
    expect(leave).toContain(
      'DELETE FROM public.teskeid_event_attendance_memberships',
    )
    expect(leave).toContain("SET status = 'left'")
    expect(leave).toContain("v_pending_ids, 'expired'")
    expect(leave).toContain("SET access_state = 'left'")
    expect(leave).not.toContain('DELETE FROM public.teskeid_event_participations')
    expect(leave).not.toContain('DELETE FROM public.teskeid_event_guests')
    expect(leave).not.toMatch(/expense_/i)

    const sync = functionBody(migration, 'teskeid_event_private_sync_rsvp_v3')
    expect(sync).toContain("NEW.access_state = 'active'")
    expect(sync).toContain('ELSE NULL')
    const personSource = functionBody(
      migration,
      'teskeid_event_list_person_source_events_v3',
    )
    expect(personSource).toContain("participation.access_state = 'active'")
    expect(personSource).not.toMatch(/rsvp_state\s*=\s*'attending'/)
  })

  it('allows destructive recovery only at the exact unused install baseline', () => {
    expect(recovery.match(/^BEGIN;$/gm)).toHaveLength(1)
    expect(recovery.match(/^COMMIT;$/gm)).toHaveLength(1)
    expect(recovery).toContain('marker.last_value=1 AND NOT marker.is_called')
    expect(recovery).toContain('baseline.sql149_last_value=bridge.last_value')
    expect(recovery).toContain('baseline.request_count=0')
    expect(recovery).toContain('sql153_recovery_baseline_closed')
    expect(recovery).toContain('sql153_recovery_observation_race')
    expect(recovery).toContain('sql153_recovery_catalog_snapshot')
    expect(recovery).toContain('sql153_recovery_legacy_constraint_mismatch')
    expect(recovery).toContain('pg_temp.sql153_recovery_catalog_current')
    expect(recovery).toContain('EXCEPT')
    expect(recovery).toContain(
      'SET rsvp_version=participation.rsvp_version-1',
    )
    expect(recovery).not.toMatch(/\bDROP[^;]*\bCASCADE\b/i)
    expect(recovery.match(/^DROP TABLE public\./gm)).toHaveLength(4)
    expect(recovery).not.toContain(
      'DROP TABLE public.teskeid_event_participations',
    )
    expect(recovery).not.toContain('DROP TABLE public.teskeid_event_guests')
    expect(recovery).toContain('sql153_recovery_final_mismatch')

    expect(readme).toContain('Run each SQL file manually')
    expect(readme).toContain('1. `preflight.sql` (read-only)')
    expect(readme).toContain(
      '2. `../../153_event_opt_out_scoped_participant_access.sql`',
    )
    expect(readme).toContain('3. `postflight.sql` (read-only)')
    expect(readme).toContain('Do not run `recovery.sql` as normal rollout work')
    expect(readme).toContain('No SQL in this package was executed by Codex')
  })
})
