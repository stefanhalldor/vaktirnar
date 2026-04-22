'use client'

import { useTranslations } from 'next-intl'

export function LanguageSwitcher() {
  const t = useTranslations('nav')

  function switchLanguage() {
    const current = document.cookie
      .split('; ')
      .find((row) => row.startsWith('locale='))
      ?.split('=')[1]

    const next = current === 'en' ? 'is' : 'en'
    document.cookie = `locale=${next}; path=/; max-age=31536000`
    window.location.reload()
  }

  return (
    <button
      onClick={switchLanguage}
      className="text-sm font-medium text-gray-600 hover:text-violet-700 transition-colors px-3 py-1 rounded-lg hover:bg-violet-50"
    >
      {t('language')}
    </button>
  )
}
