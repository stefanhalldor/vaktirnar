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
  idea: 'bg-[#e4e2dd] text-[#42493e]',
  reviewing: 'bg-[#e4e2dd] text-[#42493e]',
  planned: 'bg-[#dae5de] text-[#141e19]',
  building: 'bg-[#dae5de] text-[#141e19]',
  launched: 'bg-[#2d5a27] text-[#9dd090]',
  archived: 'bg-[#e4e2dd] text-[#72796e]',
}

export function StatusBadge({ status }: { status: IdeaStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}
