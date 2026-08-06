import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const paymentSql = readFileSync(join(process.cwd(), 'sql/107_expense_encrypted_payment_profile.sql'), 'utf8')
const relationshipSql = readFileSync(join(process.cwd(), 'sql/108_relationship_labels_circles_expense_context.sql'), 'utf8')
const invitationRepository = readFileSync(join(process.cwd(), 'lib/relationships/repository-v2.server.ts'), 'utf8')

describe('SQL107 encrypted payment storage', () => {
  it('keeps the crypto module out of every client component import graph', () => {
    const files = ['app', 'components', 'lib'].flatMap((root) => readdirSync(join(process.cwd(), root), { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name))
      .map((entry) => join(entry.parentPath, entry.name)))
    const violating = files.filter((file) => {
      const source = readFileSync(file, 'utf8')
      return /^['\"]use client['\"]/m.test(source) && source.includes('payment-crypto.server')
    })
    expect(violating).toEqual([])
  })

  it('is additive, transaction wrapped and browser-default-deny', () => {
    expect(paymentSql.match(/^BEGIN;$/gm)).toHaveLength(1)
    expect(paymentSql.match(/^COMMIT;$/gm)).toHaveLength(1)
    expect(paymentSql).toContain('CREATE TABLE IF NOT EXISTS public.expense_payment_profiles_v2')
    expect(paymentSql).toContain('ALTER TABLE public.expense_payment_profiles_v2 FORCE ROW LEVEL SECURITY')
    expect(paymentSql).toMatch(/REVOKE ALL ON public\.expense_payment_profiles_v2 FROM PUBLIC, anon, authenticated, service_role/)
    expect(paymentSql).not.toMatch(/GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)[\s\S]{0,80}expense_payment_profiles_v2/i)
  })

  it('copies envelopes without SQL decryption and resolves only an exact debt context', () => {
    expect(paymentSql).toContain('NEW.payment_profile_encrypted_snapshot := jsonb_build_object')
    expect(paymentSql).toContain('NEW.payment_preference_snapshot := NULL')
    expect(paymentSql).toContain('v_from_user_id IS DISTINCT FROM p_actor_id')
    expect(paymentSql).not.toMatch(/pgp_sym_decrypt|decrypt\s*\(/i)
  })

  it('scrubs encrypted snapshots only when the owning auth account is deleted', () => {
    expect(paymentSql).toContain('expense_scrub_v2_snapshots_after_account_delete')
    expect(paymentSql).toContain('IF NOT EXISTS (SELECT 1 FROM auth.users AS account WHERE account.id = OLD.owner_user_id)')
    expect(paymentSql).toContain('SET payment_profile_encrypted_snapshot = NULL')
  })
})

describe('SQL108 private labels and relationship circles', () => {
  it('keeps private labels owner-scoped and avoids N² relationship backfill', () => {
    expect(relationshipSql).toContain('CONSTRAINT relationship_label_owner_name_unique UNIQUE (owner_id, normalized_name)')
    expect(relationshipSql).toContain("WHERE tag.tag IN ('family', 'friends', 'recipients')")
    expect(relationshipSql).not.toMatch(/INSERT INTO public\.relationships[\s\S]{0,200}relationship_circle_members/i)
  })

  it('has consent-bound invitation and durable lifecycle operations', () => {
    expect(relationshipSql).toContain("status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired')")
    for (const name of ['relationship_remove_circle_member', 'relationship_leave_circle', 'relationship_transfer_circle_ownership', 'relationship_archive_circle']) {
      expect(relationshipSql).toContain(`CREATE OR REPLACE FUNCTION public.${name}`)
    }
  })

  it('authorizes the exact invitee before projecting the full active roster', () => {
    const authCheck = invitationRepository.indexOf('invitation.invitee_user_id !== actorUserId')
    const rosterProjection = invitationRepository.indexOf('circleProjection(actorUserId, circleData as CircleRow, true)')
    expect(authCheck).toBeGreaterThan(0)
    expect(rosterProjection).toBeGreaterThan(authCheck)
    expect(invitationRepository).not.toMatch(/relationship_label_(?:definitions|assignments)[\s\S]{0,300}allowInvitedViewer/)
  })

  it('snapshots circle context without using it as ledger authority', () => {
    expect(relationshipSql).toContain('public.expense_create_expense_with_known_members(')
    expect(relationshipSql).toContain('INSERT INTO public.relationship_circle_expense_contexts')
    expect(relationshipSql).toContain("member.status = 'active'")
  })
})
