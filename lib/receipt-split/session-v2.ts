/** Read-only compatibility boundary. Never use an adapted v1 view for v2 writes. */
import { splitViewSchema } from './contracts'
import { legacyMilliToUnits } from './quantity-v2'

export function adaptLegacySplitSession(value: unknown) {
  const legacy = splitViewSchema.parse(value)
  const { totalMinor, items, claims, ...session } = legacy
  return {
    ...session,
    contractVersion: 2 as const,
    quantityScale: 3000 as const,
    sourceContractVersion: 1 as const,
    // Existing v1 snapshots cannot prove per-item revision or the original total.
    // The future v2 RPC must provide authoritative revisions before writes open.
    canWriteV2: false as const,
    receiptTotalMinor: totalMinor,
    receiptTotalProvenance: 'legacy_stored_total' as const,
    items: items.map(({ quantityMilli, ...item }) => ({
      ...item, quantityUnits: legacyMilliToUnits(quantityMilli),
      originalDescription: item.description, explanation: '', explanationNeedsReview: false,
      itemRevision: null,
    })),
    claims: claims.map(({ quantityMilli, ...claim }) => ({
      ...claim, quantityUnits: legacyMilliToUnits(quantityMilli),
    })),
    dismissedItemIds: [],
  }
}
