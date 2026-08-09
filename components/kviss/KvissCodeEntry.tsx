'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { normalizeKvissCode, KVISS_JOIN_ALPHABET } from '@/lib/kviss/contracts'

export function KvissCodeEntry({ initialCode = '' }: { initialCode?: string }) {
  const t = useTranslations('kviss')
  const router = useRouter()
  const [code, setCode] = useState(initialCode)
  const [pending, setPending] = useState(false)
  const normalized = normalizeKvissCode(code)
  const valid = normalized.length === 6 && [...normalized].every(character => KVISS_JOIN_ALPHABET.includes(character))
  return (
    <form
      className="grid gap-4 rounded-xl border border-border bg-card p-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (!valid || pending) return
        setPending(true)
        router.push(`/kviss/${normalized}`)
      }}
    >
      <label className="grid gap-1.5 text-sm font-medium">
        {t('codeLabel')}
        <input
          value={code}
          onChange={event => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
          autoCapitalize="characters"
          autoComplete="one-time-code"
          inputMode="text"
          className="min-h-12 w-full rounded-lg border border-border bg-background px-3 text-center text-xl font-semibold uppercase tracking-[0.25em] outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
      </label>
      <button
        type="submit"
        disabled={!valid || pending}
        className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-45"
      >
        {pending ? t('opening') : t('openQuiz')}
      </button>
    </form>
  )
}

