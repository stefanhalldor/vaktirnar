# Handoff til Claude Code: #47 lán, netfang í edit og vistunarvilla

**Viðeigandi TODO:** #47 `Lán: bæta við netfangi í edit og laga vistunarvillu`

**Staða:** Handoff frá Codex til Claude Code. Claude Code á að rýna, staðfesta
orsök og framkvæma afmarkaða lagfæringu eftir eigin tæknilega skoðun.

## Samhengi frá Stebba

Stebbi stofnaði lán fyrir hlutinn `Gítarstandur?` án þess að skrá viðtakanda.
Síðar fékk Stebbi staðfest hjá viðkomandi að hann væri með hlutinn í láni og
vildi bæta netfanginu við í edit. Á edit-síðunni fann Stebbi enga leið til að
bæta við netfangi.

Stebbi ætlaði líka að breyta heitinu úr `Gítarstandur?` í `Gítarstandur`, en fékk
villuna:

`Ekki tókst að vista. Reyndu aftur.`

Stebbi bætti við að villan komi bæði á iPhone og PC tölvu. Þetta bendir frekar
til sameiginlegs app/server/DB-vanda en sértæks browser-buggs.

## Mikilvægt ferlisatriði

Codex byrjaði stuttlega á mögulegri kóðabreytingu, en hætti þegar Stebbi bað um
handoff til Claude Code. Codex hreinsaði eigin hálfkláruðu kóðabreytingar til
baka. Claude Code á því ekki að byggja á neinum Codex-implementation diff fyrir
þetta atriði.

Codex skráði ný TODO:

- #47 þetta atriði
- #48 endurkomunotandi fari sjálfgefið á Teskeiðar
- #49 þekktir viðtakendur í lánum

## Read-only skoðun Codex

Codex skoðaði eftirfarandi skrár:

- `app/auth-mvp/lanad-og-skilad/breyta/[id]/page.tsx`
- `app/auth-mvp/lanad-og-skilad/baeta-vid-adila/[id]/page.tsx`
- `components/loans/LoanForm.tsx`
- `components/loans/AddPartyForm.tsx`
- `components/loans/LoanCard.tsx`
- `components/loans/LoanItemDetailsForm.tsx`
- `lib/loans/actions.ts`
- `lib/loans/types.ts`
- `sql/36_loan_optional_recipient.sql`
- `sql/48_update_loan_with_diff.sql`
- `sql/50_loan_soft_acknowledgement.sql`
- `lib/__tests__/loan-form.test.tsx`
- `lib/__tests__/loan-pages.test.tsx`
- `lib/__tests__/actions.test.ts`
- `messages/is.json`
- `messages/en.json`

## Findings frá Codex

1. Edit-síðan notar `LoanForm` fyrir creator pre-acceptance og
   `LoanItemDetailsForm` fyrir þrengra post-acceptance edit.

2. `LoanForm` sýnir recipient email aðeins í create mode:
   `const isCreate = !initial`.

3. Kóðagrunnurinn er þegar með sér flæði til að bæta við viðtakanda:
   `app/auth-mvp/lanad-og-skilad/baeta-vid-adila/[id]/page.tsx` og
   `components/loans/AddPartyForm.tsx`.

4. `getLoanCardControls(item).showAddParty` virðist vera núverandi source of
   truth fyrir hvort creator megi bæta við aðila.

5. Vistunarvillan gæti verið SQL/RPC ósamræmi frekar en form-villa:
   `updateLoan` kallar `update_loan_with_diff` úr `sql/48_update_loan_with_diff.sql`.
   Ef sú migration er ekki keyrð í localhost/target Supabase eða schema cache er
   ósamstillt mun save líklega falla með almennri villu.

6. Ekkert í `Gítarstandur?` → `Gítarstandur` ætti sjálft að falla á Zod eða SQL
   validation. Bæði nöfn eru stutt, non-empty og innan marka.

## Megináhætta

- Ekki má laga þetta með því að veikja RLS eða gefa `authenticated` beinan aðgang
  að `loan_items` eða `loan_invitations`.
- Ekki má búa til annað invitation-flæði við hliðina á `add_loan_invitation` nema
  mjög góð ástæða sé til.
