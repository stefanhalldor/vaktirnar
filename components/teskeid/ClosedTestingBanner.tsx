'use client'

import type { ReactNode } from 'react'
import { FlaskConical } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

interface ClosedTestingBannerProps {
  body?: ReactNode
  feedbackHref?: string
  feedbackLabel?: string
  className?: string
}

export function ClosedTestingBanner({
  body,
  feedbackHref,
  feedbackLabel,
  className,
}: ClosedTestingBannerProps) {
  const t = useTranslations('teskeid.closedTesting')
  const title = t('title')
  const showFeedback = Boolean(feedbackHref && feedbackLabel)

  return (
    <aside
      aria-label={title}
      className={cn(
        'max-w-full overflow-hidden rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 text-xs',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5 text-foreground">
        <FlaskConical aria-hidden size={14} className="shrink-0 text-primary" />
        <p className="min-w-0 font-semibold leading-5">{title}</p>
      </div>
      <p className="mt-1 break-words leading-relaxed text-muted-foreground">
        {body ?? t('body')}
      </p>
      {showFeedback ? (
        <a
          href={feedbackHref}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex max-w-full break-words rounded text-primary underline underline-offset-2 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {feedbackLabel}
        </a>
      ) : null}
    </aside>
  )
}
