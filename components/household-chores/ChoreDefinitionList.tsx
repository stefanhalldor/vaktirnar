import Link from 'next/link'
import { ChevronRight, Plus } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import type { HouseholdChoreCircleView } from '@/lib/household-chores/contracts'
import {
  householdChoreDefinitionPath,
  householdChoreNewDefinitionPath,
} from '@/lib/household-chores/paths'

export async function ChoreDefinitionList({
  circleId,
  view,
}: {
  circleId: string
  view: HouseholdChoreCircleView
}) {
  const t = await getTranslations('teskeid.householdChores')
  const active = view.definitions.filter((definition) => (
    !('status' in definition) || definition.status === 'active'
  ))
  const archived = view.viewerType === 'member'
    ? view.definitions.filter((definition) => definition.status === 'archived')
    : []

  function rows(definitions: typeof active) {
    return (
      <div className="divide-y divide-border border-y border-border">
        {definitions.map((definition) => (
          <Link
            key={definition.definitionId}
            href={householdChoreDefinitionPath(circleId, definition.definitionId)}
            className="flex min-h-16 items-center gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <span className="min-w-0 flex-1">
              <span className="block break-words text-sm font-medium">{definition.title}</span>
              {definition.description ? (
                <span className="mt-0.5 line-clamp-2 block break-words text-xs leading-5 text-muted-foreground">
                  {definition.description}
                </span>
              ) : null}
            </span>
            <ChevronRight aria-hidden size={18} className="shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {view.viewerType === 'member' ? (
        <Link
          href={householdChoreNewDefinitionPath(circleId)}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Plus aria-hidden size={18} />
          {t('definitions.new')}
        </Link>
      ) : null}

      <section aria-labelledby="active-definitions-heading">
        <h2 id="active-definitions-heading" className="mb-2 text-sm font-semibold">
          {t('definitions.activeHeading')}
        </h2>
        {active.length === 0 ? (
          <p className="border-y border-border py-5 text-sm text-muted-foreground">
            {t('definitions.empty')}
          </p>
        ) : rows(active)}
      </section>

      {view.viewerType === 'member' && archived.length > 0 ? (
        <section aria-labelledby="archived-definitions-heading">
          <h2 id="archived-definitions-heading" className="mb-2 text-sm font-semibold">
            {t('definitions.archivedHeading')}
          </h2>
          {rows(archived)}
        </section>
      ) : null}
    </div>
  )
}
