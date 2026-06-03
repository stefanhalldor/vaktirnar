'use client'

import { useState } from 'react'

export function LoginWaitlistForm() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || status === 'loading') return
    setStatus('loading')

    try {
      const res = await fetch('/api/login-waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      setStatus(res.ok ? 'done' : 'error')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'done') {
    return (
      <p className="text-base text-[#154212] bg-[#dae5de] rounded-xl px-5 py-4">
        Takk! Við látum þig vita þegar þetta opnar.
      </p>
    )
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="netfang@dæmi.is"
          required
          disabled={status === 'loading'}
          className="flex-1 rounded-xl border border-[#c2c9bb] bg-white px-4 py-3 text-base text-[#1b1c19] placeholder:text-[#72796e] focus:outline-none focus:ring-2 focus:ring-[#154212] focus:ring-offset-1 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="rounded-xl bg-[#154212] text-white px-5 py-3 text-base font-medium hover:bg-[#2d5a27] transition-colors shrink-0 disabled:opacity-60"
        >
          {status === 'loading' ? 'Skrái...' : 'Skrá mig á lista'}
        </button>
      </form>
      {status === 'error' && (
        <p className="mt-3 text-sm text-red-600">
          Eitthvað fór úrskeiðis. Reyndu aftur.
        </p>
      )}
    </>
  )
}
