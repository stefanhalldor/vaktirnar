import 'server-only'

type Window = { startedAt: number; count: number }

const windows = new Map<string, Window>()
const WINDOW_MS = 5 * 60_000
const MAX_ATTEMPTS = 10
const MAX_TRACKED_WINDOWS = 5_000

/**
 * Best-effort edge abuse control. The pairing code itself is short-lived,
 * high-entropy and HMAC-protected; this in-memory limit is an extra guard, not
 * the authorization boundary. It deliberately stores no request body/code.
 */
export function allowPairingAttempt(ip: string, now = Date.now()): boolean {
  const key = ip || 'unknown'
  const current = windows.get(key)
  if (!current || now - current.startedAt >= WINDOW_MS) {
    if (!current && windows.size >= MAX_TRACKED_WINDOWS) {
      for (const [trackedKey, tracked] of windows) {
        if (now - tracked.startedAt >= WINDOW_MS) windows.delete(trackedKey)
      }
      // Never let spoofed unique forwarding values grow process memory without
      // bound. Existing callers continue to receive their normal window.
      if (windows.size >= MAX_TRACKED_WINDOWS) return false
    }
    windows.set(key, { startedAt: now, count: 1 })
    return true
  }
  current.count += 1
  return current.count <= MAX_ATTEMPTS
}

export function resetPairingRateLimitsForTests(): void {
  windows.clear()
}
