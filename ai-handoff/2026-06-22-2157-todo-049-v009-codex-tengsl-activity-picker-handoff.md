# Handoff fyrir Claude Code: Tengsl eiga að sýna alla sameiginlega virkni og nýtast sem viðtakendaval

**TODO:** #49 Tengsl þvert á Teskeiðar  
**Dagsetning:** 2026-06-22 21:57  
**Frá:** Codex  
**Til:** Claude Code  
**Staða:** Stebbi vill laga þetta strax, en Claude Code á samt að rýna öryggi og scope áður en framkvæmd hefst.

## Samhengi frá Stebba

Stebbi sér nú eitt tengsl við `stebbishj@gmail.com`, sem er rétt sem tengiliðafærsla, en detail-síðan sýnir aðeins eitt lán undir `Lánað og skilað` þótt Stebbi hafi lánað eða fengið lánað hjá sama aðila margoft.

Stebbi vill endurskoða módel/högun þannig að:

- tengiliðurinn sjálfur sé stofnaður út frá Teskeið eins og `Lánað og skilað` aðeins ef hann er ekki þegar til
- `/stillingar/tengsl/[id]` fletti síðan upp hreyfingum í Teskeiðum út frá tengiliðnum/netfanginu, í stað þess að treysta á að allar hreyfingar hafi verið skráðar í `relationship_sources`
- Stebbi sjái hvaða nafn tengiliðurinn hefur á sjálfum sér
- Stebbi geti sett sína eigin innri skýringu/minnismiða á tengiliðinn, aðeins sýnilegt Stebba
- þegar Stebbi stofnar nýtt lán í `Lánað og skilað`, og á tengsl til, birtist valmöguleiki að velja úr tengdum aðilum
- í valinu sjáist netfang viðkomandi, nafn viðkomandi og innri skýring Stebba

## Núverandi staða í kóða

Skoðað af Codex:

- `sql/54_relationships.sql`
- `lib/relationships/actions.ts`
- `app/stillingar/tengsl/page.tsx`
- `app/stillingar/tengsl/[id]/page.tsx`
- `components/tengsl/TagSelectForm.tsx`
- `components/loans/LoanForm.tsx`
- `components/loans/AddPartyForm.tsx`
- `lib/loans/actions.ts`
- `messages/is.json`
- `lib/__tests__/tengsl-pages.test.tsx`

Núverandi hegðun:

- `relationships` er per-owner tengiliður.
- `relationship_tags` geymir flokk.
- `relationship_sources` geymir uppruna, með `UNIQUE (relationship_id, source_type, source_id)`.
- `upsertLoanRelationship()` er keyrt best-effort þegar lán er stofnað með viðtakanda eða þegar viðtakanda er bætt við lán.
- Detail-síðan `app/stillingar/tengsl/[id]/page.tsx` notar `relationship.loan_source_ids` úr `relationship_sources`, sækir síðan `get_my_loans` og sýnir bara þau source IDs sem notandi hefur aðgang að.

Þetta skýrir bug/veikleika Stebba: ef tengiliðurinn var stofnaður út frá einu láni, eða eldri lán voru til áður en `relationship_sources` byrjaði að fyllast, sér detail-síðan ekki alla sögu viðkomandi. `relationship_sources` er provenance, ekki tæmandi activity index.

## Product-ákvörðun fyrir þennan áfanga

Codex mælir með þessari reglu:

- `relationships` er canonical tengiliðurinn hjá eiganda.
- `relationship_sources` má halda áfram sem upprunamerkingu/audit: "þessi tengiliður varð til vegna Lánað og skilað".
- `relationship_sources` má ekki vera eina heimildin fyrir sameiginlegri virkni.
- Detail-síðan á að reikna lánasögu dynamískt út frá tengiliðnum og núverandi lánagögnum.
- Tengiliðaval í lánsformi á að nota sama `relationships` grunn og fylla inn `recipient_email`; það má ekki senda private note eða önnur private tengslagögn inn í loan action payload.

## Mikilvæg öryggisrýni áður en kóði er skrifaður

Þetta snertir Supabase, service-role lestur, auth og persónugögn. Claude Code þarf að passa sérstaklega:

