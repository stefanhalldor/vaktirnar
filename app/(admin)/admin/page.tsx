'use client'

import { useEffect, useState } from 'react'
import type { Idea, Submission, IdeaCategory } from '@/lib/teskeid/types'
import { IDEA_CATEGORIES } from '@/lib/teskeid/types'
import { StatusBadge } from '@/components/teskeid/StatusBadge'

type IdeaStatus = Idea['status']
type SubmissionStatus = Submission['status']
type IdeaPatch = Partial<Pick<Idea,
  'title' | 'slug' | 'short_description' | 'problem_description' |
  'possible_solution' | 'category' | 'status' | 'is_public' | 'is_featured'
>>
type SubmissionPatch = Partial<Pick<Submission,
  'problem_description' | 'current_solution' | 'dream_solution' |
  'category' | 'allow_publication' | 'name' | 'email' | 'status'
>>

function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[áàäâ]/g, 'a')
    .replace(/[éèëê]/g, 'e')
    .replace(/[íìïî]/g, 'i')
    .replace(/[óòöô]/g, 'o')
    .replace(/[úùüû]/g, 'u')
    .replace(/[ýÿ]/g, 'y')
    .replace(/þ/g, 'th')
    .replace(/ð/g, 'd')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200)
}

type AnalyticsSummary = {
  unique_visitors: number
  total_page_views: number
  total_votes: number
  total_follows: number
  total_submissions: number
}

type TopIdea = {
  id: string
  title: string
  slug: string
  views: number
  unique_views: number
  votes: number
  follows: number
  conversion: number
}

type AnalyticsData = {
  summary: AnalyticsSummary
  top_ideas: TopIdea[]
  devices: Record<string, number>
  browsers: Record<string, number>
  countries: Record<string, number>
  top_referrers: Record<string, number>
}

