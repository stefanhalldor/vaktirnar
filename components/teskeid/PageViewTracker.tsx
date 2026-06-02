'use client'

import { useEffect } from 'react'
import { trackEvent } from '@/lib/teskeid/analytics'

export function PageViewTracker({ ideaId }: { ideaId?: string }) {
  useEffect(() => {
    trackEvent('page_view', ideaId ? { idea_id: ideaId } : undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}
