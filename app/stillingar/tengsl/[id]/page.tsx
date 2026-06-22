import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { guardTeskeidSession } from '@/lib/auth/guard'
import { guardFeatureAccess } from '@/lib/loans/guard'
import { getRelationship } from '@/lib/relationships/actions'
import { getAdmin } from '@/lib/supabase/admin'
import { TagSelectForm } from '@/components/tengsl/TagSelectForm'
import { ALLOWED_TAGS, type RelationshipTag } from '@/lib/relationships/types'
import type { LoanItem } from '@/lib/loans/types'

type LoanSourceView = {
  id: string
  item_name: string
  loaned_at: string
}

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

  // Cross-reference source loan IDs with loans the user can actually access.
  // relationship_sources has no FK — we must verify access independently.
  let loanSources: LoanSourceView[] = []
  if (relationship.loan_source_ids.length > 0) {
    const admin = getAdmin()
    const { data } = await admin.rpc('get_my_loans', { p_actor_id: user.id })
    if (data) {
      const myLoans = data as LoanItem[]
      const myLoanMap = new Map(myLoans.map((l) => [l.id, l]))
      loanSources = relationship.loan_source_ids
        .filter((sid) => myLoanMap.has(sid))
        .map((sid) => {
          const l = myLoanMap.get(sid)!
          return { id: sid, item_name: l.item_name, loaned_at: l.loaned_at }
        })
        .sort((a, b) => b.loaned_at.localeCompare(a.loaned_at))
    }
  }

  const displayName = relationship.private_display_name ?? relationship.email_canonical ?? id

  // Determine current category tag (first match against allowlist, or null)
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

        <h1 className="text-lg font-semibold text-primary">{displayName}</h1>

        <TagSelectForm relationshipId={id} currentTag={currentTag} />

        {loanSources.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-foreground">{t('sourceLoans')}</h2>
            <ul className="flex flex-col gap-2">
              {loanSources.map((src) => (
                <li key={src.id} className="rounded-xl border border-border bg-card px-4 py-3">
                  <p className="text-sm font-medium text-foreground">{src.item_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t('loanedPrefix')} {formatDate(src.loaned_at)}
                  </p>
                  <Link
                    href={`/auth-mvp/lanad-og-skilad/${src.id}`}
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
