import Link from 'next/link'
import { notFound } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { ChoreDefinitionStatusV2 } from '@/components/household-chores/ChoreDefinitionStatusV2'
import { ChoreHistoryListV2 } from '@/components/household-chores/ChoreHistoryListV2'
import { ParticipantValueEditor } from '@/components/household-chores/ParticipantValueEditor'
import type { HouseholdChoreDefinitionDetailView } from '@/lib/household-chores/contracts'
import { guardHouseholdChoreAccess } from '@/lib/household-chores/guard'
import {
  householdChoreDefinitionPath,
  householdChoreDefinitionsPath,
  householdChoreEditDefinitionPath,
} from '@/lib/household-chores/paths'
import {
  HouseholdChoreV2RepositoryError,
  loadHouseholdChoreDefinitionDetailV3,
  loadHouseholdChoreDefinitionHistoryV2,
} from '@/lib/household-chores/repository-v2.server'
import {
  HouseholdChoreRepositoryError,
  loadHouseholdChoreDefinitionDetail,
} from '@/lib/household-chores/repository.server'
import { HouseholdChoreShell } from '../../../../HouseholdChoreShell'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export default async function HouseholdChoreDefinitionPage({
  params,
  searchParams,
}: {
  params: Promise<{ circleId: string; definitionId: string }>
  searchParams: Promise<{ cursorAt?: string; cursorId?: string }>
}) {
  noStore()
  const [{ circleId, definitionId }, query, { user }, t] = await Promise.all([
    params,
    searchParams,
    guardHouseholdChoreAccess(),
    getTranslations('teskeid.householdChores'),
  ])
  const cursor = query.cursorAt && query.cursorId
    && Number.isFinite(Date.parse(query.cursorAt)) && UUID.test(query.cursorId)
    ? { occurredAt: query.cursorAt, eventId: query.cursorId }
    : null

  let detail
  try {
    detail = await loadHouseholdChoreDefinitionDetailV3(user.id, circleId, definitionId)
  } catch (error) {
    if (error instanceof HouseholdChoreV2RepositoryError
      && (error.code === 'not_found' || error.code === 'not_allowed')) notFound()
    throw error
  }

  let history = detail.history
  let legacyMemberDetail: HouseholdChoreDefinitionDetailView | null = null
  try {
    const [pagedHistory, legacyDetail] = await Promise.all([
      cursor
        ? loadHouseholdChoreDefinitionHistoryV2(user.id, circleId, definitionId, {
            cursor,
            limit: 20,
          })
        : Promise.resolve(detail.history),
      detail.viewerType === 'member'
        ? loadHouseholdChoreDefinitionDetail(user.id, circleId, definitionId)
        : Promise.resolve(null),
    ])
    history = pagedHistory
    legacyMemberDetail = legacyDetail
  } catch (error) {
    if ((error instanceof HouseholdChoreV2RepositoryError
      || error instanceof HouseholdChoreRepositoryError)
      && (error.code === 'not_found' || error.code === 'not_allowed')) notFound()
    throw error
  }

  const definition = detail.definition
  const nextHref = history.nextCursor
    ? `${householdChoreDefinitionPath(circleId, definitionId)}?cursorAt=${encodeURIComponent(history.nextCursor.occurredAt)}&cursorId=${history.nextCursor.eventId}`
    : null

  return (
    <HouseholdChoreShell
      title={definition.title}
      homeLabel={t('homeLabel')}
      backHref={householdChoreDefinitionsPath(circleId)}
      backLabel={t('common.back')}
    >
      <div className="space-y-8">
        <section className="space-y-4 border-y border-border py-5">
          {definition.description ? (
            <div>
              <h2 className="text-sm font-semibold">{t('definition.description')}</h2>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{definition.description}</p>
            </div>
          ) : null}
          {definition.materials ? (
            <div>
              <h2 className="text-sm font-semibold">{t('definition.materials')}</h2>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{definition.materials}</p>
            </div>
          ) : null}
          {detail.viewerType === 'member' ? (
            <Link
              href={householdChoreEditDefinitionPath(circleId, definitionId)}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('definitions.edit')}
            </Link>
          ) : null}
        </section>

        <ChoreDefinitionStatusV2 circleId={circleId} detail={detail} />

        {detail.viewerType === 'member' && legacyMemberDetail ? (
          <ParticipantValueEditor
            circleId={circleId}
            definitionId={definitionId}
            definitionVersion={detail.definition.version}
            values={legacyMemberDetail.participantValues}
          />
        ) : null}

        <section aria-labelledby="definition-history-heading">
          <h2 id="definition-history-heading" className="mb-2 text-sm font-semibold">{t('history.definitionHeading')}</h2>
          <ChoreHistoryListV2 circleId={circleId} page={history} nextHref={nextHref} />
        </section>
      </div>
    </HouseholdChoreShell>
  )
}
