'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { X } from 'lucide-react'

type ActivityCategory = 'screen' | 'physical' | 'other'

interface ActivityLoggerProps {
  onLog: (category: ActivityCategory, minutes: number) => Promise<void>
  onClose: () => void
}

const categories: ActivityCategory[] = ['physical', 'screen', 'other']

const categoryEmoji: Record<ActivityCategory, string> = {
  screen: '📱',
  physical: '⚽',
  other: '🎨',
}

export function ActivityLogger({ onLog, onClose }: ActivityLoggerProps) {
  const t = useTranslations('activity')
  const [category, setCategory] = useState<ActivityCategory>('physical')
  const [minutes, setMinutes] = useState(30)
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    setLoading(true)
    await onLog(category, minutes)
    setLoading(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">{t('log')}</h3>
          <button onClick={onClose} className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4">
          <p className="mb-2 text-sm font-medium text-gray-700">{t('category')}</p>
          <div className="flex gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`flex flex-1 flex-col items-center gap-1 rounded-xl border-2 p-3 text-sm font-medium transition-colors ${
                  category === cat
                    ? 'border-violet-500 bg-violet-50 text-violet-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                <span className="text-xl">{categoryEmoji[cat]}</span>
                {t(`categories.${cat}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <p className="mb-2 text-sm font-medium text-gray-700">{t('minutes')}: <span className="text-violet-600 font-bold">{minutes}</span></p>
          <input
            type="range"
            min={5}
            max={180}
            step={5}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="w-full accent-violet-600"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>5 mín</span>
            <span>3 klst</span>
          </div>
        </div>

        <Button onClick={handleSubmit} loading={loading} size="lg" className="w-full">
          {t('save')}
        </Button>
      </div>
    </div>
  )
}
