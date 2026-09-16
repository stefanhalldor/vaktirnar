// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
describe('split invite response headers', () => {
  it('overrides global defaults with the private invite headers', async () => {
    const config = require('../../next.config.js')
    const rules = await config.headers() as Array<{ source: string; headers: Array<{ key: string; value: string }> }>
    const effective = new Map<string, string>()
    for (const rule of rules.filter(rule => rule.source === '/(.*)' || rule.source === '/splitt')) {
      for (const header of rule.headers) effective.set(header.key, header.value)
    }
    expect(effective.get('Referrer-Policy')).toBe('no-referrer')
    expect(effective.get('Cache-Control')).toBe('private, no-store')
    expect(effective.get('X-Robots-Tag')).toBe('noindex, nofollow, noarchive')
    expect(effective.get('X-Content-Type-Options')).toBe('nosniff')
  })
})
