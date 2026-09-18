import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n')

describe('SQL193 receipt split currency-code hotfix', () => {
  const migration = read('sql/193_receipt_split_currency_code_hotfix.sql')
  const preflight = read('sql/validation/193-receipt-split-currency-code-hotfix/preflight.sql')
  const postflight = read('sql/validation/193-receipt-split-currency-code-hotfix/postflight.sql')

  it('changes the v2 validator and persistence boundary together', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION receipt_split.validate_v2(p jsonb)')
    expect(migration).toContain("p->>'currency' !~ '^[A-Z]{3}$'")
    expect(migration).not.toContain("p->>'currency' NOT IN ('ISK','EUR','USD','GBP','DKK','NOK','SEK')")
    expect(migration).toContain('SQL193_BASELINE_DRIFT')
    expect(migration).toContain('BEGIN;')
    expect(migration).toContain('COMMIT;')
    expect(migration).toContain('ADD CONSTRAINT splits_currency_check CHECK')
    expect(migration).toContain("contract_version = 1 AND currency IN ('ISK','EUR','USD','GBP','DKK','NOK','SEK')")
    expect(migration).toContain("contract_version = 2 AND currency ~ '^[A-Z]{3}$'")
    expect(migration).not.toContain('COMMENT ON SCHEMA')
  })

  it('preserves the exact predecessor body except the currency validation', () => {
    const predecessor = read('sql/184_receipt_split_v2.sql')
      .split('CREATE FUNCTION receipt_split.validate_v2(p jsonb)')[1].split('AS $fn$')[1].split('$fn$;')[0]
    const body = migration.split('AS $fn$')[1].split('$fn$;')[0]
    expect(createHash('md5').update(predecessor).digest('hex')).toBe('3de8d61d7b8d873e5916bed3e0d68f20')
    expect(body).toBe(predecessor.replace(
      "    OR p->>'currency' NOT IN ('ISK','EUR','USD','GBP','DKK','NOK','SEK')",
      () => "    OR jsonb_typeof(p->'currency') <> 'string'\n    OR p->>'currency' !~ '^[A-Z]{3}$'",
    ))
    expect(createHash('md5').update(body).digest('hex')).toBe('185c251e2c2f56f9f0e32b9afccc2d11')
    expect(postflight).toContain('185c251e2c2f56f9f0e32b9afccc2d11')
  })

  it('ships read-only baseline and installed-state checks with a PLN contract probe', () => {
    expect(preflight).toContain("THEN 'PASS' ELSE 'FAIL' END AS gate")
    expect(preflight).toContain("NOT has_function_privilege('anon',oid,'EXECUTE')")
    expect(preflight).toContain("NOT has_function_privilege('authenticated',oid,'EXECUTE')")
    expect(preflight).toContain("NOT has_function_privilege('service_role',oid,'EXECUTE')")
    expect(preflight).toContain('predecessor_constraint_ok')
    expect(postflight).toContain("'currency','PLN'")
    expect(postflight).toContain('generate_series(1,21)')
    expect(postflight).toContain('AS pln_contract_ok')
    expect(postflight).toContain("SELECT 'PASS' AS gate")
    expect(postflight).toContain('BEGIN TRANSACTION READ ONLY;')
    expect(postflight).toContain('SQL193_POSTFLIGHT_DRIFT')
  })
})
