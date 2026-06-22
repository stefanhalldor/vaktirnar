import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { guardTeskeidSession } from '@/lib/auth/guard'
import { guardFeatureAccess } from '@/lib/loans/guard'
import { getRelationship, getRelationshipLoanActivity } from '@/lib/relationships/actions'
import { TagSelectForm } from '@/components/tengsl/TagSelectForm'
import { RelationshipDetailsForm } from '@/components/tengsl/RelationshipDetailsForm'
import { ALLOWED_TAGS, type RelationshipTag } from '@/lib/relationships/types'

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const d = new Date(year, month - 1, day)
  return d.toLocaleDateString('is', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default async function TengslDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { user } = await guardTeskeidSession()
  await guardFeatureAccess(user.email!, 'tengsl')
  const t = await getTranslations('teskeid.stillingar.tengsl')

  const relationship = await getRelationship(user.id, id)
  if (!relationship) notFound()

  // Dynamic activity lookup — does not rely on relationship_sources
  const loanActivity = await getRelationshipLoanActivity(user.id, relationship)

  const displayName =
    relationship.private_display_name ??
    relationship.counterpart_display_name ??
    relationship.email_canonical ??
    id

  const currentTag =
    (relationship.tags.find((tag) =>
      (ALLOWED_TAGS as readonly string[]).includes(tag),
    ) as RelationshipTag | undefined) ?? null

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

        <TagSelectForm relationshipId={id} currentTag={currentTag} />

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-foreground">{t('minarNótur')}</h2>
          <RelationshipDetailsForm
            relationshipId={id}
            initialNote={relationship.note}
            initialPrivateDisplayName={relationship.private_display_name}
          />
        </section>

        {loanActivity.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-foreground">{t('sourceLoans')}</h2>
            <ul className="flex flex-col gap-2">
              {loanActivity.map((loan) => (
                <li key={loan.id} className="rounded-xl border border-border bg-card px-4 py-3">
                  <p className="text-sm font-medium text-foreground">{loan.item_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t('loanedPrefix')} {formatDate(loan.loaned_at)}
                    {loan.returned_at && ` · ${t('loanReturned')}`}
                  </p>
                  <Link
                    href={`/auth-mvp/lanad-og-skilad/${loan.id}`}
                    className="text-xs text-primary underline hover:opacity-80 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded mt-1 inline-block"
                  >
                    {t('openLoan')}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

      </main>
    </div>
  )
}
