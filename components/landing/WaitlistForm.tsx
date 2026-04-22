'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

interface WaitlistFormProps {
  product: string
  locale: string
  placeholder: string
  buttonLabel: string
  successMessage: string
}

export function WaitlistForm({ product, locale, placeholder, buttonLabel, successMessage }: WaitlistFormProps) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')

    const { error } = await supabase
      .from('waitlist')
      .insert({ email, product, locale })

    if (error && error.code !== '23505') {
      console.error('Waitlist error:', error)
      setStatus('error')
    } else {
      setStatus('success')
    }
  }

  if (status === 'success') {
    return (
      <p className="text-sm font-medium text-green-700 bg-green-50 px-4 py-3 rounded-xl border border-green-100">
        {successMessage}
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
      <input
        type="email"
        required
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder={placeholder}
        className="flex-1 text-sm border border-gray-200 rounded-xl px-4 py-2.5 outline-none focus:border-violet-400 transition-colors"
      />
      <button
        type="submit"
        disabled={status === 'loading'}
        className="bg-gray-900 text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-gray-700 transition-colors disabled:opacity-60 whitespace-nowrap"
      >
        {status === 'loading' ? '...' : buttonLabel}
      </button>
    </form>
  )
}
