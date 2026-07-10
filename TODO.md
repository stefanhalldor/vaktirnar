# TODO

## Vinnuregla áður en næsta atriði fer í framkvæmd

Áður en Codex eða Claude Code útbýr eða framkvæmir næsta handoff skal alltaf
rýna hvort atriðið eigi enn rétt á sér miðað við nýjustu kóðastöðu, DONE-sögu og
raunverulega notendaþörf.

Fyrir hvert opið atriði skal fyrst skrá:

- hvort atriðið sé enn opið, að hluta lokið, úrelt eða tilbúið í DONE án frekari
  kóðabreytinga;
- hvaða hlutar vandans eru staðfestir í kóða, prófum eða localhost og hvaða
  hlutar eru aðeins tilgátur;
- nákvæm manual pre-check skref fyrir Stebba til að prófa núverandi hegðun áður
  en framkvæmd hefst, svo hann átti sig á hvort hann vill raunverulega breytinguna;
- nákvæm `Localhost checks for Stebbi` fyrir eftir breytingu, með skrefum,
  væntri niðurstöðu og regressions sem þarf að passa;
- hvort öruggasta niðurstaðan sé að framkvæma, þrengja atriðið, færa það í DONE,
  færa það síðar í röðina eða loka því sem ekki lengur þörf.

Ef manual pre-check sýnir að notendaþörfin er ekki lengur til staðar skal ekki
framkvæma óþarfa breytingu. Þá skal færa atriðið í DONE eða uppfæra TODO með
skýrum rökum, eftir staðfestingu Stebba.

## Forgangsröðun

Þetta yfirlit stýrir vinnuröðinni. Númer atriðanna haldast óbreytt svo eldri
tilvísanir og verkefnasaga rofni ekki.

| Röð | Atriði                                                        | Vinnupakki og samhengi                                                                                                                                 |
| --- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **#61 Aðila-flæði birtist í sögu hlutar**                    | **Event/history pakki með #38.** Skrá í `Saga hlutarins` þegar aðila er bætt við, boð samþykkt eða boði hafnað. |
| 2   | **#38 Event þegar lánaboði er hafnað**                       | **Event/Ólesið pakki með #61.** Bæta decline-eventi og ack/read-state ofan á staðfestan `Ólesið` grunn; loka sem undiratriði ef #61 leysir það. |
| 3   | **#39 Gera samþykktan hlut óvirkan við eyðingu**             | **Event/heimildir pakki.** Delete á samþykktum hlut er soft delete: hlutur verður disabled og áfram aðgengilegur sem slíkur. |
| 4   | **#59 Deilanlegur hlekkur á lánadetail**                     | **Detail/access pakki.** Notandi geti sent hlekk á hlut; hlekkurinn virkar aðeins hjá þeim sem hafa aðgang í Teskeið. |
| 5   | **#63 Endurnefna „Lánað og skilað“ í „Minnið“**              | **Product/IA quick win.** Gera núverandi lánakerfi að fyrstu tegundinni inni í `Minnið`, án gagnamódelsbreytinga í v1. |
| 6   | **#64 Fallegra hlutverkaval í edit-viðmóti**                 | **UI polish eftir #62.** Skipta ljótum `Leiðrétta í...` takka út fyrir tvær pillur: `Ég lánaði` og `Ég fékk lánað`. |
| 7   | **#66 Flytja lánaðan hlut á annan aðila**                    | **Minnið/aðila-edit eftir #64.** Notandi geti skipt út staðfestum mótaðila þegar hlutur endar hjá öðrum, án þess að loka og stofna nýtt lán. |
| 8   | **#27 Mýkra lánaboðsflæði**                                  | **Eftir event-grunn.** Full mýking lánaboða byggir á því að #38/#39/#59/#61 séu orðin traust og að #63/#64/#66 séu skýr. |
| 9   | **#17 Hugmyndir úr hugmyndabankanum á `/heim`**              | **Heimaskjár pakki.** Skipta væntanlegt-lista í raunverulegar hugmyndir og kosningu; gott að taka með #42. |
| 10  | **#42 Tilbúnar Teskeiðar efst og síðast opnuð fyrst**        | **Heimaskjár pakki.** Gera virkar Teskeiðar efstar og skýrar áður en hugmyndir taka meira pláss á `/heim`. |
| 11  | **#41 Umönnun sem feature-flagged Teskeið**                  | **Feature-card/info quick win.** Sýna sem varlega feature-flagged Teskeið án þess að flytja Umönnun-gögn inn. |
| 12  | **#46 User+pass fallback þegar kóði berst ekki**             | **Auth reliability pakki.** Mikilvægt ef kóðar berast illa, en snertir auth/rate limit/reset og á að vera sér áfangi. |
| 13  | **#7 Langlíf innskráning**                                   | **Auth/session pakki.** Taka með #46 eða strax á eftir, en ekki blanda við láns/event quick wins. |
| 14  | **#22 Hreinsa sýnilegar `/auth-mvp/` slóðir**                | **Route cleanup.** Gera eftir að `/heim`, `/stillingar/*` og loan flæði eru stöðug; þarf redirect- og query-param próf. |
| 15  | **#13 Endurskilgreina hlutverk whitelist/admin-lista**       | **Admin/access ákvörðun.** Ákveða hlutverk listans áður en meira admin UI byggist á honum. |
| 16  | **#33 Fjöldi innskráðra notenda í admin tölfræði**           | **Admin quick win eftir #13.** Einföld talning, en skilgreining og service-role mörk þurfa að vera skýr. |
| 17  | **#10 Gáfuleg opnun tölfræðisíðu**                           | **Admin stats sérpakki.** Server-side heimsóknarrökfræði, race conditions og fallback; ekki opnunarblocker. |
| 18  | **#69 Virkni per Teskeið í admin sýn**                      | **Admin/usage pakki.** Mæla notkun virkra Teskeiða í admin, sérstaklega hversu oft Veðrið reiknar nýjar leiðir, án þess að leka staðsetningum eða notendagögnum. |
| 19  | **#50 Fjölskyldumeðlimir sem tengsl**                        | **Future Tengsl data.** Bíður þar til Tengsl v1 hefur fengið raunnotkun; snertir viðkvæmari fjölskyldu-/barnagögn. |
| 20  | **#54 Spjall á hverjum lánaða hlut**                         | **Stærri future feature.** Byggir á detail-page access, event/read-state og skýrri privacy ákvörðun. |
| 21  | **#57 Timestamp format í ensku locale**                      | **Tech debt/i18n.** `formatEventTimestamp` notar `kl.` og íslenska orðröð utan messages-template. Lágt forgangsstig. |
| 22  | **#51 Staðfest Facebook-tenging**                           | **Phase 1 kóðinn er tilbúinn og shipped (commit 547f367) en disabled - kveikja með `FACEBOOK_OAUTH_ENABLED=true` + Supabase/Facebook stillingar (sjá v015 handoff). Phase 2 badge í lánaboðssamhengi er ólokið.** |
| 23  | **#67 Veður: óæskilegur keyrslutími dags**                  | **Ferðalagið follow-up.** Notandi geti sagt hvaða tíma dags hann vill alls ekki vera að keyra, t.d. að nóttu til, og ferðaveðurmatið taki tillit til þess. |
| 24  | **#70 Veður: leiðartími og route-provider samanburður**     | **Ferðalagið follow-up, ekki release blocker.** Þrengslavegur-leiðin finnst nú, en Google Routes tíminn er enn of nálægt Route 427 miðað við Google Maps; skoða Mapbox og provider-samanburð síðar. |
| 25  | **#71 Veður: allir spápunktar og fjarlægð frá vegi**        | **Ferðalagið UI/copy polish.** Setja vegalengd spápunktar frá veginum aftur inn og nota sömu fullu punktaupplýsingar í öllum detail-spjöldum undir spápunktalistanum. |
| 26  | **#72 Veður: mest krefjandi við upphaf ferðar**             | **Ferðalagið edge-case polish.** Ef mest krefjandi punkturinn er fyrsti punkturinn á top-spjaldið að segja að hann sé við upphaf ferðarinnar, ekki sleppa línunni. |
| 27  | **#73 Veður: veður við komu á áfangastað**                  | **Ferðalagið result polish.** Sýna veður við áætlaða komu á áfangastað í top-spjaldinu, með skýru `Mættur`/arrival-lúkki svo þetta verði gagnlegt en ekki dauður texti. |
| 28  | **#74 Veður: hvað veldur ófullnægjandi gögnum og nálgun**   | **Ferðalagið data quality.** Skoða hvað veldur því að spápunktar fá `Ófullnægjandi gögn` (no_data) og hvort hægt sé að gera nálgun m.v. tiltæk gögn þegar nákvæm spá vantar. |
| 29  | **#75 Veður: Spá 🥄 — veðurspátafla fyrir alla spápunkta**  | **Ferðalagið UI.** Endurnýta `ForecastDrawer` þannig að hægt sé að opna Teskeiðarútlit á veðurspá frá öllum þremur stöðum: komu við áfangastað, mesta krefjandi punkti og öllum spápunktum í lista. |

## Vinnupakkar

**Pakki A — saga, `Ólesið`, events og lánaboð:** #61, #38, #39, #59
og síðan #27. Grunnurinn úr #37, #56, #58 og #62 er kominn í DONE.
Næst er að klára aðila-events og decline-event saman, síðan soft-delete- og
detail-hlekkjaheimildir. Áður en #27 fer í fulla texta- og UI-vinnu er rökrétt
að klára #63, snyrta #64 og skilgreina #66 svo lánaboðsflæðið byggi á réttu
`Minnið`-orðalagi og skýrri aðila-/hlutverka-upplifun frá byrjun.

**Pakki B — Minnið, role-switch UI, heimaskjár og virkar Teskeiðar:** #63, #64,
#66, #17, #42 og #41. Þetta mótar hvað notandi sér fyrst eftir innskráningu og
hvað hann upplifir inni í fyrsta virka `Minnið`-flæðinu.

**Pakki C — auth reliability:** #68, #46 og #7. Þetta er mikilvægt, en snertir
innskráningu, sessions, reset/rate-limit og öryggi; best sem sérpakki með
sérstakri rýni.

**Pakki D — routes og admin:** #22, #13, #33, #10 og #69. Taka þegar core
notendaflæði eru stöðug, svo canonical slóðir, admin-tölfræði og
Teskeiða-notkunarmælingar byggist ekki á fljótandi grunnhegðun.

**Pakki E — stærri framtíðareiginleikar:** #50, #54 og #51. Þetta eru ekki
fyrstu quick wins: þau snerta viðkvæmari gögn, nýja gagnastrúktúra eða ytri
OAuth provider. #60 er kominn fyrsti afmarkaði spjall-áfangi inni í sögu
hlutarins; #54 bíður sem stærri framtíðarútvíkkun ef spjallið á að verða
fullkomnara.

**Pakki F — Veðrið / Ferðalagið:** #67, #70, #71, #72, #73, #74, #75 og áframhaldandi `todo-067` handoff.
Þetta er product- og UX-vinna fyrir ferðaveðurmatið: deterministic veðurmat,
traust kort, skýrir spápunktar og notendastillingar sem hafa áhrif á hvaða
brottfarar- eða heimferðartíma kerfið mælir með.

#46
## User+pass fallback þegar kóði berst ekki

**Staða:** Bíður

**Stofnað:** 2026-06-18

**Samhengi:** Núverandi innskráning byggir á tölvupóstkóða. Ef kóðinn berst ekki
þarf notandi að geta hallað sér að öruggri email+lykilorð innskráningu án þess
að missa aðgang eða þurfa að bíða eftir póstsendingu.

**Vandamál:** Tölvupóstkóðar geta tafist, lent í ruslpósti eða ekki borist vegna
mail-delivery vandamála. Þá er notandi fastur þótt netfangið og aðgangurinn séu
rétt.

**Ósk:** Búa til user+pass innskráningu sem er aðgengileg af kóðasendingarsíðunni
sem fallback. Valkosturinn á að vera skýr en ekki ýta öllum notendum frá
einfalda kóða-flæðinu.

**Við útfærslu:**

- Kortleggja núverandi auth-flæði áður en framkvæmd hefst, sérstaklega:
  `/innskraning`, kóðasendingu, kóðastaðfestingu, Supabase session og logout.
- Velja einföldustu öruggu leiðina. Ef Supabase Auth email/password nýtist án
  sér password-töflu skal það skoðað fyrst.
- Sýna link eða secondary action á kóðasendingarsíðu, t.d. `Skrá inn með
  lykilorði`, þegar notandi er að bíða eftir kóða eða kóðinn berst ekki.
- Skilgreina hvernig notandi setur eða endurstillir lykilorð:
  - nýr notandi má ekki þurfa að vita lykilorð sem hann hefur aldrei búið til
  - innskráður notandi þarf örugga leið til að setja lykilorð síðar
  - gleymt lykilorð þarf öruggt reset-flæði
- Halda núverandi tölvupóstkóða-flæði áfram sem aðalflæði.
- Halda session-hegðun, redirect eftir login og logout samræmdu við núverandi
  Teskeið-innskráningu.
- Huga að því hvort user+pass fallback tengist #7 langlífri innskráningu og
  mobile auth-upplifun.

**Öryggi og gögn:**

- Aldrei geyma plain-text lykilorð.
- Ekki búa til custom password hashing nema það sé algjörlega nauðsynlegt og þá
  með sterkri, viðurkenndri aðferð og rýni.
- Ekki leka hvort netfang sé til, hvort lykilorð sé sett eða hvort notandi sé á
  lista. Villuskilaboð skulu vera almenn.
- Bæta við rate limiting / abuse-vörn fyrir password login og password reset.
- Passa CSRF/session/cookie mörk og að login-form opni ekki bypass á núverandi
  auth guards.
- Ekki veikja RLS, Supabase Auth, feature access, admin access eða loan access.
- Ekki logga lykilorð, reset tokens, auth errors með viðkvæmum upplýsingum eða
  full netföng í server logs.
- Ef SQL eða Supabase Auth stillingar þarf að breyta, skal gera sérstakt plan,
  migration/recovery plan og fá samþykki Stebba áður en keyrt er.

**Prófanir:**

- Notandi getur áfram fengið kóða og skráð sig inn með núverandi flæði.
- Á kóðasendingarsíðu er sýnilegur fallback-valkostur fyrir lykilorðsinnskráningu.
- Notandi með sett lykilorð getur skráð sig inn með email+password.
- Rangt lykilorð sýnir almenna villu og lekur ekki hvort netfangið sé til.
- Notandi án lykilorðs fær örugga og skiljanlega leið til að setja eða
  endurstilla lykilorð.
