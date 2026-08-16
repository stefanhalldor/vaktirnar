import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { EventShell } from '../../../EventShell'

export default async function InvitationNotFound() {
  const t = await getTranslations('teskeid.events')
  return (
    <EventShell
      title={t('invitation.notFoundTitle')}
      homeLabel={t('homeLabel')}
      backHref="/auth-mvp/heim"
      backLabel={t('homeLabel')}
    >
      <div className="space-y-5" role="alert">
        <p className="text-sm leading-6 text-muted-foreground">
          {t('invitation.notFoundDescription')}
        </p>
        <Link
          href="/auth-mvp/heim"
          className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t('homeLabel')}
        </Link>
      </div>
    </EventShell>
  )
}
