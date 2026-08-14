import type { TeskeidLauncherId } from './launcherCatalog'

type LauncherTransport = (featureId: TeskeidLauncherId, commitProof: string) => Promise<void>

export type LauncherCommitStatus = 'committed' | 'failed' | 'timed-out'

export interface LauncherCommitSignal {
  waitForCompletion: (timeoutMs?: number) => Promise<LauncherCommitStatus>
}

export interface LauncherCommitSignalController extends LauncherCommitSignal {
  start: (completion: Promise<boolean>) => void
}

const TRANSPORT_TIMEOUT_MS = 1_500
let transportTail: Promise<void> = Promise.resolve()
const scheduledCommits = new Map<string, Promise<boolean>>()

async function browserTransport(featureId: TeskeidLauncherId, commitProof: string): Promise<void> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), TRANSPORT_TIMEOUT_MS)
  try {
    const response = await fetch('/api/auth-mvp/launcher', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ featureId, commitProof }),
      keepalive: true,
      signal: controller.signal,
    })
    if (!response.ok) throw new Error('launcher_commit_rejected')
  } finally {
    window.clearTimeout(timeoutId)
  }
}

function runBoundedTransport(
  featureId: TeskeidLauncherId,
  commitProof: string,
  transport: LauncherTransport,
): Promise<boolean> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<boolean>((resolve) => {
    timeoutId = setTimeout(() => resolve(false), TRANSPORT_TIMEOUT_MS)
  })
  return Promise.race([
    transport(featureId, commitProof).then(() => true, () => false),
    timeout,
  ]).finally(() => {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
  })
}

export function createTeskeidLauncherCommitSignal(): LauncherCommitSignalController {
  let resolveStarted!: (completion: boolean | PromiseLike<boolean>) => void
  let started = false
  const completion = new Promise<boolean>((resolve) => {
    resolveStarted = resolve
  })

  return {
    start(pending) {
      if (started) return
      started = true
      resolveStarted(pending)
    },
    async waitForCompletion(timeoutMs) {
      const settled = completion.then((committed): LauncherCommitStatus => (
        committed ? 'committed' : 'failed'
      ))
      if (timeoutMs === undefined) return settled
      let timeoutId: ReturnType<typeof setTimeout> | undefined
      const timedOut = new Promise<LauncherCommitStatus>((resolve) => {
        timeoutId = setTimeout(() => resolve('timed-out'), timeoutMs)
      })
      return Promise.race([
        settled,
        timedOut,
      ]).finally(() => {
        if (timeoutId !== undefined) clearTimeout(timeoutId)
      })
    },
  }
}

export function enqueueTeskeidLauncherCommit(
  featureId: TeskeidLauncherId,
  commitToken: string,
  commitProof: string,
  transport: LauncherTransport = browserTransport,
): Promise<boolean> {
  const scheduledToken = `${commitProof}:${commitToken}`
  const existing = scheduledCommits.get(scheduledToken)
  if (existing) return existing

  const completion = transportTail
    .catch(() => undefined)
    .then(() => runBoundedTransport(featureId, commitProof, transport))
  scheduledCommits.set(scheduledToken, completion)
  transportTail = completion
    .then(() => undefined)
    .finally(() => scheduledCommits.delete(scheduledToken))
  return completion
}

export async function flushTeskeidLauncherCommitsForTests(): Promise<void> {
  await transportTail
}

export function resetTeskeidLauncherCommitsForTests(): void {
  transportTail = Promise.resolve()
  scheduledCommits.clear()
}
