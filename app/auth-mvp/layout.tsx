import { AuthenticatedLauncherTracker } from '@/components/teskeid/AuthenticatedLauncherTracker'
import { createClient } from '@/lib/supabase/server'
import { issueTeskeidLauncherCommitProof } from '@/lib/teskeid/launcherCommitProof.server'

async function resolveLauncherCommitProof(): Promise<string | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user?.id && user.email ? issueTeskeidLauncherCommitProof(user.id) : null
  } catch {
    return null
  }
}

export default async function AuthMvpLayout({ children }: { children: React.ReactNode }) {
  const commitProof = await resolveLauncherCommitProof()
  return (
    <AuthenticatedLauncherTracker commitProof={commitProof}>
      {children}
    </AuthenticatedLauncherTracker>
  )
}
