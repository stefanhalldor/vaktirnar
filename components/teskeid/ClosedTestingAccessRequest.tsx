'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ClosedTestingBanner } from './ClosedTestingBanner'
import { TeskeidActionButton } from './TeskeidActionButton'
import { requestClosedTestingAccess } from '@/lib/teskeid/featureAccessRequest.actions'
import type { RequestableClosedTestingFeatureId } from '@/lib/teskeid/featureAccessRequest.contracts'

interface ClosedTestingAccessRequestProps {
  featureId: RequestableClosedTestingFeatureId
  reason?: 'participant'
  className?: string
}

export function ClosedTestingAccessRequest({
  featureId,
  reason,
  className,
}: ClosedTestingAccessRequestProps) {
  const t = useTranslations('teskeid.closedTestingAccess')
  const router = useRouter()
  const submittingRef = useRef(false)
  const [status, setStatus] = useState<'idle' | 'requested' | 'error'>('idle')
  const [isPending, startTransition] = useTransition()
  const featureName = t(`features.${featureId}`)

  function requestAccess() {
    if (submittingRef.current || isPending || status === 'requested') return
    submittingRef.current = true
    setStatus('idle')
    startTransition(async () => {
      try {
        const result = await requestClosedTestingAccess({ feature_id: featureId })
        if (!result.ok) {
          setStatus('error')
          return
        }
        if (result.status === 'already_enabled') {
          router.refresh()
          return
        }
        setStatus('requested')
      } catch {
        setStatus('error')
      } finally {
        submittingRef.current = false
      }
    })
  }

  return (
    <ClosedTestingBanner
      className={className}
      body={t(reason === 'participant' ? 'participantBody' : 'body', { feature: featureName })}
      action={status === 'requested' ? (
        <p role="status" className="font-medium leading-relaxed text-foreground">
          {t('requested')}
        </p>
      ) : (
        <div>
          <TeskeidActionButton
            type="button"
            variant="secondary"
            pending={isPending}
            onClick={requestAccess}
            className="w-full sm:w-auto"
          >
            {isPending ? t('requesting') : t('request')}
          </TeskeidActionButton>
          {status === 'error' ? (
            <p role="alert" className="mt-2 leading-relaxed text-destructive">
              {t('error')}
            </p>
          ) : null}
        </div>
      )}
    />
  )
}
