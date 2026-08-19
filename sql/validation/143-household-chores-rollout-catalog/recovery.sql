-- SQL143 recovery inventory. Read-only and non-destructive. Run only in a
-- fresh editor session after an SQL143 error, then share this one safe row.

BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = pg_catalog, public;
SET LOCAL quote_all_identifiers = off;

WITH
feature_contract AS (
  SELECT
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint AS constraint_row
      WHERE constraint_row.conrelid =
        pg_catalog.to_regclass('public.feature_access')
        AND constraint_row.conname = 'feature_access_feature_key_check'
        AND constraint_row.contype = 'c'
        AND constraint_row.convalidated
        AND pg_catalog.md5(pg_catalog.lower(pg_catalog.pg_get_expr(
          constraint_row.conbin, constraint_row.conrelid, false
        ))) = '97736909cf1a3a5432eeb34275cf3cfc'
        AND (SELECT pg_catalog.array_agg(match_row.value[1]
          ORDER BY match_row.value[1] COLLATE "C")
          FROM pg_catalog.regexp_matches(pg_catalog.pg_get_expr(
            constraint_row.conbin, constraint_row.conrelid, false
          ), '''([^'']+)''', 'g') AS match_row(value)) = ARRAY[
            'afmaeli-og-vidburdir', 'agent-collaboration-private-beta',
            'auglysandi', 'bokanir', 'bokhaldid', 'elta-vedrid',
            'facebook-oauth', 'ferdalagid', 'kviss',
            'road-intelligence-v1', 'tengsl', 'teskeid-routing-v1',
            'umonnun', 'utlagt-og-endurgreitt', 'vedrid',
            'weather-provider-vedurstofan', 'weather-provider-vegagerdin',
            'weather-pulse'
          ]::text[]
    ) AS baseline_ok,
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint AS constraint_row
      WHERE constraint_row.conrelid =
        pg_catalog.to_regclass('public.feature_access')
        AND constraint_row.conname = 'feature_access_feature_key_check'
        AND constraint_row.contype = 'c'
        AND constraint_row.convalidated
        AND pg_catalog.md5(pg_catalog.lower(pg_catalog.pg_get_expr(
          constraint_row.conbin, constraint_row.conrelid, false
        ))) = 'fefe253894973ff1ee1d7d56da941a07'
        AND (SELECT pg_catalog.array_agg(match_row.value[1]
          ORDER BY match_row.value[1] COLLATE "C")
          FROM pg_catalog.regexp_matches(pg_catalog.pg_get_expr(
            constraint_row.conbin, constraint_row.conrelid, false
          ), '''([^'']+)''', 'g') AS match_row(value)) = ARRAY[
            'afmaeli-og-vidburdir', 'agent-collaboration-private-beta',
            'auglysandi', 'bokanir', 'bokhaldid', 'elta-vedrid',
            'facebook-oauth', 'ferdalagid', 'heimilisverkin', 'kviss',
            'road-intelligence-v1', 'tengsl', 'teskeid-routing-v1',
            'umonnun', 'utlagt-og-endurgreitt', 'vedrid',
            'weather-provider-vedurstofan', 'weather-provider-vegagerdin',
            'weather-pulse'
          ]::text[]
    ) AS target_ok
),
feature_security AS (
  SELECT
    owner_role.rolname = 'postgres'
      AND relation_row.relkind = 'r'
      AND relation_row.relpersistence = 'p'
      AND relation_row.relreplident = 'd'
      AND relation_row.relrowsecurity
      AND NOT relation_row.relforcerowsecurity
      AND relation_row.reloptions IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_policy AS policy_row
        WHERE policy_row.polrelid = relation_row.oid
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_attribute AS attribute_row
        WHERE attribute_row.attrelid = relation_row.oid
          AND attribute_row.attnum > 0
          AND NOT attribute_row.attisdropped
          AND attribute_row.attacl IS NOT NULL
      ) AS relation_metadata_ok,
    (SELECT pg_catalog.count(*)
     FROM pg_catalog.aclexplode(COALESCE(
       relation_row.relacl,
       pg_catalog.acldefault('r', relation_row.relowner)
     )) AS acl_row) AS acl_count,
    NOT EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(COALESCE(
        relation_row.relacl,
        pg_catalog.acldefault('r', relation_row.relowner)
      )) AS acl_row
      LEFT JOIN pg_catalog.pg_roles AS grantee_role
        ON grantee_role.oid = acl_row.grantee
      WHERE acl_row.grantor <> relation_row.relowner
         OR acl_row.grantee = 0
         OR acl_row.is_grantable
         OR NOT (
           (acl_row.grantee = relation_row.relowner
            AND acl_row.privilege_type IN (
              'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
              'REFERENCES', 'TRIGGER', 'MAINTAIN'
            ))
           OR (grantee_role.rolname IS NOT DISTINCT FROM 'service_role'
            AND acl_row.privilege_type IN (
              'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
              'REFERENCES', 'TRIGGER', 'MAINTAIN'
            ))
         )
    ) AS prestate_acl_members_exact,
    NOT EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(COALESCE(
        relation_row.relacl,
        pg_catalog.acldefault('r', relation_row.relowner)
      )) AS acl_row
      LEFT JOIN pg_catalog.pg_roles AS grantee_role
        ON grantee_role.oid = acl_row.grantee
      WHERE acl_row.grantor <> relation_row.relowner
         OR acl_row.grantee = 0
         OR acl_row.is_grantable
         OR NOT (
           (acl_row.grantee = relation_row.relowner
            AND acl_row.privilege_type IN (
              'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
              'REFERENCES', 'TRIGGER', 'MAINTAIN'
            ))
           OR (grantee_role.rolname IS NOT DISTINCT FROM 'service_role'
            AND acl_row.privilege_type IN ('SELECT', 'INSERT', 'DELETE'))
         )
    ) AS target_acl_members_exact
  FROM pg_catalog.pg_class AS relation_row
  JOIN pg_catalog.pg_namespace AS namespace_row
    ON namespace_row.oid = relation_row.relnamespace
  JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = relation_row.relowner
  WHERE namespace_row.nspname = 'public'
    AND relation_row.relname = 'feature_access'
),
target_objects AS (
  SELECT
    (SELECT pg_catalog.count(*)
     FROM pg_catalog.pg_proc AS procedure_row
     JOIN pg_catalog.pg_namespace AS namespace_row
       ON namespace_row.oid = procedure_row.pronamespace
     WHERE namespace_row.nspname = 'public'
       AND pg_catalog.left(
         procedure_row.proname::text,
         pg_catalog.char_length('feature_access_heimilisverkin_')
       ) = 'feature_access_heimilisverkin_') AS function_count,
    (SELECT pg_catalog.count(*)
     FROM pg_catalog.pg_trigger AS trigger_row
     JOIN pg_catalog.pg_class AS relation_row
       ON relation_row.oid = trigger_row.tgrelid
     JOIN pg_catalog.pg_namespace AS namespace_row
       ON namespace_row.oid = relation_row.relnamespace
     WHERE NOT trigger_row.tgisinternal
       AND pg_catalog.left(
         trigger_row.tgname::text,
         pg_catalog.char_length('feature_access_heimilisverkin_')
       ) = 'feature_access_heimilisverkin_'
       AND ((namespace_row.nspname = 'public'
         AND relation_row.relname = 'feature_access')
         OR (namespace_row.nspname = 'auth'
           AND relation_row.relname = 'users'))) AS trigger_count
),
idea_state AS (
  SELECT
    (SELECT pg_catalog.count(*) FROM public.ideas AS idea_row
     WHERE idea_row.slug = 'fyrsta-vakt-krakkanna') = 1
      AS legacy_slug_exactly_once,
    NOT EXISTS (
      SELECT 1 FROM public.ideas AS idea_row
      WHERE idea_row.slug IN ('heimilisverkin', 'verkefnin')
    ) AS replacement_slug_absent,
    EXISTS (
      SELECT 1 FROM public.ideas AS idea_row
      WHERE idea_row.slug = 'fyrsta-vakt-krakkanna'
        AND idea_row.title = 'Fyrsta vakt krakkanna'
        AND idea_row.short_description =
          'Krakkar safna stigum fyrir heimilisverk og fá sitt fyrsta bragð af ábyrgð, umbun og eigin vakt.'
        AND idea_row.problem_description =
          'Börn vilja oft hjálpa, en heimilisverk verða fljótt að nöldri, mútum eða einhverju sem gleymist. Foreldrar þurfa að minna á allt og krakkar sjá ekki alltaf tenginguna milli ábyrgðar, þátttöku og umbunar.'
        AND idea_row.possible_solution =
          'Einfalt kerfi þar sem krakkar fá verkefni við hæfi, safna stigum og sjá hvernig þeirra framlag skiptir máli. Fyrsta litla vaktin þeirra, með ábyrgð, hvatningu og umbun sem fjölskyldan getur stillt saman.'
        AND idea_row.category::text = 'Börn'
    ) AS original_copy_ok,
    EXISTS (
      SELECT 1 FROM public.ideas AS idea_row
      WHERE idea_row.slug = 'fyrsta-vakt-krakkanna'
        AND idea_row.title = 'Verkefnin'
        AND idea_row.short_description =
          'Sameiginlegt yfirlit yfir verkefni, úthlutanir, verklok og stig.'
        AND idea_row.problem_description =
          'Verkefni og ábyrgð dreifast auðveldlega á milli samtala, miða og minnis. Þá verður óljóst hvað þarf að gera, hver tekur verkefnið að sér og hvað er þegar búið.'
        AND idea_row.possible_solution =
          'Með Verkefnunum geturðu stofnað hringi fyrir mismunandi samhengi, skilgreint endurnýtanleg verkefni og stig og haldið utan um úthlutanir, verklok og sögu á einum stað.'
        AND idea_row.category::text = 'Annað'
    ) AS target_copy_ok
),
entitlements AS (
  SELECT NOT EXISTS (
    SELECT 1 FROM public.feature_access AS access_row
    WHERE access_row.feature_key = 'heimilisverkin'
  ) AS none_present
),
hc_relation_contract AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
    relation_row.relname::text, relation_row.relkind::text,
    relation_row.relpersistence::text, relation_row.relreplident::text,
    tablespace_row.spcname,
    COALESCE((SELECT pg_catalog.jsonb_agg(option_row.option_value
      ORDER BY option_row.option_value COLLATE "C")
      FROM pg_catalog.unnest(COALESCE(
        relation_row.reloptions, ARRAY[]::text[]
      )) AS option_row(option_value)), '[]'::jsonb)
  ) ORDER BY relation_row.relname::text COLLATE "C"), '[]'::jsonb) AS value
  FROM pg_catalog.pg_class AS relation_row
  JOIN pg_catalog.pg_namespace AS relation_namespace
    ON relation_namespace.oid = relation_row.relnamespace
  LEFT JOIN pg_catalog.pg_tablespace AS tablespace_row
    ON tablespace_row.oid = relation_row.reltablespace
  WHERE relation_namespace.nspname = 'public'
    AND pg_catalog.left(relation_row.relname::text, 16) = 'household_chore_'
    AND relation_row.relkind = 'r'
),
hc_column_contract AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
    relation_row.relname::text, attribute_row.attnum,
    attribute_row.attname::text,
    pg_catalog.format_type(attribute_row.atttypid, attribute_row.atttypmod),
    attribute_row.attnotnull, attribute_row.attidentity::text,
    attribute_row.attgenerated::text, attribute_row.atthasdef,
    collation_namespace.nspname, collation_row.collname,
    pg_catalog.pg_get_expr(default_row.adbin, default_row.adrelid, false)
  ) ORDER BY relation_row.relname::text COLLATE "C", attribute_row.attnum),
  '[]'::jsonb) AS value
  FROM pg_catalog.pg_class AS relation_row
  JOIN pg_catalog.pg_namespace AS relation_namespace
    ON relation_namespace.oid = relation_row.relnamespace
  JOIN pg_catalog.pg_attribute AS attribute_row
    ON attribute_row.attrelid = relation_row.oid
  LEFT JOIN pg_catalog.pg_attrdef AS default_row
    ON default_row.adrelid = attribute_row.attrelid
   AND default_row.adnum = attribute_row.attnum
  LEFT JOIN pg_catalog.pg_collation AS collation_row
    ON collation_row.oid = attribute_row.attcollation
  LEFT JOIN pg_catalog.pg_namespace AS collation_namespace
    ON collation_namespace.oid = collation_row.collnamespace
  WHERE relation_namespace.nspname = 'public'
    AND pg_catalog.left(relation_row.relname::text, 16) = 'household_chore_'
    AND relation_row.relkind = 'r'
    AND attribute_row.attnum > 0 AND NOT attribute_row.attisdropped
),
hc_constraint_contract AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
    relation_row.relname::text, constraint_row.conname::text,
    constraint_row.contype::text, constraint_row.condeferrable,
    constraint_row.condeferred, constraint_row.convalidated,
    constraint_row.connoinherit, constraint_row.conislocal,
    constraint_row.coninhcount,
    pg_catalog.pg_get_constraintdef(constraint_row.oid, false)
  ) ORDER BY relation_row.relname::text COLLATE "C",
    constraint_row.conname::text COLLATE "C"), '[]'::jsonb) AS value
  FROM pg_catalog.pg_constraint AS constraint_row
  JOIN pg_catalog.pg_class AS relation_row
    ON relation_row.oid = constraint_row.conrelid
  JOIN pg_catalog.pg_namespace AS relation_namespace
    ON relation_namespace.oid = relation_row.relnamespace
  WHERE relation_namespace.nspname = 'public'
    AND pg_catalog.left(relation_row.relname::text, 16) = 'household_chore_'
    AND relation_row.relkind = 'r'
),
hc_index_contract AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
    relation_row.relname::text, index_namespace.nspname::text,
    index_relation.relname::text, access_method.amname::text,
    index_row.indisunique, index_row.indisprimary, index_row.indisexclusion,
    index_row.indimmediate, index_row.indisclustered, index_row.indisvalid,
    index_row.indisready, index_row.indislive, index_row.indisreplident,
    index_row.indnkeyatts, index_row.indnatts, tablespace_row.spcname,
    COALESCE((SELECT pg_catalog.jsonb_agg(option_row.option_value
      ORDER BY option_row.option_value COLLATE "C")
      FROM pg_catalog.unnest(COALESCE(
        index_relation.reloptions, ARRAY[]::text[]
      )) AS option_row(option_value)), '[]'::jsonb),
    pg_catalog.pg_get_indexdef(index_row.indexrelid, 0, false)
  ) ORDER BY relation_row.relname::text COLLATE "C",
    index_namespace.nspname::text COLLATE "C",
    index_relation.relname::text COLLATE "C"), '[]'::jsonb) AS value
  FROM pg_catalog.pg_index AS index_row
  JOIN pg_catalog.pg_class AS relation_row ON relation_row.oid = index_row.indrelid
  JOIN pg_catalog.pg_namespace AS relation_namespace
    ON relation_namespace.oid = relation_row.relnamespace
  JOIN pg_catalog.pg_class AS index_relation
    ON index_relation.oid = index_row.indexrelid
  JOIN pg_catalog.pg_namespace AS index_namespace
    ON index_namespace.oid = index_relation.relnamespace
  JOIN pg_catalog.pg_am AS access_method ON access_method.oid = index_relation.relam
  LEFT JOIN pg_catalog.pg_tablespace AS tablespace_row
    ON tablespace_row.oid = index_relation.reltablespace
  WHERE relation_namespace.nspname = 'public'
    AND pg_catalog.left(relation_row.relname::text, 16) = 'household_chore_'
    AND relation_row.relkind = 'r'
),
hc_shared_index_contract AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
    relation_namespace.nspname::text, relation_row.relname::text,
    index_namespace.nspname::text, index_relation.relname::text,
    access_method.amname::text, index_row.indisunique,
    index_row.indisprimary, index_row.indisexclusion,
    index_row.indimmediate, index_row.indisclustered, index_row.indisvalid,
    index_row.indisready, index_row.indislive, index_row.indisreplident,
    index_row.indnkeyatts, index_row.indnatts, tablespace_row.spcname,
    COALESCE((SELECT pg_catalog.jsonb_agg(option_row.option_value
      ORDER BY option_row.option_value COLLATE "C")
      FROM pg_catalog.unnest(COALESCE(
        index_relation.reloptions, ARRAY[]::text[]
      )) AS option_row(option_value)), '[]'::jsonb),
    pg_catalog.pg_get_indexdef(index_row.indexrelid, 0, false)
  ) ORDER BY index_namespace.nspname::text COLLATE "C",
    index_relation.relname::text COLLATE "C"), '[]'::jsonb) AS value
  FROM pg_catalog.pg_index AS index_row
  JOIN pg_catalog.pg_class AS relation_row ON relation_row.oid = index_row.indrelid
  JOIN pg_catalog.pg_namespace AS relation_namespace
    ON relation_namespace.oid = relation_row.relnamespace
  JOIN pg_catalog.pg_class AS index_relation
    ON index_relation.oid = index_row.indexrelid
  JOIN pg_catalog.pg_namespace AS index_namespace
    ON index_namespace.oid = index_relation.relnamespace
  JOIN pg_catalog.pg_am AS access_method ON access_method.oid = index_relation.relam
  LEFT JOIN pg_catalog.pg_tablespace AS tablespace_row
    ON tablespace_row.oid = index_relation.reltablespace
  WHERE relation_namespace.nspname = 'public'
    AND relation_row.relname = 'recent_events'
    AND index_namespace.nspname = 'public'
    AND index_relation.relname = 'recent_events_household_chore_entity_idx'
),
hc_sequence_contract AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
    sequence_namespace.nspname::text, sequence_relation.relname::text,
    pg_catalog.format_type(sequence_row.seqtypid, NULL), sequence_row.seqstart,
    sequence_row.seqincrement, sequence_row.seqmax, sequence_row.seqmin,
    sequence_row.seqcache, sequence_row.seqcycle
  ) ORDER BY sequence_namespace.nspname::text COLLATE "C",
    sequence_relation.relname::text COLLATE "C"), '[]'::jsonb) AS value
  FROM pg_catalog.pg_sequence AS sequence_row
  JOIN pg_catalog.pg_class AS sequence_relation
    ON sequence_relation.oid = sequence_row.seqrelid
  JOIN pg_catalog.pg_namespace AS sequence_namespace
    ON sequence_namespace.oid = sequence_relation.relnamespace
  WHERE sequence_namespace.nspname = 'public'
    AND sequence_relation.relname = 'household_chore_rate_events_id_seq'
),
hc_function_contract AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
    function_row.proname::text,
    pg_catalog.pg_get_function_identity_arguments(function_row.oid),
    pg_catalog.pg_get_function_arguments(function_row.oid),
    pg_catalog.pg_get_function_result(function_row.oid),
    pg_catalog.pg_get_functiondef(function_row.oid)
  ) ORDER BY function_row.proname::text COLLATE "C",
    pg_catalog.pg_get_function_identity_arguments(function_row.oid)
      COLLATE "C"), '[]'::jsonb) AS value
  FROM pg_catalog.pg_proc AS function_row
  JOIN pg_catalog.pg_namespace AS function_namespace
    ON function_namespace.oid = function_row.pronamespace
  WHERE function_namespace.nspname = 'public'
    AND pg_catalog.left(function_row.proname::text, 16) = 'household_chore_'
),
hc_trigger_contract AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
    relation_namespace.nspname::text, relation_row.relname::text,
    trigger_row.tgname::text,
    pg_catalog.pg_get_triggerdef(trigger_row.oid, false)
  ) ORDER BY relation_namespace.nspname::text COLLATE "C",
    relation_row.relname::text COLLATE "C",
    trigger_row.tgname::text COLLATE "C"), '[]'::jsonb) AS value
  FROM pg_catalog.pg_trigger AS trigger_row
  JOIN pg_catalog.pg_class AS relation_row ON relation_row.oid = trigger_row.tgrelid
  JOIN pg_catalog.pg_namespace AS relation_namespace
    ON relation_namespace.oid = relation_row.relnamespace
  WHERE NOT trigger_row.tgisinternal
    AND ((relation_namespace.nspname = 'public'
      AND pg_catalog.left(relation_row.relname::text, 16) = 'household_chore_')
      OR (relation_namespace.nspname = 'auth'
        AND relation_row.relname = 'users'
        AND trigger_row.tgname = 'household_chore_auth_delete_guard'))
),
sql142_seal AS (
  SELECT EXISTS (
    SELECT 1
    FROM (
      SELECT pg_catalog.obj_description(
        pg_catalog.to_regclass('public.household_chore_circles'), 'pg_class'
      ) AS stored_comment,
      pg_catalog.current_setting('server_version_num') AS server_version_num,
      pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'contract_version', 1, 'relations', hc_relation_contract.value,
          'columns', hc_column_contract.value,
          'constraints', hc_constraint_contract.value,
          'indexes', hc_index_contract.value,
          'shared_indexes', hc_shared_index_contract.value,
          'sequences', hc_sequence_contract.value,
          'functions', hc_function_contract.value,
          'triggers', hc_trigger_contract.value
        )::text, 'UTF8'
      )), 'hex') AS current_digest
      FROM hc_relation_contract CROSS JOIN hc_column_contract
      CROSS JOIN hc_constraint_contract CROSS JOIN hc_index_contract
      CROSS JOIN hc_shared_index_contract CROSS JOIN hc_sequence_contract
      CROSS JOIN hc_function_contract CROSS JOIN hc_trigger_contract
    ) AS seal_row
    WHERE COALESCE(seal_row.stored_comment ~
      '^teskeid:sql142:catalog-v1:[0-9]{5,8}:[0-9a-f]{64}$', false)
      AND pg_catalog.split_part(seal_row.stored_comment, ':', 4) =
        seal_row.server_version_num
      AND pg_catalog.split_part(seal_row.stored_comment, ':', 5) =
        seal_row.current_digest
  ) AS ok
),
state AS (
  SELECT
    CASE
      WHEN feature_contract.baseline_ok
        AND feature_security.relation_metadata_ok
        AND feature_security.acl_count = 16
        AND feature_security.prestate_acl_members_exact
        AND target_objects.function_count = 0
        AND target_objects.trigger_count = 0
        AND idea_state.original_copy_ok
        THEN 'baseline'
      WHEN feature_contract.target_ok
        AND feature_security.relation_metadata_ok
        AND feature_security.acl_count = 11
        AND feature_security.target_acl_members_exact
        AND idea_state.target_copy_ok
        THEN 'target_or_partial_target'
      ELSE 'unexpected_or_partial'
    END AS migration_state,
    feature_contract.baseline_ok,
    feature_contract.target_ok,
    feature_security.relation_metadata_ok,
    feature_security.acl_count,
    feature_security.prestate_acl_members_exact,
    feature_security.target_acl_members_exact,
    target_objects.function_count,
    target_objects.trigger_count,
    idea_state.legacy_slug_exactly_once,
    idea_state.replacement_slug_absent,
    idea_state.original_copy_ok,
    idea_state.target_copy_ok,
    entitlements.none_present,
    sql142_seal.ok AS sql142_catalog_unchanged_ok
  FROM feature_contract CROSS JOIN feature_security
  CROSS JOIN target_objects CROSS JOIN idea_state
  CROSS JOIN entitlements CROSS JOIN sql142_seal
)
SELECT
  pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.clock_timestamp() AS checked_at,
  state.migration_state,
  state.baseline_ok AS baseline_feature_constraint_ok,
  state.target_ok AS target_feature_constraint_ok,
  state.relation_metadata_ok AS feature_relation_metadata_ok,
  state.acl_count AS feature_acl_count,
  (state.acl_count = 16 AND state.prestate_acl_members_exact)
    AS feature_acl_prestate_exact_ok,
  (state.acl_count = 11 AND state.target_acl_members_exact)
    AS feature_acl_target_exact_ok,
  state.function_count AS target_function_count,
  state.trigger_count AS target_trigger_count,
  state.legacy_slug_exactly_once,
  state.replacement_slug_absent,
  state.original_copy_ok,
  state.target_copy_ok,
  state.none_present AS no_household_entitlements_ok,
  state.sql142_catalog_unchanged_ok,
  true AS manual_review_required,
  true AS recovery_is_read_only
FROM state;

ROLLBACK;
