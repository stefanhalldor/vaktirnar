import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const path = 'sql/validation/163-expense-existing-member-relationship-identity/diagnose-runtime-read.sql'
const diagnostic = readFileSync(path, 'utf8').replace(/\r\n/g, '\n')

describe('SQL163 runtime read diagnostic', () => {
  it('uses an explicit read-only transaction and always rolls back', () => {
    expect(diagnostic).toMatch(/^BEGIN;\nSET TRANSACTION READ ONLY;\nSET LOCAL search_path = '';\nSET LOCAL timezone = 'UTC';/)
    expect(diagnostic.trimEnd().endsWith('ROLLBACK;')).toBe(true)
  })

  it('has exactly one operator placeholder and no hardcoded UUID', () => {
    expect(diagnostic.match(/<REPLACE_WITH_EXACT_EXPENSE_UUID>/g)).toHaveLength(1)
    expect(diagnostic).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i)
  })

  it('contains no SQL mutation, grant, recovery or schema-cache action', () => {
    expect(diagnostic).not.toMatch(/^\s*(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE)\b/im)
    expect(diagnostic).not.toMatch(/NOTIFY\s+pgrst|schema[_ -]?cache|recovery/i)
  })

  it('gates one exact actor context before calling the exact SQL163 function', () => {
    expect(diagnostic).toContain('pg_catalog.count(DISTINCT member.user_id)')
    expect(diagnostic).toContain("member.role IN ('owner','admin')")
    expect(diagnostic).toContain("public.expense_active_member_role(member.user_id, v_group_id) IN ('owner','admin')")
    expect(diagnostic).toContain('v_actor_count <> 1 OR v_actor_id IS NULL')
    expect(diagnostic).toContain('public.expense_get_relationship_identity_management_v1(v_actor_id, v_expense_id)')
  })

  it('maps failures only through bounded SQLSTATE classifications', () => {
    for (const classification of [
      'OK_BOUNDED_RESULT',
      'STOP_EXPENSE_OR_ACTOR_CONTEXT',
      'STOP_FUNCTION_RESOLUTION',
      'STOP_PRIVILEGE',
      'STOP_UNDEFINED_DEPENDENCY',
      'STOP_RUNTIME_OTHER',
    ]) expect(diagnostic).toContain(classification)
    expect(diagnostic).toContain('GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE')
    expect(diagnostic).not.toMatch(/SQLERRM|PG_EXCEPTION_(DETAIL|HINT|CONTEXT)|MESSAGE_TEXT/)
  })

  it('contains every fallible phase inside one outer bounded exception handler', () => {
    expect(diagnostic.match(/EXCEPTION WHEN OTHERS/g)).toHaveLength(1)
    const classifyStart = diagnostic.indexOf('<<classify>>')
    const handler = diagnostic.indexOf('EXCEPTION WHEN OTHERS', classifyStart)
    const classifyEnd = diagnostic.indexOf('END classify;', handler)
    const resultPublisher = diagnostic.indexOf("pg_catalog.set_config(\n    'teskeid.sql163_runtime_read_result'", classifyEnd)

    expect(classifyStart).toBeGreaterThan(-1)
    expect(handler).toBeGreaterThan(classifyStart)
    expect(classifyEnd).toBeGreaterThan(handler)
    expect(resultPublisher).toBeGreaterThan(classifyEnd)
    for (const falliblePhase of [
      'FROM public.expenses AS expense',
      'FROM public.expense_group_members AS member',
      'public.expense_get_relationship_identity_management_v1(v_actor_id, v_expense_id)',
      "pg_catalog.jsonb_object_keys(v_result)",
      "pg_catalog.jsonb_array_elements(v_result->'members')",
      "pg_catalog.jsonb_array_elements(v_member->'candidates')",
    ]) {
      const position = diagnostic.indexOf(falliblePhase, classifyStart)
      expect(position, falliblePhase).toBeGreaterThan(classifyStart)
      expect(position, falliblePhase).toBeLessThan(handler)
    }
  })

  it('validates bounded result shape without returning private result content', () => {
    expect(diagnostic).toContain("v_result ?& ARRAY['expense_id','financial_version','members']")
    expect(diagnostic).toContain("v_member ?& ARRAY['member_id','candidates']")
    expect(diagnostic).toContain("v_candidate ?& ARRAY['relationship_id','display_name']")
    expect(diagnostic).toContain("pg_catalog.jsonb_array_length(v_result->'members') > 50")
    expect(diagnostic).toContain("pg_catalog.jsonb_array_length(v_member->'candidates') > 50")
    const resultPublisher = diagnostic.slice(
      diagnostic.indexOf("pg_catalog.set_config(\n    'teskeid.sql163_runtime_read_result'"),
      diagnostic.indexOf('$diagnostic$;'),
    )
    expect(resultPublisher).not.toMatch(/\bv_(result|member|candidate|expense_id|group_id|actor_id)\b/)
  })

  it('emits one privacy-bounded JSON result row before rollback', () => {
    expect(diagnostic).not.toContain('RAISE NOTICE')
    expect(diagnostic.match(/pg_catalog\.set_config\(/g)).toHaveLength(1)
    expect(diagnostic.match(/pg_catalog\.current_setting\(/g)).toHaveLength(1)
    const publisherStart = diagnostic.indexOf("pg_catalog.set_config(\n    'teskeid.sql163_runtime_read_result'")
    const resultSelect = diagnostic.indexOf("SELECT pg_catalog.current_setting(\n  'teskeid.sql163_runtime_read_result'")
    const rollback = diagnostic.lastIndexOf('ROLLBACK;')
    const publishedResult = diagnostic.slice(publisherStart, resultSelect)

    expect(publisherStart).toBeGreaterThan(-1)
    expect(resultSelect).toBeGreaterThan(publisherStart)
    expect(rollback).toBeGreaterThan(resultSelect)
    expect(publishedResult).toContain(')::text,\n    true\n  );')
    for (const key of [
      'classification',
      'sqlstate',
      'result_shape',
      'member_count',
      'candidate_count',
      'evidence_token',
    ]) expect(publishedResult).toContain(`'${key}'`)
    expect(publishedResult).not.toMatch(/'expense_id'|'group_id'|'actor_id'|'member_id'|'relationship_id'|'display_name'|'email'|'message'|'details'|'hint'/)
  })
})
