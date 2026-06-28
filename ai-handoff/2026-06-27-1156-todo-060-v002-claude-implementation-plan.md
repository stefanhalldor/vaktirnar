# #60 v002 - Implementation plan til rynihopps

**TODO:** #60 - Spjall sem hluti af sogu hlutar
**Agent:** Claude Code
**Tilefni:** Codex v001 handoff lesid. Stebbi vill rynihring adur en framkvaema.
**Stada:** Plan tilbuid -- bidur eftir Codex samthykki adur en koda.

---

## Yfirlit

Spjall sem birtist innan um historia-events i `Saga hlutarins`. Eitt samfelld saga
-- ekki sertab.

---

## SQL61: `sql/61_loan_chat_messages_in_history.sql`

Allt SQL i einni migration-skra.

### 1. Tafla

```sql
CREATE TABLE IF NOT EXISTS public.loan_chat_messages (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id        uuid        NOT NULL REFERENCES public.loan_items(id) ON DELETE CASCADE,
  sender_user_id uuid        NOT NULL,
  body           text        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz NULL,
  CONSTRAINT loan_chat_messages_body_length
    CHECK (char_length(trim(body)) BETWEEN 1 AND 1000)
);

ALTER TABLE public.loan_chat_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL   ON public.loan_chat_messages FROM PUBLIC, anon, authenticated;
GRANT  SELECT, INSERT, UPDATE, DELETE
       ON public.loan_chat_messages TO service_role;
```

Engar RLS policies -- service_role bypasses RLS.

### 2. `create_loan_chat_message` RPC

```sql
CREATE OR REPLACE FUNCTION public.create_loan_chat_message(
  p_actor_id uuid,
  p_loan_id  uuid,
  p_body     text
)
RETURNS TABLE (
  status              text,
  message_id          uuid,
  counterpart_user_id uuid
)
```

- Stadfesta actor i auth.users
- Trimma og validate body (1-1000 stafir)
- Access check (sama og SQL60): created_by OR lender_user_id OR borrower_user_id
  OR pending recipient via normalize_email_canonical
- INSERT i loan_chat_messages
- Skila counterpart_user_id (ef lender er actor -> borrower; ef borrower -> lender;
  ef creator og annad -> lender/borrower adili, hvad sem er til)
- Status: 'ok', 'not_found', 'invalid_body'
- Nota p_actor_id, EKKI auth.uid()
- Grants: service_role eingongu

### 3. Uppfaera `get_loan_event_history` (DROP + CREATE OR REPLACE)

Nyt return type -- bætt vid:
- `row_kind text`         -- 'event' eda 'chat'
- `chat_body text`        -- null fyrir events, message body fyrir chat
- `chat_message_id uuid`  -- null fyrir events, message id fyrir chat

SQL CTE-lykill:

```sql
WITH deduped_events AS (
  SELECT DISTINCT ON (re.event_key) ... FROM public.recent_events re WHERE ...
),
event_rows AS (
  SELECT
    de.event_key, de.event_type::text, de.payload, de.occurred_at,
    actor_profile.display_name AS actor_display_name,
    'event'::text AS row_kind,
    NULL::text   AS chat_body,
    NULL::uuid   AS chat_message_id
  FROM deduped_events de
  LEFT JOIN LATERAL (...uuid regex filter on actorUserId...) actor_meta ON true
  LEFT JOIN public.profiles actor_profile ON actor_profile.id = actor_meta.actor_user_id
),
chat_rows AS (
  SELECT
    ('loans:loan:' || p_loan_id || ':chat:' || cm.id)::text AS event_key,
    'loan_chat_message'::text AS event_type,
    '{}'::jsonb               AS payload,
    cm.created_at             AS occurred_at,
    p.display_name            AS actor_display_name,
    'chat'::text              AS row_kind,
    cm.body                   AS chat_body,
    cm.id                     AS chat_message_id
  FROM public.loan_chat_messages cm
  JOIN public.profiles p ON p.id = cm.sender_user_id
  WHERE cm.loan_id = p_loan_id AND cm.deleted_at IS NULL
)
SELECT * FROM event_rows
UNION ALL
SELECT * FROM chat_rows
ORDER BY occurred_at ASC, event_key ASC;
```

Access check helst sama og SQL60 (pending recipient branch medfylgjandi).

---

## TypeScript breytingar

### `lib/recent-events/types.ts`

Baeta vid `loan_chat_message` i `RecentEventType`.

### `lib/recent-events/display.ts`

Baeta vid `loan_chat_message: 'eventLoanChatMessage'` i `EVENT_TYPE_TO_KEY`
(notad i Olesid-display).

### `lib/loans/types.ts`

```ts
export const SendLoanChatMessageSchema = z.object({
  body: z.string().trim().min(1, 'required').max(1000),
})
```

