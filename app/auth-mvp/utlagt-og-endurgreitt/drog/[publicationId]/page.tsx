import { notFound, redirect } from 'next/navigation'

import { ExpenseSharedDraftDetail } from '@/components/expenses/ExpenseSharedDraftDetail'
import { ExpenseDeleteControl } from '@/components/expenses/ExpenseDeleteControl'
import { ExpenseShell } from '@/components/expenses/ExpenseShell'
import { getExpenseTranslations } from '@/components/expenses/i18n.server'
import { guardExpenseSession } from '@/lib/expenses/guard'
import {
  getExpenseCreationDraftDeleteCapability,
  getExpensePrivateDraft,
  getExpenseSharedDraftDetail,
  getExpenseSharedDraftManagementTarget,
} from '@/lib/expenses/repository.server'

export default async function ExpenseSharedDraftPage({
  params,
}: {
  params: Promise<{ publicationId: string }>
}) {
  const [{ publicationId }, { user }, t] = await Promise.all([
    params,
    guardExpenseSession(),
    getExpenseTranslations(),
  ])
  const [detail, managementTarget] = await Promise.all([
    getExpenseSharedDraftDetail(user.id, publicationId),
    getExpenseSharedDraftManagementTarget(user.id, publicationId),
  ])
  if (managementTarget.status === 'ready'
    && managementTarget.viewerRole === 'author'
    && managementTarget.detailTarget.kind === 'private_draft') {
    const draft = await getExpensePrivateDraft(
      user.id,
      managementTarget.detailTarget.draftId,
    ).catch(() => null)
    const encodedDraftId = encodeURIComponent(managementTarget.detailTarget.draftId)
    if (draft?.contextType === 'one_off') {
      redirect(`/auth-mvp/utlagt-og-endurgreitt/nytt?draft=${encodedDraftId}`)
    }
    if (draft?.contextType === 'group' && draft.groupId) {
      redirect(`/auth-mvp/utlagt-og-endurgreitt/hopar/${encodeURIComponent(draft.groupId)}/nytt-utgjald?draft=${encodedDraftId}`)
    }
    if (draft?.contextType === 'edit' && draft.expenseId) {
      redirect(`/auth-mvp/utlagt-og-endurgreitt/utgjold/${encodeURIComponent(draft.expenseId)}/breyta?step=${draft.currentStep}&draft=${encodedDraftId}`)
    }
    if (!draft) {
      const capability = await getExpenseCreationDraftDeleteCapability(
        user.id,
        managementTarget.detailTarget.draftId,
      )
      if (capability.status === 'ready' && capability.contextType === 'one_off') {
        redirect(`/auth-mvp/utlagt-og-endurgreitt/nytt?draft=${encodedDraftId}`)
      }
      if (capability.status === 'ready'
        && capability.contextType === 'group'
        && capability.groupId) {
        redirect(`/auth-mvp/utlagt-og-endurgreitt/hopar/${encodeURIComponent(capability.groupId)}/nytt-utgjald?draft=${encodedDraftId}`)
      }
    }
  }
  if (detail.status === 'ready' && detail.viewerRole === 'author') {
    const statusHref = `/auth-mvp/utlagt-og-endurgreitt/drog/${encodeURIComponent(publicationId)}`
    return (
      <ExpenseShell
        title={detail.title}
        homeLabel={t('homeLabel')}
        backHref="/auth-mvp/utlagt-og-endurgreitt"
        backLabel={t('back')}
        closedTestingFeature="utlagt-og-endurgreitt"
      >
        <section role="status" className="space-y-2 border-y border-border py-5">
          <h2 className="text-base font-semibold">
            {t('sharedDraftDetail.managementUnavailableHeading')}
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {t('sharedDraftDetail.managementUnavailableBody')}
          </p>
        </section>
        <div className="mt-6">
          <ExpenseDeleteControl
            target={{ kind: 'creation_draft', capability: { status: 'unavailable' } }}
            creatorKnown
            statusHref={statusHref}
          />
        </div>
      </ExpenseShell>
    )
  }
  if (detail.status !== 'ready') notFound()

  return (
    <ExpenseShell
      title={detail.title}
      homeLabel={t('homeLabel')}
      backHref="/auth-mvp/utlagt-og-endurgreitt"
      backLabel={t('back')}
      closedTestingFeature="utlagt-og-endurgreitt"
    >
      <ExpenseSharedDraftDetail draft={detail} />
    </ExpenseShell>
  )
}
