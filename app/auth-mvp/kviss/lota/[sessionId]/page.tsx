import { KvissLiveClient, type KvissLiveView } from '@/components/kviss/KvissLiveClient'
import { ClosedTestingBanner } from '@/components/teskeid/ClosedTestingBanner'
import { resolveTeskeidFeatureRollout } from '@/lib/teskeid/featureRollout.server'

const VIEW_FROM_QUERY: Record<string, KvissLiveView> = {
  stillingar: 'settings',
  flytjandi: 'performer',
  ahorfendur: 'audience',
}

export default async function KvissLivePage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ sessionId }, query] = await Promise.all([
    params,
    searchParams ?? Promise.resolve<Record<string, string | string[] | undefined>>({}),
  ])
  const rawView = Array.isArray(query.syn) ? query.syn[0] : query.syn
  const rawPresentation = Array.isArray(query.skjar) ? query.skjar[0] : query.skjar
  const initialView = rawView ? VIEW_FROM_QUERY[rawView] ?? 'settings' : 'settings'
  const presentation = rawPresentation === '1' && initialView === 'audience'
  const showClosedTestingBanner = !presentation
    && resolveTeskeidFeatureRollout('kviss') === 'closed-testing'

  return (
    <main className={presentation
      ? 'min-h-screen bg-[#0b150b] p-2 sm:p-4'
      : 'min-h-screen bg-background px-4 py-6'}
    >
      <div className={presentation
        ? 'mx-auto w-full max-w-6xl'
        : 'mx-auto w-full max-w-3xl pb-[calc(1.5rem+env(safe-area-inset-bottom))]'}
      >
        {showClosedTestingBanner ? <ClosedTestingBanner className="mb-6" /> : null}
        <KvissLiveClient
          sessionId={sessionId}
          initialView={initialView}
          presentation={presentation}
        />
      </div>
    </main>
  )
}
