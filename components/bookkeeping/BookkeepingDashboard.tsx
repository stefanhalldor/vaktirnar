'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useLocale } from 'next-intl'
import { Building2, ChevronRight, Plus } from 'lucide-react'
import { formatDateOnly } from '@/lib/date-format'
import type { BookkeepingDashboardView } from '@/lib/bookkeeping/types'
import {
  BookkeepingEntityForm,
  BookkeepingVatRegistrationForm,
} from './BookkeepingEntityForm'
import {
  BookkeepingPeriodForm,
  type BookkeepingPeriodRegistrationOption,
} from './BookkeepingPeriodForm'
import { useBookkeepingTranslations } from './i18n.client'
import { bookkeepingSectionClass } from './ui'

export function BookkeepingDashboard({
  dashboard,
  referenceDate,
}: {
  dashboard: BookkeepingDashboardView
  referenceDate: string
}) {
  const t = useBookkeepingTranslations()
  const locale = useLocale()
  const [openingPeriodId, setOpeningPeriodId] = useState<string | null>(null)
  const registrations: BookkeepingPeriodRegistrationOption[] = dashboard.entities.flatMap(
    ({ entity, registrations: entityRegistrations }) => entityRegistrations
      .filter((registration) => registration.active)
      .map((registration) => ({
        id: registration.id,
        entityId: entity.id,
        entityName: entity.displayName,
        vatNumber: registration.vatNumber,
        label: registration.label,
        filingMethod: registration.filingMethod,
        detailsConfirmed: registration.detailsConfirmed,
      })),
  )

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-base font-semibold">{t('dashboard.workbookTitle')}</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{t('intro')}</p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{t('notAccountingSystem')}</p>
      </div>

      {dashboard.entities.length === 0 ? (
        <section className={bookkeepingSectionClass} aria-labelledby="bookkeeping-empty-title">
          <div className="mb-5 flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Building2 aria-hidden size={20} />
            </span>
            <div className="min-w-0">
              <h2 id="bookkeeping-empty-title" className="text-base font-semibold">
                {t('dashboard.emptyTitle')}
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{t('dashboard.emptyBody')}</p>
            </div>
          </div>
          <BookkeepingEntityForm />
        </section>
      ) : (
        <>
          <section aria-labelledby="bookkeeping-entities-title">
            <h2 id="bookkeeping-entities-title" className="mb-3 text-base font-semibold">
              {t('dashboard.workspaces')}
            </h2>
            <div className="divide-y divide-border border-y border-border">
              {dashboard.entities.map(({ entity, registrations: entityRegistrations, periods }) => (
                <article key={entity.id} className="py-5">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Building2 aria-hidden size={19} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-semibold">{entity.displayName}</h3>
                      {!entity.detailsConfirmed ? (
                        <p className="mt-0.5 text-xs text-amber-800">{t('dashboard.entityUnconfirmed')}</p>
                      ) : null}
                    </div>
                  </div>

                  {entityRegistrations.length === 0 ? (
                    <p className="mt-4 text-sm text-amber-800">{t('dashboard.noRegistrations')}</p>
                  ) : (
                    <div className="mt-4 space-y-5 pl-0 sm:pl-[3.25rem]">
                      {entityRegistrations.map((registration) => {
                        const registrationPeriods = periods.filter(
                          ({ period }) => period.vatRegistrationId === registration.id,
                        )
                        return (
                          <section key={registration.id} aria-labelledby={`registration-${registration.id}`}>
                            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                              <h4 id={`registration-${registration.id}`} className="text-sm font-medium">
                                {registration.label || t('dashboard.vatRegistrations')}
                              </h4>
                              <span className="text-xs text-muted-foreground">
                                {t('period.vatNumber', { number: registration.vatNumber })}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {t(`filingMethods.${registration.filingMethod}`)}
                              {!registration.active ? ` · ${t('dashboard.inactiveRegistration')}` : ''}
                            </p>

                            {registrationPeriods.length === 0 ? (
                              <p className="mt-3 border-t border-border pt-3 text-sm text-muted-foreground">
                                {t('dashboard.noPeriods')}
                              </p>
                            ) : (
                              <div className="mt-3 divide-y divide-border border-y border-border">
                                {registrationPeriods.map(({ period }) => {
                                  const opening = openingPeriodId === period.id
                                  return (
                                    <Link
                                      key={period.id}
                                      href={`/auth-mvp/bokhaldid/timabil/${period.id}`}
                                      aria-busy={opening}
                                      onClick={(event) => {
                                        if (
                                          event.button === 0
                                          && !event.metaKey
                                          && !event.ctrlKey
                                          && !event.shiftKey
                                          && !event.altKey
                                        ) {
                                          setOpeningPeriodId(period.id)
                                        }
                                      }}
                                      className="flex min-h-14 items-center gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                    >
                                      <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-medium">
                                          {formatDateOnly(period.startsOn, locale)} –{' '}
                                          {formatDateOnly(period.endsOn, locale)}
                                        </span>
                                        <span className="mt-1 block text-xs text-muted-foreground">
                                          {t(`periodStates.${period.state}`)}
                                          {period.dueOn
                                            ? ` · ${t('period.dueOn', {
                                                date: formatDateOnly(period.dueOn, locale),
                                              })}`
                                            : ''}
                                        </span>
                                      </span>
                                      <span className="shrink-0 text-xs font-medium text-primary">
                                        {opening ? t('dashboard.openingPeriod') : t('common.open')}
                                      </span>
                                      <ChevronRight aria-hidden size={18} className="shrink-0 text-muted-foreground" />
                                    </Link>
                                  )
                                })}
                              </div>
                            )}
                          </section>
                        )
                      })}
                    </div>
                  )}

                  <details className="mt-4 border-t border-border pt-3 sm:ml-[3.25rem]">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                      <Plus aria-hidden size={17} />
                      {t('dashboard.newVatRegistration')}
                    </summary>
                    <div className="pt-4">
                      <BookkeepingVatRegistrationForm
                        key={`bookkeeping-registration-form-${entityRegistrations.length}`}
                        entityId={entity.id}
                      />
                    </div>
                  </details>
                </article>
              ))}
            </div>
          </section>

          {registrations.length > 0 ? (
            <section className={bookkeepingSectionClass} aria-labelledby="bookkeeping-new-period-title">
              <BookkeepingPeriodForm registrations={registrations} referenceDate={referenceDate} />
            </section>
          ) : null}

          <details className="group border-y border-border py-4">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              <Plus aria-hidden size={18} />
              {t('dashboard.anotherWorkspace')}
            </summary>
            <div className="pt-5">
              <BookkeepingEntityForm key={`bookkeeping-entity-form-${dashboard.entities.length}`} />
            </div>
          </details>
        </>
      )}
    </div>
  )
}