### `lib/loans/actions.ts`

```ts
export async function sendLoanChatMessage(
  loanId: string,
  input: unknown,
): Promise<ActionResult>
```

- guardLoanAccess()
- Parse med SendLoanChatMessageSchema
- Kalla create_loan_chat_message RPC
- Ef ok: record recent event fyrir counterpart (loan_chat_message, unread)
  - payload: { itemName } (ekki body i payload)
  - actorUserId: user.id
  - href: '/auth-mvp/lanad-og-skilad/${loanId}'
- revalidateLoanViews() + revalidatePath('/auth-mvp/lanad-og-skilad/${loanId}')
- Skila ok/invalid_input/not_found/save_failed

Nota fetchLoanEventContext til ad fa itemName fyrir notification.

### `lib/loans/history.server.ts`

- Baeta vid `row_kind`, `chat_body`, `chat_message_id` vid RawHistoryRow
- Baeta vid `chatBody?: string` vid LoanHistoryItem
- Chat rows: label = tLoans('history.chatLabel', { name: actorDisplayName ?? '?' })
- Chat rows: actorLabel = undefined (nafn er negar i label)
- Chat rows: detailLines = []
- Chat rows: chatBody = row.chat_body
- Sama de-duplicate logic -- chat event keys eru unikar

### `components/loans/LoanChatForm.tsx` (ny client component)

```tsx
'use client'

// textarea + submit button + pending/error state
// Kallar sendLoanChatMessage(loanId, { body })
// Hreinsad field eftir success
// text-base (>= 16px) a mobile til ad hindra iOS zoom
```

### `components/loans/LoanHistory.tsx`

- Taka vid `loanId: string` og `chatLabels` props
- Render `LoanChatForm` nedst i section
- Chat rows renderast annadhvort:
  - label (t.d. "Stefan skrifadi") sem header
  - chatBody sem block med `whitespace-pre-wrap`
  - timestamp

### `app/auth-mvp/lanad-og-skilad/[id]/page.tsx`

- Senda loanId og chatLabels til LoanHistory
- Senda translations fyrir chatLabel, chatPlaceholder, chatSend, chatError

### Messages

**is.json** (teskeid.home):
```json
"eventLoanChatMessage": "Ný skilaboð: {itemName}"
```

**is.json** (teskeid.loans.history):
```json
"chatLabel": "{name} skrifaði",
"chatPlaceholder": "Skrifaðu skilaboð...",
"chatSend": "Senda",
"chatError": "Tókst ekki að senda. Reyndu aftur."
```

**en.json** (teskeid.home):
```json
"eventLoanChatMessage": "New message: {itemName}"
```

**en.json** (teskeid.loans.history):
```json
"chatLabel": "{name} wrote",
"chatPlaceholder": "Write a message...",
"chatSend": "Send",
"chatError": "Failed to send. Try again."
```

---

## Prófanir

### Nyar

- `SendLoanChatMessageSchema` -- tómt body, of langt, gilt
- `sendLoanChatMessage` -- gildir, tómt body, not_found, save_failed
- `sendLoanChatMessage` -- recent event skraad fyrir counterpart, ekki fyrir actor
- `getLoanHistory` -- chat rows skila chatBody, label med nama
- `LoanHistory` -- renderar chat row med body

### Uppfærdar (om nauda)

- `loan-pages.test.tsx` -- baeta history.chatXxx vid mock translations
- `LoanHistory` mock breytist ekki ad forminu til

---

## Spurningar til Codex

### A. Pending recipient: mega senda adur en claim?

Claude Code leggur til: **já** -- sama aðgangur og að lesa sögu. Einfaldara og
meira aðgengilegt. Codex samþykkir eða gerir athugasemd.

### B. Er CTE-lykillinn réttur?

Sér sérstaklega: er UNION ALL á milli event_rows og chat_rows type-compatible?
Báðir reita þurfa að skila sömu dálkum í sömu röð. Claude Code treysti á þetta
en Codex ma besta stadfesta.

### C. Schema cache reload eftir SQL61?

Já -- DROP + CREATE OR REPLACE á get_loan_event_history breytir return type.
Supabase PostgREST þarf schema cache reload eftir þessa migration, eins og eftir
SQL59 og SQL60.

### D. Á actor fá initiallyRead recent event fyrir eigin skilaboð?

Claude Code leggur til: nei -- engin row fyrir actor. Counterpart fær unread row.
Actor sér skilaboðið strax í saga og þarf ekki notification. Codex ma samþykkja
eða gera athugasemd.

---

## Hvad Claude Code gerir EKKI fyrr en Codex samþykkir

- Byrjar ekki a forritun
- Keyrir engar SQL migrations
- Deploya ekki neitt

---

## Naesta skref

Codex rynir plan og svarar med samthykki, leidrettingum eða blocker-findings.
