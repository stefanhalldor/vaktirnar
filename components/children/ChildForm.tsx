'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

type Gender = 'boy' | 'girl' | 'other'

const GENDER_OPTIONS: { value: Gender; emoji: string }[] = [
  { value: 'boy', emoji: '👦' },
  { value: 'girl', emoji: '👧' },
  { value: 'other', emoji: '🧒' },
]

const SUGGESTED: Record<Gender, string[]> = {
  boy:   ['👦', '⚽', '🤖', '🦁', '🚀'],
  girl:  ['👧', '🌸', '🦋', '🐱', '🌈'],
  other: ['🧒', '🌟', '🐼', '🦄', '🎨'],
}

const ALL_EMOJIS = [
  // Kids
  '👶', '🧒', '👦', '👧', '🧑',
  // Animals
  '🐶', '🐱', '🐭', '🐹', '🐰',
  '🦊', '🐻', '🐼', '🐨', '🐯',
  '🦁', '🐸', '🐵', '🐧', '🦋',
  '🐝', '🦄', '🐲', '🦖', '🐙',
  // Sports & fun
  '⚽', '🏀', '🏈', '🎾', '🏆',
  '🚀', '🎮', '🎨', '🎵', '🎪',
  // Nature
  '🌸', '🌈', '⭐', '🌟', '🌻',
  '🍀', '🌙', '☀️', '❄️', '🌊',
  // Characters
  '🤖', '👻', '🧙', '🧚', '🦸',
  '🍕', '🍦', '🍭', '🎂', '🪄',
]

interface ChildFormProps {
  initial?: { id?: string; name: string; birth_year?: number; avatar_emoji?: string; gender?: string }
  onSuccess?: () => void
}

export function ChildForm({ initial, onSuccess }: ChildFormProps) {
  const t = useTranslations('children')
  const router = useRouter()
  const [name, setName] = useState(initial?.name ?? '')
  const [birthYear, setBirthYear] = useState(initial?.birth_year?.toString() ?? '')
  const [gender, setGender] = useState<Gender>((initial?.gender as Gender) ?? 'other')
  const [emoji, setEmoji] = useState(initial?.avatar_emoji ?? '🧒')
  const [showAll, setShowAll] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function handleGenderChange(g: Gender) {
    setGender(g)
    // Only auto-switch emoji if user hasn't picked one manually or current is from old gender's suggestions
    const allSuggested = Object.values(SUGGESTED).flat()
    if (allSuggested.includes(emoji)) {
      setEmoji(SUGGESTED[g][0])
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const body = {
      name,
      birth_year: birthYear ? Number(birthYear) : undefined,
      avatar_emoji: emoji,
      gender,
    }

    const url = initial?.id ? `/api/children/${initial.id}` : '/api/children'
    const method = initial?.id ? 'PUT' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      setError((await res.json()).error ?? 'Villa')
      setLoading(false)
      return
    }

    router.push('/children')
    router.refresh()
    onSuccess?.()
  }

  const visibleEmojis = showAll ? ALL_EMOJIS : SUGGESTED[gender]

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">

      {/* Gender selector */}
      <div>
        <p className="mb-2 text-sm font-medium text-gray-700">{t('gender.label')}</p>
        <div className="flex gap-2">
          {GENDER_OPTIONS.map(({ value, emoji: gEmoji }) => (
            <button
              key={value}
              type="button"
              onClick={() => handleGenderChange(value)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 rounded-2xl text-sm font-medium transition-all ${
                gender === value
                  ? 'bg-violet-100 text-violet-700 ring-2 ring-violet-400'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span className="text-2xl">{gEmoji}</span>
              {t(`gender.${value}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Emoji picker */}
      <div>
        <p className="mb-2 text-sm font-medium text-gray-700">{t('avatarEmoji')}</p>
        <div className="grid grid-cols-5 gap-2">
          {visibleEmojis.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setEmoji(opt)}
              className={`flex items-center justify-center h-14 w-full rounded-2xl text-3xl transition-all ${
                emoji === opt
                  ? 'bg-violet-100 ring-2 ring-violet-500'
                  : 'bg-gray-50 hover:bg-gray-100'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          className="mt-2 flex items-center gap-1 text-sm text-violet-600 hover:text-violet-700"
        >
          {showAll ? (
            <><ChevronUp className="h-4 w-4" />{t('fewerEmojis')}</>
          ) : (
            <><ChevronDown className="h-4 w-4" />{t('moreEmojis')}</>
          )}
        </button>
      </div>

      <Input
        label={t('childName')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <Input
        label={t('birthYear')}
        type="number"
        value={birthYear}
        onChange={(e) => setBirthYear(e.target.value)}
        min={2000}
        max={new Date().getFullYear()}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" loading={loading} size="lg">
        {t('save')}
      </Button>
    </form>
  )
}
