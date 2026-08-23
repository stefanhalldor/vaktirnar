import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const sql132 = readFileSync(
  join(root, 'sql/132_independent_events_and_tagged_expenses.sql'),
  'utf8',
)
const sql133 = readFileSync(
  join(root, 'sql/133_event_guest_identity_linking.sql'),
  'utf8',
)
const sql137 = readFileSync(
  join(root, 'sql/137_event_organizer_expense_projection_and_backlink.sql'),
  'utf8',
)
const repository = readFileSync(
  join(root, 'lib/events/repository.server.ts'),
  'utf8',
)

function functionBody(source: string, name: string) {
  const signatureIndex = source.search(
    new RegExp(`CREATE(?: OR REPLACE)? FUNCTION public\\.${name}\\(`),
  )
  expect(signatureIndex, name).toBeGreaterThanOrEqual(0)
  const sourceAfterSignature = source.slice(signatureIndex)
  const delimiterMatch = /\bAS\s+(\$[a-z0-9_]*\$)\r?\n/i.exec(sourceAfterSignature)
  expect(delimiterMatch, `${name} delimiter`).not.toBeNull()
  const delimiter = delimiterMatch![1]
  const bodyStart = signatureIndex + delimiterMatch!.index + delimiterMatch![0].length
  const bodyEnd = source.indexOf(`${delimiter};`, bodyStart)
  expect(bodyEnd, `${name} end`).toBeGreaterThan(bodyStart)
  return source.slice(bodyStart, bodyEnd)
}

describe('current Event person-source boundaries', () => {
  it('keeps the deployed Expense source behind the combined financial actor guard', () => {
    const listBody = functionBody(sql132, 'teskeid_event_list_expense_sources')
    const exactBody = functionBody(sql137, 'teskeid_event_get_expense_source')

    expect(listBody).toContain('PERFORM public.teskeid_event_assert_financial_actor(p_actor_id);')
    expect(exactBody).toContain('PERFORM public.teskeid_event_assert_financial_actor(p_actor_id);')
    expect(repository).toContain(".rpc('teskeid_event_list_expense_sources'")
    expect(repository).toContain('export async function listEventExpenseSources')
  })

  it('documents the current dashboard as bucketed, bounded and mutation-bearing rather than a picker ABI', () => {
    const body = functionBody(sql133, 'teskeid_event_list_for_actor')

    expect(body).toContain('PERFORM public.teskeid_event_attendance_sweep_expired(50, NULL);')
    expect(body).toContain("'owned'")
    expect(body).toContain("'pending'")
    expect(body).toContain("'attending'")
    expect(body.match(/LIMIT 100/g)).toHaveLength(3)
    expect(body).not.toContain('p_before_sort_at')
    expect(body).not.toContain('p_before_event_id')
  })

  it('requires an accepted membership with the exact active linked self guest for attendee visibility', () => {
    const body = functionBody(sql133, 'teskeid_event_list_for_actor')
    const attendingStart = body.indexOf("'attending'")
    expect(attendingStart).toBeGreaterThanOrEqual(0)
    const attending = body.slice(attendingStart)

    expect(attending).toContain('FROM public.teskeid_event_attendance_memberships AS candidate')
    expect(attending).toContain("candidate_guest.status = 'active'")
    expect(attending).toContain('candidate_guest.linked_user_id = candidate.user_id')
    expect(attending).toContain('candidate.user_id = p_actor_id')
    expect(attending).toContain('candidate_event.owner_user_id <> p_actor_id')
    expect(attending).not.toContain("candidate.status = 'pending'")
  })

  it('keeps pending invitation visibility out of the accepted attendee bucket', () => {
    const body = functionBody(sql133, 'teskeid_event_list_for_actor')
    const pendingStart = body.indexOf("'pending'")
    const attendingStart = body.indexOf("'attending'")
    expect(pendingStart).toBeGreaterThanOrEqual(0)
    expect(attendingStart).toBeGreaterThan(pendingStart)
    const pending = body.slice(pendingStart, attendingStart)

    expect(pending).toContain('FROM public.teskeid_event_guest_invitations AS candidate')
    expect(pending).toContain("candidate.status = 'pending'")
    expect(pending).toContain('candidate.expires_at > pg_catalog.now()')
    expect(pending).toContain('candidate.recipient_email_canonical = v_actor_email')
  })

  it('returns only safe linked or manual-name labels from the attendee helper', () => {
    const body = functionBody(sql133, 'teskeid_event_attendance_safe_guest_label')

    expect(body).toContain('IF p_linked_user_id IS NOT NULL THEN')
    expect(body).toContain("IF p_source_kind = 'manual_name'")
    expect(body).toContain("pg_catalog.strpos(p_display_name_snapshot, '@') = 0")
    expect(body).not.toContain("p_source_kind = 'manual_email'")
    expect(body.trimEnd()).toMatch(/RETURN NULL;\r?\nEND;$/)
  })

  it('documents the owner-private raw snapshot in the current financial source while attendees use safe labels', () => {
    const body = functionBody(sql137, 'teskeid_event_get_expense_source')

    expect(body).toContain('CASE WHEN v_is_owner THEN guest.display_name_snapshot')
    expect(body).toContain('public.teskeid_event_attendance_safe_guest_label(')
    expect(body).toContain("ELSE 'manual_name' END AS source_kind")
    expect(body).toContain("'viewer_role', CASE WHEN v_is_owner THEN 'owner' ELSE 'attendee' END")
  })
})
