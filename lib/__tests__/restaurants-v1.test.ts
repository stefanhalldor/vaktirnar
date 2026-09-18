import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { menuSubmitSchema, publicMenuSchema } from '@/lib/restaurants/contracts'

const root = process.cwd()
const migration = readFileSync(join(root, 'sql/192_restaurant_menu_split_v1.sql'), 'utf8')
const middleware = readFileSync(join(root, 'middleware.ts'), 'utf8')
const guard = readFileSync(join(root, 'lib/loans/guard.ts'), 'utf8')

describe('restaurant menu v1 contracts', () => {
  it('accepts only the allowlisted public projection', () => {
    const menu = publicMenuSchema.parse({
      venue: { id: crypto.randomUUID(), slug: 'prufa', name: 'Prufa', timezone: 'Atlantic/Reykjavik' },
      menu: { id: crypto.randomUUID(), version: 1, title: 'Matseðill', currency: 'ISK' },
      items: [{ id: crypto.randomUUID(), name: 'Súpa', description: '', priceMinor: 1900, available: true, modifiers: [] }],
    })
    expect(menu).not.toHaveProperty('split')
    expect(() => publicMenuSchema.parse({ ...menu, participant: 'leak' })).toThrow()
  })

  it('requires exact split and idempotency identifiers on submit', () => {
    expect(menuSubmitSchema.safeParse({}).success).toBe(false)
    expect(menuSubmitSchema.safeParse({ requestId: crypto.randomUUID(), tableSessionId: crypto.randomUUID(),
      splitId: crypto.randomUUID(), expectedSplitVersion: 1, menuItemId: crypto.randomUUID(),
      quantity: 1, modifiers: [], serviceNote: '' }).success).toBe(true)
  })
})

describe('restaurant SQL192 security and retry boundary', () => {
  it('keeps all restaurant tables behind forced RLS and service functions', () => {
    expect(migration).toContain('FORCE ROW LEVEL SECURITY')
    expect(migration).toContain('FROM PUBLIC,anon,authenticated,service_role')
    expect(migration).not.toMatch(/GRANT\s+(SELECT|INSERT|UPDATE|DELETE)\s+ON\s+public\.restaurant_/i)
  })

  it('checks guest feature access and exact active membership', () => {
    expect(migration).toContain("f.feature_key='veitingastadir_gestir'")
    expect(migration).toContain("user_id=p_actor_id AND status='active'")
  })

  it('records immutable creator provenance and wrapper idempotency', () => {
    expect(migration).toContain('receipt_split_item_provenance_immutable')
    expect(migration).toContain('CREATE TABLE public.restaurant_requests')
    expect(migration).toContain("request_row.command<>'submit_menu_item:v1'")
    expect(migration).toContain("'modifiers',p_modifiers")
  })

  it('blocks cancellation after restaurant processing or another claim', () => {
    expect(migration).toContain("status<>''nytt''")
    expect(migration).toContain('member_token<>m.token')
  })

  it('keeps participant edits and cancellation bound to immutable creator provenance', () => {
    expect(migration).toContain("i.source_kind<>'legacy' AND (i.created_by_user_id<>p_actor_id OR i.created_by_member_token<>m.token)")
    expect(migration).toContain("IF i.source_kind='restaurant_menu' THEN RAISE EXCEPTION 'split_not_allowed'")
  })
})

describe('restaurant private beta gates', () => {
  it('defines independent owner, staff and guest flags', () => {
    for (const key of ['veitingastadir', 'veitingastadir_starfsfolk', 'veitingastadir_gestir']) {
      expect(guard).toContain(`'${key}'`)
    }
  })

  it('keeps public menu global-only and mutation paths private', () => {
    expect(middleware).toContain('^/matseðill/${RESTAURANT_SLUG_SEGMENT}$')
    expect(middleware).toContain('^/api/restaurants/public/${RESTAURANT_SLUG_SEGMENT}$')
    expect(middleware).toContain("pathname.startsWith('/api/restaurants/guest/')")
  })
})
