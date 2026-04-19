'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'

export default function SignupPage() {
  const t = useTranslations('auth')
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [checkEmail, setCheckEmail] = useState(false)

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: name },
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    // Email confirmation required — session is null until confirmed
    if (!data.session) {
      setCheckEmail(true)
      setLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  if (checkEmail) {
    return (
      <Card>
        <div className="text-center py-4">
          <div className="text-4xl mb-4">📬</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">{t('checkEmail')}</h2>
          <p className="text-sm text-gray-500">{email}</p>
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <h2 className="mb-6 text-center text-xl font-semibold text-gray-900">{t('signupTitle')}</h2>
      <form onSubmit={handleSignup} className="flex flex-col gap-4">
        <Input
          label={t('name')}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          required
        />
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
          autoComplete="new-password"
          minLength={6}
          required
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" loading={loading} size="lg" className="mt-2">
          {loading ? t('signingUp') : t('signup')}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-gray-500">
        {t('hasAccount')}{' '}
        <Link href="/login" className="font-medium text-violet-600 hover:underline">
          {t('login')}
        </Link>
      </p>
    </Card>
  )
}
