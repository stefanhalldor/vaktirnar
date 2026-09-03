import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const diagnosticPath =
  'sql/validation/171-expense-dashboard-json-extract-precedence-hotfix/diagnose-projection-helper-p0001-v242.sql'
const alignedDiagnosticPath =
  'sql/validation/171-expense-dashboard-json-extract-precedence-hotfix/diagnose-runtime-unavailable-branch-v239-aad418ee.sql'

const diagnosticRaw = readFileSync(diagnosticPath, 'utf8')
const diagnostic = diagnosticRaw.replace(/\r\n/g, '\n')
const alignedDiagnostic = readFileSync(alignedDiagnosticPath, 'utf8').replace(/\r\n/g, '\n')
const placeholder = '__STEBBI_PRIVATE_ACTOR_UUID__'

function sha256(source: string): string {
  return createHash('sha256').update(source).digest('hex')
}

function occurrences(source: string, needle: string): number {
  return source.split(needle).length - 1
}

function between(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex + start.length)
  expect(startIndex, start).toBeGreaterThan(-1)
  expect(endIndex, end).toBeGreaterThan(startIndex)
  return source.slice(startIndex + start.length, endIndex)
}

function compact(source: string): string {
  return source.replace(/\s+/g, ' ').trim()
}

const expectedPrivateCreationDomain = `
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
FROM private_creation_probe_domain AS domain;`

const expectedLivePublicationDomain = `
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
FROM live_publication_probe_domain AS domain;`

const expectedSettlementDomain = `
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
FROM settlement_probe_domain AS domain;`

