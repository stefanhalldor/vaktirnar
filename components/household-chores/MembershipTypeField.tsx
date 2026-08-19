'use client'

import { useTranslations } from 'next-intl'
import type { HouseholdChoreMembershipType } from '@/lib/household-chores/contracts'

export function MembershipTypeField({
  idPrefix,
  value,
  onChange,
  disabled = false,
}: {
  idPrefix: string
  value: HouseholdChoreMembershipType | null
  onChange: (value: HouseholdChoreMembershipType) => void
  disabled?: boolean
}) {
  const t = useTranslations('teskeid.householdChores')

  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-2">
      <legend className="text-sm font-medium">{t('invitation.accessHeading')}</legend>
      <div className="grid min-w-0 gap-2 sm:grid-cols-2">
        {(['member', 'child'] as const).map((membershipType) => (
          <label
            key={membershipType}
            htmlFor={`${idPrefix}-${membershipType}`}
            className="flex min-h-12 min-w-0 cursor-pointer items-start gap-3 rounded-xl border border-border bg-background p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5 focus-within:ring-2 focus-within:ring-ring"
          >
            <input
              id={`${idPrefix}-${membershipType}`}
              name={`${idPrefix}-membership-type`}
              type="radio"
              value={membershipType}
              checked={value === membershipType}
              onChange={() => onChange(membershipType)}
              className="mt-0.5 size-4 shrink-0 accent-primary"
            />
            <span className="min-w-0">
              <span className="block break-words text-sm font-semibold">
                {t(`membershipType.${membershipType}`)}
              </span>
              <span className="mt-1 block break-words text-xs leading-5 text-muted-foreground">
                {t(membershipType === 'member' ? 'manage.memberSummary' : 'manage.childSummary')}
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
