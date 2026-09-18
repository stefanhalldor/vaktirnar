import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8').replace(/\r\n/g, '\n')
const sql = read('sql/194_receipt_split_ai_availability.sql')
const preflight = read('sql/validation/194-receipt-split-ai-availability/preflight.sql')
const postflight = read('sql/validation/194-receipt-split-ai-availability/postflight.sql')
const body = sql.match(/AS \$fn\$([\s\S]*?)\$fn\$;/)![1]

describe('SQL194 advisory availability', () => {
  it('only reads quota data and never reserves, locks or changes rows', () => {
    expect(body).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|LOCK|reserve_ai|finish_ai)\b/i)
    expect(sql).toContain("STABLE SECURITY DEFINER SET search_path = ''")
    expect(body).toContain('PERFORM receipt_split.assert_actor(p_actor_id)')
    expect(body).toContain("AT TIME ZONE 'Atlantic/Reykjavik'")
  })
  it('matches the reservation ordering and exemption/burst windows', () => {
    const states = [...body.matchAll(/RETURN to_jsonb\('([^']+)'/g)].map(match => match[1])
    expect(states).toEqual(['capacity', 'daily', 'burst', 'burst', 'available'])
    expect(body).toContain('NOT v_exempt')
    expect(body).toContain("finished_at IS NULL AND reserved_at > v_now - interval '2 minutes'")
    expect(body).toContain("reserved_at > v_now - interval '1 minute'")
    for (const name of ['user_daily', 'global_daily', 'exempt_minute']) expect(body).toContain(`p_${name}_limit IS NULL`)
  })
  it('exposes only a bounded status and grants only the service-role boundary', () => {
    expect(sql).toContain('FROM PUBLIC, anon, authenticated;')
    expect(sql).toContain('TO service_role;')
    expect(body).not.toMatch(/jsonb_build_object|jsonb_agg/i)
    expect(sql).not.toMatch(/CREATE OR REPLACE|ALTER TABLE|CREATE POLICY/i)
  })
  it('seals the exact normalized function body in read-only postflight', () => {
    expect(postflight).toContain(createHash('md5').update(body).digest('hex'))
    expect(preflight).toContain('BEGIN TRANSACTION READ ONLY;')
    expect(postflight).toContain('BEGIN TRANSACTION READ ONLY;')
    expect(postflight).toContain('SQL194_INVALID_ACTOR_ACCEPTED')
    expect(postflight).toContain('SQL194_INVALID_LIMIT_ACCEPTED')
    expect(postflight).toContain('SQL194_POSTFLIGHT_DRIFT')
  })
  it('removes misleading photo-quality advice from quota messages in both locales', () => {
    for (const locale of ['is', 'en']) {
      const messages = JSON.parse(read(`messages/${locale}.json`)).teskeid.receiptSplit
      expect(messages.quotaRecovery).not.toMatch(/betri birtu|better light|could not be read|Ekki tókst að lesa/)
      expect(messages.quotaRecovery).toMatch(/morgun|tomorrow/)
      expect(messages.quotaUnavailable).toBeTruthy()
    }
  })
})