- Rate limiting eða sambærileg vörn kemur í veg fyrir brute force.
- Útskráning virkar eins eftir password login og eftir kóða-login.
- Redirect eftir login varðveitir ætlaða áfangasíðu.
- Mobile 360-460 px sýnir fallback, password form, reset link og villur án
  overlap eða óæskilegs zooms.
- Regression: admin login, feature access, `Lánað og skilað` og Umönnun route
  gating breytast ekki óvart.

#50
## Fjölskyldumeðlimir sem tengsl

**Staða:** Bíður

**Stofnað:** 2026-06-21

**Samhengi frá Stebba:** Notandi þarf að geta sett inn fjölskyldumeðlimi sína.
Eftir nýjustu stefnu á þetta ekki að vera sér route `/stillingar/fjolskyldan`,
heldur hluti af `/stillingar/tengsl` með taggi/tegund fyrir fjölskyldu. Fyrsta
nýting á þessum grunni verður Teskeiðin `Fyrsta vakt krakkanna`.

**Ósk:** Fjölskyldumeðlimir eiga að verða hluti af almennum, endurnýtanlegum
tengsla- og stillingagrunni fyrir Teskeiðar sem þurfa að vita hverjir tilheyra
heimili eða fjölskyldu notanda. `Fyrsta vakt krakkanna` á að nota þetta fyrst, en
lausnin má ekki vera sérsniðin þannig að hún nýtist aðeins þeirri Teskeið.

**Tengist:**

- #49 `Vinir og þekktir viðtakendur þvert á Teskeiðar`
- Fyrsta `/stillingar` grunninum:
  - `/stillingar/minn-profill`
  - `/stillingar/tengsl`

**Við útfærslu:**

- Skilgreina hvernig fjölskyldumeðlimir eru módeleraðir innan sama
  tengslagrunni án þess að veikja privacy eða blanda saman óinnskráðum börnum og
  auth-notendum á hættulegan hátt.
- Ákveða hvaða lágmarksgögn þarf fyrst: nafn, hlutverk/tengsl, fæðingarár eða
  aldur ef `Fyrsta vakt krakkanna` þarf aldurstengt samhengi.
- Safna aðeins þeim gögnum sem fyrsta notkun þarf. Ekki safna óþarfa
  persónuupplýsingum um börn eða fjölskyldumeðlimi.
- Hönnunin á að styðja endurnýtingu milli Teskeiða: fjölskyldumeðlima-val,
  fjölskyldukort og stillingasíður eiga að vera almennir íhlutir, ekki
  `Fyrsta vakt krakkanna`-sérlausn.
- Kortleggja hvernig fjölskyldu-tags innan `/stillingar/tengsl` tengjast
  `/stillingar/minn-profill` svo stillingasvæðið verði samhangandi.
- Ákveða hvort fjölskyldumeðlimir séu aðeins local/private records hjá notanda eða
  hvort þeir geti síðar tengst raunverulegum auth-notendum.
- Ef fjölskyldumeðlimur er barn eða óinnskráður aðili má ekki gera ráð fyrir að
  hann hafi eigin Teskeið-aðgang eða samþykki.

**Öryggi og gögn:**

- Fjölskyldu- og barnaupplýsingar eru viðkvæmari en venjulegt UI-state. Meðhöndla
  þetta sem persónugögn með sérstöku varúðarstigi.
- Ekki birta fjölskyldumeðlimi í client payload nema innskráður eigandi hafi
  raunverulega aðgang að þeim.
- Ekki veita `anon` eða almennum `authenticated` notendum beinan aðgang að
  fjölskyldutöflum nema RLS sé nákvæmlega skilgreint og prófað.
- Ekki logga nöfn barna, fæðingardagsetningar, aldur eða aðrar viðkvæmar
  fjölskylduupplýsingar.
- Ef SQL migration þarf að búa til fjölskyldutöflur þarf sérstakt plan,
  rollback/recovery, RLS-rýni og samþykki Stebba áður en keyrt er.

**Prófanir:**

- Innskráður notandi getur opnað `/stillingar/tengsl` og síað eða skoðað
  fjölskyldumeðlimi þar.
- Notandi getur bætt við fjölskyldumeðlimi með lágmarksgögnum sem þarf fyrir
  fyrstu útgáfu.
- Notandi getur breytt og fjarlægt eigin fjölskyldumeðlimi.
- Annar notandi sér ekki fjölskyldumeðlimi fyrsta notandans.
- Óinnskráður notandi kemst ekki inn á `/stillingar/tengsl`.
- `Fyrsta vakt krakkanna` getur valið fjölskyldumeðlimi úr sama grunni án þess að
  tvítaka gögn eða búa til sér lista.
- Mobile 360-460 px sýnir stillingasíðuna og fjölskylduform án overlap,
  horizontal scroll eða óæskilegs zooms.

#51
## Staðfest Facebook-tenging

**Staða:** Bíður

**Stofnað:** 2026-06-21

**Uppfært:** 2026-07-01

**Samhengi frá Stebba:** Stebbi vill að notandi geti tengt Facebook við
prófílinn sinn, en aðeins sem staðfesta tengingu. Manual Facebook-hlekkur er
ekki áhugaverður, því þá gæti notandi slegið inn `facebook.com/einhver` óháð
því hvort það sé raunverulega hann. Tilgangurinn er fyrst og fremst traust í
lánaboðum og tengslum: þegar notandi fær lánaboð á hann að geta séð að sendandi
hefur staðfesta Facebook-tengingu og þannig betur metið hvort þetta sé rétti
aðilinn áður en hann smellir á `Þekki málið`.

**Ósk:** Bæta við staðfestri Facebook OAuth-tengingu fyrir innskráðan notanda,
án manual Facebook-slóðar og án þess að gera Facebook-login að innskráningarleið
í fyrsta áfanga.

**Við útfærslu:**

- Nota OAuth/identity-linking mynstur fyrir innskráðan notanda, líklega
  Supabase `linkIdentity({ provider: 'facebook' })`, ef núverandi Supabase Auth
  og SSR/callback mynstur styður það örugglega.
- Ekki bjóða manual Facebook URL reit í v1.
- Ekki setja `Skrá inn með Facebook` á innskráningarsíðu í þessum áfanga.
- Bæta við UI á `/stillingar/minn-profill` þar sem notandi sér stöðu:
  `Facebook ekki tengt`, `Staðfest með Facebook` eða villa/pending state.
- Notandi getur tengt Facebook, hætt við OAuth og aftengt Facebook aftur án þess
  að missa núverandi Teskeið-aðgang.
- Meta hvort Supabase manual identity linking þarf að vera sérstaklega virkt í
  Auth-stillingum áður en kóði er skrifaður.
- Staðfesta hvaða Facebook identity metadata Supabase skilar í raun:
  provider id, nafn, mynd, email og hvort örugg/opnanleg prófílslóð fæst. Ekki
  lofa `Skoða Facebook` nema provider-gögn og permissions styðji það.
- Birta staðfestingu aðeins í samhengi þar sem notandi hefur raunverulegan
  aðgang, t.d. lánaboð frá viðkomandi, sameiginlegt lán eða samþykkt tengsl.
- Halda allri notendatextagerð í `messages/is.json` og `messages/en.json`.
- Lesa viðeigandi kafla í `Design.md` áður en UI er útfært.
- Ekki setja Facebook App ID, secret, access token, callback URL eða provider
  config í client-kóða, logs eða handahófskenndar skjöl.

**Öryggi og gögn:**

- Þetta snertir auth/account-linking, ytri OAuth provider, secrets og
  persónugögn og þarf því sérstakt plan og rýni áður en framkvæmd hefst.
- Facebook-staðfesting er traustmerki, ekki almenn heimild. Hún má ekki veita
  aðgang að lánum, tengslum eða notendagögnum.
- Ekki búa til public directory eða global leit yfir Facebook-tengda notendur í
  fyrsta áfanga.
- Ekki geyma OAuth access tokens í public töflu eða client-readable payload.
- Ef provider metadata er speglað í public schema þarf afmarkað schema/RLS-plan
  með lágmarksgögnum og skýru sýnileikasamhengi.
- Ef Supabase Auth provider stillingum, Facebook appi, secrets eða redirect
  allow-list þarf að breyta skal fá sérstakt samþykki frá Stebba áður en það er
  gert.
- Ef SQL migration þarf skal gera rollback/recovery plan og rýna áhrif á RLS,
  auth, grants, functions, production og notendagögn áður en hún er skrifuð eða
  keyrð.

**Handoff:** Sjá
`ai-handoff/2026-07-01-2208-todo-051-v002-codex-facebook-oauth-plan.md`.

**Prófanir:**

- Innskráður notandi getur tengt Facebook við sinn eigin prófíl með OAuth.
- Notandi getur hætt við OAuth consent og fær skýra, örugga hegðun.
- Notandi getur aftengt Facebook aftur án þess að missa Teskeið-session.
- `Minn prófíll` sýnir rétta tengingarstöðu, loading/pending og villur.
- Viðtakandi lánaboðs sér staðfesta Facebook-stöðu sendanda aðeins ef boðið
  gefur honum raunverulegt samhengi við sendanda.
- Annar notandi sér ekki Facebook gögn án heimildarsamhengis.
- Núverandi kóða-/OTP-innskráning virkar áfram óbreytt.
- Rangur OAuth callback, hafnað consent og útrunnið state/token fá skýra og
  örugga hegðun.
- Mobile 360-460 px: prófíl UI, OAuth pending/return, villur og lánaboð sýna
  enga óvænta zoom-, overflow-, keyboard- eða overlap-villu.

#54
## Spjall á hverjum lánaða hlut

**Staða:** Bíður

**Stofnað:** 2026-06-23

**Samhengi frá Stebba:** Nú er hver lánaður hlutur með sína sér síðu í
`Lánað og skilað`. Það opnar möguleika á að nota detail-síðuna sem stað fyrir
afmarkað spjall um nákvæmlega þann hlut.

**Vandamál:** Samskipti um lánaðan hlut geta annars lent í SMS, Messenger,
tölvupósti eða almennu samtali án samhengis. Þá týnist hvað var verið að ræða um:
skiladag, ástand hlutar, hvar hann er, hvort hann sé tilbúinn til afhendingar
eða hvort eitthvað hafi breyst.

**Ósk:** Búa síðar til item-scoped spjall inni á hverri lánadetail-síðu þannig
að aðilarnir sem hafa aðgang að láninu geti rætt um hlutinn í sama samhengi og
lánaupplýsingarnar.

**Við útfærslu þarf að skilgreina:**

- Hverjir mega lesa og skrifa í spjallinu:
  - creator/lender/borrower,
  - pending recipient áður en boð er samþykkt,
  - eða aðeins staðfestir aðilar eftir claim.
- Hvort pending invitation recipient megi sjá fyrri skilaboð áður en hann velur
  `Þekki málið`.
- Hvernig spjall birtist á lánadetail-síðu án þess að kæfa aðalaðgerðir eins og
  `Þekki málið`, `Kannast ekki við þetta`, `Skilað`, `Breyta` eða `Eyða`.
- Hvort `Ólesið` / recent events eigi að sýna ný spjallskilaboð.
- #60 hefur sett fyrsta afmarkaða spjallið inn í `Saga hlutarins`; #54 á aðeins
  að halda áfram ef við viljum stærri spjallupplifun, t.d. betri states,
  attachments, realtime eða ítarlegri skilaboðastjórnun.
- Hvort spjall eigi að styðja aðeins texta í fyrstu útgáfu, eða síðar myndir,
  afhendingartíma, staðsetningu eða attachment.
- Hvernig eydd, cancelled, declined, expired eða returned lán haga sér gagnvart
  spjalli.
- Hvort skilaboð séu immutable eða hvort notandi geti eytt/leiðrétt eigin
  skilaboð.

**Öryggi og gagnamörk:**

- Spjall má aldrei leka milli ótengdra notenda eða milli lána.
- Access þarf að vera bundinn við sama owner/participant/invitation-samhengi og
  loan detail access.
- Ekki veita almennan `authenticated` lestur að spjalltöflum.
- Ef Supabase Realtime eða polling verður notað þarf að rýna RLS, channel
  authorization og billing/usage áhrif áður en það er virkjað.
- Ekki logga skilaboðainnihald, netföng eða viðkvæmar upplýsingar í server logs.
- Í fyrstu útgáfu skal forðast attachments nema sérstakt öryggisplan sé gert.

**Hönnun og mobile:**

- Fylgja `Design.md`; spjallið á að líða eins og hluti af appinu, ekki innbyggt
  iframe eða legacy chat.
- Mobile keyboard má ekki valda óæskilegu zoomi, láréttu overflowi eða því að
  inputið fari undir browser chrome/safe-area.
- Textarea/input skal vera minnst 16 px á mobile.
- Spjallflæði þarf loading, empty, sending, failed og retry states.
- Skilaboð eiga að vera læsileg við 360-460 px viewport og ekki ýta mikilvægum
  loan-actions óaðgengilega langt í burtu.

**Prófanir:**

- Aðili með aðgang að láninu sér spjallið á réttum hlut.
- Óviðkomandi notandi sér ekki spjallið og getur ekki sent skilaboð.
- Skilaboð í einu láni birtast ekki í öðru láni.
- Pending/accepted/declined/cancelled/returned states fylgja skilgreindri
  product-ákvörðun.
- Ný skilaboð birtast rétt í UI og failed send má reyna aftur.
- Mobile 360-460 px með keyboard opið/lokað veldur ekki zoomi, overlapi eða
  scroll-villu.
- Ef `Ólesið` tengist spjalli síðar, þá uppfærist read/unread state án
  duplicate events eða leka milli notenda.

#61
## Aðila-flæði birtist í sögu hlutar

**Staða:** Bíður

**Stofnað:** 2026-06-27

**Samhengi frá Stebba:** Í `Saga hlutarins` vantar event þegar aðila er bætt við
hlut. Stebbi bendir líka á að það vanti líklega event þegar viðtakandi velur
`Þekki málið` eða `Kannast ekki við þetta`.

**Vandamál:** Saga hlutarins á að vera traust samfelld saga af því sem gerðist
við lánið. Ef aðili er boðinn inn, samþykkir boðið eða hafnar því án þess að það
birtist í sögunni, vantar mikilvægt samhengi fyrir báða aðila.

**Ósk:** Skrá og birta aðila-flæðið í `Saga hlutarins`:

- þegar aðila er bætt við hlut
- þegar boð er sent eða virkjað ef það er aðskilið frá því að aðila sé bætt við
- þegar viðtakandi velur `Þekki málið`
- þegar viðtakandi velur `Kannast ekki við þetta`

**Við útfærslu:**

- Kortleggja núverandi event-skráningu í `addLoanInvitation`,
  `performInvitationSend`, `claimInvitation` og `declineInvitation`.
