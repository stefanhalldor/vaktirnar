# TODO #56 - Handoff fyrir Claude Code: dagsetningar á samþykktum lánum

Dagsetning: 2026-06-27 08:30  
Frá: Codex  
Til: Stebbi og Claude Code  
Staða: Plan/handoff. Codex breytti ekki app-kóða og keyrði ekki SQL.

## Samantekt

Næsta opna atriði í Pakka A er #56: lánveitandi á að geta breytt `Lánað` og
`Skila fyrir` á samþykktu láni. Breytingin á að skrá `loan_updated` event hjá
mótaðila þannig að `Ólesið` sýni sértæk heiti eins og `Breytt
lánsdagsetning` og `Breyttur skiladagur`.

#37 er staðfestur grunnur fyrir event-labelin. Nú vantar að opna edit-formið og
server-side RPC fyrir dagsetningarnar á samþykktum lánum.

## Hvað Codex staðfesti í núverandi kóða

- `TODO.md`: #56 er efst í forgangsröðinni eftir að #37 fór í DONE.
- `Design.md`: breytingin snertir form og mobile hegðun. Nota skal núverandi
  Teskeið-formmynstur, 16 px inntak á mobile, sýnileg labels, stöðuga
  loading-hegðun og engan láréttan overflow.
- `lib/loans/types.ts`: `EditLoanItemDetailsSchema` leyfir bara `item_name` og
  `note`.
- `lib/loans/types.ts`: `getLoanCardControls` leyfir `canEditItemDetails` þegar
  notandi er ekki pending recipient og er annaðhvort `is_creator` eða
  `my_role === 'lender'`.
- `app/auth-mvp/lanad-og-skilad/breyta/[id]/page.tsx`: samþykkt lán fara í
  `LoanItemDetailsForm`, ekki fulla `LoanForm`.
- `components/loans/LoanItemDetailsForm.tsx`: formið sýnir bara nafn og
  athugasemd. Það sendir ekki `loaned_at` eða `due_at`.
- `components/loans/LoanDateField.tsx`: til er reusable dagsetningarcomponent
  sem `LoanForm` notar nú þegar og passar betur við Design.md en ný sérlausn.
- `lib/loans/actions.ts`: `updateLoanItemDetails` kallar
  `update_loan_item_details_with_diff` með bara `p_item_name` og `p_note`.
  Diff/event úrvinnslan nær því ekki dagsetningum í þessu flæði.
- `lib/loans/event-diff.ts`: `computeLoanChanges` styður nú þegar breytingar á
  `loaned_at` og `due_at` ef þær eru sendar inn.
- `app/auth-mvp/heim/page.tsx`: #37 label-grunnurinn er til fyrir `due_at` og
  `loaned_at`.
- `sql/48_update_loan_with_diff.sql`: núverandi
  `update_loan_item_details_with_diff` er narrow edit, `item_name + note only`.
  Hún heimilar `created_by OR lender_user_id`, en borrower-only actor fær
  `not_found`.
- `sql/30_loan_items.sql`: gagnagrunnurinn er með check constraint:
  `due_at IS NULL OR due_at >= loaned_at`.

## Manual pre-check fyrir Stebba áður en framkvæmd hefst

Á localhost, áður en Claude Code breytir kóða:

1. Finna samþykkt lán þar sem Stebbi er lánveitandi.
2. Opna edit-pennann.
3. Staðfesta að núverandi form sýnir aðeins nafn og athugasemd.
4. Staðfesta að ekki er hægt að breyta `Lánað` eða `Skila fyrir`.
5. Ef þetta er ekki lengur rétt eða ekki lengur notendaþörf, stoppa #56 og
   uppfæra TODO í stað þess að framkvæma óþarfa breytingu.

## Scope fyrir þessa framkvæmd

Innifalið:

- Gera dagsetningasvið sýnileg og vistuð í samþykkta-edit flæðinu.
- Halda núverandi edit-aðgangi fyrir `LoanItemDetailsForm`, nema Stebbi ákveði
  annað: `created_by OR lender_user_id` server-side, sama og núverandi narrow
  edit.
