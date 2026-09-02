import {
  BadgeCheck,
  CircleCheckBig,
  FilePenLine,
  RotateCcw,
  Save,
  WalletCards,
} from 'lucide-react'
import { ExpenseShell } from '@/components/expenses/ExpenseShell'
import { getExpenseTranslations } from '@/components/expenses/i18n.server'
import { guardExpenseAccess } from '@/lib/expenses/guard'

export default async function ExpenseGuidePage() {
  const [, t] = await Promise.all([
    guardExpenseAccess(),
    getExpenseTranslations(),
  ])

  const lifecycle = [
    { key: 'draft', icon: FilePenLine },
    { key: 'confirmed', icon: BadgeCheck },
    { key: 'settlement', icon: WalletCards },
    { key: 'done', icon: CircleCheckBig },
  ] as const

  return (
    <ExpenseShell
      title={t('guide.title')}
      homeLabel={t('homeLabel')}
      backHref="/auth-mvp/utlagt-og-endurgreitt"
      backLabel={t('back')}
      closedTestingFeature="utlagt-og-endurgreitt"
    >
      <article className="space-y-8">
        <p className="text-sm leading-6 text-muted-foreground">{t('guide.intro')}</p>

        <section aria-labelledby="expense-guide-lifecycle" className="space-y-4">
          <h2 id="expense-guide-lifecycle" className="text-base font-semibold">
            {t('guide.lifecycleTitle')}
          </h2>
          <ol className="overflow-hidden rounded-xl border border-border bg-card">
            {lifecycle.map(({ key, icon: Icon }, index) => (
              <li
                key={key}
                className="relative grid min-w-0 grid-cols-[2.75rem_minmax(0,1fr)] gap-3 px-4 py-4"
              >
                {index < lifecycle.length - 1 ? (
                  <span
                    aria-hidden
                    className="absolute bottom-0 left-[2.35rem] top-[3.25rem] border-l-2 border-dashed border-primary/25"
                  />
                ) : null}
                <span
                  aria-hidden
                  className="relative z-10 flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary"
                >
                  <Icon size={20} />
                </span>
                <span className="min-w-0 pt-0.5">
                  <strong className="block text-sm">{t(`guide.lifecycle.${key}.title`)}</strong>
                  <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                    {t(`guide.lifecycle.${key}.body`)}
                  </span>
                  {key === 'draft' ? (
                    <span className="mt-3 block space-y-1 text-sm">
                      <span className="block font-medium">{t('guide.lifecycle.draft.private')}</span>
                      <span className="block font-medium">{t('guide.lifecycle.draft.shared')}</span>
                    </span>
                  ) : null}
                  {key === 'confirmed' ? (
                    <span className="mt-2 block text-sm leading-6 text-muted-foreground">
                      {t('guide.lifecycle.confirmed.editBody')}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="expense-guide-exit" className="space-y-4">
          <h2 id="expense-guide-exit" className="text-base font-semibold">{t('guide.exitTitle')}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border p-4">
              <RotateCcw aria-hidden size={20} className="text-muted-foreground" />
              <h3 className="mt-3 text-sm font-semibold">{t('guide.discard.title')}</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{t('guide.discard.body')}</p>
            </div>
            <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
              <Save aria-hidden size={20} className="text-primary" />
              <h3 className="mt-3 text-sm font-semibold">{t('guide.save.title')}</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{t('guide.save.body')}</p>
            </div>
          </div>
        </section>

        <aside aria-labelledby="expense-guide-beta" className="border-t border-border pt-5">
          <h2 id="expense-guide-beta" className="text-sm font-semibold">{t('guide.betaTitle')}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('guide.betaBody')}</p>
        </aside>
      </article>
    </ExpenseShell>
  )
}