- Staðfesta hvað vantar raunverulega eftir #58/#60: sum accepted/declined events
  gætu þegar verið skráð fyrir `Ólesið`, en ekki endilega með réttu history
  samhengi eða fyrir réttan audience.
- Bæta við skýrum event types ef þarf, t.d. `loan_party_added`,
  `loan_invitation_sent`, `loan_invitation_accepted` og
  `loan_invitation_declined`.
- Tryggja að eventin hafi `entity_type='loan'` og `entity_id=loanId` ef þau eiga
  að birtast í `Saga hlutarins`.
- Setja `actorUserId` á ný events svo `Framkvæmt af {name}` virki.
- Ekki nota `recent_events.user_id` sem actor.
- Halda payload öruggu: `itemName`, role eða stutt state er í lagi; ekki skila
  recipient email, raw invitation email eða user-id í client.
- Samræma texta við product-orðalag:
  - `Aðila bætt við`
  - `Þekkti málið`
  - `Kannast ekki við þetta`
- Ef #38 er enn opið þegar þetta er útfært, má sameina decline-hlutann við #61
  eða loka #38 sem leystu undiratriði, eftir rýni.

**Öryggi og gögn:**

- Event má aðeins birtast þeim sem hafa aðgang að láninu samkvæmt sömu reglum og
  `Saga hlutarins`.
- Ekki leka netfangi boðaðs aðila til óviðkomandi eða til viðtakanda ef
  núverandi product-reglur leyfa það ekki.
- Pending recipient má aðeins sjá sögu ef SQL60-reglurnar heimila það.
- Service-role helper/RPC má ekki logga recipient email, user IDs eða raw payload.

**Prófanir:**

- Þegar aðila er bætt við hlut birtist event í `Saga hlutarins`.
- Þegar viðtakandi velur `Þekki málið` birtist event í sögunni.
- Þegar viðtakandi velur `Kannast ekki við þetta` birtist event í sögunni.
- Báðir aðilar sjá sama örugga samhengi þegar þeir hafa aðgang.
- Óviðkomandi notandi sér ekkert með beinum hlekk eða RPC-kalli.
- Eventin birtast ekki tvöfalt þótt `recent_events` hafi actor/counterpart rows.
- Actor-lína birtist á nýjum events.

#38
## Event þegar lánaboði er hafnað

**Staða:** Bíður, tengt #61

**Næsta handoff:** Sjá sameiginlegan pakka fyrir #36, #37, #38, #39 og #40:
`ai-handoff/2026-06-10-1721-todo-036-037-038-039-040-v001-codex-loans-polish-events-package.md`.

**Samhengi:** Þetta tengist #27 mýkra lánaboðsflæði og #37 event-sögu í
`Nýlegt`. Þegar mótaðili tekur afstöðu til lánaboðs er það mikilvæg breyting
fyrir þann sem sendi boðið.

**Athugið:** #61 er breiðara history-atriði sem nær líka yfir
`Kannast ekki við þetta`. Ef #61 leysir decline-eventið bæði í `Saga hlutarins`
og `Ólesið` má loka #38 sem hluta af þeirri vinnu.

**Vandamál:** Stebbi hafnaði lánaboði frá öðrum notanda, en sá sem sendi boðið
fékk það ekki upp sem event. Það er atburður sem sendandi ætti klárlega að fá
tilkynningu um.

**Ósk:** Þegar viðtakandi hafnar lánaboði á sendandi að fá event í
atburðasöguna/`Nýlegt`, með skýru og öruggu samhengi um hvaða hlutur eða boð var
hafnað.

**Við útfærslu:**

- Kortleggja núverandi `decline_invitation` flæði, server action og RPC.
- Bæta eventi fyrir sendanda þegar boði er hafnað, t.d.
  `loan_invitation_declined`.
- Geyma aðeins öruggt payload, t.d. `itemName` og invitation/loan auðkenni ef
  viðkomandi notandi má sjá þau.
- Ekki skila recipient email í client payload eða logs.
- Tryggja að eventið fari aðeins til þess notanda sem sendi boðið eða á rétt á
  að vita af niðurstöðunni.
- Ákveða hvort decline eigi líka að ack-a unread `loan_invitation_received`
  event hjá viðtakanda.
- Samræma texta við #27 orðalagið, t.d. `Kannast ekki við þetta`.

**Prófanir:**

- Sendandi fær event þegar viðtakandi hafnar lánaboði.
- Óviðkomandi notandi sér ekki decline-eventið.
- Recipient email lekur ekki í client payload, logs eða UI.
- Viðtakandi sér ekki áfram actionable unread boð eftir að hafa hafnað því.
- Eventið birtist í `Nýlegt`/atburðasögu með réttu heiti og linki.

#39
## Gera samþykktan hlut óvirkan við eyðingu

**Staða:** Bíður

**Næsta handoff:** Sjá sameiginlegan pakka fyrir #36, #37, #38, #39 og #40:
`ai-handoff/2026-06-10-1721-todo-036-037-038-039-040-v001-codex-loans-polish-events-package.md`.

**Samhengi:** Í `Lánað og skilað` getur mótaðili verið búinn að samþykkja boð.
Stebbi vill að delete á samþykktum hlut sé ekki hörð eyðing heldur geri hlutinn
óvirkan. Hluturinn á að vera áfram aðgengilegur sem óvirkur hlutur, meðal annars
fyrir feril, `Ólesið` og beinan detail-hlekk.

**Vandamál:** Ef samþykktur hlutur er fjarlægður alveg getur mótaðili misst
samhengi um hvað gerðist, event/hlekkur getur vísað á horfinn hlut og ferill
hlutarins verður ófullkominn.

**Ósk:** Notandi með réttan aðgang geti eytt samþykktum hlut þannig að hann
verði disabled/óvirkur en áfram sýnilegur sem slíkur þeim aðilum sem höfðu
aðgang. Mótaðilinn á að fá event í atburðasöguna sína svo aðgerðin sé ekki
þögul eða ruglingsleg.

**Við útfærslu:**

- Kortleggja núverandi delete-réttindi í UI, server action og SQL/RPC.
- Skilgreina nákvæmlega hver má gera samþykktan hlut óvirkan. Nýjasta
  product-stefna Stebba fyrir lán er einföld samvinnuhegðun: báðir aðilar sem
  hafa aðgang að samþykktu láni mega almennt framkvæma aðgerðir, en
  óviðkomandi notendur mega aldrei komast að.
- Framfylgja reglunni server-side í RPC/server action, ekki aðeins með földum
  client-hnappi.
- Nota soft-delete/disabled state, ekki harða eyðingu á `loan_items`, nema
  Stebbi samþykki sérstaklega annað.
- Óvirkur hlutur skal áfram hafa detail-síðu sem sýnir disabled state og feril,
  en hættulegar eða óviðeigandi aðgerðir skulu vera óvirkar.
- Þegar hlutur er eyddur skal skrá event fyrir mótaðila ef hann er til staðar.
- Event payload má ekki leka recipient email eða óþarfa persónugögnum.
- `Ólesið`/history hlekkur má vísa á detail-síðu óvirka hlutarins svo
  samhengi tapist ekki.
- Tryggja að eyðing veikji ekki RLS, grants, service-role mörk eða aðgangsmörk
  óviðkomandi notenda.

**Prófanir:**

- Aðili með aðgang getur gert samþykktan hlut óvirkan.
- Mótaðili fær event um eyðinguna.
- Óviðkomandi notandi getur ekki gert hlut óvirkan með beinni köllun.
- Recipient email eða önnur óþörf gögn leka ekki í event payload eða logs.
- Óvirkur hlutur er áfram aðgengilegur á detail-síðu með skýru disabled state.
- Óvirkur hlutur birtist ekki sem venjulegur virkur hlutur í lista, nema
  sérstaklega sé hannað söguyfirlit eða filter fyrir óvirka hluti.

#41
## Umönnun sem feature-flagged Teskeið

**Staða:** Bíður

**Samhengi:** Umönnun kom á undan Teskeið.is og er í sér appi þar sem unnið er
með mjög viðkvæm gögn. Á meðan Teskeiðin sjálf er ekki orðin að appi getur
Umönnun áfram nýtt sér notification- og spjallkosti sérappsins.

**Vandamál:** Umönnun vantar sem sýnilega Teskeið í Teskeið.is, en það má ekki
gefa notendum ranga tilfinningu um að Umönnun sé þegar orðin hluti af sama
vefappinu eða að viðkvæm gögn séu flutt inn í Teskeið.is.

**Ósk:** Setja Umönnun inn sem Teskeið undir feature flag. Þegar notandi smellir
á Umönnun á að birtast skýr, róleg skýring um að Umönnun sé í sér appi vegna
viðkvæmra gagna og vegna þess að appið kom á undan Teskeið.is. Taka skal fram
að þegar Teskeið verður gert að appi verði tekin stefnumótandi ákvörðun um
hvort Umönnun falli beint undir Teskeið eða verði áfram sem sér app. Á meðan
Teskeið.is er ekki orðið app skal hvetja fólk til að sækja Umönnun appið og
bjóða upp á hlekki á App Store, Play Store og beint á `umonnun.is`.

**Við útfærslu:**

- Setja Umönnun sem Teskeið á viðeigandi lista eða heimaskjá, en aðeins bak við
  skýrt feature flag.
- Smellur á Umönnun á ekki að opna viðkvæm gögn inni í Teskeið.is; hann á að
  opna upplýsingaskjá, modal eða route sem útskýrir sérstöðu Umönnunar.
- Textinn þarf að vera náttúrulegur og traustvekjandi, án þess að hræða notanda.
- Bæta við hlekkjum á App Store, Play Store og `umonnun.is`.
- Geyma hlekki og notendatexta í réttu config/i18n mynstri verkefnisins, ekki
  hardcode-a þýðanlegan texta í component.
- Gæta sérstaklega að því að engin Umönnun gögn, notendaupplýsingar eða
  app-tengd secrets/API lyklar séu flutt eða birt í Teskeið.is.
- Skilgreina fallback ef store-hlekkur vantar eða feature flag er slökkt.

**Prófanir:**

- Umönnun birtist aðeins þegar feature flag er virkt.
- Þegar feature flag er slökkt birtist Umönnun ekki eða er óvirk samkvæmt
  ákvörðuðu mynstri.
- Smellur á Umönnun birtir skýringuna og hlekki á App Store, Play Store og
  `umonnun.is`.
- Engin viðkvæm Umönnun gögn eða secrets birtast í client payload, UI eða logs.
- Mobile 360-460 px sýnir texta og hlekki án overlap eða horizontal scroll.

#7
## Langlíf innskráning með app-líkri mobile-upplifun

**Staða:** Bíður

**Næsta handoff:** Bíður nýs handoff þegar auth/session pakkinn fer af stað.
Eldra samhengi er í
`ai-handoff/2026-06-09-2341-todo-030-005-007-017-v001-codex-mobile-home-identity-review-plan.md`.

**Vandamál:** Stuttur eða óvæntur session-timeout getur gert mobile-upplifun
Teskeiðar óþarflega veflega. Notandi sem hefur þegar skráð sig inn á eigin síma
ætti almennt ekki að þurfa að sækja nýjan tölvupóstkóða eftir app-switching,
lokun vafra eða eðlilega óvirkni.

**Markmið:** Innskráning haldist áreiðanlega virk líkt og í appi, sérstaklega á
persónulegum mobile-tækjum, án þess að veikja server-side session-staðfestingu
eða gera stolna session ótímabundna.

**Ósk og atriði til ákvörðunar:**

- Kortleggja núverandi Supabase access-token, refresh-token, cookie-líftíma og
  sjálfvirka session-endurnýjun áður en timeout-hegðun er breytt.
- Nota langlífa, endurnýjanlega session með öruggum refresh-token fremur en að
  gera eitt access-token mjög langlíft.
- Láta innskráningu lifa browserlokun, app-switching, skjálæsingu og eðlilega
  óvirkni þegar notandi er á eigin tæki.
- Ekki treysta eingöngu á user-agent til að ákveða hver fær langa session.
  Meta hvort sama app-líka hegðun eigi við á öllum persónulegum tækjum eða hvort
  bjóða eigi skýrt val á borð við „Haltu mér innskráðum“.
- Halda skýrri „Skrá út“ aðgerð sem afturkallar session á öruggan hátt.
- Ákveða raunhæfan hámarkslíftíma, til dæmis 30-90 daga, og hvort virk notkun
  endurnýi tímann.
- Endurstaðfesta auðkenni síðar fyrir sérstaklega viðkvæmar aðgerðir ef slíkar
  aðgerðir verða hluti af Teskeið.
- Meðhöndla útrunnið eða afturkallað refresh-token án redirect-loopa og varðveita
  ætlaða áfangasíðu eftir nýja innskráningu.
- Prófa Safari/iOS, Chrome/Android, standalone/PWA og venjulegan mobile browser,
  meðal annars browserlokun, tæki offline, token refresh og handvirka útskráningu.
- Bæta regression-prófum fyrir session refresh, expiry, revocation og logout.

**Öryggisviðmið:** Ekki slökkva á expiry alfarið. Langlíf innskráning skal byggja
á öruggri token-endurnýjun, `httpOnly`/secure cookie-hegðun Supabase þar sem það
á við og áframhaldandi server-side auth-vörnum.

#17
## Hugmyndir úr hugmyndabankanum á `/heim`

**Staða:** Bíður

