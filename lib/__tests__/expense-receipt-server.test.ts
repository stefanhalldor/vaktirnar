import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  parseExpenseReceiptExtractionText,
  verifyExpenseReceiptImage,
} from '@/lib/expenses/receipt-split.server'

describe('receipt image verification', () => {
  it('accepts matching bounded image magic and returns SHA-256', () => {
    const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0x00])
    expect(verifyExpenseReceiptImage(bytes, 'image/jpeg', 4)).toEqual({
      mimeType: 'image/jpeg',
      sizeBytes: 4,
      sha256: '374ffede23adbc8bc625205f4bf86750807ffb6ce71fc7d10cac8bded0872bf5',
    })
  })

  it('rejects declared size or MIME mismatches', () => {
    const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0x00])
    expect(() => verifyExpenseReceiptImage(bytes, 'image/jpeg', 3))
      .toThrow('expense_receipt_size_invalid')
    expect(() => verifyExpenseReceiptImage(bytes, 'image/png', 4))
      .toThrow('expense_receipt_mime_invalid')
  })
})

describe('manual receipt extraction import', () => {
  const extraction = {
    title: 'Dinner',
    currency: 'EUR',
    incurred_on: '2026-09-14',
    receipt_total_minor: 166_300,
    items: [{
      kind: 'item',
      description: 'Sparkling water',
      quantity_milli: 4_000,
      total_minor: 2_800,
      confidence_basis_points: 10_000,
      needs_review: false,
    }],
  }

  it('accepts both raw JSON and one copyable fenced JSON block', () => {
    expect(parseExpenseReceiptExtractionText(JSON.stringify(extraction))).toEqual(extraction)
    expect(parseExpenseReceiptExtractionText(
      '```json\r\n' + JSON.stringify(extraction, null, 2) + '\r\n```',
    )).toEqual(extraction)
  })

  it('rejects prose, tables, extra fields and SQL-invalid adjustment quantities', () => {
    expect(() => parseExpenseReceiptExtractionText(
      'Here is the result:\n```json\n' + JSON.stringify(extraction) + '\n```',
    )).toThrow('expense_receipt_manual_extraction_invalid')
    expect(() => parseExpenseReceiptExtractionText('| Item | Total |\n| Wine | 20 |'))
      .toThrow('expense_receipt_manual_extraction_invalid')
    expect(() => parseExpenseReceiptExtractionText(JSON.stringify({
      ...extraction,
      unexpected: true,
    }))).toThrow()
    expect(() => parseExpenseReceiptExtractionText(JSON.stringify({
      ...extraction,
      items: [{
        ...extraction.items[0],
        kind: 'discount',
        quantity_milli: 500,
        total_minor: -100,
      }],
    }))).toThrow('expense_receipt_line_invalid')
  })

  it('keeps uncertain lines explicit instead of weakening the exact schema', () => {
    const uncertain = {
      ...extraction,
      items: [{
        ...extraction.items[0],
        description: 'Unreadable line',
        confidence_basis_points: 2_500,
        needs_review: true,
      }],
    }
    expect(parseExpenseReceiptExtractionText(JSON.stringify(uncertain))).toEqual(uncertain)
  })

  it('preserves an optional plain-language explanation of the printed name', () => {
    const explained = {
      ...extraction,
      items: [{ ...extraction.items[0], description: 'Chocolate Cake', explanation: 'Súkkulaðikaka', explanation_needs_review: false }],
    }
    expect(parseExpenseReceiptExtractionText(JSON.stringify(explained))).toEqual(explained)
  })

  it('preserves complimentary zero-total items for explicit human review', () => {
    const complimentary = {
      ...extraction,
      items: [{
        ...extraction.items[0],
        description: 'Birthday cake',
        total_minor: 0,
        needs_review: true,
      }],
    }
    expect(parseExpenseReceiptExtractionText(JSON.stringify(complimentary))).toEqual(complimentary)
    expect(() => parseExpenseReceiptExtractionText(JSON.stringify({
      ...complimentary,
      items: [{ ...complimentary.items[0], total_minor: -1 }],
    }))).toThrow('expense_receipt_line_invalid')
  })
})

