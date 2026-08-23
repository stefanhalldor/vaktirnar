import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(process.cwd(), 'sql/156_event_same_row_left_reinvite_hotfix.sql'),
  'utf8',
)
const validationRoot = join(
  process.cwd(),
  'sql/validation/156-event-same-row-left-reinvite-hotfix',
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

function functionBodyFrom(source: string, signature: string) {
  const signatureStart = source.indexOf(signature)
  expect(signatureStart).toBeGreaterThanOrEqual(0)
  const bodyMarker = 'AS $function$\n'
  // pg_proc.prosrc retains the newline immediately inside the dollar quote.
  const bodyStart = source.indexOf(bodyMarker, signatureStart) + 13
  const bodyEnd = source.indexOf('$function$;', bodyStart)
  expect(bodyEnd).toBeGreaterThan(bodyStart)
  return source.slice(bodyStart, bodyEnd)
}

function functionBody(signature: string) {
  return functionBodyFrom(sql133, signature)
}

function md5(value: string) {
  return createHash('md5').update(value).digest('hex')
}

function replaceExactlyOnce(source: string, before: string, after: string) {
  expect(source.split(before)).toHaveLength(2)
  return source.replace(before, after)
}

const createDeclarationBefore = `  v_guest public.teskeid_event_guests%ROWTYPE;
  v_email text := public.normalize_email_canonical(p_recipient_email);`
const createDeclarationAfter = `  v_guest public.teskeid_event_guests%ROWTYPE;
  v_participation public.teskeid_event_participations%ROWTYPE;
  v_effective_user_id uuid;
  v_created_at timestamptz;
  v_email text := public.normalize_email_canonical(p_recipient_email);`

const createEligibilityBefore = `  IF (p_invitation_kind = 'access_only' AND v_guest.linked_user_id IS NULL)
     OR (
       p_invitation_kind = 'identity_and_access'
       AND v_guest.linked_user_id IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'teskeid_event_invitation_conflict';
  END IF;
  IF p_invitation_kind = 'access_only' AND NOT EXISTS (
    SELECT 1 FROM auth.users AS recipient
    WHERE recipient.id = v_guest.linked_user_id
      AND recipient.email_confirmed_at IS NOT NULL
      AND public.normalize_email_canonical(recipient.email) = v_email
  ) THEN
    RAISE EXCEPTION 'teskeid_event_invitation_recipient_unavailable';
  END IF;`
const createEligibilityAfter = `  SELECT participation.* INTO v_participation
  FROM public.teskeid_event_participations AS participation
  WHERE participation.event_id = p_event_id
    AND participation.event_guest_id = p_event_guest_id
  FOR UPDATE;

  IF v_participation.access_state = 'revoked'
     OR (
       v_guest.linked_user_id IS NOT NULL
       AND v_participation.recipient_user_id IS NOT NULL
       AND v_participation.recipient_user_id IS DISTINCT FROM
         v_guest.linked_user_id
     )
     OR (
       v_participation.identity_claimed_at IS NOT NULL
       AND v_participation.recipient_user_id IS NULL
     ) THEN
    RAISE EXCEPTION 'teskeid_event_invitation_conflict';
  END IF;

  IF p_invitation_kind = 'access_only' THEN
    v_effective_user_id := CASE
      WHEN v_guest.linked_user_id IS NOT NULL
        THEN v_guest.linked_user_id
      WHEN v_participation.access_state = 'left'
        AND v_participation.recipient_user_id IS NOT NULL
        AND v_participation.identity_claimed_at IS NOT NULL
        THEN v_participation.recipient_user_id
      ELSE NULL
    END;
    IF v_effective_user_id IS NULL THEN
      RAISE EXCEPTION 'teskeid_event_invitation_recipient_unavailable';
    END IF;
  ELSIF v_guest.linked_user_id IS NOT NULL
     OR v_participation.recipient_user_id IS NOT NULL
     OR v_participation.identity_claimed_at IS NOT NULL
     OR v_participation.access_state = 'left' THEN
    RAISE EXCEPTION 'teskeid_event_invitation_conflict';
  END IF;

  IF p_invitation_kind = 'access_only' AND NOT EXISTS (
    SELECT 1 FROM auth.users AS recipient
    WHERE recipient.id = v_effective_user_id
      AND recipient.email_confirmed_at IS NOT NULL
      AND public.normalize_email_canonical(recipient.email) = v_email
  ) THEN
    RAISE EXCEPTION 'teskeid_event_invitation_recipient_unavailable';
  END IF;`

const createInsertBefore = `  INSERT INTO public.teskeid_event_guest_invitations (
    event_id, event_guest_id, invited_by, invitation_kind,
    recipient_email_canonical, recipient_label_snapshot,
    event_name_snapshot, guest_display_name_snapshot,
    inviter_display_name_snapshot
  ) VALUES (
    p_event_id, p_event_guest_id, p_actor_id, p_invitation_kind,
    v_email, public.teskeid_event_attendance_mask_email(v_email),
    v_event.name, v_safe_guest_label, v_inviter_name
  )`
const createInsertAfter = `  v_created_at := pg_catalog.clock_timestamp();
  INSERT INTO public.teskeid_event_guest_invitations (
    event_id, event_guest_id, invited_by, invitation_kind,
    recipient_email_canonical, recipient_label_snapshot,
    event_name_snapshot, guest_display_name_snapshot,
    inviter_display_name_snapshot, expires_at, created_at, updated_at
  ) VALUES (
    p_event_id, p_event_guest_id, p_actor_id, p_invitation_kind,
    v_email, public.teskeid_event_attendance_mask_email(v_email),
    v_event.name, v_safe_guest_label, v_inviter_name,
    v_created_at + interval '30 days', v_created_at, v_created_at
  )`

const inviteDeclarationBefore = `  v_probe_linked_user_id uuid;
  v_probe_source_kind text;
  v_probe_email text;
  v_linked_email_snapshot jsonb := '{}'::jsonb;`
const inviteDeclarationAfter = `  v_probe_linked_user_id uuid;
  v_probe_source_kind text;
  v_probe_email text;
  v_probe_participation_user_id uuid;
  v_probe_participation_access_state text;
  v_probe_participation_claimed_at timestamptz;
  v_effective_user_id uuid;
  v_participation public.teskeid_event_participations%ROWTYPE;
  v_linked_email_snapshot jsonb := '{}'::jsonb;`

const inviteProbeBefore = `  SELECT guest.linked_user_id, guest.source_kind, guest.email_canonical
  INTO v_probe_linked_user_id, v_probe_source_kind, v_probe_email
  FROM public.teskeid_events AS event_row
  JOIN public.teskeid_event_guests AS guest
    ON guest.event_id = event_row.id
  WHERE event_row.id = p_event_id
    AND event_row.owner_user_id = p_actor_id
    AND guest.id = p_event_guest_id
    AND guest.status = 'active';`
const inviteProbeAfter = `  SELECT guest.linked_user_id, guest.source_kind, guest.email_canonical,
    participation.recipient_user_id, participation.access_state,
    participation.identity_claimed_at
  INTO v_probe_linked_user_id, v_probe_source_kind, v_probe_email,
    v_probe_participation_user_id, v_probe_participation_access_state,
    v_probe_participation_claimed_at
  FROM public.teskeid_events AS event_row
  JOIN public.teskeid_event_guests AS guest
    ON guest.event_id = event_row.id
  LEFT JOIN public.teskeid_event_participations AS participation
    ON participation.event_id = guest.event_id
   AND participation.event_guest_id = guest.id
  WHERE event_row.id = p_event_id
    AND event_row.owner_user_id = p_actor_id
    AND guest.id = p_event_guest_id
    AND guest.status = 'active';`

const inviteProbeLocksBefore = `  IF v_probe_linked_user_id IS NULL THEN
    v_probe_email := CASE
      WHEN v_probe_source_kind = 'manual_email' THEN v_probe_email
      WHEN v_probe_source_kind = 'manual_name'
        THEN public.normalize_email_canonical(p_recipient_email)
      ELSE NULL
    END;
    IF v_probe_email IS NOT NULL THEN
      PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(v_probe_email, 9702)
      );
    END IF;
  END IF;
  IF v_probe_linked_user_id IS NOT NULL THEN
    v_linked_email_snapshot :=
      public.teskeid_event_attendance_lock_user_emails(
        ARRAY[v_probe_linked_user_id]
      );
  END IF;`
const inviteProbeLocksAfter = `  v_effective_user_id := v_probe_linked_user_id;
  IF v_effective_user_id IS NULL
     AND v_probe_participation_access_state = 'left'
     AND v_probe_participation_user_id IS NOT NULL
     AND v_probe_participation_claimed_at IS NOT NULL THEN
    v_effective_user_id := v_probe_participation_user_id;
  END IF;
  IF v_effective_user_id IS NULL THEN
    v_probe_email := CASE
      WHEN v_probe_source_kind = 'manual_email' THEN v_probe_email
      WHEN v_probe_source_kind = 'manual_name'
        THEN public.normalize_email_canonical(p_recipient_email)
      ELSE NULL
    END;
    IF v_probe_email IS NOT NULL THEN
      PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(v_probe_email, 9702)
      );
    END IF;
  ELSE
    v_linked_email_snapshot :=
      public.teskeid_event_attendance_lock_user_emails(
        ARRAY[v_effective_user_id]
      );
  END IF;`

const inviteResolutionBefore = `  IF v_guest.linked_user_id IS NOT NULL THEN
    IF v_guest.linked_user_id IS DISTINCT FROM v_probe_linked_user_id THEN
      RAISE EXCEPTION 'teskeid_event_roster_conflict';
    END IF;
    IF p_recipient_email IS NOT NULL THEN
      RAISE EXCEPTION 'teskeid_event_invalid_input';
    END IF;
    v_email := v_linked_email_snapshot->>v_guest.linked_user_id::text;
    v_kind := 'access_only';
  ELSIF v_guest.source_kind = 'manual_email' THEN
    IF p_recipient_email IS NOT NULL THEN
      RAISE EXCEPTION 'teskeid_event_invalid_input';
    END IF;
    v_email := v_guest.email_canonical;
    v_kind := 'identity_and_access';
  ELSIF v_guest.source_kind = 'manual_name' THEN
    v_email := public.normalize_email_canonical(p_recipient_email);
    v_kind := 'identity_and_access';
  ELSE
    RAISE EXCEPTION 'teskeid_event_invitation_recipient_unavailable';
  END IF;`
const inviteResolutionAfter = `  SELECT participation.* INTO v_participation
  FROM public.teskeid_event_participations AS participation
  WHERE participation.event_id = p_event_id
    AND participation.event_guest_id = p_event_guest_id
  FOR UPDATE;

  IF v_guest.linked_user_id IS NOT NULL THEN
    IF v_guest.linked_user_id IS DISTINCT FROM v_probe_linked_user_id THEN
      RAISE EXCEPTION 'teskeid_event_roster_conflict';
    END IF;
    IF v_participation.access_state = 'revoked'
       OR (
         v_participation.recipient_user_id IS NOT NULL
         AND v_participation.recipient_user_id IS DISTINCT FROM
           v_guest.linked_user_id
       )
       OR (
         v_participation.identity_claimed_at IS NOT NULL
         AND v_participation.recipient_user_id IS NULL
       ) THEN
      RAISE EXCEPTION 'teskeid_event_invitation_conflict';
    END IF;
    IF p_recipient_email IS NOT NULL THEN
      RAISE EXCEPTION 'teskeid_event_invalid_input';
    END IF;
    v_email := v_linked_email_snapshot->>v_guest.linked_user_id::text;
    v_kind := 'access_only';
  ELSIF v_participation.access_state = 'left'
     AND v_participation.recipient_user_id IS NOT NULL
     AND v_participation.identity_claimed_at IS NOT NULL THEN
    IF v_probe_linked_user_id IS NOT NULL
       OR v_participation.recipient_user_id IS DISTINCT FROM
         v_probe_participation_user_id
       OR v_participation.access_state IS DISTINCT FROM
         v_probe_participation_access_state
       OR v_participation.identity_claimed_at IS DISTINCT FROM
         v_probe_participation_claimed_at THEN
      RAISE EXCEPTION 'teskeid_event_roster_conflict';
    END IF;
    IF p_recipient_email IS NOT NULL THEN
      RAISE EXCEPTION 'teskeid_event_invalid_input';
    END IF;
    v_email := v_linked_email_snapshot
      ->>v_participation.recipient_user_id::text;
    v_kind := 'access_only';
  ELSIF v_participation.recipient_user_id IS NOT NULL
     OR v_participation.identity_claimed_at IS NOT NULL
     OR v_participation.access_state IN ('left', 'revoked') THEN
    RAISE EXCEPTION 'teskeid_event_invitation_conflict';
  ELSIF v_guest.source_kind = 'manual_email' THEN
    IF p_recipient_email IS NOT NULL THEN
      RAISE EXCEPTION 'teskeid_event_invalid_input';
    END IF;
    v_email := v_guest.email_canonical;
    v_kind := 'identity_and_access';
  ELSIF v_guest.source_kind = 'manual_name' THEN
    v_email := public.normalize_email_canonical(p_recipient_email);
    v_kind := 'identity_and_access';
  ELSE
    RAISE EXCEPTION 'teskeid_event_invitation_recipient_unavailable';
  END IF;`

function deriveCreatePending() {
  let body = functionBody(
    'CREATE FUNCTION public.teskeid_event_attendance_create_pending(',
  )
  body = replaceExactlyOnce(body, createDeclarationBefore, createDeclarationAfter)
  body = replaceExactlyOnce(body, createEligibilityBefore, createEligibilityAfter)
  return replaceExactlyOnce(body, createInsertBefore, createInsertAfter)
}

function deriveInviteGuest() {
  let body = functionBody(
    'CREATE FUNCTION public.teskeid_event_invite_guest_attendance(',
  )
  body = replaceExactlyOnce(body, inviteDeclarationBefore, inviteDeclarationAfter)
  body = replaceExactlyOnce(body, inviteProbeBefore, inviteProbeAfter)
  body = replaceExactlyOnce(body, inviteProbeLocksBefore, inviteProbeLocksAfter)
  return replaceExactlyOnce(body, inviteResolutionBefore, inviteResolutionAfter)
}

describe('SQL156 same-row left reinvite hotfix', () => {
  it('derives exact successor bodies from the frozen SQL133 predecessors', () => {
    const createPending = functionBody(
      'CREATE FUNCTION public.teskeid_event_attendance_create_pending(',
    )
    const inviteGuest = functionBody(
      'CREATE FUNCTION public.teskeid_event_invite_guest_attendance(',
    )
    expect(md5(createPending)).toBe('68881d52023265e7edd893f727a16381')
    expect(md5(inviteGuest)).toBe('23eea91f0b5ec29c50b3615c9cadcdfe')
    expect(md5(deriveCreatePending())).toBe('98031fa21f1f710a8df822849edf80c5')
    expect(md5(deriveInviteGuest())).toBe('1120d176c335185f258d8ef824ef1f05')
  })

  it('allows only an exact claimed same-row left identity and preserves revoked', () => {
    expect(migration).toContain("v_participation.access_state = 'left'")
    expect(migration).toContain(
      'v_participation.recipient_user_id IS NOT NULL',
    )
    expect(migration).toContain(
      'v_participation.identity_claimed_at IS NOT NULL',
    )
    expect(migration).toContain("v_participation.access_state = 'revoked'")
    expect(migration).toContain(
      'public.normalize_email_canonical(recipient.email) = v_email',
    )
    expect(migration).toContain('sql156_create_fragment_count_mismatch')
    expect(migration).toContain('sql156_invite_fragment_count_mismatch')
    expect(migration).toContain('sql156_rewrite_hash_mismatch')
    expect(migration.match(/constant text := pg_catalog\.replace\(/g)).toHaveLength(14)
    for (const requiredSql155Hash of [
      '41487888c688c3280904d78772443b07',
      'f0c26c4743874f680239a5b3d2f1ca38',
      '5b4206f25cfeb04311fbbeab5ebc72da',
      'b2767b261eaa909d064c6f5fe4b737fd',
      'fcdbc2930ca742fa4452f20a83ce0114',
    ]) {
      expect(migration).toContain(requiredSql155Hash)
      expect(preflight).toContain(requiredSql155Hash)
      expect(postflight).toContain(requiredSql155Hash)
    }
    for (const targetHash of [
      '98031fa21f1f710a8df822849edf80c5',
      '1120d176c335185f258d8ef824ef1f05',
    ]) {
      expect(migration).toContain(targetHash)
      expect(preflight).toContain(targetHash)
      expect(postflight).toContain(targetHash)
    }
    const dependencies = [
      [
        sql149,
        'CREATE FUNCTION public.teskeid_event_private_guard_bound_invitation_v2()',
        '18c2e356417113e8e06cfc568f763713',
      ],
      [
        sql149,
        'CREATE FUNCTION public.teskeid_event_private_apply_participation_v2(',
        'ee8872c3b0d91786993e4ffbfb266293',
      ],
      [
        sql149,
        'CREATE FUNCTION public.teskeid_event_private_v1_participation_bridge_v2()',
        'f2901d82fd392cd406a5dfbfc3173759',
      ],
      [
        sql153,
        'CREATE FUNCTION public.teskeid_event_private_bump_generation_rsvp_v3()',
        '9f7c2be934e4e3db5be808e4b0800e42',
      ],
      [
        sql153,
        'CREATE FUNCTION public.teskeid_event_private_sync_rsvp_v3()',
        '7126c130f7f17ad07d443a39d9aa57de',
      ],
      [
        sql153,
        'CREATE FUNCTION public.teskeid_event_private_anchor_sync_v3()',
        'db82578fc700fc64590c0b1d65b0ab00',
      ],
    ] as const
    for (const [source, signature, sourceHash] of dependencies) {
      expect(md5(functionBodyFrom(source, signature))).toBe(sourceHash)
      expect(migration).toContain(sourceHash)
      expect(preflight).toContain(sourceHash)
      expect(postflight).toContain(sourceHash)
    }
    for (const triggerHash of [
      '4140321dd7400e9f0678e83519d1928b',
      'c64f7878dc0c9680b752f67cd3736547',
      '79dd9233e23f7c3ca18405df5c00f62b',
      '5aac98d0010360050b49f3ae294e2f77',
      'd9b51df3760832dc2a0c872b3098ec42',
    ]) {
      expect(migration).toContain(triggerHash)
      expect(preflight).toContain(triggerHash)
      expect(postflight).toContain(triggerHash)
    }
    expect(preflight).toContain('helper_dependencies_ok')
    expect(preflight).toContain('trigger_boundaries_ok')
    expect(preflight).toContain('unique_boundaries_ok')
    expect(postflight).toContain('helper_dependencies_ok')
    expect(postflight).toContain('trigger_boundaries_ok')
    expect(postflight).toContain('unique_boundaries_ok')
  })

  it('timestamps invitations after Event-lock serialization', () => {
    const derived = deriveCreatePending()
    const eventLock = derived.indexOf('FOR UPDATE;')
    const clockCapture = derived.indexOf(
      'v_created_at := pg_catalog.clock_timestamp();',
    )
    const insert = derived.indexOf(
      'INSERT INTO public.teskeid_event_guest_invitations',
    )
    expect(eventLock).toBeGreaterThanOrEqual(0)
    expect(clockCapture).toBeGreaterThan(eventLock)
    expect(insert).toBeGreaterThan(clockCapture)
    expect(derived).toContain(
      "v_created_at + interval '30 days', v_created_at, v_created_at",
    )
    expect(migration).toContain('sql156_invitation_time_shape_mismatch')
  })

  it('keeps the migration narrow and validation read-only', () => {
    expect(migration.match(/^BEGIN;$/gm)).toHaveLength(1)
    expect(migration.match(/^COMMIT;$/gm)).toHaveLength(1)
    expect(migration.match(/\$sql156_fragment\$/g)).toHaveLength(28)
    expect(migration.match(/\$sql156\$/g)).toHaveLength(2)
    expect(migration.match(/\$sql156_postflight\$/g)).toHaveLength(2)
    expect(migration).not.toMatch(
      /^CREATE TABLE|^ALTER TABLE|^DROP\b|^INSERT\b|^UPDATE\b|^DELETE\b/gm,
    )
    expect(migration).not.toContain('DISABLE ROW LEVEL SECURITY')
    expect(migration).not.toContain('CREATE POLICY')
    expect(migration).not.toContain('CREATE TRIGGER')
    for (const source of [preflight, postflight]) {
      expect(source).toContain('SET TRANSACTION READ ONLY;')
      expect(source).toContain('ROLLBACK;')
    }
    expect(preflight).toContain('prerequisites_ok')
    expect(preflight).toContain('sql155_exact_ok')
    expect(postflight).toContain('postconditions_ok')
    expect(postflight).toContain('same_row_left_reinvite_exact_ok')
    expect(postflight).toContain('sql155_exact_ok')
    expect(readme).toContain('Localhost checks for Stebbi')
    expect(readme).toContain('Endurbjóða')
    expect(readme).toMatch(/Codex wrote but did not run\s+SQL156/)
  })
})
