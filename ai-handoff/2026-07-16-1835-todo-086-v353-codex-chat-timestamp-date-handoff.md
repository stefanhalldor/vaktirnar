# TODO 086 v353 - Codex handoff: chat timestamp with date

Created: 2026-07-16 18:35
Timezone: Atlantic/Reykjavik
Author: Claude

## Problem

Timestamps on Veðurpúls messages and forecast rows show no date. Old messages look identical to new ones. Forecast rows that span midnight have no day label, so users cannot tell which day 00:00, 03:00 etc. belong to.

## Product decision

Format: `"Fös. 17. júlí, 14:32"` — abbreviated weekday + day + month + time.

The date formatting logic belongs in **chat-core** (`lib/chat/`) and is reused from there.

## Scope

Two surfaces:

1. **Chat messages** — `components/chat/ChatMessageRow.tsx` — timestamp on each message.
2. **Forecast rows** — `VedurstofanPulsClient.tsx` — day separator between rows from different calendar days.

---

## 1. Add `formatChatTimestamp` to chat-core

Create a new client-safe util file `lib/chat/format.ts`:

```ts
/**
 * Formats an ISO timestamp for display in chat surfaces.
 * Format: "Fös. 17. júlí, 14:32"
 * Uses the provided locale (e.g. "is", "en").
 */
export function formatChatTimestamp(isoString: string, locale: string): string {
  const d = new Date(isoString)
  const datePart = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  }).format(d)
  const timePart = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
  // Capitalise first letter (Icelandic weekday abbreviations are lower-case by default)
  const capitalised = datePart.charAt(0).toUpperCase() + datePart.slice(1)
  return `${capitalised}, ${timePart}`
}

/**
 * Returns the calendar date string (YYYY-MM-DD) for an ISO timestamp
 * in the local timezone, for day-boundary detection.
 */
export function calendarDate(isoString: string): string {
  const d = new Date(isoString)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
```

---

## 2. ChatMessageRow — pass locale and use formatChatTimestamp

`components/chat/ChatMessageRow.tsx`

Add `locale` prop to `ChatMessageRowProps`:

```ts
interface ChatMessageRowProps {
  msg: AugmentedChatMessage
  deletedLabel: string
  kindLabels?: Partial<Record<ChatMessageKind, string>>
  targetName?: string
  locale: string   // ← new
}
```

Replace the timestamp span (line 35-37) with:

```tsx
import { formatChatTimestamp } from '@/lib/chat/format'

<span className="text-[10px] text-muted-foreground tabular-nums">
  {msg.optimistic ? '...' : formatChatTimestamp(msg.createdAt, locale)}
</span>
```

(Optimistic messages have `createdAt = new Date().toISOString()` which is fine to format, but `...` avoids a flash during send.)

---

## 3. ScopedChatPanel — pass locale down to ChatMessageRow

`components/chat/ScopedChatPanel.tsx`

Add `locale` to `ScopedChatPanelProps` and pass it to each `ChatMessageRow`:

```ts
interface ScopedChatPanelProps {
  // ...existing...
  locale: string   // ← new
}
```

In the message map:

```tsx
<ChatMessageRow
  key={msg.id}
  msg={msg}
  deletedLabel={labels.deleted}
  kindLabels={labels.kindLabels}
  locale={locale}
/>
```

---

## 4. VedurstofanPulsClient — pass locale to ScopedChatPanel

`app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx`

Already has `const locale = useLocale()`. Pass it to `ScopedChatPanel`:

```tsx
<ScopedChatPanel
  threadId={threadId}
  transport={VEDURPULS_TRANSPORT}
  labels={panelLabels}
  pageSize={50}
  locale={locale}   // ← add
  listClassName="..."
/>
```

---

## 5. Forecast rows — day separator in VedurstofanPulsClient

In `VedurstofanPulsClient.tsx`, replace the simple `displayRows.map(...)` with a loop that emits a day-label div when the calendar date changes:

```tsx
import { calendarDate } from '@/lib/chat/format'

// replace the existing map:
{(() => {
  let lastDay = ''
  return displayRows.map(row => {
    const day = calendarDate(row.ftimeIso)
    const showDayLabel = day !== lastDay
    lastDay = day
    const dayLabel = showDayLabel
      ? new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'long' }).format(new Date(row.ftimeIso))
      : null
    return (
      <div key={row.ftimeIso}>
        {dayLabel && (
          <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wide pt-1.5 pb-0.5 first:pt-0">
            {dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1)}
          </p>
        )}
        <ForecastRowLine row={row} isUsed={false} locale={locale} usedMarker="" />
      </div>
    )
  })
})()}
```

The day label only appears when the day changes from the previous row — so if all 3 upcoming rows are on the same day, no label appears. When the user taps "Sýna allt" and sees multi-day rows, the label appears at each midnight boundary.

---

## 6. ChatPreviewList — also uses ChatMessageRow

Check whether `components/chat/ChatPreviewList.tsx` renders `ChatMessageRow`. If yes, add `locale` prop there too and pass it through. The inline preview (VedurstofanPulseInline) and route summary (VedurstofanRoutePulseSummary) both render `ChatPreviewList` — they should also pass locale. Both are client components with access to `useLocale()`.

---

## Files to change

- `lib/chat/format.ts` — new file
- `components/chat/ChatMessageRow.tsx` — add locale prop, use formatChatTimestamp
- `components/chat/ScopedChatPanel.tsx` — add locale prop, pass to ChatMessageRow
- `components/chat/ChatPreviewList.tsx` — check if it uses ChatMessageRow; add locale if so
- `app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx` — pass locale to ScopedChatPanel, add day separators to forecast rows
- `components/weather/VedurstofanPulseInline.tsx` — pass locale to ChatPreviewList (if needed)
- `components/weather/VedurstofanRoutePulseSummary.tsx` — pass locale to ChatPreviewList (if needed)

## Tests

No new unit tests needed — `formatChatTimestamp` is a thin `Intl` wrapper. Verify with existing type-check (`npm run type-check`) and test suite (`npm run test:run`).
