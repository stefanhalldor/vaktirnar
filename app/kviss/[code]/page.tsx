import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { TeskeidLogo } from '@/components/teskeid/TeskeidLogo'
import { TeskeidMenu } from '@/components/teskeid/TeskeidMenu'
import { KvissParticipantClient } from '@/components/kviss/KvissParticipantClient'
import { KVISS_CODE_PATTERN, normalizeKvissCode } from '@/lib/kviss/contracts'

export default async function KvissSessionPage({ params }: { params: Promise<{ code: string }> }) {
  const raw = (await params).code
  const code = normalizeKvissCode(raw)
  if (!KVISS_CODE_PATTERN.test(code)) notFound()
  if (raw !== code) redirect(`/kviss/${code}`)
  const t = await getTranslations('kviss')
  return <main className="min-h-screen bg-background px-4 py-6"><div className="mx-auto flex w-full max-w-lg flex-col gap-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"><header className="flex items-center justify-between gap-3"><div><TeskeidLogo size={100} decorative /><p className="mt-1 font-mono text-sm font-semibold tracking-widest text-muted-foreground">{t('codeValue', { code })}</p></div><TeskeidMenu variant="public" /></header><KvissParticipantClient code={code} /></div></main>
}