**Næsta handoff:** Bíður nýs handoff þegar heimaskjár pakkinn (#17/#42/#41)
fer af stað. Eldra samhengi er í
`ai-handoff/2026-06-09-2341-todo-030-005-007-017-v001-codex-mobile-home-identity-review-plan.md`.

**Markmið:** Skipta núverandi disabled röðum merktum `Væntanlegt` á `/heim`
út fyrir mobile-first framsetningu sem sýnir raunverulegar hugmyndir úr
opinbera hugmyndabankanum og leyfir notanda að kjósa beint af heimaskjánum.

**Ósk:**

- Halda útgefnum og aðgengilegum Teskeiðum, eins og `Lánað og skilað`, sem
  skýrum aðgerðum á heimaskjánum.
- Fjarlægja harðkóðaða disabled listann yfir væntanlegar Teskeiðar.
- Sýna þar í staðinn sérstaka mobile-first framsetningu með hugmyndum sem hafa
  þegar verið birtar í hugmyndabankanum.
- Hvert atriði skal sýna heiti hugmyndar og nægilegt samhengi til að notandi
  skilji að um hugmynd úr bankanum sé að ræða, ekki virka Teskeið.
- Notandi skal geta kosið hugmynd beint úr þessari framsetningu án þess að þurfa
  fyrst að fara inn á hugmyndasíðuna.
- Kosningar úr `/heim` skulu nota sömu API-hegðun, tvöfaldra-atkvæða-vörn,
  talningu og valið/óvalið state og kosning á canonical hugmyndasíðu.
- Smellur á hugmynd fer á canonical hugmyndasíðuna, t.d.
  `/hugmyndir/[slug]`.

**Gagna- og öryggisreglur:**

- Nota sama canonical gagnagjafa og opinberi hugmyndabankinn.
- Sýna aðeins birtar hugmyndir sem almenningur má þegar sjá.
- Drög, falin atriði, admin-gögn og óútgefnar hugmyndir mega aldrei leka inn í
  heimaskjá-framsetninguna.
- Forðast tvítekna sérlausn eða harðkóðaðan hugmyndalista.
- Forðast sérlausn fyrir kosningu á `/heim`; endurnýta eða deila sömu
  kosningalógík og canonical hugmyndasíður.
- Skilgreina rólegt fallback ef engar birtar hugmyndir finnast eða gagnalestur
  mistekst.

**Mobile-first upplifun:**

- `Carousel` er aðeins tillaga/vinnuheiti. Við útfærslu skal meta hvort betri
  framsetning passi betur, t.d. lárétt kortaröð, stuttur „hugmynd dagsins“
  kubbur, staflaður listi eða blönduð lausn með einni aðalhugmynd og fleiri
  minni kortum.
- Nota snertivænt lárétt swipe/scroll-snap mynstur sem virkar vel á litlum
  skjám og með lyklaborði á desktop ef carousel/kortaröð verður valin.
- Ef önnur framsetning verður valin skal hún samt vera mobile-first, róleg,
  læsileg og ekki þyngja `/heim`.
- Tryggja skýran focus-stíl, aðgengilegt heiti og nægilega stór snertisvæði.
- Forðast sjálfvirkt carousel eða aðra framsetningu sem hreyfist án aðgerðar
  notanda.
- Virða `prefers-reduced-motion` og valda hvorki layout shift né láréttu
  page-overflow.
- Samræma útlit, bil, letur og litaval við `Design.md`.

**Prófanir:**

- Birt hugmynd birtist og tengist réttri `/hugmyndir/[slug]` slóð.
- Drög og falin hugmynd birtast ekki.
- Notandi getur kosið hugmynd beint af `/heim`.
- Atkvæðafjöldi og valið/óvalið state uppfærist rétt eftir kosningu af `/heim`.
- Tvöföld atkvæði eru áfram varin eins og á canonical hugmyndasíðu.
- Virk Teskeið helst aðgengileg og ruglast ekki saman við hugmyndir.
- Tómt eða bilað gagnasvar brýtur ekki `/heim`.
- Valin framsetning virkar við 360-460 px viewport, með snertingu og lyklaborði.

#42
## Tilbúnar Teskeiðar efst og síðast opnuð fyrst

**Staða:** Bíður

**Samhengi:** `/heim` þarf að hjálpa notanda að komast hratt aftur í þær
Teskeiðar sem eru raunverulega virkar, án þess að tilbúnar Teskeiðar týnist í
sama lista og væntanlegar Teskeiðar eða hugmyndir.

**Vandamál:** Tilbúnar Teskeiðar eru ekki nógu áberandi efst. Þegar virkar og
væntanlegar Teskeiðar birtast of mikið sem einn sameiginlegur listi getur
notandi þurft að lesa sig í gegnum óvirk eða væntanleg atriði áður en hann finnur
það sem hann getur notað strax.

**Ósk:** Gera tilbúnar/virkar Teskeiðar meira áberandi efst á `/heim` og aðskilja
þær skýrt frá væntanlegum Teskeiðum. Röðun virkra Teskeiða á að vera dýnamísk per
notanda þannig að sú Teskeið sem viðkomandi notandi opnaði síðast birtist efst.

**Við útfærslu:**

- Skilgreina skýrt muninn á virkum/tilbúnum Teskeiðum, væntanlegum Teskeiðum og
  hugmyndum úr hugmyndabankanum.
- Gera virkar Teskeiðar að fyrsta áberandi aðgerðasvæðinu á `/heim`.
- Ekki blanda virkum Teskeiðum og væntanlegum Teskeiðum saman í sama sjónræna
  lista ef það gerir virku Teskeiðarnar minna sýnilegar.
- Geyma eða reikna síðast opnuðu Teskeið per notanda á öruggan hátt. Ákveða þarf
  hvort það sé nóg að nota client-side state eða hvort server-side per-user state
  sé betra til að hegðunin fylgi notanda milli tækja.
- Ef server-side state er notað má það ekki leka milli notenda, veikja RLS eða
  opna nýjan almennan aðgang að notendagögnum.
- Skilgreina fallback-röðun fyrir nýjan notanda sem hefur aldrei opnað Teskeið.
- Samræma þetta við #17 svo hugmyndir/væntanlegt efni verði áfram sýnilegt án
  þess að taka athygli frá virkum Teskeiðum.
- Halda mobile-first upplifun rólegri, með stórum snertisvæðum og án horizontal
  overflow.

**Prófanir:**

- Virkar Teskeiðar birtast efst á `/heim` og eru greinilega aðskildar frá
  væntanlegum Teskeiðum.
- Þegar notandi opnar `Lánað og skilað` og fer aftur á `/heim`, birtist sú
  Teskeið efst meðal virkra Teskeiða.
- Nýr notandi án opnunarsögu fær stöðuga og skiljanlega sjálfgefna röðun.
- Röðun eins notanda hefur ekki áhrif á röðun annars notanda.
- Væntanlegar Teskeiðar og hugmyndir úr #17 birtast ekki sem jafngildar virkum
  Teskeiðum.
- Mobile 360-460 px sýnir virkar Teskeiðar efst án overlap eða horizontal scroll.

#10
## Gáfuleg opnun tölfræðisíðu út frá nýjustu heimsókn

**Staða:** Bíður

**Vandamál:** Núverandi val á upphafstímabili tölfræðisíðunnar má ekki reiða sig
á cookie, `localStorage` eða sambærilegt client-side gildi sem getur vantað,
verið úrelt eða verið ósamræmt milli tækja og vafra.

**Ósk:** Í hvert skipti sem tölfræðisíðan er opnuð skal skoða hvenær raunveruleg
nýjasta heimsókn notandans átti sér stað og velja tímabilið beint út frá því
hversu langt er liðið síðan þá.

**Tillaga að hegðun:**

- Geyma eða lesa síðustu staðfestu heimsókn úr áreiðanlegum server-side
  gagnagrunni.
- Við opnun skal fyrst lesa fyrri heimsókn, reikna liðinn tíma og velja rétt
  tölfræðitímabil.
- Skrá núverandi heimsókn aðeins eftir að fyrri heimsókn hefur verið lesin, svo
  nýja timestampið eyðileggi ekki útreikninginn.
- Skilgreina skýra fallback-hegðun fyrir fyrstu heimsókn og þegar gögn vantar
  eða lestur mistekst.
- Ekki láta client-side hydration eða seinni state-uppfærslu opna fyrst rangt
  tímabil og stökkva síðan yfir á rétt tímabil.
- Forðast race conditions ef sama síða er opnuð samtímis í fleiri en einum
  flipa eða tæki.
- Taka ákvörðun um hvort „heimsókn“ merkir opnun tölfræðisíðunnar, innskráningu
  í admin eða aðra staðfesta virkni.

**Prófanir:**

- Fyrsta heimsókn velur skilgreint sjálfgefið tímabil.
- Stutt frávera velur stutt tímabil.
- Lengri frávera velur samsvarandi lengra tímabil.
- Ógilt eða vantað heimsóknargildi veldur ekki röngu upphafsfilteri.
- Fyrsta render sýnir strax rétt tímabil án sýnilegs filter-stökks.
- Samtímaopnanir skemma ekki næsta útreikning.

#33
## Fjöldi innskráðra notenda í admin tölfræði

**Staða:** Bíður

**Vandamál:** Admin tölfræðin sýnir ekki enn heildarmynd af fjölda notenda sem
hafa skráð sig inn eða stofnað aðgang að Teskeið. Þetta væri gagnlegt sem einfalt
stöðumat eftir public beta opnun.

**Ósk:** Bæta við fjölda innskráðra notenda í admin tölfræðina.

**Við útfærslu:**

- Skilgreina nákvæmlega hvað talan þýðir áður en hún er birt:
  - heildarfjöldi stofnaðra auth-notenda,
  - fjöldi notenda með prófíl,
  - fjöldi notenda sem hafa skráð sig inn að minnsta kosti einu sinni,
  - eða fjöldi nýlega virkra notenda.
- Velja einföldustu öruggu skilgreininguna fyrir fyrstu útgáfu og merkja hana
  skýrt í admin UI.
- Sækja talninguna eingöngu server-side með admin/service-role heimildum sem eru
  þegar til í verkefninu.
- Ekki birta netföng, notendalista eða persónugreinanleg gögn í þessu atriði;
  aðeins talningu.
- Ekki veita `anon` eða venjulegum `authenticated` notendum nýjan beinan aðgang
  að `auth.users`, `profiles` eða öðrum notendatöflum.
- Passa að talningin brotni ekki ef auth-notandi vantar prófíl eða prófíll er
  til fyrir óvenjulegt legacy tilfelli.

**Prófanir:**

- Admin sér notendatalningu í tölfræðinni.
- Óinnskráður eða venjulegur notandi fær engan aðgang að talningunni.
- Talningin virkar þegar engir notendur, einn notandi eða margir notendur eru til.
- Engin netföng eða notendaupplýsingar leka í client payload, logs eða test output.

#69
## Virkni per Teskeið í admin sýn

**Staða:** Bíður

**Stofnað:** 2026-07-08

**Samhengi frá Stebba:** Stebbi vill geta séð virkni per Teskeið í admin
sýninni. Fyrsta útgáfa á að vera eins ítarleg og raunhæft er, án þess að fórna
öryggi eða persónuvernd. Í Veðrinu vill Stebbi sérstaklega mæla hversu oft nýjar
leiðir eru reiknaðar.

**Vandamál:** Núverandi admin tölfræði byggir aðallega á public
hugmyndabanka-analytics (`analytics_events`) og segir lítið um raunverulega
notkun innskráðra Teskeiða. Hún svarar ekki spurningum eins og:

- hvaða Teskeiðar eru notaðar mest,
- hversu margir notendur prófa hverja Teskeið,
- hvaða aðgerðir eru mest notaðar innan hverrar Teskeiðar,
- hvort Veðrið er að reikna margar leiðir,
- hvort notendur hætta eftir route-val eða fara alla leið í niðurstöðu.

**Ósk:** Bæta við admin-sýn sem sýnir notkun per Teskeið og helstu
aðgerðamælikvarða. Fyrsta útgáfa má byrja með server-side event-mælingum og
samantekt í admin stats, en hönnunin þarf að geta vaxið þegar fleiri Teskeiðar
verða virkar.

**Skilgreining v1:** Þetta er ekki notendamiðað tracking til markaðssetningar.
Þetta er internal product-health mæling fyrir Stebba/admin:

- aggregation fyrst,
- raw row-aðgangur helst ekki í UI,
- engin netföng, nöfn, staðsetningar eða nákvæmar leiðir í admin payload,
- engin veiking á RLS eða auth,
- engin client-side mæling sem venjulegur notandi getur misnotað til að spamma
  admin-tölfræði.

**V1 mæligrunnur sem þarf að hanna:**

- Ný server-side usage events tafla, t.d. `teskeid_usage_events` eða
  `app_usage_events`, frekar en að troða innskráðum app-events inn í núverandi
  public `analytics_events`.
- Dálkar þurfa líklega að styðja:
  - `feature_key` / Teskeið, t.d. `vedrid`, `minnid`, `tengsl`, `umonnun`
  - `event_name`, t.d. `weather_route_options_calculated`
  - `user_id` eða öruggt afleitt auðkenni fyrir unique-user talningu
  - `created_at`
  - `path` eða route group, án query params með viðkvæmum upplýsingum
  - `metadata jsonb` fyrir ósensitív counters og buckets
- Taflan á að vera RLS-enabled með engum public policies og aðeins service-role
  aðgangi, líkt og `analytics_events` / `feature_access`.
- Innskráðar API/server actions skrá usage event server-side með helper sem
  failar hljóðlega og má aldrei stoppa notendaflæði.
- Admin API skilar aggregated tölum, ekki raw persónugögnum.

**Veðrið / Ferðalagið mælingar í v1:**

Mikilvægasta fyrsta spurning Stebba er: hversu oft eru nýjar leiðir reiknaðar?
Þarf að skilgreina og mæla að minnsta kosti:

- `weather_route_options_requested`: route picker reynir að sækja leiðarmöguleika
  fyrir uppruna + áfangastað.
- `weather_route_options_calculated`: Google/provider skilar leiðarmöguleikum.
- `weather_route_options_failed`: leiðarmöguleikar nást ekki.
- `weather_final_forecast_requested`: notandi smellir `Nota þessa leið` /
  biður um veðurmat.
- `weather_final_forecast_completed`: veðurmat klárast.
- `weather_final_forecast_failed`: veðurmat nær ekki að klárast.
- `weather_saved_place_created_or_reused`: ef saved-place virkni er komin í
  production og migration hefur verið keyrð.

Til að mæla „nýjar leiðir“ án þess að birta staðsetningar:

- Ekki geyma staðanöfn, formatted address, placeId, lat/lon eða polyline í
  usage table.
- Búa til server-side HMAC/fingerprint af route pair ef þarf að telja distinct
  leiðapör, t.d. úr normaliseruðum uppruna/áfangastað og secret.
- Admin UI má sýna:
  - fjölda route-option útreikninga,
  - fjölda distinct route-pair fingerprints,
  - fjölda unique users sem reiknuðu leið,
  - hlutfall route picker -> final forecast,
  - provider failure rate,
  - fjölda valinna route options per final forecast,
  - curated route label counts, t.d. hversu oft Þrengslavegur-regla birtist eða
    var valin, án þess að geyma nákvæma leið.
- Metadata má geyma örugga hluti eins og `route_count`, `route_distance_bucket`,
  `duration_bucket`, `provider`, `used_place_id: true/false`, `selected_route_label`
  eða `curated_route_label`, ef það lekur ekki viðkvæmum staðsetningum.

**Aðrar Teskeiðar sem v1 ætti að styðja eða undirbúa:**

- `minnid` / Lánað og skilað:
  - hlutur stofnaður,
  - hlutur merktur skilaður,
  - skilun afturkölluð,
  - boð sent,
  - boð samþykkt/hafnað,
  - aðila bætt við,
  - hlutverki breytt,
  - spjallskilaboð skráð ef það er virkt.
- `tengsl`:
  - tengsl búin til,
  - tengsl uppfærð,
  - tengsl fjarlægð,
  - notkun tengsla í öðrum Teskeiðum síðar.
- `umonnun`:
  - aðeins undirbúa feature-key og tóma/disabled stöðu ef Umönnun er ekki komin
    sem virk vef-Teskeið ennþá.

**Admin UI v1:**

- Bæta við kafla í admin stats fyrir `Virkni per Teskeið` eða sambærilegt.
- Nota tímabilsfilterinn sem er nú þegar til í stats (`5min`, `1h`, `7d`,
  `30d`, `all`) ef hægt er.
- Sýna summary cards:
  - virkir notendur,
  - events samtals,
  - route calculations / leiðarútreikningar fyrir Veðrið,
  - final forecast completions,
  - conversion route -> result.
- Sýna breakdown per Teskeið:
  - `Veðrið`,
  - `Minnið`,
  - `Tengsl`,
  - `Umönnun` þegar við á.
- Sýna drilldown fyrir Veðrið:
  - route calculations over time,
  - success/failure,
  - route-count buckets,
  - distinct route-pair fingerprints count,
  - curated-route counts.
- UI má vera þétt og admin-legt, en þarf samt að fylgja `Design.md`: mobile
  first, enginn horizontal overflow, stuttir textar, skýr loading/error states.

**Öryggi, privacy og gögn:**

- Ekki geyma eða birta hrá netföng, nöfn, símanúmer, staðsetningar, placeId,
  formatted address, lat/lon, polyline, forecast payload eða route points í
  usage events.
- Ekki logga usage event metadata ef hún getur innihaldið persónugögn.
- Ekki gefa `anon` eða venjulegum `authenticated` notendum SELECT á usage töflu.
- Admin API þarf `requireAdmin` og service-role lestur, líkt og núverandi
  admin analytics.
- Ef `user_id` er geymt þarf að rökstyðja það og aðeins nota til aggregated
  unique-user talningar. Ekki birta user_id í client payload.
- Ef distinct route pair er mælt skal nota HMAC/fingerprint, ekki raw
  staðsetningar eða address.
- Migration þarf rollback/recovery plan og statísk SQL-próf.
- Ekki keyra migration nema Stebbi biðji sérstaklega um það.

**Manual pre-check áður en framkvæmd hefst:**

1. Opna admin stats og skrá hvað er til í dag.
2. Prófa Veðrið localhost: velja leið og smella `Nota þessa leið`.
3. Staðfesta að engin núverandi admin tala sýni route calculations eða
   Ferðalagið conversion.
4. Ákveða hvort fyrsta útgáfa á að mæla aðeins Veðrið eða líka byrja að skrá
   `Minnið` events strax. Ef óvissa er til staðar, byrja með Veðrið og
   extensible event schema.

**Localhost checks for Stebbi eftir breytingu:**

1. Opna `/admin` sem admin.
2. Opna stats flipann.
3. Vænt: nýr kafli fyrir `Virkni per Teskeið` birtist með tómri eða núllstöðu
   ef engin events eru til.
4. Opna `/auth-mvp/vedrid` sem notandi með veður-aðgang.
5. Velja uppruna og áfangastað þannig að route options séu reiknaðar.
6. Fara aftur í `/admin` og velja stutt tímabil, t.d. `5 mín`.
7. Vænt: `Veðrið` sýnir að route options voru reiknaðar.
8. Smella `Nota þessa leið` í Veðrinu og láta niðurstöðu klárast.
9. Vænt: admin sýnir final forecast request/completion og route -> result
   conversion hækkar.
10. Endurtaka sömu leið og síðan aðra leið.
11. Vænt: total route calculations hækkar í hvert skipti, distinct route-pair
    talning hækkar aðeins þegar leiðaparið er nýtt.
12. Prófa venjulegan notanda eða óinnskráðan notanda á admin API.
13. Vænt: enginn aðgangur að admin usage tölum.
14. Staðfesta í network/admin payload að engin netföng, nöfn, staðsetningar,
    placeId, lat/lon eða route polyline skili sér í client.

**Handoff:** Sjá
`ai-handoff/2026-07-08-1356-todo-069-v001-codex-admin-teskeid-usage-handoff.md`.

#22
## Hreinsa sýnilegar `/auth-mvp/` slóðir

**Staða:** Bíður

**Samhengi:** Public beta var opnuð hratt og meðvitað var ákveðið að geyma
sýnilegu `/auth-mvp/*` slóðirnar til að minnka útgáfuáhættu. Það er tæknilega
í lagi í bili, en sem public UX lítur `/auth-mvp/` út eins og innri MVP-slóð.

**Ósk:** Færa sýnilegar notendaslóðir yfir á styttri canonical slóðir:

- `/heim`
- `/stillingar/minn-profill`
- `/stillingar/tengsl`
- `/lanad-og-skilad`
- `/lanad-og-skilad/ny`
- aðrar undirsíður `Lánað og skilað` eftir sama mynstri

**Við útfærslu:**

- Halda gömlu `/auth-mvp/*` slóðunum sem server-side redirects á nýju slóðirnar
  svo eldri tenglar og bókamerki brotni ekki.
- Varðveita mikilvæg query params, sérstaklega claim/invitation samhengi.
- Forðast redirect-lykkjur í middleware.
- Uppfæra öll sýnileg links, redirects, forms og client `router.push`.
- Meðhöndla `/api/auth-mvp/*` sem sér tæknilega ákvörðun; API-heiti má vera
  óbreytt ef það minnkar áhættu.
- Bæta regression-prófum fyrir gömul aliases, ný canonical route, query params,
  óinnskráðan aðgang og innskráðan aðgang.

**Öryggisviðmið:** Þetta má ekki veikja `AUTH_MVP_ENABLED`, `LOANS_ENABLED`,
session guards, loan guards, RLS, service-role mörk eða claim/invitation flæði.

#13
## Endurskilgreina hlutverk whitelist/admin-lista

**Staða:** Bíður

**Samhengi:** Eftir public beta opnun 2026-06-08 stýrir
`auth_mvp_allowlist` ekki lengur almennri Teskeið-innskráningu eða aðgangi að
`Lánað og skilað`. Listinn getur samt mögulega nýst síðar sem beta-/feature-listi
fyrir nýjar Teskeiðar, en hlutverk hans þarf að ákveða áður en admin UI er byggt.

**Markmið:** Ákveða hvort whitelist/admin-listi eigi áfram að vera virkur
hluti af Teskeið, og ef já, í hvaða tilgangi.

**Ósk:**

- Meta hvort `auth_mvp_allowlist` eigi að verða beta-listi fyrir framtíðar
  Teskeiðar, admin-prófunarlisti eða hvort hann eigi að verða arkiveraður.
- Ef listinn á áfram að vera virkur, bæta afmörkuðu whitelist-yfirliti við
  núverandi admin-viðmót.
- Sýna netföng á listanum og viðeigandi lýsigögn sem þegar eru geymd, til dæmis
  athugasemd og skráningartíma.
- Leyfa admin að bæta við netfangi með skýrri staðfestingu.
- Leyfa admin að fjarlægja netfang með staðfestingarskrefi sem minnkar líkur á
  mistökum.
- Normalisera netföng á sama hátt og núverandi auth- og loan-flæði, meðal
  annars með `trim` og lágstöfum.
- Sýna skýr skilaboð fyrir tvítekið netfang, ógilt netfang og misheppnaða
  aðgerð.

**Öryggi og gagnavernd:**

- Allur lestur og allar breytingar skulu vera varðar server-side með núverandi
  admin-auth, ekki aðeins með földu client-viðmóti.
- Ekki veita `anon` eða `authenticated` beinan lesturs- eða skrifaðgang að
  `auth_mvp_allowlist`.
- Nota afmarkað admin API/server action og varðveita núverandi RLS og grants.
- Ekki skila whitelist-gögnum í logs, almenn API-svör eða client-cache sem
  óviðkomandi notandi getur lesið.
- Forðast að endurvekja whitelist sem ósýnilega hindrun fyrir public login eða
  public `Lánað og skilað`.

**Prófanir:**

- Óinnskráður og venjulegur innskráður notandi fá engan aðgang að listanum eða
  breytingaaðgerðum.
- Admin getur lesið lista, bætt við gildu netfangi og fjarlægt færslu.
- Tvítekið og ógilt netfang breytir ekki gögnum.
- Fjarlæging á netfangi hefur skilgreind áhrif á núverandi session og virkan
  Teskeið-aðgang.

#63
## Endurnefna „Lánað og skilað“ í „Minnið“

**Staða:** Bíður

**Stofnað:** 2026-06-28

**Forgangur:** Röð 5, eftir #59 og á undan #64/#27. Þetta er afmörkuð
product-/information-architecture breyting sem ætti að koma áður en við
endurskrifum meira af lánaboðsflæðinu og heimaskjánum.

**Samhengi frá Stebba:** Núverandi `Lánað og skilað` virðist vera fyrsta
birtingarmynd stærra sameiginlegs minnis: hlutir sem fólk þarf að muna saman
án þess að þeir týnist í SMS, Messenger, tölvupósti eða óljósu
`ég hélt að...` samhengi.

**Mat Codex:** Þetta ætti fyrst að vera yfirborðs- og orðalagsbreyting, ekki
gagnamódelsbreyting. Núverandi lánakerfi verður áfram virka flæðið, en er sett
fram sem fyrsta tegundin inni í `Minnið`. Þannig fáum við betra product-heiti
nú strax án þess að festa okkur of snemma í stærra `Minnið`-schema.

**Ósk:** Breyta sýnilegri framsetningu úr `Lánað og skilað` yfir í `Minnið`,
með `Lánað og skilað` sem fyrstu tegund/kafla innan Minniðs.

**Scope v1:**

- Heimakort, valmyndir og tilbúnar Teskeiðar mega sýna `Minnið`.
- Lánasíða má heita `Minnið`, með undirfyrirsögn, section eða tab fyrir
  `Lánað og skilað`.
- CTA má áfram vera lánsmiðuð þegar notandi er að skrá hlut í láni.
- Núverandi route má fyrst áfram vera `/auth-mvp/lanad-og-skilad`; canonical
  route rename bíður #22 eða sér plan.
- Ekki breyta `loan_items`, `loan_invitations`, RPC nöfnum, event source
  `loans` eða SQL í þessum áfanga.
- Ekki bæta `Minnispunktur` við sem nýrri gagnategund í þessum áfanga nema
  Stebbi biðji sérstaklega um það. Það þarf sér gagnamódel, aðgangsreglur og
  hönnun.

**Við útfærslu þarf að skoða:**

- `messages/is.json` og `messages/en.json` fyrir titla, heimakort, menu,
  source labels og CTA.
- Ready/idea cards, heimaskjá og Teskeiða-yfirlit.
- Loan list, detail, edit, claim og email texta: sumt á að verða `Minnið`,
  annað á áfram að vera nákvæm láns-aðgerð.
- `Ólesið` / recent event labels: ekki breyta atburðatitlum ef þeir lýsa
  raunverulegri lánaaðgerð, en source/feature-label getur orðið `Minnið`.
- Tengsl-síður sem sýna source `Lánað og skilað`; ákveða hvort þar eigi að
  standa `Minnið` eða `Lánað og skilað`.
- Athuga hvort núverandi hugmyndin `Minningar` rekist málfræðilega eða
  vörulega á `Minnið`.

**Hönnun og texti:**

- Lesa viðeigandi kafla í `Design.md` áður en UI er plönuð eða breytt.
- Mælt product copy:
  - `Minnið`
  - `Munum þetta saman`
  - `Minnið heldur utan um það sem annars gleymist, misskilst eða týnist í
    skilaboðum.`
- Forðast að kynna þetta sem bókhald, todo-app eða samningskerfi.
- Halda tóninum léttum, mannlegum og Teskeiðarlegum.

**Öryggi og gögn:**

- Þetta á að vera texta-/IA-breyting fyrst, ekki heimildar- eða gagnabreyting.
- Ekki breyta RLS, grants, SQL eða auth guard án sér rýni.
- Ekki búa til nýja `Minnið` route sem bypassar núverandi loan guards.
- Ef route rename verður tekið síðar þarf redirect-, auth- og deep-link plan.

**Prófanir:**

- Heimaskjár sýnir `Minnið` án þess að missa pending badge, talningar eða
  virkni núverandi loan-korts.
- Opnun úr heimaskjá fer áfram í virkt lánaflæði.
- Lánalisti/detail/edit/claim eru skiljanleg: notandi sér að hann er í
  `Minnið`, en aðgerðirnar snúast um lánaðan hlut.
- Hamburger/menu/ready card/idea card sýna samræmdan texta.
- `Ólesið` links og event labels virka áfram.
- Email claim link og subject verða ekki ruglingsleg.
- Mobile 360-460 px: enginn texti overflowar, veldur óvæntu zoomi eða layout
  shift.

#64
## Fallegra hlutverkaval í edit-viðmóti

**Staða:** Bíður

**Stofnað:** 2026-06-28

**Forgangur:** Röð 6, eftir #63 og á undan #27. Þetta er afmarkað UI-polish á
núverandi #62 hlutverkaskiptaflæði, ekki nýtt gagnamódel eða SQL-vinna.

**Samhengi frá Stebba:** Núverandi viðmót fyrir að leiðrétta hvort notandi
`Ég lánaði` eða `Ég fékk lánað` er of ljótt og of mikið eins og stór command
takkinn `Leiðrétta í...`. Textinn endurtekur líka hlutverkið á óþægilegan hátt.

**Ósk:** Setja tvær pillur efst á breytingaspjaldinu, fyrir ofan
`Hvað var lánað?`: `Ég lánaði` og `Ég fékk lánað`. Notandi smellir einfaldlega á
hitt hlutverkið ef hann þarf að leiðrétta.

**Scope v1:**

- Skipta núverandi `Leiðrétta í: ...` framsetningu út fyrir segmented
  pill-control efst í edit-forminu.
- Sýna núverandi hlutverk sem active/selected pill.
- Sýna hitt hlutverkið sem skýra, clickable leiðréttingu.
- Nota núverandi server action/RPC contract fyrir hlutverkaskipti; ekki breyta
  SQL eða business logic í þessu atriði.
- Halda pending/open invitation skýringu stuttri og rólegri ef hún á við.
- Halda textum í `messages/is.json` og `messages/en.json`, ekki hardcode-a.
- Lesa viðeigandi kafla í `Design.md` áður en UI er útfært.

**Hönnun:**

- Þetta á að líta út eins og role selector, ekki eins og stór save-/danger-action.
- Active pill má vera mild græn eða filled samkvæmt Teskeið-stíl.
- Inactive pill má vera hvít/border og greinilega smellanleg.
- Disabled/pending state þarf að vera sýnilegt þegar action er að keyra.
- Mobile 360-460 px: pillurnar þurfa að passa án horizontal overflow, óvænts
  zooms eða layout shift.

**Prófanir:**

- Actual party á edit-síðu sér tvær pillur ofan við `Hvað var lánað?`.
- Núverandi hlutverk er selected og hitt hlutverkið er hægt að velja.
- Smellur á hitt hlutverkið breytir hlutverki með núverandi server action.
- Virkt hlutverk helst rétt eftir refresh.
- Pending invitation tilfelli og samþykktur/skilaður hlutur virka áfram.
- Villumeldingar og pending-state eru skýr en ekki yfirþyrmandi.

#66
## Flytja lánaðan hlut á annan aðila

**Staða:** Bíður

**Stofnað:** 2026-07-01

**Forgangur:** Röð 7, eftir #64 og á undan #27. Þetta er næsta praktíska
aðila-edit þörf í `Minnið`/lánaflæðinu: ekki bara skipta um hvort Stebbi er
lánveitandi eða lántakandi, heldur breyta hver hinn aðilinn er þegar raunheimur
breytist eftir að boð hefur verið samþykkt.

**Samhengi frá Stebba:** Stebbi vill geta breytt hver er með í láni / fékk
lánað. Í dæminu sem Stebbi sendi er `stefanhalldor@gmail.com` búinn að smella á
`Þekki málið`, en hluturinn endaði svo hjá öðrum aðila. Stebbi vill geta flutt
hlutinn á þann aðila í staðinn fyrir að loka núverandi láni og stofna nýtt.

**Skjámynd:** Stebbi límdi skjámynd í samtalið af detail-spjaldi fyrir `Sög og
borvél frá Palla`, þar sem mótaðili er `Stefán Halldór Jónsson` og aðalaction er
`Merkja sem skilað`.

**Vandamál:** Núverandi flæði virðist gera ráð fyrir að staðfestur mótaðili sé
orðinn réttur eftir `Þekki málið`. Ef hluturinn endar hjá öðrum þarf notandi að
loka/skila eldri skráningu og stofna nýja, sem tapar samhengi, sögu og getur
gert `Minnið` óþarflega bókhaldslegt.

**Ósk:** Bæta við öruggri leið fyrir réttan aðila til að skipta út mótaðila á
virku láni, svo hluturinn haldi áfram sem sama minnisfærsla með réttri sögu.

**Við útfærslu þarf að skilgreina:**

- Hver má flytja hlut á annan aðila: creator, núverandi lender/borrower, eða
  aðeins sá sem skráði hlutinn upphaflega.
- Hvort nýr aðili þarf að samþykkja með `Þekki málið`, eða hvort eigandi má
  færa beint yfir á þekkt tengsl/netfang.
- Hvað gerist við gamla staðfesta aðilann:
  - missir hann strax aðgang að láninu,
  - heldur hann lesaðgangi að sögu,
  - eða birtist honum event um að hann sé ekki lengur aðili.
- Hvernig þetta tengist `loan_invitations`, accepted invitation state,
  `loan_items.lender_user_id` / `borrower_user_id` og event-sögu.
- Hvort flæðið á að endurnýta núverandi invitation/claim mechanism eða þurfi
  sér RPC/server action fyrir transfer.
- Hvernig UI á að vera á detail/edit-síðu: líklega `Breyta aðila` eða
  `Flytja á annan` frekar en að blanda þessu saman við `Ég lánaði` /
  `Ég fékk lánað`.
- Lesa viðeigandi kafla í `Design.md` áður en UI er plannað eða breytt.

**Öryggi og gögn:**

- Ekki veikja RLS, grants, loan guards eða service-role mörk.
- Óviðkomandi notandi má ekki geta tekið yfir lán með því að giska á UUID eða
  slá inn eigið netfang.
- Ekki skila netföngum eða gömlum/nýjum aðilagögnum til client nema
  innskráður notandi hafi raunverulegan aðgang.
- Ef gamall aðili missir aðgang þarf að passa að cached/recent/detail leiðir
  leki ekki áfram upplýsingum.
- Transfer þarf að vera idempotent eða hafa skýra vörn gegn tvísmelli og
  samhliða breytingum.
- Ef SQL/RPC migration þarf, skal gera sérstakt plan með rollback/recovery og
  RLS/auth-rýni áður en hún er skrifuð eða keyrð.

**Prófanir:**

- Notandi getur opnað virkt samþykkt lán og valið að flytja hlutinn á annan
  aðila.
- Nýr aðili fær skilgreint boð/staðfestingarflæði og sér hlutinn aðeins þegar
  reglurnar leyfa.
- Gamall aðili missir eða heldur aðgangi nákvæmlega samkvæmt product-ákvörðun.
- Saga hlutarins sýnir skýran event um að aðili hafi breyst, þegar #61/event
  grunnurinn styður það.
- Detail, listi, `Nýlegt`, unread/read-state og email notification ruglast ekki
  milli gamla og nýja aðilans.
- Óviðkomandi authenticated notandi getur hvorki séð né yfirtekið lán.
- Mobile 360-460 px: aðila-edit UI veldur ekki horizontal overflow,
  óæskilegu zoomi, keyboard/focus vandamálum eða overlapi.

#27
## Mýkra lánaboðsflæði

**Staða:** Bíður eftir áframhaldandi event-, heimilda- og lánaboðavinnu í
#38/#39/#59/#61, Minnið-orðalagi í #63, skýrri role-switch upplifun í #64 og
aðila-transfer ákvörðun í #66 áður en full útfærsla hefst

**Samhengi:** Núverandi lánaboð virka sem sérstakt samþykkisflæði. Viðtakandi
sér pending boð í sérstöku spjaldi og þarf að fara á claim-síðu áður en hluturinn
verður hluti af venjulega lánalistanum.

**Ósk:** Einfalda flæðið þannig að hlutur sem er boðinn til notanda birtist strax
í `Lánað og skilað` og í `Nýlegt`. Viðtakandi á síðan að geta valið:

- `Þekki málið` — ígildi núverandi samþykkja/claim.
- `Kannast ekki við þetta` — ígildi núverandi hafna/decline.

**Markmið:** Flæðið á að vera minna íþyngjandi en formlegt samþykki. Hluturinn
á að líta út fyrir að hann tilheyri notandanum strax, en viðtakandi hefur samt
skýra leið til að staðfesta eða hafna.

**Við útfærslu:**

- Byrja með Phase 0 technical plan frá Claude Code og senda það til Codex-rýni
  áður en implementation hefst.
- Ekki merkja invitation sem `accepted` við stofnun eða sendingu.
- Ekki setja `loan_items.lender_user_id` eða `loan_items.borrower_user_id` fyrir
  viðtakanda fyrr en viðtakandi velur `Þekki málið`.
- Láta pending invitation-derived rows birtast í venjulega lánalistanum fyrir
  authenticated notanda þegar `auth.users.email` passar við
  `loan_invitations.recipient_email_normalized`.
- Halda `claim_loan_invitation` sem authoritative transition fyrir `Þekki málið`
  og `decline_invitation` fyrir `Kannast ekki við þetta`, nema Claude Code sýni
  betri og öruggari leið í Phase 0.
- Láta pending row birtast í `Nýlegt` og gera `Nýlegt` clickable, helst inn á
  lánalistann með highlight/scroll á rétt spjald frekar en beint á claim-gate.
- Byggja á #19 `recent_events` grunninum; cookie-only read-state hefur ekki reynst
  nógu áreiðanlegt fyrir flæði þar sem `Nýlegt` verður mikilvæg inngangsleið.
- Halda email sem notification, ekki sem gating-mekanisma.
- Halda `loan_invitations.item_name_snapshot` óbreyttu fyrir email idempotency;
  app-birting getur notað live `loan_items.item_name`.

**Öryggi og gögn:**

- Ekki veikja RLS, grants eða service-role mörk.
- Ekki veita `anon` eða `authenticated` beinan aðgang að `loan_items` eða
  `loan_invitations`.
- Ekki skila recipient email í client payload eða logs.
- Óviðkomandi authenticated notandi má hvorki sjá né framkvæma aðgerðir á pending
  boði sem er ekki tengt hans eigin netfangi.
- Expired, cancelled, declined og accepted invitation states þurfa skýra hegðun.
- Rollback/recovery plan þarf að fylgja SQL migration ef hún verður nauðsynleg.

**Handoff:** Sjá
`ai-handoff/2026-06-09-1630-todo-027-v001-codex-loan-soft-ack-package-plan.md`.

**Næsta tengda skref:** #37, #56 og #58 eru komin í DONE og byggja á #19
server-side event-feed grunninum. #27 á áfram að byggja á þeim grunni þegar
#38/#39/#59/#61 hafa verið þrengd eða kláruð og #63 hefur skýrt
product-orðalagið.

#59
## Deilanlegur hlekkur á lánadetail

**Staða:** Bíður

**Stofnað:** 2026-06-27

**Samhengi frá Stebba:** Nú er hver hlutur með detail-síðu. Stebbi vill að
notendur geti sent hlekk á hlutinn, til dæmis í Messenger, og að hlekkurinn sé
opnanlegur eingöngu hjá þeim sem hafa aðgang að hlutnum í Teskeið.

**Mat Codex:** Þetta er framkvæmanlegt og getur verið öruggt ef hlekkurinn er
ekki public share-link heldur venjuleg innskráð detail-slóð sem fer alltaf í
gegnum sama access guard og detail-síðan. Núverandi detail-síða notar
`get_my_loans` og `notFound()` ef hluturinn er ekki í aðgangsmengi innskráða
notandans; það er góður grunnur.

**Ósk:** Bæta við skýrri leið til að afrita eða deila detail-hlekk á lánaðan
hlut. Hlekkurinn má aðeins opnast hjá innskráðum notanda sem hefur aðgang að
hlutnum sem aðili að láninu eða með gildum pending invitation-reglum sem
kerfið samþykkir.

**Við útfærslu:**

- Nota canonical detail-slóð, t.d. `/auth-mvp/lanad-og-skilad/[id]` fyrst, eða
  nýja canonical slóð þegar #22 hreinsar `/auth-mvp/` úr sýnilegum URL-um.
- Bæta við copy/share action á detail-síðu eða loan-card detail context, með
  mobile-friendly UI.
- Nota Web Share API þar sem það er tiltækt, með copy-to-clipboard fallback.
- Hlekkurinn skal ekki innihalda netfang, token, display name eða önnur
  persónugögn í query string.
- Ef notandi sem fær hlekkinn er ekki innskráður, fer hann í innskráningu og
  kemur síðan aftur á ætlaða slóð ef auth-flæðið styður það.
- Ef innskráður notandi hefur ekki aðgang, skal hann fá `notFound` eða öruggt
  almennt aðgangssvar, ekki upplýsingar um að hluturinn sé til.
- Ekki búa til public share token eða “anyone with link” hegðun án sér
  security-plan og samþykkis frá Stebba.

**Öryggi og gögn:**

- Hlekkur er ekki heimild. Aðgangur kemur alltaf frá server-side auth og
  þátttöku í láninu.
- UUID í slóð má ekki duga eitt og sér til að sjá gögn.
- Hlekkurinn má ekki leka recipient email eða pending invitation details til
  óviðkomandi.
- Ef pending invitation hlekkir eru studdir þarf að nota canonical email
  matching/reglur sem þegar eru til, ekki veikari query-param lausn.

**Prófanir:**

- Aðili að láni getur afritað/deilt hlekk og opnað hann í sama eða öðru tæki.
- Mótaðili með aðgang getur opnað sama hlekk eftir innskráningu.
- Óviðkomandi innskráður notandi sér ekki hlutinn með sama hlekk.
- Óinnskráður notandi er sendur í innskráningu og kemst aðeins áfram ef hann
  hefur aðgang eftir innskráningu.
- Hlekkurinn inniheldur engin netföng, tokens eða persónugögn.
- Mobile share/copy UI virkar við 360-460 px án zooms eða overlap.

#57
## Timestamp format í ensku locale

**Staða:** Bíður (tech debt, lágt forgangsstig)

**Stofnað:** 2026-06-24

**Samhengi:** Komið upp sem follow-up við #37. `formatEventTimestamp` í `app/auth-mvp/heim/page.tsx` setur saman timestamp-streng með íslenskri orðröð og `kl.` sem er utan þýðingaskrár.

**Vandamál:** Í ensku locale mun timestamp líta skrítið út, t.d. `Tuesday 9. June kl. 20:00`. `kl.` er harðkóðað utan `messages/is.json` og `messages/en.json`.

**Athugið:** Þetta hefur engin áhrif í dag þar sem íslenska er eina supported locale í notkun.

**Ósk:** Setja timestamp-template í `messages/is.json` og `messages/en.json` þannig að orðröð og `kl.`-jafngildi séu locale-specific, eða nota `Intl.DateTimeFormat` með `timeZone: 'Atlantic/Reykjavik'`.

**Tillögur:**

- is: `{weekday} {day}. {month} kl. {time}`
- en: `{weekday}, {month} {day} at {time}`

**Prófanir:**

- Íslenska timestamp lítur eins út og áður: `Miðvikudaginn 24. júní kl. 7:40`.
- Enska timestamp fylgir enskri orðröð og orðalagi.
- Engin regression á öðrum event labels.

---

**#67 — Vistaðir / nýlegir staðir í Ferðalagið (Phase D): kóðinn er tilbúinn, migration bíður**

Kóðinn er shipped í commit `2b33c79`:

- `sql/69_weather_saved_places.sql` — migration tilbúin, ekki keyrð
- `app/api/teskeid/weather/saved-places/` — GET / POST / DELETE API routes
- `components/weather/PlaceSearch.tsx` — sýnir nýlega staði þegar input er tómt
- `app/auth-mvp/vedrid/FerdalagidClient.tsx` — sækir, vistar og eyðir staðum

Eiginleikinn er **ekki fullgiltur fyrr en** `sql/69_weather_saved_places.sql` hefur verið keyrt á Supabase:

```sql
-- Keyrðu þetta í Supabase SQL editor eftir yfirlestur
-- Rollback: DROP TABLE IF EXISTS public.weather_saved_places;
\i sql/69_weather_saved_places.sql
```

Hvað migration-in gerir: stofnar `public.weather_saved_places`, kveikir RLS, setur `user_id = auth.uid()` á öllum policies, grant aðeins til `authenticated` og `service_role`.

Eftir migration: prófa með tveimur aðskildum notendum til að staðfesta að saved places séu einangraðar á milli notenda (sjá localhost-checks í v159 handoff).

---

#67
## Veður: óæskilegur keyrslutími dags

**Staða:** Í vinnslu

**Stofnað:** 2026-07-06

**Samhengi frá Stebba:** Í Ferðalagið-flæðinu þarf notandi að geta sagt til um
hvaða tíma dags hann vill alls ekki vera að keyra, til dæmis að nóttu til.

**Vandamál:** Nú getur ferðaveðurmatið lagt til tíma út frá veðri, leið og
spágögnum, en það veit ekki endilega hvort notandinn vill forðast ákveðna
tíma dags. Ef besta veðurglugginn er til dæmis um miðja nótt getur niðurstaðan
verið tæknilega rétt en ópraktísk eða óþægileg fyrir notandann.

**Ósk:** Bæta við einfaldri stillingu í Ferðalagið-flæðinu þar sem notandi getur
merkt hvaða tíma dags hann vill ekki keyra. Fyrsta útgáfa má byrja á einföldum
valkosti eins og `Ég vil ekki keyra að nóttu til`, en hönnunin þarf að geta
stækkað í nákvæmara tímabil síðar, t.d. `forðast keyrslu frá 23:00 til 07:00`.

**Við útfærslu:**

- Lesa `Design.md` áður en UI er plannað eða breytt.
- Halda þessu sem user preference fyrir þessa ferð fyrst, ekki global
  stillingu, nema Stebbi ákveði annað sérstaklega.
- Láta stillinguna hafa áhrif á tillögur að brottför, heimferð og
  `nextCaution`/gluggaútreikninga þar sem það á við.
- Ekki blanda þessu saman við veðurhættu. Þetta er notendaval eða þægindaregla,
  ekki merki um að veðrið sé slæmt.
- Ef kerfið finnur aðeins góðan veðurglugga innan óæskilegs keyrslutíma skal
  segja það skýrt, t.d. að veðrið sé best þá en tíminn sé utan óska notandans.
- Ef enginn góður gluggi finnst innan leyfðs keyrslutíma skal útskýra muninn á
  `veðurslega best` og `innan tímans sem þú vilt keyra`.
- Gæta að mobile upplifun: controls mega ekki valda zoomi, horizontal overflowi
  eða rugla focus/keyboard state.

**Prófanir:**

- Notandi getur valið að forðast næturkeyrslu í Ferðalagið-flæðinu.
- Tillögur að brottför velja ekki óæskilegan tíma ef annar ásættanlegur gluggi
  er til.
- Ef veðurgluggi utan óska er augljóslega bestur, segir UI það á mannamáli án
  þess að rugla því saman við hættumat.
- Ef enginn góður gluggi er innan leyfðs tíma, fær notandi skýra niðurstöðu og
  sér hvað veldur.
- Existing route/weather result virkar áfram ef notandi velur enga
  tímastillingu.
- Mobile 360-460 px sýnir valkostinn án overlap, óæskilegs zooms eða
  horizontal scrolls.

#70
## Veður: leiðartími og route-provider samanburður

**Staða:** Í vinnslu, ekki útgáfublokker fyrir núverandi Ferðaveður-prerelease

**Stofnað:** 2026-07-08

**Samhengi frá Stebba:** Við fengum loksins sérstaka Þrengslavegur-leið í
Ferðalagið fyrir Garðabær -> Þorlákshöfn, en tíminn er enn furðulega nálægt
sjálfgefnu Route 427 leiðinni. Stebbi vill geyma málið og taka annan snúning
síðar, meðal annars með Mapbox-samanburði, í stað þess að festa útgáfuna á
þessu núna.

**Staðfest localhost-staða 2026-07-08 eftir v210:**

- Google Maps skjámynd Stebba sýndi Þrengslavegur um 45 mín / 55 km og Route
  427 um 59 mín / 67,2 km.
- Teskeið sýndi eftir v210:
  - `Um Þrengslaveg` um 55 mín / 56 km.
  - `Sjálfgefin Google-leið` um 56 mín / 67 km.
- Terminal diagnostics:
  - `curatedAdded: true`
  - `CURATED_VIA_THRENGSLAVEGUR`
  - Þrengslavegur: `distanceMeters: 56394`, `durationS: 3352`
  - Route 427: `distanceMeters: 67435`, `durationS: 3363`
  - `durationNote`: `durationS uses staticDuration when available, falls back to traffic-aware duration`

**Vandamál:** Leiðarvalið er orðið betra en ETA-munurinn er ekki trúverðugur
miðað við Google Maps. Þetta getur gert notanda erfiðara að skilja af hverju
kerfið mælir með styttri leiðinni, og getur haft áhrif á áætlaðan komu- og
spápunktatíma í Ferðaveðrinu.

**Ósk:** Taka sér annað, afmarkað rannsóknar- og útfærsluspor síðar þar sem
við berum saman Google Routes og Mapbox fyrir íslenskar leiðir, sérstaklega
leiðir þar sem Google Routes skilar fáum eða undarlegum valkostum.

**Scope næsta snúnings:**

- Skoða Mapbox Directions/route alternatives sem samanburð fyrir
  Garðabær -> Þorlákshöfn.
- Bera saman að minnsta kosti:
  - Google Routes `TRAFFIC_AWARE` með `duration` og `staticDuration`.
  - Google Routes `TRAFFIC_UNAWARE`.
  - Mapbox duration, distance, geometry og route alternatives.
- Prófa fleiri íslenskar leiðir en Þorlákshöfn svo við sérsníðum ekki lausnina
  of þröngt:
  - Garðabær -> Þorlákshöfn.
  - Reykjavík/Garðabær -> Selfoss.
  - Reykjavík/Garðabær -> Akureyri.
  - Keflavík -> Þorlákshöfn.
  - Ein eða tvær leiðir á Austur-/Norðurlandi þar sem val milli vega skiptir máli.
- Skilgreina hvort Mapbox á að vera:
  - diagnostic-only samanburður,
  - fallback þegar Google vantar góða valkosti,
  - eða nýr aðal route provider síðar.
- Meta API kostnað, ToS, attribution, caching reglur, privacy og hvort Mapbox
  má geyma eða birta sömu gögn og Google í okkar flæði.
- Halda áfram að forðast geymslu nákvæmra staðsetninga í analytics/admin nema
  það sé sérstaklega hannað með privacy-preserving hash/bucket nálgun.

**Ekki gera í þessu atriði án sér samþykkis:**

- Ekki skipta route provider í production án sér handoff/rýni.
- Ekki bæta Mapbox lykli í repo eða logs.
- Ekki geyma nákvæmar route geometries eða uppruna/áfangastaði í gagnagrunni
  nema með sér privacy- og RLS-plani.
- Ekki gera þetta að blocker fyrir fyrstu Ferðaveður-útgáfu ef núverandi
  hegðun er annars nothæf.

**Manual pre-check áður en næsti snúningur hefst:**

1. Opna Google Maps og prófa Garðabær -> Þorlákshöfn með sömu staðavali og
   Teskeið notar.
2. Skrá route labels, km og mínútur fyrir Þrengslavegur og Route 427.
3. Opna `/auth-mvp/vedrid` á localhost.
4. Velja sömu uppruna/áfangastaði í Ferðalagið.
5. Vista terminal diagnostics fyrir `getRouteOptions`.
6. Staðfesta hvort valið kom úr saved place eða Google autocomplete, því saved
   places geta enn vantað `placeId`.

**Localhost checks for Stebbi eftir framtíðarbreytingu:**

1. Prófa Garðabær -> Þorlákshöfn.
2. Vænt: Þrengslavegur birtist sem sér leið, með fjarlægð nálægt 55-56 km og
   tíma sem er trúverðugur miðað við samanburðarprovider.
3. Vænt: Route 427 birtist áfram sem sér leið nálægt 67 km.
4. Smella `Nota þessa leið` á Þrengslavegur.
5. Vænt: Ferðaveður-niðurstaða notar valda leið, route map helst rétt og
   áætlaðir spápunktatímar passa nýja leiðartímann.
6. Prófa Garðabær -> Selfoss og Keflavík -> Þorlákshöfn.
7. Vænt: engin fölsk Þrengslavegur-leið birtist þar sem hún á ekki við.
8. Prófa minnst eina langleið, t.d. Garðabær -> Akureyri.
9. Vænt: leiðir, veðurspápunktar og final submit virka áfram án þess að
   provider-samanburður brjóti núverandi flæði.

**Tengd handoff:**

- `ai-handoff/2026-07-08-1416-todo-067-v209-codex-v208-duration-gap-addendum.md`
- `ai-handoff/2026-07-08-1425-todo-067-v210-claude-v209-static-duration.md`

#71
## Veður: allir spápunktar og fjarlægð frá vegi

**Staða:** Í vinnslu

**Stofnað:** 2026-07-08

**Samhengi frá Stebba:** Í `Mest krefjandi á leiðinni` spjaldinu vantar aftur
vegalengd met.no spápunkts frá veginum. Stebbi vill líka að sömu ítarlegu
upplýsingar séu notaðar á öllum detail-spjöldunum undir `Hvernig er þetta
metið?`, sem nú vantar helling af upplýsingum. Kaflinn á að verða meira
áberandi og heita `Allir spápunktarnir á leiðinni`.

**Núverandi dæmi sem þarf að bæta:**

```text
Mest krefjandi á leiðinni
Punktur 26/58
Brottfarartími: kl. 14:27
Áætlaður tími 17 km frá Garðabæ: kl. 14:43
Veðurspá á þessum stað kl. 15:00
Vindur: 4 m/s · Úrkoma: 0,2 mm/klst · Hiti: 11°C
```

**Ósk:** Setja línuna um fjarlægð spápunkts frá veginum inn á milli áætlaðs
tíma og veðurspártíma:

```text
Mest krefjandi á leiðinni
Punktur 26/58
Brottfarartími: kl. 14:27
Áætlaður tími 17 km frá Garðabæ: kl. 14:43
Spápunktur um X m frá veginum.
Veðurspá á þessum stað kl. 15:00
Vindur: 4 m/s · Úrkoma: 0,2 mm/klst · Hiti: 11°C
```

Hlekkirnir í spjaldinu eiga að vera óbreyttir.

**Nánari óskir:**

- Nota sömu framsetningu á `Mest krefjandi á leiðinni` spjaldinu og á öllum
  detail-spjöldunum undir spápunktalistanum.
- Spjaldaheitin í listanum mega halda sér óbreytt sem `Punktur x/y`.
- Endurnefna `Hvernig er þetta metið?` í `Allir spápunktarnir á leiðinni`.
- Gera þann kafla meira áberandi en núverandi litla link/skúffu-framsetningu.
- Taka textann úr skúffunni:
  `Veðurmatið er reiknað úr leiðinni, tímasetningu og veðurspá á punktum meðfram leiðinni. Gervigreind tekur ekki ákvörðunina sjálf. Hún má hjálpa okkur að orða niðurstöðuna, en vindur, hviður, úrkoma, tími og staðsetning ráða matinu.`
- Setja þann texta í stað stutta textans sem stendur nú fyrir ofan skúffuna:
  `Reiknað úr veðurspá og leið, ekki giskað af gervigreind.`
- Halda hlekkjum óbreyttum: `Skoða veðurspá`, `Opna á korti`, `Hrá met.no gögn`.

**Við útfærslu:**

- Lesa `Design.md` áður en UI er breytt.
- Setja allan notendatexta í `messages/is.json` og `messages/en.json`.
- Finna sameiginlega leið til að rendera punktaupplýsingar, svo
  `Mest krefjandi` spjaldið og `Punktur x/y` spjöldin verði ekki ósamræmd.
- Skoða sérstaklega `components/weather/TravelAuditMap.tsx`,
  `components/weather/DepartureHeatmap.tsx`,
  `app/auth-mvp/vedrid/FerdalagidClient.tsx` og viðeigandi
  `messages/*`.
- Passa að fjarlægð spápunkts frá veginum birtist þar sem gögn eru til, líka
  þegar spápunkturinn er nálægt veginum og ekki sérstakur marker á kortinu.
- Passa að röðin sé:
  1. Spjaldtitill eða `Punktur x/y`,
  2. brottfarartími,
  3. áætlaður tími og km frá upphafsstað,
  4. spápunktur X m frá veginum,
  5. veðurspá á þessum stað kl. HH:MM,
  6. vindur / hviður ef við á / úrkoma / hiti,
  7. hlekkir óbreyttir.
- Gæta að mobile 360-460 px: texti má ekki valda horizontal overflowi,
  óþarfa card-in-card tilfinningu eða of löngum óskannanlegum blokkum.

**Uppfært 2026-07-08 eftir localhost-prófun:** Eftir v014/v016 er active
slot-hegðunin betri, en detail veðurgildin detta enn út þegar notandi velur
slot. Í `Allir spápunktarnir á leiðinni` sjást þá `Punktur x/y`, staða,
fjarlægð frá uppruna, áætlaður tími og fjarlægð spápunkts frá vegi, en vantar
`Veðurspá á þessum stað kl. HH:MM` og línuna með `Vindur · Úrkoma · Hiti`,
þó gögnin séu til.

Sama localhost-prófun sýnir líka að `Mest krefjandi á leiðinni` spjaldið á
kortinu sýnir aðeins decisive metric, t.d. `Vindur: 10 m/s`, en vantar úrkomu
og hitastig. Gögnin eru augljóslega til í sama valda brottfarartíma því efsta
brottfararspjaldið sýnir `Vindur: 10 m/s · Úrkoma: 0 mm/klst · Hiti: 10,3°C`.

**Ný afmörkuð krafa áður en #71 telst tilbúið:** Þegar active slot er valið
skulu bæði `Mest krefjandi á leiðinni` og samsvarandi `Punktur x/y`
detail-spjöld nýta active-candidate-safe gögnin úr `displayPoint` eða
sambærilegum réttum slot-gögnum, ekki bara `highlightedIssue.value`.
`summaryForWindow` má ekki leka inn fyrir rangan brottfarartíma, en það má ekki
leysa það með því að fela veðurgildin þegar rétt active-slot gögn eru til.

**Manual pre-check áður en framkvæmd hefst:**

1. Opna `/auth-mvp/vedrid` á localhost.
2. Reikna leið sem sýnir `Mest krefjandi á leiðinni`.
3. Staðfesta hvort línan um fjarlægð spápunkts frá veginum vantar þar.
4. Opna `Hvernig er þetta metið?`.
5. Staðfesta hvaða upplýsingar vantar í `Punktur x/y` spjöldunum miðað við
   `Mest krefjandi` spjaldið.

**Localhost checks for Stebbi eftir breytingu:**

1. Opna `/auth-mvp/vedrid`.
2. Reikna leið sem sýnir `Mest krefjandi á leiðinni`.
3. Vænt: spjaldið sýnir `Spápunktur um X m frá veginum.` á milli áætlaðs tíma
   og `Veðurspá á þessum stað kl. HH:MM`.
4. Vænt: hlekkirnir `Skoða veðurspá`, `Opna á korti` og `Hrá met.no gögn` eru
   óbreyttir og virka áfram.
5. Opna nýja `Allir spápunktarnir á leiðinni` kaflann.
6. Vænt: kaflinn er meira áberandi en gamla skúffan og textinn fyrir ofan hann
   er lengri deterministic skýringin, ekki stutta AI-línan.
7. Vænt: hvert `Punktur x/y` detail-spjald notar sömu upplýsingaskipan og
   `Mest krefjandi` spjaldið, þar á meðal fjarlægð spápunkts frá vegi,
   veðurspártíma, vind, úrkomu og hita þegar gögn eru til.
8. Velja ákveðinn brottfararslot í heatmap, t.d. óþægilegt slot.
9. Vænt: `Mest krefjandi á leiðinni` sýnir ekki bara decisive metric heldur
   fulla línu með vind, úrkomu og hita þegar active-slot gögn eru til.
10. Vænt: `Punktur x/y` spjaldið fyrir sama punkt í `Allir spápunktarnir á
   leiðinni` sýnir líka veðurspártíma, vind, úrkomu og hita fyrir valda slotið.
11. Vænt: no-data punktar sýna áfram rólegan no-data texta og fá ekki gömul
   `summaryForWindow` veðurgildi frá öðrum brottfarartíma.
12. Prófa á mobile breidd 360-460 px.
13. Vænt: enginn horizontal overflow, texti fer eðlilega í línuskipti og
   hlekkirnir halda góðu bili.

#72
## Veður: mest krefjandi við upphaf ferðar

**Staða:** Í vinnslu

**Stofnað:** 2026-07-08

**Samhengi frá Stebba:** Ef mest krefjandi punkturinn er fyrsti punkturinn á
leiðinni erum við ranglega að sleppa því að segja `Mest krefjandi er...` í nýja
spjaldið fyrir ofan kortið.

**Vandamál:** Þegar fjarlægðin frá upphafi er 0 km eða punkturinn er
upphafspunktur virðist núverandi framsetning líklega fela línuna sem annars
segir hvar mest krefjandi punkturinn er. Það skilur notandann eftir með minna
samhengi einmitt þegar niðurstaðan er að vandinn sé strax í byrjun ferðar.

**Ósk:** Ef mest krefjandi punkturinn er fyrsti punkturinn skal top-spjaldið
sýna sérstaka línu:

```text
Mest krefjandi er við upphaf ferðarinnar, kl. HH:MM
```

Tíminn á að vera sami áætlaði tími/spápunktatími og er notaður í viðkomandi
spjaldi, eftir því hvaða tími er réttur í núverandi `Mest krefjandi er...`
línu þegar punkturinn er ekki í upphafi.

**Við útfærslu:**

- Lesa `Design.md` áður en UI/texti er breytt.
- Setja notendatexta í `messages/is.json` og `messages/en.json`.
- Skoða sérstaklega logic þar sem `Mest krefjandi er {distance} km frá...` eða
  `Mest krefjandi er {distance} km frá..., kl. {time}` er aðeins birt ef
  distance er stærra en 0.
- Ekki láta `0 km frá Garðabæ` birtast ef það er stirðara en sértextinn.
- Halda eldri hegðun fyrir punkta sem eru ekki við upphaf ferðar:
  `Mest krefjandi er N km frá {origin}, kl. HH:MM`.
- Passa return-leg ef sama component eða helper er notaður þar: ef
  heimferðarmetið er við upphaf heimferðar, á textinn að vísa til upphafs
  þeirrar ferðar, ekki ranglega til upprunalegs brottfararstaðar.
- Ekki breyta route provider, veðurmati, threshold logic, SQL, RLS eða auth.

**Manual pre-check áður en framkvæmd hefst:**

1. Finna eða búa til localhost-dæmi þar sem mest krefjandi punkturinn er
   `Punktur 1/x` eða fjarlægð 0 km frá upphafi.
2. Staðfesta að top-spjaldið sleppir nú `Mest krefjandi er...` línunni.
3. Athuga hvort sama vandamál sé til í útleið og heimferð.

**Localhost checks for Stebbi eftir breytingu:**

1. Opna `/auth-mvp/vedrid`.
2. Reikna leið þar sem mest krefjandi punkturinn lendir í upphafi ferðar.
3. Vænt: top-spjaldið sýnir `Mest krefjandi er við upphaf ferðarinnar, kl. HH:MM`.
4. Reikna eða velja leið þar sem mest krefjandi punkturinn er ekki í upphafi.
5. Vænt: top-spjaldið sýnir áfram venjulega fjarlægðarlínu, t.d.
   `Mest krefjandi er 17 km frá Garðabæ, kl. HH:MM`.
6. Prófa mobile 360-460 px.
7. Vænt: nýja línan veldur ekki overflowi eða texta-overlapi.

#73
## Veður: veður við komu á áfangastað

**Staða:** Í vinnslu

**Stofnað:** 2026-07-08

**Samhengi frá Stebba:** Í Ferðaveður-niðurstöðunni væri gagnlegt að sjá ekki
bara veðrið á mest krefjandi punkti leiðarinnar, heldur líka hvernig veðrið
verður við komu á áfangastað.

**Vandamál:** Top-spjaldið fyrir ofan kortið segir nú frá brottför, komutíma,
mest krefjandi stað og almenna öryggisathugasemd, en notandinn fær ekki skýra
komuveður-lendingu á áfangastaðnum sjálfum. Það er sérstaklega gagnlegt þegar
leiðin lítur vel út en notandinn vill vita hvort það bíði vindur, úrkoma eða
kuldi við komu.

**Ósk:** Bæta við veðri við komu á áfangastað í spjaldið fyrir ofan kortið,
helst nálægt eða fyrir neðan textann:

```text
Þetta er veðurspá og við búum á Íslandi. Fylgist vel með færðinni til öryggis,
t.d. á vef Vegagerðarinnar.
```

Framsetningin má vera aðeins meira lifandi en venjulegur texti, til dæmis með
checkmark eða litlu `Mættur`/arrival-lúkki. Hún á samt að vera róleg og
samræmd Teskeið, ekki stórt skrautkort.

**Við útfærslu:**

- Lesa `Design.md` áður en UI/texti er breytt.
- Setja allan nýjan notendatexta í `messages/is.json` og `messages/en.json`.
- Skoða hvaða gögn eru þegar til um áfangastaðaspá eða destination forecast í
  travel result payloadinu.
- Nota áætlaðan komutíma ferðarinnar til að velja rétta veðurspá við
  áfangastað, ekki núverandi klukkutíma nema hann sé raunverulega réttur.
- Sýna að minnsta kosti:
  - `Mættur` eða sambærilegt arrival-label,
  - áfangastað,
  - tíma við komu,
  - vind,
  - úrkomu,
  - hita,
  - hviður ef þær eru hluti af sömu veðurframsetningu annars staðar.
- Ef destination forecast vantar skal ekki búa til falskt öryggi; sýna frekar
  rólega fallback-línu eða sleppa komuveður-blokkinni.
- Passa að þetta verði ekki annað `Mest krefjandi` spjald; það á að svara
  einfaldri spurningu: hvernig er þegar ég kem á staðinn?
- Ekki breyta route provider, veðurþröskuldum, SQL, RLS, auth eða admin
  analytics í þessu atriði.

**Manual pre-check áður en framkvæmd hefst:**

1. Opna `/auth-mvp/vedrid` á localhost.
2. Reikna leið með skýrum áfangastað og niðurstöðu.
3. Staðfesta hvort top-spjaldið sýnir nú ekkert sérstakt veður við komu á
   áfangastað.
4. Athuga í response/debug hvort destination forecast eða sambærileg gögn séu
   þegar til í payloadinu.

**Localhost checks for Stebbi eftir breytingu:**

1. Opna `/auth-mvp/vedrid`.
2. Reikna leið, t.d. Garðabær -> Akranes eða Garðabær -> Egilsstaðir.
3. Vænt: top-spjaldið fyrir ofan kortið sýnir sérstaka `Mættur`/arrival-línu
   eða lítinn arrival-blokk með veðri við komu á áfangastað.
4. Vænt: blokkin sýnir komutíma og veðurgildi sem passa við spá á
   áfangastaðnum á þeim tíma.
5. Vænt: almenna öryggisathugasemdin með hlekk á Vegagerðina helst til staðar.
6. Prófa leið þar sem destination forecast vantar eða nær ekki að hlaðast.
7. Vænt: UI bilar ekki og sýnir ekki tilbúin veðurgildi.
8. Prófa mobile 360-460 px.
9. Vænt: nýja arrival-framsetningin veldur ekki overflowi, overlap-i eða of
   mikilli þyngd í top-spjaldinu.

#74
## Veður: hvað veldur ófullnægjandi gögnum og nálgun

**Staða:** Í vinnslu

**Stofnað:** 2026-07-08

**Samhengi:** Eftir #71 sýna spápunktar sem fá `Ófullnægjandi gögn` (no_data / reasonCode 'no_data') grátt spjald með textanum "Ekki nóg gögn til að meta þennan brottfarartíma." þegar notandinn velur slíkt slot í heatmap-inu. Þetta er rétt hegðun miðað við gildandi gagnalíkan, en ástæðan fyrir no_data er ekki skýr notandanum og við vitum ekki hvort við getum gert einhverja nálgun.

**Vandamál / spurningar:**

1. Hvað veldur því nákvæmlega að spápunktur eða brottfararslot fær `no_data`? Er það vegna þess að:
   - engin veðurspá er til fyrir þann tíma/stað,
   - veðurgögn eru of gömul eða utan spátímasviðs,
   - einhver útreikningsvilla á sér stað,
   - eða eitthvað annað?
2. Þegar gögn eru ófullnægjandi — eru einhver nálægð gögn (t.d. nærliggjandi tími, nærliggjandi spástöð) sem við gætum notað til að gera grófari nálgun?
3. Ef nálgun er möguleg — á að sýna hana með skýrri merkingu (t.d. "Nálæg spá frá X") frekar en að fela hana alveg?

**Við rannsókn:**

- Fara í `lib/weather/travel.ts` og skoða hvernig `no_data` verður til í `evaluateCandidate` og punktametingunni.
- Skoða `getHoursNearEta` eða sambærilegt — hvað gerist þegar engar klukkustundir finnast?
- Skoða hvort veðurgögn frá Met.no séu til staðar en utan tímasviðs, eða hvort API-kall skilar einfaldlega tómum gögnum.
- Gera greiningu á hve oft `no_data` kemur upp í raun (ef mögulegt með logum/tölfræði).

**Við útfærslu nálgunar (ef hún reynist möguleg og æskileg):**

- Lesa `Design.md` áður en UI er breytt.
- Skýrt merkja nálgun sem nálgun — ekki nota sömu `graent`/`gult`/`rautt` status án fyrirvara.
- Setja allan nýjan notendatexta í `messages/is.json` og `messages/en.json`.
- Ekki breyta SQL, RLS, auth eða admin analytics í þessu atriði.

**Manual pre-check áður en framkvæmd hefst:**

1. Opna `/auth-mvp/vedrid` á localhost.
2. Reikna Garðabær -> Akranes eða aðra leið sem framleiddi `Ófullnægjandi gögn`.
3. Skoða í DevTools/network hvaða tímar/spápunktar fá no_data og hvers vegna.
4. Staðfesta hvort veðurgögn eru hlutlægt til staðar en utan tímasviðs, eða hvort þau vantar alveg.

**Localhost checks for Stebbi eftir breytingu:**

1. Reikna leið sem framleiddi `Ófullnægjandi gögn` slot.
2. Velja slíkt slot.
3. Vænt: ef nálgun er útfærð sést hún með skýrum fyrirvara; ef ekki er hegðun óbreytt.

---

#75
## Veður: Spá 🥄 — veðurspátafla fyrir alla spápunkta

**Staða:** Lokið (Phase 1)

**Stofnað:** 2026-07-08

**Samhengi:** Endurnýta `ForecastDrawer` component þannig að hægt sé að opna Teskeiðarútlit á veðurspá frá öllum þremur stöðum í ferðaveðurniðurstöðunni.

**Útfært í Phase 1:**

- Nýr `ForecastDrawer` component — bottom-sheet, max-w-md, max-h-75vh, með töflu (dagsetning/tími, hiti, vindur+hvið, úrkoma).
- `buildForecastRows(hours, trailerKind, thresholds)` í `lib/weather/travel.ts` — reiknar delta/direction/tone/severity per röð, með `deriveGustSeverity` (threshold-relative).
- `forecastRows` bætt við `RouteWeatherPoint`; `destinationForecastRows` í stað `destinationForecastHours` í `TravelPlan`.
- Þrír triggers: komu við áfangastað ("Skoða spána á áfangastað betur"), `PointDetailsPanel` í korti (Spá 🥄) og `RoutePointRow` í útskýringarlista.
- Highlighted röð sýnir rétt spátíma: `displayPoint.forecastTimeIso` ef þetta er mesta krefjandi punkturinn undir virkum slot, annars næsta spáröð við ETA; fallback á `summaryForWindow.forecastTimeIso`.
- Label: "🥄 notar m.v. brottför kl. {time}" á öllum þremur stöðum.

**Phase 2 (framtíð):**

- Náttúrusíun (23:00-06:00 faldar, viðvörun ef þær fela gult/rautt veður).
- Hviðuþróunarörvar í vindreiti eftir mobile-próf.
- Hitastigslitir þegar frost-aware merking er til staðar.
4. Staðfesta að nálgun, ef hún er sýnd, sé ekki villandi.

---

#78
## Auth: sanitized RPC error diagnosis í user-codes logs

**Staða:** Bíður

**Stofnað:** 2026-07-10

**Samhengi:** `lib/auth/user-codes.ts` logar aðeins `'[user-codes] rpc create_user_otp_code_if_allowed failed'` þegar RPC bilar — án `error.code` eða `error.message`. Það er góð privacy-vörn en erfitt að greina hvort vandinn sé function vantar, signature mismatch, execute grant vantar, table grant vantar eða runtime villa.

**Vandamál:** `lib/__tests__/log-safety.test.ts` bannar dynamic values (property accesses, identifiers) í `console.error` og `console.warn` calls í server-kóða. Þess vegna er ekki hægt að bæta `error.code`/`error.message` við console.error eins og v010 Codex review lagði til.

**Mögulegar leiðir:**

1. Nota `console.log` í stað `console.error` fyrir RPC diagnosis-info (log-safety test nær ekki yfir `console.log`). Krefst stefnuákvörðunar um hvort `console.log` megi vera í production server-kóða.
2. Víkka log-safety test til að leyfa sérstakt `error.code` pattern með sérstakri undantekningu og skjölun.
3. Bæta við sérstakri, sanitized diagnosis-hjálparfalli sem logar aðeins leyfilegar static strengjagreinar m.v. þekkt PostgREST/Postgres error codes.

**Engin breyting á notendaupplifun.** Einungis diagnosis fyrir þróunarfasa og framtíðarbilanir.
