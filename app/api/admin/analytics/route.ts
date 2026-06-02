import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdmin } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/teskeid/admin-auth'

type Event = {
  visitor_hash: string
  event_type: string
  path: string
  idea_id: string | null
  referrer: string | null
  device_type: string | null
  browser: string | null
  country: string | null
  created_at: string
}

type Idea = {
  id: string
  title: string
  slug: string
}

function periodFilter(period: string): string | null {
  if (period === '7d') return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  if (period === '30d') return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  return null
}

function countBy<T>(items: T[], key: (item: T) => string | null): Record<string, number> {
  const result: Record<string, number> = {}
  for (const item of items) {
    const k = key(item) ?? '(unknown)'
    result[k] = (result[k] ?? 0) + 1
  }
  return result
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const auth = await requireAdmin(supabase)
  if (auth.error) return auth.error

  const period = request.nextUrl.searchParams.get('period') ?? '7d'

  let query = getAdmin()
    .from('analytics_events')
    .select('visitor_hash,event_type,path,idea_id,referrer,device_type,browser,country,created_at')
    .order('created_at', { ascending: false })

  const since = periodFilter(period)
  if (since) {
    query = query.gte('created_at', since)
  }

  const { data: events, error } = await query

  if (error) {
    console.error('[api/admin/analytics] query error:', error.message)
    return NextResponse.json({ error: 'Query failed' }, { status: 500 })
  }

  const rows = (events ?? []) as Event[]

  // Fetch idea titles for top_ideas table
  const ideaIds = [...new Set(rows.map((e) => e.idea_id).filter(Boolean))] as string[]
  let ideaMap: Record<string, { title: string; slug: string }> = {}

  if (ideaIds.length > 0) {
    const { data: ideas } = await getAdmin()
      .from('ideas')
      .select('id,title,slug')
      .in('id', ideaIds)

    for (const idea of (ideas ?? []) as Idea[]) {
      ideaMap[idea.id] = { title: idea.title, slug: idea.slug }
    }
  }

  // Summary
  const pageViews = rows.filter((e) => e.event_type === 'page_view')
  const votes = rows.filter((e) => e.event_type === 'vote')
  const follows = rows.filter((e) => e.event_type === 'follow')
  const submits = rows.filter((e) => e.event_type === 'submit')
  const uniqueVisitors = new Set(rows.map((e) => e.visitor_hash)).size

  // Top ideas
  const byIdea: Record<string, { views: number; uniqueViewers: Set<string>; votes: number; follows: number }> = {}
  for (const id of ideaIds) {
    byIdea[id] = { views: 0, uniqueViewers: new Set(), votes: 0, follows: 0 }
  }
  for (const e of rows) {
    if (!e.idea_id) continue
    if (!byIdea[e.idea_id]) byIdea[e.idea_id] = { views: 0, uniqueViewers: new Set(), votes: 0, follows: 0 }
    if (e.event_type === 'page_view') {
      byIdea[e.idea_id].views++
      byIdea[e.idea_id].uniqueViewers.add(e.visitor_hash)
    } else if (e.event_type === 'vote') {
      byIdea[e.idea_id].votes++
    } else if (e.event_type === 'follow') {
      byIdea[e.idea_id].follows++
    }
  }

  const topIdeas = Object.entries(byIdea)
    .map(([id, stats]) => ({
      id,
      title: ideaMap[id]?.title ?? id,
      slug: ideaMap[id]?.slug ?? id,
      views: stats.views,
      unique_views: stats.uniqueViewers.size,
      votes: stats.votes,
      follows: stats.follows,
      conversion: stats.uniqueViewers.size > 0 ? Math.round((stats.votes / stats.uniqueViewers.size) * 1000) / 1000 : 0,
    }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 20)

  // Daily counts (last N days)
  function dailyCounts(evts: Event[]): { date: string; count: number }[] {
    const byDate: Record<string, number> = {}
    for (const e of evts) {
      const d = e.created_at.slice(0, 10)
      byDate[d] = (byDate[d] ?? 0) + 1
    }
    return Object.entries(byDate)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }

  return NextResponse.json({
    summary: {
      unique_visitors: uniqueVisitors,
      total_page_views: pageViews.length,
      total_votes: votes.length,
      total_follows: follows.length,
      total_submissions: submits.length,
    },
    votes_over_time: dailyCounts(votes),
    follows_over_time: dailyCounts(follows),
    submissions_over_time: dailyCounts(submits),
    top_ideas: topIdeas,
    devices: countBy(rows, (e) => e.device_type),
    browsers: countBy(rows, (e) => e.browser),
    countries: countBy(rows, (e) => e.country),
    top_referrers: countBy(rows, (e) => e.referrer ?? '(direct)'),
  })
}
