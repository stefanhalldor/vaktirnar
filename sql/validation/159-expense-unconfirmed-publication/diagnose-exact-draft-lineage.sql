-- Replace D1, D2 and E only in this single operator-input row.
BEGIN TRANSACTION READ ONLY;
WITH operator_input(d1_id,d2_id,e_id) AS (VALUES
 ('00000000-0000-0000-0000-000000000001'::uuid,'00000000-0000-0000-0000-000000000002'::uuid,'00000000-0000-0000-0000-000000000003'::uuid)
), labelled(label,draft_id) AS (
 SELECT 'D1',d1_id FROM operator_input UNION ALL SELECT 'D2',d2_id FROM operator_input
), drafts AS (
 SELECT input.*, draft.actor_user_id,draft.context_type,draft.group_id,draft.expense_id,
  draft.version,draft.created_at,draft.updated_at,
  CASE WHEN draft.context_type IN ('one_off','group') AND draft.expense_id IS NULL
    THEN public.expense_sql159_normalize_private_draft(draft.actor_user_id,draft.id,false) ELSE NULL END normalized,
  CASE WHEN draft.context_type='edit' THEN pg_catalog.md5(draft.payload::text) ELSE NULL END edit_payload_fingerprint,
  CASE WHEN draft.context_type='edit' THEN (SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
    pg_catalog.md5(member.value->>'key'),',' ORDER BY pg_catalog.md5(member.value->>'key')),''))
    FROM pg_catalog.jsonb_array_elements(COALESCE(draft.payload->'members','[]'::jsonb)) member(value)) ELSE NULL END edit_party_identity_digest
 FROM labelled input LEFT JOIN public.expense_private_drafts draft ON draft.id=input.draft_id
), parties AS (
 SELECT draft.label,COALESCE(NULLIF(pg_catalog.md5(COALESCE(pg_catalog.string_agg(
  party.value->>'identity_token_hash',',' ORDER BY party.value->>'identity_token_hash'),'')),
  pg_catalog.md5('')),draft.edit_party_identity_digest) party_identity_digest
 FROM drafts draft LEFT JOIN LATERAL pg_catalog.jsonb_array_elements(COALESCE(draft.normalized->'parties','[]'::jsonb)) party(value) ON true
 GROUP BY draft.label,draft.edit_party_identity_digest
), evidence AS (
 SELECT draft.*,parties.party_identity_digest,
  publication.draft_id IS NOT NULL publication_present,publication.is_live publication_live,publication.publication_version,
  finalization.draft_id IS NOT NULL finalization_present,finalization.expense_id finalized_expense_id,
  tombstone.draft_id IS NOT NULL tombstone_present,
  EXISTS(SELECT 1 FROM public.expense_mutation_requests request
   WHERE request.operation IN ('expense_share_private_draft_v1','expense_unshare_private_draft_v1','expense_finalize_private_draft_v1')
     AND request.result->>'draft_id'=draft.draft_id::text) request_presence
 FROM drafts draft JOIN parties USING(label)
 LEFT JOIN public.expense_unconfirmed_publications publication ON publication.draft_id=draft.draft_id
 LEFT JOIN public.expense_unconfirmed_finalizations finalization ON finalization.draft_id=draft.draft_id
 LEFT JOIN public.expense_private_draft_tombstones tombstone ON tombstone.draft_id=draft.draft_id
), d1 AS (SELECT * FROM evidence WHERE label='D1'),d2 AS (SELECT * FROM evidence WHERE label='D2'),
 e_receipt AS (SELECT finalization.* FROM operator_input input LEFT JOIN public.expense_unconfirmed_finalizations finalization ON finalization.expense_id=input.e_id)
SELECT pg_catalog.jsonb_build_object(
 'drafts',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'label',label,'live',actor_user_id IS NOT NULL,'context_type',context_type,'version',version,
  'created_at',created_at,'updated_at',updated_at,'draft_digest',pg_catalog.md5('sql159-lineage:'||draft_id::text),
  'party_identity_digest',party_identity_digest,'shareable_fingerprint',normalized->>'shareable_fingerprint',
  'allocation_fingerprint',normalized->>'allocation_fingerprint','sql159_normalization_applicable',context_type IN ('one_off','group'),
  'edit_payload_fingerprint',edit_payload_fingerprint,'publication_present',publication_present,
  'publication_live',publication_live,'publication_version',publication_version,'finalization_present',finalization_present,
  'tombstone_present',tombstone_present,'request_presence',request_presence,
  'finalized_draft_still_live',actor_user_id IS NOT NULL AND finalization_present) ORDER BY label) FROM evidence),
 'comparison',pg_catalog.jsonb_build_object(
  'same_context_type',d1.context_type IS NOT NULL AND d1.context_type=d2.context_type,
  'same_exact_group',d1.group_id IS NOT NULL AND d1.group_id=d2.group_id,
  'same_exact_edit_expense',d1.expense_id IS NOT NULL AND d1.expense_id=d2.expense_id,
  'same_exact_event_relation',d1.normalized->>'event_id' IS NOT DISTINCT FROM d2.normalized->>'event_id',
  'same_party_identities',d1.actor_user_id IS NOT NULL AND d2.actor_user_id IS NOT NULL AND d1.party_identity_digest=d2.party_identity_digest,
  'same_shareable_fingerprint',d1.normalized->>'shareable_fingerprint'=d2.normalized->>'shareable_fingerprint',
  'same_allocation_fingerprint',d1.normalized->>'allocation_fingerprint'=d2.normalized->>'allocation_fingerprint',
  'same_edit_payload_fingerprint',d1.edit_payload_fingerprint IS NOT NULL AND d1.edit_payload_fingerprint=d2.edit_payload_fingerprint),
 'confirmed_e',pg_catalog.jsonb_build_object('has_sql159_receipt',e_receipt.draft_id IS NOT NULL,
  'predates_or_other_creation_path',e_receipt.draft_id IS NULL,
  'source_draft_digest',CASE WHEN e_receipt.draft_id IS NULL THEN NULL ELSE pg_catalog.md5('sql159-lineage:'||e_receipt.draft_id::text) END,
  'd1_finalized_to_e',e_receipt.draft_id=d1.draft_id,'d2_finalized_to_e',e_receipt.draft_id=d2.draft_id),
 'canonical_lineage_receipt_count',(SELECT pg_catalog.count(*) FROM public.expense_unconfirmed_finalizations f,operator_input i WHERE f.draft_id IN(i.d1_id,i.d2_id) OR f.expense_id=i.e_id),
 'multiple_canonical_lineages_require_audit',(SELECT pg_catalog.count(DISTINCT f.expense_id)>1 FROM public.expense_unconfirmed_finalizations f,operator_input i WHERE f.draft_id IN(i.d1_id,i.d2_id) OR f.expense_id=i.e_id)
) FROM d1 CROSS JOIN d2 CROSS JOIN e_receipt;
ROLLBACK;
