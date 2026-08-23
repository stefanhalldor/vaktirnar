import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(process.cwd(), 'sql/155_event_inactive_participation_reinvite_hotfix.sql'),
  'utf8',
).replace(/\r\n/g, '\n')
const validationRoot = join(
  process.cwd(),
  'sql/validation/155-event-inactive-participation-reinvite-hotfix',
)
const preflight = readFileSync(join(validationRoot, 'preflight.sql'), 'utf8')
const postflight = readFileSync(join(validationRoot, 'postflight.sql'), 'utf8')
const readme = readFileSync(join(validationRoot, 'README.md'), 'utf8')
const sql133 = readFileSync(
  join(process.cwd(), 'sql/133_event_guest_identity_linking.sql'),
  'utf8',
).replace(/\r\n/g, '\n')
const sql149 = readFileSync(
  join(process.cwd(), 'sql/149_event_participant_identity_display.sql'),
  'utf8',
).replace(/\r\n/g, '\n')
const sql153 = readFileSync(
  join(process.cwd(), 'sql/153_event_opt_out_scoped_participant_access.sql'),
  'utf8',
).replace(/\r\n/g, '\n')

function functionBody(source: string, signature: string) {
  const signatureStart = source.indexOf(signature)
  const bodyStart = source.indexOf('AS $function$\n', signatureStart) + 13
  const bodyEnd = source.indexOf('$function$;', bodyStart)
  if (signatureStart < 0 || bodyStart < 13 || bodyEnd < 0) throw new Error(signature)
  return source.slice(bodyStart, bodyEnd)
}

function md5(value: string) {
  return createHash('md5').update(value).digest('hex')
}

function lines(...value: string[]) {
  return value.join('\n')
}

