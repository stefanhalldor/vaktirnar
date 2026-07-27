import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'sql/94_hms_place_directory.sql'),
  'utf8',
)

const HMS_TABLES = [
  'hms_place_dataset_versions',
  'hms_places',
] as const

const hmsFunctionNames = Array.from(
  sql.matchAll(/CREATE OR REPLACE FUNCTION\s+public\.([a-z0-9_]*hms[a-z0-9_]*)\s*\(/gi),
  match => match[1],
)

describe('sql/94_hms_place_directory.sql — schema and recovery', () => {
  it('is transactional and idempotently creates versioned HMS tables', () => {
    expect(sql).toMatch(/^BEGIN;/m)
    expect(sql).toMatch(/^COMMIT;/m)
    for (const table of HMS_TABLES) {
      expect(sql).toMatch(new RegExp(
        `CREATE TABLE IF NOT EXISTS public\\.${table}\\b`,
        'i',
      ))
    }
  })

  it('ties place rows to a dataset version with cascading cleanup', () => {
    expect(sql).toMatch(
      /dataset_version_id[\s\S]{0,180}REFERENCES public\.hms_place_dataset_versions\s*\(id\)[\s\S]{0,80}ON DELETE CASCADE/i,
    )
  })

  it('allows at most one active last-known-good dataset', () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS[\s\S]{0,180}hms_place_dataset_versions[\s\S]{0,120}WHERE\s+(?:status\s*=\s*'active'|is_active\s*=\s*true)/i,
    )
  })

  it('keeps stable HMS address identity unique inside each dataset', () => {
    expect(sql).toMatch(
      /(?:PRIMARY KEY|UNIQUE)\s*\(\s*dataset_version_id\s*,\s*source_id\s*\)/i,
    )
  })

  it('constrains coordinates to the Iceland service envelope', () => {
    expect(sql).toMatch(/lat[\s\S]{0,100}BETWEEN\s+6[23][\d.]*\s+AND\s+6[78][\d.]*/i)
    expect(sql).toMatch(/lon[\s\S]{0,100}BETWEEN\s+-2[56][\d.]*\s+AND\s+-1[12][\d.]*/i)
  })

  it('indexes normalized search text and nearest-coordinate filtering', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS[\s\S]{0,180}search_(?:name|address|special_name|municipality|text)_normalized/i,
    )
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS[\s\S]{0,180}\(\s*dataset_version_id\s*,\s*lat\s*,\s*lon\s*\)/i,
    )
  })

  it('uses built-in indexed full-text search for order-independent address tokens', () => {
    expect(sql).toMatch(
      /USING\s+gin\s*\(\s*to_tsvector\s*\(\s*'simple'\s*,\s*search_text_normalized\s*\)\s*\)/i,
    )
    expect(sql).toMatch(
      /v_tsquery\s*:=\s*to_tsquery\s*\(\s*'simple'\s*,\s*replace\s*\(\s*v_query\s*,\s*' '\s*,\s*':\* & '\s*\)\s*\|\|\s*':\*'\s*\)/i,
    )
    expect(sql).toMatch(
      /to_tsvector\s*\(\s*'simple'\s*,\s*place\.search_text_normalized\s*\)\s*@@\s*v_tsquery/i,
    )
  })

  it('validates normalized query characters before constructing the prefix tsquery', () => {
    const validationAt = sql.search(/v_query\s*!~\s*'\^\[a-z0-9 \]\+\$'/i)
    const constructionAt = sql.search(/v_tsquery\s*:=\s*to_tsquery/i)

    expect(validationAt).toBeGreaterThanOrEqual(0)
    expect(constructionAt).toBeGreaterThan(validationAt)
  })
})

describe('sql/94_hms_place_directory.sql — RLS and grants', () => {
  it('enables RLS and revokes all client table access', () => {
    for (const table of HMS_TABLES) {
      expect(sql).toMatch(new RegExp(
        `ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`,
        'i',
      ))
      expect(sql).toMatch(new RegExp(
        `REVOKE ALL ON public\\.${table} FROM PUBLIC, anon, authenticated`,
        'i',
      ))
      expect(sql).toMatch(new RegExp(
        `GRANT (?:SELECT, INSERT, UPDATE, DELETE|ALL) ON public\\.${table} TO service_role`,
        'i',
      ))
    }
  })

  it('never grants direct HMS table privileges to anon or authenticated', () => {
    for (const table of HMS_TABLES) {
      expect(sql).not.toMatch(new RegExp(
        `GRANT\\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL)[^;]*ON\\s+public\\.${table}[^;]*TO\\s+(?:anon|authenticated)`,
        'i',
      ))
    }
  })

  it('keeps every HMS RPC service-role-only', () => {
    expect(hmsFunctionNames.length).toBeGreaterThanOrEqual(2)

    for (const name of hmsFunctionNames) {
      expect(sql).toMatch(new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${name}\\([^;]*FROM PUBLIC, anon, authenticated`,
        'i',
      ))
      expect(sql).toMatch(new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${name}\\([^;]*TO service_role`,
        'i',
      ))
      expect(sql).not.toMatch(new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${name}\\([^;]*TO (?:anon|authenticated)`,
        'i',
      ))
    }
  })

  it('uses a fixed search_path for HMS functions', () => {
    const fixedSearchPathCount = (sql.match(/SET search_path\s*=\s*public/gi) ?? []).length
    expect(fixedSearchPathCount).toBeGreaterThanOrEqual(hmsFunctionNames.length)
  })
})

describe('sql/94_hms_place_directory.sql — bounded public API support', () => {
  it('hard-caps autocomplete results at ten inside SQL', () => {
    expect(sql).toMatch(/p_limit/i)
    expect(sql).toMatch(/LEAST\s*\([\s\S]{0,120}\b10\b[\s\S]{0,40}\)/i)
  })

  it('returns at most one nearest place', () => {
    expect(sql).toMatch(/LIMIT\s+1\b/i)
  })

  it('does not persist user IDs, raw search queries, or device coordinates', () => {
    expect(sql).not.toMatch(/\buser_id\b/i)
    expect(sql).not.toMatch(/\braw_query\b/i)
    expect(sql).not.toMatch(/\bdevice_(?:lat|lon|location)\b/i)
  })
})
