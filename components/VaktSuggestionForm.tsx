'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

interface VaktSuggestionFormProps {
  placeholder: string
  emailPlaceholder: string
  buttonLabel: string
  successMessage: string
}

export function VaktSuggestionForm({ placeholder, emailPlaceholder, buttonLabel, successMessage }: VaktSuggestionFormProps) {
  const [suggestion, setSuggestion] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')

    const { error } = await supabase
      .from('vakt_suggestions')
      .insert({ suggestion, email: email || null })

    if (error) {
      console.error('Suggestion error:', error)
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

  if (status === 'error') {
    return (
      <p className="text-sm font-medium text-red-600 bg-red-50 px-4 py-3 rounded-xl border border-red-100">
        Eitthvað fór úrskeiðis. Reyndu aftur eða hafðu samband við okkur.
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <textarea
        required
        value={suggestion}
        onChange={e => setSuggestion(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="text-sm border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-violet-400 transition-colors resize-none"
      />
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder={emailPlaceholder}
          className="flex-1 text-sm border border-gray-200 rounded-xl px-4 py-2.5 outline-none focus:border-violet-400 transition-colors"
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="bg-gray-900 text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-gray-700 transition-colors disabled:opacity-60 whitespace-nowrap"
        >
          {status === 'loading' ? '...' : buttonLabel}
        </button>
      </div>
    </form>
  )
}
