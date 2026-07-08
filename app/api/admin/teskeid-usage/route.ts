import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdmin } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/teskeid/admin-auth'

const ALLOWED_PERIODS: Record<string, number> = {
  '5min':  5 * 60 * 1000,
  '10min': 10 * 60 * 1000,
  '15min': 15 * 60 * 1000,
  '30min': 30 * 60 * 1000,
  '1h':    60 * 60 * 1000,
  '2h':    2 * 60 * 60 * 1000,
  '6h':    6 * 60 * 60 * 1000,
  '12h':   12 * 60 * 60 * 1000,
  '24h':   24 * 60 * 60 * 1000,
  '7d':    7 * 24 * 60 * 60 * 1000,
  '30d':   30 * 24 * 60 * 60 * 1000,
  'all':   0,
}

const FEATURE_LABELS: Record<string, string> = {
  vedrid: 'Veðrið',
  minnid: 'Minnið',
  tengsl: 'Tengsl',
  umonnun: 'Umönnun',
}

const ALL_FEATURES = ['vedrid', 'minnid', 'tengsl', 'umonnun'] as const

type UsageRow = {
  user_id: string | null
  feature_key: string
  event_name: string
  metadata: Record<string, unknown>
  created_at: string
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const result: Record<string, number> = {}
  for (const item of items) {
    const k = key(item)
    result[k] = (result[k] ?? 0) + 1
  }
  return result
}

function dailyCounts(rows: UsageRow[]): { date: string; count: number }[] {
  const byDate: Record<string, number> = {}
  for (const r of rows) {
    const d = r.created_at.slice(0, 10)
    byDate[d] = (byDate[d] ?? 0) + 1
  }
  return Object.entries(byDate)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const auth = await requireAdmin(supabase)
  if (auth.error) return auth.error

  const { searchParams } = request.nextUrl
  const period = searchParams.get('period') ?? '7d'

  if (!(period in ALLOWED_PERIODS)) {
    return NextResponse.json({ error: 'Invalid period' }, { status: 400 })
  }

  const ms = ALLOWED_PERIODS[period]
  const since = ms > 0 ? new Date(Date.now() - ms).toISOString() : null

  let query = getAdmin()
    .from('teskeid_usage_events')
    .select('user_id,feature_key,event_name,metadata,created_at')
    .order('created_at', { ascending: false })

  if (since) query = query.gte('created_at', since)

  const { data, error } = await query

  if (error) {
    // Detect missing table (migration 71 not yet run) and return a calm zero-state
    const isMissingTable = error.code === '42P01' ||
      (typeof error.message === 'string' && error.message.includes('does not exist'))
    if (isMissingTable) {
      return NextResponse.json({
        migration_missing: true,
        fingerprinting_enabled: !!process.env.USAGE_EVENT_SECRET,
        summary: {
          total_events: 0, unique_users: 0, active_features: 0,
          weather_route_calculations: 0, weather_distinct_route_pairs: 0,
          weather_final_forecasts: 0, weather_route_to_result_conversion: 0,
        },
        features: [],
        weather: {
          route_options_calculated: 0, route_options_failed: 0,
          distinct_route_pairs: 0, final_forecast_completed: 0,
          final_forecast_failed: 0, route_to_result_conversion: 0,
          route_count_buckets: {}, curated_route_labels: {},
        },
        events_over_time: [],
      })
    }
    console.error('[api/admin/teskeid-usage] query failed')
    return NextResponse.json({ error: 'Query failed' }, { status: 500 })
  }

  const events = (data ?? []) as UsageRow[]

  const totalEvents = events.length
  const uniqueUsers = new Set(events.map(e => e.user_id).filter(Boolean)).size
  const activeFeatures = new Set(events.map(e => e.feature_key)).size

  const weatherEvents = events.filter(e => e.feature_key === 'vedrid')
  const weatherByName = countBy(weatherEvents, e => e.event_name)

  const routeCalcEvents = weatherEvents.filter(e => e.event_name === 'weather_route_options_calculated')
  const distinctPairHashes = new Set(
    routeCalcEvents
      .map(e => e.metadata?.routePairHash)
      .filter((h): h is string => typeof h === 'string'),
  )

  const weatherRouteCalcs = routeCalcEvents.length
  const weatherFinalForecasts = weatherByName['weather_final_forecast_completed'] ?? 0
  const weatherDistinctPairs = distinctPairHashes.size
  const weatherConversion = weatherRouteCalcs > 0
    ? Math.round((weatherFinalForecasts / weatherRouteCalcs) * 1000) / 1000
    : 0

  const curatedLabelCounts: Record<string, number> = {}
  for (const evt of routeCalcEvents) {
    const labels = evt.metadata?.curatedRouteLabels
    if (Array.isArray(labels)) {
      for (const label of labels) {
        if (typeof label === 'string') {
          curatedLabelCounts[label] = (curatedLabelCounts[label] ?? 0) + 1
        }
      }
    }
  }

  const routeCountBuckets: Record<string, number> = {}
  for (const evt of routeCalcEvents) {
    const count = evt.metadata?.routeCount
    if (typeof count === 'number') {
      const bucket = count <= 3 ? String(count) : '4+'
      routeCountBuckets[bucket] = (routeCountBuckets[bucket] ?? 0) + 1
    }
  }

  const features = ALL_FEATURES.map(key => {
    const featureEvents = events.filter(e => e.feature_key === key)
    const featureUsers = new Set(featureEvents.map(e => e.user_id).filter(Boolean)).size
    return {
      feature_key: key,
      label: FEATURE_LABELS[key],
      total_events: featureEvents.length,
      unique_users: featureUsers,
      top_events: countBy(featureEvents, e => e.event_name),
    }
  })

  return NextResponse.json({
    fingerprinting_enabled: !!process.env.USAGE_EVENT_SECRET,
    summary: {
      total_events: totalEvents,
      unique_users: uniqueUsers,
      active_features: activeFeatures,
      weather_route_calculations: weatherRouteCalcs,
      weather_distinct_route_pairs: weatherDistinctPairs,
      weather_final_forecasts: weatherFinalForecasts,
      weather_route_to_result_conversion: weatherConversion,
    },
    features,
    weather: {
      route_options_calculated: weatherByName['weather_route_options_calculated'] ?? 0,
      route_options_failed: weatherByName['weather_route_options_failed'] ?? 0,
      distinct_route_pairs: weatherDistinctPairs,
      final_forecast_completed: weatherFinalForecasts,
      final_forecast_failed: weatherByName['weather_final_forecast_failed'] ?? 0,
      route_to_result_conversion: weatherConversion,
      route_count_buckets: routeCountBuckets,
      curated_route_labels: curatedLabelCounts,
    },
    events_over_time: dailyCounts(events),
  })
}
