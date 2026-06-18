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

const ICON_COLORS = { bg: 'bg-[#2d5a27]', text: 'text-[#9dd090]' }

interface Props {
  idea: Idea
  href: string
  openLabel: string
  pendingBadge?: number
  pendingBadgeLabel?: string
}

export function ReadyTeskeidCard({ idea, href, openLabel, pendingBadge, pendingBadgeLabel }: Props) {
  const Icon = SLUG_ICONS[idea.slug] ?? CATEGORY_ICONS[idea.category] ?? Lightbulb

  return (
    <Link
      href={href}
      className="block bg-card border border-border rounded-xl p-4 hover:bg-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
    >
      <div className="flex items-center gap-2.5 mb-2">
        <div className={`p-2 rounded-lg ${ICON_COLORS.bg} shrink-0`}>
          <Icon size={18} className={ICON_COLORS.text} />
        </div>
        <span className="text-base font-semibold text-foreground">{idea.title}</span>
        {pendingBadge !== undefined && (
          <span
            className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-medium"
            aria-label={pendingBadgeLabel}
          >
            <span aria-hidden="true">{pendingBadge}</span>
          </span>
        )}
      </div>
      {idea.short_description && (
        <p className="text-sm text-muted-foreground mb-3 leading-relaxed">{idea.short_description}</p>
      )}
      <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
        {openLabel} <ArrowRight size={14} />
      </span>
    </Link>
  )
}
