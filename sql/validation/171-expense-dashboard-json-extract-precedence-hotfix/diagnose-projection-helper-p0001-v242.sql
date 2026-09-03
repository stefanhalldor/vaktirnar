-- SQL171 PROJECTION-HELPER P0001 DIAGNOSTIC TEMPLATE: read-only helper-substage classification.
-- Replace the single typed placeholder privately before a separately authorized
-- manual run. The template intentionally raises one paste-safe JSON result only.
-- It relies on the Supabase SQL Editor/platform execution timeout: a timeout
-- configured inside an already running DO statement would not bound that DO.
-- QUERY_CANCELED and ASSERT_FAILURE are intentionally not caught by WHEN OTHERS;
-- external cancellation or termination may therefore end without a diagnostic result.
DO $sql171_helper_p0001_diagnostic$
DECLARE
  p_actor_id uuid;
  v_actor_account_exists boolean;
  v_actor_beta_access boolean;
  v_identity_binding_conflict boolean;
  v_invalid_visible_bindings_count integer;
  v_invalid_visible_publications_count integer;
  v_invalid_visible_private_edits_count integer;
  v_candidate_count integer;
  v_distinct_candidate_count integer;
  v_discarded_rows jsonb;
  v_private_creation_draft_ids uuid[];
  v_live_publication_actor_ids uuid[];
  v_live_publication_draft_ids uuid[];
  v_settlement_group_ids uuid[];
  v_probe_actor_id uuid;
  v_probe_draft_id uuid;
  v_probe_group_id uuid;
  v_probe_index integer := 0;
  v_private_creation_probe_count integer;
  v_private_creation_completed_count integer := 0;
  v_live_publication_probe_count integer;
  v_live_publication_completed_count integer := 0;
  v_settlement_probe_count integer;
  v_settlement_completed_count integer := 0;
  v_classification text;
  v_failing_helper_substage text;
  v_stage text := 'actor_input';
  v_sqlstate text;
  v_error_category text;