function BreakdownList({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 8)
  const max = entries[0]?.[1] ?? 1
  return (
    <ul className="flex flex-col gap-1.5">
      {entries.map(([label, count]) => (
        <li key={label} className="flex items-center gap-2 text-xs">
          <span className="w-24 truncate text-gray-500 shrink-0">{label}</span>
          <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-[#9dd090] h-full rounded-full"
              style={{ width: `${Math.round((count / max) * 100)}%` }}
            />
          </div>
          <span className="text-gray-400 w-6 text-right">{count}</span>
        </li>
      ))}
    </ul>
  )
}

export default function AdminPage() {
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [tab, setTab] = useState<'ideas' | 'submissions' | 'stats'>('ideas')
  const [period, setPeriod] = useState<'7d' | '30d' | 'all'>('7d')
  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<IdeaPatch>({})
  const [editError, setEditError] = useState('')
  const [editingSubId, setEditingSubId] = useState<string | null>(null)
  const [editSubDraft, setEditSubDraft] = useState<SubmissionPatch>({})
  const [editSubError, setEditSubError] = useState('')
  const [creatingIdeaSubId, setCreatingIdeaSubId] = useState<string | null>(null)
  const [createIdeaDraft, setCreateIdeaDraft] = useState({ title: '', slug: '', short_description: '' })
  const [createIdeaError, setCreateIdeaError] = useState('')
  const [showCreateIdea, setShowCreateIdea] = useState(false)
  const [newIdeaDraft, setNewIdeaDraft] = useState({
    title: '', slug: '', short_description: '',
    problem_description: '', possible_solution: '',
    category: 'Annað' as IdeaCategory,
    status: 'idea' as IdeaStatus,
    is_public: false, is_featured: false,
  })
  const [newIdeaError, setNewIdeaError] = useState('')
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)

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

  useEffect(() => {
    if (tab !== 'stats') return
    setStatsLoading(true)
    fetch(`/api/admin/analytics?period=${period}`)
      .then((r) => r.json())
      .then((data) => {
        setAnalytics(data)
        setStatsLoading(false)
      })
      .catch(() => setStatsLoading(false))
  }, [tab, period])

  const inboxSubmissions = submissions.filter(
    (s) => !(s.status === 'approved' && s.idea_id)
  )

  async function updateIdea(id: string, patch: IdeaPatch): Promise<boolean> {
    const res = await fetch(`/api/admin/ideas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (res.ok) {
      const updated = await res.json()
      setIdeas((prev) => prev.map((i) => (i.id === id ? updated : i)))
      return true
    }
    return false
  }

  async function saveEdit(id: string) {
    setEditError('')
    const ok = await updateIdea(id, editDraft)
    if (ok) {
      setEditingId(null)
      setEditDraft({})
    } else {
      setEditError('Vistun tókst ekki. Athugaðu hvort slug sé þegar notað eða hvort eitthvað sé ógilt.')
    }
  }

  async function updateSubmission(id: string, patch: SubmissionPatch): Promise<boolean> {
    const res = await fetch(`/api/admin/submissions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (res.ok) {
      const updated = await res.json()
      setSubmissions((prev) => prev.map((s) => (s.id === id ? updated : s)))
      return true
    }
    return false
  }

  async function saveSubEdit(id: string) {
    setEditSubError('')
    const ok = await updateSubmission(id, editSubDraft)
    if (ok) {
      setEditingSubId(null)
      setEditSubDraft({})
    } else {
      setEditSubError('Vistun tókst ekki.')
    }
  }

  async function createIdeaFromSub(subId: string) {
    setCreateIdeaError('')
    const payload: Record<string, string> = {
      title: createIdeaDraft.title.trim(),
      slug: createIdeaDraft.slug.trim(),
    }
    const trimmedDesc = createIdeaDraft.short_description.trim()
    if (trimmedDesc) payload.short_description = trimmedDesc

    const res = await fetch(`/api/admin/submissions/${subId}/create-idea`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (res.ok) {
      const { idea, submission_id } = await res.json()
      setIdeas((prev) => [idea, ...prev])
      setSubmissions((prev) => prev.map((s) => s.id === submission_id ? { ...s, status: 'approved' as const, idea_id: idea.id } : s))
      setCreatingIdeaSubId(null)
      setCreateIdeaDraft({ title: '', slug: '', short_description: '' })
    } else {
      const data = await res.json().catch(() => ({}))
      if (data.error === 'already_linked') {
        setCreateIdeaError('Hugmynd hefur þegar verið búin til úr þessari innsendingu.')
      } else if (data.error === 'duplicate_slug') {
        setCreateIdeaError('Slug er þegar í notkun. Veldu annað.')
      } else if (res.status === 400) {
        const fields = data.details?.fieldErrors ?? {}
        if (fields.slug?.length) {
          setCreateIdeaError('Slug má bara innihalda a-z, 0-9 og bandstrik.')
        } else {
          setCreateIdeaError('Athugaðu titil, slug og stutta lýsingu.')
        }
      } else {
        setCreateIdeaError('Villa kom upp. Reyndu aftur.')
      }
    }
  }

  async function createIdea() {
    setNewIdeaError('')
    const payload = {
      ...newIdeaDraft,
      title: newIdeaDraft.title.trim(),
      slug: newIdeaDraft.slug.trim(),
      short_description: newIdeaDraft.short_description.trim(),
      problem_description: newIdeaDraft.problem_description.trim() || null,
      possible_solution: newIdeaDraft.possible_solution.trim() || null,
    }
    const res = await fetch('/api/admin/ideas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (res.ok) {
      const idea = await res.json()
      setIdeas((prev) => [idea, ...prev])
      setShowCreateIdea(false)
      setNewIdeaDraft({ title: '', slug: '', short_description: '', problem_description: '', possible_solution: '', category: 'Annað', status: 'idea', is_public: false, is_featured: false })
      setSlugManuallyEdited(false)
    } else {
      const data = await res.json().catch(() => ({}))
      if (data.error === 'duplicate_slug') {
        setNewIdeaError('Slug er þegar í notkun. Veldu annað.')
      } else if (res.status === 400) {
        const fields = data.details?.fieldErrors ?? {}
        if (fields.slug?.length) setNewIdeaError('Slug má bara innihalda a-z, 0-9 og bandstrik.')
        else setNewIdeaError('Athugaðu að titill, slug og stutt lýsing séu rétt.')
      } else {
        setNewIdeaError('Villa kom upp. Reyndu aftur.')
      }
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fbf9f4] flex items-center justify-center">
        <p className="text-sm text-gray-400">Hleður...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#fbf9f4]">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <h1 className="text-xl font-semibold text-[#42493e] mb-6">Teskeið admin</h1>

        <div className="flex gap-2 mb-6">
          {(['ideas', 'submissions', 'stats'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                tab === t
                  ? 'bg-[#154212] text-white border-[#154212]'
                  : 'bg-white text-gray-600 border-[#c2c9bb] hover:border-[#2d5a27]'
              }`}
            >
              {t === 'ideas'
                ? `Hugmyndir (${ideas.length})`
                : t === 'submissions'
                ? `Innsendingar (${inboxSubmissions.length})`
                : 'Tölfræði'}
            </button>
          ))}
        </div>

        {tab === 'ideas' && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between mb-1">
              <button
                onClick={() => { setShowCreateIdea((v) => !v); setNewIdeaError('') }}
                className={`text-xs font-medium border rounded-lg px-3 py-1.5 transition-colors ${
                  showCreateIdea
                    ? 'bg-[#154212] text-white border-[#154212]'
                    : 'bg-white text-[#154212] border-[#c2c9bb] hover:border-[#2d5a27]'
                }`}
              >
                {showCreateIdea ? 'Loka' : '+ Stofna hugmynd'}
              </button>
            </div>

            {showCreateIdea && (
              <form
                onSubmit={(e) => { e.preventDefault(); createIdea() }}
                className="bg-white border border-[#c2c9bb] rounded-xl shadow-sm p-5 flex flex-col gap-3"
              >
                <p className="text-xs font-medium text-[#42493e]">Ný hugmynd</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500">Titill *</span>
                    <input
                      type="text"
                      maxLength={200}
                      required
                      value={newIdeaDraft.title}
                      onChange={(e) => {
                        const title = e.target.value
                        setNewIdeaDraft((d) => ({
                          ...d,
                          title,
                          slug: slugManuallyEdited ? d.slug : toSlug(title),
                        }))
                      }}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#2d5a27]"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500">Slug *</span>
                    <input
                      type="text"
                      maxLength={200}
                      required
                      value={newIdeaDraft.slug}
                      onChange={(e) => {
                        setSlugManuallyEdited(true)
                        setNewIdeaDraft((d) => ({ ...d, slug: toSlug(e.target.value) }))
                      }}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#2d5a27]"
                    />
                  </label>
                </div>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-500">Stutt lýsing *</span>
                  <input
                    type="text"
                    maxLength={500}
                    required
                    value={newIdeaDraft.short_description}
                    onChange={(e) => setNewIdeaDraft((d) => ({ ...d, short_description: e.target.value }))}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#2d5a27]"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-500">Vandamálslýsing</span>
                  <textarea
                    maxLength={2000}
                    rows={3}
                    value={newIdeaDraft.problem_description}
                    onChange={(e) => setNewIdeaDraft((d) => ({ ...d, problem_description: e.target.value }))}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#2d5a27] resize-y"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-500">Möguleg lausn</span>
                  <textarea
                    maxLength={2000}
                    rows={3}
                    value={newIdeaDraft.possible_solution}
                    onChange={(e) => setNewIdeaDraft((d) => ({ ...d, possible_solution: e.target.value }))}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#2d5a27] resize-y"
                  />
                </label>
                <div className="flex flex-wrap gap-3 items-end">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500">Flokkur</span>
                    <select
                      value={newIdeaDraft.category}
                      onChange={(e) => setNewIdeaDraft((d) => ({ ...d, category: e.target.value as IdeaCategory }))}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-[#2d5a27]"
                    >
                      {IDEA_CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500">Staða</span>
                    <select
                      value={newIdeaDraft.status}
                      onChange={(e) => setNewIdeaDraft((d) => ({ ...d, status: e.target.value as IdeaStatus }))}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-[#2d5a27]"
                    >
                      {(['idea','reviewing','planned','building','launched','archived'] as const).map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <div className="flex gap-4 items-center pb-0.5">
                    <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newIdeaDraft.is_public}
                        onChange={(e) => setNewIdeaDraft((d) => ({ ...d, is_public: e.target.checked }))}
                      />
                      Birt
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newIdeaDraft.is_featured}
                        onChange={(e) => setNewIdeaDraft((d) => ({ ...d, is_featured: e.target.checked }))}
                      />
                      Featured
                    </label>
                  </div>
                  <div className="flex gap-2 ml-auto items-center">
                    {newIdeaError && (
                      <p className="text-xs text-red-600 max-w-xs">{newIdeaError}</p>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateIdea(false)
                        setNewIdeaDraft({ title: '', slug: '', short_description: '', problem_description: '', possible_solution: '', category: 'Annað', status: 'idea', is_public: false, is_featured: false })
                        setNewIdeaError('')
                        setSlugManuallyEdited(false)
                      }}
                      className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 hover:border-gray-400 transition-colors"
                    >
                      Hætta við
                    </button>
                    <button
                      type="submit"
                      className="text-xs bg-[#154212] text-white rounded-lg px-3 py-1.5 hover:bg-[#2d5a27] transition-colors"
                    >
                      Stofna
                    </button>
                  </div>
                </div>
              </form>
            )}

            {ideas.map((idea) => (
              <div key={idea.id} className="bg-white border border-[#c2c9bb] rounded-xl shadow-sm p-5">
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
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
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 hover:border-[#2d5a27] transition-colors"
                    >
                      {idea.is_public ? 'Fela' : 'Birta'}
                    </button>
                    <button
                      onClick={() => updateIdea(idea.id, { is_featured: !idea.is_featured })}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 hover:border-[#2d5a27] transition-colors"
                    >
                      {idea.is_featured ? 'Af featured' : 'Featured'}
                    </button>
                    <button
                      onClick={() => {
                        if (editingId === idea.id) {
                          setEditingId(null)
                          setEditDraft({})
                          setEditError('')
                        } else {
                          setEditingId(idea.id)
                          setEditError('')
                          setEditDraft({
                            title: idea.title,
                            slug: idea.slug,
                            short_description: idea.short_description,
                            problem_description: idea.problem_description,
                            possible_solution: idea.possible_solution,
                            category: idea.category,
                            status: idea.status,
                            is_public: idea.is_public,
                            is_featured: idea.is_featured,
                          })
                        }
                      }}
                      className={`text-xs border rounded-lg px-2 py-1 transition-colors ${
                        editingId === idea.id
                          ? 'border-[#2d5a27] text-[#154212]'
                          : 'border-gray-200 hover:border-[#2d5a27]'
                      }`}
                    >
                      {editingId === idea.id ? 'Loka' : 'Breyta'}
                    </button>
                  </div>
                </div>

                {editingId === idea.id && (
                  <form
                    onSubmit={(e) => { e.preventDefault(); saveEdit(idea.id) }}
                    className="mt-4 pt-4 border-t border-gray-100 flex flex-col gap-3"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-gray-500">Titill</span>
                        <input
                          type="text"
                          maxLength={200}
                          required
                          value={editDraft.title ?? ''}
                          onChange={(e) => setEditDraft((d) => ({ ...d, title: e.target.value }))}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#2d5a27]"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-gray-500">Slug</span>
                        <input
                          type="text"
                          maxLength={200}
                          required
                          value={editDraft.slug ?? ''}
                          onChange={(e) => setEditDraft((d) => ({ ...d, slug: e.target.value }))}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#2d5a27]"
                        />
                      </label>
                    </div>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-gray-500">Stutt lýsing</span>
                      <input
                        type="text"
                        maxLength={500}
                        value={editDraft.short_description ?? ''}
                        onChange={(e) => setEditDraft((d) => ({ ...d, short_description: e.target.value }))}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#2d5a27]"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-gray-500">Vandamálslýsing</span>
                      <textarea
                        maxLength={2000}
                        rows={3}
                        value={editDraft.problem_description ?? ''}
                        onChange={(e) => setEditDraft((d) => ({ ...d, problem_description: e.target.value || null }))}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#2d5a27] resize-y"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-gray-500">Möguleg lausn</span>
                      <textarea
                        maxLength={2000}
                        rows={3}
                        value={editDraft.possible_solution ?? ''}
                        onChange={(e) => setEditDraft((d) => ({ ...d, possible_solution: e.target.value || null }))}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#2d5a27] resize-y"
                      />
                    </label>
                    <div className="flex flex-wrap gap-3 items-end">
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-gray-500">Flokkur</span>
                        <select
                          value={editDraft.category ?? ''}
                          onChange={(e) => setEditDraft((d) => ({ ...d, category: e.target.value as IdeaCategory }))}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-[#2d5a27]"
                        >
                          {IDEA_CATEGORIES.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-gray-500">Staða</span>
                        <select
                          value={editDraft.status ?? ''}
                          onChange={(e) => setEditDraft((d) => ({ ...d, status: e.target.value as IdeaStatus }))}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-[#2d5a27]"
                        >
                          {(['idea','reviewing','planned','building','launched','archived'] as const).map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </label>
                      <div className="flex gap-4 items-center pb-0.5">
                        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editDraft.is_public ?? false}
                            onChange={(e) => setEditDraft((d) => ({ ...d, is_public: e.target.checked }))}
                          />
                          Birt
                        </label>
                        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editDraft.is_featured ?? false}
                            onChange={(e) => setEditDraft((d) => ({ ...d, is_featured: e.target.checked }))}
                          />
                          Featured
                        </label>
                      </div>
                      <div className="flex gap-2 ml-auto items-center">
                        {editError && (
                          <p className="text-xs text-red-600 max-w-xs">{editError}</p>
                        )}
                        <button
                          type="button"
                          onClick={() => { setEditingId(null); setEditDraft({}); setEditError('') }}
                          className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 hover:border-gray-400 transition-colors"
                        >
                          Hætta við
                        </button>
                        <button
                          type="submit"
                          className="text-xs bg-[#154212] text-white rounded-lg px-3 py-1.5 hover:bg-[#2d5a27] transition-colors"
                        >
                          Vista
                        </button>
                      </div>
                    </div>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === 'submissions' && (
          <div className="flex flex-col gap-3">
            {inboxSubmissions.map((sub) => {
              const linkedIdea = sub.idea_id ? ideas.find((i) => i.id === sub.idea_id) : null
              return (
              <div key={sub.id} className="bg-white border border-[#c2c9bb] rounded-xl shadow-sm p-5">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <span className={`text-xs font-medium rounded-full px-2.5 py-0.5 ${
                    sub.status === 'pending' ? 'bg-amber-100 text-amber-600'
                    : sub.status === 'approved' ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-400'
                  }`}>
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
                  {sub.category && <span className="text-xs text-gray-400">{sub.category}</span>}
                  {sub.name && <span className="text-xs text-gray-400">{sub.name}</span>}
                  {sub.email && <span className="text-xs text-gray-400">{sub.email}</span>}
                  <span className="text-xs text-gray-400">birting: {sub.allow_publication}</span>
                  <div className="flex gap-1 ml-auto flex-wrap">
                    {/* Contextual action buttons */}
                    {sub.status === 'rejected' && (
                      <button
                        onClick={() => updateSubmission(sub.id, { status: 'pending' })}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1 hover:border-violet-300 transition-colors"
                      >
                        Opna aftur
                      </button>
                    )}
                    {sub.status !== 'rejected' && !sub.idea_id && (
                      <button
                        onClick={() => updateSubmission(sub.id, { status: 'rejected' })}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1 hover:border-red-300 text-red-600 transition-colors"
                      >
                        Hafna
                      </button>
                    )}
                    {sub.status === 'pending' && !sub.idea_id && (
                      <button
                        onClick={() => {
                          setCreatingIdeaSubId(sub.id)
                          setCreateIdeaError('')
                          setCreateIdeaDraft({ title: '', slug: '', short_description: '' })
                          setEditingSubId(null)
                        }}
                        className={`text-xs border rounded-lg px-2 py-1 transition-colors ${
                          creatingIdeaSubId === sub.id
                            ? 'border-green-500 text-green-700'
                            : 'border-gray-200 text-green-700 hover:border-green-400'
                        }`}
                      >
                        Samþykkja
                      </button>
                    )}
                    {sub.status === 'approved' && !sub.idea_id && (
                      <button
                        onClick={() => {
                          setCreatingIdeaSubId(sub.id)
                          setCreateIdeaError('')
                          setCreateIdeaDraft({ title: '', slug: '', short_description: '' })
                          setEditingSubId(null)
                        }}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-green-700 hover:border-green-400 transition-colors"
                      >
                        Búa til hugmynd
                      </button>
                    )}
                    {sub.idea_id && linkedIdea && (
                      <a
                        href={`/hugmyndir/${linkedIdea.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs border border-green-200 bg-green-50 text-green-700 rounded-lg px-2 py-1 hover:border-green-400 transition-colors"
                      >
                        Opna hugmynd
                      </a>
                    )}
                    {sub.idea_id && !linkedIdea && (
                      <span className="text-xs border border-gray-200 bg-gray-50 text-gray-400 rounded-lg px-2 py-1">
                        Hugmynd tengd
                      </span>
                    )}
                    <button
                      onClick={() => {
                        if (editingSubId === sub.id) {
                          setEditingSubId(null); setEditSubDraft({}); setEditSubError('')
                        } else {
                          setEditingSubId(sub.id)
                          setEditSubError('')
                          setEditSubDraft({
                            problem_description: sub.problem_description,
                            current_solution: sub.current_solution,
                            dream_solution: sub.dream_solution,
                            category: sub.category,
                            allow_publication: sub.allow_publication,
                            name: sub.name,
                            email: sub.email,
                            status: sub.status,
                          })
                          setCreatingIdeaSubId(null)
                        }
                      }}
                      className={`text-xs border rounded-lg px-2 py-1 transition-colors ${
                        editingSubId === sub.id ? 'border-[#2d5a27] text-[#154212]' : 'border-gray-200 hover:border-[#2d5a27]'
                      }`}
                    >
                      {editingSubId === sub.id ? 'Loka' : 'Breyta'}
                    </button>
                  </div>
                </div>

                {editingSubId === sub.id && (
                  <form
                    onSubmit={(e) => { e.preventDefault(); saveSubEdit(sub.id) }}
                    className="mt-4 pt-4 border-t border-gray-100 flex flex-col gap-3"
                  >
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-gray-500">Vandamálslýsing</span>
                      <textarea
                        maxLength={2000} rows={3} required
                        value={editSubDraft.problem_description ?? ''}
                        onChange={(e) => setEditSubDraft((d) => ({ ...d, problem_description: e.target.value }))}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#2d5a27] resize-y"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-gray-500">Núverandi lausn</span>
                      <textarea
                        maxLength={2000} rows={2}
                        value={editSubDraft.current_solution ?? ''}
                        onChange={(e) => setEditSubDraft((d) => ({ ...d, current_solution: e.target.value || null }))}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#2d5a27] resize-y"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-gray-500">Draumalausn</span>
                      <textarea
                        maxLength={2000} rows={2}
                        value={editSubDraft.dream_solution ?? ''}
                        onChange={(e) => setEditSubDraft((d) => ({ ...d, dream_solution: e.target.value || null }))}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#2d5a27] resize-y"
                      />
                    </label>
                    <div className="flex flex-wrap gap-3 items-end">
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-gray-500">Flokkur</span>
                        <select
                          value={editSubDraft.category ?? ''}
                          onChange={(e) => setEditSubDraft((d) => ({ ...d, category: e.target.value ? e.target.value as IdeaCategory : null }))}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-[#2d5a27]"
                        >
                          <option value="">—</option>
                          {IDEA_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-gray-500">Birting</span>
                        <select
                          value={editSubDraft.allow_publication ?? 'no'}
                          onChange={(e) => setEditSubDraft((d) => ({ ...d, allow_publication: e.target.value as 'yes' | 'no' | 'anonymous' }))}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-[#2d5a27]"
                        >
                          <option value="yes">yes</option>
                          <option value="no">no</option>
                          <option value="anonymous">anonymous</option>
                        </select>
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-gray-500">Staða</span>
                        <select
                          value={editSubDraft.status ?? 'pending'}
                          onChange={(e) => setEditSubDraft((d) => ({ ...d, status: e.target.value as SubmissionStatus }))}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-[#2d5a27]"
                        >
                          {(['pending', 'approved', 'rejected'] as const).map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-gray-500">Nafn</span>
                        <input
                          type="text" maxLength={200}
                          value={editSubDraft.name ?? ''}
                          onChange={(e) => setEditSubDraft((d) => ({ ...d, name: e.target.value || null }))}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#2d5a27]"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-gray-500">Netfang</span>
                        <input
                          type="email" maxLength={320}
                          value={editSubDraft.email ?? ''}
                          onChange={(e) => setEditSubDraft((d) => ({ ...d, email: e.target.value || null }))}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#2d5a27]"
                        />
                      </label>
                      <div className="flex gap-2 ml-auto items-center">
                        {editSubError && <p className="text-xs text-red-600 max-w-xs">{editSubError}</p>}
                        <button
                          type="button"
                          onClick={() => { setEditingSubId(null); setEditSubDraft({}); setEditSubError('') }}
                          className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 hover:border-gray-400 transition-colors"
                        >
                          Hætta við
                        </button>
                        <button type="submit" className="text-xs bg-[#154212] text-white rounded-lg px-3 py-1.5 hover:bg-[#2d5a27] transition-colors">
                          Vista
                        </button>
                      </div>
                    </div>
                  </form>
                )}

                {creatingIdeaSubId === sub.id && (
                  <form
                    onSubmit={(e) => { e.preventDefault(); createIdeaFromSub(sub.id) }}
                    className="mt-4 pt-4 border-t border-gray-100 flex flex-col gap-3"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-gray-500">Titill hugmyndar</span>
                        <input
                          type="text" maxLength={200} required
                          value={createIdeaDraft.title}
                          onChange={(e) => {
                            const title = e.target.value
                            setCreateIdeaDraft((d) => ({
                              ...d,
                              title,
                              slug: d.slug === toSlug(d.title) ? toSlug(title) : d.slug,
                            }))
                          }}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-green-400"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-gray-500">Slug</span>
                        <input
                          type="text" maxLength={200} required
                          value={createIdeaDraft.slug}
                          onChange={(e) => setCreateIdeaDraft((d) => ({ ...d, slug: toSlug(e.target.value) }))}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-green-400"
                        />
                      </label>
                    </div>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-gray-500">Stutt lýsing (valkvætt, tekur titil ef autt)</span>
                      <input
                        type="text" maxLength={500}
                        value={createIdeaDraft.short_description}
                        onChange={(e) => setCreateIdeaDraft((d) => ({ ...d, short_description: e.target.value }))}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-green-400"
                      />
                    </label>
                    <div className="flex gap-2 items-center">
                      {createIdeaError && <p className="text-xs text-red-600 max-w-xs">{createIdeaError}</p>}
                      <div className="flex gap-2 ml-auto">
                        <button
                          type="button"
                          onClick={() => { setCreatingIdeaSubId(null); setCreateIdeaDraft({ title: '', slug: '', short_description: '' }); setCreateIdeaError('') }}
                          className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 hover:border-gray-400 transition-colors"
                        >
                          Hætta við
                        </button>
                        <button type="submit" className="text-xs bg-green-600 text-white rounded-lg px-3 py-1.5 hover:bg-green-700 transition-colors">
                          Búa til hugmynd
                        </button>
                      </div>
                    </div>
                  </form>
                )}
              </div>
            )})}
          </div>
        )}

        {tab === 'stats' && (
          <div>
            <div className="flex gap-2 mb-6">
              {(['7d', '30d', 'all'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    period === p
                      ? 'bg-gray-800 text-white border-gray-800'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                  }`}
                >
                  {p === '7d' ? '7 dagar' : p === '30d' ? '30 dagar' : 'Allt'}
                </button>
              ))}
            </div>

            {statsLoading || !analytics ? (
              <p className="text-sm text-gray-400">Hleður tölfræði...</p>
            ) : (
              <div className="flex flex-col gap-6">
                {/* Summary cards */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {[
                    { label: 'Einstaklingar', value: analytics.summary.unique_visitors },
                    { label: 'Síðuskoðanir', value: analytics.summary.total_page_views },
                    { label: 'Atkvæði', value: analytics.summary.total_votes },
                    { label: 'Fylgjendur', value: analytics.summary.total_follows },
                    { label: 'Innsendingar', value: analytics.summary.total_submissions },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-white border border-[#c2c9bb] rounded-xl shadow-sm p-4">
                      <p className="text-2xl font-semibold text-gray-900">{value}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>

                {/* Top ideas */}
                {analytics.top_ideas.length > 0 && (
                  <div className="bg-white border border-[#c2c9bb] rounded-xl shadow-sm p-5">
                    <h2 className="text-sm font-semibold text-gray-700 mb-4">Vinsælustu hugmyndirnar</h2>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="text-gray-400 border-b border-gray-100">
                            <th className="pb-2 pr-4 font-medium">Hugmynd</th>
                            <th className="pb-2 pr-4 font-medium text-right">Skoðanir</th>
                            <th className="pb-2 pr-4 font-medium text-right">Einstaklingar</th>
                            <th className="pb-2 pr-4 font-medium text-right">Atkvæði</th>
                            <th className="pb-2 font-medium text-right">Umreikningur</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analytics.top_ideas.map((idea) => (
                            <tr key={idea.id} className="border-b border-gray-50 last:border-0">
                              <td className="py-2 pr-4 text-gray-700 max-w-[180px] truncate">{idea.title}</td>
                              <td className="py-2 pr-4 text-right text-gray-500">{idea.views}</td>
                              <td className="py-2 pr-4 text-right text-gray-500">{idea.unique_views}</td>
                              <td className="py-2 pr-4 text-right text-gray-500">{idea.votes}</td>
                              <td className="py-2 text-right text-gray-500">
                                {Math.round(idea.conversion * 100)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Breakdowns */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-white border border-[#c2c9bb] rounded-xl shadow-sm p-5">
                    <h2 className="text-sm font-semibold text-gray-700 mb-3">Tæki</h2>
                    <BreakdownList data={analytics.devices} />
                  </div>
                  <div className="bg-white border border-[#c2c9bb] rounded-xl shadow-sm p-5">
                    <h2 className="text-sm font-semibold text-gray-700 mb-3">Vafri</h2>
                    <BreakdownList data={analytics.browsers} />
                  </div>
                  <div className="bg-white border border-[#c2c9bb] rounded-xl shadow-sm p-5">
                    <h2 className="text-sm font-semibold text-gray-700 mb-3">Land</h2>
                    <BreakdownList data={analytics.countries} />
                  </div>
                  <div className="bg-white border border-[#c2c9bb] rounded-xl shadow-sm p-5">
                    <h2 className="text-sm font-semibold text-gray-700 mb-3">Uppspretta</h2>
                    <BreakdownList data={analytics.top_referrers} />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