- Ekki sameina item-save og add-party/email-send í eina action nema Claude Code
  hafi skýrt plan fyrir partial failure, idempotency, retry og email side effect.
- Ef `update_loan_with_diff` vantar í DB er líklega réttara fyrst að staðfesta
  migration/schema-cache stöðu heldur en að fela vandann með blindum fallback.
- Ef fallback í legacy `update_loan` er skoðað þarf að taka með í reikninginn að
  þá tapast diff-event hegðun úr #19/#37 fyrir þá vistun.
- Recipient email má ekki leka í logs, event payload eða client response nema þar
  sem creator þarf raunverulega að sjá það.

## Tillaga að framkvæmd

### 1. Staðfesta vinnusvæðið

Claude Code skal byrja á:

- `git status --short`
- `git diff -- TODO.md`
- `git diff -- app/auth-mvp/lanad-og-skilad/breyta/[id]/page.tsx lib/loans/actions.ts`

Markmið: passa að Claude Code yfirskrifi ekki óskyldar breytingar frá Stebba,
Codex eða Claude Code úr fyrri lotum.

### 2. Greina vistunarvilluna áður en breytt er

Claude Code skal skoða server logs eða mock/unit tests til að staðfesta hvað
`updateLoan` fær til baka þegar `Gítarstandur?` er breytt í `Gítarstandur`.

Sérstaklega þarf að greina hvort þetta er:

- `update_loan_with_diff` vantar eða er ekki í schema cache
- RPC skilar `not_editable`
- RPC skilar `invalid_input` / `invalid_item_name` / `invalid_due_date`
- `get_my_loans` skilar item með control-state sem passar ekki við DB
- annað server action / revalidation vandamál

Claude Code má bæta tímabundið betri internal error mapping í tests, en ekki logga
full netföng eða viðkvæm gögn.

### 3. Bæta við netfangi út frá edit-flæði

Mest conservative leið:

- Halda núverandi `baeta-vid-adila/[id]` route og `AddPartyForm`.
- Á edit-síðu, þegar `getLoanCardControls(item).showAddParty` er satt og hlutur er
  ekki skilaður, sýna skýran secondary CTA eða section:
  `Bæta við viðtakanda`.
- CTA má vísa á núverandi add-party route frekar en að setja annað form beint
  undir edit-formið.

Ef Claude Code velur inline form:

- Passa að það séu ekki tvö óskýr `Vista` form sem notandi ruglast á.
- Nota skýra heading/copy og mögulega annan hnappatexta.
- Tryggja að `LoanForm` og `AddPartyForm` séu ekki hreiðruð hvort inni í öðru.

### 4. Laga vistunarvilluna

Ef orsök er að SQL #48/RPC vantar:

- Ekki keyra SQL án skýrs leyfis frá Stebba.
- Skila Stebba mannamálsútskýringu ef SQL þarf að keyra:
  hvaða SQL, hvort það er schema/function breyting, áhrif á RLS/auth/grants,
  hvort production gögn breytast, rollback/recovery og versta mögulega afleiðing.
- Ef aðeins localhost vantar migration skal segja það skýrt.

Ef orsök er app-kóði:

- Laga afmarkað í `lib/loans/actions.ts`, `LoanForm` eða edit page eftir greiningu.
- Bæta prófi sem festir að `updateLoan` virki fyrir venjulega nafnabreytingu og
  gefi ekki generic villu þegar status er þekktur.

### 5. Þýðingar og copy

Allur nýr sýnilegur texti á að fara í:

- `messages/is.json`
- `messages/en.json`

Ekki hardcode-a íslenskan notendatexta í component.

Íslenskt orðalag þarf að vera stutt og eðlilegt, t.d.:

- `Bæta við viðtakanda`
- `Bæta við netfangi viðtakanda`
- `Þessi færsla er ekki lengur breytanleg.` ef `not_editable` þarf sérskilaboð

## Prófanir sem Claude Code ætti að bæta/keyra

Fókuspróf:

