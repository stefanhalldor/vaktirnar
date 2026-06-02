import type { IdeaStatus } from '@/lib/teskeid/types'

const STATUS_LABELS: Record<IdeaStatus, string> = {
  idea: 'Hugmynd',
  reviewing: 'Til skoðunar',
  planned: 'Á áætlun',
  building: 'Í smíðum',
  launched: 'Komið út',
  archived: 'Geymt',
}

const STATUS_STYLES: Record<IdeaStatus, string> = {
  idea: 'bg-gray-100 text-gray-500',
  reviewing: 'bg-blue-100 text-blue-600',
  planned: 'bg-violet-100 text-violet-600',
  building: 'bg-amber-100 text-amber-600',
  launched: 'bg-green-100 text-green-700',
  archived: 'bg-gray-100 text-gray-400',
}

export function StatusBadge({ status }: { status: IdeaStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}
