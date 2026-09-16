import { getLocale, getTranslations } from 'next-intl/server'
import { SplitImport } from '@/components/receipt-split/SplitImport'
import { SplitList } from '@/components/receipt-split/SplitList'
import { ExpenseShell } from '@/components/expenses/ExpenseShell'
import { guardSplit, listSplits } from '@/lib/receipt-split/server'

export const dynamic = 'force-dynamic'
export default async function ExpenseReceiptUploadPage() {
  const user = await guardSplit()
  const t = await getTranslations('teskeid.receiptSplit')
  const locale = await getLocale()
  let listFailed = false
  const splits = await listSplits(user.id).catch(() => {
    listFailed = true
    return []
  })
  const sharingSplits = splits.filter((split) => split.state === 'sharing')
  const formattedDates = Object.fromEntries(sharingSplits.map(split => [split.id,
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(split.incurredOn + 'T00:00:00Z'))]))
  return (
    <ExpenseShell
      title={t('title')}
      homeLabel={t('home')}
      backHref="/auth-mvp/heim"
      backLabel={t('back')}
    >
      <div className="space-y-6">
        {listFailed && <p role="alert" className="text-sm text-destructive">{t('loadFailed')}</p>}
        {sharingSplits.length > 0 && <SplitList splits={sharingSplits} formattedDates={formattedDates} />}
        <SplitImport />
      </div>
    </ExpenseShell>
  )
}
