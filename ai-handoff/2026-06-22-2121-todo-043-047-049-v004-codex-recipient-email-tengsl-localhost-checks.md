# Handoff: localhost-prófanir fyrir recipient_email, lánadetail og Tengsl

**Handoff:** Codex → Stebbi og Claude Code  
**Dagsetning:** 2026-06-22 21:21  
**Tengist TODO:** #43 Gmail-punktar og soft-ack lánaboð, #47 viðtakandanetfang í lánaflæði, #49 Tengsl þvert á Teskeiðar  
**Samhengi:** Stebbi vill prófa `sql/55_get_my_loans_add_recipient_email.sql`, nýja birtingu viðtakandanetfangs á lánakortum, smellanleg listaspjöld, detail-síðu og Tengsl undir feature flaggi.

## Stutt niðurstaða um Tengsl

Tengsl virka **ekki sjálfkrafa í báðar áttir** eins og kóðinn stendur núna.

Núverandi gagnalíkan er per-user:

- `relationships.owner_id` er notandinn sem á tengslafærsluna.
- `relationship_sources` tengir uppruna við þessa tilteknu tengslafærslu.
- Aðili A getur átt tengsl við B án þess að B eigi samsvarandi tengsl við A.

Núverandi upsert gerist aðeins þegar innskráði notandinn framkvæmir lánaaðgerð:

- `createLoan(...)` kallar `upsertLoanRelationship(...)` fyrir creator ef viðtakandanetfang er til.
- `addLoanInvitation(...)` kallar líka `upsertLoanRelationship(...)` fyrir þann sem bætir við/sendir boð.
- `upsertLoanRelationship(...)` gerir ekkert ef `Tengsl` eru lokuð eða notandinn hefur ekki per-user aðgang.

Þýðing:

- Ef A hefur Tengsl-aðgang og sendir lánaboð til B, þá getur A fengið tengslafærslu við B.
- B fær ekki sjálfkrafa tengslafærslu við A bara vegna þess að A sendi boð.
- Ef B er ekki með Tengsl-aðgang á meðan, verða tengsl B ekki búin til þá.
- Ef Tengsl verða seinna opnuð fyrir alla, þá fær B aðgang að `/stillingar/tengsl`, en gömul tengsl sem voru aldrei vistuð hjá B birtast ekki sjálfkrafa.

Þetta ætti ekki endilega að valda runtime-villum. Líkleg hegðun er frekar “tómt Tengsl view” eða vantar sögu hjá B. Ef product-markmiðið er að B sjái afturvirkt tengsl við A þegar Tengsl opnast fyrir alla, þarf sérstaka backfill- eða lazy-upsert ákvörðun í #49.

## Sérstök áhætta fyrir seinni opnun

Það eru tvö product/technical gaps sem þarf að passa:

1. **Afturvirkni:** Tengsl verða ekki til fyrir notendur sem voru utan flaggs nema sérstakt backfill sé keyrt eða tengsl séu búin til lazy þegar þeir opna `/stillingar/tengsl`.

2. **Email-only yfir í registered user:** Ef tengsl voru fyrst vistuð sem `email_canonical` áður en mótaðili var registered user, og seinna finnst `counterpart_user_id`, þarf að tryggja að kóðinn uppfæri núverandi email-færslu frekar en að reyna að búa til nýja færslu með sama email. Annars er hætta á unique-index árekstri og `upsertLoanRelationship` loggar bara `[relationships] upsert failed`.

Þetta eru ekki blockers fyrir `sql/55`, en þetta eru mikilvæg atriði fyrir #49 áður en Tengsl eru opnuð almennt.

## Preflight áður en Stebbi prófar

1. Keyra migrations í réttri röð á því Supabase umhverfi sem localhost notar:
   - `sql/53_feature_access_tengsl.sql`
   - `sql/54_relationships.sql`
   - `sql/55_get_my_loans_add_recipient_email.sql`

2. Eftir `sql/55`: reload Supabase/PostgREST schema cache.
   - Supabase Dashboard → Settings → API → Reload schema.

3. Staðfesta env fyrir localhost:
   - `AUTH_MVP_ENABLED=true`
   - `LOANS_ENABLED=true`
   - `TENGSL_ENABLED=true`
   - Til að prófa per-user gating: `TENGSL_FLAG=true`
   - Til að opna fyrir alla seinna: fjarlægja `TENGSL_FLAG` eða hafa það annað en `true`

4. Nota tvö prófnetföng:
   - Notandi A: creator/sá sem sendir lánaboð.
   - Notandi B: recipient/sá sem fær lánaboð.
   - Nota testnetföng, ekki persónuleg eða production-viðkvæm netföng í skjámyndum/handoff.

