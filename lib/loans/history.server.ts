import { getAdmin } from '@/lib/supabase/admin'
import {
  buildDetailLines,
  EVENT_TYPE_TO_KEY,
  formatEventTimestamp,
  pickLoanUpdatedLabelKey,
} from '@/lib/recent-events/display'
import type { LoanFieldChange } from '@/lib/recent-events/types'

export interface LoanHistoryItem {
  label: string
  occurredAtLabel: string
  detailLines: string[]
  actorLabel?: string
  chatBody?: string
}

interface RawHistoryRow {
  event_key: string
  event_type: string
  payload: { itemName?: string; changes?: LoanFieldChange[] }
  occurred_at: string
  actor_display_name: string | null
  row_kind: string       // 'event' | 'chat'
  chat_body: string | null
  chat_message_id: string | null
}

// Returns de-duplicated, chronological history for a loan (events + chat).
// Returns [] on any error — never throws.
export async function getLoanHistory(
  admin: ReturnType<typeof getAdmin>,
  loanId: string,
  actorId: string,
  tHome: (key: string, params?: Record<string, string>) => string,
  tLoans: (key: string, params?: Record<string, string>) => string,
  displayLocale: string,
): Promise<LoanHistoryItem[]> {
  try {
    const { data, error } = await admin.rpc('get_loan_event_history', {
      p_actor_id: actorId,
      p_loan_id:  loanId,
    })
    if (error || !data) {
      console.error('[loans/history] get_loan_event_history failed')
      return []
    }

    const rows = (data ?? []) as RawHistoryRow[]

    // De-duplicate by event_key in TypeScript as a second line of defence.
    // Chat rows have unique synthetic keys and are never deduplicated with events.
    const seen = new Set<string>()
    return rows
      .filter((row) => {
        if (seen.has(row.event_key)) return false
        seen.add(row.event_key)
        return true
      })
      .map((row) => {
        if (row.row_kind === 'chat') {
          // Chat row: show sender name as label, body as separate field
          const label = row.actor_display_name
            ? tLoans('history.chatLabel', { name: row.actor_display_name })
            : tLoans('history.chatLabelUnknown')
          return {
            label,
            occurredAtLabel: formatEventTimestamp(row.occurred_at, tLoans),
            detailLines:     [],
            chatBody:        row.chat_body ?? '',
          }
        }

        // Event row
        const itemName = row.payload.itemName ?? ''
        const labelKey = row.event_type === 'loan_updated'
          ? pickLoanUpdatedLabelKey(row.payload.changes)
          : (EVENT_TYPE_TO_KEY[row.event_type] ?? row.event_type)
        const tFn = (key: string, params?: Record<string, string>) =>
          tHome(key as Parameters<typeof tHome>[0], params as Parameters<typeof tHome>[1])
        const actorLabel = row.actor_display_name
          ? tLoans('history.actor', { name: row.actor_display_name })
          : undefined
        return {
          label:           tHome(labelKey as Parameters<typeof tHome>[0], { itemName }),
          occurredAtLabel: formatEventTimestamp(row.occurred_at, tLoans),
          detailLines:     buildDetailLines(row.payload.changes, tFn, displayLocale),
          actorLabel,
        }
      })
  } catch {
    console.error('[loans/history] unexpected error')
    return []
  }
}
