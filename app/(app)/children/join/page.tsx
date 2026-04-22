'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Header } from '@/components/layout/Header'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

export default function JoinAsCoparentPage() {
  const t = useTranslations('children')
  const router = useRouter()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/children/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invite_code: code }),
    })

    const data = await res.json()

    if (!res.ok) {
      const key = data.error
      setError(key === 'invalidCode' || key === 'alreadyParent'
        ? t(`errors.${key}`)
        : t('errors.generic'))
      setLoading(false)
      return
    }

    setSuccess(true)
    setTimeout(() => {
      router.push('/children')
      router.refresh()
    }, 1500)
  }

  if (success) {
    return (
      <>
        <Header title={t('joinAsCoparent')} backHref="/children" />
        <div className="p-4">
          <Card>
            <div className="text-center py-6">
              <div className="text-5xl mb-3">🎉</div>
              <p className="font-medium text-gray-900">{t('joinSuccess')}</p>
            </div>
          </Card>
        </div>
      </>
    )
  }

  return (
    <>
      <Header title={t('joinAsCoparent')} backHref="/children" />
      <div className="p-4">
        <Card>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label={t('joinWithCode')}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={6}
              className="font-mono text-lg tracking-widest text-center"
              required
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" loading={loading} size="lg">
              {t('joinAsCoparent')}
            </Button>
          </form>
        </Card>
      </div>
    </>
  )
}
