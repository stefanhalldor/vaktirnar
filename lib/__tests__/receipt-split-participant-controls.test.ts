import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { parseProportionUnits, proportionInput } from '@/lib/receipt-split/quantity-v2'

describe('receipt split participant controls', () => {
  it('accepts percentages and fractions and exposes normalized rounding', () => {
    expect(parseProportionUnits('10%', 3000)).toBe(300)
    expect(parseProportionUnits('1/10', 3000)).toBe(300)
    expect(parseProportionUnits('1/7', 3000)).toBe(429)
    expect(proportionInput(429, 3000)).toBe('14.3%')
    expect(parseProportionUnits('101%', 3000)).toBeNull()
    expect(parseProportionUnits('1/0', 3000)).toBeNull()
  })
  it('keeps SQL186 private, actor-bound and idempotent', () => {
    const sql = fs.readFileSync(path.join(process.cwd(), 'sql/186_receipt_split_participant_controls.sql'), 'utf8')
    expect(sql).toContain('ALTER TABLE receipt_split.item_dismissals FORCE ROW LEVEL SECURITY')
    expect(sql).toContain('PERFORM receipt_split.assert_actor(p_actor_id)')
    expect(sql).toContain("r.command<>'dismiss:v1'")
    expect(sql).toContain("s.invite_token=p_token AND s.state='sharing' AND s.invite_expires_at>now()")
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.receipt_split_invite_preview_v1(text) TO service_role")
    expect(sql).not.toMatch(/CREATE POLICY/i)
  })
})
