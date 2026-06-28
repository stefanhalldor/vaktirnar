# Handoff til Claude Code: #47 lán, edit-vistun og viðtakandi eftir á

**Viðeigandi TODO:** #47 `Lán: bæta við netfangi í edit og laga vistunarvillu`

**Staða:** Handoff frá Codex til Claude Code eftir að #49 Tengsl v1 var lokað.
Claude Code á að rýna núverandi stöðu, staðfesta orsök vistunarvillunnar og
framkvæma afmarkaða lagfæringu.

## Codex-rýni á raunverulega þörf

Codex telur að #47 eigi enn rétt á sér, en ekki í upprunalegri breidd.

Það sem virðist þegar vera að hluta lokið:

- Edit-síðan sýnir nú `Bæta við viðtakanda` CTA þegar creator á lán án
  pending/accepted boðs. Þetta er í
  `app/auth-mvp/lanad-og-skilad/breyta/[id]/page.tsx`.
- Prófin í `lib/__tests__/loan-pages.test.tsx` staðfesta að CTA birtist þegar
  `invitation_status` er `null` og hverfur þegar boð er `pending` eða `accepted`.

Það sem er enn opið eða óstaðfest:

- Stebbi þarf að prófa hvort CTA birtist í hans raunverulega gögnunum fyrir
  lán eins og `Gítarstandur?`. Ef hún birtist, er fyrri hluti vandans að mestu
  leystur.
- Add-party skjárinn notar enn bara handvirkt netfang í `AddPartyForm`; hann
  notar ekki Tengsl recipient picker-inn sem nýja lánaformið fékk í #49.
- Vistunarvillan `Ekki tókst að vista. Reyndu aftur.` er ekki hægt að telja
  leysta út frá kóðalestri einum. Unit tests staðfesta happy path fyrir
  `updateLoan`, en ekki að Supabase umhverfi Stebba hafi `update_loan_with_diff`
  og ferskt schema cache.
- Ef Stebbi prófar núna og getur bæði breytt `Gítarstandur?` í `Gítarstandur`
  og bætt við viðtakanda á skiljanlegan hátt, má þrengja #47 í polish eingöngu
  eða færa það í DONE eftir staðfestingu.

## Plan áfangans

0. Láta Stebba framkvæma manual pre-check hér fyrir neðan, ef mögulegt er, áður
   en kóði er snertur.
1. Staðfesta núverandi stöðu í kóðanum og passa að engar óskyldar breytingar séu
   yfirskrifaðar.
2. Greina hvers vegna edit-save getur fallið með `Ekki tókst að vista. Reyndu
   aftur.` þegar heiti er breytt úr `Gítarstandur?` í `Gítarstandur`.
3. Klára add-recipient flæði úr edit þannig að notandi geti bæði slegið inn
   netfang og valið úr Tengsl þar sem það á við.
4. Bæta við markvissum regression-prófum og halda breytingunni þröngri.
5. Skila handoff til Codex áður en #47 er fært í DONE.

## Samhengi frá Stebba

Stebbi stofnaði lán fyrir hlutinn `Gítarstandur?` án þess að skrá viðtakanda.
Síðar fékk hann það staðfest og vildi bæta netfangi við í edit-flæði.

Tvö atriði komu upp:

- Stebbi fann ekki nógu skýra leið til að bæta við netfangi úr edit.
- Þegar hann reyndi að breyta nafninu úr `Gítarstandur?` í `Gítarstandur` fékk
  hann villuna `Ekki tókst að vista. Reyndu aftur.`

Villan kom bæði á iPhone og PC, þannig að hún virðist ekki vera browser-sértæk.

## Manual pre-check fyrir Stebba áður en Claude framkvæmir

Markmið: staðfesta hvort #47 sé enn raunverulegt vandamál, eða hvort það sé
orðið þrengra polish/UX atriði.

### 1. Athuga hvort edit-síðan sýni leið til að bæta við viðtakanda

Uppsetning:

- Vertu innskráður sem creator lánsins.
- Finndu lán sem var stofnað án viðtakanda.
- Lánið má ekki vera með pending boð, accepted mótaðila eða vera skilað.

Skref:

1. Opna lánið í `Lánað og skilað`.
2. Opna `Breyta`.
3. Leita að `Bæta við viðtakanda` neðan við edit-formið.

Túlkun:

- Ef hnappurinn/linkurinn birtist og opnar síðu til að slá inn netfang, er
  grunnvandinn “ég finn enga leið” líklega leystur.
- Ef hann birtist ekki fyrir lán sem ætti greinilega að mega fá viðtakanda, er
  #47 enn virkur bug í control-state eða gögnum.
