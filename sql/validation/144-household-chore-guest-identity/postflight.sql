-- Read-only SQL 144 postflight. Every returned boolean must be true.
BEGIN;
SET TRANSACTION READ ONLY;

WITH checks AS (
  SELECT
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute
      WHERE attrelid = 'public.household_chore_invitations'::pg_catalog.regclass
        AND attname = 'target_participant_id'
        AND atttypid = 'uuid'::pg_catalog.regtype
        AND NOT attnotnull AND attnum > 0 AND NOT attisdropped
    ) AS target_column_ok,
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid = 'public.household_chore_invitations'::pg_catalog.regclass
        AND conname = 'household_chore_invitations_target_participant_fk'
        AND contype = 'f' AND convalidated
    ) AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid = 'public.household_chore_invitations'::pg_catalog.regclass
        AND conname = 'household_chore_invitations_target_source_check'
        AND contype = 'c' AND convalidated
    ) AS target_constraints_ok,
    pg_catalog.to_regclass(
      'public.household_chore_invitations_pending_target_idx'
    ) IS NOT NULL AS target_index_ok,
    pg_catalog.to_regprocedure(
      'public.household_chore_get_participant_identity_links(uuid,uuid)'
    ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_rename_participant(uuid,uuid,uuid,uuid,bigint,text)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_link_participant(uuid,uuid,uuid,uuid,bigint,text,text)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_accept_invitation(uuid,uuid,uuid,bigint)'
      ) IS NOT NULL AS functions_ok,
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_trigger
      WHERE tgrelid = 'public.household_chore_participants'::pg_catalog.regclass
        AND tgname = 'household_chore_participant_pending_link_guard'
        AND NOT tgisinternal AND tgenabled = 'O'
    ) AS archive_guard_ok,
    NOT pg_catalog.has_function_privilege(
      'anon',
      'public.household_chore_link_participant(uuid,uuid,uuid,uuid,bigint,text,text)',
      'EXECUTE'
    ) AND NOT pg_catalog.has_function_privilege(
      'authenticated',
      'public.household_chore_link_participant(uuid,uuid,uuid,uuid,bigint,text,text)',
      'EXECUTE'
    ) AND pg_catalog.has_function_privilege(
      'service_role',
      'public.household_chore_link_participant(uuid,uuid,uuid,uuid,bigint,text,text)',
      'EXECUTE'
    ) AS function_security_ok,
    NOT EXISTS (
      SELECT 1 FROM public.household_chore_invitations AS invitation_row
      WHERE invitation_row.target_participant_id IS NOT NULL
        AND invitation_row.relationship_id IS NOT NULL
    ) AS target_source_data_ok,
    NOT EXISTS (
      SELECT target_participant_id
      FROM public.household_chore_invitations
      WHERE status = 'pending' AND target_participant_id IS NOT NULL
      GROUP BY circle_id, target_participant_id
      HAVING pg_catalog.count(*) > 1
    ) AS pending_target_unique_ok
)
SELECT
  current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.clock_timestamp() AS checked_at,
  target_column_ok,
  target_constraints_ok,
  target_index_ok,
  functions_ok,
  archive_guard_ok,
  function_security_ok,
  target_source_data_ok,
  pending_target_unique_ok,
  target_column_ok AND target_constraints_ok AND target_index_ok
    AND functions_ok AND archive_guard_ok AND function_security_ok
    AND target_source_data_ok AND pending_target_unique_ok
    AS postconditions_ok
FROM checks;

ROLLBACK;