describe('SQL171 projection-helper P0001 diagnostic', () => {
  it('freezes the reviewed artifact shape and one private actor input', () => {
    expect(sha256(diagnosticRaw)).toBe(
      '8ceb4326577a44a5825fb3ecd973e9a297a63d356e59d0f13c3bf5b6f44db8e7',
    )
    expect(diagnostic).toMatch(/^-- SQL171 PROJECTION-HELPER P0001 DIAGNOSTIC TEMPLATE:/)
    expect(occurrences(diagnostic, placeholder)).toBe(1)
    expect(diagnostic).toContain(`p_actor_id := '${placeholder}'::uuid;`)
    expect(occurrences(diagnostic, 'DO $sql171_helper_p0001_diagnostic$')).toBe(1)
    expect(diagnostic.trimEnd().endsWith('$sql171_helper_p0001_diagnostic$;')).toBe(true)
    expect(diagnostic).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i)
  })

  it('retains the full SQL171 projection byte-for-byte for the residual probe', () => {
    const v242Projection = between(
      diagnostic,
      '    -- BEGIN EXACT SQL171 PROJECTION CTES\n',
      '\n    -- END EXACT SQL171 PROJECTION CTES',
    )
    const v239Projection = between(
      alignedDiagnostic,
      '    -- BEGIN EXACT SQL171 PROJECTION CTES\n',
      '\n    -- END EXACT SQL171 PROJECTION CTES',
    )
    expect(v242Projection).toBe(v239Projection)
    expect(occurrences(v242Projection, "|| '|' || (party.value->>'party_key_hash'))")).toBe(1)
    expect(occurrences(v242Projection, "|| '|' || party.value->>'party_key_hash')")).toBe(0)
  })

  it('uses the exact private-creation normalizer domain and no broader draft probe', () => {
    const domain = between(
      diagnostic,
      '      -- BEGIN EXACT SQL171 PRIVATE-CREATION NORMALIZER DOMAIN\n',
      '\n      -- END EXACT SQL171 PRIVATE-CREATION NORMALIZER DOMAIN',
    )
    expect(compact(domain)).toBe(compact(expectedPrivateCreationDomain))
    for (const clause of [
      "FROM public.expense_private_drafts AS draft",
      "pg_catalog.jsonb_typeof(draft.payload->'total') = 'string'",
      "raw.raw_total ~ '^[0-9]+([.,][0-9]+)?$'",
      "draft.payload->>'currency' = 'ISK'",
      "draft.payload->>'currency' IN ('EUR','USD','GBP','DKK','NOK','SEK')",
      'draft.actor_user_id = p_actor_id',
      "draft.context_type IN ('one_off', 'group')",
      'publication.draft_id = draft.id',
      'publication.is_live',
      "draft.current_step = 'split'",
      'summary.total_minor IS NOT NULL',
    ]) expect(compact(domain)).toContain(compact(clause))
    expect(occurrences(domain, 'FROM public.expense_private_drafts AS draft')).toBe(1)
    expect(domain).toContain('ARRAY[]::uuid[]')

    const probe = between(
      diagnostic,
      "      v_stage := 'private_creation_normalizer';\n",
      '\n    EXCEPTION WHEN OTHERS THEN',
    )
    expect(probe).toContain(
      'public.expense_sql159_normalize_private_draft(\n          p_actor_id, v_probe_draft_id, false\n        )',
    )
    expect(occurrences(probe, 'expense_sql159_normalize_private_draft(')).toBe(1)
  })

  it('uses the exact live-publication normalizer domain', () => {
    const domain = between(
      diagnostic,
      '      -- BEGIN EXACT SQL171 LIVE-PUBLICATION NORMALIZER DOMAIN\n',
      '\n      -- END EXACT SQL171 LIVE-PUBLICATION NORMALIZER DOMAIN',
    )
    expect(compact(domain)).toBe(compact(expectedLivePublicationDomain))
    for (const clause of [
      'draft.context_type = \'edit\'',
      'draft.expense_id = binding.expense_id',
      'draft.group_id = binding.group_id',
      'draft.actor_user_id = binding.actor_user_id',
      'expense.status = \'active\'',
      "binding.mode = 'private' AND publication.draft_id IS NULL",
      "binding.mode = 'shared' AND publication.is_live IS TRUE",
      'publication.actor_user_id = p_actor_id',
      'public.expense_sql159_audience_allows(',
      'draft.actor_user_id = publication.actor_user_id',
      'binding.draft_id IS NULL',
      'publication.source_draft_version = draft.version',
    ]) expect(compact(domain)).toContain(compact(clause))
    expect(domain).toContain('ARRAY[]::uuid[]')

    const probe = between(
      diagnostic,
      "      v_stage := 'live_publication_normalizer';\n",
      '\n    EXCEPTION WHEN OTHERS THEN',
    )
    expect(probe).toContain(
      'public.expense_sql159_normalize_private_draft(\n          v_probe_actor_id, v_probe_draft_id, false\n        )',
    )
    expect(occurrences(probe, 'expense_sql159_normalize_private_draft(')).toBe(1)
  })

  it('uses only the canonical non-cancelled Expense settlement-helper domain', () => {
    const domain = between(
      diagnostic,
      '      -- BEGIN EXACT SQL171 SETTLEMENT-CONSISTENCY DOMAIN\n',
      '\n      -- END EXACT SQL171 SETTLEMENT-CONSISTENCY DOMAIN',
    )
    expect(compact(domain)).toBe(compact(expectedSettlementDomain))
    for (const clause of [
      'SELECT DISTINCT member.group_id',
      'member.user_id = p_actor_id',
      "member.status = 'active'",
      'FROM public.expenses AS expense',
      'actor_group.group_id = expense.group_id',
      'group_row.id = expense.group_id',
      "group_row.status IN ('active', 'settling', 'settled', 'closed')",
      'binding.expense_id = expense.id',
      "CASE WHEN expense.status = 'cancelled' THEN false ELSE true END",
    ]) expect(compact(domain)).toContain(compact(clause))
    expect(occurrences(domain, 'FROM public.expenses AS expense')).toBe(1)

    const probe = between(
      diagnostic,
      "      v_stage := 'settlement_consistency';\n",
      '\n    EXCEPTION WHEN OTHERS THEN',
    )
    expect(probe).toContain(
      'public.expense_settlement_eligible_balances_v1(\n          v_probe_group_id, false\n        )',
    )
    expect(occurrences(probe, 'expense_settlement_eligible_balances_v1(')).toBe(1)
  })

  it('rejects predicate broadening independently in all three helper domains', () => {
    const privateCreationDomain = between(
      diagnostic,
      '      -- BEGIN EXACT SQL171 PRIVATE-CREATION NORMALIZER DOMAIN\n',
      '\n      -- END EXACT SQL171 PRIVATE-CREATION NORMALIZER DOMAIN',
    )
    const broadenedPrivateCreation = privateCreationDomain.replace(
      'WHERE draft.actor_user_id = p_actor_id',
      'WHERE (draft.actor_user_id = p_actor_id OR draft.actor_user_id IS DISTINCT FROM p_actor_id)',
    )
    expect(broadenedPrivateCreation).not.toBe(privateCreationDomain)
    expect(compact(broadenedPrivateCreation)).not.toBe(compact(expectedPrivateCreationDomain))

    const livePublicationDomain = between(
      diagnostic,
      '      -- BEGIN EXACT SQL171 LIVE-PUBLICATION NORMALIZER DOMAIN\n',
      '\n      -- END EXACT SQL171 LIVE-PUBLICATION NORMALIZER DOMAIN',
    )
    const broadenedLivePublication = livePublicationDomain.replace(
      'publication.actor_user_id = p_actor_id',
      '(publication.actor_user_id = p_actor_id OR publication.actor_user_id IS DISTINCT FROM p_actor_id)',
    )
    expect(broadenedLivePublication).not.toBe(livePublicationDomain)
    expect(compact(broadenedLivePublication)).not.toBe(compact(expectedLivePublicationDomain))

    const settlementDomain = between(
      diagnostic,
      '      -- BEGIN EXACT SQL171 SETTLEMENT-CONSISTENCY DOMAIN\n',
      '\n      -- END EXACT SQL171 SETTLEMENT-CONSISTENCY DOMAIN',
    )
    const broadenedSettlement = settlementDomain.replace(
      'member.user_id = p_actor_id',
      '(member.user_id = p_actor_id OR member.user_id IS DISTINCT FROM p_actor_id)',
    )
    expect(broadenedSettlement).not.toBe(settlementDomain)
    expect(compact(broadenedSettlement)).not.toBe(compact(expectedSettlementDomain))
  })

  it('classifies the three isolated helpers and residual P0001 deterministically', () => {
    for (const classification of [
      'private_creation_normalizer',
      'live_publication_normalizer',
      'settlement_consistency',
      'other_projection_p0001',
    ]) expect(diagnostic).toContain(`'${classification}'`)
    expect(diagnostic).toContain(
      "WHEN v_sqlstate = 'P0001' THEN 'other_projection_p0001'",
    )
    expect(occurrences(
      diagnostic,
      "WHEN v_sqlstate = 'P0001' THEN 'other_projection_p0001'",
    )).toBe(1)
    expect(diagnostic).toContain("WHEN 'P0' THEN 'user_defined_exception'")
    expect(occurrences(diagnostic, 'EXCEPTION WHEN OTHERS THEN')).toBe(7)
    expect(occurrences(diagnostic, 'v_sqlstate := SQLSTATE;')).toBe(7)
  })

  it('publishes only completed or explicitly nullable bounded counts', () => {
    for (const count of [
      'v_private_creation_probe_count',
      'v_live_publication_probe_count',
      'v_settlement_probe_count',
      'v_invalid_visible_bindings_count',
      'v_invalid_visible_publications_count',
      'v_invalid_visible_private_edits_count',
      'v_candidate_count',
      'v_distinct_candidate_count',
    ]) {
      expect(diagnostic).toContain(
        `CASE WHEN ${count} IS NULL THEN NULL\n        ELSE LEAST(${count}, 101) END`,
      )
    }
    for (const count of [
      'v_private_creation_completed_count',
      'v_live_publication_completed_count',
      'v_settlement_completed_count',
    ]) {
      expect(diagnostic).toContain(`${count} integer := 0;`)
      expect(diagnostic).toContain(`LEAST(${count}, 101)`)
    }
    expect(diagnostic).not.toMatch(/pg_catalog\.(?:least|greatest|coalesce|nullif|case)\b/i)
  })

  it('keeps one controlled P1701 publisher after all classification work', () => {
    expect(occurrences(diagnostic, 'RAISE NOTICE')).toBe(0)
    expect(occurrences(diagnostic, 'RAISE EXCEPTION USING')).toBe(1)
    expect(occurrences(diagnostic, "ERRCODE = 'P1701'")).toBe(1)
    const publisherStart = diagnostic.indexOf('  -- BEGIN SAFE CONTROLLED EXCEPTION PUBLISHER')
    const publisherEnd = diagnostic.indexOf('  -- END SAFE CONTROLLED EXCEPTION PUBLISHER')
    expect(publisherStart).toBeGreaterThan(diagnostic.lastIndexOf('EXCEPTION WHEN OTHERS THEN'))
    expect(publisherStart).toBeGreaterThan(diagnostic.indexOf("WHEN 'P0' THEN 'user_defined_exception'"))
    expect(publisherEnd).toBeGreaterThan(publisherStart)
    expect(diagnostic.slice(
      publisherEnd + '  -- END SAFE CONTROLLED EXCEPTION PUBLISHER'.length,
    )).toMatch(/^\nEND;\n\$sql171_helper_p0001_diagnostic\$;\n?$/)

    const publisher = diagnostic.slice(publisherStart, publisherEnd)
    const message = between(
      publisher,
      'MESSAGE = pg_catalog.jsonb_build_object(\n',
      '\n  )::text;',
    )
    expect([...message.matchAll(/'([^']+)'\s*,/g)].map((match) => match[1])).toEqual([
      'diagnostic_contract_version',
      'classification',
      'failing_helper_substage',
      'stage',
      'actor_account_exists',
      'actor_beta_access',
      'identity_binding_conflict',
      'private_creation_probe_count',
      'private_creation_completed_count',
      'live_publication_probe_count',
      'live_publication_completed_count',
      'settlement_probe_count',
      'settlement_completed_count',
      'invalid_visible_bindings_count',
      'invalid_visible_publications_count',
      'invalid_visible_private_edits_count',
      'candidate_count',
      'distinct_presentation_key_count',
      'sqlstate',
      'error_category',
    ])
    expect(publisher).not.toMatch(/p_actor_id|v_probe_(?:actor|draft|group)_id|v_discarded_rows|::uuid|SQLERRM|DETAIL\s*=|HINT\s*=|CONTEXT\s*=/i)
  })

  it('is read-only and does not invoke or modify the installed target', () => {
    expect(diagnostic).not.toMatch(/^\s*(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|COMMIT|BEGIN TRANSACTION|START TRANSACTION)\b/im)
    expect(diagnostic).not.toMatch(/set_config|current_setting|request\.jwt|SET\s+(LOCAL\s+)?(?:ROLE|SESSION|TRANSACTION|statement_timeout)|CREATE\s+(?:TEMP|TEMPORARY)/i)
    expect(diagnostic).not.toContain('public.expense_list_dashboard_presentations_v1(')
    expect(diagnostic).not.toMatch(/SQLERRM|MESSAGE_TEXT|PG_EXCEPTION_(DETAIL|HINT|CONTEXT)|GET STACKED DIAGNOSTICS/i)
    expect(occurrences(diagnostic, 'expense_sql159_normalize_private_draft(')).toBe(4)
    expect(occurrences(diagnostic, 'expense_settlement_eligible_balances_v1(')).toBe(2)
  })
})
