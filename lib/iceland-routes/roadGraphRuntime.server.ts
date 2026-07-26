import 'server-only'

import { buildIcelandRoadGraph } from './roadGraph'
import type { IcelandRoadGraph } from './roadGraphTypes'
import { fetchVegagerdinRoadGraphSegments } from './vegagerdinRoadGraphSource.server'

const CACHE_TTL_MS = 6 * 60 * 60 * 1000
let cached: { graph: IcelandRoadGraph; loadedAt: number } | null = null
let pending: Promise<IcelandRoadGraph> | null = null

export async function getIcelandRoadGraph(options: { forceRefresh?: boolean } = {}): Promise<IcelandRoadGraph> {
  const now = Date.now()
  if (!options.forceRefresh && cached && now - cached.loadedAt < CACHE_TTL_MS) return cached.graph
  if (pending) return pending
  pending = fetchVegagerdinRoadGraphSegments()
    .then(segments => buildIcelandRoadGraph(segments, { nodeSnapToleranceM: 20 }))
    .then(graph => {
      cached = { graph, loadedAt: Date.now() }
      return graph
    })
    .catch(error => {
      if (cached) return cached.graph
      throw error
    })
    .finally(() => { pending = null })
  return pending
}

export function resetIcelandRoadGraphCacheForTests(): void {
  cached = null
  pending = null
}
