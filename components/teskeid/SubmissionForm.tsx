'use client'

import { useState } from 'react'
import { IDEA_CATEGORIES } from '@/lib/teskeid/types'
import { trackEvent } from '@/lib/teskeid/analytics'

export function SubmissionForm() {
  const [form, setForm] = useState({
    problem_description: '',
    current_solution: '',
    dream_solution: '',
    category: '',
    allow_publication: 'anonymous' as 'yes' | 'no' | 'anonymous',
    name: '',
    email: '',
    website: '', // honeypot
  })
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')

  function set(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (state === 'loading') return

    setState('loading')
    const res = await fetch('/api/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        category: form.category || undefined,
        current_solution: form.current_solution || undefined,
        dream_solution: form.dream_solution || undefined,
        name: form.name || undefined,
        email: form.email || undefined,
      }),
    })
    if (res.ok) trackEvent('submit')
    setState(res.ok ? 'done' : 'error')
  }

  if (state === 'done') {
    return (
      <div className="bg-green-50 border border-green-100 rounded-2xl p-8 text-center">
        <p className="text-lg font-medium text-green-800 mb-1">Takk fyrir!</p>
        <p className="text-sm text-green-700">
          Hugmyndin þín hefur borist. Við lítum yfir hana og bætum henni við bankann ef við getum.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* Honeypot — hidden from real users */}
      <div style={{ display: 'none' }} aria-hidden="true">
        <input
          type="text"
          name="website"
          value={form.website}
          onChange={(e) => set('website', e.target.value)}
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Hvað er vandinn? <span className="text-red-400">*</span>
        </label>
        <textarea
          value={form.problem_description}
          onChange={(e) => set('problem_description', e.target.value)}
          required
          maxLength={2000}
          rows={4}
          placeholder="Lýstu vandanum sem þú lendir í..."
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Hvernig leysirðu þetta í dag?
        </label>
        <textarea
          value={form.current_solution}
          onChange={(e) => set('current_solution', e.target.value)}
          maxLength={2000}
          rows={3}
          placeholder="Excel, WhatsApp, minnismiðar... eða ekkert?"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Hvernig viltu að þetta leysist?
        </label>
        <textarea
          value={form.dream_solution}
          onChange={(e) => set('dream_solution', e.target.value)}
          maxLength={2000}
          rows={3}
          placeholder="Draumurinn minn er..."
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Flokkur</label>
        <select
          value={form.category}
          onChange={(e) => set('category', e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white"
        >
          <option value="">Veldu flokk (valkvætt)</option>
          {IDEA_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-0.5">
          Má birta hugmyndina?
        </label>
        <p className="text-xs text-gray-500 mb-2">
          Þú ræður hvort hugmyndin birtist í bankanum og hvort nafnið þitt fylgi með.
        </p>
        <div className="flex flex-col gap-2">
          {[
            { value: 'anonymous', label: 'Já, án nafns' },
            { value: 'yes', label: 'Já, með nafninu mínu' },
            { value: 'no', label: 'Nei, bara til innri skoðunar' },
          ].map(({ value, label }) => (
            <label key={value} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="radio"
                name="allow_publication"
                value={value}
                checked={form.allow_publication === value}
                onChange={() => set('allow_publication', value as 'yes' | 'no' | 'anonymous')}
                className="accent-violet-600"
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Nafn (valkvætt)</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            maxLength={200}
            placeholder="Nafn þitt"
            className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-violet-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Netfang (valkvætt)
          </label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            maxLength={320}
            placeholder="netfang@dæmi.is"
            className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-violet-400"
          />
        </div>
      </div>

      {state === 'error' && (
        <p className="text-sm text-red-500">Eitthvað fór úrskeiðis. Reyndu aftur.</p>
      )}

      <button
        type="submit"
        disabled={state === 'loading'}
        className="self-start rounded-xl bg-violet-600 text-white px-6 py-3 text-sm font-medium hover:bg-violet-700 transition-colors disabled:opacity-60"
      >
        {state === 'loading' ? 'Sendi...' : 'Senda hugmynd'}
      </button>
    </form>
  )
}