## Localhost checks for Stebbi

### 1. Recipient email hjá creator með pending boð

Uppsetning:

- Skrá inn sem A.
- A stofnar lán með viðtakandanetfangi B.
- Boð er pending, B hefur ekki valið `Þekki málið`.

Prófun:

1. Opna `/auth-mvp/lanad-og-skilad`.
2. Finna nýja lánið.
3. Opna detail-síðu með því að smella á spjaldið.

Vænt niðurstaða:

- Listaspjaldið sýnir netfang B sem mótaðila.
- Listaspjaldið sýnir ekki `Bíður svars` í sömu summary-línu.
- Detail-síða sýnir netfang B í haus/lýsingu.
- Detail-síða sýnir enn `Bíður svars` sem sér stöðulínu neðar.
- `Boð um sameiginlega sýn á lánið` og `Afturkalla boð` haga sér eins og áður.

Regression sem þarf að passa:

- Engin tvöföld `Bíður svars` birting.
- Netfang B birtist ekki á röngum lánum.
- Engin console villa eftir schema reload.

### 2. Pending soft-ack hjá recipient

Uppsetning:

- Skrá inn sem B með sama canonical netfangi og boðið var sent á.
- B hefur ekki enn samþykkt boðið.

Prófun:

1. Opna `/auth-mvp/lanad-og-skilad`.
2. Staðfesta að pending lánið birtist.
3. Opna detail-síðu.
4. Velja `Þekki málið`.

Vænt niðurstaða:

- Pending boðið birtist áfram hjá B eftir `sql/55`.
- `Þekki málið` virkar áfram.
- B sér ekki `recipient_email` sem sérstaka viðtakandabirtingu frá invitation.
- Eftir samþykki sýnist lánið sem venjulegt lán hjá báðum aðilum.

Regression sem þarf að passa:

- Ef pending boðið hvarf hjá B, þá er `get_my_loans` soft-ack branch eða schema cache líklegasta orsök.
- Ef `Þekki málið` skilar villu, skrá nákvæman villutexta: `wrong_email`, `expired`, `not_claimable` eða almenn villa.

### 3. Accepted lán sýnir nafn frekar en netfang

Uppsetning:

- B hefur samþykkt lánaboð.
- Mótaðili hefur profile/display name ef hægt er.

Prófun:

1. Skrá inn sem A.
2. Opna lánalista og detail.
3. Skrá inn sem B.
4. Opna sama lánalista og detail.

Vænt niðurstaða:

- Þegar `other_display_name` er til á nafn að birtast frekar en netfang.
- Netfangið á ekki að halda áfram að vera aðalbirting þegar tengdur user/profile er þekktur.

### 4. Lán án viðtakanda

Uppsetning:

- A stofnar lán án viðtakandanetfangs.

Prófun:

1. Opna lánalista.
2. Opna detail-síðu.

Vænt niðurstaða:

- Engar rangar mótaðilaupplýsingar birtast.
- Enginn `recipient_email` placeholder.
- Ef boði er bætt við síðar með `Bæta við aðila`, þá á netfang að birtast eftir það hjá creator.

### 5. Smellanlegt listaspjald og detail-síða

Prófun:

1. Opna `/auth-mvp/lanad-og-skilad`.
2. Smella hvar sem er á listaspjaldi.
3. Prófa á mobile-width og desktop-width.

Vænt niðurstaða:

- Allt spjaldið opnar `/auth-mvp/lanad-og-skilad/[id]`.
- Edit-táknið er ekki á listaspjaldinu.
- Aðgerðir eins og edit, merkja skilað, eyða, senda/aflýsa boði eru á detail-síðu.
- Eyðing á detail-síðu skilur notanda ekki eftir á dauðri detail-síðu.

### 6. Tengsl með A með aðgang og B án aðgangs

Uppsetning:

- `TENGSL_ENABLED=true`
- `TENGSL_FLAG=true`
- A er í `feature_access` fyrir `tengsl`.
- B er ekki í `feature_access` fyrir `tengsl`.
- A stofnar lán með netfangi B eða bætir B við lán með `Bæta við aðila`.

Prófun sem A:

1. Skrá inn sem A.
2. Opna `/stillingar/tengsl`.
3. Opna tengslafærslu fyrir B.

Vænt niðurstaða fyrir A:

