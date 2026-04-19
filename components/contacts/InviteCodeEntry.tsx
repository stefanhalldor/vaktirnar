'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export function InviteCodeEntry() {
  const t = useTranslations('contacts')
  const router = useRouter()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invite_code: code.toUpperCase() }),
    })

    if (!res.ok) {
      setError((await res.json()).error ?? 'Villa')
      setLoading(false)
      return
    }

    setCode('')
    router.refresh()
    setLoading(false)
  }

  return (
    <form onSubmit={handleConnect} className="flex flex-col gap-3">
      <Input
        label={t('enterCode')}
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder={t('enterCodePlaceholder')}
        maxLength={6}
        className="font-mono tracking-widest text-lg uppercase"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" loading={loading} disabled={code.length !== 6}>
        {t('connect')}
      </Button>
    </form>
  )
}
