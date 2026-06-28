# Rýni: recipient_email v002 eftir lagfæringu

**Handoff:** Codex → Stebbi og Claude Code  
**Dagsetning:** 2026-06-22 17:19  
**Rýnir skrá:** `2026-06-22-1720-todo-053-v002-claude-recipient-email-fixed-post-release.md`  
**Rétt TODO-tenging:** #43 Gmail-punktar og útrunnin soft-ack lánaboð, #47 Lán: bæta við netfangi í edit og laga vistunarvillu  
**Niðurstaða:** SQL-v002 lítur út fyrir að vera örugg til keyrslu miðað við repo-rýni, ef Stebbi fylgir rollout-röðinni og reloadar Supabase schema cache.

## Findings

### Engin blocking findings fundust í v002

Claude Code lagaði blokkandi atriðin úr fyrri Codex-rýni:

- `sql/55_get_my_loans_add_recipient_email.sql` notar nú `BEGIN`/`COMMIT`.
- `get_my_loans` er nú `DROP FUNCTION IF EXISTS` + `CREATE FUNCTION`, ekki `CREATE OR REPLACE`.
- `requires_acknowledgement` er varðveitt.
- `UNION ALL` soft-ack branchið úr `sql/50_loan_soft_acknowledgement.sql` er varðveitt.
- Pending recipient branch skilar `recipient_email` sem `NULL::text`.
- Direct participant branch sýnir `recipient_email_normalized` aðeins þegar `li.created_by = p_actor_id`.
- `REVOKE`/`GRANT` eru sett aftur og execution er áfram service-role only.
- Rollout-skjalið nefnir schema-cache reload eftir migration.

Þetta svarar aðaláhættunni: pending lánaboð eiga ekki að hverfa hjá viðtakanda við þessa migration.

### Medium: `todo-053` er enn ekki til í `TODO.md`

Claude-skráin og SQL-kommentið vísa í `#53`, en Codex fann ekki #53 í `TODO.md`. Þetta er ekki keyrslublokkari fyrir Supabase, en það er rekjanleikavandamál.

Mælt:

- annaðhvort skrá #53 í `TODO.md`,
- eða tengja framhaldið við #43/#47 í næstu handoff-skrám og SQL-kommentum.

Ekki láta þetta tefja SQL keyrslu ef Stebbi þarf að prófa virknina núna, en laga þetta áður en atriðið er lokað.

### Low: UI-próf fyrir birtingu `recipient_email` mættu vera beinni

SQL-regression prófin eru sterkari núna. Codex sá hins vegar ekki mjög beint component-próf sem staðfestir að:

- `LoanSummaryCard` sýni `recipient_email` fyrir creator með pending boð,
- `LoanSummaryCard` sýni ekki `Bíður svars` í summary-línu,
- `LoanCard` sýni `recipientDisplay` í haus og `Bíður svars` sem sér stöðulínu.

Þetta er ekki blokkari ef Stebbi prófar þetta á localhost, en væri gott að bæta við seinna ef flæðið heldur áfram að breytast.

## Staðfest með skipunum

Codex keyrði:

```txt
npm run test:run -- lib/__tests__/sql-migration.test.ts
```

Niðurstaða:

```txt
Test Files  1 passed (1)
Tests       89 passed (89)
Exit code   0
```

Codex keyrði líka:

```txt
npm run type-check
```

Niðurstaða:

```txt
tsc --noEmit
Exit code 0
```

## Supabase rollout

Stebbi má keyra `sql/55_get_my_loans_add_recipient_email.sql` í Supabase SQL editor miðað við núverandi v002 skrá, með þessum skilyrðum:

1. Keyra migrationina.
2. Reloada Supabase/PostgREST schema cache: Settings → API → Reload schema.
3. Prófa á localhost eða staging gegn sama schema.
4. Deploya appkóða.

Ef rollback þarf:

1. Endurdeploya fyrri appútgáfu fyrst.
2. Endurskapa `get_my_loans` úr `sql/50_loan_soft_acknowledgement.sql`.
3. Reloada schema cache aftur.

## Localhost checks for Stebbi

1. Creator með pending boð.
   - Opna `/auth-mvp/lanad-og-skilad`.
   - Vænt: listaspjaldið sýnir netfang viðtakanda, ekki `Bíður svars` í summary-línunni.
   - Opna detail-síðuna.
   - Vænt: netfangið sést í haus og `Bíður svars` sést sem sér stöðulína neðar.

2. Viðtakandi með pending soft-ack boð.
   - Skrá inn sem viðtakandinn.
   - Opna `/auth-mvp/lanad-og-skilad`.
   - Vænt: pending boðið birtist áfram.
   - Vænt: `Þekki málið` virkar.
   - Vænt: viðtakandi sér ekki `recipient_email` sem sérstakt netfang frá invitation.

3. Samþykkt lán.
   - Vænt: nafn mótaðila birtist frekar en netfang ef `other_display_name` er til.

4. Lán án boðs.
   - Vænt: engar rangar mótaðilaupplýsingar birtast.

5. Regression á smellanlegu listaspjaldi.
   - Vænt: allt spjaldið opnar `/auth-mvp/lanad-og-skilad/[id]`.
   - Vænt: edit-tákn er ekki á listaspjaldinu.
   - Vænt: aðgerðir eru enn til staðar á detail-síðu.

6. Eftir schema reload.
   - Ef `recipient_email` birtist ekki þrátt fyrir migration, prófa fyrst schema-cache reload aftur áður en kóði er grunaður.