- Skrá counterpart `loan_updated` event þegar `loaned_at` eða `due_at` breytist.
- Endurnýta #37 label-hegðun í `Ólesið`.
- Bæta við focused prófum fyrir schema, action, RPC migration og form.

Ekki innifalið:

- #38 decline-event.
- #39 eyða samþykktum hlut.
- #27 mýkra lánaboðsflæði.
- Breytingar á invitation snapshots eða email texta.
- Keyrsla á SQL í Supabase án sérstaks samþykkis frá Stebba.

## Product ákvörðun sem þarf að varðveita eða staðfesta

Stebbi orðaði óskina sem “amk sem sá sem lánaði”. Núverandi kerfi leyfir
`LoanItemDetailsForm` fyrir `created_by OR lender_user_id`. Codex mælir með að
fyrsta #56 útgáfan haldi þessu sama heimildamengi fyrir dagsetningar líka, því
það varðveitir núverandi edit-aðgang og heldur UI/RPC samræmdu.

Ef Stebbi vill að dagsetningar séu stranglega lender-only, þá þarf Claude Code
að skipta formi og RPC-hegðun þannig að creator sem er borrower geti enn breytt
nafni/athugasemd en ekki dagsetningum. Það er stærri og áhættusamari breyting.

## Ráðlagt implementation plan

### 1. SQL58: nýtt RPC fyrir accepted item details + dates

Búa til nýja migration, líklega:

`sql/58_update_accepted_loan_item_details_and_dates.sql`

Ráðlegging Codex: búa til nýtt RPC-nafn í stað þess að overload-a eða breyta
núverandi 4-argumenta falli.

Tillaga að nafni:

`public.update_loan_item_details_and_dates_with_diff`

Ástæða:

- Gamla `update_loan_item_details_with_diff(uuid,uuid,text,text)` má vera áfram
  til staðar á meðan rollout stendur yfir.
- Gamall app-kóði brotnar ekki ef SQL58 er keyrt áður en appið deployast.
- Rollback app-kóða verður einfaldari.
- PostgREST function overloading verður ekki óþarfa áhætta.

Fallið ætti að taka:

- `p_actor_id uuid`
- `p_loan_id uuid`
- `p_item_name text`
- `p_note text`
- `p_loaned_at date`
- `p_due_at date`

Fallið ætti að skila:

- `status text`
- `before_item_name text`
- `before_note text`
- `before_loaned_at date`
- `before_due_at date`
- `counterpart_user_id uuid`

Server-side reglur:

- Staðfesta að `p_actor_id` sé til í `auth.users`.
- Sækja `loan_items` með `FOR UPDATE`.
- Óviðkomandi notandi fær `not_found` og engin before-gildi.
- Nota sama auth og núverandi narrow edit, nema Stebbi ákveði annað:
  `created_by OR lender_user_id`.
- Validate-a `item_name`, `note`, `p_loaned_at` og `p_due_at`.
- Skila `invalid_due_date` ef `p_due_at IS NOT NULL AND p_due_at < p_loaned_at`.
- Uppfæra aðeins `loan_items.item_name`, `note`, `loaned_at`, `due_at` og
  `updated_at`.
- Ekki uppfæra `loan_invitations.item_name_snapshot` eða önnur invitation
  snapshots.
- Reikna `counterpart_user_id` eins og núverandi fall: hinn populated party á
  láninu, ekki actor.
- `GRANT EXECUTE` aðeins til `service_role`.
- `REVOKE EXECUTE` frá `PUBLIC`, `anon` og `authenticated`.

SQL migration skal vera í transaction og hafa rollout/rollback comment. SQL má
ekki keyra í Supabase fyrr en Stebbi biður sérstaklega um það.

### 2. Types/schema

Uppfæra `EditLoanItemDetailsSchema` eða búa til nýtt schema fyrir accepted edit
sem tekur:

- `item_name`
- `note`
- `loaned_at`
- `due_at`

Nota sömu date validation og `EditLoanSchema`:

- `YYYY-MM-DD`
- raunveruleg dagsetning
- `due_at` má vera `null`
- `due_at >= loaned_at`

### 3. Server action

Uppfæra `updateLoanItemDetails` í `lib/loans/actions.ts`:

