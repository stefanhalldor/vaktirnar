import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { guardTeskeidSession } from '@/lib/auth/guard'
import { guardFeatureAccess } from '@/lib/loans/guard'
import { getRelationshipDirectory } from '@/lib/relationships/actions'
import type { RelationshipListItem } from '@/lib/relationships/actions'

export default async function TengslPage() {
  const { user } = await guardTeskeidSession()
  await guardFeatureAccess(user.email!, 'tengsl')
  const t = await getTranslations('teskeid.stillingar.tengsl')

  const items: RelationshipListItem[] = await getRelationshipDirectory(user.id, user.email!)

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

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('empty')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/stillingar/tengsl/${item.id}`}
                  className="block rounded-xl border border-border bg-card px-4 py-3 hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <p className="text-sm font-medium text-foreground">
                    {item.private_display_name ?? item.counterpart_display_name ?? item.email_canonical ?? t('unknownContact')}
                  </p>
                  {item.tags.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {item.tags.map((tag) => t(`tag${tag.charAt(0).toUpperCase() + tag.slice(1)}` as Parameters<typeof t>[0])).join(', ')}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}

      </main>
    </div>
  )
}
