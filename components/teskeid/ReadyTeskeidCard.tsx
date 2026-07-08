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
  CloudSun,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react'
import type { Idea } from '@/lib/teskeid/types'

const SLUG_ICONS: Record<string, LucideIcon> = {
  'lanad-og-skilad': Handshake,
  'maki-kaero': Heart,
  'utlagt-og-endurgreitt': Wallet,
  'krakkavaktin': Baby,
  'vedrid': CloudSun,
  'umonnun': Heart,
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

const SLUG_COLORS: Record<string, { bg: string; text: string }> = {
  'lanad-og-skilad': { bg: 'bg-[#e9f4e6]', text: 'text-[#2d5a27]' },
  'vedrid':          { bg: 'bg-[#eef7f7]', text: 'text-[#1f6f78]' },
  'umonnun':         { bg: 'bg-rose-50',   text: 'text-rose-700'   },
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  'Umönnun': { bg: 'bg-rose-50', text: 'text-rose-700' },
}

const DEFAULT_COLORS = { bg: 'bg-[#e9f4e6]', text: 'text-[#2d5a27]' }

interface Props {
  idea: Idea
  href: string
  openLabel: string
  pendingBadge?: number
  pendingBadgeLabel?: string
}

export function ReadyTeskeidCard({ idea, href, openLabel, pendingBadge, pendingBadgeLabel }: Props) {
  const Icon = SLUG_ICONS[idea.slug] ?? CATEGORY_ICONS[idea.category] ?? Lightbulb
  const colors = SLUG_COLORS[idea.slug] ?? CATEGORY_COLORS[idea.category] ?? DEFAULT_COLORS

  return (
    <Link
      href={href}
      aria-label={`${openLabel} ${idea.title}`}
      className="flex items-center gap-3 bg-card border border-border rounded-xl p-4 hover:bg-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
    >
      <div className={`p-2.5 rounded-lg ${colors.bg} shrink-0`}>
        <Icon size={20} className={colors.text} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{idea.title}</span>
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
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{idea.short_description}</p>
        )}
      </div>
      <ChevronRight size={16} className="shrink-0 text-muted-foreground/50" />
    </Link>
  )
}