- Ef hann birtist en er óskýr, of langt niðri eða lítur út eins og aukaatriði,
  er #47 enn UX-polish.

### 2. Athuga hvort nafnabreytingin virki núna

Skref:

1. Opna sama lán í edit.
2. Breyta heiti úr `Gítarstandur?` í `Gítarstandur`.
3. Vista.

Túlkun:

- Ef breytingin vistast án villu, er save-bug hluti #47 hugsanlega þegar leystur
  eða var umhverfis-/schema-cache vandamál sem er horfið.
- Ef `Ekki tókst að vista. Reyndu aftur.` kemur enn, er #47 enn raunverulegur bug
  og Claude á að greina hvort þetta sé SQL/RPC/schema-cache eða app-action
  mapping.
- Ef önnur skýr villa birtist, skrá nákvæma villu og hvenær hún kemur.

### 3. Athuga hvort add-party skjárinn sé nógu góður án Tengsl picker

Skref:

1. Opna `Bæta við viðtakanda`.
2. Skoða hvort þú getur valið tengsl sem þú hefur þegar notað áður.
3. Skoða hvort þú þarft að muna/slá inn netfang handvirkt.

Túlkun:

- Ef handvirkt netfang er nóg fyrir þig, má þrengja #47 og sleppa Tengsl picker
  í þessum áfanga.
- Ef þú vilt geta valið úr Tengsl eins og í `Skrá nýjan hlut`, þá er næsta
  rétta #47 breyting að bæta sama recipient picker við add-party skjáinn.

### 4. Ákvörðun eftir pre-check

- Ef 1 og 2 virka vel og handvirkt netfang er nóg: færa #47 í DONE eða geyma
  smá polish síðar.
- Ef 1 virkar en 2 bilar: #47 á að snúast fyrst um vistunarvilluna.
- Ef 1 og 2 virka en 3 er pirrandi: #47 á að snúast um Tengsl picker á
  add-party skjá.
- Ef 1 bilar: #47 á að snúast um control-state/CTA sýnileika áður en picker er
  bætt við.

## Núverandi staða sem Codex sá

Codex sá að hluti af #47 er nú þegar kominn inn:

- `app/auth-mvp/lanad-og-skilad/breyta/[id]/page.tsx` sýnir nú
  `Bæta við viðtakanda` CTA þegar `getLoanCardControls(item).showAddParty` er
  satt.
- CTA fer á `app/auth-mvp/lanad-og-skilad/baeta-vid-adila/[id]/page.tsx`.
- Add-party route notar `AddPartyForm` og `addLoanInvitation`.
- `AddPartyForm` styður enn bara handvirkt netfang, ekki nýja Tengsl recipient
  picker-inn úr #49.
- Nýja lánaformið (`LoanForm` í create mode) er hins vegar þegar með
  `relationshipOptions` og picker sem sýnir einkanafn/sjálfsett nafn/netfang og
  private note undir nafninu.
- `updateLoan` í `lib/loans/actions.ts` kallar `update_loan_with_diff`.

Þetta þýðir að næsta skref er ekki að finna upp add-party route frá grunni,
heldur að klára UX og greina save-villuna.

## Skrár sem Codex skoðaði

- `app/auth-mvp/lanad-og-skilad/breyta/[id]/page.tsx`
- `app/auth-mvp/lanad-og-skilad/baeta-vid-adila/[id]/page.tsx`
- `app/auth-mvp/lanad-og-skilad/ny/page.tsx`
- `components/loans/AddPartyForm.tsx`
- `components/loans/LoanForm.tsx`
- `lib/loans/actions.ts`
- `lib/loans/types.ts`
- `lib/relationships/actions.ts`
- `messages/is.json`
- `messages/en.json`
- Eldra handoff: `ai-handoff/2026-06-21-2017-todo-047-v001-codex-loan-edit-recipient-save-handoff.md`

## Tillaga að framkvæmd

### 1. Byrja á stöðu og óskyldum breytingum

Keyra read-only skoðun:

- `git status --short`
- `git diff -- app/auth-mvp/lanad-og-skilad/breyta/[id]/page.tsx app/auth-mvp/lanad-og-skilad/baeta-vid-adila/[id]/page.tsx components/loans/AddPartyForm.tsx components/loans/LoanForm.tsx lib/loans/actions.ts`

Markmið: ekki yfirskrifa breytingar frá Stebba, Claude Code eða Codex.

### 2. Greina vistunarvilluna

Skoða `updateLoan` og prófin áður en UI er lagað.

Sérstaklega þarf að staðfesta hvort villan sé:

- RPC/function vandamál: `update_loan_with_diff` vantar í DB eða PostgREST schema
  cache er ósamstillt.
