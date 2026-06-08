// lib/__tests__/legacy-guard-coverage.test.ts
//
// Static AST test: for each legacy API route file, verifies that every
// exported async handler (GET, POST, PUT, PATCH, DELETE) calls both
// legacyGuard() and guardLegacyAccess( as textual patterns within the
// function body. This catches omissions during refactoring without requiring
// runtime execution.

import * as ts from 'typescript'
import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, it, expect } from 'vitest'

const ROOT = join(__dirname, '..', '..')

function readSource(relPath: string): string {
  return readFileSync(join(ROOT, relPath), 'utf-8')
}

// Extract text of each exported async HTTP handler from a TypeScript source.
function extractHandlers(src: string): Array<{ name: string; text: string }> {
  const sf = ts.createSourceFile('<input>', src, ts.ScriptTarget.Latest, true)
  const handlers: Array<{ name: string; text: string }> = []

  for (const stmt of sf.statements) {
    if (
      ts.isFunctionDeclaration(stmt) &&
      stmt.name &&
      stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) &&
      stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)
    ) {
      const name = stmt.name.text
      if (['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(name)) {
        handlers.push({ name, text: src.slice(stmt.getStart(), stmt.getEnd()) })
      }
    }
  }

  return handlers
}

// The 13 legacy API route files that must guard with both legacyGuard and
// guardLegacyAccess in every exported handler.
const LEGACY_ROUTE_FILES = [
  'app/api/chats/route.ts',
  'app/api/chats/[id]/route.ts',
  'app/api/chats/[id]/messages/route.ts',
  'app/api/chats/[id]/activity/route.ts',
  'app/api/children/route.ts',
  'app/api/children/[id]/route.ts',
  'app/api/children/[id]/invite-code/route.ts',
  'app/api/children/join/route.ts',
  'app/api/contacts/route.ts',
  'app/api/contacts/[id]/route.ts',
  'app/api/push/subscribe/route.ts',
  'app/api/sessions/route.ts',
  'app/api/dashboard/route.ts',
]

describe('legacy-guard-coverage — every handler calls legacyGuard and guardLegacyAccess', () => {
  for (const file of LEGACY_ROUTE_FILES) {
    const src = readSource(file)
    const handlers = extractHandlers(src)

    describe(file, () => {
      it('has at least one exported handler', () => {
        expect(handlers.length).toBeGreaterThan(0)
      })

      for (const { name, text } of handlers) {
        it(`${name} calls legacyGuard()`, () => {
          expect(text).toContain('legacyGuard()')
        })

        it(`${name} calls guardLegacyAccess(`, () => {
          expect(text).toContain('guardLegacyAccess(')
        })
      }
    })
  }
})
