/**
 * Static checks for sql/69_weather_saved_places.sql
 *
 * Verifies security properties of the migration without running SQL.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const sql = readFileSync(
  join(process.cwd(), 'sql/69_weather_saved_places.sql'),
  'utf8'
)

describe('sql/69_weather_saved_places.sql — static checks', () => {
  it('creates the weather_saved_places table', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.weather_saved_places/)
  })

  it('enables RLS on the table', () => {
    expect(sql).toMatch(/ALTER TABLE public\.weather_saved_places ENABLE ROW LEVEL SECURITY/)
  })

  it('revokes access from anon and authenticated at table level', () => {
    expect(sql).toMatch(/REVOKE ALL ON public\.weather_saved_places FROM PUBLIC, anon, authenticated/)
  })

  it('grants narrow access to authenticated and service_role', () => {
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON public\.weather_saved_places TO authenticated/)
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON public\.weather_saved_places TO service_role/)
  })

  it('has RLS select policy using auth.uid()', () => {
    expect(sql).toMatch(/weather_saved_places_select_own/)
    expect(sql).toMatch(/FOR SELECT TO authenticated/)
    expect(sql).toMatch(/USING \(user_id = auth\.uid\(\)\)/)
  })

  it('has RLS insert policy using auth.uid()', () => {
    expect(sql).toMatch(/weather_saved_places_insert_own/)
    expect(sql).toMatch(/FOR INSERT TO authenticated/)
    expect(sql).toMatch(/WITH CHECK \(user_id = auth\.uid\(\)\)/)
  })

  it('has RLS update policy with USING and WITH CHECK using auth.uid()', () => {
    const updateStart = sql.indexOf('weather_saved_places_update_own')
    const deleteStart = sql.indexOf('weather_saved_places_delete_own')
    const updateBlock = sql.slice(updateStart, deleteStart)
    expect(updateBlock).toMatch(/FOR UPDATE TO authenticated/)
    expect(updateBlock).toMatch(/USING \(user_id = auth\.uid\(\)\)/)
    expect(updateBlock).toMatch(/WITH CHECK \(user_id = auth\.uid\(\)\)/)
  })

  it('has RLS delete policy with USING using auth.uid()', () => {
    const deleteStart = sql.indexOf('weather_saved_places_delete_own')
    const deleteBlock = sql.slice(deleteStart)
    expect(deleteBlock).toMatch(/FOR DELETE TO authenticated/)
    expect(deleteBlock).toMatch(/USING \(user_id = auth\.uid\(\)\)/)
  })

  it('has UNIQUE constraint on (user_id, place_key)', () => {
    expect(sql).toMatch(/UNIQUE\s*\(user_id,\s*place_key\)/)
  })

  it('has name length constraint', () => {
    expect(sql).toMatch(/weather_saved_places_name_check/)
    expect(sql).toMatch(/char_length\(name\)\s*<=\s*160/)
  })

  it('has formatted_address length constraint', () => {
    expect(sql).toMatch(/weather_saved_places_formatted_address_check/)
    expect(sql).toMatch(/char_length\(formatted_address\)\s*<=\s*300/)
  })

  it('has lat/lon range constraints for Iceland', () => {
    expect(sql).toMatch(/weather_saved_places_lat_check/)
    expect(sql).toMatch(/lat BETWEEN 62 AND 68/)
    expect(sql).toMatch(/weather_saved_places_lon_check/)
    expect(sql).toMatch(/lon BETWEEN -26 AND -11/)
  })

  it('has usage_count >= 1 constraint', () => {
    expect(sql).toMatch(/weather_saved_places_usage_count_check/)
    expect(sql).toMatch(/usage_count >= 1/)
  })

  it('has index on (user_id, last_used_at DESC)', () => {
    expect(sql).toMatch(/weather_saved_places_user_last_used_idx/)
    expect(sql).toMatch(/ON public\.weather_saved_places \(user_id, last_used_at DESC\)/)
  })

  it('drops trigger before creating it (idempotent rerun)', () => {
    const dropIdx = sql.indexOf('DROP TRIGGER IF EXISTS weather_saved_places_set_updated_at')
    const createIdx = sql.indexOf('CREATE TRIGGER weather_saved_places_set_updated_at')
    expect(dropIdx).toBeGreaterThan(-1)
    expect(createIdx).toBeGreaterThan(-1)
    expect(dropIdx).toBeLessThan(createIdx)
  })

  it('has updated_at trigger calling teskeid_set_updated_at', () => {
    expect(sql).toMatch(/teskeid_set_updated_at\(\)/)
  })

  it('has user_id referencing auth.users with ON DELETE CASCADE', () => {
    expect(sql).toMatch(/REFERENCES auth\.users\(id\) ON DELETE CASCADE/)
  })

  it('wraps in a transaction', () => {
    expect(sql).toMatch(/^BEGIN;/m)
    expect(sql).toMatch(/^COMMIT;/m)
  })
})
