# #56 v002 - Scope og history - Claude handoff til Stebba

**TODO:** #56 - Breyta lánsdagsetningu og skiladegi á samþykktum lánum

**Agent:** Claude Code

**Staða:** Bíður á scope-ákvörðun Stebba áður en við byrjum að kóða.

---

## Samhengi

Codex lagði til tæknilega lausn í v001 (`2026-06-27-0830-todo-056-v001-codex-accepted-loan-date-edit-handoff.md`). Stebbi bætti nýju samhengi við:

1. **Vandamál sem Stebbi sá:** Hann getur breytt dagsetningum á hlutum sem hann *lánaði*, en ekki á hlutum sem hann er *sjálfur með í láni* (sem mótaðili/viðtakandi samþykkts láns).
2. **Hugmynd:** Item event history - sjá alla events á hlut með dagsetningum og hverjir framkvæmdu hverja aðgerð.

---

## Spurning 1: Má viðtakandi líka breyta dagsetningum?

### Núverandi staða

- `update_loan_item_details_with_diff` (SQL48) leyfir: `created_by OR lender_user_id`.
- Það þýðir: lánveitandi (og sá sem bjó til málið) má breyta. Viðtakandi (borrower) má ekki.

### Kosti og gallar

**Leyfum aðeins lánveitanda (núverandi scope Codex v001):**
- Einfaldara SQL og heimildarlag.
- Skýrar reglur: sá sem lánaði ræður dagsetningum.
- Galli: Stebbi sem er viðtakandi getur ekki breytt, þótt báðir aðilar gætu þurft að laga skiladag.

**Leyfum báðum aðilum (lánveitanda og viðtakanda) að breyta dagsetningum:**
- Raunsærra: báðir gætu þurft að uppfæra skiladag ef það breytist.
- Þarf: SQL-breyting þar sem `borrower_user_id` bætist við heimildir.
- Ef báðir breyta: mótaðili sér `Breyttur skiladagur` event, sama og þegar lánveitandi breytir.

**Tillaga Claude:** Leyfa báðum. Lögmætar ástæður: báðir aðilar þurfa að geta skráð raunverulegan skiladag. Event-kerfið sér um að mótaðili fái tilkynningu.

---

## Spurning 2: Item event history

### Hugmyndin

Á loan detail-síðunni (`/auth-mvp/lanad-og-skilad/[id]`) kæmi ný section sem sýnir alla events sem hafa átt sér stað á þessu láni:

```
Ferill hlutarins

  Lánað til Jóns Jónssonar   Þriðjudaginn 10. júní kl. 09:15
  Samþykkt af Jóni           Miðvikudaginn 11. júní kl. 14:30
  Breytt skiladagur          Föstudaginn 13. júní kl. 16:00  (þú)
  Breytt nafn: Bók           Mánudaginn 16. júní kl. 10:00  (Jón)
```

### Tæknilegar forsendur

- Events eru þegar til í `recent_events` töflunni með `user_id`, `occurred_at`, `payload`.
- Þarf nýtt RPC til að sækja events fyrir ákveðið lán (bæði aðilar sjá).
- Þarf auðkenningu á actor (þú / nafn mótaðila) - nota displayName úr `profiles` eða `loan_invitations`.

### Mikilvægar spurningar

- Á þetta að vera í sama TODO #56 eða nýtt #58?
- Á það að vera á detail-síðunni eða í separate drawer?
- Á báðir aðilar að sjá sömu history eða aðeins "þínar" aðgerðir?

**Tillaga Claude:** Nýtt TODO #58. History er gagnlegt en er stærra verkefni og óháð dagsetningabreytingum. Hægt að gefa út #56 (dagsetningar) án history.

---

## Tæknileg áætlun (Codex v001) - samantekt

Þetta er það sem Codex lagði til í v001 fyrir #56:

### SQL58 - Nýtt RPC

```sql
CREATE OR REPLACE FUNCTION public.update_loan_item_details_and_dates_with_diff(
  p_loan_id uuid,
  p_item_name text,
  p_note text,
  p_loaned_at timestamptz,
  p_due_at timestamptz
)
```

- Heimildir: `created_by OR lender_user_id` (báðir leyfðir í gamla SQL48).
- Skilar `diff_fields[]` (hvað breyttist).
- Keyrt á Supabase af Stebba.

### Schema breyting

`EditLoanItemDetailsSchema` fær `loaned_at` og `due_at` fields (optional, nullable).

### Action breyting

`updateLoanItemDetails` sendir `p_loaned_at` og `p_due_at` til nýja RPC.

### Form breyting

`LoanItemDetailsForm` fær `LoanDateField` inputs fyrir `Lánað` og `Skila fyrir` (sama pattern og `LoanCreateForm`).

### Ef við leyfum viðtakanda líka

SQL58 þarf að breyta heimildarprófuninni:
```sql
-- Núverandi (SQL48):
WHERE id = p_loan_id AND (created_by = auth.uid() OR lender_user_id = auth.uid())

-- Ný (SQL58 með báðum):
WHERE id = p_loan_id AND (
  created_by = auth.uid() OR
  lender_user_id = auth.uid() OR
  borrower_user_id = auth.uid()
)
```

---

## Ákvarðanir sem Stebbi þarf að taka

| # | Spurning | Valkostur A | Valkostur B |
|---|---|---|---|
| 1 | Má viðtakandi breyta dagsetningum? | Nei - aðeins lánveitandi | Já - báðir |
| 2 | Er history í #56 eða nýtt #58? | Hluti af #56 | Nýtt #58 |
| 3 | Á við að ræða borrower-heimildir í SQL58? | Já, strax | Nei, seinna |

---

## Mælt með næsta skrefi

1. Stebbi svarar 3 spurningum hér að ofan.
2. Claude eða Codex smíðar SQL58 miðað við svör.
3. Stebbi keyrir SQL58 á Supabase.
4. Claude/Codex uppfærir schema, action og form.
5. Prófanir og handoff til Codex til lokarýni.

Ef Stebbi vill opna #58 (history) strax: Claude getur bætt því við TODO.md um leið.
