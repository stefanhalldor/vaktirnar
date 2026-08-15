'use client'

import { useTranslations } from 'next-intl'
import { BookingErrorState } from '@/components/bookings/BookingErrorState'

export default function BookingWorkflowEditorError({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('bookings')
  return (
    <BookingErrorState
      reset={reset}
      providerHref="/auth-mvp/bokanir"
      backLabel={t('workflow.editor.back')}
      menuVariant="authenticated"
    />
  )
}
