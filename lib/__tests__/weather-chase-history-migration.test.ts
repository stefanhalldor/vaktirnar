import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(join(process.cwd(), 'sql/93_weather_chase_metno_place_history.sql'), 'utf8')

describe('sql/93 weather chase met.no place history', () => {
  it('is transactional, idempotent and admits only canonical place target rows', () => {
    expect(sql).toMatch(/^\s*BEGIN\s*;/m)
    expect(sql).toMatch(/^\s*COMMIT\s*;/m)
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS metno_point_forecasts_history_target_type_check')
    expect(sql).toContain("'road_map_place'")
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS metno_point_forecasts_history_place_time_idx')
  })

  it('keeps the table service-role-only with RLS enabled and documents recovery', () => {
    expect(sql).toMatch(/REVOKE ALL ON public\.metno_point_forecasts_history FROM PUBLIC, anon, authenticated/)
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON public\.metno_point_forecasts_history TO service_role/)
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('Recovery:')
    expect(sql).toContain('no user data')
  })
})
