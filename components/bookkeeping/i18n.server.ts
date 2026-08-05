import 'server-only'

import { getTranslations } from 'next-intl/server'
import type { BookkeepingTranslationValues } from './i18n.client'

export async function getBookkeepingTranslations() {
  const t = await getTranslations()
  return (key: string, values?: BookkeepingTranslationValues) =>
    t(`teskeid.bookkeeping.${key}` as never, values as never)
}