BEGIN
  BEGIN
    p_actor_id := '__STEBBI_PRIVATE_ACTOR_UUID__'::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_classification := 'execution_exception';
    v_sqlstate := SQLSTATE;
  END;

  IF v_classification IS NULL THEN
    v_stage := 'actor_admission';
    BEGIN
      SELECT EXISTS (
        SELECT 1
        FROM auth.users AS account
        WHERE account.id = p_actor_id
      )
      INTO v_actor_account_exists;

      IF NOT v_actor_account_exists THEN
        v_classification := 'actor_account_admission_failure';
      ELSE
        SELECT public.expense_has_beta_access(p_actor_id)
        INTO v_actor_beta_access;

        IF NOT v_actor_beta_access THEN
          v_classification := 'actor_beta_admission_failure';
        ELSE
          -- Exercise the same two admission helpers used by SQL171 after the
          -- separately reported safe booleans establish the expected branch.
          PERFORM public.teskeid_event_assert_session_actor(p_actor_id);
          PERFORM public.expense_assert_beta_actor(p_actor_id);
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_classification := 'execution_exception';
      v_sqlstate := SQLSTATE;
    END;
  END IF;

  IF v_classification IS NULL THEN
    v_stage := 'identity_binding';
    BEGIN
      v_identity_binding_conflict := EXISTS (
-- BEGIN EXACT SQL171 IDENTITY-CONFLICT PREDICATE
    SELECT 1
    FROM public.expense_group_members AS member
    JOIN public.expense_member_identity_bindings AS identity_binding
      ON identity_binding.group_id = member.group_id
     AND identity_binding.member_id = member.id
    JOIN public.expenses AS expense ON expense.group_id = member.group_id
    JOIN public.expense_group_members AS actor_member
      ON actor_member.group_id = expense.group_id
     AND actor_member.user_id = p_actor_id
     AND actor_member.status = 'active'
    WHERE member.user_id IS NOT NULL
      AND identity_binding.target_user_id IS NOT NULL
      AND member.user_id IS DISTINCT FROM identity_binding.target_user_id
    -- END EXACT SQL171 IDENTITY-CONFLICT PREDICATE
      );

      IF v_identity_binding_conflict THEN
        v_classification := 'member_identity_binding_conflict';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_classification := 'execution_exception';
      v_sqlstate := SQLSTATE;
    END;
  END IF;

  IF v_classification IS NULL THEN
    v_stage := 'private_creation_domain';
    BEGIN
      -- BEGIN EXACT SQL171 PRIVATE-CREATION NORMALIZER DOMAIN
      WITH private_creation_probe_domain AS MATERIALIZED (
        SELECT draft.id AS draft_id
        FROM public.expense_private_drafts AS draft
        LEFT JOIN LATERAL (
          SELECT CASE
            WHEN pg_catalog.jsonb_typeof(draft.payload->'total') = 'string'
              THEN pg_catalog.regexp_replace(
                pg_catalog.btrim(draft.payload->>'total'), '[[:space:]]+', '', 'g'
              )
            ELSE NULL
          END AS raw_total
        ) AS raw ON true
        LEFT JOIN LATERAL (
          SELECT CASE
            WHEN raw.raw_total ~ '^[0-9]+([.,][0-9]+)?$'
              AND NOT (
                pg_catalog.strpos(raw.raw_total, '.') > 0
                AND pg_catalog.strpos(raw.raw_total, ',') > 0
              )
              THEN pg_catalog.replace(raw.raw_total, ',', '.')::numeric
            ELSE NULL
          END AS major_amount
        ) AS parsed ON true
        LEFT JOIN LATERAL (
          SELECT CASE
            WHEN draft.payload->>'currency' = 'ISK'
              AND parsed.major_amount > 0
              AND pg_catalog.scale(parsed.major_amount) = 0
              AND parsed.major_amount <= 9007199254740991
              THEN parsed.major_amount::bigint
            WHEN draft.payload->>'currency' IN ('EUR','USD','GBP','DKK','NOK','SEK')
              AND parsed.major_amount > 0
              AND pg_catalog.scale(parsed.major_amount) <= 2
              AND parsed.major_amount * 100 <= 9007199254740991
              THEN (parsed.major_amount * 100)::bigint
            ELSE NULL
          END AS total_minor
        ) AS summary ON true
        WHERE draft.actor_user_id = p_actor_id
          AND draft.context_type IN ('one_off', 'group')
          AND NOT EXISTS (
            SELECT 1
            FROM public.expense_unconfirmed_publications AS publication
            WHERE publication.draft_id = draft.id
              AND publication.is_live
          )
          AND draft.current_step = 'split'
          AND summary.total_minor IS NOT NULL
      )
      SELECT COALESCE(
        pg_catalog.array_agg(domain.draft_id ORDER BY domain.draft_id),
        ARRAY[]::uuid[]
      )
      INTO v_private_creation_draft_ids
      FROM private_creation_probe_domain AS domain;
      -- END EXACT SQL171 PRIVATE-CREATION NORMALIZER DOMAIN

      v_private_creation_probe_count :=
        pg_catalog.cardinality(v_private_creation_draft_ids);
      v_stage := 'private_creation_normalizer';
      FOREACH v_probe_draft_id IN ARRAY v_private_creation_draft_ids LOOP
        PERFORM public.expense_sql159_normalize_private_draft(
          p_actor_id, v_probe_draft_id, false
        );
        v_private_creation_completed_count :=
          v_private_creation_completed_count + 1;
      END LOOP;
    EXCEPTION WHEN OTHERS THEN
      v_sqlstate := SQLSTATE;
      v_failing_helper_substage := v_stage;
      v_classification := CASE
        WHEN v_sqlstate = 'P0001'
          AND v_stage = 'private_creation_normalizer'
          THEN 'private_creation_normalizer'
        ELSE 'execution_exception'
      END;
    END;
  END IF;

  IF v_classification IS NULL THEN
    v_stage := 'live_publication_domain';
    BEGIN
      -- BEGIN EXACT SQL171 LIVE-PUBLICATION NORMALIZER DOMAIN
      WITH exact_bindings AS MATERIALIZED (
        SELECT binding.draft_id
        FROM public.expense_edit_revision_bindings AS binding
        JOIN public.expense_private_drafts AS draft
          ON draft.id = binding.draft_id
         AND draft.context_type = 'edit'
         AND draft.expense_id = binding.expense_id
         AND draft.group_id = binding.group_id
         AND draft.actor_user_id = binding.actor_user_id
        JOIN public.expenses AS expense
          ON expense.id = binding.expense_id
         AND expense.group_id = binding.group_id
         AND expense.status = 'active'
        LEFT JOIN public.expense_unconfirmed_publications AS publication
          ON publication.draft_id = binding.draft_id
        WHERE (binding.mode = 'private'
            AND publication.is_live IS NOT DISTINCT FROM false)
           OR (binding.mode = 'private' AND publication.draft_id IS NULL)
           OR (binding.mode = 'shared' AND publication.is_live IS TRUE
             AND publication.actor_user_id = binding.actor_user_id
             AND publication.context_type = 'group'
             AND publication.group_id = binding.group_id)
      ),
      actor_relevant_live_publications AS MATERIALIZED (
        SELECT publication.*
        FROM public.expense_unconfirmed_publications AS publication
        WHERE publication.is_live
          AND (
            publication.actor_user_id = p_actor_id
            OR public.expense_sql159_audience_allows(
              p_actor_id, publication.draft_id
            )
          )
      ),
      live_publication_probe_domain AS MATERIALIZED (
        SELECT publication.actor_user_id, publication.draft_id
        FROM actor_relevant_live_publications AS publication
        JOIN public.expense_private_drafts AS draft
          ON draft.id = publication.draft_id
         AND draft.actor_user_id = publication.actor_user_id
        LEFT JOIN exact_bindings AS binding
          ON binding.draft_id = publication.draft_id
        WHERE binding.draft_id IS NULL
          AND publication.source_draft_version = draft.version
      )
      SELECT COALESCE(
          pg_catalog.array_agg(
            domain.actor_user_id ORDER BY domain.draft_id
          ),
          ARRAY[]::uuid[]
        ),
        COALESCE(
          pg_catalog.array_agg(domain.draft_id ORDER BY domain.draft_id),
          ARRAY[]::uuid[]
        )
      INTO v_live_publication_actor_ids, v_live_publication_draft_ids
      FROM live_publication_probe_domain AS domain;
      -- END EXACT SQL171 LIVE-PUBLICATION NORMALIZER DOMAIN

      v_live_publication_probe_count :=
        pg_catalog.cardinality(v_live_publication_draft_ids);
      v_probe_index := 0;
      v_stage := 'live_publication_normalizer';
      FOREACH v_probe_draft_id IN ARRAY v_live_publication_draft_ids LOOP
        v_probe_index := v_probe_index + 1;
        v_probe_actor_id := v_live_publication_actor_ids[v_probe_index];
        PERFORM public.expense_sql159_normalize_private_draft(
          v_probe_actor_id, v_probe_draft_id, false
        );
        v_live_publication_completed_count :=
          v_live_publication_completed_count + 1;
      END LOOP;
    EXCEPTION WHEN OTHERS THEN
      v_sqlstate := SQLSTATE;
      v_failing_helper_substage := v_stage;
      v_classification := CASE
        WHEN v_sqlstate = 'P0001'
          AND v_stage = 'live_publication_normalizer'
          THEN 'live_publication_normalizer'
        ELSE 'execution_exception'
      END;
    END;
  END IF;

  IF v_classification IS NULL THEN
    v_stage := 'settlement_domain';
    BEGIN
      -- BEGIN EXACT SQL171 SETTLEMENT-CONSISTENCY DOMAIN
      WITH actor_groups AS MATERIALIZED (
        SELECT DISTINCT member.group_id
        FROM public.expense_group_members AS member
        WHERE member.user_id = p_actor_id
          AND member.status = 'active'
      ),
      settlement_probe_domain AS MATERIALIZED (
        SELECT expense.id AS expense_id, expense.group_id
        FROM public.expenses AS expense
        JOIN actor_groups AS actor_group
          ON actor_group.group_id = expense.group_id
        JOIN public.expense_groups AS group_row
          ON group_row.id = expense.group_id
        WHERE group_row.status IN ('active', 'settling', 'settled', 'closed')
          AND NOT EXISTS (
            SELECT 1
            FROM public.expense_edit_revision_bindings AS binding
            WHERE binding.expense_id = expense.id
          )
          AND (
            CASE WHEN expense.status = 'cancelled' THEN false ELSE true END
          )
      )
      SELECT COALESCE(
        pg_catalog.array_agg(domain.group_id ORDER BY domain.expense_id),
        ARRAY[]::uuid[]
      )
      INTO v_settlement_group_ids
      FROM settlement_probe_domain AS domain;
      -- END EXACT SQL171 SETTLEMENT-CONSISTENCY DOMAIN

      v_settlement_probe_count := pg_catalog.cardinality(v_settlement_group_ids);
      v_stage := 'settlement_consistency';
      FOREACH v_probe_group_id IN ARRAY v_settlement_group_ids LOOP
        PERFORM 1
        FROM public.expense_settlement_eligible_balances_v1(
          v_probe_group_id, false
        );
        v_settlement_completed_count := v_settlement_completed_count + 1;
      END LOOP;
    EXCEPTION WHEN OTHERS THEN
      v_sqlstate := SQLSTATE;
      v_failing_helper_substage := v_stage;
      v_classification := CASE
        WHEN v_sqlstate = 'P0001'
          AND v_stage = 'settlement_consistency'
          THEN 'settlement_consistency'
        ELSE 'execution_exception'
      END;
    END;
  END IF;

  IF v_classification IS NULL THEN
    v_stage := 'projection_query';
    BEGIN
    -- BEGIN EXACT SQL171 PROJECTION CTES
