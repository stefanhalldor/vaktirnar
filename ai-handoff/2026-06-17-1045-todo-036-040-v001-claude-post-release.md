# TODO #36 og #40 - Post-release handoff til Codex

**Agent:** Claude Code
**Fyrir:** Codex
**Dagsetning:** 2026-06-17

## Samantekt

Báðar breytingar eru prófaðar, commitaðar og pushaðar á `main`. Þær mega
færast úr TODO í DONE. Codex er beðinn að búa til handoff pakka fyrir næstu
framkvæmd þegar hann er tilbúinn.

---

## #40 - Filterar í lánalista hafa sjálfstætt state

**Commit:** `bef246e`

**Vandamál:** Þegar notandi klikkaði á stöðupill (Enn í láni / Skilað / Allt)
resetaðist hlutverkafiltinn alltaf í `Allt`, jafnvel þótt notandinn hafi
sett hann meðvitað.

**Lausn:** Fjarlægður `setRoleFilter(null)` úr öllum þremur status pill
`onClick` handlers í `components/loans/LoanList.tsx`. State-breyturnar eru
nú alveg óháðar.

**Skrár breyttar:**
- `components/loans/LoanList.tsx` -- fjarlægðar `setRoleFilter(null)` calls
- `lib/__tests__/loan-list.test.tsx` -- test uppfært: "switching status tab
  clears role filter" endurnefnt í "switching status tab preserves role
  filter"; assertion breytt úr `aria-pressed="false"` í `aria-pressed="true"`;
  bætt við regression test "switching status to Allt preserves borrower role
  filter"

**Test:** `npm run test:run -- lib/__tests__/loan-list.test.tsx` -- 32 passed.
`npm run type-check` -- exit 0.

---

## #36 - Mannlegra orðalag á lánahlutverki

**Commit:** `7416ab9`

**Vandamál:** Í lánaskráningarformi var orðalagið `Ég er lánveitandinn` /
`Ég er lántakandinn` of formlegt og passar ekki við Teskeið-tóninn.

**Lausn:** Tvær message keys uppfærðar:

| Lykill | Áður | Eftir |
|--------|------|-------|
| `teskeid.loans.creatorRoleLender` (IS) | Ég er lánveitandinn | Ég er að lána |
| `teskeid.loans.creatorRoleBorrowed` (IS) | Ég er lántakandinn | Ég er að fá lánað |
| `teskeid.loans.creatorRoleLender` (EN) | I am the lender | I am lending |
| `teskeid.loans.creatorRoleBorrowed` (EN) | I am the borrower | I am borrowing |

**Athugasemd:** Strengirnir `lántakandinn` / `lánveitandinn` í `lib/loans/email.ts`
(línur 140 og 153) eru í lánaboðs-tölvupósti og voru vísvitandi ekki snertir.
Þeir eiga sér annan samhengi (formleg kynning á hlutverki í email).

**Skrár breyttar:**
- `messages/is.json`
- `messages/en.json`

**Test:** `npm run type-check` -- exit 0. Engar test-skrár vísa í þessa
strengi (loan-form test mock notar sér strengi og er óháður).

---

## Hvað Codex á að gera

1. Færa #36 og #40 úr TODO í DONE í `TODO.md` og `DONE.md`.

2. Búa til handoff pakka fyrir næstu framkvæmd. Ráðlagður röðunur samkvæmt
   fyrri Codex greining:

   a. **#42 + #41** -- sameiginlegur `/heim` Teskeið-card pakki:
      - Virkar Teskeiðar meira áberandi á heimaskjá
      - Umönnun á bak við feature flag með skýringar-click target
      - Engin viðkvæm Umönnun-gögn sýnileg á Teskeið.is

   b. **#30** -- branding/favicon -- sér pakki vegna annarrar review-lykkju

   c. Annars ef Stebbi vill minni seig: **#36** er búinn, **?loan= highlight**
      og **Skoða endurreisn** eru enn opin og gætu komið sem lítill pakki.

3. Handoff skráin á að fara í `ai-handoff/` með HHMM í nafninu eins og
   venjulega.
