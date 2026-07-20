'use client'

import { useTranslations } from 'next-intl'
import { resolveRoadIntelligence } from '@/lib/iceland-routes'

type Props = {
  fromPlaceKey: string
  toPlaceKey: string
  fromLabel: string
  toLabel: string
}

/**
 * Experimental read-only Road Intelligence panel.
 * Only rendered when the user has the 'road-intelligence-v1' feature flag.
 * Shows curated route alternatives and cautions from the Teskeið static registry.
 * Never affects map filtering or station selection.
 */
export function RoadIntelligencePreview({ fromPlaceKey, toPlaceKey, fromLabel, toLabel }: Props) {
  const t = useTranslations('teskeid.vedrid.overview')

  const result = resolveRoadIntelligence(fromPlaceKey, toPlaceKey)

  if (result.status === 'unknown' || result.alternatives.length === 0) return null

  const cautionSeverityClass = (severity: 'info' | 'caution' | 'danger') => {
    if (severity === 'danger') return 'bg-destructive/10 text-destructive'
    if (severity === 'caution') return 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
    return 'bg-muted text-muted-foreground'
  }

  // Deduplicate cautions by tag so the same caution type doesn't repeat across alternatives
  const seenTags = new Set<string>()
  const uniqueCautions = result.cautions.filter(c => {
    if (seenTags.has(c.tag)) return false
    seenTags.add(c.tag)
    return true
  })

  return (
    <div className="flex flex-col gap-2 pt-3 border-t border-border/40">
      <div className="flex items-center gap-2">
        <p className="text-[11px] font-semibold text-foreground/70">{t('roadIntelligenceTitle')}</p>
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary">
          {t('roadIntelligenceBadge')}
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground/60 -mt-1">
        {fromLabel} — {toLabel} · {t('roadIntelligenceConfidenceDraft')}
      </p>

      {/* Alternatives */}
      <div className="flex flex-wrap gap-1.5">
        {result.alternatives.map(alt => (
          <span
            key={alt.id}
            className="text-[11px] px-2.5 py-1 rounded-full border border-border text-foreground/80 bg-background"
          >
            {alt.label}
          </span>
        ))}
      </div>

      {/* Cautions */}
      {uniqueCautions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-0.5">
          {uniqueCautions.map(c => (
            <span
              key={c.id}
              className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cautionSeverityClass(c.severity)}`}
            >
              {c.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