- RPC status: `not_editable`, `invalid_input`, `invalid_item_name`,
  `invalid_due_date`, `not_found` eða óvæntur status.
- App-action mapping: þekkt status endar samt í of almennu `saveFailed`.
- Control-state misræmi: edit UI leyfir vistun sem DB telur ekki lengur heimilaða.

Ef orsökin er SQL/schema-cache í umhverfi Stebba: ekki keyra SQL. Skila fyrst
mannamálsútskýringu og fá sérstakt samþykki.

### 3. Klára add-party með Tengsl picker

Conservative leið:

- Láta `baeta-vid-adila/[id]/page.tsx` sækja `getRelationshipRecipientOptions(user.id)`
  eins og `ny/page.tsx` gerir.
- Láta `AddPartyForm` taka við `relationshipOptions?: RelationshipRecipientOption[]`.
- Endurnýta sömu display-reglur og `LoanForm`:
  - einkanafn fyrst
  - annars nafn sem mótaðili hefur sett sjálfur
  - annars netfang
  - private note undir nafni, inndregið, með `break-words`
  - netfang aðeins sérlína þegar display-nafn er ekki netfangið
- Ekki sýna duplicate Gmail dotted/undotted línur. Nota gögnin úr
  `getRelationshipRecipientOptions`, ekki byggja nýja dedup lógík í component.

Forðast:

- Ekki setja tvö jafngild `Vista` form inni í edit-síðuna.
- Ekki sameina item-save og add-party/email-send í eina server action nema það
  sé sérstaklega hannað fyrir partial failure, retry og email side effect.
- Ekki flytja recipient email inn í edit `LoanForm` sem create-only field nema
  það sé mjög skýrt í UI og prófum.

### 4. Bæta villuskilaboð án gagnaleka

Ef þekktir `updateLoan` statusar enda of almennt í UI má bæta við afmörkuðum
þýðingum, t.d. fyrir `not_editable` og `invalid_input`.

Ekki logga:

- full netföng
- invitation token
- secrets
- raw Supabase payload með notendagögnum

Internal `console.error('[loans/updateLoan] RPC failed')` má vera áfram stutt,
en ef debugging þarf error code má passa að ekkert persónugreinanlegt leki.

### 5. Textar og hönnun

- Allur nýr notendatexti fer í `messages/is.json` og `messages/en.json`.
- Hafa `Design.md` til hliðsjónar:
  - mobile app-like upplifun
  - enginn iOS input zoom
  - enginn horizontal overflow
  - loader/pending state þegar navigation eða save er í gangi
  - skýr aðgreining milli að breyta hlut og bæta við viðtakanda

## Prófanir sem Claude Code ætti að bæta eða staðfesta

Fókus:

- `lib/__tests__/loan-pages.test.tsx`
  - edit page sýnir add-party CTA þegar creator á lán án mótaðila og án virks
    pending/accepted boðs.
  - edit page sýnir ekki add-party CTA þegar boð er pending/accepted eða þegar
    notandi er ekki creator.
  - add-party page fær/sýnir recipient options þegar Tengsl eru til.

- `lib/__tests__/loan-form.test.tsx`
  - create mode heldur áfram að sýna Tengsl picker.
  - add-party form sýnir Tengsl picker án duplicate canonical Gmail línu.
  - private note fer undir display-nafn og brýtur línur á mobile.

- `lib/__tests__/actions.test.ts` eða viðeigandi action-próf
  - `updateLoan` happy path fyrir `Gítarstandur`.
  - `not_editable` og `invalid_input` enda í réttum error status.
  - RPC transport error helst generic án gagnaleka.

Keyra helst:

- `npm run test:run -- lib/__tests__/loan-pages.test.tsx lib/__tests__/loan-form.test.tsx lib/__tests__/actions.test.ts`
- `npm run type-check`

Ef full test suite er keyrð, skrá fjölda og niðurstöðu í Claude handoff.

## Supabase / SQL

Codex keyrði enga SQL skipun.

Þetta handoff leggur ekki til nýja migration sem fyrsta skref. Fyrst þarf að
staðfesta hvort `update_loan_with_diff` sé til í því Supabase umhverfi sem
Stebbi er að prófa og hvort schema cache sé ferskt.

Ef SQL þarf að skrifa eða keyra:

- Setja SQL í rétta röð í `sql/`.
- Útskýra áhrif á gögn, RLS, auth, grants, functions og production.
- Taka sérstaklega fram hvort SQL var aðeins skrifað eða líka keyrt.
- Fá sérstakt samþykki frá Stebba áður en nokkuð er keyrt.

## Hvað má sleppa í þessum áfanga

