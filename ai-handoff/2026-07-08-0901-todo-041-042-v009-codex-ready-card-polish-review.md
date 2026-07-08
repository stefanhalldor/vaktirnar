# TODO-041/042 v009 - Codex review of v008 ready card polish

Created: 2026-07-08 09:01
Timezone: Atlantic/Reykjavik
Author: Codex
Status: No blocking findings found. Ready for Stebbi localhost review and explicit SQL-run decision.

Context:
- Review of `ai-handoff/2026-07-08-0901-todo-041-042-v008-claude-ready-card-polish.md`
- Scope reviewed:
  - `components/teskeid/ReadyTeskeidCard.tsx`
  - `app/auth-mvp/heim/page.tsx`
  - `sql/70_update_ready_card_descriptions.sql`
  - relevant `ideas` schema/RLS references

## Findings

No blocking findings found.

## Review Notes

The `ReadyTeskeidCard` rewrite is small and consistent with `Design.md`:

- mobile-first compact row layout
- single card/link target
- visible focus ring remains
- icon/color changes avoid using destructive red for Umönnun
- text hierarchy is tighter and appropriate for a card row
- no visible hardcoded user-facing text was introduced in the component

The accessible name remains covered through `aria-label={`${openLabel} ${idea.title}`}`. Since `openLabel` is still passed from `messages/*`, removing visible `Opna` does not remove the translated action from screen-reader context.

`sql/70_update_ready_card_descriptions.sql` is straightforward and idempotent:

- updates only `ideas.short_description`
- uses slug-based `UPDATE`s
- no schema change
- no RLS or grants change
- no auth, Supabase function, trigger, or user-private data impact

The migration is not run. Stebbi needs to explicitly decide when to run it. It affects public idea/home-card copy wherever those `ideas.short_description` rows are read.

## Residual Risk / Test Gaps

- Codex did not run tests in this review pass.
- Claude Code reports `npm run type-check` and `npm run test:run` passing.
- The most important remaining check is visual/mobile review at 360px and keyboard focus, because this is a layout polish change.

## Design.md Check

Relevant `Design.md` points:

- card rows should be quiet, useful, and mobile-first
- touch targets should generally be at least 40x40px
- text and controls must not overlap or create horizontal overflow
- status colors should not rely on destructive red unless they indicate an error

The implementation appears aligned. The Umönnun rose tone is not `destructive`, and the whole card link remains a clear touch target.

## Commands Run

Read-only commands:

- `Get-Content -Encoding UTF8 'ai-handoff\\2026-07-08-0901-todo-041-042-v008-claude-ready-card-polish.md'`
- `Get-Content -Encoding UTF8 'ai-handoff\\README.md'`
- `git status --short`
- line-number reads of `components/teskeid/ReadyTeskeidCard.tsx`, `app/auth-mvp/heim/page.tsx`, and `sql/70_update_ready_card_descriptions.sql`
- `rg -n "readyTeskeid|short_description|shortDescription|ReadyTeskeidCard|ideas|is_active|slug" app components lib sql messages`
- `git diff -- components/weather/TravelAuditMap.tsx components/weather/travelAuditMap.helpers.ts app/auth-mvp/vedrid/FerdalagidClient.tsx components/teskeid/ReadyTeskeidCard.tsx sql/70_update_ready_card_descriptions.sql`
- `Get-Date -Format 'yyyy-MM-dd HH:mm'`
- `rg --files ai-handoff | rg "todo-041-042-v009|todo-067-v181|todo-041-042-v00[8-9]|todo-067-v18[0-9]"`
- `Get-Content -Encoding UTF8 'Design.md'`

No tests were run by Codex.

## Files Changed By Codex

- `ai-handoff/2026-07-08-0901-todo-041-042-v009-codex-ready-card-polish-review.md`

No application code, SQL migration content, Supabase data, commit, push, deploy, or migration run was changed by Codex.

## Localhost Checks for Stebbi

Before checking the new card descriptions, run `sql/70_update_ready_card_descriptions.sql` on local DB only if Stebbi wants to test the DB-copy update locally. Do not run it against production without explicit migration approval.

Then open `/auth-mvp/heim`:

1. Confirm `Tilbúnar Teskeiðar` shows compact row cards.
2. Confirm each card is clickable as one large target and opens the correct feature.
3. Confirm there is no visible `Opna ->` text.
4. Confirm keyboard tab focus lands on the whole card and the focus ring is visible.
5. Confirm pending badge still appears for `Lánað og skilað` when pending invitations exist.
6. Confirm Umönnun card only appears when feature access allows it.
7. Check 360px, 390px, and 460px widths for no horizontal overflow or overlap.

## Óvissa / Þarf Að Staðfesta

Codex did not run the SQL, did not run tests, and did not inspect a browser screenshot. Confidence is high for the code/SQL review, but final approval should include Stebbi's mobile localhost check.
