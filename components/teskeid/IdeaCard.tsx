import Link from 'next/link'
import {
  Handshake,
  Heart,
  Wallet,
  Baby,
  Home,
  Calendar,
  Clock,
  Lightbulb,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react'
import type { Idea } from '@/lib/teskeid/types'
import { StatusBadge } from './StatusBadge'
import { VoteButton } from './VoteButton'

const SLUG_ICONS: Record<string, LucideIcon> = {
  'lanad-og-skilad': Handshake,
  'maki-kaero': Heart,
  'utlagt-og-endurgreitt': Wallet,
  'krakkavaktin': Baby,
}

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  'Heimili': Home,
  'Börn': Baby,
  'Pör': Heart,
  'Umönnun': Heart,
  'Útgjöld': Wallet,
  'Lánað og skilað': Handshake,
  'Viðburðir': Calendar,
  'Minningar': Heart,
  'Vaktir og skipulag': Clock,
  'Annað': Lightbulb,
}

const ICON_VARIANTS = [
  { bg: 'bg-[#2d5a27]', text: 'text-[#9dd090]' },
  { bg: 'bg-[#ffdcc6]', text: 'text-[#703703]' },
  { bg: 'bg-[#dae5de]', text: 'text-[#5c6761]' },
  { bg: 'bg-[#a1d494]', text: 'text-[#23501e]' },
]

function getIcon(idea: Idea): LucideIcon {
  return SLUG_ICONS[idea.slug] ?? CATEGORY_ICONS[idea.category] ?? Lightbulb
}

export function IdeaCard({ idea, index }: { idea: Idea; index: number }) {
  const Icon = getIcon(idea)
  const colors = ICON_VARIANTS[index % ICON_VARIANTS.length]

  return (
    <article className="bg-white/70 backdrop-blur-sm rounded-xl border border-black/5 shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex flex-col transition-all duration-200 hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] hover:border-[#c2c9bb]">
      <Link
        href={`/hugmyndir/${idea.slug}`}
        className="flex flex-col gap-3 p-4 flex-1 rounded-t-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#154212] focus-visible:ring-inset"
      >
        <div className="flex justify-between items-start">
          <div className={`p-2 rounded-lg ${colors.bg}`}>
            <Icon size={20} className={colors.text} />
          </div>
          <StatusBadge status={idea.status} />
        </div>

        <div>
          <h3 className="text-xl font-medium text-[#154212] leading-[28px] mb-1">
            {idea.title}
          </h3>
          <p className="text-base text-[#42493e] leading-[24px]">
            {idea.short_description}
          </p>
        </div>

        <span className="inline-flex items-center gap-1 text-sm font-medium text-[#154212] mt-1">
          Sjá nánar <ArrowRight size={14} />
        </span>
      </Link>

      <div className="px-4 pb-4 pt-3 border-t border-black/5">
        <VoteButton ideaId={idea.id} initialCount={idea.votes_count} variant="stitch" />
      </div>
    </article>
  )
}
