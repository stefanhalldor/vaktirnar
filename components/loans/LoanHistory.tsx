import type { LoanHistoryItem } from '@/lib/loans/history.server'

interface Labels {
  title: string
  empty: string
}

interface Props {
  rows: LoanHistoryItem[]
  labels: Labels
}

export function LoanHistory({ rows, labels }: Props) {
  return (
    <section aria-label={labels.title} className="pt-6 border-t border-border">
      <h2 className="text-sm font-medium text-muted-foreground mb-3">{labels.title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{labels.empty}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {rows.map((row, i) => (
            <li key={i} className="flex flex-col gap-0.5">
              <p className="text-sm text-foreground">{row.label}</p>
              <p className="text-xs text-muted-foreground">{row.occurredAtLabel}</p>
              {row.detailLines.map((line, j) => (
                <p key={j} className="text-xs text-muted-foreground pl-2 border-l border-border">{line}</p>
              ))}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