1. Ekki nota `relationship_sources` sem heimild til að sýna lán án þess að staðfesta að innskráður eigandi hafi aðgang.
2. Ekki sýna lán út frá netfangi nema lán tengist raunverulega innskráðum notanda.
3. Ekki leka `relationships.note`, `private_display_name` eða önnur private tengslagögn til mótaðila.
4. Ekki sýna "nafn sem tengiliður hefur á sjálfum sér" ef það myndi staðfesta að handsláið netfang sé til sem Teskeið-aðgangur án samþykkts eða beins samhengis.
5. Ekki veikja RLS eða grants. Núverandi tengslatöflur eru service-role only, og það á að halda.
6. Ekki breyta `get_my_loans` til að skila meira af user IDs eða netföngum til client nema það sé algjörlega nauðsynlegt og rýnt sérstaklega.

Varúð um self-name:

- Öruggasta v1 reglan er að sýna `counterpart_profile.display_name` sem "Nafn í Teskeið" aðeins þegar `counterpart_user_id` er á relationship og það er þegar til beint/accepted/shared samhengi milli notendanna.
- Ef relationship er bara pending email invite, og mótaðili hefur ekki samþykkt, er áhættusamt að sýna display name sem leitarniðurstöðu úr `auth.users`/`profiles`, því það getur orðið account-enumeration.
- Ef Claude Code telur að núverandi kóði sé þegar að geyma `counterpart_user_id` of snemma við pending invite, ekki auka lekann í UI án skýrrar product-ákvörðunar frá Stebba. Þá má sýna netfangið og private note, en bíða með self-name þar til accepted/direct context er til.

## Tillaga að framkvæmd

### 1. Endurhugsa detail activity sem dynamic lookup

Bæta við server-only helper í `lib/relationships/actions.ts`, til dæmis:

- `getRelationshipLoanActivity(ownerUserId, ownerEmail, relationship)`

Hann á að:

- taka inn relationship sem þegar hefur verið sótt með `.eq('owner_id', ownerUserId)`
- nota service-role en skilyrða allar fyrirspurnir explicit við `ownerUserId`
- finna öll lán þar sem owner og counterpart tengjast
- skila aðeins view model fyrir UI: `id`, `item_name`, `loaned_at`, `returned_at`, `my_role`, mögulega `status`
- raða nýjast fyrst
- dedupe-a sömu lán ef þau matcha bæði með `counterpart_user_id` og `email_canonical`

Möguleg matching regla:

- Ef `relationship.counterpart_user_id` er til:
  - sýna lán þar sem `loan_items.lender_user_id = ownerUserId AND loan_items.borrower_user_id = counterpart_user_id`
  - eða `loan_items.borrower_user_id = ownerUserId AND loan_items.lender_user_id = counterpart_user_id`
  - einnig pending/created invitations þar sem owner sendi á relationship email eða counterpart sendi á owner, ef það er innan núverandi soft-ack reglna.
- Ef aðeins `relationship.email_canonical` er til:
  - sýna lán sem owner stofnaði og nýjasta/virka invitation á láninu hefur `recipient_email_normalized = email_canonical`
  - ekki reyna að sýna önnur lán bara út frá display name.

Mikilvægt: Ekki er nóg að sækja `get_my_loans` og filtera eftir `other_display_name`, því display name er ekki einstakt og getur valdið röngum tengingum. Ef `get_my_loans` vantar dálka til öruggs matching á ekki að troða þessu inn í client-filter. Nota frekar server-only helper eða afmarkað RPC.

### 2. Halda `relationship_sources` en nota það sem "uppruni"

Ekki þarf endilega nýja migration fyrir þennan áfanga.

`relationship_sources` getur áfram sagt að tengiliðurinn kom úr `Lánað og skilað`, en detail-síðan á ekki að sýna bara source IDs. Ef UI þarf upprunamerkingu má sýna texta eins og:

- "Tengsl stofnað vegna Lánað og skilað"

en lánalistinn sjálfur á að koma úr dynamic lookup.

### 3. Bæta við private note / innri skýringu

Schema er þegar með:

- `relationships.private_display_name`
- `relationships.note`

Nýta það áður en nýtt schema er búið til.

Bæta við server action, til dæmis:

- `updateRelationshipDetails(relationshipId, { private_display_name, note })`

Kröfur:

- `guardTeskeidSession()`
- `guardFeatureAccess(user.email!, 'tengsl')`
- `.eq('id', relationshipId).eq('owner_id', user.id)` áður en update er leyft
- trimma input
- tómur strengur verður `null`
- virða núverandi mörk: `private_display_name <= 120`, `note <= 1000`
- generic error í client, ekki logga private note
- `revalidatePath('/stillingar/tengsl')` og `revalidatePath('/stillingar/tengsl/[id]')`

UI:

