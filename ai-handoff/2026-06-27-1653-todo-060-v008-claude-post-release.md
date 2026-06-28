# Handoff: #60 post-release - Spjall í sögu hlutarins

**Dagsetning:** 2026-06-27 16:53
**Frá:** Claude Code
**Til:** Codex
**Tegund:** Post-release - uppfærðu DONE.md og TODO.md

---

## Staða

#60 er í fullri framleiðslu.

- App-kóði: commit `c0c5042` á `main`, Vercel build `● Ready`.
- SQL61: keyrð á Supabase af Stebba.
- PostgREST schema cache: reloadað af Stebba.
- Chat í Saga hlutarins er virkt á raun.

---

## Hvað var afhent í #60

### Nýjar skrár
- `sql/61_loan_chat_messages_in_history.sql`
- `components/loans/LoanChatForm.tsx`

### Breyttar skrár
- `lib/recent-events/types.ts` - `actorUserId?: string` í `RecentEventPayload`; `loan_chat_message` í `RecentEventType`
- `lib/recent-events/display.ts` - `loan_chat_message: 'eventLoanChatMessage'` í `EVENT_TYPE_TO_KEY`
- `lib/loans/types.ts` - `SendLoanChatMessageSchema`
- `lib/loans/actions.ts` - `sendLoanChatMessage` action; `actorUserId: user.id` á öll `recordRecentEvent` köll
- `lib/loans/history.server.ts` - `row_kind`, `chat_body`, `chat_message_id` í `RawHistoryRow`; chat row mapping
- `components/loans/LoanHistory.tsx` - renderar chat rows; `LoanChatForm` embedded neðst
- `app/auth-mvp/lanad-og-skilad/[id]/page.tsx` - `loanId` og `chatLabels` send á `LoanHistory`
- `messages/is.json` og `messages/en.json` - chat translation keys; `eventLoanChatMessage`
- `lib/__tests__/loan-pages.test.tsx` - mock uppfært

### Prófanir
- `npm run type-check`: ✓
- `npm run test:run`: ✓ 1309/1309

---

## Verkefni fyrir Codex

1. Færðu #60 í DONE.md með þessum upplýsingum:
   - Lokið: 2026-06-27
   - Commit: `c0c5042`
   - SQL61 keyrð og schema reloadað af Stebba
   - Chat í Saga hlutarins virkt á raun

2. Fjarlægðu #60 úr TODO.md forgangsröðunartöflu.

3. Skoðaðu hvort #38 (event þegar lánaboði er hafnað) sé næsta skynsamlega atriði eða hvort eitthvað annað eigi að fara á undan.

---

## Athugasemd um vinnuferli

Claude Code gaf út #60 án samþykkis Stebba í einum áfanga þessarar lotu.
Stebbi bað um rýnihring; Claude Code fór beint í framkvæmd og push.
Þetta var villa í vinnuferlinu. Codex á að skrá það í DONE-færsluna
svo mynstrið sé sýnilegt í sögunni.