- B birtist sem Tengsl hjá A.
- Tag er `Óflokkaður`.
- Detail-síða sýnir `Lánað og skilað`.
- Þar sést heiti hlutar og dagsetning láns.
- `Opna lán` fer beint á `/auth-mvp/lanad-og-skilad/[id]`.
- Flokksbreyting virkar og vistast.

Prófun sem B:

1. Skrá inn sem B.
2. Reyna að opna `/stillingar/tengsl`.

Vænt niðurstaða fyrir B:

- B á ekki að komast í Tengsl meðan `TENGSL_FLAG=true` og B er ekki í `feature_access`.
- B á samt áfram að geta notað `Lánað og skilað` ef `LOANS_ENABLED=true`.
- Pending lánaboðið á að birtast hjá B í lánaflæðinu.

### 7. Opna Tengsl síðar fyrir B

Uppsetning:

- Annaðhvort bæta B í `feature_access` fyrir `tengsl`, eða opna fyrir alla með því að hafa `TENGSL_ENABLED=true` og `TENGSL_FLAG` ekki `true`.

Prófun:

1. Skrá inn sem B.
2. Opna `/stillingar/tengsl`.

Vænt niðurstaða með núverandi kóða:

- B fær aðgang að Tengsl route.
- Það er ekki tryggt að B sjái A sem tengsl afturvirkt.
- Ef B hefur aldrei sjálfur sent/bætt við lánaaðila meðan `upsertLoanRelationship` var virkt fyrir B, getur listinn verið tómur.

Þetta er vænt núverandi hegðun, en líklega product-gap ef Stebbi vill að Tengsl verði sameiginleg saga þegar feature er opnað almennt.

### 8. Aðskilin tengsl og einkagögn

Uppsetning:

- A og B hafa báðir Tengsl-aðgang.
- Hvor um sig hefur tengslafærslu við hinn, ef hægt er að búa það til með lánaaðgerðum í báðar áttir.

Prófun:

1. A breytir flokki/töggi á sinni tengslafærslu.
2. B opnar sína tengslafærslu.

Vænt niðurstaða:

- Breyting A á flokki á ekki að breyta flokki B.
- Tengsl eru owner-scoped og einkastillingar eiga ekki að leka milli notenda.

### 9. Registered vs óregistered recipient

Prófun A:

1. A sendir lánaboð á netfang sem á ekki enn user.
2. Staðfesta að Tengsl hjá A vistast með email.
3. Seinna, þegar viðkomandi hefur user, prófa að A sendi annað lánaboð á sama netfang.

Vænt/áhætta:

- Núverandi kóði reynir að finna `counterpart_user_id` ef user er til.
- Ef til er eldri email-only tengslafærsla gæti komið unique-index árekstur í stað þess að uppfæra gömlu færsluna.
- Þar sem `upsertLoanRelationship` gleypir villu, gæti lánaflæðið samt tekist en nýr `relationship_source` ekki bæst við.

Þetta er edge case sem Claude Code ætti að rýna áður en Tengsl eru opnuð víðar.

## Atriði sem Stebbi þarf ekki að prófa kæruleysislega

- Ekki keyra migrations aftur og aftur í production til að “sjá hvað gerist” nema vitað sé að þær séu idempotent og schema-cache staða sé skýr.
- Ekki nota raunveruleg persónuleg netföng í skjámyndum eða handoff skjölum.
- Ekki prófa feature flag breytingar í production án skýrrar ákvörðunar um hverjir eiga að sjá Tengsl.
- Ekki setja `TENGSL_FLAG=false` sem eina leið til að prófa opnun ef deployment/env hegðun er óljós; skrá nákvæmlega hvaða env var var breytt og hvort dev server var endurræstur.

## Mælt næsta tæknilega mat fyrir Claude Code

Claude Code ætti að meta sérstaklega fyrir #49:

1. Hvort Tengsl eigi að vera tvíátta frá upphafi þegar lán tengir tvo registered users.
2. Hvort claim/accept á lánaboði eigi að búa til tengsl hjá recipient líka.
3. Hvort opnun á `Tengsl` fyrir alla eigi að keyra backfill úr núverandi `loan_items` og `loan_invitations`.
4. Hvort `upsertLoanRelationship` eigi að sameina email-only tengsl við `counterpart_user_id` þegar notandi skráir sig síðar.
5. Hvort `relationship_sources` eigi að verða til fyrir báða eigendur þegar báðir hafa aðgang, eða hvort það verði áfram owner-scoped og lazy.

Codex mælir ekki með að loka #49 fyrr en þessi atriði eru product-samþykkt, því annars mun Tengsl líta vel út hjá beta-notendum en verða ósamræmd eða tóm hjá þeim sem fá aðgang síðar.
