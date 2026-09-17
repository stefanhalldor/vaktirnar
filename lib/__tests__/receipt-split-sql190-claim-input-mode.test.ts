import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('SQL190 claim input-mode contract', () => {
  const sql = fs.readFileSync(path.join(process.cwd(), 'sql/190_receipt_split_claim_input_mode.sql'), 'utf8')
  it('persists a constrained mode through the service-only v2 claim path', () => {
    expect(sql).toContain("CHECK(input_mode IN ('quantity','percent','fraction'))")
    expect(sql).toContain("WHEN 'claim' THEN ARRAY['itemId','itemRevision','previousUnits','quantityUnits','inputMode']")
    expect(sql).toContain("input_mode := p_payload->>''inputMode''")
    expect(sql).toContain('input_mode=EXCLUDED.input_mode')
    expect(sql).toContain("''inputMode'',c.input_mode")
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.receipt_split_command_v2(uuid,text,uuid,uuid,jsonb) TO service_role')
    expect(sql).not.toMatch(/CREATE POLICY/i)
  })
})
