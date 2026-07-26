import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(join(process.cwd(), 'sql/92_teskeid_road_graph_snapshots.sql'), 'utf8')

describe('sql/92 Teskeið road graph snapshots', () => {
  it('is transactional and creates the versioned snapshot table', () => {
    expect(sql).toMatch(/^\s*BEGIN\s*;/m)
    expect(sql).toMatch(/^\s*COMMIT\s*;/m)
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.teskeid_road_graph_snapshots')
    expect(sql).toContain('schema_version')
    expect(sql).toContain('payload_sha256')
    expect(sql).toContain('source_content_sha256')
    expect(sql).toContain('storage_bucket')
    expect(sql).toContain('storage_path')
  })

  it('creates a private bounded Storage bucket without client object policies', () => {
    expect(sql).toContain('INSERT INTO storage.buckets')
    expect(sql).toContain("'teskeid-road-graph-snapshots'")
    expect(sql).toMatch(/public,\s*file_size_limit,\s*allowed_mime_types[\s\S]*false,\s*52428800/)
    expect(sql).not.toMatch(/CREATE POLICY[\s\S]*storage\.objects/)
  })

  it('enables RLS, revokes clients and grants only service_role table access', () => {
    expect(sql).toContain('ALTER TABLE public.teskeid_road_graph_snapshots ENABLE ROW LEVEL SECURITY')
    expect(sql).toMatch(/REVOKE ALL ON public\.teskeid_road_graph_snapshots FROM PUBLIC, anon, authenticated/)
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON public\.teskeid_road_graph_snapshots TO service_role/)
    expect(sql).not.toMatch(/GRANT .* ON public\.teskeid_road_graph_snapshots TO (anon|authenticated|PUBLIC)/)
  })

  it('enforces one active snapshot and one refresh lease', () => {
    expect(sql).toContain('teskeid_road_graph_snapshots_one_active_idx')
    expect(sql).toContain("WHERE status = 'active'")
    expect(sql).toContain('teskeid_road_graph_snapshots_one_building_idx')
    expect(sql).toContain("WHERE status = 'building'")
  })

  it('expires abandoned leases and promotes atomically under advisory locks', () => {
    expect(sql).toContain("created_at < now() - interval '20 minutes'")
    expect(sql).toContain("pg_advisory_xact_lock(hashtext('teskeid_road_graph_refresh'))")
    expect(sql).toContain("pg_advisory_xact_lock(hashtext('teskeid_road_graph_promote'))")
    expect(sql).toContain("SET status = 'retired'")
    expect(sql).toContain("SET status = 'active'")
    expect(sql).toContain("status IN ('ready', 'retired')")
  })

  it('makes refresh functions service-role-only', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.begin_teskeid_road_graph_refresh\(text\)[\s\S]*FROM PUBLIC, anon, authenticated/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.begin_teskeid_road_graph_refresh\(text\)[\s\S]*TO service_role/)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.promote_teskeid_road_graph_snapshot\(uuid\)[\s\S]*FROM PUBLIC, anon, authenticated/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.promote_teskeid_road_graph_snapshot\(uuid\)[\s\S]*TO service_role/)
  })

  it('documents recovery and confirms no user-route data is stored', () => {
    expect(sql).toContain('Recovery / rollback plan')
    expect(sql).toContain('No raw user routes, addresses, weather selections or personal data are stored')
  })
})
