import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('SQL189 shared exchange contract', () => {
  const sql = fs.readFileSync(path.join(process.cwd(), 'sql/189_receipt_split_shared_exchange.sql'), 'utf8')
  it('keeps the mutation service-only, member-bound, versioned and idempotent', () => {
    expect(sql).toContain('PERFORM receipt_split.assert_actor(p_actor_id)')
    expect(sql).toContain('receipt_split.members WHERE split_id=s.id AND user_id=p_actor_id')
    expect(sql).toContain('s.version<>p_version')
    expect(sql).toContain("r.command<>'exchange:v1'")
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.receipt_split_set_exchange_v1(uuid,uuid,uuid,bigint,text,text) TO service_role')
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.receipt_split_set_exchange_v1(uuid,uuid,uuid,bigint,text,text) FROM PUBLIC,anon,authenticated,service_role')
    expect(sql).not.toMatch(/CREATE POLICY/i)
  })
})
