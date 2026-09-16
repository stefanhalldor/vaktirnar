import { notFound } from 'next/navigation'

import { z } from 'zod'
import { SplitBoardV2 } from '@/components/receipt-split/SplitBoardV2'
import { ExpenseShell } from '@/components/expenses/ExpenseShell'
import { getTranslations } from 'next-intl/server'
import { guardSplit, readSplit, SPLIT_PATH } from '@/lib/receipt-split/server'
import { readLegacyReceiptLines } from '@/lib/receipt-split/legacy.server'
import { LegacyReceiptCopy } from '@/components/receipt-split/LegacyReceiptCopy'

export const dynamic = 'force-dynamic'

export default async function ExpenseReceiptReviewPage({
  params,
}: {
  params: Promise<{ draftId: string }>
}) {
  const { draftId } = await params
  if (!z.string().uuid().safeParse(draftId).success) notFound()
  const user = await guardSplit(SPLIT_PATH + '/' + draftId)
  const t = await getTranslations('teskeid.receiptSplit')
  const receipt = await readSplit(user.id, draftId).catch(() => null)
  const legacy = receipt ? null : await readLegacyReceiptLines(user.id, draftId).catch(() => null)
  if (!receipt && !legacy) notFound()
  return (
    <ExpenseShell
      title={t('title')}
      homeLabel={t('home')}
      backHref={SPLIT_PATH}
      backLabel={t('back')}
      closedTestingFeature="splitta-reikningnum"
    >
      {receipt ? <SplitBoardV2 view={receipt} /> : <LegacyReceiptCopy id={draftId} version={legacy!.version} />}
    </ExpenseShell>
  )
}
