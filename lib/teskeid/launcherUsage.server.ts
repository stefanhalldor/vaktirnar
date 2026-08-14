import 'server-only'

import { createHmac } from 'crypto'
import { getAdmin } from '@/lib/supabase/admin'
import {
  TESKEID_LAUNCHER_CATALOG,
  isTeskeidLauncherId,
  type TeskeidLauncherId,
} from './launcherCatalog'

export const TESKEID_OPENED_EVENT = 'teskeid_opened'
const LAUNCHER_DAILY_WRITE_LIMIT = 500

interface LauncherUsageRow {
  feature_key: string
  created_at: string
}

export interface LauncherUsageOrder {
  ids: TeskeidLauncherId[]
  available: boolean
}

export function orderTeskeidLauncherIds(
  visibleIds: readonly TeskeidLauncherId[],
  rows: readonly LauncherUsageRow[],
): TeskeidLauncherId[] {
  const visible = new Set(visibleIds)
  const newest = new Map<TeskeidLauncherId, number>()
  for (const row of rows) {
    if (!isTeskeidLauncherId(row.feature_key) || !visible.has(row.feature_key)) continue
    const timestamp = Date.parse(row.created_at)
    if (!Number.isFinite(timestamp)) continue
    const previous = newest.get(row.feature_key)
    if (previous === undefined || timestamp > previous) newest.set(row.feature_key, timestamp)
  }

  return [...visibleIds].sort((left, right) => {
    const leftUsed = newest.get(left)
    const rightUsed = newest.get(right)
    if (leftUsed !== undefined && rightUsed !== undefined && leftUsed !== rightUsed) {
      return rightUsed - leftUsed
    }
    if (leftUsed !== undefined) return -1
    if (rightUsed !== undefined) return 1
    return TESKEID_LAUNCHER_CATALOG.find((item) => item.id === left)!.fallbackRank
      - TESKEID_LAUNCHER_CATALOG.find((item) => item.id === right)!.fallbackRank
  })
}

export async function readTeskeidLauncherOrder(
  userId: string,
  visibleIds: readonly TeskeidLauncherId[],
): Promise<LauncherUsageOrder> {
  if (visibleIds.length === 0) return { ids: [], available: true }
  try {
    const admin = getAdmin()
    const results = await Promise.all(visibleIds.map((featureId) => admin
      .from('teskeid_usage_events')
      .select('feature_key, created_at')
      .eq('user_id', userId)
      .eq('event_name', TESKEID_OPENED_EVENT)
      .eq('feature_key', featureId)
      .order('created_at', { ascending: false })
      .limit(1)))
    if (results.some(({ error }) => error)) return { ids: [...visibleIds], available: false }
    const rows = results.flatMap(({ data }) => (data ?? []) as LauncherUsageRow[])
    return {
      ids: orderTeskeidLauncherIds(visibleIds, rows),
      available: true,
    }
  } catch {
    return { ids: [...visibleIds], available: false }
  }
}

export type RecordLauncherOpenResult = 'recorded' | 'same-latest' | 'rate-limited' | 'unavailable'

async function allowLauncherUsageWrite(
  admin: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<boolean> {
  const secret = process.env.AUTH_CODE_SECRET
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) return false
  const windowDate = new Date().toLocaleDateString('sv-SE', { timeZone: 'Atlantic/Reykjavik' })
  const userHash = createHmac('sha256', secret).update(`launcher:${userId}`).digest('hex')
  try {
    const { data, error } = await admin.rpc('check_and_increment_ip_rate_limit', {
      p_ip_hash: userHash,
      p_window_date: windowDate,
      p_max_requests: LAUNCHER_DAILY_WRITE_LIMIT,
    })
    return !error && data === true
  } catch {
    return false
  }
}

export async function recordTeskeidLauncherOpen(
  userId: string,
  featureId: TeskeidLauncherId,
): Promise<RecordLauncherOpenResult> {
  try {
    const admin = getAdmin()
    const { data, error } = await admin
      .from('teskeid_usage_events')
      .select('feature_key, created_at')
      .eq('user_id', userId)
      .eq('event_name', TESKEID_OPENED_EVENT)
      .order('created_at', { ascending: false })
      .limit(1)
    if (error) return 'unavailable'

    const rows = (data ?? []) as LauncherUsageRow[]
    const latest = rows.find((row) => isTeskeidLauncherId(row.feature_key))
    if (latest?.feature_key === featureId) return 'same-latest'

    if (!await allowLauncherUsageWrite(admin, userId)) return 'rate-limited'

    const { error: insertError } = await admin
      .from('teskeid_usage_events')
      .insert({
        user_id: userId,
        feature_key: featureId,
        event_name: TESKEID_OPENED_EVENT,
        path: '',
        metadata: {},
      })
    return insertError ? 'unavailable' : 'recorded'
  } catch {
    return 'unavailable'
  }
}
