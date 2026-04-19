'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'

export default function ForgotPasswordPage() {
  const t = useTranslations('auth')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/auth/callback?next=/reset-password`,
    })

    if (error) {
      setError(t('errors.generic'))
      setLoading(false)
      return
    }

    setSent(true)
    setLoading(false)
  }

  if (sent) {
    return (
      <Card>
        <div className="text-center py-4">
          <div className="text-4xl mb-4">📬</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">{t('resetLinkSent')}</h2>
          <p className="text-sm text-gray-500 mt-1">{email}</p>
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <h2 className="mb-2 text-center text-xl font-semibold text-gray-900">
        {t('forgotPasswordTitle')}
      </h2>
      <p className="mb-6 text-center text-sm text-gray-500">{t('forgotPasswordDesc')}</p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label={t('email')}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" loading={loading} size="lg">
          {loading ? t('sendingResetLink') : t('sendResetLink')}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-gray-500">
        <Link href="/login" className="font-medium text-violet-600 hover:underline">
          {t('login')}
        </Link>
      </p>
    </Card>
  )
}
