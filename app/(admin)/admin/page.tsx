'use client'

import { useEffect, useState } from 'react'
import type { Idea, Submission } from '@/lib/teskeid/types'
import { StatusBadge } from '@/components/teskeid/StatusBadge'

type IdeaStatus = Idea['status']
type SubmissionStatus = Submission['status']

export default function AdminPage() {
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [tab, setTab] = useState<'ideas' | 'submissions'>('ideas')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/ideas').then((r) => r.json()),
      fetch('/api/admin/submissions').then((r) => r.json()),
    ]).then(([ideaData, subData]) => {
      setIdeas(Array.isArray(ideaData) ? ideaData : [])
      setSubmissions(Array.isArray(subData) ? subData : [])
      setLoading(false)
    })
  }, [])

  async function updateIdea(id: string, patch: Partial<Pick<Idea, 'status' | 'is_public' | 'is_featured'>>) {
    const res = await fetch(`/api/admin/ideas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (res.ok) {
      const updated = await res.json()
      setIdeas((prev) => prev.map((i) => (i.id === id ? updated : i)))
    }
  }

  async function updateSubmission(id: string, status: SubmissionStatus) {
    const res = await fetch(`/api/admin/submissions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      const updated = await res.json()
      setSubmissions((prev) => prev.map((s) => (s.id === id ? updated : s)))
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center">
        <p className="text-sm text-gray-400">Hleður...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <h1 className="text-xl font-semibold text-gray-900 mb-6">Teskeið admin</h1>

        <div className="flex gap-2 mb-6">
          {(['ideas', 'submissions'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                tab === t
                  ? 'bg-violet-600 text-white border-violet-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-violet-300'
              }`}
            >
              {t === 'ideas' ? `Hugmyndir (${ideas.length})` : `Innsendingar (${submissions.length})`}
            </button>
          ))}
        </div>

        {tab === 'ideas' && (
          <div className="flex flex-col gap-3">
            {ideas.map((idea) => (
              <div
                key={idea.id}
                className="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-start gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <StatusBadge status={idea.status} />
                    {!idea.is_public && (
                      <span className="text-xs bg-red-100 text-red-500 rounded-full px-2 py-0.5">
                        Falið
                      </span>
                    )}
                    {idea.is_featured && (
                      <span className="text-xs bg-yellow-100 text-yellow-600 rounded-full px-2 py-0.5">
                        Featured
                      </span>
                    )}
                  </div>
                  <p className="font-medium text-gray-900 text-sm">{idea.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {idea.category} · {idea.votes_count} atkvæði · {idea.followers_count} fylgjendur
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <select
                    value={idea.status}
                    onChange={(e) => updateIdea(idea.id, { status: e.target.value as IdeaStatus })}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none"
                  >
                    {(['idea','reviewing','planned','building','launched','archived'] as const).map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => updateIdea(idea.id, { is_public: !idea.is_public })}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 hover:border-violet-300 transition-colors"
                  >
                    {idea.is_public ? 'Fela' : 'Birta'}
                  </button>
                  <button
                    onClick={() => updateIdea(idea.id, { is_featured: !idea.is_featured })}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 hover:border-violet-300 transition-colors"
                  >
                    {idea.is_featured ? 'Af featured' : 'Featured'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'submissions' && (
          <div className="flex flex-col gap-3">
            {submissions.map((sub) => (
              <div
                key={sub.id}
                className="bg-white border border-gray-200 rounded-2xl p-5"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <span
                    className={`text-xs font-medium rounded-full px-2.5 py-0.5 ${
                      sub.status === 'pending'
                        ? 'bg-amber-100 text-amber-600'
                        : sub.status === 'approved'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {sub.status}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(sub.created_at).toLocaleDateString('is-IS')}
                  </span>
                </div>
                <p className="text-sm text-gray-700 mb-2">{sub.problem_description}</p>
                {sub.current_solution && (
                  <p className="text-xs text-gray-500 mb-1">
                    <span className="font-medium">Núverandi lausn:</span> {sub.current_solution}
                  </p>
                )}
                {sub.dream_solution && (
                  <p className="text-xs text-gray-500 mb-2">
                    <span className="font-medium">Draumur:</span> {sub.dream_solution}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  {sub.category && (
                    <span className="text-xs text-gray-400">{sub.category}</span>
                  )}
                  {sub.name && <span className="text-xs text-gray-400">{sub.name}</span>}
                  {sub.email && <span className="text-xs text-gray-400">{sub.email}</span>}
                  <span className="text-xs text-gray-400">birting: {sub.allow_publication}</span>
                  <div className="flex gap-1 ml-auto">
                    {(['pending', 'approved', 'rejected'] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => updateSubmission(sub.id, s)}
                        disabled={sub.status === s}
                        className={`text-xs border rounded-lg px-2 py-1 transition-colors disabled:opacity-40 ${
                          sub.status === s
                            ? 'border-violet-400 text-violet-600'
                            : 'border-gray-200 hover:border-violet-300'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
