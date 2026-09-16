import 'server-only'
import { getExpenseReceiptSplitForActor } from '@/lib/expenses/receipt-split.server'

/** One-way copy of an owner's unpublished receipt lines. No financial state,
 * membership, payer information or image permissions cross this boundary. */
export async function readLegacyReceiptLines(actor: string, id: string) {
  const receipt = await getExpenseReceiptSplitForActor(actor, { draftId: id })
  if (!receipt?.isAuthor || receipt.publicationId !== null || receipt.phase !== 'review'
    || !receipt.title || !receipt.currency || !receipt.incurredOn || !receipt.receiptTotalMinor) return null
  return {
    version: receipt.receiptVersion,
    extraction: {
      title: receipt.title, currency: receipt.currency, incurred_on: receipt.incurredOn,
      receipt_total_minor: receipt.receiptTotalMinor,
      items: receipt.items.map(i => ({
        kind: i.kind, description: i.description, quantity_milli: i.quantityMilli,
        total_minor: i.totalMinor, confidence_basis_points: 10000, needs_review: true,
      })),
    },
  }
}
