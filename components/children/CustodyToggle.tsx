'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'

interface CustodyToggleProps {
  childId: string
  isWithMe: boolean
}

export function CustodyToggle({ childId, isWithMe }: CustodyToggleProps) {
  const t = useTranslations('children.custody')
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [current, setCurrent] = useState(isWithMe)

  async function toggle() {
    setLoading(true)
    const res = await fetch(`/api/children/${childId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toggle_custody: true }),
    })
    if (res.ok) {
      setCurrent(!current)
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
        current
          ? 'bg-green-100 text-green-700 hover:bg-green-200'
          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
      } disabled:opacity-50`}
    >
      <span>{current ? '🏠' : '👤'}</span>
      {current ? t('withMe') : t('withOther')}
    </button>
  )
}
