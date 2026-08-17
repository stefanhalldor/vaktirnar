import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const migration = readFileSync(
  join(root, 'sql/140_event_expense_activity_and_global_settlement_labels.sql'),
  'utf8',
)
const sql139 = readFileSync(join(root, 'sql/139_expense_event_link_independence.sql'), 'utf8')
const validationRoot = join(
  root, 'sql/validation/140-event-expense-activity-and-global-settlement-labels',
)
const preflight = readFileSync(join(validationRoot, 'preflight.sql'), 'utf8')
const postflight = readFileSync(join(validationRoot, 'postflight.sql'), 'utf8')
const recovery = readFileSync(join(validationRoot, 'recovery.sql'), 'utf8')
const readme = readFileSync(join(validationRoot, 'README.md'), 'utf8')

function functionBody(name: string): string {
  const start = migration.indexOf(`CREATE FUNCTION public.${name}(`)
  const bodyStart = migration.indexOf('AS $function$', start)
  const bodyEnd = migration.indexOf('$function$;', bodyStart + 13)
  if (start < 0 || bodyStart < 0 || bodyEnd < 0) throw new Error(`missing ${name}`)
  return migration.slice(bodyStart + 13, bodyEnd).replace(/\r\n/g, '\n')
}

function sourceFunctionBody(source: string, name: string): string {
  const plain = source.indexOf(`CREATE FUNCTION public.${name}(`)
  const replaced = source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)
  const start = plain >= 0 ? plain : replaced
  const bodyStart = source.indexOf('AS $function$', start)
  const bodyEnd = source.indexOf('$function$;', bodyStart + 13)
  if (start < 0 || bodyStart < 0 || bodyEnd < 0) throw new Error(`missing ${name}`)
  return source.slice(bodyStart + 13, bodyEnd).replace(/\r\n/g, '\n')
}

function md5(value: string): string {
  return createHash('md5').update(value).digest('hex')
}

describe('SQL140 Event expense activity and settlement labels', () => {
  it('is additive and keeps every operator validator read-only', () => {
    expect(migration).toMatch(/^-- SQL140:/)
    expect(migration).toContain('BEGIN;')
    expect(migration.trimEnd()).toMatch(/COMMIT;$/)
    expect(migration).not.toMatch(/\b(?:INSERT INTO|UPDATE|DELETE FROM)\s+public\.(?:expenses|expense_payments|expense_shares|expense_obligations|expense_group_members|expense_repayments)\b/i)
    expect(migration).not.toContain('CREATE OR REPLACE FUNCTION')
    expect(migration).not.toContain('teskeid_event_expense_participant_sources')

    for (const validator of [preflight, postflight, recovery]) {
      expect(validator).toContain('BEGIN;')
      expect(validator).toContain('SET TRANSACTION READ ONLY;')
      expect(validator.trimEnd()).toMatch(/ROLLBACK;$/)
      expect(validator).not.toMatch(/^\s*(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE)\b/im)
    }
    expect(readme).toContain('Localhost checks for Stebbi')
  })

  it('pins exact function bodies, the unchanged SQL139 preview and private ACLs', () => {
    const activityHash = md5(functionBody('teskeid_event_get_expense_activity'))
    const labelsHash = md5(functionBody('teskeid_event_get_expense_context_labels'))
    const sql139PreviewHash = md5(sourceFunctionBody(sql139, 'teskeid_event_get_expense_preview'))
    expect(activityHash).toBe('18e145ca9e417df099190e27ca6e5015')
    expect(labelsHash).toBe('6dd096389519b6a218b2703190f98b11')
    for (const sql of [migration, postflight]) {
      expect(sql).toContain(activityHash)
      expect(sql).toContain(labelsHash)
      expect(sql).toContain(sql139PreviewHash)
    }
    expect(sql139PreviewHash).toBe('377b2f0520cbbf0345b6da864846e96e')
    for (const name of [
      'teskeid_event_get_expense_activity',
      'teskeid_event_get_expense_context_labels',
    ]) {
      expect(migration).toContain(`ALTER FUNCTION public.${name}`)
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION public.${name}`)
    }
    expect(migration.match(/TO service_role;/g)).toHaveLength(2)
  })

  it('authorizes owner or exact attendee and emits only the bounded attendee-safe projection', () => {
    const activity = functionBody('teskeid_event_get_expense_activity')
    expect(activity).toContain('teskeid_event_assert_actor(p_actor_id)')
    expect(activity).toContain('teskeid_event_assert_financial_actor(p_actor_id)')
    expect(activity).toContain('event_row.owner_user_id = p_actor_id')
    expect(activity).toContain('teskeid_event_attendance_memberships')
    expect(activity).toContain("guest.status = 'active'")
    expect(activity).toContain('guest.linked_user_id = membership.user_id')
    expect(activity).toContain('LIMIT 101')
    expect(activity).toContain('NOT BETWEEN 1 AND 50')
    expect(activity).toContain('<> expense.total_minor')
    expect(activity).toContain('expense_group_balances(link.group_id, false)')
    expect(activity).toContain("expense.status = 'active'")
    expect(activity).toContain('actor_member.user_id = p_actor_id')
    expect(activity).toContain('COALESCE(pg_catalog.sum(balance.amount_minor), 0)')
    expect(activity).toContain("repayment.status = 'reported'")
    for (const key of [
      "'title'", "'description'", "'total_minor'", "'currency'", "'payers'",
      "'display_name'", "'amount_minor'", "'status'", "'expenses'", "'positions'", "'state'",
    ]) expect(activity).toContain(key)
    expect(activity).not.toMatch(/payment_preference|recipient_email|national_id|account_number/i)
  })

  it('adds optional Event labels without changing global settlement authority or provenance', () => {
    const labels = functionBody('teskeid_event_get_expense_context_labels')
    expect(labels).toContain('cardinality(p_group_ids) > 100')
    expect(labels).toContain('expense_group_members')
    expect(labels).toContain('teskeid_event_attendance_memberships')
    expect(labels).toContain('event_row.owner_user_id = p_actor_id')
    expect(labels).not.toContain('teskeid_event_expense_participant_sources')
    expect(labels).not.toMatch(/recipient_email|linked_user_id'|event_guest_id'|expense_member_id'/i)
    expect(labels).toContain("'group_id'")
    expect(labels).toContain("'event_name'")
  })

  it('keeps all declared identifiers within PostgreSQL limits', () => {
    const identifiers = [...migration.matchAll(
      /\b(?:FUNCTION|CONSTRAINT|TRIGGER|INDEX|TABLE)\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi,
    )].map((match) => match[1]!)
    expect(identifiers.length).toBeGreaterThan(0)
    expect(Math.max(...identifiers.map((identifier) => Buffer.byteLength(identifier, 'utf8'))))
      .toBeLessThanOrEqual(63)
  })
})
