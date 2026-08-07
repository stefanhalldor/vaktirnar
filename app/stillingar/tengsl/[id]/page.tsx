import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { ChevronRight, Package, Receipt } from 'lucide-react'
import { guardTeskeidSession } from '@/lib/auth/guard'
import { checkFeatureAccess, guardFeatureAccess } from '@/lib/loans/guard'
import { getRelationship, getRelationshipLoanActivity } from '@/lib/relationships/actions'
import { getRelationshipExpenseContexts } from '@/lib/expenses/relationship-contexts.server'
import { RelationshipLabelsForm } from '@/components/tengsl/RelationshipLabelsForm'
import { RelationshipDetailsForm } from '@/components/tengsl/RelationshipDetailsForm'
import { getRelationshipLabelState } from '@/lib/relationships/repository-v2.server'
import { formatDateOnly } from '@/lib/date-format'

export default async function TengslDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { user } = await guardTeskeidSession()
  await guardFeatureAccess(user.email!, 'tengsl')
  const [t, locale] = await Promise.all([
    getTranslations('teskeid.stillingar.tengsl'),
    getLocale(),
  ])

  const [relationship, labelState, canUseExpenses] = await Promise.all([
    getRelationship(user.id, id),
    getRelationshipLabelState(user.id),
    checkFeatureAccess(user.id, user.email!, 'utlagt-og-endurgreitt').catch(() => false),
  ])
  if (!relationship) notFound()

  // Dynamic activity lookups do not rely on polymorphic relationship_sources.
  // Expense contexts require a confirmed counterpart and shared active membership.
  const [loanActivity, expenseContexts] = await Promise.all([
    getRelationshipLoanActivity(user.id, relationship),
    canUseExpenses && relationship.counterpart_user_id
      ? getRelationshipExpenseContexts(user.id, relationship.counterpart_user_id).catch(() => [])
      : Promise.resolve([]),
  ])

  const displayName =
    relationship.private_display_name ??
    relationship.counterpart_display_name ??
    relationship.email_canonical ??
    id
  const hasSharedActivity = expenseContexts.length > 0 || loanActivity.length > 0

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-lg mx-auto px-4 pt-8 pb-10 flex flex-col gap-6">

        <Link
          href="/stillingar/tengsl"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded self-start"
        >
          {t('backToList')}
        </Link>

        <div>
          <h1 className="text-lg font-semibold text-primary">{displayName}</h1>
          {/* Show counterpart's Teskeið display name when we have a confirmed user ID
              and the private_display_name is different (or not set). */}
          {relationship.counterpart_display_name &&
            relationship.counterpart_display_name !== relationship.private_display_name && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {t('teskeidName')}: {relationship.counterpart_display_name}
            </p>
          )}
          {relationship.email_canonical && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {relationship.email_canonical}
            </p>
          )}
        </div>

        {hasSharedActivity && (
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">{t('sharedActivity')}</h2>
            <div className="divide-y divide-border rounded-xl border border-border bg-card">
              {expenseContexts.length > 0 ? (
                <div className="p-4">
                  <h3 className="text-sm font-medium text-foreground">{t('sourceExpenses')}</h3>
                  <div className="mt-2 divide-y divide-border">
                    {expenseContexts.map((context) => (
                      <Link
                        key={context.id}
                        href={`/auth-mvp/utlagt-og-endurgreitt/hopar/${context.id}`}
                        className="flex min-h-14 items-center gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-lg">
                          {context.emoji || <Receipt size={18} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block break-words text-sm font-medium text-foreground">{context.name}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {t(context.kind === 'group' ? 'expenseGroup' : 'expenseOneOff')}
                          </span>
                        </span>
                        <ChevronRight aria-hidden size={18} className="shrink-0 text-muted-foreground" />
                      </Link>
                    ))}
                  </div>
                  <Link
                    href="/auth-mvp/utlagt-og-endurgreitt"
                    className="mt-2 inline-flex min-h-10 items-center rounded text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {t('openExpenses')}
                  </Link>
                </div>
              ) : null}

              {loanActivity.length > 0 ? (
                <div className="p-4">
                  <h3 className="text-sm font-medium text-foreground">{t('sourceLoans')}</h3>
                  <div className="mt-2 divide-y divide-border">
                    {loanActivity.map((loan) => (
                      <Link
                        key={loan.id}
                        href={`/auth-mvp/lanad-og-skilad/${loan.id}`}
                        className="flex min-h-14 items-center gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
                          <Package size={18} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block break-words text-sm font-medium text-foreground">{loan.item_name}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {t('loanedPrefix')} {formatDateOnly(loan.loaned_at, locale)}
                            {loan.returned_at && ` · ${t('loanReturned')}`}
                          </span>
                        </span>
                        <ChevronRight aria-hidden size={18} className="shrink-0 text-muted-foreground" />
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-foreground">{t('minarNótur')}</h2>
          <RelationshipDetailsForm
            relationshipId={id}
            initialNote={relationship.note}
            initialPrivateDisplayName={relationship.private_display_name}
          />
        </section>

        <RelationshipLabelsForm
          relationshipId={id}
          labels={labelState.labels}
          assignedLabelIds={labelState.relationshipLabelIds[id] ?? []}
          available={labelState.available}
        />

      </main>
    </div>
  )
}
