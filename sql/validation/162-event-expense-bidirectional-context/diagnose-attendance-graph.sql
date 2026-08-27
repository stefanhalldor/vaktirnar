-- SQL162 attendance-graph diagnostic. 100% read-only and privacy-safe.
BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL search_path = '';
SET LOCAL timezone = 'UTC';

WITH old_graph AS MATERIALIZED (
  SELECT membership.event_id, membership.user_id,
    membership.event_guest_id
  FROM public.teskeid_event_attendance_memberships AS membership
  JOIN public.teskeid_events AS event_row
    ON event_row.id = membership.event_id
   AND event_row.owner_user_id <> membership.user_id
  JOIN public.teskeid_event_guests AS guest
    ON guest.event_id = membership.event_id
   AND guest.id = membership.event_guest_id
   AND guest.status = 'active'
   AND guest.linked_user_id = membership.user_id
), current_candidates AS MATERIALIZED (
  SELECT participation.event_id,
    participation.recipient_user_id AS user_id,
    participation.event_guest_id,
    participation.identity_generation,
    participation.identity_version,
    participation.access_state,
    participation.access_version,
    participation.rsvp_version,
    event_row.owner_user_id,
    guest.status AS guest_status,
    guest.linked_user_id,
    decision.identity_generation AS decision_identity_generation,
    decision.decision_version,
    decision.effective_state
  FROM public.teskeid_event_participations AS participation
  JOIN public.teskeid_events AS event_row
    ON event_row.id = participation.event_id
  LEFT JOIN public.teskeid_event_guests AS guest
    ON guest.event_id = participation.event_id
   AND guest.id = participation.event_guest_id
  LEFT JOIN public.teskeid_event_participation_rsvp_v3 AS decision
    ON decision.event_id = participation.event_id
   AND decision.event_guest_id = participation.event_guest_id
  WHERE participation.recipient_user_id IS NOT NULL
), current_graph AS MATERIALIZED (
  SELECT *
  FROM current_candidates
  WHERE access_state = 'active'
    AND user_id IS DISTINCT FROM owner_user_id
    AND guest_status = 'active'
    AND decision_identity_generation = identity_generation
    AND decision_version = rsvp_version
), current_only AS MATERIALIZED (
  SELECT current_row.*,
    EXISTS (
      SELECT 1
      FROM public.teskeid_event_attendance_memberships AS membership
      WHERE membership.event_id = current_row.event_id
        AND membership.event_guest_id = current_row.event_guest_id
        AND membership.user_id = current_row.user_id
    ) AS exact_legacy_membership_exists,
    EXISTS (
      SELECT 1
      FROM public.teskeid_event_attendance_memberships AS membership
      WHERE membership.event_id = current_row.event_id
        AND membership.event_guest_id = current_row.event_guest_id
    ) AS legacy_guest_membership_exists,
    EXISTS (
      SELECT 1
      FROM public.teskeid_event_attendance_memberships AS membership
      WHERE membership.event_id = current_row.event_id
        AND membership.user_id = current_row.user_id
    ) AS legacy_user_membership_exists,
    pg_catalog.md5(
      current_row.event_id::text || '|' || current_row.user_id::text || '|' ||
        current_row.event_guest_id::text
    ) AS tuple_digest
  FROM current_graph AS current_row
  WHERE NOT EXISTS (
    SELECT 1 FROM old_graph AS old_row
    WHERE old_row.event_id = current_row.event_id
      AND old_row.user_id = current_row.user_id
      AND old_row.event_guest_id = current_row.event_guest_id
  )
), classified AS MATERIALIZED (
  SELECT current_only.*,
    CASE
      WHEN legacy_guest_membership_exists
        THEN 'legacy_guest_user_mismatch'
      WHEN legacy_user_membership_exists
        THEN 'legacy_user_guest_mismatch'
      WHEN NOT legacy_guest_membership_exists
       AND NOT legacy_user_membership_exists
        THEN 'legacy_membership_absent'
      ELSE 'other_legacy_shape'
    END AS reason
  FROM current_only
), category_names(reason) AS (VALUES
  ('legacy_guest_user_mismatch'),
  ('legacy_user_guest_mismatch'),
  ('legacy_membership_absent'),
  ('other_legacy_shape')
), category_evidence AS MATERIALIZED (
  SELECT category_names.reason,
    pg_catalog.count(classified.tuple_digest)::integer AS tuple_count,
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(
      classified.tuple_digest, E'\n'
      ORDER BY classified.tuple_digest COLLATE pg_catalog."C"
    ), '')) AS tuple_digest
  FROM category_names
  LEFT JOIN classified USING (reason)
  GROUP BY category_names.reason
), duplicate_exact_identity AS MATERIALIZED (
  SELECT event_id, user_id, event_guest_id
  FROM current_graph
  GROUP BY event_id, user_id, event_guest_id
  HAVING pg_catalog.count(*) > 1
), duplicate_active_event_user AS MATERIALIZED (
  SELECT event_id, user_id
  FROM current_graph
  GROUP BY event_id, user_id
  HAVING pg_catalog.count(*) > 1
), malformed_current AS MATERIALIZED (
  SELECT participation.event_id, participation.recipient_user_id,
    participation.event_guest_id
  FROM public.teskeid_event_participations AS participation
  JOIN public.teskeid_events AS event_row
    ON event_row.id = participation.event_id
   AND event_row.owner_user_id <> participation.recipient_user_id
  WHERE participation.recipient_user_id IS NOT NULL
    AND participation.access_state = 'active'
    AND (
      NOT EXISTS (
        SELECT 1 FROM public.teskeid_event_guests AS guest
        WHERE guest.event_id = participation.event_id
          AND guest.id = participation.event_guest_id
          AND guest.status = 'active'
      )
      OR NOT EXISTS (
        SELECT 1
        FROM public.teskeid_event_participation_rsvp_v3 AS decision
        WHERE decision.event_id = participation.event_id
          AND decision.event_guest_id = participation.event_guest_id
          AND decision.identity_generation = participation.identity_generation
          AND decision.decision_version = participation.rsvp_version
      )
    )
), evidence AS MATERIALIZED (
  SELECT
    (SELECT pg_catalog.count(*) FROM old_graph)::integer AS old_graph_count,
    (SELECT pg_catalog.count(*) FROM current_graph)::integer
      AS current_graph_count,
    (SELECT pg_catalog.count(*) FROM (
      SELECT * FROM old_graph
      EXCEPT
      SELECT event_id, user_id, event_guest_id FROM current_graph
    ) AS old_only)::integer AS old_minus_current_count,
    (SELECT pg_catalog.count(*) FROM current_only)::integer
      AS current_minus_old_count,
    (SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
      tuple_digest, E'\n' ORDER BY tuple_digest COLLATE pg_catalog."C"
    ), '')) FROM current_only) AS current_minus_old_digest,
    (SELECT pg_catalog.jsonb_object_agg(
      reason,
      pg_catalog.jsonb_build_object(
        'count', tuple_count,
        'digest', tuple_digest
      ) ORDER BY reason COLLATE pg_catalog."C"
    ) FROM category_evidence) AS classification_evidence,
    (SELECT pg_catalog.count(*) FROM current_candidates
      WHERE user_id = owner_user_id
        AND access_state = 'active'
        AND guest_status = 'active'
        AND decision_identity_generation = identity_generation
        AND decision_version = rsvp_version)::integer
      AS owner_participation_context_count,
    (SELECT pg_catalog.count(*) FROM classified)::integer
      AS non_owner_current_only_count,
    (SELECT pg_catalog.count(*) FROM current_only
      WHERE NOT exact_legacy_membership_exists
        AND NOT legacy_guest_membership_exists
        AND NOT legacy_user_membership_exists)::integer
      AS legacy_membership_absent_count,
    (SELECT pg_catalog.count(*) FROM current_only
      WHERE legacy_guest_membership_exists
        AND NOT exact_legacy_membership_exists)::integer
      AS legacy_guest_user_mismatch_count,
    (SELECT pg_catalog.count(*) FROM current_only
      WHERE legacy_user_membership_exists
        AND NOT exact_legacy_membership_exists)::integer
      AS legacy_user_guest_mismatch_count,
    (SELECT pg_catalog.count(*) FROM current_only
      WHERE linked_user_id = user_id)::integer AS guest_link_matches_count,
    (SELECT pg_catalog.count(*) FROM current_only
      WHERE linked_user_id IS DISTINCT FROM user_id)::integer
      AS guest_link_mismatch_count,
    (SELECT pg_catalog.count(*) FROM current_only
      WHERE access_state = 'active')::integer AS active_access_count,
    (SELECT pg_catalog.count(*) FROM current_only
      WHERE guest_status = 'active')::integer AS active_guest_count,
    (SELECT pg_catalog.count(*) FROM current_only
      WHERE decision_identity_generation = identity_generation)::integer
      AS matching_rsvp_generation_count,
    (SELECT pg_catalog.count(*) FROM current_only
      WHERE decision_version = rsvp_version)::integer
      AS matching_rsvp_version_count,
    (SELECT pg_catalog.jsonb_build_object(
      'no_response', pg_catalog.count(*) FILTER (
        WHERE effective_state = 'no_response'
      ),
      'considering', pg_catalog.count(*) FILTER (
        WHERE effective_state = 'considering'
      ),
      'attending', pg_catalog.count(*) FILTER (
        WHERE effective_state = 'attending'
      ),
      'not_attending', pg_catalog.count(*) FILTER (
        WHERE effective_state = 'not_attending'
      )
    ) FROM current_only) AS current_only_rsvp_state_counts,
    (SELECT pg_catalog.count(*) FROM current_only
      WHERE identity_generation > 1)::integer AS later_generation_count,
    (SELECT pg_catalog.count(*) FROM duplicate_exact_identity)::integer
      AS duplicate_exact_identity_count,
    (SELECT pg_catalog.count(*) FROM duplicate_active_event_user)::integer
      AS duplicate_active_event_user_count,
    (SELECT pg_catalog.count(*) FROM malformed_current)::integer
      AS malformed_current_count
)
SELECT current_user = 'postgres' AND session_user = 'postgres' AS executor_ok,
  evidence.*,
  evidence.old_minus_current_count = 0 AS legacy_subset_current,
  evidence.malformed_current_count = 0
    AND evidence.duplicate_exact_identity_count = 0
    AND evidence.duplicate_active_event_user_count = 0
      AS current_graph_integrity_exact,
  evidence.old_minus_current_count = 0
    AND evidence.malformed_current_count = 0
    AND evidence.duplicate_exact_identity_count = 0
    AND evidence.duplicate_active_event_user_count = 0
      AS attendance_authority_compatible,
  NOT EXISTS (
    SELECT 1 FROM current_graph
    WHERE user_id = owner_user_id
  ) AS owner_branch_classified_separately,
  evidence.active_access_count = evidence.current_minus_old_count
    AND evidence.active_guest_count = evidence.current_minus_old_count
    AND evidence.matching_rsvp_generation_count =
      evidence.current_minus_old_count
    AND evidence.matching_rsvp_version_count =
      evidence.current_minus_old_count
      AS all_current_only_match_current_contract,
  (
    SELECT pg_catalog.sum(tuple_count)::integer
    FROM category_evidence
  ) = evidence.current_minus_old_count AS classification_complete
FROM evidence;

COMMIT;
