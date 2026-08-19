import { permanentRedirect } from 'next/navigation'
import { householdChorePeoplePath } from '@/lib/household-chores/paths'

type LegacyPeopleSearchParams = Record<string, string | string[] | undefined>

export default async function LegacyHouseholdChorePeoplePage({
  params,
  searchParams,
}: {
  params: Promise<{ circleId: string }>
  searchParams: Promise<LegacyPeopleSearchParams>
}) {
  const [{ circleId }, query] = await Promise.all([params, searchParams])
  const target = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const item of value) target.append(key, item)
    } else if (value !== undefined) {
      target.set(key, value)
    }
  }

  const encoded = target.toString()
  permanentRedirect(
    encoded
      ? `${householdChorePeoplePath(circleId)}?${encoded}`
      : householdChorePeoplePath(circleId),
  )
}