- Á detail-síðu: sýna "Nafn í Teskeið" ef öruggt er að birta counterpart display name.
- Sýna form fyrir "Mitt heiti" eða "Mín skýring" eftir því hvað Stebbi vill nota í v1.
- Lágmarks v1: `note` sem "Mín skýring" og mögulega `private_display_name` ef það er þegar til í schema.

### 4. Tengiliðaval í nýju lánsformi

Á `app/auth-mvp/lanad-og-skilad/ny/page.tsx`:

- sækja session
- ef `checkFeatureAccess(user.id, user.email!, 'tengsl')` er true, sækja relationship options
- ef ekki, birta núverandi form óbreytt

Bæta við server-only helper:

- `getRelationshipRecipientOptions(ownerUserId)`

Skili aðeins tengslum sem hafa nothæft `email_canonical`.

View model:

```ts
type RelationshipRecipientOption = {
  id: string
  email: string
  selfDisplayName: string | null
  privateDisplayName: string | null
  note: string | null
  tags: string[]
}
```

`LoanForm`:

- fái optional `relationshipOptions`
- ef listinn er til og ekki tómur: sýna select/combobox fyrir tengda aðila
- þegar val er gert: setja `recipientEmail` í email viðkomandi
- leyfa áfram handvirkt netfang
- í option label/detail sjáist:
  - netfang
  - nafn viðkomandi ef öruggt og tiltækt
  - innri skýring Stebba
- private note má aldrei fara í `createLoan` action payload; aðeins `recipient_email` fer með.

Ekki gera þetta að of flóknum searchable combobox ef það tefur lagfæringuna. Venjulegt `<select>` með skýrum texta dugir í v1 ef það er mobile-vænt og prófanlegt.

### 5. AddPartyForm líka?

Stebbi nefndi þegar lán er stofnað. Það væri samt rökrétt að `AddPartyForm` á detail-síðu láns fái sama tengiliðaval, því þar er sama viðtakandavandamál.

Codex mælir með:

- gera `LoanForm` fyrst
- ef einfalt er, bæta sama optional picker við `AddPartyForm`
- ef það stækkar scope, setja `AddPartyForm` sem follow-up í handoff niðurstöðu, ekki blanda því inn með hálfri útfærslu.

## Ekki gera í þessum áfanga

- Ekki búa til nýjar töflur nema Claude Code finni raunverulega óyfirstíganlegt schema-vandamál.
- Ekki breyta `relationships` í tvíhliða global friendship model.
- Ekki backfilla production gögn í þessum áfanga án sér preflight og samþykkis Stebba.
- Ekki færa #50 fjölskyldumeðlimi inn í þessa breytingu.
- Ekki taka route-hreinsun #22 með.
- Ekki gera profile/Facebook tengingu #51 með.

## Prófanir sem Claude Code ætti að bæta við eða uppfæra

Unit/component tests:

- `TengslDetailPage` sýnir mörg lán fyrir sama tengilið þótt `relationship_sources` innihaldi bara eitt source.
- Detail-síða dedupe-ar lán sem matchar bæði source og dynamic lookup.
- Detail-síða sýnir ekki lán sem tilheyrir öðrum owner.
- Detail-síða raðar lánum nýjast fyrst.
- Detail-síða sýnir item name, lánadag og status/skilað á sama hátt og Stebbi þarf í screenshot.
- Private note/skýring birtist á tengslasíðu og vistast aðeins fyrir owner.
- Unauthorized user getur ekki uppfært note/tag á relationship sem hann á ekki.
- LoanForm með relationship options fyllir `recipient_email` þegar tengiliður er valinn.
- LoanForm sendir ekki private note, private display name eða tags í `createLoan`.
- Þegar Tengsl feature access er off/fail-closed birtist núverandi email input áfram án picker.

SQL/static tests:

- Ef engin migration er gerð: staðfesta með comment/test að schema 54 sé óbreytt.
- Ef migration verður nauðsynleg: bæta static test fyrir grants/RLS/constraints og skýra rollback.

Manual checks:

- Sjá `Localhost checks for Stebbi` hér að neðan.

## Supabase og production-varúð

Þessi áfangi ætti helst ekki að þurfa nýja migration.

Ef Claude Code telur að nýtt RPC eða index sé nauðsynlegt:

- búa til nýja SQL skrá í `sql/` með næsta migration númeri
- skýra hvort SQL sé read-only eða schema/function breyting
- hafa transaction þar sem við á
- ekki keyra SQL sjálfkrafa
- skrifa rollback/recovery
- taka sérstaklega fram áhrif á RLS, auth, grants, functions og production gögn
- fá skýrt samþykki Stebba áður en SQL er keyrt í Supabase