describe('receipt split navigation contract', () => {
  it('keeps the receipt route within Splitta reikningnum without an expense handoff', () => {
    const root = process.cwd()
    const standalone = join(root, 'app/auth-mvp/splitta-reikningnum')
    const legacyNested = join(root, 'app/auth-mvp/utlagt-og-endurgreitt/splitta')
    const uploadPage = readFileSync(join(standalone, 'page.tsx'), 'utf8')
    const reviewPage = readFileSync(join(standalone, '[draftId]/page.tsx'), 'utf8')
    const upload = readFileSync(join(root, 'components/expenses/ExpenseReceiptUpload.tsx'), 'utf8')
    const dashboard = readFileSync(join(root, 'components/expenses/ExpenseDashboard.tsx'), 'utf8')

    expect(existsSync(join(standalone, 'loading.tsx'))).toBe(true)
    expect(existsSync(join(standalone, '[draftId]/loading.tsx'))).toBe(true)
    expect(existsSync(legacyNested)).toBe(false)
    const actions = readFileSync(join(root, 'lib/expenses/receipt-actions.ts'), 'utf8')

    expect(uploadPage).toContain('await guardSplit()')
    expect(reviewPage).toContain('await guardSplit(')
    expect(uploadPage).not.toContain('guardExpenseReceiptAccess')
    expect(reviewPage).not.toContain('guardExpenseReceiptAccess')
    expect(uploadPage).toContain('backHref="/auth-mvp/heim"')
    expect(reviewPage).toContain('backHref={SPLIT_PATH}')
    expect(reviewPage).not.toContain('manageHref=')
    expect(reviewPage).not.toContain('/auth-mvp/utlagt-og-endurgreitt')
    expect(upload).toContain("router.push('/auth-mvp/splitta-reikningnum/'")
    expect(upload).not.toContain('/auth-mvp/utlagt-og-endurgreitt/splitta')
    expect(dashboard).not.toContain('dashboard.splitReceipt')
    expect(dashboard).not.toContain('/utlagt-og-endurgreitt/splitta')
    expect(dashboard).not.toContain('/auth-mvp/splitta-reikningnum')
    expect(actions).not.toContain('guardExpenseAccess')
    expect(actions.match(/await guardExpenseReceiptAccess\(\)/g)).toHaveLength(10)
    expect(actions).toContain("const RECEIPT_SPLIT_PATH = '/auth-mvp/splitta-reikningnum'")
    expect(actions).not.toContain("EXPENSES_PATH + '/splitta/'")
  })

  it('describes the zero-provider manual path separately from the one-request automatic path', () => {
    for (const locale of ['is', 'en']) {
      const messages = JSON.parse(readFileSync(join(process.cwd(), `messages/${locale}.json`), 'utf8'))
      const receipt = messages.teskeid.expenses.receipt as Record<string, string>
      expect(receipt.providerNotice).toContain(locale === 'is'
        ? 'Ef þú velur Lesa kvittun'
        : 'If you choose Read receipt')
      expect(receipt.manualHelp).toContain(locale === 'is'
        ? 'Teskeið sendir ekkert'
        : 'Teskeið sends nothing')
      expect(receipt.manualPromptText).toContain(locale === 'is'
        ? 'Varðveittu item-línur með heildarupphæðina 0'
        : 'Preserve item lines whose total amount is 0')
      expect(receipt.manualPromptText).toContain(locale === 'is'
        ? 'biddu notandann um að bæta við mynd af reikningnum sem á að splitta'
        : 'ask the user to attach an image of the bill they want to split')
      expect(receipt.manualPromptText).toContain(locale === 'is'
        ? 'ekki búa til JSON eða giska'
        : 'do not create JSON or guess')
      expect(receipt.manualHelp).not.toContain(locale === 'is'
        ? 'greiningin bregst'
        : 'analysis fails')
    }
  })
})
