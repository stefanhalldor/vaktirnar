'use client'

import { useTranslations } from 'next-intl'

export type ExpenseTranslationValues = Record<string, string | number | Date>

export function useExpenseTranslations() {
  const t = useTranslations()
  return (key: string, values?: ExpenseTranslationValues) =>
    t(`teskeid.expenses.${key}` as never, values as never)
}
