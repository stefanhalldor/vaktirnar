'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'

export default function LoginPage() {
  const t = useTranslations('auth')
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(t('errors.invalidCredentials'))
      setLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    <Card>
      <h2 className="mb-6 text-center text-xl font-semibold text-gray-900">{t('loginTitle')}</h2>
      <form onSubmit={handleLogin} className="flex flex-col gap-4">
        <Input
          label={t('email')}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
        <Input
          label={t('password')}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" loading={loading} size="lg" className="mt-2">
          {loading ? t('loggingIn') : t('login')}
        </Button>
        <Link
          href="/forgot-password"
          className="text-center text-sm text-violet-600 hover:underline"
        >
          {t('forgotPassword')}
        </Link>
      </form>
      <p className="mt-4 text-center text-sm text-gray-500">
        {t('noAccount')}{' '}
        <Link href="/signup" className="font-medium text-violet-600 hover:underline">
          {t('signup')}
        </Link>
      </p>
    </Card>
  )
}
