import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { guardTeskeidSession } from '@/lib/auth/guard'
import { guardFeatureAccess } from '@/lib/loans/guard'
import { getRelationshipDirectory } from '@/lib/relationships/actions'
import type { RelationshipListItem } from '@/lib/relationships/actions'
import { getRelationshipLabelState } from '@/lib/relationships/repository-v2.server'
import { RelationshipDirectoryClient } from '@/components/tengsl/RelationshipDirectoryClient'

export default async function TengslPage() {
  const { user } = await guardTeskeidSession()
  await guardFeatureAccess(user.email!, 'tengsl')
  const t = await getTranslations('teskeid.stillingar.tengsl')

  const [items, labelState]: [RelationshipListItem[], Awaited<ReturnType<typeof getRelationshipLabelState>>] = await Promise.all([
    getRelationshipDirectory(user.id, user.email!),
    getRelationshipLabelState(user.id),
  ])

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-lg mx-auto px-4 pt-8 pb-10 flex flex-col gap-6">

        <div className="flex items-center gap-3">
          <Link
            href="/auth-mvp/heim"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            {t('backToList')}
          </Link>
        </div>

        <h1 className="text-lg font-semibold text-primary">{t('title')}</h1>

        <RelationshipDirectoryClient
          items={items}
          labels={labelState.labels}
          relationshipLabelIds={labelState.relationshipLabelIds}
        />

      </main>
    </div>
  )
}
