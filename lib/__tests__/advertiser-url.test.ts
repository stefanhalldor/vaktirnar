import { describe, expect, it } from 'vitest'
import { advertiserDomain, normalizeSafeHttpsUrl } from '@/lib/advertiser/url'

describe('advertiser destination safety', () => {
  it('normalizes ordinary public HTTPS destinations', () => {
    expect(normalizeSafeHttpsUrl(' https://www.example.com/path?q=one ')).toBe('https://www.example.com/path?q=one')
    expect(advertiserDomain('https://www.example.com/path')).toBe('example.com')
    expect(normalizeSafeHttpsUrl('https://192.0.2.1/')).toBe('https://192.0.2.1/')
  })

  it.each([
    'javascript:alert(1)',
    'data:text/html,test',
    'file:///tmp/test',
    'http://example.com',
    'https://user:pass@example.com',
    'https://example.com:8443',
    'https://example.com/path#secret',
    'https://localhost/path',
    'https://service.local/path',
    'https://127.0.0.1/path',
    'https://10.0.0.1/path',
    'https://172.20.0.1/path',
    'https://192.168.1.1/path',
    'https://169.254.1.1/path',
    'https://[::1]/path',
    'https://[fd00::1]/path',
    'https://[fe80::1]/path',
    'https://[::ffff:127.0.0.1]/path',
    'https://[::ffff:10.0.0.1]/path',
    'https://example.com/\u202esecret',
    'https://example.com/\nsecret',
  ])('rejects %s', value => {
    expect(normalizeSafeHttpsUrl(value)).toBeNull()
  })
})