WITH actor_groups AS (
    SELECT DISTINCT member.group_id
    FROM public.expense_group_members AS member
    WHERE member.user_id = p_actor_id AND member.status = 'active'
  ),
  exact_bindings AS (
    SELECT binding.*, draft.version AS draft_version,
      draft.payload, draft.created_at AS draft_created_at,
      draft.updated_at AS draft_updated_at,
      publication.publication_id, publication.publication_version,
      publication.is_live, publication.title AS publication_title,
      publication.total_minor AS publication_total_minor,
      publication.currency AS publication_currency,
      publication.updated_at AS publication_updated_at,
      publication.published_at, publication.source_draft_version,
      expense.title AS expense_title,
      expense.total_minor AS expense_total_minor,
      expense.currency AS expense_currency
    FROM public.expense_edit_revision_bindings AS binding
    JOIN public.expense_private_drafts AS draft
      ON draft.id = binding.draft_id
     AND draft.context_type = 'edit'
     AND draft.expense_id = binding.expense_id
     AND draft.group_id = binding.group_id
     AND draft.actor_user_id = binding.actor_user_id
    JOIN public.expenses AS expense
      ON expense.id = binding.expense_id
     AND expense.group_id = binding.group_id
     AND expense.status = 'active'
    LEFT JOIN public.expense_unconfirmed_publications AS publication
      ON publication.draft_id = binding.draft_id
    WHERE (binding.mode = 'private' AND publication.is_live IS NOT DISTINCT FROM false)
       OR (binding.mode = 'private' AND publication.draft_id IS NULL)
       OR (binding.mode = 'shared' AND publication.is_live IS TRUE
         AND publication.actor_user_id = binding.actor_user_id
         AND publication.context_type = 'group'
         AND publication.group_id = binding.group_id)
  ),
  invalid_visible_bindings AS (
    SELECT binding.draft_id
    FROM public.expense_edit_revision_bindings AS binding
    JOIN public.expenses AS expense
      ON expense.id = binding.expense_id
     AND expense.group_id = binding.group_id
    JOIN actor_groups AS actor_group
      ON actor_group.group_id = expense.group_id
    WHERE (
        binding.actor_user_id = p_actor_id
        OR public.expense_sql159_audience_allows(p_actor_id, binding.draft_id)
      )
      AND NOT EXISTS (
      SELECT 1
      FROM exact_bindings AS exact_binding
      WHERE exact_binding.draft_id = binding.draft_id
        AND exact_binding.expense_id = binding.expense_id
        AND exact_binding.group_id = binding.group_id
        AND exact_binding.actor_user_id = binding.actor_user_id
    )
  ),
  actor_relevant_live_publications AS (
    SELECT publication.*
    FROM public.expense_unconfirmed_publications AS publication
    WHERE publication.is_live
      AND (
        publication.actor_user_id = p_actor_id
        OR public.expense_sql159_audience_allows(p_actor_id, publication.draft_id)
      )
  ),
  visible_live_publications AS (
    SELECT publication.*
    FROM actor_relevant_live_publications AS publication
    WHERE public.expense_sql159_audience_allows(p_actor_id, publication.draft_id)
  ),
  live_publication_sources AS (
    SELECT publication.draft_id, publication.context_type,
      draft.version AS current_draft_version, source.normalized,
      source.normalized IS NOT NULL
        AND (source.normalized->>'draft_version')::bigint
          = publication.source_draft_version
        AND source.normalized->>'shareable_fingerprint'
          = publication.shareable_fingerprint
        AND source.normalized->>'authority_fingerprint'
          = publication.authority_fingerprint
        AND source.normalized->>'context_type' = publication.context_type
        AND (source.normalized->>'group_id')::uuid
          IS NOT DISTINCT FROM publication.group_id
        AND (source.normalized->>'event_id')::uuid
          IS NOT DISTINCT FROM publication.event_id
        AND (source.normalized->>'event_roster_revision')::bigint
          IS NOT DISTINCT FROM publication.event_roster_revision
        AND (source.normalized->>'link_to_event')::boolean
          IS NOT DISTINCT FROM publication.link_to_event
        AND source.normalized->>'visibility' = publication.visibility
        AND source.normalized->>'title' = publication.title
        AND (source.normalized->>'total_minor')::bigint = publication.total_minor
        AND source.normalized->>'currency' = publication.currency
        AND (source.normalized->>'incurred_on')::date = publication.incurred_on
        AND source.normalized->>'allocation_state' = publication.allocation_state
        AND source.normalized->'parties' = (
          SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'ordinal', party.ordinal,
            'party_key_hash', party.party_key_hash,
            'identity_token_hash', party.identity_token_hash,
            'display_name', party.display_name,
            'is_author', party.is_author,
            'is_payer', party.is_payer,
            'is_participant', party.is_participant,
            'paid_minor', party.paid_minor,
            'share_minor', party.share_minor
          ) ORDER BY party.ordinal), '[]'::jsonb)
          FROM public.expense_unconfirmed_publication_parties AS party
          WHERE party.draft_id = publication.draft_id
        )
        AND (
          SELECT COALESCE(pg_catalog.jsonb_agg(normalized_audience.value
            ORDER BY normalized_audience.value->>'user_id' COLLATE pg_catalog."C"),
            '[]'::jsonb)
          FROM pg_catalog.jsonb_array_elements(
            source.normalized->'audience'
          ) AS normalized_audience(value)
        ) = (
          SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'user_id', audience.user_id,
            'audience_kind', audience.audience_kind,
            'identity_token_hash', audience.identity_token_hash,
            'binding_id', audience.binding_id,
            'binding_generation', audience.binding_generation
          ) ORDER BY audience.user_id::text COLLATE pg_catalog."C"), '[]'::jsonb)
          FROM public.expense_unconfirmed_publication_audience AS audience
          WHERE audience.draft_id = publication.draft_id
        ) AS source_exact
    FROM actor_relevant_live_publications AS publication
    JOIN public.expense_private_drafts AS draft
      ON draft.id = publication.draft_id
     AND draft.actor_user_id = publication.actor_user_id
    LEFT JOIN exact_bindings AS binding
      ON binding.draft_id = publication.draft_id
    LEFT JOIN LATERAL (
      SELECT CASE
        WHEN publication.source_draft_version = draft.version
          THEN public.expense_sql159_normalize_private_draft(
            publication.actor_user_id, publication.draft_id, false
          )
        ELSE NULL::jsonb
      END AS normalized
    ) AS source ON true
    WHERE binding.draft_id IS NULL
  ),
  shared_one_off_sources AS (
    SELECT source.draft_id, (source.normalized->>'circle_id')::uuid AS circle_id
    FROM live_publication_sources AS source
    WHERE source.context_type = 'one_off'
      AND source.normalized IS NOT NULL
      AND source.source_exact IS TRUE
  ),
  invalid_visible_publications AS (
    SELECT publication.draft_id
    FROM actor_relevant_live_publications AS publication
    LEFT JOIN exact_bindings AS binding
      ON binding.draft_id = publication.draft_id
    LEFT JOIN live_publication_sources AS source
      ON source.draft_id = publication.draft_id
    WHERE publication.title IS NULL
       OR pg_catalog.char_length(pg_catalog.btrim(publication.title)) NOT BETWEEN 1 AND 200
       OR publication.total_minor IS NULL
       OR publication.total_minor NOT BETWEEN 1 AND 9007199254740991
       OR publication.currency IS NULL
       OR publication.currency NOT IN ('ISK', 'EUR', 'USD', 'GBP', 'DKK', 'NOK', 'SEK')
       OR publication.updated_at IS NULL
       OR publication.published_at IS NULL
       OR NOT public.expense_sql159_audience_allows(p_actor_id, publication.draft_id)
       OR (
         source.normalized IS NOT NULL
         AND source.source_exact IS NOT TRUE
       )
       OR NOT (
         (binding.draft_id IS NOT NULL AND binding.mode = 'shared')
         OR (binding.draft_id IS NULL
           AND publication.context_type IN ('one_off', 'group')
           AND public.expense_sql159_snapshot_is_valid(publication.draft_id))
       )
  ),
  invalid_visible_private_edits AS (
    SELECT binding.draft_id
    FROM exact_bindings AS binding
    WHERE binding.mode = 'private'
      AND binding.actor_user_id = p_actor_id
      AND (
        pg_catalog.jsonb_typeof(binding.payload->'included') <> 'object'
        OR pg_catalog.jsonb_typeof(binding.payload->'payerKeys') <> 'array'
      )
  ),
  invalid_visible_states AS (
    SELECT draft_id FROM invalid_visible_bindings
    UNION ALL
    SELECT draft_id FROM invalid_visible_publications
    UNION ALL
    SELECT draft_id FROM invalid_visible_private_edits
  ),
  publication_person_facets AS (
    SELECT publication.draft_id,
      COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'key', CASE WHEN resolved.target_user_id IS NOT NULL
          THEN pg_catalog.md5('expense-sql170-durable-person-v1|'
            || p_actor_id::text || '|' || resolved.target_user_id::text)
          ELSE pg_catalog.md5('expense-sql170-manual-person-v1|'
            || p_actor_id::text || '|shared|' || publication.draft_id::text
            || '|' || party.party_key_hash)
        END,
        'label', CASE
          WHEN resolved.private_name IS NOT NULL
            AND pg_catalog.strpos(resolved.private_name, '@') = 0
            AND resolved.private_name !~ '[[:cntrl:]]'
            AND pg_catalog.translate(resolved.private_name,
              U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '') = resolved.private_name
            THEN resolved.private_name
          WHEN resolved.profile_name IS NOT NULL
            AND pg_catalog.strpos(resolved.profile_name, '@') = 0
            AND resolved.profile_name !~ '[[:cntrl:]]'
            AND pg_catalog.translate(resolved.profile_name,
              U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '') = resolved.profile_name
            THEN resolved.profile_name
          WHEN pg_catalog.strpos(party.display_name, '@') = 0
            AND party.display_name !~ '[[:cntrl:]]'
            AND pg_catalog.translate(party.display_name,
              U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '') = party.display_name
            THEN pg_catalog.btrim(party.display_name)
          WHEN resolved.target_user_id IS NOT NULL THEN 'Teskeiðarnotandi'
          ELSE 'Gestur'
        END,
        'kind', CASE WHEN resolved.target_user_id IS NULL
          THEN 'manual' ELSE 'durable' END
      ) ORDER BY party.ordinal), '[]'::jsonb) AS facets
    FROM visible_live_publications AS publication
    JOIN public.expense_unconfirmed_publication_parties AS party
      ON party.draft_id = publication.draft_id
    LEFT JOIN LATERAL (
      SELECT CASE WHEN party.is_author THEN publication.actor_user_id
        ELSE audience.user_id END AS target_user_id,
        NULLIF(pg_catalog.btrim(relationship.private_display_name), '') AS private_name,
        NULLIF(pg_catalog.btrim(profile.display_name), '') AS profile_name
      FROM (SELECT 1) AS singleton
      LEFT JOIN public.expense_unconfirmed_publication_audience AS audience
        ON audience.draft_id = party.draft_id
       AND audience.identity_token_hash = party.identity_token_hash
       AND NOT party.is_author
      LEFT JOIN public.relationships AS relationship
        ON relationship.owner_id = p_actor_id
       AND relationship.counterpart_user_id = CASE WHEN party.is_author
         THEN publication.actor_user_id ELSE audience.user_id END
      LEFT JOIN public.profiles AS profile
        ON profile.id = CASE WHEN party.is_author
          THEN publication.actor_user_id ELSE audience.user_id END
      LIMIT 1
    ) AS resolved ON true
    WHERE (party.is_payer OR party.is_participant)
      AND resolved.target_user_id IS DISTINCT FROM p_actor_id
    GROUP BY publication.draft_id
  ),
  private_creation AS (
    SELECT pg_catalog.md5('expense-sql170-presentation-v1|'
        || p_actor_id::text || '|draft|' || draft.id::text) AS presentation_key,
      'private_draft'::text AS presentation_state,
      pg_catalog.btrim(draft.payload->>'title') AS title,
      summary.total_minor AS total_minor,
      CASE WHEN summary.total_minor IS NULL
        THEN NULL ELSE draft.payload->>'currency' END AS currency,
      CASE draft.context_type
        WHEN 'one_off' THEN '/auth-mvp/utlagt-og-endurgreitt/nytt?draft=' || draft.id::text
        ELSE '/auth-mvp/utlagt-og-endurgreitt/hopar/' || draft.group_id::text
          || '/nytt-utgjald?draft=' || draft.id::text
      END AS href,
      'visible_updated_at'::text AS order_basis,
      pg_catalog.to_char(draft.updated_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS order_primary,
      pg_catalog.to_char(draft.created_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS order_secondary,
      COALESCE((
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'key', CASE WHEN identity.target_user_id IS NOT NULL
            THEN pg_catalog.md5('expense-sql170-durable-person-v1|'
              || p_actor_id::text || '|' || identity.target_user_id::text)
            ELSE pg_catalog.md5('expense-sql170-manual-person-v1|'
              || p_actor_id::text || '|private|' || draft.id::text
              || '|' || (party.value->>'party_key_hash'))
          END,
          'label', CASE
            WHEN identity.private_name IS NOT NULL
              AND pg_catalog.strpos(identity.private_name, '@') = 0
              AND identity.private_name !~ '[[:cntrl:]]'
              AND pg_catalog.translate(identity.private_name,
                U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '') = identity.private_name
              THEN identity.private_name
            WHEN identity.profile_name IS NOT NULL
              AND pg_catalog.strpos(identity.profile_name, '@') = 0
              AND identity.profile_name !~ '[[:cntrl:]]'
              AND pg_catalog.translate(identity.profile_name,
                U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '') = identity.profile_name
              THEN identity.profile_name
            WHEN pg_catalog.strpos(party.value->>'display_name', '@') = 0
              AND (party.value->>'display_name') !~ '[[:cntrl:]]'
              AND pg_catalog.translate(party.value->>'display_name',
                U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '')
                  = party.value->>'display_name'
              THEN party.value->>'display_name'
            WHEN identity.target_user_id IS NOT NULL THEN 'Teskeiðarnotandi'
            ELSE 'Gestur'
          END,
          'kind', CASE WHEN identity.target_user_id IS NULL
            THEN 'manual' ELSE 'durable' END
        ) ORDER BY (party.value->>'ordinal')::integer)
        FROM pg_catalog.jsonb_array_elements(source.normalized->'parties') AS party(value)
        LEFT JOIN LATERAL (
          SELECT CASE WHEN (party.value->>'is_author')::boolean THEN p_actor_id
            ELSE (audience.value->>'user_id')::uuid END AS target_user_id,
            NULLIF(pg_catalog.btrim(relationship.private_display_name), '') AS private_name,
            NULLIF(pg_catalog.btrim(profile.display_name), '') AS profile_name
          FROM (SELECT 1) AS singleton
          LEFT JOIN LATERAL (
            SELECT candidate.value
            FROM pg_catalog.jsonb_array_elements(source.normalized->'audience') AS candidate(value)
            WHERE candidate.value->>'identity_token_hash'
              = party.value->>'identity_token_hash'
            LIMIT 1
          ) AS audience ON NOT (party.value->>'is_author')::boolean
          LEFT JOIN public.relationships AS relationship
            ON relationship.owner_id = p_actor_id
           AND relationship.counterpart_user_id = CASE
             WHEN (party.value->>'is_author')::boolean THEN p_actor_id
             ELSE (audience.value->>'user_id')::uuid END
          LEFT JOIN public.profiles AS profile
            ON profile.id = CASE WHEN (party.value->>'is_author')::boolean
              THEN p_actor_id ELSE (audience.value->>'user_id')::uuid END
          LIMIT 1
        ) AS identity ON true
        WHERE identity.target_user_id IS DISTINCT FROM p_actor_id
      ), '[]'::jsonb) AS person_facets,
      COALESCE((
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'key', pg_catalog.md5('expense-sql170-circle-v1|'
            || p_actor_id::text || '|' || circle.id::text),
          'label', pg_catalog.btrim(circle.name)
        ))
        FROM public.relationship_circles AS circle
        JOIN public.relationship_circle_members AS actor_circle_member
          ON actor_circle_member.circle_id = circle.id
         AND actor_circle_member.user_id = p_actor_id
         AND actor_circle_member.status = 'active'
        WHERE circle.id = (source.normalized->>'circle_id')::uuid
          AND circle.status = 'active'
          AND pg_catalog.strpos(circle.name, '@') = 0
          AND circle.name !~ '[[:cntrl:]]'
          AND pg_catalog.translate(circle.name,
            U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '') = circle.name
      ), '[]'::jsonb) AS circle_facets
    FROM public.expense_private_drafts AS draft
    LEFT JOIN LATERAL (
      SELECT CASE
        WHEN pg_catalog.jsonb_typeof(draft.payload->'total') = 'string'
          THEN pg_catalog.regexp_replace(
            pg_catalog.btrim(draft.payload->>'total'), '[[:space:]]+', '', 'g'
          )
        ELSE NULL
      END AS raw_total
    ) AS raw ON true
    LEFT JOIN LATERAL (
      SELECT CASE
        WHEN raw.raw_total ~ '^[0-9]+([.,][0-9]+)?$'
          AND NOT (
            pg_catalog.strpos(raw.raw_total, '.') > 0
            AND pg_catalog.strpos(raw.raw_total, ',') > 0
          )
          THEN pg_catalog.replace(raw.raw_total, ',', '.')::numeric
        ELSE NULL
      END AS major_amount
    ) AS parsed ON true
    LEFT JOIN LATERAL (
      SELECT CASE
        WHEN draft.payload->>'currency' = 'ISK'
          AND parsed.major_amount > 0
          AND pg_catalog.scale(parsed.major_amount) = 0
          AND parsed.major_amount <= 9007199254740991
          THEN parsed.major_amount::bigint
        WHEN draft.payload->>'currency' IN ('EUR','USD','GBP','DKK','NOK','SEK')
          AND parsed.major_amount > 0
          AND pg_catalog.scale(parsed.major_amount) <= 2
          AND parsed.major_amount * 100 <= 9007199254740991
          THEN (parsed.major_amount * 100)::bigint
        ELSE NULL
      END AS total_minor
    ) AS summary ON true
    LEFT JOIN LATERAL (
      SELECT CASE
        WHEN draft.current_step = 'split' AND summary.total_minor IS NOT NULL
          THEN public.expense_sql159_normalize_private_draft(
            p_actor_id, draft.id, false
          )
        ELSE NULL::jsonb
      END AS normalized
    ) AS source ON true
    WHERE draft.actor_user_id = p_actor_id
      AND draft.context_type IN ('one_off', 'group')
      AND NOT EXISTS (
        SELECT 1 FROM public.expense_unconfirmed_publications AS publication
        WHERE publication.draft_id = draft.id AND publication.is_live
      )
  ),
  private_edit AS (
    SELECT pg_catalog.md5('expense-sql170-presentation-v1|'
        || p_actor_id::text || '|expense|' || binding.expense_id::text) AS presentation_key,
      'private_draft'::text AS presentation_state,
      CASE
        WHEN pg_catalog.jsonb_typeof(binding.payload->'title') = 'string'
          AND pg_catalog.char_length(pg_catalog.btrim(binding.payload->>'title'))
            BETWEEN 1 AND 200
          AND (binding.payload->>'title') !~ '[[:cntrl:]]'
          AND pg_catalog.translate(binding.payload->>'title',
            U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '')
              = binding.payload->>'title'
          THEN pg_catalog.btrim(binding.payload->>'title')
        ELSE binding.expense_title
      END AS title,
      binding.expense_total_minor AS total_minor,
      binding.expense_currency AS currency,
      '/auth-mvp/utlagt-og-endurgreitt/utgjold/' || binding.expense_id::text
        || '/breyta?step=split&draft=' || binding.draft_id::text AS href,
      'visible_updated_at'::text AS order_basis,
      pg_catalog.to_char(binding.draft_updated_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS order_primary,
      pg_catalog.to_char(binding.draft_created_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS order_secondary,
      COALESCE((
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'key', CASE WHEN identity.target_user_id IS NOT NULL
            THEN pg_catalog.md5('expense-sql170-durable-person-v1|'
              || p_actor_id::text || '|' || identity.target_user_id::text)
            ELSE pg_catalog.md5('expense-sql170-manual-person-v1|'
              || p_actor_id::text || '|edit|' || binding.group_id::text
              || '|' || member.id::text)
          END,
          'label', CASE
            WHEN identity.private_name IS NOT NULL
              AND pg_catalog.strpos(identity.private_name, '@') = 0
              AND identity.private_name !~ '[[:cntrl:]]'
              AND pg_catalog.translate(identity.private_name,
                U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '') = identity.private_name
              THEN identity.private_name
            WHEN identity.profile_name IS NOT NULL
              AND pg_catalog.strpos(identity.profile_name, '@') = 0
              AND identity.profile_name !~ '[[:cntrl:]]'
              AND pg_catalog.translate(identity.profile_name,
                U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '') = identity.profile_name
              THEN identity.profile_name
            WHEN pg_catalog.strpos(member.display_name, '@') = 0
              AND member.display_name !~ '[[:cntrl:]]'
              AND pg_catalog.translate(member.display_name,
                U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '') = member.display_name
              THEN pg_catalog.btrim(member.display_name)
            WHEN identity.target_user_id IS NOT NULL THEN 'Teskeiðarnotandi'
            ELSE 'Gestur'
          END,
          'kind', CASE WHEN identity.target_user_id IS NULL
            THEN 'manual' ELSE 'durable' END
        ) ORDER BY member.id)
        FROM public.expense_group_members AS member
        LEFT JOIN public.expense_member_identity_bindings AS identity_binding
          ON identity_binding.group_id = member.group_id
         AND identity_binding.member_id = member.id
        LEFT JOIN LATERAL (
          SELECT COALESCE(member.user_id, identity_binding.target_user_id) AS target_user_id,
            NULLIF(pg_catalog.btrim(relationship.private_display_name), '') AS private_name,
            NULLIF(pg_catalog.btrim(profile.display_name), '') AS profile_name
          FROM (SELECT 1) AS singleton
          LEFT JOIN public.relationships AS relationship
            ON relationship.owner_id = p_actor_id
           AND relationship.counterpart_user_id
             = COALESCE(member.user_id, identity_binding.target_user_id)
          LEFT JOIN public.profiles AS profile
            ON profile.id = COALESCE(member.user_id, identity_binding.target_user_id)
        ) AS identity ON true
        WHERE member.group_id = binding.group_id
          AND member.status = 'active'
          AND identity.target_user_id IS DISTINCT FROM p_actor_id
          AND (
            binding.payload->'payerKeys' @> pg_catalog.jsonb_build_array(member.id::text)
            OR COALESCE((binding.payload->'included'->>member.id::text)::boolean, false)
          )
      ), '[]'::jsonb) AS person_facets,
      COALESCE((
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'key', pg_catalog.md5('expense-sql170-circle-v1|'
            || p_actor_id::text || '|' || context.circle_id::text),
          'label', pg_catalog.btrim(circle.name)
        ))
        FROM public.relationship_circle_expense_contexts AS context
        JOIN public.relationship_circles AS circle
          ON circle.id = context.circle_id AND circle.status = 'active'
        JOIN public.relationship_circle_members AS actor_circle_member
          ON actor_circle_member.circle_id = circle.id
         AND actor_circle_member.user_id = p_actor_id
         AND actor_circle_member.status = 'active'
        WHERE context.group_id = binding.group_id
          AND pg_catalog.strpos(circle.name, '@') = 0
          AND circle.name !~ '[[:cntrl:]]'
          AND pg_catalog.translate(circle.name,
            U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '') = circle.name
      ), '[]'::jsonb) AS circle_facets
    FROM exact_bindings AS binding
    WHERE binding.mode = 'private' AND binding.actor_user_id = p_actor_id
      AND pg_catalog.jsonb_typeof(binding.payload->'included') = 'object'
      AND pg_catalog.jsonb_typeof(binding.payload->'payerKeys') = 'array'
  ),
  shared_presentations AS (
    SELECT CASE WHEN binding.draft_id IS NOT NULL
      THEN pg_catalog.md5('expense-sql170-presentation-v1|'
        || p_actor_id::text || '|expense|' || binding.expense_id::text)
      ELSE pg_catalog.md5('expense-sql170-presentation-v1|'
        || p_actor_id::text || '|draft|' || publication.draft_id::text)
      END AS presentation_key,
      'shared_draft'::text AS presentation_state,
      publication.title, publication.total_minor, publication.currency,
      CASE
        WHEN publication.actor_user_id = p_actor_id AND binding.draft_id IS NOT NULL
          THEN '/auth-mvp/utlagt-og-endurgreitt/utgjold/' || binding.expense_id::text
            || '/breyta?step=split&draft=' || binding.draft_id::text
        WHEN publication.actor_user_id = p_actor_id
          AND publication.context_type = 'group'
          THEN '/auth-mvp/utlagt-og-endurgreitt/hopar/' || publication.group_id::text
            || '/nytt-utgjald?draft=' || publication.draft_id::text
        WHEN publication.actor_user_id = p_actor_id
          THEN '/auth-mvp/utlagt-og-endurgreitt/nytt?draft=' || publication.draft_id::text
        ELSE '/auth-mvp/utlagt-og-endurgreitt/drog/' || publication.publication_id::text
      END AS href,
      'visible_updated_at'::text AS order_basis,
      pg_catalog.to_char(publication.updated_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS order_primary,
      pg_catalog.to_char(publication.published_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS order_secondary,
      COALESCE(facets.facets, '[]'::jsonb) AS person_facets,
      COALESCE((
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'key', pg_catalog.md5('expense-sql170-circle-v1|'
            || p_actor_id::text || '|' || circle_source.circle_id::text),
          'label', pg_catalog.btrim(authorized_circle.name)
        ))
        FROM (
          SELECT context.circle_id
          FROM public.relationship_circle_expense_contexts AS context
          WHERE publication.context_type = 'group'
            AND context.group_id = publication.group_id
          UNION ALL
          SELECT source.circle_id
          FROM shared_one_off_sources AS source
          WHERE publication.context_type = 'one_off'
            AND source.draft_id = publication.draft_id
        ) AS circle_source
        JOIN public.relationship_circles AS authorized_circle
          ON authorized_circle.id = circle_source.circle_id
         AND authorized_circle.status = 'active'
        JOIN public.relationship_circle_members AS actor_circle_member
          ON actor_circle_member.circle_id = authorized_circle.id
         AND actor_circle_member.user_id = p_actor_id
         AND actor_circle_member.status = 'active'
        WHERE pg_catalog.strpos(authorized_circle.name, '@') = 0
          AND authorized_circle.name !~ '[[:cntrl:]]'
          AND pg_catalog.translate(authorized_circle.name,
            U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '')
              = authorized_circle.name
      ), '[]'::jsonb) AS circle_facets
    FROM visible_live_publications AS publication
    LEFT JOIN exact_bindings AS binding ON binding.draft_id = publication.draft_id
    LEFT JOIN publication_person_facets AS facets ON facets.draft_id = publication.draft_id
    WHERE (
        (binding.draft_id IS NOT NULL AND binding.mode = 'shared')
        OR (binding.draft_id IS NULL
          AND publication.context_type IN ('one_off', 'group')
          AND public.expense_sql159_snapshot_is_valid(publication.draft_id))
      )
  ),
  canonical_member_ids AS (
    SELECT payment.expense_id, payment.member_id FROM public.expense_payments AS payment
    UNION
    SELECT share_row.expense_id, share_row.member_id FROM public.expense_shares AS share_row
  ),
  canonical_presentations AS (
    SELECT pg_catalog.md5('expense-sql170-presentation-v1|'
        || p_actor_id::text || '|expense|' || expense.id::text) AS presentation_key,
      CASE
        WHEN expense.status = 'cancelled' THEN 'cancelled'
        WHEN EXISTS (
          SELECT 1 FROM public.expense_settlement_eligible_balances_v1(
            expense.group_id, false
          ) AS balance
        ) OR EXISTS (
          SELECT 1 FROM public.expense_repayments AS repayment
          WHERE repayment.group_id = expense.group_id
            AND repayment.status = 'reported'
        ) THEN 'confirmed'
        ELSE 'settled'
      END::text AS presentation_state,
      expense.title, expense.total_minor, expense.currency,
      '/auth-mvp/utlagt-og-endurgreitt/utgjold/' || expense.id::text AS href,
      'incurred_on'::text AS order_basis,
      expense.incurred_on::text AS order_primary,
      pg_catalog.to_char(expense.created_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS order_secondary,
      COALESCE((
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'key', CASE WHEN identity.target_user_id IS NOT NULL
            THEN pg_catalog.md5('expense-sql170-durable-person-v1|'
              || p_actor_id::text || '|' || identity.target_user_id::text)
            ELSE pg_catalog.md5('expense-sql170-manual-person-v1|'
              || p_actor_id::text || '|expense|' || expense.group_id::text
              || '|' || member.id::text)
          END,
          'label', CASE
            WHEN identity.private_name IS NOT NULL
              AND pg_catalog.strpos(identity.private_name, '@') = 0
              AND identity.private_name !~ '[[:cntrl:]]'
              AND pg_catalog.translate(identity.private_name,
                U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '') = identity.private_name
              THEN identity.private_name
            WHEN identity.profile_name IS NOT NULL
              AND pg_catalog.strpos(identity.profile_name, '@') = 0
              AND identity.profile_name !~ '[[:cntrl:]]'
              AND pg_catalog.translate(identity.profile_name,
                U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '') = identity.profile_name
              THEN identity.profile_name
            WHEN pg_catalog.strpos(member.display_name, '@') = 0
              AND member.display_name !~ '[[:cntrl:]]'
              AND pg_catalog.translate(member.display_name,
                U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '') = member.display_name
              THEN pg_catalog.btrim(member.display_name)
            WHEN identity.target_user_id IS NOT NULL THEN 'Teskeiðarnotandi'
            ELSE 'Gestur'
          END,
          'kind', CASE WHEN identity.target_user_id IS NULL
            THEN 'manual' ELSE 'durable' END
        ) ORDER BY member.id)
        FROM canonical_member_ids AS selected
        JOIN public.expense_group_members AS member
          ON member.id = selected.member_id AND member.group_id = expense.group_id
        LEFT JOIN public.expense_member_identity_bindings AS identity_binding
          ON identity_binding.group_id = member.group_id
         AND identity_binding.member_id = member.id
        LEFT JOIN LATERAL (
          SELECT COALESCE(member.user_id, identity_binding.target_user_id) AS target_user_id,
            NULLIF(pg_catalog.btrim(relationship.private_display_name), '') AS private_name,
            NULLIF(pg_catalog.btrim(profile.display_name), '') AS profile_name
          FROM (SELECT 1) AS singleton
          LEFT JOIN public.relationships AS relationship
            ON relationship.owner_id = p_actor_id
           AND relationship.counterpart_user_id
             = COALESCE(member.user_id, identity_binding.target_user_id)
          LEFT JOIN public.profiles AS profile
            ON profile.id = COALESCE(member.user_id, identity_binding.target_user_id)
        ) AS identity ON true
        WHERE selected.expense_id = expense.id
          AND identity.target_user_id IS DISTINCT FROM p_actor_id
      ), '[]'::jsonb) AS person_facets,
      COALESCE((
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'key', pg_catalog.md5('expense-sql170-circle-v1|'
            || p_actor_id::text || '|' || context.circle_id::text),
          'label', pg_catalog.btrim(circle.name)
        ))
        FROM public.relationship_circle_expense_contexts AS context
        JOIN public.relationship_circles AS circle
          ON circle.id = context.circle_id AND circle.status = 'active'
        JOIN public.relationship_circle_members AS actor_circle_member
          ON actor_circle_member.circle_id = circle.id
         AND actor_circle_member.user_id = p_actor_id
         AND actor_circle_member.status = 'active'
        WHERE context.group_id = expense.group_id
          AND pg_catalog.strpos(circle.name, '@') = 0
          AND circle.name !~ '[[:cntrl:]]'
          AND pg_catalog.translate(circle.name,
            U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '') = circle.name
      ), '[]'::jsonb) AS circle_facets
    FROM public.expenses AS expense
    JOIN actor_groups AS actor_group ON actor_group.group_id = expense.group_id
    JOIN public.expense_groups AS group_row ON group_row.id = expense.group_id
    WHERE group_row.status IN ('active', 'settling', 'settled', 'closed')
      AND NOT EXISTS (
        SELECT 1 FROM public.expense_edit_revision_bindings AS binding
        WHERE binding.expense_id = expense.id
      )
  ),
  candidates AS (
    SELECT * FROM private_creation
    UNION ALL SELECT * FROM private_edit
    UNION ALL SELECT * FROM shared_presentations
    UNION ALL SELECT * FROM canonical_presentations
  ),
  limited AS (
    SELECT candidate.*
    FROM candidates AS candidate
    ORDER BY CASE candidate.presentation_state
      WHEN 'private_draft' THEN 1 WHEN 'shared_draft' THEN 2
      WHEN 'confirmed' THEN 3 WHEN 'settled' THEN 4 ELSE 5 END,
      candidate.order_primary DESC, candidate.order_secondary DESC,
      candidate.presentation_key
    LIMIT 101
  )
    -- END EXACT SQL171 PROJECTION CTES
  SELECT pg_catalog.count(*)::integer,
    pg_catalog.count(DISTINCT limited.presentation_key)::integer,
    (SELECT pg_catalog.count(*)::integer FROM invalid_visible_bindings),
    (SELECT pg_catalog.count(*)::integer FROM invalid_visible_publications),
    (SELECT pg_catalog.count(*)::integer FROM invalid_visible_private_edits),
    COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'presentation_key', limited.presentation_key,
      'presentation_state', limited.presentation_state,
      'title', limited.title,
      'total_minor', limited.total_minor,
      'currency', limited.currency,
      'href', limited.href,
      'order', pg_catalog.jsonb_build_object(
        'basis', limited.order_basis,
        'primary', limited.order_primary,
        'secondary', limited.order_secondary,
        'tie_breaker', limited.presentation_key
      ),
      'person_facets', limited.person_facets,
      'circle_facets', limited.circle_facets
    ) ORDER BY CASE limited.presentation_state
      WHEN 'private_draft' THEN 1 WHEN 'shared_draft' THEN 2
      WHEN 'confirmed' THEN 3 WHEN 'settled' THEN 4 ELSE 5 END,
      limited.order_primary DESC, limited.order_secondary DESC,
      limited.presentation_key), '[]'::jsonb)
  INTO v_candidate_count, v_distinct_candidate_count,
    v_invalid_visible_bindings_count, v_invalid_visible_publications_count,
    v_invalid_visible_private_edits_count, v_discarded_rows
  FROM limited;

      IF v_invalid_visible_bindings_count <> 0 THEN
        v_classification := 'invalid_visible_bindings';
      ELSIF v_invalid_visible_publications_count <> 0 THEN
        v_classification := 'invalid_visible_publications';
      ELSIF v_invalid_visible_private_edits_count <> 0 THEN
        v_classification := 'invalid_visible_private_edits';
      ELSIF v_candidate_count > 100 THEN
        v_classification := 'candidate_limit_exceeded';
      ELSIF v_candidate_count IS DISTINCT FROM v_distinct_candidate_count THEN
        v_classification := 'duplicate_presentation_keys';
      ELSE
        v_classification := 'diagnostic_ready';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_sqlstate := SQLSTATE;
      v_failing_helper_substage := 'projection_query';
      v_classification := CASE
        WHEN v_sqlstate = 'P0001' THEN 'other_projection_p0001'
        ELSE 'execution_exception'
      END;
    END;
  END IF;

  IF v_sqlstate IS NOT NULL THEN
    v_error_category := CASE pg_catalog.left(v_sqlstate, 2)
      WHEN '22' THEN 'data_exception'
      WHEN '23' THEN 'integrity_constraint'
      WHEN '42' THEN 'syntax_or_access_rule'
      WHEN '53' THEN 'insufficient_resources'
      WHEN '54' THEN 'program_limit'
      WHEN '55' THEN 'object_state'
      WHEN '57' THEN 'operator_intervention'
      WHEN 'P0' THEN 'user_defined_exception'
      WHEN 'XX' THEN 'internal_error'
      ELSE 'other'
    END;
  END IF;

  IF v_classification = 'diagnostic_ready' THEN
    v_stage := 'complete';
  END IF;

  -- BEGIN SAFE CONTROLLED EXCEPTION PUBLISHER
  RAISE EXCEPTION USING
    ERRCODE = 'P1701',
    MESSAGE = pg_catalog.jsonb_build_object(
    'diagnostic_contract_version', 2,
    'classification', v_classification,
    'failing_helper_substage', v_failing_helper_substage,
    'stage', v_stage,
    'actor_account_exists', v_actor_account_exists,
    'actor_beta_access', v_actor_beta_access,
    'identity_binding_conflict', v_identity_binding_conflict,
    'private_creation_probe_count',
      CASE WHEN v_private_creation_probe_count IS NULL THEN NULL
        ELSE LEAST(v_private_creation_probe_count, 101) END,
    'private_creation_completed_count',
      LEAST(v_private_creation_completed_count, 101),
    'live_publication_probe_count',
      CASE WHEN v_live_publication_probe_count IS NULL THEN NULL
        ELSE LEAST(v_live_publication_probe_count, 101) END,
    'live_publication_completed_count',
      LEAST(v_live_publication_completed_count, 101),
    'settlement_probe_count',
      CASE WHEN v_settlement_probe_count IS NULL THEN NULL
        ELSE LEAST(v_settlement_probe_count, 101) END,
    'settlement_completed_count',
      LEAST(v_settlement_completed_count, 101),
    'invalid_visible_bindings_count',
      CASE WHEN v_invalid_visible_bindings_count IS NULL THEN NULL
        ELSE LEAST(v_invalid_visible_bindings_count, 101) END,
    'invalid_visible_publications_count',
      CASE WHEN v_invalid_visible_publications_count IS NULL THEN NULL
        ELSE LEAST(v_invalid_visible_publications_count, 101) END,
    'invalid_visible_private_edits_count',
      CASE WHEN v_invalid_visible_private_edits_count IS NULL THEN NULL
        ELSE LEAST(v_invalid_visible_private_edits_count, 101) END,
    'candidate_count',
      CASE WHEN v_candidate_count IS NULL THEN NULL
        ELSE LEAST(v_candidate_count, 101) END,
    'distinct_presentation_key_count',
      CASE WHEN v_distinct_candidate_count IS NULL THEN NULL
        ELSE LEAST(v_distinct_candidate_count, 101) END,
    'sqlstate', v_sqlstate,
    'error_category', v_error_category
  )::text;
  -- END SAFE CONTROLLED EXCEPTION PUBLISHER
END;
$sql171_helper_p0001_diagnostic$;