Service-role helper í TypeScript er ásættanlegt í v1 ef hann er strangt owner-scoped og prófaður.

## Localhost checks for Stebbi

Setja þarf upp prófunargögn á localhost:

- Stebbi er innskráður sem notandi A.
- Tengsl eru virk fyrir notanda A: `TENGSL_ENABLED=true` og ef `TENGSL_FLAG=true`, þá þarf notandi A að vera í `feature_access` fyrir `tengsl`.
- Til er tengiliður við notanda/netfang B, t.d. `stebbishj@gmail.com`.
- Til eru mörg lán milli A og B, bæði eldri og nýrri. Gott er að hafa a.m.k.:
  - eitt lán sem varð til áður en relationship source var skráð
  - eitt lán sem varð til eftir tengslaupsert
  - eitt skilað lán
  - eitt enn í láni eða pending lán ef hægt er

Prófa detail-síðu tengils:

1. Opna `/stillingar/tengsl`.
2. Opna tengiliðinn B.
3. Vænt niðurstaða: detail-síðan sýnir ekki bara eina source-færslu, heldur öll lán milli A og B sem A má sjá.
4. Staðfesta að hvert lán sýni heiti hlutar og lánadag.
5. Smella á `Opna lán` fyrir nokkrar færslur.
6. Vænt niðurstaða: rétt detail-síða opnast undir `/auth-mvp/lanad-og-skilad/[id]`.
7. Passa að engin lán tengd öðrum notanda birtist.

Prófa private note/skýringu:

1. Á `/stillingar/tengsl/[id]`, skrifa innri skýringu, t.d. "Vinnufélagi úr golfhóp".
2. Vista.
3. Refresh-a síðuna.
4. Vænt niðurstaða: skýringin helst.
5. Skrá sig inn sem annar notandi ef hægt er.
6. Vænt niðurstaða: annar notandi sér ekki skýringu A.

Prófa nafn viðkomandi:

1. Ef B er skráður Teskeið-notandi með prófílnafni, staðfesta að öruggt "Nafn í Teskeið" birtist aðeins í samhengi þar sem A má þegar vita af B.
2. Ef B hefur ekki samþykkt/pending-only samhengi, passa að UI leki ekki óþarflega því hvort netfangið sé til í Teskeið.

Prófa nýtt lán með tengiliðavali:

1. Opna `/auth-mvp/lanad-og-skilad/ny`.
2. Ef A hefur Tengsl-aðgang og til eru tengsl með netfangi, á val um tengdan aðila að birtast.
3. Velja B.
4. Vænt niðurstaða: email input fyllist með netfangi B.
5. Í valinu á Stebbi að sjá netfang, nafn viðkomandi ef tiltækt og innri skýringu Stebba.
6. Stofna lán.
7. Vænt niðurstaða: lán stofnast eins og áður, boð fer á rétt netfang, private note fer ekki í lánagögn, email eða event payload.

Regression-prófanir:

- Handvirkt netfang virkar áfram þegar enginn tengiliður er valinn.
- Lánsform virkar áfram þegar notandi hefur engan Tengsl-aðgang.
- `/stillingar/tengsl` er áfram læst bakvið feature flag.
- Mobile 360-460 px sýnir tengiliðaval, note-form og lánalista án overlap eða horizontal scroll.
- Ef service-role query klikkar má UI frekar sýna tóman activity lista eða skýra villu, ekki leka gögn eða crasha alla síðuna.

Ekki prófa kæruleysislega á production:

- Ekki keyra nýja SQL migration eða backfill án sérstakrar samþykktar Stebba.
- Ekki nota raunveruleg persónunetföng í test fixtures eða handoff.
- Ekki deila screenshotum sem sýna private notes eða raunnetföng utan verkefnisins.

## Spurningar fyrir Claude Code að svara í done-handoff

1. Var hægt að leysa þetta án nýrrar migration?
2. Hvernig er tryggt að dynamic activity lookup leki ekki lánum milli notenda?
3. Hvenær birtist "nafn í Teskeið" og hvernig var account-enumeration áhættan meðhöndluð?
4. Er `relationship_sources` áfram notað sem provenance, eða var það fjarlægt úr UI?
5. Var tengiliðaval bætt bara í nýtt lánsform eða líka í `AddPartyForm`?
6. Hvaða próf voru keyrð og hver voru exit codes?
