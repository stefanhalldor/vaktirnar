import { describe, expect, it } from 'vitest'
import { mutationSchema, parseSplitDecimal, splitDecimal, splitSummary, UNCLAIMED, type SplitView } from '@/lib/receipt-split/contracts'
import { resolveSafeLoginNext } from '@/lib/auth/loginNext'
import { formatSplitMoney } from '@/lib/receipt-split/format'

const item = { id: '00000000-0000-4000-8000-000000000001', kind: 'item' as const, description: 'Espresso', quantityMilli: 4000, totalMinor: 1600 }
const anna = '00000000-0000-4000-8000-000000000002'
const bob = '00000000-0000-4000-8000-000000000003'
const view = { items: [item], totalMinor: 1600, claims: [] } satisfies Pick<SplitView, 'items' | 'totalMinor' | 'claims'>
describe('standalone split quantities and money', () => {
  it.each([[4000, 3, '4'], [10000, 3, '10'], [0, 3, '0'], [1250, 3, '1.25'], [1600, 2, '16'], [450, 2, '4.5'], [401, 2, '4.01'], [-150, 2, '-1.5']])(
    'removes only redundant fractional zeros from %s', (value, digits, expected) => {
      expect(splitDecimal(Number(value), Number(digits))).toBe(expected)
      expect(parseSplitDecimal(String(expected), Number(digits))).toBe(value)
    },
  )
  it('formats supported currencies with exact fractions and locale conventions', () => {
    const compact = (s: string) => s.replace(/\s/g, ' ')
    expect(compact(formatSplitMoney(1600, 'EUR', 'en'))).toBe('EUR 16')
    expect(compact(formatSplitMoney(450, 'EUR', 'is'))).toBe('4,5 EUR')
    expect(compact(formatSplitMoney(401, 'EUR', 'is'))).toBe('4,01 EUR')
    expect(compact(formatSplitMoney(-50, 'EUR', 'en'))).toBe('-EUR 0.5')
    expect(formatSplitMoney(1600, 'ISK', 'is')).not.toContain(',')
    expect(compact(formatSplitMoney(BigInt('900719925474099199'), 'EUR', 'en'))).toBe('EUR 9,007,199,254,740,991.99')
  })
  it('leaves three espresso and their cost unclaimed after taking one', () => {
    const result = splitSummary({ ...view, claims: [{ itemId: item.id, memberToken: anna, quantityMilli: 1000 }] })
    expect(result.remaining.get(item.id)).toBe(3000)
    expect(result.totals.get(anna)).toBe(400)
    expect(result.totals.get(UNCLAIMED)).toBe(1200)
  })
  it('allocates the whole receipt to nobody until claims exist', () => {
    expect([...splitSummary(view).totals]).toEqual([[UNCLAIMED, 1600]])
  })
  it('shares adjustments with unclaimed portions and preserves zero-price lines', () => {
    const result = splitSummary({ ...view, totalMinor: 1800,
      items: [item, { ...item, id: 'zero', totalMinor: 0 }, { ...item, id: 'tip', kind: 'tip', quantityMilli: 1000, totalMinor: 200 }],
      claims: [{ itemId: item.id, memberToken: anna, quantityMilli: 1000 }] })
    expect(result.totals.get(anna)).toBe(450)
    expect(result.totals.get(UNCLAIMED)).toBe(1350)
    expect(result.remaining.has('zero')).toBe(false)
  })
  it('is deterministic for fractional sharing and odd cents', () => {
    const result = splitSummary({ ...view, totalMinor: 1, items: [{ ...item, quantityMilli: 1000, totalMinor: 1 }],
      claims: [{ itemId: item.id, memberToken: anna, quantityMilli: 500 }, { itemId: item.id, memberToken: bob, quantityMilli: 500 }] })
    expect(result.totals.get(anna)).toBe(1)
    expect(result.totals.get(bob)).toBe(0)
  })
  it('rejects overclaims and mismatched totals', () => {
    expect(() => splitSummary({ ...view, claims: [{ itemId: item.id, memberToken: anna, quantityMilli: 4001 }] })).toThrow()
    expect(() => splitSummary({ ...view, totalMinor: 1601 })).toThrow()
  })
  it.each([['1,250', 3, 1250], ['0.5', 3, 500], ['16.00', 2, 1600], ['100', 0, 100], ['-1.50', 2, -150]])(
    'parses exact decimal %s', (text, digits, expected) => expect(parseSplitDecimal(String(text), Number(digits))).toBe(expected),
  )
  it.each(['1e3', '1.2345', 'NaN', '1,2,3', 'Infinity'])('rejects invalid quantity %s', text => expect(parseSplitDecimal(text, 3)).toBeNull())
  it('rejects fractions of ISK and round trips safe monetary values', () => {
    expect(parseSplitDecimal('1.1', 0)).toBeNull()
    expect(parseSplitDecimal(splitDecimal(166300, 2), 2)).toBe(166300)
  })
  it('does not accept a beneficiary or actor ID from the caller', () => {
    const command = { command: 'claim', id: item.id, requestId: anna, itemId: item.id, previous: 0, quantity: 1000 }
    expect(mutationSchema.safeParse(command).success).toBe(true)
    expect(mutationSchema.safeParse({ ...command, actorId: bob }).success).toBe(false)
    expect(mutationSchema.safeParse({ ...command, memberToken: bob }).success).toBe(false)
  })
  it('allows only the exact public invite landing page as a login destination', () => {
    expect(resolveSafeLoginNext('/splitt')).toBe('/splitt')
    for (const value of ['/splitt?token=secret', '/splitt#secret', '/splittevil', '//evil.test/splitt']) {
      expect(resolveSafeLoginNext(value)).toBeNull()
    }
  })
})
