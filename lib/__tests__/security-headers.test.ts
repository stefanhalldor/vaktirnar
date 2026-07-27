// @vitest-environment node

import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

type HeaderRule = {
  source: string
  headers: Array<{ key: string; value: string }>
}

const require = createRequire(import.meta.url)
const nextConfig = require('../../next.config.js') as {
  headers?: () => Promise<HeaderRule[]>
}

describe('security headers', () => {
  it('allows same-origin geolocation while keeping camera and microphone disabled', async () => {
    const rules = await nextConfig.headers?.()
    const globalRule = rules?.find(rule => rule.source === '/(.*)')
    const permissionsPolicy = globalRule?.headers.find(
      header => header.key === 'Permissions-Policy',
    )?.value

    expect(permissionsPolicy).toBe(
      'camera=(), microphone=(), geolocation=(self)',
    )
  })
})
