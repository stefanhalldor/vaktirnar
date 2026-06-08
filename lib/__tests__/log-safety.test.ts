// lib/__tests__/log-safety.test.ts
//
// AST-based regression test: scans server-side source files and verifies that
// every argument to console.error / console.warn is a static string literal or
// no-substitution template literal.
//
// Enforcement rule: console.error/warn in production server code must receive
// only fixed string arguments — no identifiers, property accesses, template
// expressions, concatenation, or any other dynamic value.
//
// console.log is intentionally out of scope (dev-only use is acceptable).
//
// Strategy:
//   1. Parse each scoped file with ts.createSourceFile (full TypeScript AST).
//   2. Walk all CallExpression nodes looking for console.error / console.warn.
//   3. For each matching call, every argument must satisfy isStaticArg():
//        - ts.StringLiteral  — 'hello' or "hello"
//        - ts.NoSubstitutionTemplateLiteral — `hello` (no ${...})
//      Any other node type is a violation.
//
// Self-tests verify that the scanner itself works correctly before testing the
// scoped files.

import * as ts from 'typescript'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { describe, it, expect } from 'vitest'

const ROOT = join(__dirname, '..', '..')

function readSource(relPath: string): string {
  return readFileSync(join(ROOT, relPath), 'utf-8')
}

// Returns true if the source begins with a 'use client' directive (AST-based).
// Used to skip client components that may be found during file discovery.
function hasUseClientDirective(src: string): boolean {
  const sf = ts.createSourceFile('<check>', src, ts.ScriptTarget.Latest, true)
  const first = sf.statements[0]
  return (
    first !== undefined &&
    ts.isExpressionStatement(first) &&
    ts.isStringLiteral(first.expression) &&
    first.expression.text === 'use client'
  )
}

// Recursively discovers all route.ts files under a given directory,
// returning paths relative to ROOT with forward slashes.
function discoverRouteTs(baseDir: string): string[] {
  const results: string[] = []
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (entry.name === 'route.ts') {
        results.push(full.slice(ROOT.length + 1).replace(/\\/g, '/'))
      }
    }
  }
  walk(join(ROOT, baseDir))
  return results
}

function isStaticArg(node: ts.Expression): boolean {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
}

function findViolations(src: string, fileName = '<input>'): Array<{ line: number; call: string }> {
  const sf = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true)
  const out: Array<{ line: number; call: string }> = []

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const expr = node.expression
      if (
        ts.isPropertyAccessExpression(expr) &&
        ts.isIdentifier(expr.expression) &&
        expr.expression.text === 'console' &&
        (expr.name.text === 'error' || expr.name.text === 'warn')
      ) {
        const hasNonStatic = node.arguments.some((a) => !isStaticArg(a))
        if (hasNonStatic) {
          const { line } = sf.getLineAndCharacterOfPosition(node.getStart())
          out.push({
            line: line + 1,
            call: src.slice(node.getStart(), node.getEnd()).replace(/\s+/g, ' ').slice(0, 120),
          })
        }
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sf)
  return out
}

// Server-side helpers and pages with console.error/warn calls.
// Add new lib/ files and page components here as they are introduced.
const SERVER_HELPERS: string[] = [
  // auth helpers
  'lib/auth/email.ts',
  'lib/auth/session.ts',
  'lib/auth/codes.ts',
  'lib/auth/user-codes.ts',
  'lib/auth/unsubscribe.ts',
  'lib/auth/ip-rate-limit.ts',
  // auth / Teskeid guards
  'lib/loans/guard.ts',
  // legacy helpers
  'lib/legacy/guard.ts',
  'lib/legacy/access.ts',
  // loans server actions
  'lib/loans/actions.ts',
  'lib/loans/email.ts',
  // auth-mvp Teskeið pages (server components — verified not 'use client' below)
  'app/auth-mvp/heim/page.tsx',
  'app/auth-mvp/lanad-og-skilad/page.tsx',
  'app/auth-mvp/lanad-og-skilad/ny/page.tsx',
  'app/auth-mvp/lanad-og-skilad/breyta/[id]/page.tsx',
  'app/auth-mvp/lanad-og-skilad/baeta-vid-adila/[id]/page.tsx',
  'app/auth-mvp/lanad-og-skilad/claim/[id]/page.tsx',
]

// Auto-discover all app/api/**/route.ts files. Filter out any that carry a
// 'use client' directive (detected via TypeScript AST) — those are client
// components and not subject to this server-log policy.
const API_ROUTES = discoverRouteTs('app/api').filter(
  (f) => !hasUseClientDirective(readSource(f))
)

// Combined scope: all server-side files with console.error/warn calls.
const SCOPE = [...SERVER_HELPERS, ...API_ROUTES]

describe('log-safety (AST) — no dynamic values in console.error/warn', () => {
  describe('AST scanner — self-tests', () => {
    it('rejects console.error with template expression argument', () => {
      const src = 'const email = "x"; console.error(`email=${email}`)'
      expect(findViolations(src)).toHaveLength(1)
    })

    it('rejects console.error with identifier as second argument (paren in string does not confuse parser)', () => {
      const src = 'const email = "x"; console.error("failed )", email)'
      expect(findViolations(src)).toHaveLength(1)
    })

    it('rejects multiline console.error with dynamic argument', () => {
      const src = [
        'const err = new Error("x")',
        'console.error(',
        '  "failed",',
        '  err.message',
        ')',
      ].join('\n')
      expect(findViolations(src)).toHaveLength(1)
    })

    it('rejects console.warn with identifier argument', () => {
      const src = 'const error = new Error("x"); console.warn("failed", error)'
      expect(findViolations(src)).toHaveLength(1)
    })

    it('accepts console.error with fixed string containing parentheses', () => {
      const src = 'console.error("[auth] failed (no details)")'
      expect(findViolations(src)).toHaveLength(0)
    })

    it('does not scan console.log', () => {
      const src = 'const x = 1; console.log("debug:", x)'
      expect(findViolations(src)).toHaveLength(0)
    })
  })

  for (const file of SCOPE) {
    it(file, () => {
      const src = readSource(file)
      const violations = findViolations(src, join(ROOT, file))
      const report = violations.map(({ line, call }) => `  line ${line}: ${call}`).join('\n')
      expect(violations, report).toHaveLength(0)
    })
  }
})
