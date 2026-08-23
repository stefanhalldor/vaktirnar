-- SQL154: Event scoped-participation array pairing runtime hotfix.
--
-- PostgreSQL accepts the SQL153 PL/pgSQL body at CREATE FUNCTION time, but
-- resolves the schema-qualified two-array unnest only when the unbound guest
-- claim branch is planned. pg_catalog has no unnest(uuid[], uuid[]) overload,
-- so that branch fails with 42883. Replace only that exact source fragment
-- with indexed pairing through generate_subscripts.
--
-- No Event/auth/application data, RLS, policy, table, trigger or index changes.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

SELECT pg_catalog.pg_advisory_xact_lock(15001);
SELECT pg_catalog.pg_advisory_xact_lock(15301);
SELECT pg_catalog.pg_advisory_xact_lock(15401);

DO $sql154$
DECLARE
  v_oid oid;
  v_source text;
  v_fixed_source text;
  v_broken_position integer;
  v_broken_fragment constant text :=
    E'FROM pg_catalog.unnest(\n          v_candidate_event_ids,v_candidate_owner_ids\n        ) AS expected_pair(event_id,owner_user_id)';
  v_fixed_fragment constant text :=
    E'FROM pg_catalog.generate_subscripts(\n          v_candidate_event_ids, 1\n        ) AS expected_ordinal(array_index)\n        CROSS JOIN LATERAL (SELECT\n          v_candidate_event_ids[expected_ordinal.array_index] AS event_id,\n          v_candidate_owner_ids[expected_ordinal.array_index] AS owner_user_id\n        ) AS expected_pair';
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'sql154_executor_mismatch';
  END IF;

  v_oid := pg_catalog.to_regprocedure(
    'public.teskeid_event_list_scoped_participations_v3(uuid)'
  );
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'sql154_predecessor_missing';
  END IF;

  SELECT pg_catalog.replace(procedure_row.prosrc, E'\r\n', E'\n')
  INTO v_source
  FROM pg_catalog.pg_proc AS procedure_row
  WHERE procedure_row.oid = v_oid;

  IF pg_catalog.md5(v_source) NOT IN (
       '49ab80161d27a7a73df7491bf04ac6cd',
       '0269211156c600c6411ecf0590eff295'
     ) THEN
    RAISE EXCEPTION 'sql154_predecessor_body_mismatch';
  END IF;

  IF pg_catalog.strpos(v_source, v_fixed_fragment) > 0 THEN
    IF pg_catalog.strpos(v_source, v_broken_fragment) > 0 THEN
      RAISE EXCEPTION 'sql154_mixed_body_mismatch';
    END IF;
    RETURN;
  END IF;

  v_broken_position := pg_catalog.strpos(v_source, v_broken_fragment);
  IF v_broken_position = 0
     OR pg_catalog.strpos(
       pg_catalog.substr(v_source, 1, v_broken_position - 1)
       || pg_catalog.substr(
         v_source,
         v_broken_position + pg_catalog.length(v_broken_fragment)
       ),
       v_broken_fragment
     ) > 0 THEN
    RAISE EXCEPTION 'sql154_broken_fragment_not_exactly_once';
  END IF;

  v_fixed_source := pg_catalog.replace(
    v_source, v_broken_fragment, v_fixed_fragment
  );

  EXECUTE pg_catalog.format(
    'CREATE OR REPLACE FUNCTION public.teskeid_event_list_scoped_participations_v3(p_actor_id uuid) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = %L AS %L',
    '', v_fixed_source
  );
END;
$sql154$;

ALTER FUNCTION public.teskeid_event_list_scoped_participations_v3(uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION
  public.teskeid_event_list_scoped_participations_v3(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.teskeid_event_list_scoped_participations_v3(uuid)
  TO service_role;

DO $sql154_postflight$
DECLARE
  v_source text;
BEGIN
  SELECT pg_catalog.replace(procedure_row.prosrc, E'\r\n', E'\n')
  INTO v_source
  FROM pg_catalog.pg_proc AS procedure_row
  WHERE procedure_row.oid = pg_catalog.to_regprocedure(
    'public.teskeid_event_list_scoped_participations_v3(uuid)'
  );
  IF v_source IS NULL
     OR pg_catalog.md5(v_source) <> '0269211156c600c6411ecf0590eff295'
     OR NOT pg_catalog.has_function_privilege(
       'service_role',
       'public.teskeid_event_list_scoped_participations_v3(uuid)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'anon',
       'public.teskeid_event_list_scoped_participations_v3(uuid)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'authenticated',
       'public.teskeid_event_list_scoped_participations_v3(uuid)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'sql154_postflight_mismatch';
  END IF;
END;
$sql154_postflight$;

COMMIT;
