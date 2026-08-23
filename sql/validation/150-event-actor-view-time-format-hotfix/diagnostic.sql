-- SQL150 catalog hash diagnostic (100% read-only).
-- Returns function names and body hashes only; no Event/auth/user data.
WITH expected(signature, expected_source_md5) AS (
  VALUES
    ('public.teskeid_event_get_actor_view_v2(uuid,uuid)',
      'eb2da9a9c2c0463f76636ded02a6747a'),
    ('public.teskeid_event_private_normalize_shared_name_v2(text)',
      'd118ab08bc0346cdf31519344a2f65a7'),
    ('public.teskeid_event_private_format_utc_timestamp_v2(timestamp with time zone)',
      '7017190619681901af3813e1fc3b305c'),
    ('public.teskeid_event_private_claim_participations_v2(uuid)',
      'b57bf9fa43754dfcd05cb7e063829bc6'),
    ('public.teskeid_event_private_assert_viewer_v2(uuid,uuid)',
      '211fbfb65b4edaa4b0307c2fb5878a60'),
    ('public.teskeid_event_private_people_projection_v2(uuid,uuid,text)',
      '2eb6db6c327de83f1bf241f9368c3a0c')
)
SELECT
  expected.signature,
  procedure_row.oid IS NOT NULL AS exists_ok,
  expected.expected_source_md5,
  pg_catalog.md5(pg_catalog.replace(
    procedure_row.prosrc, E'\r\n', E'\n'
  )) AS normalized_source_md5,
  pg_catalog.md5(pg_catalog.replace(
    procedure_row.prosrc, E'\r\n', E'\n'
  )) = expected.expected_source_md5
    AS source_exact_ok,
  owner_role.rolname AS actual_owner,
  language_row.lanname AS actual_language,
  procedure_row.prosecdef AS actual_security_definer,
  procedure_row.provolatile AS actual_volatility,
  procedure_row.proparallel AS actual_parallel,
  procedure_row.proconfig AS actual_config
FROM expected
LEFT JOIN pg_catalog.pg_proc AS procedure_row
  ON procedure_row.oid = pg_catalog.to_regprocedure(expected.signature)
LEFT JOIN pg_catalog.pg_roles AS owner_role
  ON owner_role.oid = procedure_row.proowner
LEFT JOIN pg_catalog.pg_language AS language_row
  ON language_row.oid = procedure_row.prolang
ORDER BY expected.signature;