- Parse-a dagsetningar úr nýja schema.
- Kalla nýja RPC-ið, ekki gamla narrow RPC-ið.
- Senda `p_loaned_at` og `p_due_at`.
- Lesa `before_loaned_at` og `before_due_at`.
- Kalla `computeLoanChanges` með before/after sem inniheldur `item_name`,
  `note`, `loaned_at` og `due_at`.
- Kortleggja `invalid_due_date` í `invalid_input`.
- Halda áfram að record-a actor event sem `initiallyRead: true`.
- Halda áfram að record-a counterpart event ef `counterpart_user_id` er til og
  er ekki actor.
- Ekki logga netföng, payload með óþarfa persónugögnum eða raw RPC details.

### 4. Form UI

Uppfæra `components/loans/LoanItemDetailsForm.tsx`:

- Bæta við state fyrir `loanedAt` og `dueAt`.
- Endurnýta `LoanDateField` fyrir `Lánað` og `Skila fyrir`.
- Endurnýta sama clear due date mynstur og í `LoanForm` ef hægt er.
- Senda `loaned_at` og `due_at` með action.
- Skipta `isPending ? '...' : t('save')` yfir í `t('saving')` ef lykillinn er
  til, til að halda texta í messages og loading texta samræmdum.
- Halda öllum notendatexta í `messages/is.json` og `messages/en.json`.

Design.md atriði sem þarf að fylgja:

- Dagsetningarinput mega ekki valda mobile zoomi. `LoanDateField` er besta
  leiðin þar sem það notar 16 px input mynstur.
- Labels skulu vera sýnileg.
- Loading state má ekki ýta layouti eða breyta button-width óþægilega.
- Formið þarf að virka við 360, 390 og 460 px án horizontal overflow.

### 5. Prófanir

Lágmarkspróf sem Claude Code á að bæta við eða uppfæra:

- `lib/__tests__/loans.test.ts`
  - `EditLoanItemDetailsSchema` samþykkir gildar dagsetningar.
  - Það hafnar ógildri dagsetningu.
  - Það hafnar `due_at` fyrir `loaned_at`.
  - Það normaliserar tóma/núll `due_at` rétt.

- `lib/__tests__/actions.test.ts`
  - `updateLoanItemDetails` kallar nýja RPC-ið með `p_loaned_at` og `p_due_at`.
  - `invalid_due_date` verður `invalid_input`.
  - Date-only breyting á `loaned_at` skráir actor og counterpart event.
  - Date-only breyting á `due_at` skráir actor og counterpart event.
  - Removed due date verður `due_at` change með `removed`.
  - No-op breyting skráir ekki event.
  - Counterpart event er ekki skráð ef `counterpart_user_id` er `null` eða actor.

- Form-próf fyrir `LoanItemDetailsForm`
  - Formið sýnir `Lánað` og `Skila fyrir`.
  - Clear due date virkar.
  - Submit sendir `loaned_at` og `due_at`.
  - Loading state birtist án raw `...` ef messages-lykill er til.

- SQL migration próf, ef núverandi test-mynstur styður það
  - Migration býr til nýja RPC-ið.
  - Hún gefur execute aðeins til `service_role`.
  - Hún revoke-ar `PUBLIC`, `anon` og `authenticated`.
  - Hún validate-ar `due_at >= loaned_at`.
  - Hún uppfærir ekki `loan_invitations`.
  - Hún skilar before-gildum fyrir `loaned_at` og `due_at`.

Keyra að lágmarki:

- `npm run type-check`
- `npm run test:run -- lib/__tests__/loans.test.ts`
- `npm run test:run -- lib/__tests__/actions.test.ts`
- `npm run test:run -- lib/__tests__/loan-pages.test.tsx`
- Nýtt eða uppfært form-test ef það er sér skrá
- SQL migration test ef það er til eða bætt við

## Rollout

Öruggasta röð:

1. Claude Code skrifar SQL58 og app-kóðann.
2. Codex rýnir diffið áður en SQL er keyrt.
3. Stebbi samþykkir sérstaklega að keyra SQL58 á Supabase.
4. Eftir SQL keyrslu þarf að reload-a PostgREST schema cache.
5. Staðfesta með service-role RPC call að nýja fallið sé sýnilegt.
6. Deploya app-kóða sem kallar nýja RPC-ið.
7. Stebbi keyrir localhost/prod smoke test eftir því hvað á við.

