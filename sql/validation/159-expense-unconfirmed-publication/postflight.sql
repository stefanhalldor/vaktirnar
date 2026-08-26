-- SQL159 postflight (100% read-only).
-- Run immediately after SQL159, during the short quiescent rollout window.
BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL search_path = '';
SET LOCAL timezone = 'UTC';

WITH executor_contract AS (
  SELECT current_user = 'postgres' AND session_user = 'postgres'
    AS executor_ok
), expected_relations(relation_name) AS (VALUES
  ('expense_unconfirmed_publications'),
  ('expense_unconfirmed_publication_parties'),
  ('expense_unconfirmed_publication_audience'),
  ('expense_unconfirmed_finalizations'),
  ('expense_private_draft_tombstones'),
  ('expense_sql159_install_baseline')
), relation_contract AS (
  SELECT pg_catalog.count(relation.oid) = 6
    AND COALESCE(pg_catalog.bool_and(
      relation.relkind = 'r'
      AND relation.relpersistence = 'p'
      AND relation.relispartition = false
      AND relation.relrowsecurity
      AND relation.relforcerowsecurity
      AND relation.relreplident = 'd'
      AND relation.reltablespace = 0
      AND pg_catalog.cardinality(COALESCE(
        relation.reloptions, ARRAY[]::text[]
      )) = 0
      AND pg_catalog.pg_get_userbyid(relation.relowner) = 'postgres'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_policy AS policy_row
        WHERE policy_row.polrelid = relation.oid
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute AS attribute_row
        WHERE attribute_row.attrelid = relation.oid
          AND attribute_row.attnum > 0
          AND NOT attribute_row.attisdropped
          AND attribute_row.attacl IS NOT NULL
      )
      AND (
        SELECT pg_catalog.count(*) = 7 + CASE
          WHEN pg_catalog.current_setting('server_version_num')::integer
            >= 170000 THEN 1 ELSE 0 END
        FROM pg_catalog.aclexplode(COALESCE(
          relation.relacl,
          pg_catalog.acldefault('r', relation.relowner)
        )) AS privilege_row
        WHERE privilege_row.grantee = relation.relowner
          AND privilege_row.grantor = relation.relowner
          AND NOT privilege_row.is_grantable
          AND privilege_row.privilege_type IN (
            'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
            'REFERENCES', 'TRIGGER', 'MAINTAIN'
          )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(
          relation.relacl,
          pg_catalog.acldefault('r', relation.relowner)
        )) AS privilege_row
        WHERE privilege_row.grantee <> relation.relowner
           OR privilege_row.grantor <> relation.relowner
           OR privilege_row.is_grantable
           OR privilege_row.privilege_type NOT IN (
             'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
             'REFERENCES', 'TRIGGER', 'MAINTAIN'
           )
      )
    ), false) AS relations_private_exact
  FROM expected_relations AS expected
  LEFT JOIN pg_catalog.pg_class AS relation
    ON relation.oid = pg_catalog.to_regclass(
      'public.' || expected.relation_name
    )
), expected_columns(
  relation_name, ordinal_position, column_name, type_name,
  is_not_null, default_kind
) AS (VALUES
  ('expense_unconfirmed_publications', 1, 'draft_id', 'uuid', true, 'none'),
  ('expense_unconfirmed_publications', 2, 'publication_id', 'uuid', true, 'none'),
  ('expense_unconfirmed_publications', 3, 'actor_user_id', 'uuid', true, 'none'),
  ('expense_unconfirmed_publications', 4, 'publication_version', 'bigint', true, 'none'),
  ('expense_unconfirmed_publications', 5, 'is_live', 'boolean', true, 'none'),
  ('expense_unconfirmed_publications', 6, 'source_draft_version', 'bigint', false, 'none'),
  ('expense_unconfirmed_publications', 7, 'shareable_fingerprint', 'text', false, 'none'),
  ('expense_unconfirmed_publications', 8, 'authority_fingerprint', 'text', false, 'none'),
  ('expense_unconfirmed_publications', 9, 'context_type', 'text', false, 'none'),
  ('expense_unconfirmed_publications', 10, 'group_id', 'uuid', false, 'none'),
  ('expense_unconfirmed_publications', 11, 'event_id', 'uuid', false, 'none'),
  ('expense_unconfirmed_publications', 12, 'event_roster_revision', 'bigint', false, 'none'),
  ('expense_unconfirmed_publications', 13, 'link_to_event', 'boolean', false, 'none'),
  ('expense_unconfirmed_publications', 14, 'visibility', 'text', false, 'none'),
  ('expense_unconfirmed_publications', 15, 'title', 'text', false, 'none'),
  ('expense_unconfirmed_publications', 16, 'total_minor', 'bigint', false, 'none'),
  ('expense_unconfirmed_publications', 17, 'currency', 'text', false, 'none'),
  ('expense_unconfirmed_publications', 18, 'incurred_on', 'date', false, 'none'),
  ('expense_unconfirmed_publications', 19, 'allocation_state', 'text', false, 'none'),
  ('expense_unconfirmed_publications', 20, 'created_at', 'timestamp with time zone', true, 'now'),
  ('expense_unconfirmed_publications', 21, 'published_at', 'timestamp with time zone', false, 'none'),
  ('expense_unconfirmed_publications', 22, 'updated_at', 'timestamp with time zone', true, 'now'),
  ('expense_unconfirmed_publications', 23, 'withdrawn_at', 'timestamp with time zone', false, 'none'),

  ('expense_unconfirmed_publication_parties', 1, 'draft_id', 'uuid', true, 'none'),
  ('expense_unconfirmed_publication_parties', 2, 'allocation_state', 'text', true, 'none'),
  ('expense_unconfirmed_publication_parties', 3, 'ordinal', 'smallint', true, 'none'),
  ('expense_unconfirmed_publication_parties', 4, 'party_key_hash', 'text', true, 'none'),
  ('expense_unconfirmed_publication_parties', 5, 'identity_token_hash', 'text', true, 'none'),
  ('expense_unconfirmed_publication_parties', 6, 'display_name', 'text', true, 'none'),
  ('expense_unconfirmed_publication_parties', 7, 'is_author', 'boolean', true, 'none'),
  ('expense_unconfirmed_publication_parties', 8, 'is_payer', 'boolean', true, 'none'),
  ('expense_unconfirmed_publication_parties', 9, 'is_participant', 'boolean', true, 'none'),
  ('expense_unconfirmed_publication_parties', 10, 'paid_minor', 'bigint', false, 'none'),
  ('expense_unconfirmed_publication_parties', 11, 'share_minor', 'bigint', false, 'none'),
  ('expense_unconfirmed_publication_parties', 12, 'created_at', 'timestamp with time zone', true, 'now'),

  ('expense_unconfirmed_publication_audience', 1, 'draft_id', 'uuid', true, 'none'),
  ('expense_unconfirmed_publication_audience', 2, 'user_id', 'uuid', true, 'none'),
  ('expense_unconfirmed_publication_audience', 3, 'audience_kind', 'text', true, 'none'),
  ('expense_unconfirmed_publication_audience', 4, 'identity_token_hash', 'text', false, 'none'),
  ('expense_unconfirmed_publication_audience', 5, 'binding_id', 'uuid', false, 'none'),
  ('expense_unconfirmed_publication_audience', 6, 'binding_generation', 'bigint', false, 'none'),
  ('expense_unconfirmed_publication_audience', 7, 'created_at', 'timestamp with time zone', true, 'now'),

  ('expense_unconfirmed_finalizations', 1, 'draft_id', 'uuid', true, 'none'),
  ('expense_unconfirmed_finalizations', 2, 'actor_user_id', 'uuid', true, 'none'),
  ('expense_unconfirmed_finalizations', 3, 'request_id', 'uuid', true, 'none'),
  ('expense_unconfirmed_finalizations', 4, 'request_fingerprint', 'text', true, 'none'),
  ('expense_unconfirmed_finalizations', 5, 'contract_version', 'smallint', true, 'none'),
  ('expense_unconfirmed_finalizations', 6, 'expected_draft_version', 'bigint', true, 'none'),
  ('expense_unconfirmed_finalizations', 7, 'expected_publication_version', 'bigint', false, 'none'),
  ('expense_unconfirmed_finalizations', 8, 'final_publication_version', 'bigint', false, 'none'),
  ('expense_unconfirmed_finalizations', 9, 'publication_id', 'uuid', false, 'none'),
  ('expense_unconfirmed_finalizations', 10, 'shareable_fingerprint', 'text', true, 'none'),
  ('expense_unconfirmed_finalizations', 11, 'allocation_fingerprint', 'text', true, 'none'),
  ('expense_unconfirmed_finalizations', 12, 'group_id', 'uuid', true, 'none'),
  ('expense_unconfirmed_finalizations', 13, 'expense_id', 'uuid', true, 'none'),
  ('expense_unconfirmed_finalizations', 14, 'invitation_ids', 'uuid[]', true, 'empty_uuid_array'),
  ('expense_unconfirmed_finalizations', 15, 'finalized_at', 'timestamp with time zone', true, 'now'),

  ('expense_private_draft_tombstones', 1, 'draft_id', 'uuid', true, 'none'),

  ('expense_sql159_install_baseline', 1, 'singleton', 'boolean', true, 'true'),
  ('expense_sql159_install_baseline', 2, 'installed_at', 'timestamp with time zone', true, 'now'),
  ('expense_sql159_install_baseline', 3, 'predecessor_contract', 'jsonb', true, 'none'),
  ('expense_sql159_install_baseline', 4, 'writer_set_digest', 'text', true, 'none'),
  ('expense_sql159_install_baseline', 5, 'protected_count', 'bigint', true, 'none'),
  ('expense_sql159_install_baseline', 6, 'protected_digest', 'text', true, 'none'),
  ('expense_sql159_install_baseline', 7, 'request_count', 'bigint', true, 'none'),
  ('expense_sql159_install_baseline', 8, 'request_digest', 'text', true, 'none'),
  ('expense_sql159_install_baseline', 9, 'draft_count', 'bigint', true, 'none'),
  ('expense_sql159_install_baseline', 10, 'draft_digest', 'text', true, 'none'),
  ('expense_sql159_install_baseline', 11, 'new_relations_began_empty', 'boolean', true, 'none')
), column_contract AS (
  SELECT pg_catalog.count(attribute_row.attnum) = 69
    AND COALESCE(pg_catalog.bool_and(
      attribute_row.attnum = expected.ordinal_position
      AND pg_catalog.format_type(
        attribute_row.atttypid, attribute_row.atttypmod
      ) = expected.type_name
      AND attribute_row.attnotnull = expected.is_not_null
      AND attribute_row.attidentity = ''
      AND attribute_row.attgenerated = ''
      AND CASE expected.default_kind
        WHEN 'none' THEN default_row.oid IS NULL
        WHEN 'now' THEN pg_catalog.pg_get_expr(
          default_row.adbin, default_row.adrelid
        ) = 'now()'
        WHEN 'true' THEN pg_catalog.pg_get_expr(
          default_row.adbin, default_row.adrelid
        ) = 'true'
        WHEN 'empty_uuid_array' THEN pg_catalog.pg_get_expr(
          default_row.adbin, default_row.adrelid
        ) IN ('''{}''::uuid[]', 'ARRAY[]::uuid[]')
        ELSE false
      END
    ), false)
    AND (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.pg_attribute AS actual_attribute
      WHERE actual_attribute.attrelid IN (
        pg_catalog.to_regclass('public.expense_unconfirmed_publications'),
        pg_catalog.to_regclass('public.expense_unconfirmed_publication_parties'),
        pg_catalog.to_regclass('public.expense_unconfirmed_publication_audience'),
        pg_catalog.to_regclass('public.expense_unconfirmed_finalizations'),
        pg_catalog.to_regclass('public.expense_private_draft_tombstones'),
        pg_catalog.to_regclass('public.expense_sql159_install_baseline')
      )
        AND actual_attribute.attnum > 0
        AND NOT actual_attribute.attisdropped
    ) = 69 AS columns_exact
  FROM expected_columns AS expected
  LEFT JOIN pg_catalog.pg_attribute AS attribute_row
    ON attribute_row.attrelid = pg_catalog.to_regclass(
      'public.' || expected.relation_name
    )
   AND attribute_row.attname = expected.column_name
   AND attribute_row.attnum > 0
   AND NOT attribute_row.attisdropped
  LEFT JOIN pg_catalog.pg_attrdef AS default_row
    ON default_row.adrelid = attribute_row.attrelid
   AND default_row.adnum = attribute_row.attnum
), expected_constraints(
  relation_name, constraint_name, constraint_type, exact_definition
) AS (VALUES
  ('expense_unconfirmed_publications', 'expense_unconfirmed_publications_pkey', 'p', 'primarykeydraft_id'),
  ('expense_unconfirmed_publications', 'expense_unconfirmed_publications_publication_id_key', 'u', 'uniquepublication_id'),
  ('expense_unconfirmed_publications', 'expense_unconfirmed_publications_actor_user_id_fkey', 'f', 'foreignkeyactor_user_idreferencesauth.usersidondeletecascade'),
  ('expense_unconfirmed_publications', 'expense_unconfirmed_publications_version_check', 'c', 'checkpublication_version>=1andpublication_version<=9007199254740991'),
  ('expense_unconfirmed_publications', 'expense_unconfirmed_publications_fingerprint_check', 'c', 'checkshareable_fingerprintisnullorshareable_fingerprint~^[0-9a-f]{32}$andauthority_fingerprintisnullorauthority_fingerprint~^[0-9a-f]{32}$'),
  ('expense_unconfirmed_publications', 'expense_unconfirmed_publications_live_shape_check', 'c', 'checkis_liveandsource_draft_versionisnotnullandsource_draft_version>=1andsource_draft_version<=9007199254740991andshareable_fingerprintisnotnullandauthority_fingerprintisnotnullandcontext_typeisnotnullandcontext_type=anyarray[one_off,group]andvisibilityisnotnullandvisibility=anyarray[participants_only,all_event]andtitleisnotnullandchar_lengthbtrimtitle>=1andchar_lengthbtrimtitle<=200andtotal_minorisnotnullandtotal_minor>=1andtotal_minor<=9007199254740991andcurrencyisnotnullandcurrency=anyarray[isk,eur,usd,gbp,dkk,nok,sek]andincurred_onisnotnullandallocation_stateisnotnullandallocation_state=anyarray[incomplete,balanced_unconfirmed]andlink_to_eventisnotnullandcontext_type=groupandgroup_idisnotnullandevent_idisnullandevent_roster_revisionisnullandnotlink_to_eventandvisibility=participants_onlyorcontext_type=one_offandgroup_idisnullandevent_idisnullandevent_roster_revisionisnullandnotlink_to_eventorevent_idisnotnullandevent_roster_revisionisnotnullandevent_roster_revision>=1andevent_roster_revision<=9007199254740991andvisibility=participants_onlyorvisibility=all_eventandevent_idisnotnullandlink_to_eventandpublished_atisnotnullandwithdrawn_atisnullornotis_liveandsource_draft_versionisnullandshareable_fingerprintisnullandauthority_fingerprintisnullandcontext_typeisnullandgroup_idisnullandevent_idisnullandevent_roster_revisionisnullandlink_to_eventisnullandvisibilityisnullandtitleisnullandtotal_minorisnullandcurrencyisnullandincurred_onisnullandallocation_stateisnullandpublished_atisnotnullandwithdrawn_atisnotnull'),
  ('expense_unconfirmed_publications', 'expense_unconfirmed_publications_actor_draft_key', 'u', 'uniquedraft_id,actor_user_id'),
  ('expense_unconfirmed_publications', 'expense_unconfirmed_publications_state_key', 'u', 'uniquedraft_id,allocation_state'),

  ('expense_unconfirmed_publication_parties', 'expense_unconfirmed_publication_parties_pkey', 'p', 'primarykeydraft_id,ordinal'),
  ('expense_unconfirmed_publication_parties', 'expense_unconfirmed_publication_parties_publication_fk', 'f', 'foreignkeydraft_id,allocation_statereferencesexpense_unconfirmed_publicationsdraft_id,allocation_stateondeletecascade'),
  ('expense_unconfirmed_publication_parties', 'expense_unconfirmed_publication_parties_ordinal_check', 'c', 'checkordinal>=1andordinal<=50'),
  ('expense_unconfirmed_publication_parties', 'expense_unconfirmed_publication_parties_hash_check', 'c', 'checkparty_key_hash~^[0-9a-f]{32}$andidentity_token_hash~^[0-9a-f]{32}$'),
  ('expense_unconfirmed_publication_parties', 'expense_unconfirmed_publication_parties_label_check', 'c', 'checkchar_lengthbtrimdisplay_name>=1andchar_lengthbtrimdisplay_name<=120andstrposdisplay_name,@=0'),
  ('expense_unconfirmed_publication_parties', 'expense_unconfirmed_publication_parties_role_check', 'c', 'checkis_payeroris_participant'),
  ('expense_unconfirmed_publication_parties', 'expense_unconfirmed_publication_parties_amount_check', 'c', 'checkallocation_state=incompleteandpaid_minorisnullandshare_minorisnullorallocation_state=balanced_unconfirmedandpaid_minorisnotnullandshare_minorisnotnullandpaid_minor>=0andpaid_minor<=9007199254740991andshare_minor>=0andshare_minor<=9007199254740991andis_payerorpaid_minor=0andis_participantorshare_minor=0'),
  ('expense_unconfirmed_publication_parties', 'expense_unconfirmed_publication_parties_key_unique', 'u', 'uniquedraft_id,party_key_hash'),
  ('expense_unconfirmed_publication_parties', 'expense_unconfirmed_publication_parties_identity_unique', 'u', 'uniquedraft_id,identity_token_hash'),

  ('expense_unconfirmed_publication_audience', 'expense_unconfirmed_publication_audience_draft_id_fkey', 'f', 'foreignkeydraft_idreferencesexpense_unconfirmed_publicationsdraft_idondeletecascade'),
  ('expense_unconfirmed_publication_audience', 'expense_unconfirmed_publication_audience_pkey', 'p', 'primarykeydraft_id,user_id'),
  ('expense_unconfirmed_publication_audience', 'expense_unconfirmed_publication_audience_identity_unique', 'u', 'uniquedraft_id,identity_token_hash'),
  ('expense_unconfirmed_publication_audience', 'expense_unconfirmed_publication_audience_party_fk', 'f', 'foreignkeydraft_id,identity_token_hashreferencesexpense_unconfirmed_publication_partiesdraft_id,identity_token_hashondeletecascade'),
  ('expense_unconfirmed_publication_audience', 'expense_unconfirmed_publication_audience_identity_check', 'c', 'checkaudience_kind=authorandidentity_token_hashisnulloraudience_kind<>authorandidentity_token_hashisnotnullandidentity_token_hash~^[0-9a-f]{32}$'),
  ('expense_unconfirmed_publication_audience', 'expense_unconfirmed_publication_audience_kind_check', 'c', 'checkaudience_kind=anyarray[author,relationship,circle,group,event_guest,event_organizer]'),
  ('expense_unconfirmed_publication_audience', 'expense_unconfirmed_publication_audience_binding_check', 'c', 'checkaudience_kind=authorandbinding_idisnullandbinding_generationisnulloraudience_kind=anyarray[relationship,circle,group,event_organizer]andbinding_idisnotnullandbinding_generationisnulloraudience_kind=event_guestandbinding_idisnotnullandbinding_generation>=1andbinding_generation<=9007199254740991'),

  ('expense_unconfirmed_finalizations', 'expense_unconfirmed_finalizations_pkey', 'p', 'primarykeydraft_id'),
  ('expense_unconfirmed_finalizations', 'expense_unconfirmed_finalizations_request_unique', 'u', 'uniqueactor_user_id,request_id'),
  ('expense_unconfirmed_finalizations', 'expense_unconfirmed_finalizations_expense_unique', 'u', 'uniqueexpense_id'),
  ('expense_unconfirmed_finalizations', 'expense_unconfirmed_finalizations_expense_fk', 'f', 'foreignkeygroup_id,expense_idreferencesexpensesgroup_id,id'),
  ('expense_unconfirmed_finalizations', 'expense_unconfirmed_finalizations_contract_check', 'c', 'checkcontract_version=1'),
  ('expense_unconfirmed_finalizations', 'expense_unconfirmed_finalizations_version_check', 'c', 'checkexpected_draft_version>=1andexpected_draft_version<=9007199254740991andexpected_publication_versionisnullorexpected_publication_version>=1andexpected_publication_version<=9007199254740991andfinal_publication_versionisnullorfinal_publication_version>=1andfinal_publication_version<=9007199254740991'),
  ('expense_unconfirmed_finalizations', 'expense_unconfirmed_finalizations_publication_shape_check', 'c', 'checkpublication_idisnull=final_publication_versionisnullandexpected_publication_versionisnullorpublication_idisnotnullandexpected_publication_version<9007199254740991andfinal_publication_version=expected_publication_version+1'),
  ('expense_unconfirmed_finalizations', 'expense_unconfirmed_finalizations_fingerprint_check', 'c', 'checkrequest_fingerprint~^[0-9a-f]{32}$andshareable_fingerprint~^[0-9a-f]{32}$andallocation_fingerprint~^[0-9a-f]{32}$'),
  ('expense_unconfirmed_finalizations', 'expense_unconfirmed_finalizations_invitation_check', 'c', 'checkcardinalityinvitation_ids>=0andcardinalityinvitation_ids<=49andarray_positioninvitation_ids,nullisnull'),

  ('expense_private_draft_tombstones', 'expense_private_draft_tombstones_pkey', 'p', 'primarykeydraft_id'),

  ('expense_sql159_install_baseline', 'expense_sql159_install_baseline_pkey', 'p', 'primarykeysingleton'),
  ('expense_sql159_install_baseline', 'expense_sql159_install_baseline_singleton_check', 'c', 'checksingleton'),
  ('expense_sql159_install_baseline', 'expense_sql159_install_baseline_digest_check', 'c', 'checkwriter_set_digest~^[0-9a-f]{32}$andprotected_digest~^[0-9a-f]{32}$andrequest_digest~^[0-9a-f]{32}$anddraft_digest~^[0-9a-f]{32}$'),
  ('expense_sql159_install_baseline', 'expense_sql159_install_baseline_predecessor_check', 'c', 'checkjsonb_typeofpredecessor_contract=array')
), normalized_constraints AS (
  SELECT expected.*, constraint_row.oid,
    constraint_row.contype::text AS actual_type,
    constraint_row.convalidated,
    constraint_row.condeferrable,
    constraint_row.condeferred,
    pg_catalog.lower(pg_catalog.replace(pg_catalog.regexp_replace(
      pg_catalog.regexp_replace(
        pg_catalog.pg_get_constraintdef(constraint_row.oid),
        '::[a-z0-9_.]+(\[\])?', '', 'g'
      ), '[[:space:]()''"]', '', 'g'
    ), 'public.', '')) AS actual_definition
  FROM expected_constraints AS expected
  LEFT JOIN pg_catalog.pg_constraint AS constraint_row
    ON constraint_row.conrelid = pg_catalog.to_regclass(
      'public.' || expected.relation_name
    )
   AND constraint_row.conname = expected.constraint_name
), constraint_contract AS (
  SELECT pg_catalog.count(oid) = 38
    AND COALESCE(pg_catalog.bool_and(
      oid IS NOT NULL
      AND actual_type = constraint_type
      AND convalidated
      AND NOT condeferrable
      AND NOT condeferred
      AND actual_definition = exact_definition
    ), false)
    AND (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.pg_constraint AS actual_constraint
      WHERE actual_constraint.conrelid IN (
        pg_catalog.to_regclass('public.expense_unconfirmed_publications'),
        pg_catalog.to_regclass('public.expense_unconfirmed_publication_parties'),
        pg_catalog.to_regclass('public.expense_unconfirmed_publication_audience'),
        pg_catalog.to_regclass('public.expense_unconfirmed_finalizations'),
        pg_catalog.to_regclass('public.expense_private_draft_tombstones'),
        pg_catalog.to_regclass('public.expense_sql159_install_baseline')
      )
        AND actual_constraint.contype IN ('c', 'f', 'p', 'u', 'x')
    ) = 38 AS constraints_exact
  FROM normalized_constraints
), expected_indexes(
  relation_name, index_name, unique_index, primary_index,
  partial_index, exact_definition
) AS (VALUES
  ('expense_unconfirmed_publications', 'expense_unconfirmed_publications_pkey', true, true, false, 'createuniqueindexexpense_unconfirmed_publications_pkeyonexpense_unconfirmed_publicationsusingbtreedraft_id'),
  ('expense_unconfirmed_publications', 'expense_unconfirmed_publications_publication_id_key', true, false, false, 'createuniqueindexexpense_unconfirmed_publications_publication_id_keyonexpense_unconfirmed_publicationsusingbtreepublication_id'),
  ('expense_unconfirmed_publications', 'expense_unconfirmed_publications_actor_draft_key', true, false, false, 'createuniqueindexexpense_unconfirmed_publications_actor_draft_keyonexpense_unconfirmed_publicationsusingbtreedraft_id,actor_user_id'),
  ('expense_unconfirmed_publications', 'expense_unconfirmed_publications_state_key', true, false, false, 'createuniqueindexexpense_unconfirmed_publications_state_keyonexpense_unconfirmed_publicationsusingbtreedraft_id,allocation_state'),
  ('expense_unconfirmed_publications', 'expense_unconfirmed_publications_actor_live_idx', false, false, false, 'createindexexpense_unconfirmed_publications_actor_live_idxonexpense_unconfirmed_publicationsusingbtreeactor_user_id,is_live,updated_atdesc,publication_id'),
  ('expense_unconfirmed_publications', 'expense_unconfirmed_publications_event_live_idx', false, false, true, 'createindexexpense_unconfirmed_publications_event_live_idxonexpense_unconfirmed_publicationsusingbtreeevent_id,is_live,updated_atdesc,publication_idwhereevent_idisnotnullandlink_to_event'),
  ('expense_unconfirmed_publications', 'expense_unconfirmed_publications_group_live_idx', false, false, true, 'createindexexpense_unconfirmed_publications_group_live_idxonexpense_unconfirmed_publicationsusingbtreegroup_id,is_live,updated_atdesc,publication_idwheregroup_idisnotnull'),
  ('expense_unconfirmed_publication_parties', 'expense_unconfirmed_publication_parties_pkey', true, true, false, 'createuniqueindexexpense_unconfirmed_publication_parties_pkeyonexpense_unconfirmed_publication_partiesusingbtreedraft_id,ordinal'),
  ('expense_unconfirmed_publication_parties', 'expense_unconfirmed_publication_parties_key_unique', true, false, false, 'createuniqueindexexpense_unconfirmed_publication_parties_key_uniqueonexpense_unconfirmed_publication_partiesusingbtreedraft_id,party_key_hash'),
  ('expense_unconfirmed_publication_parties', 'expense_unconfirmed_publication_parties_identity_unique', true, false, false, 'createuniqueindexexpense_unconfirmed_publication_parties_identity_uniqueonexpense_unconfirmed_publication_partiesusingbtreedraft_id,identity_token_hash'),
  ('expense_unconfirmed_publication_audience', 'expense_unconfirmed_publication_audience_pkey', true, true, false, 'createuniqueindexexpense_unconfirmed_publication_audience_pkeyonexpense_unconfirmed_publication_audienceusingbtreedraft_id,user_id'),
  ('expense_unconfirmed_publication_audience', 'expense_unconfirmed_publication_audience_identity_unique', true, false, false, 'createuniqueindexexpense_unconfirmed_publication_audience_identity_uniqueonexpense_unconfirmed_publication_audienceusingbtreedraft_id,identity_token_hash'),
  ('expense_unconfirmed_publication_audience', 'expense_unconfirmed_publication_audience_user_idx', false, false, false, 'createindexexpense_unconfirmed_publication_audience_user_idxonexpense_unconfirmed_publication_audienceusingbtreeuser_id,draft_id'),
  ('expense_unconfirmed_finalizations', 'expense_unconfirmed_finalizations_pkey', true, true, false, 'createuniqueindexexpense_unconfirmed_finalizations_pkeyonexpense_unconfirmed_finalizationsusingbtreedraft_id'),
  ('expense_unconfirmed_finalizations', 'expense_unconfirmed_finalizations_request_unique', true, false, false, 'createuniqueindexexpense_unconfirmed_finalizations_request_uniqueonexpense_unconfirmed_finalizationsusingbtreeactor_user_id,request_id'),
  ('expense_unconfirmed_finalizations', 'expense_unconfirmed_finalizations_expense_unique', true, false, false, 'createuniqueindexexpense_unconfirmed_finalizations_expense_uniqueonexpense_unconfirmed_finalizationsusingbtreeexpense_id'),
  ('expense_private_draft_tombstones', 'expense_private_draft_tombstones_pkey', true, true, false, 'createuniqueindexexpense_private_draft_tombstones_pkeyonexpense_private_draft_tombstonesusingbtreedraft_id'),
  ('expense_sql159_install_baseline', 'expense_sql159_install_baseline_pkey', true, true, false, 'createuniqueindexexpense_sql159_install_baseline_pkeyonexpense_sql159_install_baselineusingbtreesingleton')
), index_contract AS (
  SELECT pg_catalog.count(index_row.indexrelid) = 18
    AND COALESCE(pg_catalog.bool_and(
      index_row.indrelid = pg_catalog.to_regclass(
        'public.' || expected.relation_name
      )
      AND index_row.indisunique = expected.unique_index
      AND index_row.indisprimary = expected.primary_index
      AND NOT index_row.indisexclusion
      AND index_row.indimmediate
      AND index_row.indisvalid
      AND index_row.indisready
      AND index_row.indislive
      AND NOT index_row.indcheckxmin
      AND NOT index_row.indisclustered
      AND NOT index_row.indisreplident
      AND NOT index_row.indnullsnotdistinct
      AND (index_row.indpred IS NOT NULL) = expected.partial_index
      AND index_row.indexprs IS NULL
      AND access_method.amname = 'btree'
      AND pg_catalog.pg_get_userbyid(index_relation.relowner) = 'postgres'
      AND index_relation.reltablespace = 0
      AND index_relation.relacl IS NULL
      AND pg_catalog.cardinality(COALESCE(
        index_relation.reloptions, ARRAY[]::text[]
      )) = 0
      AND pg_catalog.lower(pg_catalog.replace(pg_catalog.regexp_replace(
        pg_catalog.regexp_replace(
          pg_catalog.pg_get_indexdef(index_row.indexrelid),
          '::[a-z0-9_.]+(\[\])?', '', 'g'
        ), '[[:space:]()''"]', '', 'g'
      ), 'public.', '')) = expected.exact_definition
    ), false)
    AND (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.pg_index AS actual_index
      WHERE actual_index.indrelid IN (
        pg_catalog.to_regclass('public.expense_unconfirmed_publications'),
        pg_catalog.to_regclass('public.expense_unconfirmed_publication_parties'),
        pg_catalog.to_regclass('public.expense_unconfirmed_publication_audience'),
        pg_catalog.to_regclass('public.expense_unconfirmed_finalizations'),
        pg_catalog.to_regclass('public.expense_private_draft_tombstones'),
        pg_catalog.to_regclass('public.expense_sql159_install_baseline')
      )
    ) = 18 AS indexes_exact
  FROM expected_indexes AS expected
  LEFT JOIN pg_catalog.pg_index AS index_row
    ON index_row.indexrelid = pg_catalog.to_regclass(
      'public.' || expected.index_name
    )
  LEFT JOIN pg_catalog.pg_class AS index_relation
    ON index_relation.oid = index_row.indexrelid
  LEFT JOIN pg_catalog.pg_am AS access_method
    ON access_method.oid = index_relation.relam
), expected_functions(
  signature, exact_arguments, source_hash, language_name, volatility,
  return_type, security_definer, service_entry
) AS (VALUES
  ('public.expense_sql159_amount_minor(text,text,boolean)', 'p_raw text, p_currency text, p_allow_zero boolean', '5a4124296ff7e6f19d42342815be8109', 'plpgsql', 'i', 'bigint', false, false),
  ('public.expense_finalize_private_draft(uuid,uuid,uuid,bigint,bigint,boolean)', 'p_actor_id uuid, p_request_id uuid, p_draft_id uuid, p_expected_draft_version bigint, p_expected_publication_version bigint, p_split_confirmed boolean', '14ac1abc9046fea4812ac652a9b96088', 'plpgsql', 'v', 'jsonb', true, true),
  ('public.expense_sql159_probe_event_id(uuid,uuid)', 'p_actor_id uuid, p_draft_id uuid', '7600bd78711a0296ef545e0595c788b1', 'plpgsql', 's', 'uuid', true, false),
  ('public.expense_sql159_event_scope_read_only(uuid,uuid)', 'p_actor_id uuid, p_event_id uuid', '4ba9308ba12eef6405ed24916bc0bb74', 'plpgsql', 's', 'jsonb', true, false),
  ('public.expense_sql159_event_scope_allows(uuid,uuid)', 'p_actor_id uuid, p_event_id uuid', '0be29be5cda2d34bf41dc2f67e0afa2e', 'plpgsql', 's', 'boolean', true, false),
  ('public.expense_sql159_audience_allows(uuid,uuid)', 'p_actor_id uuid, p_draft_id uuid', '9c4af07a07906c4dac6f06da94b42b37', 'sql', 's', 'boolean', true, false),
  ('public.expense_sql159_guard_private_draft_insert()', '', '739e7c5c77dc08aa64c352627f21120a', 'plpgsql', 'v', 'trigger', true, false),
  ('public.expense_sql159_guard_private_draft_delete()', '', 'cd349b0ef1810c51deb229ae64eade33', 'plpgsql', 'v', 'trigger', true, false),
  ('public.expense_get_private_draft_publication_lifecycle(uuid,uuid)', 'p_actor_id uuid, p_draft_id uuid', '16fd85b239a880a4c0c12c3b0a078151', 'plpgsql', 's', 'jsonb', true, true),
  ('public.expense_share_private_draft(uuid,uuid,uuid,bigint,bigint)', 'p_actor_id uuid, p_request_id uuid, p_draft_id uuid, p_expected_draft_version bigint, p_expected_publication_version bigint', 'ca805bbd38dbd013e1c034e0049432ec', 'plpgsql', 'v', 'jsonb', true, true),
  ('public.expense_unshare_private_draft(uuid,uuid,uuid,bigint,bigint)', 'p_actor_id uuid, p_request_id uuid, p_draft_id uuid, p_expected_draft_version bigint, p_expected_publication_version bigint', '9d440591ad52a108f3e6a5212722c1fa', 'plpgsql', 'v', 'jsonb', true, true),
  ('public.expense_sql159_normalize_private_draft(uuid,uuid,boolean)', 'p_actor_id uuid, p_draft_id uuid, p_require_balanced boolean', '18a6e628bdb1d3c175b515541ab56787', 'plpgsql', 'v', 'jsonb', true, false),
  ('public.expense_sql159_percentage_basis_points(text)', 'p_raw text', 'ad0deb049185b7f6519bc0c3154201ac', 'plpgsql', 'i', 'bigint', false, false),
  ('public.expense_sql159_weight(text)', 'p_raw text', 'c29cee4a8de2c95e138aad00af3fd4fe', 'plpgsql', 'i', 'bigint', false, false),
  ('public.expense_sql159_allocate_weighted(bigint,jsonb,bigint)', 'p_total_minor bigint, p_weights jsonb, p_expected_weight_total bigint', '7d38f3ac0f65a2b16aac5a53c9a09e8f', 'plpgsql', 'i', 'jsonb', false, false),
  ('public.expense_sql159_snapshot_is_valid(uuid)', 'p_draft_id uuid', 'af4b9f8a5f0b422956fc1d664021baff', 'sql', 's', 'boolean', true, false),
  ('public.expense_sql159_private_event_summary(uuid,uuid,uuid)', 'p_actor_id uuid, p_draft_id uuid, p_event_id uuid', 'e75a609fc4f231b0cfda3d5fb2679d9b', 'plpgsql', 's', 'jsonb', true, false),
  ('public.expense_list_visible_shared_drafts(uuid)', 'p_actor_id uuid', '59b01785320ce254fb4ac7d6168709bc', 'plpgsql', 'v', 'jsonb', true, true),
  ('public.expense_get_shared_draft_detail(uuid,uuid)', 'p_actor_id uuid, p_publication_id uuid', '51a607ab9bc5e5ad5a19f4b9d96aa00b', 'plpgsql', 'v', 'jsonb', true, true),
  ('public.expense_list_group_shared_drafts(uuid,uuid)', 'p_actor_id uuid, p_group_id uuid', '0a06c9d47c9c17dad77c715fbef50d55', 'plpgsql', 'v', 'jsonb', true, true),
  ('public.teskeid_event_get_expense_pre_active_v1(uuid,uuid)', 'p_actor_id uuid, p_event_id uuid', '4332f4ccfd5e58f2e17ebe9389c13311', 'plpgsql', 'v', 'jsonb', true, true)
), function_catalog AS (
  SELECT expected.*, function_row.*,
    language_row.lanname AS actual_language_name,
    pg_catalog.pg_get_userbyid(function_row.proowner) AS owner_name
  FROM expected_functions AS expected
  LEFT JOIN pg_catalog.pg_proc AS function_row
    ON function_row.oid = pg_catalog.to_regprocedure(expected.signature)
  LEFT JOIN pg_catalog.pg_language AS language_row
    ON language_row.oid = function_row.prolang
), function_contract AS (
  SELECT pg_catalog.count(oid) = 21
    AND COALESCE(pg_catalog.bool_and(
      oid IS NOT NULL
      AND prokind = 'f'
      AND prorettype = pg_catalog.to_regtype(return_type)
      AND NOT proretset
      AND prosecdef = security_definer
      AND provolatile::text = volatility
      AND NOT proisstrict
      AND NOT proleakproof
      AND proparallel = 'u'
      AND pronargdefaults = 0
      AND proargdefaults IS NULL
      AND proallargtypes IS NULL
      AND proargmodes IS NULL
      AND proconfig = ARRAY['search_path=""']::text[]
      AND actual_language_name = language_name
      AND owner_name = 'postgres'
      AND pg_catalog.pg_get_function_arguments(oid) = exact_arguments
      AND pg_catalog.md5(pg_catalog.replace(
        prosrc, E'\r\n', E'\n'
      )) = source_hash
      AND (
        SELECT pg_catalog.count(*) = 1
        FROM pg_catalog.pg_proc AS overload
        WHERE overload.pronamespace = function_catalog.pronamespace
          AND overload.proname = function_catalog.proname
      )
      AND (
        SELECT pg_catalog.count(*) = CASE
          WHEN service_entry THEN 2 ELSE 1 END
        FROM pg_catalog.aclexplode(COALESCE(
          proacl, pg_catalog.acldefault('f', proowner)
        )) AS privilege_row
        LEFT JOIN pg_catalog.pg_roles AS grantee_row
          ON grantee_row.oid = privilege_row.grantee
        WHERE privilege_row.privilege_type = 'EXECUTE'
          AND privilege_row.grantor = proowner
          AND NOT privilege_row.is_grantable
          AND (
            privilege_row.grantee = proowner
            OR (service_entry AND grantee_row.rolname = 'service_role')
          )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(
          proacl, pg_catalog.acldefault('f', proowner)
        )) AS privilege_row
        LEFT JOIN pg_catalog.pg_roles AS grantee_row
          ON grantee_row.oid = privilege_row.grantee
        WHERE privilege_row.privilege_type <> 'EXECUTE'
           OR privilege_row.grantor <> proowner
           OR privilege_row.is_grantable
           OR privilege_row.grantee = 0
           OR (
             privilege_row.grantee <> proowner
             AND (
               NOT service_entry
               OR grantee_row.rolname IS DISTINCT FROM 'service_role'
             )
           )
      )
    ), false)
    AND (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.pg_proc AS actual_function
      WHERE actual_function.pronamespace = pg_catalog.to_regnamespace('public')
        AND (
          actual_function.proname LIKE 'expense_sql159_%'
          OR actual_function.proname IN (
            'expense_finalize_private_draft',
            'expense_share_private_draft',
            'expense_unshare_private_draft',
            'expense_get_private_draft_publication_lifecycle',
            'expense_list_visible_shared_drafts',
            'expense_get_shared_draft_detail',
            'expense_list_group_shared_drafts',
            'teskeid_event_get_expense_pre_active_v1'
          )
        )
    ) = 21 AS functions_exact
  FROM function_catalog
), expected_triggers(
  trigger_name, trigger_type, function_signature, exact_definition
) AS (VALUES
  ('expense_sql159_finalized_draft_insert_guard', 7::smallint, 'public.expense_sql159_guard_private_draft_insert()', 'createtriggerexpense_sql159_finalized_draft_insert_guardbeforeinsertonexpense_private_draftsforeachrowexecutefunctionexpense_sql159_guard_private_draft_insert'),
  ('expense_sql159_private_draft_delete_guard', 11::smallint, 'public.expense_sql159_guard_private_draft_delete()', 'createtriggerexpense_sql159_private_draft_delete_guardbeforedeleteonexpense_private_draftsforeachrowexecutefunctionexpense_sql159_guard_private_draft_delete')
), trigger_contract AS (
  SELECT pg_catalog.count(trigger_row.oid) = 2
    AND COALESCE(pg_catalog.bool_and(
      trigger_row.tgrelid = pg_catalog.to_regclass(
        'public.expense_private_drafts'
      )
      AND trigger_row.tgtype = expected.trigger_type
      AND trigger_row.tgfoid = pg_catalog.to_regprocedure(
        expected.function_signature
      )
      AND trigger_row.tgenabled = 'O'
      AND NOT trigger_row.tgisinternal
      AND trigger_row.tgconstraint = 0
      AND trigger_row.tgnargs = 0
      AND pg_catalog.cardinality(trigger_row.tgattr::smallint[]) = 0
      AND trigger_row.tgqual IS NULL
      AND trigger_row.tgoldtable IS NULL
      AND trigger_row.tgnewtable IS NULL
      AND pg_catalog.lower(pg_catalog.replace(pg_catalog.regexp_replace(
        pg_catalog.regexp_replace(
          pg_catalog.pg_get_triggerdef(trigger_row.oid),
          '::[a-z0-9_.]+(\[\])?', '', 'g'
        ), '[[:space:]()''"]', '', 'g'
      ), 'public.', '')) = expected.exact_definition
    ), false)
    AND (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.pg_trigger AS actual_trigger
      WHERE actual_trigger.tgname IN (
        'expense_sql159_finalized_draft_insert_guard',
        'expense_sql159_private_draft_delete_guard'
      )
    ) = 2 AS triggers_exact
  FROM expected_triggers AS expected
  LEFT JOIN pg_catalog.pg_trigger AS trigger_row
    ON trigger_row.tgname = expected.trigger_name
), predecessor_expected(signature, is_writer) AS (VALUES
  ('public.expense_create_expense(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb)', true),
  ('public.expense_create_expense_with_circle_context(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,uuid,jsonb)', true),
  ('public.expense_create_expense_with_known_members(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)', true),
  ('public.expense_create_expense_with_participants(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)', true),
  ('public.teskeid_event_create_expense_from_event_for_actor(uuid,uuid,uuid,bigint,boolean,jsonb)', true),
  ('public.teskeid_event_create_tagged_expense(uuid,uuid,uuid,bigint,jsonb)', true),
  ('public.teskeid_event_create_tagged_expense_for_actor(uuid,uuid,uuid,bigint,jsonb)', true),
  ('public.expense_has_beta_access(uuid)', false),
  ('public.expense_assert_beta_actor(uuid)', false),
  ('public.expense_active_member_role(uuid,uuid)', false),
  ('public.expense_begin_request(uuid,uuid,text,text)', false),
  ('public.expense_finish_request(uuid,uuid,jsonb)', false),
  ('public.expense_assert_private_draft_context(uuid,text,uuid,uuid)', false),
  ('public.expense_identity_request_id(text,uuid)', false),
  ('public.teskeid_event_assert_session_actor(uuid)', false),
  ('public.teskeid_event_assert_actor(uuid)', false),
  ('public.teskeid_event_assert_financial_actor(uuid)', false),
  ('public.teskeid_event_begin_request(uuid,uuid,text,text,boolean)', false),
  ('public.teskeid_event_finish_request(uuid,uuid,jsonb)', false),
  ('public.teskeid_event_private_scope_v3(uuid,uuid)', false),
  ('public.teskeid_event_get_legacy_expense_source_v2(uuid,uuid)', false),
  ('public.teskeid_event_uuid_from_text(text)', false),
  ('public.normalize_email_canonical(text)', false),
  ('public.teskeid_event_normalize_text(text)', false),
  ('public.teskeid_event_valid_text(text,integer,integer)', false),
  ('public.teskeid_event_private_normalize_shared_name_v2(text)', false),
  ('public.teskeid_event_private_valid_shared_name_v2(text)', false),
  ('public.teskeid_event_private_valid_canonical_email_v2(text)', false),
  ('public.teskeid_event_private_safe_profile_name_v2(uuid)', false),
  ('public.teskeid_event_private_viewer_relationship_v2(uuid,uuid,uuid,text)', false),
  ('public.teskeid_event_private_legacy_person_v2(uuid,uuid,uuid,text,integer)', false),
  ('public.teskeid_event_private_legacy_people_v2(uuid,uuid,text)', false)
), predecessor_facts AS MATERIALIZED (
  SELECT expected.signature, expected.is_writer,
    pg_catalog.pg_get_userbyid(function_row.proowner) AS owner_name,
    pg_catalog.md5(pg_catalog.replace(
      function_row.prosrc, E'\r\n', E'\n'
    )) AS source_hash,
    COALESCE(function_row.proconfig, ARRAY[]::text[])::text[] AS proconfig,
    COALESCE((
      SELECT pg_catalog.jsonb_agg(
        CASE WHEN privilege_row.grantee = 0 THEN 'PUBLIC'
          ELSE grantee_row.rolname END
        ORDER BY (CASE WHEN privilege_row.grantee = 0 THEN 'PUBLIC'
          ELSE grantee_row.rolname END) COLLATE pg_catalog."C"
      )
      FROM pg_catalog.aclexplode(COALESCE(
        function_row.proacl,
        pg_catalog.acldefault('f', function_row.proowner)
      )) AS privilege_row
      LEFT JOIN pg_catalog.pg_roles AS grantee_row
        ON grantee_row.oid = privilege_row.grantee
      WHERE privilege_row.privilege_type = 'EXECUTE'
    ), '[]'::jsonb) AS execute_grantees
  FROM predecessor_expected AS expected
  LEFT JOIN pg_catalog.pg_proc AS function_row
    ON function_row.oid = pg_catalog.to_regprocedure(expected.signature)
), predecessor_json AS (
  SELECT pg_catalog.count(*) = 32
      AND pg_catalog.count(owner_name) = 32 AS predecessor_count_exact,
    COALESCE(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'signature', facts.signature,
        'owner', facts.owner_name,
        'source_hash', facts.source_hash,
        'proconfig', pg_catalog.to_jsonb(facts.proconfig),
        'execute_grantees', facts.execute_grantees
      ) ORDER BY facts.signature COLLATE pg_catalog."C"
    ), '[]'::jsonb) AS value
  FROM predecessor_facts AS facts
), writer_digest AS (
  SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
    facts.signature || '|' || facts.owner_name || '|' || facts.source_hash
      || '|' || facts.proconfig::text || '|' || facts.execute_grantees::text,
    E'\n' ORDER BY facts.signature COLLATE pg_catalog."C"
  ), '')) AS value
  FROM predecessor_facts AS facts
  WHERE facts.is_writer
), protected_rows(kind, row_hash) AS MATERIALIZED (
  SELECT 'expense_groups', pg_catalog.md5(pg_catalog.to_jsonb(group_row)::text)
  FROM public.expense_groups AS group_row
  UNION ALL
  SELECT 'expense_group_members', pg_catalog.md5(pg_catalog.to_jsonb(member_row)::text)
  FROM public.expense_group_members AS member_row
  UNION ALL
  SELECT 'expenses', pg_catalog.md5(pg_catalog.to_jsonb(expense_row)::text)
  FROM public.expenses AS expense_row
  UNION ALL
  SELECT 'expense_payments', pg_catalog.md5(pg_catalog.to_jsonb(payment_row)::text)
  FROM public.expense_payments AS payment_row
  UNION ALL
  SELECT 'expense_shares', pg_catalog.md5(pg_catalog.to_jsonb(share_row)::text)
  FROM public.expense_shares AS share_row
  UNION ALL
  SELECT 'expense_obligations', pg_catalog.md5(pg_catalog.to_jsonb(obligation_row)::text)
  FROM public.expense_obligations AS obligation_row
  UNION ALL
  SELECT 'teskeid_event_expense_links', pg_catalog.md5(pg_catalog.to_jsonb(link_row)::text)
  FROM public.teskeid_event_expense_links AS link_row
), protected_evidence AS (
  SELECT pg_catalog.count(*)::bigint AS row_count,
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(
      protected_row.kind || ':' || protected_row.row_hash, E'\n'
      ORDER BY protected_row.kind COLLATE pg_catalog."C",
        protected_row.row_hash COLLATE pg_catalog."C"
    ), '')) AS row_digest
  FROM protected_rows AS protected_row
), request_rows(kind, row_hash) AS MATERIALIZED (
  SELECT 'expense_mutation_requests',
    pg_catalog.md5(pg_catalog.to_jsonb(request_row)::text)
  FROM public.expense_mutation_requests AS request_row
  UNION ALL
  SELECT 'teskeid_event_mutation_requests',
    pg_catalog.md5(pg_catalog.to_jsonb(event_request_row)::text)
  FROM public.teskeid_event_mutation_requests AS event_request_row
), request_evidence AS (
  SELECT pg_catalog.count(*)::bigint AS row_count,
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(
      request_rows.kind || ':' || request_rows.row_hash, E'\n'
      ORDER BY request_rows.kind COLLATE pg_catalog."C",
        request_rows.row_hash COLLATE pg_catalog."C"
    ), '')) AS row_digest
  FROM request_rows
), draft_evidence AS (
  SELECT pg_catalog.count(*)::bigint AS row_count,
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(
      pg_catalog.md5(pg_catalog.to_jsonb(draft_row)::text), E'\n'
      ORDER BY pg_catalog.md5(pg_catalog.to_jsonb(draft_row)::text)
        COLLATE pg_catalog."C"
    ), '')) AS row_digest
  FROM public.expense_private_drafts AS draft_row
), baseline_contract AS (
  SELECT pg_catalog.count(*) = 1
      AND COALESCE(pg_catalog.bool_and(
        baseline.singleton
        AND baseline.installed_at IS NOT NULL
        AND baseline.new_relations_began_empty
        AND CASE
          WHEN pg_catalog.jsonb_typeof(
            baseline.predecessor_contract
          ) = 'array' THEN
            pg_catalog.jsonb_array_length(
              baseline.predecessor_contract
            ) = 32
            AND NOT EXISTS (
              SELECT 1
              FROM pg_catalog.jsonb_array_elements(
                baseline.predecessor_contract
              ) AS contract_item(value)
              WHERE CASE
                WHEN pg_catalog.jsonb_typeof(
                  contract_item.value
                ) = 'object' THEN
                  contract_item.value - ARRAY[
                    'signature', 'owner', 'source_hash',
                    'proconfig', 'execute_grantees'
                  ]::text[] <> '{}'::jsonb
                  OR NOT (contract_item.value ?& ARRAY[
                    'signature', 'owner', 'source_hash',
                    'proconfig', 'execute_grantees'
                  ]::text[])
                  OR pg_catalog.jsonb_typeof(
                    contract_item.value->'signature'
                  ) <> 'string'
                  OR pg_catalog.jsonb_typeof(
                    contract_item.value->'owner'
                  ) <> 'string'
                  OR contract_item.value->>'source_hash'
                    !~ '^[0-9a-f]{32}$'
                  OR pg_catalog.jsonb_typeof(
                    contract_item.value->'proconfig'
                  ) <> 'array'
                  OR pg_catalog.jsonb_typeof(
                    contract_item.value->'execute_grantees'
                  ) <> 'array'
                ELSE true
              END
            )
          ELSE false
        END
        AND baseline.predecessor_contract = predecessor_json.value
        AND predecessor_json.predecessor_count_exact
        AND baseline.writer_set_digest = writer_digest.value
        AND baseline.protected_count = protected_evidence.row_count
        AND baseline.protected_digest = protected_evidence.row_digest
        AND baseline.request_count = request_evidence.row_count
        AND baseline.request_digest = request_evidence.row_digest
        AND baseline.draft_count = draft_evidence.row_count
        AND baseline.draft_digest = draft_evidence.row_digest
      ), false) AS baseline_and_predecessors_exact
  FROM public.expense_sql159_install_baseline AS baseline
  CROSS JOIN predecessor_json
  CROSS JOIN writer_digest
  CROSS JOIN protected_evidence
  CROSS JOIN request_evidence
  CROSS JOIN draft_evidence
), storage_contract AS (
  SELECT
    NOT EXISTS (
      SELECT 1
      FROM public.expense_unconfirmed_publications AS publication
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.expense_unconfirmed_publication_parties AS party_row
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.expense_unconfirmed_publication_audience AS audience_row
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.expense_unconfirmed_finalizations AS finalization
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.expense_private_draft_tombstones AS tombstone
    ) AS no_backfill_exact,
    NOT EXISTS (
      SELECT 1
      FROM public.expense_unconfirmed_publications AS publication
      WHERE (
        publication.is_live
        AND (
          NOT public.expense_sql159_snapshot_is_valid(publication.draft_id)
          OR NOT EXISTS (
            SELECT 1
            FROM public.expense_unconfirmed_publication_audience AS author_row
            WHERE author_row.draft_id = publication.draft_id
              AND author_row.user_id = publication.actor_user_id
              AND author_row.audience_kind = 'author'
              AND author_row.identity_token_hash IS NULL
              AND author_row.binding_id IS NULL
              AND author_row.binding_generation IS NULL
          )
        )
      ) OR (
        NOT publication.is_live
        AND (
          EXISTS (
            SELECT 1
            FROM public.expense_unconfirmed_publication_parties AS party_row
            WHERE party_row.draft_id = publication.draft_id
          )
          OR EXISTS (
            SELECT 1
            FROM public.expense_unconfirmed_publication_audience AS audience_row
            WHERE audience_row.draft_id = publication.draft_id
          )
        )
      )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.expense_unconfirmed_publication_audience AS audience_row
      LEFT JOIN public.expense_unconfirmed_publications AS publication
        ON publication.draft_id = audience_row.draft_id
      LEFT JOIN public.expense_unconfirmed_publication_parties AS party_row
        ON party_row.draft_id = audience_row.draft_id
       AND party_row.identity_token_hash = audience_row.identity_token_hash
      WHERE NOT COALESCE(publication.is_live, false)
         OR (
           audience_row.audience_kind = 'author'
           AND (
             audience_row.user_id IS DISTINCT FROM publication.actor_user_id
             OR audience_row.identity_token_hash IS NOT NULL
           )
         )
         OR (
           audience_row.audience_kind <> 'author'
           AND (
             party_row.draft_id IS NULL
             OR NOT (party_row.is_payer OR party_row.is_participant)
             OR party_row.is_author
           )
         )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.expense_private_draft_tombstones AS tombstone
      WHERE EXISTS (
        SELECT 1
        FROM public.expense_private_drafts AS draft_row
        WHERE draft_row.id = tombstone.draft_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.expense_unconfirmed_publications AS publication
        WHERE publication.draft_id = tombstone.draft_id
          AND publication.is_live
      )
    ) AS publication_storage_invariants_exact,
    NOT EXISTS (
      SELECT 1
      FROM public.expense_unconfirmed_finalizations AS finalization
      LEFT JOIN public.expense_groups AS group_row
        ON group_row.id = finalization.group_id
      LEFT JOIN public.expenses AS expense_row
        ON expense_row.group_id = finalization.group_id
       AND expense_row.id = finalization.expense_id
      WHERE group_row.id IS NULL
         OR group_row.status IS DISTINCT FROM 'active'
         OR expense_row.id IS NULL
         OR expense_row.status IS DISTINCT FROM 'active'
         OR expense_row.created_by IS DISTINCT FROM finalization.actor_user_id
         OR NOT EXISTS (
           SELECT 1
           FROM public.expense_group_members AS actor_member
           WHERE actor_member.group_id = finalization.group_id
             AND actor_member.user_id = finalization.actor_user_id
             AND actor_member.status = 'active'
         )
         OR EXISTS (
           SELECT 1
           FROM public.expense_private_drafts AS draft_row
           WHERE draft_row.id = finalization.draft_id
         )
         OR NOT EXISTS (
           SELECT 1
           FROM public.expense_private_draft_tombstones AS tombstone
           WHERE tombstone.draft_id = finalization.draft_id
         )
         OR EXISTS (
           SELECT 1
           FROM public.expense_unconfirmed_publication_parties AS party_row
           WHERE party_row.draft_id = finalization.draft_id
         )
         OR EXISTS (
           SELECT 1
           FROM public.expense_unconfirmed_publication_audience AS audience_row
           WHERE audience_row.draft_id = finalization.draft_id
         )
         OR (
           finalization.publication_id IS NULL
           AND EXISTS (
             SELECT 1
             FROM public.expense_unconfirmed_publications AS publication
             WHERE publication.draft_id = finalization.draft_id
           )
         )
         OR (
           finalization.publication_id IS NOT NULL
           AND NOT EXISTS (
             SELECT 1
             FROM public.expense_unconfirmed_publications AS publication
             WHERE publication.draft_id = finalization.draft_id
               AND publication.publication_id = finalization.publication_id
               AND NOT publication.is_live
               AND publication.publication_version =
                 finalization.final_publication_version
           )
         )
    ) AS tombstone_to_active_exact
)
SELECT executor_contract.executor_ok,
  relation_contract.relations_private_exact,
  column_contract.columns_exact,
  constraint_contract.constraints_exact,
  index_contract.indexes_exact,
  function_contract.functions_exact,
  trigger_contract.triggers_exact,
  baseline_contract.baseline_and_predecessors_exact,
  storage_contract.no_backfill_exact,
  storage_contract.publication_storage_invariants_exact,
  storage_contract.tombstone_to_active_exact,
  executor_contract.executor_ok
    AND relation_contract.relations_private_exact
    AND column_contract.columns_exact
    AND constraint_contract.constraints_exact
    AND index_contract.indexes_exact
    AND function_contract.functions_exact
    AND trigger_contract.triggers_exact
    AND baseline_contract.baseline_and_predecessors_exact
    AND storage_contract.no_backfill_exact
    AND storage_contract.publication_storage_invariants_exact
    AND storage_contract.tombstone_to_active_exact AS postconditions_ok
FROM executor_contract
CROSS JOIN relation_contract
CROSS JOIN column_contract
CROSS JOIN constraint_contract
CROSS JOIN index_contract
CROSS JOIN function_contract
CROSS JOIN trigger_contract
CROSS JOIN baseline_contract
CROSS JOIN storage_contract;

ROLLBACK;
