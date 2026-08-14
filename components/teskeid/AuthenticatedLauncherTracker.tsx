'use client'

import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { trackedTeskeidLauncherIdFromPathname } from '@/lib/teskeid/launcherCatalog'
import {
  createTeskeidLauncherCommitSignal,
  enqueueTeskeidLauncherCommit,
  type LauncherCommitSignal,
} from '@/lib/teskeid/launcherTracker'

let nextCommitId = 0

interface AuthenticatedLauncherTrackerProps {
  commitProof: string | null
  children?: ReactNode
}

const LauncherCommitContext = createContext<LauncherCommitSignal | null>(null)

export function useTeskeidLauncherCommitSignal(): LauncherCommitSignal | null {
  return useContext(LauncherCommitContext)
}

export function AuthenticatedLauncherTracker({
  commitProof,
  children,
}: AuthenticatedLauncherTrackerProps) {
  const pathname = usePathname()
  const featureId = trackedTeskeidLauncherIdFromPathname(pathname)
  const { commitToken, commitSignal } = useMemo(() => {
    nextCommitId += 1
    return {
      commitToken: `launcher-commit-${nextCommitId}:${pathname}`,
      commitSignal: featureId && commitProof ? createTeskeidLauncherCommitSignal() : null,
    }
  }, [commitProof, featureId, pathname])

  useEffect(() => {
    if (featureId && commitProof && commitSignal) {
      commitSignal.start(enqueueTeskeidLauncherCommit(featureId, commitToken, commitProof))
    }
  }, [commitProof, commitSignal, commitToken, featureId])

  return (
    <LauncherCommitContext.Provider value={commitSignal}>
      {children}
    </LauncherCommitContext.Provider>
  )
}
