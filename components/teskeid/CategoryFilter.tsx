'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { IDEA_CATEGORIES } from '@/lib/teskeid/types'

export function CategoryFilter() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const active = searchParams.get('flokkur') ?? ''

  function select(cat: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (cat) {
      params.set('flokkur', cat)
    } else {
      params.delete('flokkur')
    }
    router.push(`/?${params.toString()}`)
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => select('')}
        className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors border ${
          !active
            ? 'bg-violet-600 text-white border-violet-600'
            : 'bg-white text-gray-600 border-gray-200 hover:border-violet-300'
        }`}
      >
        Allt
      </button>
      {IDEA_CATEGORIES.map((cat) => (
        <button
          key={cat}
          onClick={() => select(cat)}
          className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors border ${
            active === cat
              ? 'bg-violet-600 text-white border-violet-600'
              : 'bg-white text-gray-600 border-gray-200 hover:border-violet-300'
          }`}
        >
          {cat}
        </button>
      ))}
    </div>
  )
}
