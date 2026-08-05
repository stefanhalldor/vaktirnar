'use client'

import { useTranslations } from 'next-intl'

export type BookkeepingTranslationValues = Record<string, string | number | Date>

export function useBookkeepingTranslations() {
  const t = useTranslations()
  return (key: string, values?: BookkeepingTranslationValues) =>
    t(`teskeid.bookkeeping.${key}` as never, values as never)
}
