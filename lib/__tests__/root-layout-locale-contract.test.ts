import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('root locale hydration contract', () => {
  it('passes the request locale explicitly to the client intl provider', () => {
    const source = readFileSync(join(process.cwd(), 'app/layout.tsx'), 'utf8')
    expect(source).toContain('<NextIntlClientProvider locale={locale} messages={messages}>')
  })
})
