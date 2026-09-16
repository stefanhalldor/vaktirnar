import { readFileSync } from 'node:fs'
import { describe, expect, it, vi, afterEach } from 'vitest'
const notFound = vi.hoisted(() => vi.fn(() => { throw new Error('NOT_FOUND') }))
vi.mock('next/navigation', () => ({ notFound }))
vi.mock('@/components/receipt-split/preview/SplitPreview', () => ({ SplitPreview: () => null }))
import Page from '@/app/preview/splitt-v032/page'
import is from '@/messages/is.json'
import en from '@/messages/en.json'
afterEach(() => vi.unstubAllEnvs())
describe('preview deployment and data isolation', () => {
  it('is absent in production and test environments', () => {
    for (const environment of ['production', 'test']) {
      vi.stubEnv('NODE_ENV', environment)
      expect(() => Page()).toThrow('NOT_FOUND')
    }
    vi.stubEnv('NODE_ENV', 'development')
    expect(() => Page()).not.toThrow()
  })
  it('keeps prototype data in memory and does not call live actions, storage or providers', () => {
    const source = readFileSync('components/receipt-split/preview/SplitPreview.tsx', 'utf8')
      + readFileSync('lib/receipt-split/preview-model.ts', 'utf8')
    expect(source).not.toMatch(/from ['"][^'"]*(?:supabase|actions|server|anthropic)['"]/)
    expect(source).not.toMatch(/\bfetch\(|\blocalStorage\.|\bsessionStorage\.|dangerouslySetInnerHTML/)
  })
  it('keeps complete matching translations and preserves Icelandic Unicode', () => {
    expect(Object.keys(is.teskeid.receiptSplitPreview).sort()).toEqual(Object.keys(en.teskeid.receiptSplitPreview).sort())
    expect(is.teskeid.receiptSplitPreview.preview).toBe('Prófun með sýnigögnum')
    expect(Object.values(is.teskeid.receiptSplitPreview).some(value => value.includes('?'))).toBe(false)
  })
})
