import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('SQL191 exact fraction notation contract', () => {
  const sql = fs.readFileSync(path.join(process.cwd(), 'sql/191_receipt_split_fraction_notation.sql'), 'utf8')
  it('preserves an unreduced fraction while verifying it matches canonical units', () => {
    expect(sql).toContain("ARRAY['itemId','itemRevision','previousUnits','quantityUnits','inputMode','fractionNumerator','fractionDenominator']")
    expect(sql).toContain('i.quantity_units*fraction_numerator + fraction_denominator/2')
    expect(sql).toContain('fraction_numerator=EXCLUDED.fraction_numerator')
    expect(sql).toContain("''fractionNumerator'',c.fraction_numerator,''fractionDenominator'',c.fraction_denominator")
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.receipt_split_command_v2(uuid,text,uuid,uuid,jsonb) TO service_role')
    expect(sql).not.toMatch(/CREATE POLICY/i)
  })
})