describe('SQL155 consent-safe inactive-participation reinvite hotfix', () => {
  it('uses a two-phase fail-closed cutover and a private Event-wide cleanup', () => {
    expect(migration.match(/^BEGIN;$/gm)).toHaveLength(2)
    expect(migration.match(/^COMMIT;$/gm)).toHaveLength(2)
    expect(migration).toContain('sql155_phase1_predecessor_body_mismatch')
    expect(migration).toContain(
      'OR v_private_source IS NULL OR v_list_source IS NULL',
    )
    expect(migration).toContain('sql155_phase2_predecessor_body_mismatch')
    expect(migration).toContain(
      'teskeid_event_private_cleanup_opt_out_email_targets_v3',
    )
    expect(migration).toContain(
      "v_invitation_ids,'cancelled'",
    )
    expect(migration).toContain(
      "NULL,NULL,NULL,false,'revoked',NULL",
    )
    expect(migration).toContain(
      'invitation.event_guest_id <> p_current_event_guest_id',
    )
    expect(migration).toContain(
      'participation.event_guest_id <> p_current_event_guest_id',
    )
    expect(migration).toContain('LOCK TABLE auth.users IN SHARE ROW EXCLUSIVE MODE')
    expect(migration).toContain(
      'LOCK TABLE public.teskeid_event_attendance_mutation_requests',
    )
    expect(migration).toContain(
      'LOCK TABLE public.teskeid_event_participation_mutation_requests_v3',
    )
    expect(migration).toContain(
      "'a2a85bca2a456177ab67b7817dc6e19d'",
    )
    expect(migration).toContain(
      "'ee8872c3b0d91786993e4ffbfb266293'",
    )
    expect(migration).toContain(
      "'f2901d82fd392cd406a5dfbfc3173759'",
    )
    expect(md5(functionBody(
      sql133,
      'CREATE FUNCTION public.teskeid_event_attendance_terminalize_invitations(',
    ))).toBe('a2a85bca2a456177ab67b7817dc6e19d')
    expect(md5(functionBody(
      sql149,
      'CREATE FUNCTION public.teskeid_event_private_apply_participation_v2(',
    ))).toBe('ee8872c3b0d91786993e4ffbfb266293')
    expect(md5(functionBody(
      sql149,
      'CREATE FUNCTION public.teskeid_event_private_v1_participation_bridge_v2()',
    ))).toBe('f2901d82fd392cd406a5dfbfc3173759')
    expect(md5(functionBody(
      sql153,
      'CREATE FUNCTION public.teskeid_event_private_sync_rsvp_v3()',
    ))).toBe('7126c130f7f17ad07d443a39d9aa57de')
    expect(md5(functionBody(
      sql153,
      'CREATE FUNCTION public.teskeid_event_private_anchor_sync_v3()',
    ))).toBe('db82578fc700fc64590c0b1d65b0ab00')
    for (const source of [migration, preflight, postflight]) {
      expect(source).toContain(
        'c64f7878dc0c9680b752f67cd3736547',
      )
      expect(source).toContain(
        '5aac98d0010360050b49f3ae294e2f77',
      )
      expect(source).toContain(
        'd9b51df3760832dc2a0c872b3098ec42',
      )
      expect(source).toContain('trigger_row.tgtype')
      expect(source).toContain('trigger_row.tgconstraint')
      expect(source).toContain('pg_catalog.pg_get_triggerdef(trigger_row.oid)')
    }
    for (const source of [preflight, postflight]) {
      expect(source).toMatch(
        /index_boundary AS \(\s*SELECT pg_catalog\.count\(\*\) = 3 AS ok/,
      )
      expect(source).toMatch(
        /dependency_boundary AS \(\s*SELECT pg_catalog\.count\(\*\) = 5 AS ok/,
      )
      expect(source).toMatch(/29,true,true,ARRAY\[\]::text\[\]/)
      expect(source).toMatch(/21,false,false,ARRAY\[\]::text\[\]/)
    }
    expect(migration).not.toMatch(
      /^CREATE TABLE|^ALTER TABLE|^DROP\b|^INSERT\b|^UPDATE\b|^DELETE\b/gm,
    )
    expect(migration).not.toContain('DISABLE ROW LEVEL SECURITY')
    expect(migration).not.toContain('CREATE POLICY')
    expect(migration).not.toContain('CREATE TRIGGER')
  })

  it('derives the exact helper and both replay-safe leave successors', () => {
    const helper = functionBody(
      migration,
      'CREATE OR REPLACE FUNCTION\n  public.teskeid_event_private_cleanup_opt_out_email_targets_v3(',
    )
    expect(md5(helper)).toBe('fcdbc2930ca742fa4452f20a83ce0114')

    let legacy = functionBody(
      sql133,
      'CREATE FUNCTION public.teskeid_event_leave_attendance(',
    )
    legacy = legacy
      .replace(
        lines(
          '  v_replay jsonb;',
          '  v_membership public.teskeid_event_attendance_memberships%ROWTYPE;',
        ),
        lines(
          '  v_replay jsonb;',
          '  v_actor_email text;',
          '  v_membership public.teskeid_event_attendance_memberships%ROWTYPE;',
        ),
      )
      .replace(
        lines(
          '  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;',
          '  PERFORM public.teskeid_event_attendance_sweep_expired(50, NULL);',
        ),
        lines(
          '  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;',
          '  SELECT CASE',
          '    WHEN account.email_confirmed_at IS NOT NULL',
          '     AND public.teskeid_event_private_valid_canonical_email_v2(',
          '       public.normalize_email_canonical(account.email)',
          '     )',
          '    THEN public.normalize_email_canonical(account.email)',
          '    ELSE NULL',
          '  END INTO v_actor_email',
          '  FROM auth.users AS account',
          '  WHERE account.id = p_actor_id',
          '  FOR SHARE OF account;',
          "  IF NOT FOUND THEN RAISE EXCEPTION 'teskeid_event_not_found'; END IF;",
          '  PERFORM public.teskeid_event_attendance_sweep_expired(50, NULL);',
        ),
      )
      .replace(
        lines(
          "  IF NOT FOUND THEN RAISE EXCEPTION 'teskeid_event_not_found'; END IF;",
          '  PERFORM guest.id FROM public.teskeid_event_guests AS guest',
        ),
        lines(
          "  IF NOT FOUND THEN RAISE EXCEPTION 'teskeid_event_not_found'; END IF;",
          '  PERFORM public.teskeid_event_private_cleanup_opt_out_email_targets_v3(',
          '    v_actor_email,p_event_id,v_probe_guest_id',
          '  );',
          '  PERFORM guest.id FROM public.teskeid_event_guests AS guest',
        ),
      )
    expect(md5(legacy)).toBe('5b4206f25cfeb04311fbbeab5ebc72da')

    let v3 = functionBody(
      sql153,
      'CREATE FUNCTION public.teskeid_event_leave_participation_v3(',
    )
    v3 = v3
      .replace(
        lines(
          '  v_replay jsonb;',
          '  v_participation public.teskeid_event_participations%ROWTYPE;',
        ),
        lines(
          '  v_replay jsonb;',
          '  v_actor_email text;',
          '  v_participation public.teskeid_event_participations%ROWTYPE;',
        ),
      )
      .replace(
        lines(
          '  PERFORM public.teskeid_event_private_claim_scoped_v3(',
          '    p_actor_id, p_event_id',
          '  );',
          '  PERFORM account.id',
          '  FROM auth.users AS account',
          '  WHERE account.id = p_actor_id',
          '  FOR SHARE OF account;',
          "  IF NOT FOUND THEN RAISE EXCEPTION 'teskeid_event_not_found'; END IF;",
          '  PERFORM public.teskeid_event_assert_session_actor(p_actor_id);',
          '  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(',
          "    'event_id', p_event_id,",
          "    'event_guest_id', p_event_guest_id,",
          "    'identity_generation', p_identity_generation,",
          "    'expected_identity_version', p_expected_identity_version,",
          "    'expected_access_version', p_expected_access_version",
          '  )::text);',
          '  v_replay := public.teskeid_event_private_begin_request_v3(',
          "    p_actor_id, p_request_id, 'leave_v3', v_fingerprint",
          '  );',
          '  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;',
        ),
        lines(
          '  PERFORM public.teskeid_event_assert_session_actor(p_actor_id);',
          '  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(',
          "    'event_id', p_event_id,",
          "    'event_guest_id', p_event_guest_id,",
          "    'identity_generation', p_identity_generation,",
          "    'expected_identity_version', p_expected_identity_version,",
          "    'expected_access_version', p_expected_access_version",
          '  )::text);',
          '  v_replay := public.teskeid_event_private_begin_request_v3(',
          "    p_actor_id, p_request_id, 'leave_v3', v_fingerprint",
          '  );',
          '  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;',
          '',
          '  -- A replay must return before a fresh invitation can be claimed.',
          '  PERFORM public.teskeid_event_private_claim_scoped_v3(',
          '    p_actor_id,p_event_id',
          '  );',
          '  SELECT CASE',
          '    WHEN account.email_confirmed_at IS NOT NULL',
          '     AND public.teskeid_event_private_valid_canonical_email_v2(',
          '       public.normalize_email_canonical(account.email)',
          '     )',
          '    THEN public.normalize_email_canonical(account.email)',
          '    ELSE NULL',
          '  END INTO v_actor_email',
          '  FROM auth.users AS account',
          '  WHERE account.id = p_actor_id',
          '  FOR SHARE OF account;',
          "  IF NOT FOUND THEN RAISE EXCEPTION 'teskeid_event_not_found'; END IF;",
        ),
      )
      .replace(
        lines(
          "  IF NOT FOUND THEN RAISE EXCEPTION 'teskeid_event_not_found'; END IF;",
          '  PERFORM guest.id',
          '  FROM public.teskeid_event_guests AS guest',
        ),
        lines(
          "  IF NOT FOUND THEN RAISE EXCEPTION 'teskeid_event_not_found'; END IF;",
          '  PERFORM public.teskeid_event_private_cleanup_opt_out_email_targets_v3(',
          '    v_actor_email,p_event_id,p_event_guest_id',
          '  );',
          '  PERFORM guest.id',
          '  FROM public.teskeid_event_guests AS guest',
        ),
      )
    expect(md5(v3)).toBe('b2767b261eaa909d064c6f5fe4b737fd')
    expect(v3.indexOf('private_begin_request_v3')).toBeLessThan(
      v3.indexOf('private_claim_scoped_v3'),
    )
  })

  it('derives the exact SQL154-based claim/list successors', () => {
    let privateClaim = functionBody(
      sql153,
      'CREATE FUNCTION public.teskeid_event_private_claim_scoped_v3(',
    )
    let listScoped = functionBody(
      sql153,
      'CREATE FUNCTION public.teskeid_event_list_scoped_participations_v3(',
    )
    listScoped = listScoped.replace(
      lines(
        'FROM pg_catalog.unnest(',
        '          v_candidate_event_ids,v_candidate_owner_ids',
        '        ) AS expected_pair(event_id,owner_user_id)',
      ),
      lines(
        'FROM pg_catalog.generate_subscripts(',
        '          v_candidate_event_ids, 1',
        '        ) AS expected_ordinal(array_index)',
        '        CROSS JOIN LATERAL (SELECT',
        '          v_candidate_event_ids[expected_ordinal.array_index] AS event_id,',
        '          v_candidate_owner_ids[expected_ordinal.array_index] AS owner_user_id',
        '        ) AS expected_pair',
      ),
    )
    expect(md5(privateClaim)).toBe('5b7eecb3f7e9aebb6a376ffd312989be')
    expect(md5(listScoped)).toBe('0269211156c600c6411ecf0590eff295')

    const privateEarly = lines(
      'WHERE participation.event_id = p_event_id',
      '      AND participation.recipient_user_id = p_actor_id',
    )
    const privateOther = lines(
      'WHERE bound_self.event_id = participation.event_id',
      '        AND bound_self.event_guest_id <> participation.event_guest_id',
      '        AND bound_self.recipient_user_id = p_actor_id',
    )
    const freshnessAnchor = '  IF v_invitation.id IS NULL THEN'
    const freshnessBlock = lines(
      '  IF EXISTS (',
      '    SELECT 1',
      '    FROM public.teskeid_event_participations AS historical_self',
      '    WHERE historical_self.event_id = p_event_id',
      '      AND historical_self.event_guest_id <> v_candidate.event_guest_id',
      '      AND historical_self.recipient_user_id = p_actor_id',
      "      AND historical_self.access_state <> 'active'",
      '      AND (',
      '        v_invitation.id IS NULL',
      '        OR v_invitation.created_at <= historical_self.access_updated_at',
      '      )',
      '  ) THEN',
      '    RETURN 0;',
      '  END IF;',
      '',
    )
    privateClaim = privateClaim
      .replace(
        privateEarly,
        privateEarly + "\n      AND participation.access_state = 'active'",
      )
      .replace(
        privateOther,
        privateOther + "\n        AND bound_self.access_state = 'active'",
      )
      .replace(freshnessAnchor, freshnessBlock + freshnessAnchor)
    listScoped = listScoped
      .replaceAll(
        'SELECT invitation.id,invitation.status',
        lines(
          'SELECT invitation.id,invitation.status,',
          '          invitation.created_at',
        ),
      )
      .replace(
        lines(
          'WHERE bound_self.event_id = participation.event_id',
          '            AND bound_self.recipient_user_id = p_actor_id',
        ),
        lines(
          'WHERE bound_self.event_id = participation.event_id',
          '            AND bound_self.recipient_user_id = p_actor_id',
          '            AND (',
          "              bound_self.access_state = 'active'",
          '              OR latest_invitation.id IS NULL',
          '              OR latest_invitation.created_at <=',
          '                bound_self.access_updated_at',
          '            )',
        ),
      )
      .replace(
        lines(
          'WHERE bound_self.event_id = remaining.event_id',
          '                AND bound_self.recipient_user_id = p_actor_id',
        ),
        lines(
          'WHERE bound_self.event_id = remaining.event_id',
          '                AND bound_self.recipient_user_id = p_actor_id',
          '                AND (',
          "                  bound_self.access_state = 'active'",
          '                  OR latest_invitation.id IS NULL',
          '                  OR latest_invitation.created_at <=',
          '                    bound_self.access_updated_at',
          '                )',
        ),
      )
    expect(md5(privateClaim)).toBe('41487888c688c3280904d78772443b07')
    expect(md5(listScoped)).toBe('f0c26c4743874f680239a5b3d2f1ca38')
  })

  it('ships read-only validation and localhost checks', () => {
    for (const source of [preflight, postflight]) {
      expect(source).toContain('SET TRANSACTION READ ONLY;')
      expect(source).toContain('ROLLBACK;')
    }
    expect(preflight).toContain('prerequisites_ok')
    expect(postflight).toContain('postconditions_ok')
    expect(postflight).toContain('trigger_boundaries_ok')
    expect(readme).toContain('Localhost checks for Stebbi')
    expect(readme).toContain('Hætta þátttöku')
    expect(readme).toContain('two committed phases')
  })
})
