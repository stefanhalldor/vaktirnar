import 'server-only'

import {
  BookkeepingShell as BaseBookkeepingShell,
  type BookkeepingShellProps,
} from '@/components/bookkeeping/BookkeepingShell'
import { resolveTeskeidFeatureRollout } from '@/lib/teskeid/featureRollout.server'

type BookkeepingPrivateShellProps = Omit<BookkeepingShellProps, 'showClosedTestingBanner'>

/** Guarded server wrapper. The route layout owns access; this wrapper owns rollout UI. */
export function BookkeepingShell(props: BookkeepingPrivateShellProps) {
  const showClosedTestingBanner =
    resolveTeskeidFeatureRollout('bokhaldid') === 'closed-testing'

  return (
    <BaseBookkeepingShell
      {...props}
      showClosedTestingBanner={showClosedTestingBanner}
    />
  )
}