- Ekki taka #22 route cleanup með.
- Ekki taka #52/#37 `Ólesið` event-vinnu með.
- Ekki taka #50 fjölskyldutengsl með.
- Ekki refactora allt `LoanForm` nema lítil extraction geri Tengsl picker öruggari
  og einfaldari.

## Áhætta sem er enn til staðar

- Ef vistunarvillan er raunverulega ókeyrð SQL/schema-cache mun app-kóðabreyting
  ekki laga umhverfið.
- Add-party sendir mögulega alvöru tölvupóst. Testa þarf með öruggu netfangi eða
  meðvitaðri uppsetningu.
- Recipient picker má ekki leka tengslum milli eigenda. Nota owner-scoped
  `getRelationshipRecipientOptions(user.id)` og ekki client-side global fetch.
- Email canonicalization má ekki fela raunveruleg non-Gmail netföng þar sem punktar
  eru marktækir.

## Tillaga að næsta skrefi

Claude Code byrjar á greiningu á save-villunni og skilar stuttu plan/update ef
vandinn reynist vera SQL/schema-cache. Ef þetta er app-kóði, framkvæmir Claude
Code litla lagfæringu, bætir Tengsl picker við add-party flæðið og skilar closeout
til Codex.

## Spurningar sem Codex á sérstaklega að rýna í closeout

- Er vistunarvillan raunverulega leyst eða aðeins falin með generic fallback?
- Eru add-party heimildir enn bundnar við `showAddParty`, creator og service-role
  RPC, án RLS veikingu?
- Sýnir add-party picker sömu dedup/display hegðun og nýja lánaformið?
- Er pending/save/navigation state nógu app-like samkvæmt `Design.md`?
- Leka private display name eða private note nokkuð til mótaðila?

## Localhost checks for Stebbi

Stebbi prófar eftir að Claude Code hefur klárað breytinguna og localhost er þegar
í gangi hjá Stebba.

### A. Breyta nafni á láni án viðtakanda

Uppsetning:

- Stebbi er innskráður.
- Til er lán sem Stebbi stofnaði án viðtakanda, t.d. `Gítarstandur?`.
- Lánið er ekki accepted, ekki með pending invitation og ekki skilað.

Skref:

1. Opna `/auth-mvp/lanad-og-skilad`.
2. Opna detail/edit á `Gítarstandur?`.
3. Breyta heiti í `Gítarstandur`.
4. Vista.

Vænt niðurstaða:

- Engin `Ekki tókst að vista` villa.
- Hnappur sýnir pending/loader hegðun á meðan vistun/navigation er í gangi.
- Kortið eða detail-síðan sýnir `Gítarstandur` eftir vistun.

### B. Bæta við viðtakanda eftir á með handvirku netfangi

Skref:

1. Opna sama lán.
2. Velja `Bæta við viðtakanda`.
3. Slá inn gilt prófunarnetfang.
4. Vista/senda boð.

Vænt niðurstaða:

- Boð vistast.
- Stebbi sér skýra stöðu um að boð hafi verið sent eða að lán hafi verið vistað
  þó tölvupóstsending hafi mistekist.
- Engin leið birtist til að bæta við öðrum viðtakanda ef boð er orðið pending.

### C. Bæta við viðtakanda úr Tengsl

Uppsetning:

- Stebbi á að minnsta kosti eitt Tengsl með netfangi.
- Gott er að hafa eitt Gmail dotted/undotted tilvik til að staðfesta dedup.

Skref:

1. Opna add-party skjáinn fyrir lán án viðtakanda.
2. Velja tengsl úr listanum.
3. Staðfesta að netfang fyllist rétt.
4. Vista.

Vænt niðurstaða:

- Sama manneskja birtist ekki tvisvar vegna Gmail-punkta.
- Einkaskýring birtist undir nafni, smá inndregin og fer ekki út fyrir mobile
  skjástærð.
- Ef einkanafn vantar er notað self display name ef það er til; annars netfang.

### D. Regression

Prófa líka:

- Stofna nýtt lán með viðtakanda í create-formi.
- Stofna nýtt lán án viðtakanda.
- Ógilt netfang í add-party sýnir villu og býr ekki til boð.
- Accepted lán og lán með pending boði sýna ekki rangt add-party flæði.
- Mobile 360-460 px og desktop sýna edit, villur, picker og hnappa án overlap,
  horizontal scrolls eða iOS zooms.

### Varúð

- Ekki prófa með raunverulegum production netföngum nema Stebbi sé viljandi að
  senda alvöru boð.
- Ekki keyra SQL eða breyta Supabase production án sérstakrar samþykktar.
- Ef villan reynist vera ókeyrð SQL í Supabase þarf fyrst að vita hvort vandinn
  er local, staging eða production áður en haldið er áfram.