Rollback:

- Fyrst rollback-a app-kóða sem kallar nýja RPC-ið.
- Nýja SQL fallið má þá vera áfram til staðar án þess að skaða gamla appið.
- Ef ákveðið er að fjarlægja það síðar: drop-a nýja fallið og reload-a schema
  cache. Ekki drop-a meðan live app-kóði kallar fallið.

## Áhætta og atriði sem Claude Code þarf að passa

- Ekki veikja RLS, grants eða service-role mörk.
- Ekki leyfa borrower-only actor að breyta accepted láni nema product-ákvörðun
  segi það skýrt.
- Ekki skila before-gildum til óviðkomandi actor.
- Ekki láta UI leyfa dagsetningar sem RPC hafnar.
- Ekki breyta pre-acceptance `updateLoan` hegðun nema próf sýni að það sé
  nauðsynlegt.
- Ekki búa til duplicate events ef dagsetning breytist ekki raunverulega.
- Ekki blanda þessu við #38, #39 eða #27.
- Passa að `href` í eventum haldist í takt við núverandi hegðun.
- Ef `due_at` er hreinsað þarf event payload að bera `removed`, ekki týna
  breytingunni.

## Spurningar sem Codex vill að Claude Code svari í næsta handoff

1. Var nýtt RPC-nafn notað eða var gamla fallið breytt? Af hverju?
2. Var heimildamengið nákvæmlega `created_by OR lender_user_id`, eða var
   dagsetningabreyting þrengd í lender-only?
3. Hvernig er tryggt að óviðkomandi actor fái ekki before-gildi?
4. Hvaða event payload er skráð fyrir:
   - `loaned_at` breytt
   - `due_at` bætt við
   - `due_at` breytt
   - `due_at` fjarlægt
5. Voru allar breytingar á notendatexta settar í `messages/is.json` og
   `messages/en.json`?
6. Hvaða próf voru uppfærð og hvaða próf voru ekki keyrð?

## Localhost checks for Stebbi

Prófa eftir að Claude Code hefur útfært breytinguna og áður en release er
samþykkt:

1. Opna localhost sem lánveitandi á samþykktu láni.
2. Fara í `Lánað og skilað`, opna samþykkt lán og smella á edit-pennann.
3. Staðfesta að formið sýnir:
   - nafn hlutar
   - `Lánað`
   - `Skila fyrir`
   - athugasemd
4. Breyta aðeins `Lánað` og vista.
   - Vænt niðurstaða: lánið uppfærist og mótaðili fær `Ólesið` event með
     `Breytt lánsdagsetning`.
5. Breyta aðeins `Skila fyrir` og vista.
   - Vænt niðurstaða: lánið uppfærist og mótaðili fær `Ólesið` event með
     `Breyttur skiladagur`.
6. Hreinsa `Skila fyrir` og vista.
   - Vænt niðurstaða: skiladagur hverfur af spjaldi og event payload sýnir að
     skiladagur var fjarlægður.
7. Setja `Skila fyrir` fyrir `Lánað`.
   - Vænt niðurstaða: vistun er stöðvuð með villu og engin event skráning verður.
8. Prófa sem borrower sem er ekki creator/lender.
   - Vænt niðurstaða: edit-penninn birtist ekki eða edit-síðan hafnar aðgangi.
9. Prófa regression:
   - breyta bara nafni
   - breyta bara athugasemd
   - breyta nafni og dagsetningu saman
   - vista án raunverulegra breytinga
10. Prófa mobile breiddir 360, 390 og 460 px.
    - Vænt niðurstaða: enginn mobile zoom, enginn horizontal overflow, engin
      skörun, og date controls eru þægileg í notkun.

Varúð:

- Ekki prófa þetta kæruleysislega á production-gögnum. Dagsetningabreytingar
  eru raunverulegar breytingar á láni og geta búið til `Ólesið` event hjá
  öðrum notanda.
- SQL58 má ekki keyra á Supabase nema Stebbi samþykki það sérstaklega.
