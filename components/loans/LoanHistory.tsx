import type { LoanHistoryItem } from '@/lib/loans/history.server'
import { LoanChatForm, type ChatLabels } from './LoanChatForm'

interface Labels {
  title: string
  empty: string
}

interface Props {
  rows: LoanHistoryItem[]
  labels: Labels
  loanId: string
  chatLabels: ChatLabels
}

export function LoanHistory({ rows, labels, loanId, chatLabels }: Props) {
  return (
    <section
      aria-label={labels.title}
      className="bg-[#f0f0ed] rounded-2xl p-4 flex flex-col gap-3"
    >
      <h2 className="text-xs font-medium text-[#72796e] uppercase tracking-wide">{labels.title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-[#72796e]">{labels.empty}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {rows.map((row, i) => (
            <li key={i} className="flex flex-col gap-0.5">
              <p className="text-sm text-[#1b1c19]">{row.label}</p>
              <p className="text-xs text-[#72796e]">{row.occurredAtLabel}</p>
              {row.actorLabel && (
                <p className="text-xs text-[#72796e]">{row.actorLabel}</p>
              )}
              {row.chatBody !== undefined && (
                <p className="text-sm text-[#1b1c19] whitespace-pre-wrap mt-0.5">{row.chatBody}</p>
              )}
              {row.detailLines.map((line, j) => (
                <p key={j} className="text-xs text-[#72796e] pl-2 border-l border-black/10">{line}</p>
              ))}
            </li>
          ))}
        </ol>
      )}
      <LoanChatForm loanId={loanId} labels={chatLabels} />
    </section>
  )
}
