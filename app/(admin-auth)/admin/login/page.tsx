'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'

type Step = 'email' | 'code'

const RESEND_COOLDOWN = 60

export default function AdminLoginPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resendCountdown, setResendCountdown] = useState(0)
  const [currentUser, setCurrentUser] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setCurrentUser(data.user.email)
    })
  }, [])

  useEffect(() => {
    if (resendCountdown <= 0) return
    const t = setTimeout(() => setResendCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCountdown])

  async function requestCode(targetEmail: string) {
    await fetch('/api/auth/request-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: targetEmail }),
    })
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    await requestCode(email)
    setStep('code')
    setResendCountdown(RESEND_COOLDOWN)
    setLoading(false)
  }

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const res = await fetch('/api/auth/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
    })

    if (!res.ok) {
      setError('Ógildur eða útrunninn kóði')
      setLoading(false)
      return
    }

    router.push('/admin')
    router.refresh()
  }

  const handleResend = useCallback(async () => {
    if (resendCountdown > 0) return
    setError('')
    await requestCode(email)
    setResendCountdown(RESEND_COOLDOWN)
  }, [email, resendCountdown])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    setCurrentUser(null)
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {currentUser && (
          <p className="text-center text-xs text-gray-400 mb-4">
            Skráð/ur inn sem {currentUser}.{' '}
            <button
              onClick={handleSignOut}
              className="text-violet-600 hover:underline"
            >
              Skrá út
            </button>
          </p>
        )}

        <Card>
          <h2 className="mb-6 text-center text-xl font-semibold text-gray-900">
            Innskráning
          </h2>

          {step === 'email' && (
            <form onSubmit={handleEmailSubmit} className="flex flex-col gap-4">
              <Input
                label="Netfang"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
              <Button type="submit" loading={loading} size="lg" className="mt-2">
                {loading ? 'Bíð...' : 'Áfram'}
              </Button>
            </form>
          )}

          {step === 'code' && (
            <form onSubmit={handleCodeSubmit} className="flex flex-col gap-4">
              <p className="text-sm text-gray-500 leading-relaxed">
                Ef netfangið hefur aðgang færðu kóða á netfangið. Annars látum við þig vita þegar opnar.
              </p>
              <Input
                label="Kóði"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                autoComplete="one-time-code"
                required
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" loading={loading} size="lg" className="mt-2">
                {loading ? 'Bíð...' : 'Staðfesta'}
              </Button>
              <div className="flex justify-between text-sm mt-1">
                <button
                  type="button"
                  onClick={() => { setStep('email'); setCode(''); setError('') }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Til baka
                </button>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendCountdown > 0}
                  className="text-violet-600 hover:underline disabled:text-gray-300 disabled:no-underline transition-colors"
                >
                  {resendCountdown > 0 ? `Senda aftur eftir ${resendCountdown}s` : 'Senda aftur'}
                </button>
              </div>
            </form>
          )}
        </Card>
      </div>
    </div>
  )
}
