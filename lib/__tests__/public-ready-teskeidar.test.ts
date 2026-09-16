import { describe, expect, it } from 'vitest'
import { withPublicReceiptSplit } from '@/lib/teskeid/public-ready'

const copy = { title: 'Splitta reikningnum', description: 'Taktu mynd af reikningnum og splittaðu honum svo.' }

describe('public ready Teskeiðar', () => {
  it('always includes receipt splitting when the database row is missing', () => {
    expect(withPublicReceiptSplit([], copy)).toEqual([expect.objectContaining({
      slug: 'splitta-reikningnum', title: copy.title, short_description: copy.description,
    })])
  })

  it('uses an existing receipt-split row without duplicating it', () => {
    const existing = { slug: 'splitta-reikningnum', title: 'Stored title', short_description: 'Stored copy', category: 'Útgjöld' as const }
    expect(withPublicReceiptSplit([existing], copy)).toEqual([existing])
  })
})