- `lib/__tests__/loan-pages.test.tsx`
  - edit page sýnir add-party CTA/section þegar creator á lán án viðtakanda
  - edit page sýnir ekki add-party CTA þegar invitation er pending/accepted
  - edit page sýnir ekki add-party CTA fyrir non-creator

- `lib/__tests__/loan-form.test.tsx`
  - create mode sýnir recipient email áfram
  - edit mode sýnir ekki create-only recipient email inni í aðal `LoanForm`, ef CTA
    leiðin er valin
  - save payload fyrir edit inniheldur rétt `item_name`

- `lib/__tests__/actions.test.ts`
  - `updateLoan` happy path fyrir `Gítarstandur`
  - þekktir statusar mappar í réttar villur
  - transport/RPC error helst generic án viðkvæmra upplýsinga

Keyra helst:

- `npm run test:run -- lib/__tests__/loan-pages.test.tsx lib/__tests__/loan-form.test.tsx lib/__tests__/actions.test.ts`
- `npm run type-check`

Ekki ræsa eða endurræsa dev server nema Stebbi biðji sérstaklega um það.

## Supabase / SQL

Codex keyrði ekkert SQL.

Þetta handoff leggur ekki til nýja migration sem fyrsta skref. Fyrst þarf Claude
Code að staðfesta hvort `update_loan_with_diff` sé til staðar í því umhverfi sem
Stebbi er að prófa.

Ef þarf að keyra eða skrifa SQL:

- Setja SQL í rétta `sql/` röð.
- Skýra hvort SQL er read-only eða breytir functions/schema/gögnum.
- Taka fram áhrif á RLS, auth, policies, grants, functions og production gögn.
- Hafa rollback/recovery plan.
- Fá sérstakt samþykki Stebba áður en SQL er keyrt.

## Localhost checks for Stebbi

Stebbi prófar eftir að Claude Code hefur klárað breytinguna og localhost er þegar
í gangi hjá Stebba.

### A. Breyta nafni á láni án viðtakanda

Uppsetning:

- Stebbi er innskráður.
- Til er lán sem Stebbi stofnaði án viðtakanda, t.d. `Gítarstandur?`.
- Lánið er ekki accepted og ekki skilað.

Skref:

1. Opna `/auth-mvp/lanad-og-skilad`.
2. Opna edit á `Gítarstandur?`.
3. Breyta heiti í `Gítarstandur`.
4. Vista.

Vænt niðurstaða:

- Engin `Ekki tókst að vista` villa.
- Stebbi fer aftur á lánalistann eða sér skýra staðfestingu samkvæmt núverandi UX.
- Kortið sýnir `Gítarstandur`.

### B. Bæta við viðtakanda eftir á

Uppsetning:

- Sama lán og í A, enn án viðtakanda.

Skref:

1. Opna edit á láninu.
2. Finna skýra leið til að bæta við viðtakanda/netfangi.
3. Slá inn gilt netfang viðtakanda sem á að hafa aðgang.
4. Vista/senda boð.

Vænt niðurstaða:

- Boð vistast.
- Stebbi sér skiljanlega stöðu, t.d. að boð um sameiginlega sýn á lánið hafi verið
  sent.
- Viðtakandi sér pending lán eftir refresh/login ef netfangið passar.

### C. Regression

Prófa líka:

- Stofna nýtt lán með viðtakanda í create-formi. Það á að virka óbreytt.
- Stofna nýtt lán án viðtakanda. Það á að virka óbreytt.
- Lán með pending boði má ekki bjóða upp á að bæta við öðrum viðtakanda á óöruggan
  hátt.
- Accepted lán má ekki fá rangt add-party flæði.
- Ógilt netfang sýnir villu og býr ekki til boð.
- Prófa á iPhone-stærð og desktop, þar sem Stebbi sá vistunarvilluna á báðum.

### Varúð

- Ekki prófa með raunverulegum production netföngum nema Stebbi sé viljandi að
  senda alvöru boð.
- Ekki keyra SQL eða breyta Supabase production án sérstakrar samþykktar.
- Ef villan reynist vera ókeyrð SQL #48 á localhost þarf Stebbi að vita hvort
  aðeins local DB eða production DB er ósamstillt áður en haldið er áfram.

