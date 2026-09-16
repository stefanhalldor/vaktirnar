import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { SplitImport } from '@/components/receipt-split/SplitImport'
import { ExpenseShell } from '@/components/expenses/ExpenseShell'
import { guardSplit, listSplits } from '@/lib/receipt-split/server'

export const dynamic = 'force-dynamic'
export default async function ExpenseReceiptUploadPage() {
  const user = await guardSplit()
  const t = await getTranslations('teskeid.receiptSplit')
  const splits = await listSplits(user.id).catch(() => null)
  return (
    <ExpenseShell
      title={t('title')}
      homeLabel={t('home')}
      backHref="/auth-mvp/heim"
      backLabel={t('back')}
      closedTestingFeature="splitta-reikningnum"
    >
      <div className="space-y-6">
        <section className="space-y-3">
          <h2 className="font-semibold">{t('yourSplits')}</h2>
          {splits === null ? <p role="alert">{t('loadFailed')}</p> : splits.length === 0 ? <p>{t('empty')}</p> : splits.map(split =>
            <Link key={split.id} href={'/auth-mvp/splitta-reikningnum/' + split.id} className="flex min-h-11 items-center rounded-xl border border-border p-3 font-medium text-primary">{split.title || t('review')}</Link>
          )}
        </section>
        <SplitImport />
      </div>
    </ExpenseShell>
  )
}
