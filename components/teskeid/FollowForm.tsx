'use client'

import { useState } from 'react'

export function FollowForm({ ideaId }: { ideaId: string }) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || state === 'loading') return

    setState('loading')
    const res = await fetch('/api/followers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idea_id: ideaId, email: email.toLowerCase() }),
    })

    setState(res.ok ? 'done' : 'error')
  }

  if (state === 'done') {
    return (
      <p className="text-sm text-green-700 bg-green-50 rounded-xl px-4 py-3">
        Frábært! Við látum þig vita þegar eitthvað breytist.
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="netfang@dæmi.is"
        required
        className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
      />
      <button
        type="submit"
        disabled={state === 'loading'}
        className="rounded-xl bg-violet-600 text-white px-4 py-2 text-sm font-medium hover:bg-violet-700 transition-colors disabled:opacity-60"
      >
        {state === 'loading' ? 'Skrá...' : 'Fylgjast'}
      </button>
      {state === 'error' && (
        <p className="text-xs text-red-500 mt-1">Eitthvað fór úrskeiðis. Reyndu aftur.</p>
      )}
    </form>
  )
}
