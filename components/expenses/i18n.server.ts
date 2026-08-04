import 'server-only'

import { getTranslations } from 'next-intl/server'
import type { ExpenseTranslationValues } from './i18n.client'

export async function getExpenseTranslations() {
  const t = await getTranslations()
  return (key: string, values?: ExpenseTranslationValues) =>
    t(`teskeid.expenses.${key}` as never, values as never)
}
