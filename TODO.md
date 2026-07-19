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
| 1   | **#85 Veður: einfalda veðurmörk og ný vindstöðulabel**      | **Ferðalagið núna.** Taka út `Eftirvagn`, sleppa hviðum, láta notanda stilla aðeins óþægilegan/hættulegan vind og bæta við `Innan marka`/`Nálgast...` statusum. |
| 2   | **#81 Veður: `Um Þingvelli` route family**                  | **Route-refactor núna.** Bæta við curated leið um Þingvelli/Route 36 þegar Google Maps sýnir hana sem raunhæfan valkost, t.d. Garðabær -> Stóra-borg. |
| 3   | **#61 Aðila-flæði birtist í sögu hlutar**                    | **Event/history pakki með #38.** Skrá í `Saga hlutarins` þegar aðila er bætt við, boð samþykkt eða boði hafnað. |
| 4   | **#38 Event þegar lánaboði er hafnað**                       | **Event/Ólesið pakki með #61.** Bæta decline-eventi og ack/read-state ofan á staðfestan `Ólesið` grunn; loka sem undiratriði ef #61 leysir það. |
| 5   | **#39 Gera samþykktan hlut óvirkan við eyðingu**             | **Event/heimildir pakki.** Delete á samþykktum hlut er soft delete: hlutur verður disabled og áfram aðgengilegur sem slíkur. |
| 6   | **#59 Deilanlegur hlekkur á lánadetail**                     | **Detail/access pakki.** Notandi geti sent hlekk á hlut; hlekkurinn virkar aðeins hjá þeim sem hafa aðgang í Teskeið. |
| 7   | **#63 Endurnefna „Lánað og skilað“ í „Minnið“**              | **Product/IA quick win.** Gera núverandi lánakerfi að fyrstu tegundinni inni í `Minnið`, án gagnamódelsbreytinga í v1. |
| 8   | **#64 Fallegra hlutverkaval í edit-viðmóti**                 | **UI polish eftir #62.** Skipta ljótum `Leiðrétta í...` takka út fyrir tvær pillur: `Ég lánaði` og `Ég fékk lánað`. |
| 9   | **#66 Flytja lánaðan hlut á annan aðila**                    | **Minnið/aðila-edit eftir #64.** Notandi geti skipt út staðfestum mótaðila þegar hlutur endar hjá öðrum, án þess að loka og stofna nýtt lán. |
| 10  | **#27 Mýkra lánaboðsflæði**                                  | **Eftir event-grunn.** Full mýking lánaboða byggir á því að #38/#39/#59/#61 séu orðin traust og að #63/#64/#66 séu skýr. |
| 11  | **#17 Hugmyndir úr hugmyndabankanum á `/heim`**              | **Heimaskjár pakki.** Skipta væntanlegt-lista í raunverulegar hugmyndir og kosningu; gott að taka með #42. |
| 12  | **#42 Tilbúnar Teskeiðar efst og síðast opnuð fyrst**        | **Heimaskjár pakki.** Gera virkar Teskeiðar efstar og skýrar áður en hugmyndir taka meira pláss á `/heim`. |
| 13  | **#41 Umönnun sem feature-flagged Teskeið**                  | **Feature-card/info quick win.** Sýna sem varlega feature-flagged Teskeið án þess að flytja Umönnun-gögn inn. |
| 14  | **#46 User+pass fallback þegar kóði berst ekki**             | **Auth reliability pakki.** Mikilvægt ef kóðar berast illa, en snertir auth/rate limit/reset og á að vera sér áfangi. |
| 15  | **#7 Langlíf innskráning**                                   | **Auth/session pakki.** Taka með #46 eða strax á eftir, en ekki blanda við láns/event quick wins. |
| 16  | **#22 Hreinsa sýnilegar `/auth-mvp/` slóðir**                | **Route cleanup.** Gera eftir að `/heim`, `/stillingar/*` og loan flæði eru stöðug; þarf redirect- og query-param próf. |
| 17  | **#13 Endurskilgreina hlutverk whitelist/admin-lista**       | **Admin/access ákvörðun.** Ákveða hlutverk listans áður en meira admin UI byggist á honum. |
| 18  | **#33 Fjöldi innskráðra notenda í admin tölfræði**           | **Admin quick win eftir #13.** Einföld talning, en skilgreining og service-role mörk þurfa að vera skýr. |
| 19  | **#10 Gáfuleg opnun tölfræðisíðu**                           | **Admin stats sérpakki.** Server-side heimsóknarrökfræði, race conditions og fallback; ekki opnunarblocker. |
| 20  | **#69 Virkni per Teskeið í admin sýn**                      | **Admin/usage pakki.** Mæla notkun virkra Teskeiða í admin, sérstaklega hversu oft Veðrið reiknar nýjar leiðir, án þess að leka staðsetningum eða notendagögnum. |
| 21  | **#84 Admin: aðgreina dev/test virkni frá raunnotkun**      | **Admin/usage pakki með #69.** Sýna tölfræði með og án þróunar-/prófunarumferðar frá Stebba, byggt á öruggu server-side dev flaggi út frá netfangi og mögulega IP. |
| 22  | **#50 Fjölskyldumeðlimir sem tengsl**                        | **Future Tengsl data.** Bíður þar til Tengsl v1 hefur fengið raunnotkun; snertir viðkvæmari fjölskyldu-/barnagögn. |
| 23  | **#54 Spjall á hverjum lánaða hlut**                         | **Stærri future feature.** Byggir á detail-page access, event/read-state og skýrri privacy ákvörðun. |
| 24  | **#57 Timestamp format í ensku locale**                      | **Tech debt/i18n.** `formatEventTimestamp` notar `kl.` og íslenska orðröð utan messages-template. Lágt forgangsstig. |
| 25  | **#51 Staðfest Facebook-tenging**                           | **Phase 1 kóðinn er tilbúinn og shipped (commit 547f367) en disabled - kveikja með `FACEBOOK_OAUTH_ENABLED=true` + Supabase/Facebook stillingar (sjá v015 handoff). Phase 2 badge í lánaboðssamhengi er ólokið.** |
| 26  | **#67 Veður: óæskilegur keyrslutími dags**                  | **Ferðalagið follow-up.** Notandi geti sagt hvaða tíma dags hann vill alls ekki vera að keyra, t.d. að nóttu til, og ferðaveðurmatið taki tillit til þess. |
| 27  | **#70 Veður: leiðartími og route-provider samanburður**     | **Ferðalagið follow-up, ekki release blocker.** Þrengslavegur-leiðin finnst nú, en Google Routes tíminn er enn of nálægt Route 427 miðað við Google Maps; skoða Mapbox og provider-samanburð síðar. |
| 28  | **#71 Veður: allir spápunktar og fjarlægð frá vegi**        | **Ferðalagið UI/copy polish.** Setja vegalengd spápunktar frá veginum aftur inn og nota sömu fullu punktaupplýsingar í öllum detail-spjöldum undir spápunktalistanum. |
| 29  | **#72 Veður: mest krefjandi við upphaf ferðar**             | **Ferðalagið edge-case polish.** Ef mest krefjandi punkturinn er fyrsti punkturinn á top-spjaldið að segja að hann sé við upphaf ferðarinnar, ekki sleppa línunni. |
| 30  | **#73 Veður: veður við komu á áfangastað**                  | **Ferðalagið result polish.** Sýna veður við áætlaða komu á áfangastað í top-spjaldinu, með skýru `Mættur`/arrival-lúkki svo þetta verði gagnlegt en ekki dauður texti. |
| 31  | **#74 Veður: hvað veldur ófullnægjandi gögnum og nálgun**   | **Ferðalagið data quality.** Skoða hvað veldur því að spápunktar fá `Ófullnægjandi gögn` (no_data) og hvort hægt sé að gera nálgun m.v. tiltæk gögn þegar nákvæm spá vantar. |
| 32  | **#75 Veður: Spá 🥄 — veðurspátafla fyrir alla spápunkta**  | **Ferðalagið UI.** Endurnýta `ForecastDrawer` þannig að hægt sé að opna Teskeiðarútlit á veðurspá frá öllum þremur stöðum: komu við áfangastað, mesta krefjandi punkti og öllum spápunktum í lista. |
| 33  | **#79 Veður: víxla upphafs- og áfangastað**                 | **Ferðalagið route-selection polish.** Bæta við reverse-takka milli `Frá` og `Til` sem víxlar stöðunum líkt og í Google Maps, án þess að tapa placeId/hnitum eða rugla public rate-limit/route options. |
| 34  | **#80 Veður: merkja hættulega eða óhentuga vegkafla**       | **Ferðalagið route-safety layer.** Merkja vegkafla eins og Öxi/Axarveg sem geta verið galið val með hjólhýsi/kerru, og láta route-val/viðvaranir taka tillit til búnaðar notanda. |
| 35  | **#82 Veður: `Af stað!` fyrir custom/curated leiðir**        | **Ferðalagið route handoff.** Þegar Teskeið býr til custom leið, t.d. `Um Hellisheiði`, þarf notandi að geta opnað valda leið í Google Maps eða Apple Maps. |
| 36  | **#83 Veður: veður-risk á route option spjöldum**           | **Ferðalagið route-selection polish.** Sýna á hverri leið hvað mest krefjandi veðurskilyrðið er áður en notandi velur leið, ekki bara raða eftir fljótlegasta tíma. |
| 37  | **#87 Veður: auglýsingahamur í kringum keyrðar leiðir**     | **Business/product discovery.** Skoða hvernig route-tengd auglýsing gæti virkað án staðsetningarleka, mögulega með auglýsendum sem nota Teskeið-aðgang til að setja auglýsingar niður á hnit. |
| 38  | **#88 Veður: fuzzy staðarleit og staðfesting á korti**      | **Ferðalagið route-selection polish.** Þegar notandi velur eða skrifar stað sem er ekki nákvæmlega úr fellilistanum þarf fuzzy leit, pinni á korti og staðfesting svo réttur staður sé valinn. |
| 39  | **#89 Veður: spjall per live punkt og síðar vegakafla**     | **Community/weather layer.** Eftir að Vegagerðin er komin inn: byrja á spjalli per live Vegagerðarpunkt; Veðurstofustöðvar geta verið fallback/viðbót og síðar tengt við vegakafla. |
| 40  | **#90 Veður: eigið Íslandsleiðarkerfi og vegkaflagrunnur** | **Stór architecture/discovery vinna.** Meta hvort Teskeið eigi að byggja eigin einfalt leiðarkerfi fyrir Ísland, byggt á vegkafla-grunni/cache, í stað þess að rembast endalaust við Google Routes fyrir langar landsleiðir. |

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

**Pakki D — routes og admin:** #22, #13, #33, #10, #69 og #84. Taka þegar core
notendaflæði eru stöðug, svo canonical slóðir, admin-tölfræði og
Teskeiða-notkunarmælingar byggist ekki á fljótandi grunnhegðun. #84 tryggir
að admin/usage tölur megi skoða bæði með og án dev/test-umferðar frá Stebba.

**Pakki E — stærri framtíðareiginleikar:** #50, #54 og #51. Þetta eru ekki
fyrstu quick wins: þau snerta viðkvæmari gögn, nýja gagnastrúktúra eða ytri
OAuth provider. #60 er kominn fyrsti afmarkaði spjall-áfangi inni í sögu
hlutarins; #54 bíður sem stærri framtíðarútvíkkun ef spjallið á að verða
fullkomnara.

**Pakki F — Veðrið / Ferðalagið:** #85, #81, #82, #83, #67, #70, #71, #72, #73, #74, #75, #79, #80, #88, #89, #90 og áframhaldandi `todo-067` handoff.
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
- Notandi skal geta valið `Ekki fyrir mig` á hugmynd. Það er persónulegt
  val hjá viðkomandi notanda, ekki neikvætt global atkvæði.
- Hugmyndir sem notandi hefur merkt `Ekki fyrir mig` skulu færast neðst í
  hugmyndalista hjá þeim notanda, án þess að hverfa endilega alveg.
- Hugmyndir í stöðunni `Komið út` / `launched` eiga ekki að vera kjósanlegar.
  Þær mega birtast sem virkar/tilbúnar Teskeiðar eða með CTA inn í vöruna, en
  ekki með atkvæðahnappi.
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
- `Ekki fyrir mig` þarf að vera user-scoped preference með RLS/heimildum þannig
  að notandi geti aðeins séð og breytt eigin vali. Það má ekki breyta
  `votes_count`, public röðun eða upplifun annarra notenda.
- Kosninga-API og UI þurfa að hafna eða fela kosningu á `launched` hugmyndum á
  bæði client og server hlið, svo ekki sé hægt að kjósa þær með beinu API kalli.
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
- Notandi getur merkt hugmynd `Ekki fyrir mig`; hún færist neðst hjá honum en
  ekki hjá öðrum notendum.
- Notandi getur afturkallað `Ekki fyrir mig` ef sú hegðun verður valin í UI.
- Hugmyndir með stöðu `Komið út` / `launched` sýna ekki atkvæðahnapp og API
  hafnar atkvæði á þær.
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

#84
## Admin: aðgreina dev/test virkni frá raunnotkun

**Staða:** Bíður

**Stofnað:** 2026-07-11

**Samhengi frá Stebba:** Stebbi vill geta séð admin/usage tölfræði bæði með og
án eigin þróunar- og prófunarumferðar. Fyrsta dev-skilgreining má byggja á
Stebba-notandanum (`stefanhalldor@gmail.com`) og helst líka IP-tölu hans ef
hægt er að gera það örugglega.

**Vandamál:** Þegar Stebbi prófar Veðrið, auth, admin og önnur flæði getur
eigin umferð skekkt product-health tölur, sérstaklega route calculations,
public/guest limits og conversion. Admin þarf að geta greint raunnotkun frá
dev/test án þess að eyða gögnum eða fela hvað var prófað.

**Ósk:** Bæta við server-side flokkun sem merkir usage/admin events sem
`dev/test` eða `real/user` þannig að admin sýn geti sýnt:

- heildartölur,
- tölur án dev/test,
- og mögulega dev/test sérstaklega.

**Við útfærslu:**

- Tengja við #69 usage events/admin metrics.
- Nota server-side skilgreiningu, ekki client-controlled flag.
- Fyrsta regla getur verið dev email allowlist, t.d. env var eins og
  `DEV_USAGE_EMAILS` eða `ADMIN_DEV_EMAILS` sem inniheldur
  `stefanhalldor@gmail.com`.
- Ef IP er notuð, gera það varlega:
  - lesa IP server-side úr request headers með sama pattern og public route
    rate-limit,
  - ekki birta raw IP í admin UI,
  - ekki geyma raw IP í usage metadata nema það sé sérstaklega samþykkt,
  - helst nota HMAC/hash eða env-only allowlist yfir dev IP.
- Ekki hardcode-a Stebba netfang eða IP djúpt í business logic ef einfaldari
  env/config leið er til.
- Bæta við `includeDev`/`excludeDev` eða sambærilegum filter í admin API/UI.
- Default admin product-health view ætti líklega að sýna "án dev/test" eða
  sýna bæði skýrt merkt.
- Gera greinarmun á `authenticated dev user` og `public guest from dev IP`.
- Ekki láta dev/test flokkun hafa áhrif á notendaflæði, rate-limit, aðgang eða
  RLS; þetta er aðeins reporting/analytics filter nema Stebbi samþykki annað.
- Ekki leka netfangi, IP, user_id eða fingerprints í client payload nema það sé
  nauðsynlegt og rýnt sérstaklega.
- Ef SQL schema þarf nýjan dálk, t.d. `is_dev_event boolean`, þarf migration
  með privacy/RLS review.
- Ef þetta er hægt án SQL með metadata field sem þegar er sanitized, samt rýna
  metadata allowlist þannig að PII fari ekki inn.

**Manual pre-check áður en framkvæmd hefst:**

1. Opna `/admin` og skoða núverandi usage/admin tölur.
2. Framkvæma route calculation sem Stebbi, t.d. í Veðrinu.
3. Staðfesta að núverandi admin tölur telji Stebba-prófanir eins og venjulega
   notkun.
4. Athuga hvort `teskeid_usage_events` eða admin endpoint hafi nú þegar
   `user_id`, auth state eða metadata sem getur stutt dev filter án PII.
5. Athuga hvernig IP er sótt í núverandi public weather rate-limit kóða.

**Localhost checks for Stebbi eftir breytingu:**

1. Setja dev email config í `.env.local` þannig að `stefanhalldor@gmail.com`
   teljist dev/test.
2. Opna `/admin` sem admin.
3. Framkvæma usage event sem Stebbi, t.d. route calculation í Veðrinu.
4. Vænt: admin sýnir að atburður er talinn í heildartölum en má útiloka í
   "án dev/test" sýn.
5. Ef dev IP config er til staðar, prófa public/guest route calculation frá
   sömu vél.
6. Vænt: guest event frá dev IP má flokkast sem dev/test án þess að raw IP sjáist
   í UI/payload.
7. Framkvæma event sem non-dev notandi eða án dev env.
8. Vænt: event telst sem raunnotkun.
9. Staðfesta í Network/admin payload að raw IP og netfang leki ekki.
10. Staðfesta að flokkun breyti ekki route quota, auth, RLS eða venjulegri
    virkni.

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

#85
## Veður: einfalda veðurmörk og ný vindstöðulabel

**Staða:** Bíður

**Stofnað:** 2026-07-11

**Forgangur:** Alveg efst. Taka næst þegar hægt er, helst áður en meiri
Ferðalagið-UI byggist ofan á núverandi veðurmarka- og status-kerfi.

**Samhengi frá Stebba:** Núverandi flæði biður notanda um `Eftirvagn` og notar
veðurmörk sem byggja m.a. á hviðum. Stebbi vill einfalda þetta strax:
notandinn á sjálfur að fylla út veðurmörkin og kerfið á að hætta að byggja UI,
labels eða mat á hviðugögnum.

**Vandamál:**

- `Eftirvagn` skrefið er orðið óæskilegt sem sérstakt wizard-skref.
- Hviður eiga ekki að stýra núverandi mati eða threshold UI í þessum fasa.
- `Gott veður` er ekki nógu gott orðalag þegar við erum í raun að bera spá
  saman við mörk sem notandinn skilgreinir sjálfur.
- Núverandi þriggja stiga status (`Gott veður`, `Óþægilegt`, `Hættulegt`)
  vantar millistig sem hjálpar notanda að sjá að vindur er að nálgast mörk.

**Ósk:**

1. Taka út `Eftirvagn` skrefið úr Veðrinu/Ferðalaginu.
2. Láta notanda stilla veðurmörkin sjálfan.
3. Á veðurmarkaskrefi bjóða aðeins upp á:
   - óþægilegan vind,
   - hættulegan vind.
4. Sleppa hviðum alveg í threshold UI, summary-texta og labelum í þessum fasa.
   Til að einfalda fyrstu útfærslu má halda hviðum og úrkomu inni í bakgrunns-
   módelinu en setja mörkin bakvið tjöldin í óvirkjandi há gildi, t.d. 100, svo
   þau stýri ekki niðurstöðu.
5. Endurnefna `Gott veður` í `Innan marka`.
6. Bæta við nýjum vindstöðu-labelum út frá fjarlægð frá stilltum mörkum:
   - `Innan marka`: vindur er undir óþægilegum mörkum og meira en 2 m/s frá
     þeim.
   - `Nálgast óþægindi`: vindur er minna en 2 m/s undir stilltum óþægilegum
     mörkum. Litur: gulur.
   - `Óþægilegt`: vindur er yfir óþægilegum mörkum en meira en 2 m/s frá
     hættumörkum.
   - `Nálgast hættumörk`: vindur er minna en 2 m/s undir stilltum hættumörkum.
     Þarf að velja skýran varúðarlit í UI, líklega sterkari gul/appelsínugul eða
     rauðleit nálgun, án þess að rugla saman við `Hættulegt`.
   - `Hættulegt`: óbreytt m.v. í dag þegar vindur er yfir hættumörkum.
7. Á veðurmarkaskrefi taka fram að hviður í spágögnum séu ekki nógu áreiðanlegar
   til að fylgjast með í þessu mati, og hvetja notendur til að fylgjast vel með
   hviðum og aðstæðum á vef Vegagerðarinnar, sérstaklega þegar vindurinn er utan
   þeirra marka sem notandinn skilgreinir.

**Copy sem á að vinna úr:**

> Hviður í spágögnum eru ekki nógu áreiðanlegar til að nota í þessu mati.
> Fylgstu sérstaklega vel með hviðum og aðstæðum á vef Vegagerðarinnar,
> sérstaklega þegar vindurinn er utan markanna sem þú stillir hér.

**Við útfærslu:**

- Lesa `Design.md` áður en UI er breytt.
- Finna öll núverandi `trailer`/`aftervagn`/`gust`/`precipitation threshold`
  tengd atriði í:
  - wizard step order,
  - step-nav,
  - default thresholds,
  - validation,
  - status talningu/pillum,
  - heatmap/scrubber,
  - route weather point detail,
  - forecast drawer,
  - route option preview ef það er komið,
  - tests.
- Ekki hardcode-a notendatexta; setja texta í `messages/is.json` og
  `messages/en.json`.
- Passa að eldri ferðaveðurmat fari ekki að sýna villandi `Gott veður` texta.
- Úrkoma má áfram sjást sem veðurupplýsing í result/detail þar sem hún er
  gagnleg, en hún á ekki að vera sýnileg sem stillanlegt veðurmark í þessum
  fyrsta fasa. Bakvið tjöldin má setja úrkomumörk í hátt gildi, t.d. 100, til
  að forðast stærri refactor.
- Hviður mega vera áfram til í data types og forecast payload handling í fyrsta
  fasa, en UI og summary eiga ekki að sýna hviðugildi eða hviðuveðurmörk og þau
  mega ekki ráða notendasýnilegri niðurstöðu.
- Gæta að því að #80 um hættulega/óhentuga vegkafla muni síðar þurfa sérstaka
  búnaðar-/vegkafla-lógík, þar sem `Eftirvagn` skrefið verður tekið út.
- Gæta að backwards compatibility í shared weather/trip core: ef status enum
  breytist þarf að uppfæra types, tests og öll UI sem lesa status.
- Ef ný status gildi eru bætt við skal forðast að brjóta eldri summaries,
  admin events eða analytics sem búast við núverandi `graent/gult/rautt`.
  Möguleg leið: halda internal severity grunni en bæta við display label /
  substatus.

**Manual pre-check áður en framkvæmd hefst:**

1. Opna `/vedrid` eða `/auth-mvp/vedrid`.
2. Staðfesta núverandi skrefaröð og hvernig `Eftirvagn` birtist.
3. Stilla mörk og reikna leið sem fer nálægt óþægilegum eða hættulegum vindi.
4. Skrá hvaða textar, pillur og spjöld sýna `Gott veður`, `Óþægilegt`,
   `Hættulegt` og hviður núna.
5. Staðfesta hvar hviður eru enn sýndar eða notaðar, svo breytingin verði ekki
   hálfgerð.
6. Prófa mobile viewport 360-460 px til að sjá hvað má missa pláss í wizardnum
   þegar `Eftirvagn` fer út.

**Localhost checks for Stebbi eftir breytingu:**

1. Opna `/vedrid` sem public notandi ef `WEATHER_PUBLIC_ENABLED=true`.
2. Vænt: flæðið fer ekki lengur í sérstakt `Eftirvagn` skref.
3. Opna `/auth-mvp/vedrid` sem innskráður notandi.
4. Vænt: sama einfalda flæði og public notandi, nema innskráðir fá sín
   innskráðu fríðindi.
5. Á veðurmarkaskrefi stilla óþægilegan vind og hættulegan vind.
6. Vænt: engin hviðustilling er sýnileg.
7. Vænt: texti um að hviður séu ekki notaðar í þessu mati og að fylgjast eigi
   með Vegagerðinni er sýnilegur, stuttur og læsilegur.
8. Reikna leið þar sem vindur er vel undir óþægilegum mörkum.
9. Vænt: pillur/scrubber/result segja `Innan marka`, ekki `Gott veður`.
10. Reikna eða stilla mörk þannig að vindur sé innan við 2 m/s undir
    óþægilegum mörkum.
11. Vænt: `Nálgast óþægindi` birtist gult.
12. Reikna eða stilla mörk þannig að vindur sé yfir óþægilegum mörkum en ekki
    nálægt hættumörkum.
13. Vænt: `Óþægilegt` birtist eins og núverandi varúðarflokkur.
14. Reikna eða stilla mörk þannig að vindur sé innan við 2 m/s undir
    hættumörkum.
15. Vænt: `Nálgast hættumörk` birtist með skýrum varúðarlit og ekki sem
    `Hættulegt`.
16. Reikna eða stilla mörk þannig að vindur sé yfir hættumörkum.
17. Vænt: `Hættulegt` er óbreytt m.v. núverandi alvarlegasta flokk.
18. Prófa result summary, map, spápunktalista og forecast drawer.
19. Vænt: engin hviðugildi eða hviðulabel birtast þar sem þau eiga að vera
    farin.
20. Prófa route með fleiri en einni leið ef route picker sýnir weather preview.
21. Vænt: route option preview notar sömu nýju status/labels og final result.
22. Prófa mobile 360-460 px.
23. Vænt: enginn horizontal overflow, engin overlap og enginn mobile zoom.

---

#81
## Veður: `Um Þingvelli` route family

**Staða:** Bíður

**Stofnað:** 2026-07-11

**Forgangur:** Efst á TODO-lista á meðan stóri route/refactor áfanginn er í
vinnslu.

**Samhengi frá Stebba:** Google Maps skilar leið frá Garðabæ í Stóra-borg sem
fer norður/inn fyrir höfuðborgarsvæðið og um Route 36 / Þingvelli áður en hún
tengist Biskupstungnabraut. Þetta er leið sem Stebbi hafði raunverulega hugsað
sér að keyra. Teskeið sýnir nú `Um Hellisheiði` og `Sjálfgefin Google-leið`, en
ekki þessa Google Maps-leið.

**Vandamál:** Núverandi curated route-registry hefur reglur fyrir `Um
Hellisheiði` og `Hringurinn`, en ekki route family fyrir `Um Þingvelli` /
norðurleiðina. Þar af leiðandi birtist þessi leið aðeins ef Google Routes API
skilar henni sjálft í okkar requesti. Google Maps getur sýnt hana í UI, en
Teskeið missir samt af henni ef provider-callið okkar skilar henni ekki eða ef
route-refactor/dedupe tekur hana ekki með.

**Ósk:** Bæta við curated route family `Um Þingvelli` sem þvingar fram þennan
raunhæfa valkost þegar hann á við, án þess að sérsníða lausnina aðeins fyrir
Garðabær -> Stóra-borg.

**Við útfærslu:**

- Nota sama route-family / curated-via registry og `Um Hellisheiði` og
  `Hringurinn`; ekki búa til sérlausn utan shared route provider-kjarnans.
- Label í UI á að vera stutt og skiljanlegt, líklega `Um Þingvelli`.
- Route description má styðjast við Google description, t.d. `Route 36`, en
  labelið á ekki að vera háð ensku provider-orðalagi.
- Via-punktar þurfa að vera valdir þannig að route fari raunverulega um
  Þingvelli/Route 36 corridor, ekki óþarfa krók eða leið sem klessir á
  Hellisheiði-regluna.
- Fyrsti fasi má byrja með route family fyrir:
  - origin í capital area,
  - destination á Golden Circle / Biskupstungur / Laugarvatn / Stóra-borg
    svæði,
  - þar sem Google Maps sýnir Route 36 / Þingvellir sem raunhæfan valkost.
- Ekki láta regluna birtast fyrir alla áfangastaði á Suðurlandi ef hún verður
  bara noise.
- Dedupe þarf að passa:
  - ef Google provider skilar sömu Þingvalla-leið sjálfur, sameina/fela
    duplicate,
  - ef `Um Þingvelli` er sama geometry og base route, ekki sýna tvö eins
    spjöld,
  - ef hún er distinct en lengri, má hún birtast sem aukavalkostur.
- Hún á ekki að skipta út `Um Hellisheiði`; þetta eru tveir mismunandi
  corridors sem notandi getur viljað bera saman.
- Þetta tengist #70 og framtíðar provider-samanburði, en á að vera hægt að
  útfæra innan núverandi Google Routes/curated-registry áfanga.
- Passa að final submit noti valda `Um Þingvelli` geometry fyrir spápunkta,
  ekki default route.
- Passa að usage/admin analytics telji curated label án staðsetningarleka, t.d.
  með nýju labeli á borð við `CURATED_VIA_THINGVELLIR`.
- Ekki geyma nákvæma uppruna-/áfangastaði eða route geometry í gagnagrunni.
- Engin SQL/RLS/auth breyting á að vera nauðsynleg.

**Skjámynd:** Stebbi sendi skjámynd í samtali 2026-07-11 sem sýnir Google Maps
með tveimur leiðum Garðabær -> Stóra-borg:

- `via Nesjavallaleið/Route 435`, 1 hr 7 min, 72.3 km,
- `via Route 36`, 1 hr 19 min, 94.2 km.

Myndin var ekki aðgengileg sem staðbundin skrá í workspace þegar atriðið var
skráð, þannig hún er ekki vistuð í `feedback/images/`.

**Manual pre-check áður en framkvæmd hefst:**

1. Opna Google Maps og prófa Garðabær, 210 -> Stóra-borg,
   Biskupstungnabraut, 805.
2. Staðfesta hvort Google Maps sýni `via Route 36` / Þingvalla-leiðina og
   skrá tíma/km.
3. Opna `/vedrid` eða `/auth-mvp/vedrid` á localhost.
4. Velja sömu uppruna/áfangastaði.
5. Staðfesta núverandi hegðun:
   - `Um Hellisheiði` birtist,
   - `Sjálfgefin Google-leið` birtist,
   - `Um Þingvelli` / Route 36 birtist ekki.
6. Skoða terminal diagnostics fyrir `getRouteOptions` til að sjá hvort Google
   Routes API skilaði Route 36 eða ekki.

**Localhost checks for Stebbi eftir breytingu:**

1. Opna `/vedrid` eða `/auth-mvp/vedrid`.
2. Velja Garðabær -> Stóra-borg.
3. Vænt: route options sýna `Um Þingvelli` sem distinct valkost ásamt
   `Um Hellisheiði` og/eða sjálfgefnu Google-leiðinni.
4. Vænt: kortið sýnir `Um Þingvelli` sem leið um Route 36 / Þingvelli corridor,
   ekki Hellisheiði eða óþarfa krók.
5. Smella `Nota þessa leið` á `Um Þingvelli`.
6. Vænt: ferðaveður-niðurstaðan notar valda Þingvalla-geometry fyrir kort,
   spápunkta, mest krefjandi punkt og áætlaðan komutíma.
7. Prófa Garðabær -> Laugarvatn eða sambærilegt Golden Circle destination.
8. Vænt: `Um Þingvelli` birtist aðeins þar sem hún er skynsamlegur valkostur.
9. Prófa Garðabær -> Selfoss og Garðabær -> Þorlákshöfn.
10. Vænt: `Um Þingvelli` birtist ekki sem rangur/noisy valkostur þar sem
    Hellisheiði eða önnur leið á betur við.
11. Prófa mobile 360-460 px.
12. Vænt: aukaleiðin veldur ekki layout overflowi og route-card listinn helst
    læsilegur.

#82
## Veður: `Af stað!` fyrir custom/curated leiðir

**Staða:** Bíður

**Stofnað:** 2026-07-11

**Samhengi frá Stebba:** Þegar Teskeið býr til custom/curated leið eins og
`Um Hellisheiði`, sem kemur ekki endilega upp sem venjulegur valkostur í
Google Maps, þarf notandi samt að geta farið af stað með þá leið í sínu
kortaappi.

**Vandamál:** Teskeið getur sýnt leið sem er gagnlegri en það sem Google Maps
UI býður sjálft, en eftir að notandi velur hana er ekki augljóst hvernig hann
opnar nákvæmlega þá route í Google Maps eða Apple Maps. Þetta er sérstaklega
viðkvæmt fyrir curated-via leiðir, því venjulegt origin/destination link getur
látið kortaappið velja aðra leið.

**Ósk:** Bæta við `Af stað!` takka eða sambærilegri aðgerð eftir að notandi
hefur valið leið, sem opnar valda leið í kortaappi með via-punktum þannig að
custom leiðin haldist eins vel og mögulegt er.

**Við útfærslu:**

- Lesa `Design.md` áður en UI er breytt.
- Textinn má vera `Af stað!` ef hann passar við tóninn; annars má útfæra
  stuttan action-texta sem er jafn skýr.
- Takki á að koma fram þar sem notandi er búinn að velja route eða er að fara
  yfir í keyrslu, ekki trufla route-comparison skrefið að óþörfu.
- Opna þarf valda route, ekki bara origin/destination:
  - nota origin,
  - destination,
  - curated via-punkta/intermediates þegar þeir eru til,
  - og helst selected route metadata ef provider/link format styður það.
- Gera ráð fyrir að browser geti ekki örugglega vitað hvaða kortaapp sé
  default hjá notanda. Útfærsla þarf að vera mobile-first og graceful:
  - iOS: Apple Maps deep link eða maps.apple.com fallback,
  - Android: Google Maps intent eða Google Maps URL fallback,
  - desktop: Google Maps URL fallback,
  - ef default app detection er óáreiðanleg, bjóða frekar upp á skýra valmynd
    eða nota öruggan fallback.
- Fyrsti fasi má styðja Google Maps link með waypoints ef Apple Maps styður
  ekki sömu fidelity nógu vel; þá þarf UI/copy að vera heiðarlegt.
- Ekki gera ráð fyrir að Google Maps muni alltaf endurgera nákvæmlega sömu
  polyline og Teskeið. Markmiðið er að halda via-corridor, t.d. Hellisheiði,
  eins vel og maps URL/deep link leyfir.
- Fyrir curated route labels eins og `CURATED_VIA_HELLISHEIDI`,
  `CURATED_RING_ROAD` og væntanlegt `CURATED_VIA_THINGVELLIR` þarf linkurinn
  að nota viðeigandi via-punkta.
- Ekki geyma nákvæma route geometry eða user route í gagnagrunni fyrir þessa
  aðgerð.
- Ekki nota ný API-köll bara til að opna kortaapp nema nauðsyn sé rökstudd.

**Manual pre-check áður en framkvæmd hefst:**

1. Opna `/vedrid` eða `/auth-mvp/vedrid`.
2. Reikna leið þar sem Teskeið sýnir custom/curated valkost, t.d.
   `Um Hellisheiði`.
3. Velja curated leiðina.
4. Staðfesta hvort núverandi UI hafi einhverja action til að opna valda leið í
   Google Maps/Apple Maps.
5. Skoða hvaða route option object heldur utan um via-punkta eða labels sem
   hægt er að nota í map-link.

**Localhost checks for Stebbi eftir breytingu:**

1. Opna `/vedrid` eða `/auth-mvp/vedrid` í farsíma eða mobile viewport.
2. Reikna leið með `Um Hellisheiði`.
3. Velja `Um Hellisheiði`.
4. Smella `Af stað!`.
5. Vænt: kortaapp eða kortaslóð opnast með origin, destination og via-punkti
   sem heldur leiðinni um Hellisheiði.
6. Prófa venjulega Google-leið án curated labels.
7. Vænt: `Af stað!` opnar eðlilega origin/destination leið án auka via.
8. Prófa desktop.
9. Vænt: fallback opnar Google Maps eða annan skýran maps URL án client-villu.
10. Prófa mobile 360-460 px.
11. Vænt: takkinn er skýr, ekki of stór, veldur ekki overlapi og ýtir ekki
    mikilvægum niðurstöðum óþægilega niður.

#83
## Veður: veður-risk á route option spjöldum

**Staða:** Bíður

**Stofnað:** 2026-07-11

**Samhengi frá Stebba:** Þegar notandi velur milli leiða sýnir UI nú fyrst og
fremst fljótlegustu leiðina efst. En markmið Ferðaveðursins er ekki bara að
velja hraðasta veginn; notandi ætti líka að geta séð strax hvaða leið er með
best eða verst veðurskilyrði.

**Vandamál:** Route-option listinn getur sýnt margar leiðir með tíma og km, en
notandi þarf að velja leið og fara áfram áður en hann sér raunverulega hvað
mest krefjandi veðurskilyrðið er á þeirri leið. Það gerir route-valið of mikið
byggt á ETA, ekki ferðaveðri.

**Ósk:** Sýna á hverju route option spjaldi stutta veður-preview línu sem segir
hvað mest krefjandi veðurskilyrðið er á þeirri leið, þannig að notandi geti
valið út frá veðri strax í leiðarvalinu.

**Við útfærslu:**

- Lesa `Design.md` áður en UI er breytt.
- Halda route-card þéttum og læsilegum; þetta má ekki verða full
  ferðaveður-niðurstaða inni í route picker.
- Fyrsta útgáfa má sýna:
  - status-lit/pillu, t.d. gott/óþægilegt/hættulegt/ófullnægjandi,
  - decisive metric, t.d. `Vindur 9,1 m/s`,
  - mögulega staðsetningu eða fjarlægð, t.d. `mest krefjandi um 42 km frá
    Garðabæ`,
  - og forecast tíma ef pláss leyfir.
- Nota sama deterministic veðurmat og final result, ekki nýja eða ósamræmda
  heuristic.
- Forðast að keyra fulla dýra final forecast fyrir allar leiðir ef það hefur
  óhóflegan kostnað eða latency. Skoða lightweight preview:
  - sample-a færri punkta,
  - endurnýta route geometry og forecast cache,
  - reikna preview aðeins þegar route options eru komnar,
  - eða sýna `Sæki veðurmat...` á route option cards.
- Ef veður-preview krefst fleiri met.no kalla þarf að greina beinan kostnað,
  latency og rate-limit áður en útfært er.
- Preview má ekki telja sem final route calculation í analytics nema það sé
  sérstaklega skilgreint; halda skýrum usage events.
- Ef preview vantar gögn skal sýna `Ófullnægjandi gögn` eða sleppa preview,
  ekki búa til falskt öryggi.
- Passa að selected route og final submit noti sömu route geometry og preview,
  svo notandi fái ekki annað mat eftir að hann smellir `Nota þessa leið`.
- Ekki geyma origin/destination, route geometry eða forecast payloads í
  gagnagrunni fyrir preview án sér privacy/rýni.

**Manual pre-check áður en framkvæmd hefst:**

1. Opna `/vedrid` eða `/auth-mvp/vedrid`.
2. Reikna route options þar sem fleiri en ein leið birtist, t.d. Garðabær ->
   Stóra-borg, Þorlákshöfn eða sambærilegt.
3. Staðfesta að route-option spjöldin sýni nú bara label, description, km og
   tíma, en ekki mest krefjandi veðurskilyrði fyrir hverja leið.
4. Velja eina leið og fara áfram í niðurstöðu.
5. Skrá hvaða gögn final result sýnir um mest krefjandi punkt svo preview geti
   byggt á sama útreikningi.

**Localhost checks for Stebbi eftir breytingu:**

1. Opna `/vedrid` eða `/auth-mvp/vedrid`.
2. Reikna route options með að minnsta kosti tveimur leiðum.
3. Vænt: hvert route option card sýnir stutta veður-preview línu eða
   loading/fallback sem er skýr.
4. Velja leið þar sem preview segir tiltekið decisive metric.
5. Smella `Nota þessa leið`.
6. Vænt: final result er samræmt preview, þ.e. sama route geometry og sama
   megin veður-risk.
7. Prófa leið þar sem ein route hefur betra veður en fljótlegasta leiðin.
8. Vænt: notandi getur séð muninn í route picker án þess að opna allar leiðir
   í sitthvoru lagi.
9. Prófa public user.
10. Vænt: preview brýtur ekki public quota eða rate-limit með ósýnilegum
    mörgum final calculations.
11. Prófa mobile 360-460 px.
12. Vænt: route cards halda sér læsileg, enginn texti flæðir út og primary
    action er áfram skýr.

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

---

#79
## Veður: víxla upphafs- og áfangastað

**Staða:** Bíður

**Stofnað:** 2026-07-11

**Samhengi frá Stebba:** Í Google Maps er lítill reverse-takki milli reitanna
fyrir upphafsstað og áfangastað. Stebbi vill svipaðan "reverse gaur" í fyrsta
skrefi Veðursins, þannig að notandi geti víxlað `Frá` og `Til` án þess að þurfa
að eyða báðum reitum og leita aftur.

**Skjámynd:** Stebbi sendi skjámynd í samtali 2026-07-11 sem sýnir Google Maps
reverse icon milli origin og destination reita. Myndin var ekki aðgengileg sem
staðbundin skrá í workspace þegar atriðið var skráð, þannig hún er ekki vistuð í
`feedback/images/`.

**Vandamál:** Nú þarf notandi líklega að hreinsa og velja staði aftur ef hann
vill skoða sömu leið í öfuga átt. Það er óþægilegt sérstaklega í ferðaveðri þar
sem heimferð og öfug átt getur skipt máli.

**Ósk:** Bæta við aðgengilegum icon-takka milli `Frá` og `Til` í leiðarvalinu
sem víxlar upphafsstað og áfangastað.

**Við útfærslu:**

- Lesa `Design.md` áður en UI er breytt.
- Nota icon-only button með skýru accessible labeli, t.d.
  `Víxla upphafs- og áfangastað`.
- Button á að vera mobile-first, auðvelt að hitta á 360-460 px og ekki valda
  horizontal overflowi eða layout hoppi.
- Víxla skal heilum place-state, ekki bara textanum:
  - `name`,
  - `formattedAddress`,
  - `lat`,
  - `lon`,
  - `placeId` ef til staðar.
- Ef báðir staðir eru valdir skal hreinsa núverandi route options/result sem
  tilheyra gömlu áttinni og sækja eða biðja notanda að sækja leiðarmöguleika
  fyrir nýju áttina í samræmi við núverandi flæði.
- Ef aðeins annar staður er valinn skal swap-a hann yfir í hinn reitinn án þess
  að bila validation.
- Ekki vista nýja staði eða breyta saved places behavior bara vegna swap.
- Fyrir public notendur má swap sjálft ekki telja sem route request; aðeins
  raunveruleg endursókn á leiðarmöguleikum má hafa áhrif á public quota.
- Passa að route analytics, ef til staðar, skrái aðeins raunverulegt route-call,
  ekki UI-swap.
- Allur nýr notendatexti á að fara í `messages/is.json` og `messages/en.json`
  ef núverandi component notar þýðingakerfið.
- Ekki breyta route provider, veðurmati, SQL, RLS, auth eða admin analytics í
  þessu atriði nema það komi óvænt í ljós að núverandi route-selection state
  krefjist þess.

**Manual pre-check áður en framkvæmd hefst:**

1. Opna `/vedrid` óinnskráður og/eða `/auth-mvp/vedrid` innskráður á localhost.
2. Velja tvo staði, t.d. Garðabær -> Akranes.
3. Staðfesta að enginn reverse-takki sé til staðar núna.
4. Prófa hvernig route options/result hegða sér ef staðir eru hreinsaðir og
   valdir aftur í öfugri röð.
5. Athuga hvort state heldur utan um `placeId` eða aðeins hnit/texta, svo
   útfærslan tapi ekki routing fidelity.

**Localhost checks for Stebbi eftir breytingu:**

1. Opna `/vedrid` sem public/óinnskráður notandi.
2. Velja `Frá` og `Til`.
3. Smella reverse-takkanum.
4. Vænt: staðirnir víxlast strax, með nafni og address óbreyttu.
5. Vænt: route options/result frá gömlu áttinni eru ekki sýnd sem þau eigi við
   nýju áttina.
6. Ef appið sækir leiðir sjálfkrafa eftir swap: vænt að loader birtist og nýjar
   leiðir eigi við öfuga átt. Ef appið sækir ekki sjálfkrafa: vænt að notandi
   fái skýra leið til að sækja leiðarmöguleika.
7. Prófa með aðeins `Frá` valið og `Til` tómt.
8. Vænt: selected place færist yfir í hinn reitinn án villu.
9. Prófa með saved/recent place og Google-selected place.
10. Vænt: `placeId` tapast ekki ef það var til staðar.
11. Prófa mobile 360-460 px.
12. Vænt: reverse-takkinn er auðvelt að hitta, enginn texti/controls overlap-a
    og ekkert horizontal overflow.
13. Fyrir public notanda: staðfesta að swap eitt og sér eyði ekki route quota;
    aðeins raunveruleg route-sókn gerir það.

---

#80
## Veður: merkja hættulega eða óhentuga vegkafla

**Staða:** Bíður

**Stofnað:** 2026-07-11

**Samhengi frá Stebba:** Á ferðalagi með hjólhýsi sendi Google Maps Stebba yfir
Öxi/Axarveg, sem var algjörlega galið að keyra með hjólhýsi. Þetta má ekki
vera blindur blettur í Ferðaveðrinu/Ferðalaginu þegar notandi er með hjólhýsi,
kerru eða annan viðkvæman búnað.

**Skjámynd:** Stebbi sendi skjámynd í samtali 2026-07-11 sem sýnir Google Maps
leið frá Egilsstöðum til Hafnar sem fer yfir Öxi/Axarveg. Myndin var ekki
aðgengileg sem staðbundin skrá í workspace þegar atriðið var skráð, þannig hún
er ekki vistuð í `feedback/images/`.

**Vandamál:** Route provider getur valið leið sem er tæknilega styttri eða
fljótlegri, en óhentug eða hættuleg fyrir raunverulega ferð, sérstaklega með:

- hjólhýsi,
- kerru,
- hestakerru,
- stóran bíl,
- vetrarfærð,
- þrönga, bratta, malar- eða fjallvegi.

Ef Teskeið birtir slíka leið án viðvörunar getur notandi fengið falska
öryggistilfinningu, jafnvel þótt veðurgildin sjálf séu rétt.

**Ósk:** Bæta við route-safety layer sem getur merkt hættulega eða óhentuga
vegkafla og látið route-val, route-kort og niðurstöðu sýna skýra viðvörun.

Fyrsta concrete dæmi:

- `Öxi` / `Axarvegur` / leið 939 ef Google sendir notanda þar með hjólhýsi eða
  sambærilegan búnað.

**Vörustefna:** Þetta á ekki að vera nýr route provider. Þetta er
öryggis-/suitability-lag ofan á leiðirnar sem provider skilar.

**Við útfærslu:**

- Byrja einfalt með curated registry yfir þekkta áhættukafla.
- Ekki reyna að leysa allt Ísland í fyrsta fasa; byrja með fáum staðfestum
  dæmum sem skipta miklu máli.
- Hver áhættukafli þarf að hafa:
  - auðkenni,
  - notendavænt heiti, t.d. `Öxi`,
  - möguleg vegheiti/route labels, t.d. `Axarvegur`, `Leið 939`,
  - gróf hnit eða polyline/bounds til að match-a leið,
  - severity eða suitability per equipment profile,
  - skýra íslenska skýringu.
- Nota núverandi búnaðarstillingar eftir fremsta megni:
  - engin kerra,
  - generic trailer,
  - tent trailer,
  - folding camper,
  - caravan/hjólhýsi,
  - horse trailer.
- Fyrir hjólhýsi/kerru þarf Öxi að flaggast sem mjög óhentug eða hættuleg,
  nema Stebbi ákveði annað síðar.
- Route option card á að geta sýnt merki eins og:
  - `Óhentug með hjólhýsi`,
  - `Varasamur vegkafli`,
  - `Fer um Öxi`.
- Kortið ætti síðar að geta merkt kaflann sjónrænt ef routing/polyline gögnin
  leyfa það.
- Ef fljótlegasta leiðin inniheldur varasaman kafla og annar öruggari
  valkostur er til, má öruggari valkostur fá skýrari framsetningu eða
  recommendation, jafnvel þótt hann sé aðeins lengri.
- Ekki fela route option alveg í fyrsta fasa nema hún sé augljóslega
  óboðleg; betra er að vara skýrt við og leyfa notanda að sjá hvers vegna.
- Viðvörunin þarf að vera aðskilin frá veðurmati:
  - veður getur verið gott,
  - en vegkaflinn samt óhentugur m.v. búnað.
- Ekki kalla þetta veðurhættu nema veðrið sjálft sé hættan.
- Skoða hvort gögn frá Vegagerðinni geti síðar styrkt registry, en byrja má á
  curated lista ef enginn stöðugur API/data source er tilbúinn.
- Ekki geyma notendagögn, hnit notenda eða route payloads í gagnagrunni fyrir
  þetta atriði nema sérstök privacy/schema-rýni fari fram.
- Engin SQL í fyrsta fasa nema Claude/Codex rökstyðji skýrt af hverju registry
  eigi að vera gagnagrunnsdrifið strax.
- Allur nýr notendatexti á að fara í `messages/is.json` og `messages/en.json`
  ef snert er á UI.
- Lesa `Design.md` áður en UI er útfært.

**Tæknilegar pælingar:**

- Route matching má byrja með einfaldri label/name detection ef Google route
  description/legs innihelda `Axarvegur`, `Öxi` eða `939`, en það er líklega
  ekki nóg til lengri tíma.
- Betra langtímalag er að match-a route polyline við bounding box eða
  segment-polyline fyrir þekkta kafla.
- Þarf að passa að `Hringurinn`, `Hellisheiði`, route families og curated vias
  verði ekki ruglað saman við dangerous-road registry.
- Suitability layer ætti að geta skilað structured niðurstöðu:

```ts
type RouteSafetyFlag = {
  id: string
  label: string
  severity: 'info' | 'caution' | 'danger'
  appliesTo: TrailerKind[]
  explanation: string
}
```

Nákvæmt type á að fylgja codebase-mynstrum þegar útfært er.

**Manual pre-check áður en framkvæmd hefst:**

1. Opna `/vedrid` eða `/auth-mvp/vedrid`.
2. Velja búnað sem líkist hjólhýsi/caravan.
3. Reikna leið sem Google getur sent yfir Öxi/Axarveg, t.d. Egilsstaðir ->
   Höfn eða sambærilega leið sem fer um leið 939.
4. Staðfesta hvernig núverandi route option lýsir leiðinni:
   - route label,
   - description,
   - polyline,
   - hvort `Axarvegur`, `Öxi` eða `939` koma fram í provider payload.
5. Prófa sama route með `engin kerra` til að sjá hvort viðvörunin eigi að vera
   mildari eða ekki birt.

**Localhost checks for Stebbi eftir breytingu:**

1. Opna `/vedrid` eða `/auth-mvp/vedrid`.
2. Velja `hjólhýsi` eða sambærilegan búnað í veðurmörkum/búnaði.
3. Reikna leið sem fer yfir Öxi/Axarveg.
4. Vænt: route option sem fer um Öxi sýnir skýra viðvörun, t.d.
   `Óhentug með hjólhýsi` eða sambærilegt.
5. Vænt: niðurstaðan ruglar þessu ekki saman við veðurmat; notandi sér að þetta
   er vegkafla-/búnaðarviðvörun.
6. Ef önnur leið er í boði sem sleppir Öxi, vænt að hún sé auðvelt að bera
   saman við áhættuleiðina.
7. Velja `engin kerra` og reikna sömu leið.
8. Vænt: viðvörun er annaðhvort mildari eða ekki sýnd, eftir skilgreindri
   reglu.
9. Prófa mobile 360-460 px.
10. Vænt: warning badge/texti veldur ekki horizontal overflowi, overlap-i eða
    of mikilli þyngd í route option card.
11. Prófa public user ef `WEATHER_PUBLIC_ENABLED=true`.
12. Vænt: merkingin virkar án þess að skrifa notendagögn eða nota auka quota
    nema route-sóknin sjálf sé raunverulegt route call.

---

#87
## Veður: auglýsingahamur í kringum keyrðar leiðir

**Staða:** Bíður

**Stofnað:** 2026-07-12

**Samhengi frá Stebba:** Byrja að byggja auglýsingaham í kringum leiðirnar sem
eru keyrðar hverju sinni. Pæling frá Stebba: kannski er best að auglýsendur noti
hreinlega Teskeiðarnotanda sinn til að búa til auglýsingu og setja auglýsinguna
niður á hnit.

**Vandamál / tækifæri:** Ferðalagið veit hvaða leið notandi er að skoða og gæti
síðar sýnt gagnlegar, staðbundnar auglýsingar eða tilboð nálægt leiðinni. Þetta
getur orðið tekjuleið, en snertir staðsetningargögn, notendatraust, mögulegan
auglýsenda-aðgang, moderation, billing og skýra aðgreiningu auglýsinga frá
öryggis- og veðurupplýsingum.

**Ósk:** Móta fyrsta örugga auglýsingaham fyrir route-tengdar auglýsingar, án
þess að geyma óþarfa staðsetningarferla notenda eða rugla saman auglýsingum og
ferðaveðurmati. Fyrsta vörupæling er að auglýsendur séu venjulegir eða sérstakir
Teskeið-notendur sem geta búið til auglýsingu, sett hana á hnit eða svæði og
látið hana birtast þegar route fer nálægt.

**Vörustefna / pælingar:**

- Byrja sem product discovery / plan áður en kóði er skrifaður.
- Gera ráð fyrir að auglýsing sé merkt mjög skýrt sem auglýsing.
- Auglýsing má ekki líta út eins og öryggisráð, veðurviðvörun eða route-safety
  recommendation.
- Auglýsingar eiga að vera gagnlegar í samhengi ferðar, t.d. þjónusta,
  viðkomustaðir eða tilboð nálægt leið.
- Það er líklega eðlilegt að auglýsendur noti Teskeið-aðgang sinn sem grunn, en
  þarf að skilgreina hvort þeir séu:
  - venjulegir notendur með auglýsenda-flaggi,
  - sérstakt role,
  - admin-samþykktir auglýsendur,
  - eða með sér auglýsenda-dashboard síðar.
- Fyrsti fasi má vera handstýrður/admin-samþykktur frekar en full self-serve
  auglýsingakerfi.

**Við útfærslu / discovery:**

- Skilgreina lágmarks gagnamódel áður en SQL er skrifað:
  - advertiser owner/user id,
  - campaign/ad id,
  - title/copy/media,
  - hnit eða geo-svæði,
  - radius/bounds,
  - active dates,
  - status/moderation,
  - landing URL eða internal action,
  - disclosure/label.
- Ákveða hvort auglýsingar séu matchaðar við route polyline á server eða client.
- Forðast að geyma nákvæmar route queries eða route geometry notenda í
  auglýsinga-analytics nema sérstök privacy-rýni sé samþykkt.
- Ef mælingar eru nauðsynlegar skal byrja á privacy-preserving aggregate metrics,
  ekki raw origin/destination eða user-level travel history.
- Skilgreina hvort auglýsendur megi sjá impressions/clicks aðeins í aggregate.
- Skilgreina moderation áður en self-serve auglýsingar fara live.
- Skilgreina billing/kostnað síðar; ekki byrja á greiðslukerfi nema Stebbi
  ákveði það sérstaklega.
- Lesa `Design.md` áður en auglýsingabirting eða auglýsenda-UI er hannað.
- Allur notendatexti á að fara í `messages/is.json` og `messages/en.json`.

**Öryggi, privacy og traust:**

- Ekki leka notendaleiðum, uppruna, áfangastöðum eða nákvæmum hnitum til
  auglýsenda.
- Ekki veita auglýsendum aðgang að öðrum notendagögnum.
- Ef auglýsingar tengjast user accounts þarf RLS/policies að tryggja að
  auglýsandi sjái aðeins eigin auglýsingar og aggregate metrics sem hann má sjá.
- Admin/moderation þarf að geta slökkt á auglýsingu án þess að eyða gögnum.
- Auglýsingar mega ekki yfirgnæfa eða rugla ferðaveðurmat, route-safety warnings
  eða neyðar-/öryggisupplýsingar.
- Ef SQL/migration þarf skal gera sér plan með RLS, grants, rollback og
  production-risk áður en nokkuð er keyrt.
- Ef billing eða ytri greiðslukerfi kemur við sögu þarf sér security- og
  cost-review.

**Manual pre-check áður en framkvæmd hefst:**

1. Kortleggja hvar Ferðalagið sýnir route options, final result, map,
   spápunktalista og route detail.
2. Ákveða hvaða svæði gæti tekið við auglýsingu án þess að trufla weather/safety
   information.
3. Skoða hvort núverandi usage/admin events geymi eitthvað sem mætti ekki nota í
   auglýsinga-analytics.
4. Staðfesta hvort fyrsta útgáfa eigi að vera:
   - aðeins product plan,
   - admin-curated demo,
   - eða raunverulegt advertiser self-serve.
5. Staðfesta hvaða gögn má geyma og hvaða gögn má alls ekki geyma.

**Localhost checks for Stebbi eftir framtíðarbreytingu:**

1. Opna `/vedrid` eða `/auth-mvp/vedrid`.
2. Reikna leið sem fer nálægt test-auglýsingu.
3. Vænt: auglýsing birtist skýrt merkt sem auglýsing og truflar ekki
   veður-/öryggisniðurstöðu.
4. Reikna leið sem fer ekki nálægt auglýsingunni.
5. Vænt: auglýsing birtist ekki.
6. Prófa mobile 360-460 px.
7. Vænt: enginn horizontal overflow, overlap eða ruglingur milli auglýsingar og
   route-safety/veðurviðvarana.
8. Prófa sem auglýsandi ef advertiser UI verður til.
9. Vænt: auglýsandi getur aðeins séð og breytt eigin auglýsingum.
10. Prófa sem annar notandi.
11. Vænt: annar notandi sér ekki advertiser-admin gögn.
12. Ef metrics eru sýnd: staðfesta að þau séu aggregate og leki ekki
    origin/destination, route geometry eða notendahnitum.

---

#88
## Veður: fuzzy staðarleit og staðfesting á korti

**Staða:** Bíður

**Stofnað:** 2026-07-15

**Samhengi frá Stebba:** Þegar notandi velur stað sem er ekki nákvæmlega úr
fellilistanum þurfum við að skila fuzzy leit og helst setja niður pinna á kort
og leyfa notandanum að velja réttan stað.

**Vandamál:** Núverandi staðarval getur orðið brothætt ef notandi skrifar stað
sem passar ekki nákvæmlega við tillögu í fellilista. Þá er hætta á að ferðaveður
reiknist fyrir rangan stað, að notandi skilji ekki hvaða staður var valinn, eða
að route-sókn mistakist þótt notandinn hafi slegið inn skiljanlegt staðarnafn.

**Ósk:** Bæta við fuzzy staðarleit og staðfestingarflæði þar sem Teskeið stingur
upp á líklegum stöðum, sýnir pinna á korti og leyfir notanda að staðfesta eða
leiðrétta stað áður en leið og veðurmat eru reiknuð.

**Við útfærslu:**

- Kortleggja núverandi staðarleit og route-selection flow áður en breyting er
  hönnuð:
  - `Frá` og `Til` input,
  - autocomplete/fellilista,
  - staðfest placeId/hnit,
  - route options,
  - public vs authenticated flow.
- Skilgreina fallback þegar texti passar ekki nákvæmlega:
  - fuzzy niðurstöður í lista,
  - kort með pinna á líklegasta stað,
  - möguleiki að velja aðra tillögu,
  - möguleiki að færa pinna eða staðfesta hnit ef það hentar.
- Forðast að kalla Google/route provider of oft:
  - debounce á leit,
  - ekki route-reikna fyrr en staður er staðfestur,
  - varðveita placeId/hnit þegar notandi velur tillögu.
- Staðfestingarviðmót þarf að vera mobile-first:
  - enginn óæskilegur zoom í input,
  - enginn horizontal overflow,
  - kort og listi mega ekki troða hvoru öðru út,
  - skýr pending/loading state við leit og staðfestingu.
- Ef kortapinni verður færanlegur þarf að skilgreina hvort reverse geocode er
  keyrt og hvernig það er rate-limitað/cache-að.
- Allur notendatexti skal fara í `messages/is.json` og `messages/en.json`.
- Lesa `Design.md` áður en UI er hannað eða útfært.

**Öryggi, kostnaður og gögn:**

- Ekki senda fleiri Google/route provider köll en nauðsynlegt er; fuzzy leit má
  ekki verða kostnaðarhola.
- Ekki geyma raw leitarsögu, hnit eða route queries notenda nema sérstök
  privacy-rýni og samþykki liggi fyrir.
- Ekki birta API lykla í client umfram núverandi browser-key notkun.
- Ef server-side geocoding er notað þarf að passa rate limiting, cache og
  villumeðhöndlun.
- Public weather flow þarf sérstaka abuse-vörn svo óinnskráðir notendur geti
  ekki notað fuzzy leit til að keyra upp kostnað.

**Manual pre-check áður en framkvæmd hefst:**

1. Opna `/vedrid` eða `/auth-mvp/vedrid`.
2. Prófa að slá inn stað sem er nákvæm tillaga úr fellilistanum.
3. Prófa að slá inn stað sem er nálægt en ekki nákvæmur, t.d. með stafsetningar-
   eða beygingarmun.
4. Prófa óljóst staðarnafn sem gæti átt við fleiri staði.
5. Skrá nákvæmlega hvað núverandi UI gerir:
   - birtir það engar niðurstöður,
   - velur það rangan stað,
   - leyfir það frjálsan texta án hnita,
   - eða failar route-reikning?
6. Meta hvort núverandi Google Places/Maps provider hefur nú þegar næga fuzzy
   getu sem þarf bara betri UI utan um.

**Localhost checks for Stebbi eftir framtíðarbreytingu:**

1. Opna `/vedrid` eða `/auth-mvp/vedrid` á mobile breidd 360-460 px.
2. Slá inn nákvæmt staðarnafn og velja tillögu.
3. Vænt: núverandi flæði virkar áfram og leið reiknast rétt.
4. Slá inn fuzzy/ónákvæmt staðarnafn.
5. Vænt: notandi fær skýrar tillögur og/eða kort með pinna áður en leið er
   reiknuð.
6. Velja tillögu.
7. Vænt: pinni og texti sýna hvaða staður verður notaður.
8. Staðfesta stað.
9. Vænt: route options og veðurmat reiknast fyrir staðfest hnit/placeId.
10. Prófa óljóst staðarnafn með mörgum mögulegum niðurstöðum.
11. Vænt: notandi neyðist ekki í rangan stað; það er skýrt hvernig velja má rétt.
12. Prófa að hætta við eða breyta vali eftir að pinni birtist.
13. Vænt: UI fer aftur í leit/stillingu án bilaðs state.
14. Prófa public flow ef `WEATHER_PUBLIC_ENABLED=true`.
15. Vænt: rate-limit/cost-vörn heldur, og engar óþarfa route- eða geocode-kallanir
    fara af stað áður en staður er staðfestur.

---

#89
## Veður: spjall per live punkt og síðar vegakafla

**Staða:** Bíður

**Stofnað:** 2026-07-15

**Samhengi frá Stebba:** Spjall um veðrið á ákveðnum vegaköflum sem notendur
geta póstað inn á, og að það sé vegakafla-specific. Fyrsti góði áfanginn eftir
að Vegagerðin er komin inn er spjall per live Vegagerðarpunkt, því það er
nærtækara fyrir nústöðuna. Veðurstofustöðvar geta verið fallback eða viðbót þar
sem Vegagerðarpunktar vantar.

**Vandamál:** Veðurspár og mælingar segja ekki alltaf alla söguna fyrir akstur.
Notendur geta haft gagnlega nýlega reynslu af ákveðnum vegaköflum, t.d.
hálku, hviðum, skyggni, skafrenningi, kerru-/hjólhýsaáhættu eða aðstæðum sem
ekki sjást strax í spágögnum. Ef þetta er sett í almennt spjall tapast samhengið
við vegakaflann og verður erfitt að nýta í Ferðalaginu.

**Ósk:** Þegar Vegagerðin-live punktarnir eru komnir inn, byrja á spjalli eða
stuttum notendatilkynningum per live Vegagerðarpunkt, þar sem notendur geta
póstað inn nýlegri reynslu eða athugasemdum um aðstæður í nánd við punktinn.
Þetta er meira "nústaðan" en spá og passar því vel við notendaspjall. Þar sem
Vegagerðarpunktar vantar má nota Veðurstofustöðvar sem fallback/viðbót. Síðar má
tengja sömu punkta/stöðvar við canonical vegakafla eða leiðir, en v1 á ekki að
bíða eftir fullu vegakafla-módeli.

**Við útfærslu:**

- Fyrsti áfangi eftir að Vegagerðin er komin inn er per live Vegagerðarpunkt:
  - ein umræða eða færslulisti per stöðugan Vegagerðar live-punkt/road-weather
    point id,
  - birtist þar sem Vegagerðarpunktar eru sýndir í Ferðalaginu/Elta veðrið,
  - hentar sérstaklega fyrir "nústaðan" þar sem Vegagerðin er mæling/staða frekar
    en forecast.
- Veðurstofustöðvar eru fallback/viðbót:
  - ein umræða eða færslulisti per `vedurstofan_stations.station_id`,
  - birtist þar sem Veðurstofustöðvar eru sýndar ef enginn betri Vegagerðar-live
    punktur er til,
  - má síðar tengja við vegakafla þegar canonical road-segment módelið liggur
    fyrir.
- Byrja samt á product/design rýni áður en kóði er skrifaður:
  - hvað telst vegakafli,
  - hvort kaflar komi úr curated lista, route polyline segmentum eða Vegagerðar-
    gögnum,
  - hvar í Ferðalaginu spjallið birtist,
  - hvort þetta er "spjall", "athugasemdir", "tilkynningar" eða blanda.
- Fyrir v1 þarf Vegagerðar live-punktur eða Veðurstofustöð að vera canonical
  entity/stöðugur lykill. Fyrir seinni vegakafla-útgáfu þarf vegakafli líka að
  vera canonical entity, ekki raw route geometry frá hverjum notanda.
- Fyrsta útgáfa ætti líklega að vera einfalt:
  - velja eða auto-matcha vegakafla,
  - skrifa stutta athugasemd,
  - sýna nýlegustu athugasemdir fyrir þann kafla,
  - merkja aldur færslu skýrt,
  - möguleiki að report-a eða fela óviðeigandi efni.
- Skoða hvernig per-live-punkt/per-stöðva spjall tengist #80 (`merkja hættulega
  eða óhentuga vegkafla`) og Vegagerðar-layeri.
- Ekki láta notendaspjall trompa spá/mælingar sem öryggisráðgjöf. UI þarf að
  segja skýrt að þetta séu notendaupplýsingar, ekki opinber mæling.
- Meta hvort notandi eigi að geta póstað:
  - frjálsan texta,
  - predefined tags, t.d. `hálka`, `hviður`, `slæmt skyggni`, `fært`, `ófært`,
  - mynd eða ekki,
  - aðeins meðan route er virk eða líka úr sérstakri vegakaflasíðu.
- Lesa `Design.md` áður en UI er hannað eða útfært.
- Allur notendatexti skal fara í `messages/is.json` og `messages/en.json`.

**Öryggi, privacy og traust:**

- Ekki geyma eða birta nákvæma notendastaðsetningu sem hluta af spjallinu. Í v1
  á færsla að tengjast Vegagerðar live-punkti eða Veðurstofustöð, ekki
  GPS-staðsetningu notandans, nema Stebbi samþykki síðar sérstaka privacy-rýni.
- Ekki birta raw origin/destination eða route queries annarra notenda.
- Ef færslur tengjast user account þarf RLS að tryggja að notendur geti aðeins
  breytt/eytt eigin færslum, nema admin/moderator.
- Það þarf moderation/reporting áður en þetta fer til allra:
  - spam,
  - persónuupplýsingar,
  - villandi eða hættulegar ráðleggingar,
  - dónaskapur/áreitni,
  - auglýsingar í dulargervi.
- Setja þarf rate limit á póstanir og mögulega cooldown per user/per vegakafla.
- Ef anonymous/public posting kemur til greina þarf sér abuse-rýni. Fyrsta útgáfa
  ætti líklega að krefjast innskráningar.
- Færslur þurfa skýran retention/aldur: veðurupplýsingar eldast hratt og mega
  ekki líta út eins og nýjar.
- Admin þarf að geta falið eða eytt færslum án þess að veikja auditability.
- Ef SQL/migration þarf skal gera sér plan með RLS, grants, rollback og
  production-risk áður en nokkuð er keyrt.

**Manual pre-check áður en framkvæmd hefst:**

1. Kortleggja hvar Ferðalagið þekkir route polyline, route options,
   Veðurstofupunkta, met.no punkta og Vegagerðar live-punkta.
2. Ákveða hvernig v1 notar Vegagerðar live-punkt id sem aðal umræðu-lykil.
3. Ákveða hvort `vedurstofan_stations.station_id` verði fallback/viðbót þegar
   Vegagerðarpunktur vantar.
4. Ákveða hvað er minnsta gagnlega tengingin frá live-punkti/stöð yfir í
   vegakafla síðar.
5. Skoða hvort til sé nú þegar curated route/segment abstraction sem má
   endurnýta.
6. Ákveða hvort notendafærslur eigi að birtast:
   - á route-result,
   - í öllum spápunktum,
   - á Vegagerðar-live-punktaspjöldum,
   - á Veðurstofustöðvaspjöldum,
   - á sér vegakafla detail,
   - eða aðeins sem "notendur segja" viðvörun.
7. Ákveða hvort fyrsta útgáfa eigi að vera feature-flagged og fyrir hvaða
   notendur.
8. Skilgreina moderation og reporting áður en data model er fastneglt.
9. Taka þetta beint eftir að Vegagerðin-live punktarnir eru komnir inn, svo
   spjallið byggi á nústöðu fremur en aðeins spá.

**Localhost checks for Stebbi eftir framtíðarbreytingu:**

1. Opna `/auth-mvp/vedrid` með notanda sem hefur feature access.
2. Reikna leið sem sýnir Vegagerðar live-punkta við leiðina.
3. Vænt: UI sýnir spjall/athugasemdir tengdar við tiltekinn Vegagerðar live-punkt
   án þess að rugla veðurmatið sjálft.
4. Skrifa stutta færslu á live-punkt.
5. Vænt: færslan birtist á sama live-punkti með skýrum aldri og
   notendamerkingu.
6. Reikna aðra leið sem sýnir ekki sama live-punkt.
7. Vænt: færslan birtist ekki þar.
8. Prófa sem annar innskráður notandi.
9. Vænt: annar notandi getur séð birta færslu ef hún er public fyrir kaflann,
   en getur ekki breytt eða eytt henni.
10. Prófa report/fela ef moderation UI er komin.
11. Vænt: tilkynnt/falin færsla hagar sér samkvæmt moderation-reglu.
12. Prófa mobile 360-460 px.
13. Vænt: enginn horizontal overflow, spjallið tekur ekki yfir route/safety
    niðurstöðuna og touch targets eru nothæf.
14. Prófa gamla færslu.
15. Vænt: aldur og úrelding eru augljós, svo notandi ruglar henni ekki saman við
    nýjustu veður- eða vegaupplýsingar.

---

#90
## Veður: eigið Íslandsleiðarkerfi og vegkaflagrunnur

**Staða:** Bíður

**Stofnað:** 2026-07-18

**Samhengi frá Stebba:** Alvarlega íhuga að búa til eigið leiðarkerfi í stað
þess að halda áfram að rembast við Google Routes API. Teskeið er að fókusa á
Ísland, langar landsleiðir, veður, vegkafla og ferðaleiðir milli byggðakjarna,
ekki nákvæma götu-til-götu navigation í öllum heiminum.

**Vandamál:** Google Routes er sterkt sem almenn navigation-þjónusta, en fyrir
Teskeiðar-veðrið höfum við ítrekað lent í því að þurfa að smíða ofan á
niðurstöðurnar:

- curated leiðir um Hólmavík, Öxi, Hellisheiði og fleiri vegkafla;
- control points til að ná beygjum, fjörðum og fjallvegum rétt;
- route-safety flags fyrir vegkafla sem eru varasamir með eftirvagna;
- provider-station matching við route geometry;
- cache/hitamap-pælingar um hvaða vegkafla fólk er að skoða;
- þörf á að sýna landshluta-, vegkafla- og aðstæðuyfirlit áður en notandi velur
  nákvæma leið.

Ef við höldum áfram að nota Google Routes sem eina source of truth fyrir alla
leiðarfræði gæti Teskeið endað í endalausum sérreglum utan um provider sem er
ekki hannaður fyrir okkar þrönga Íslands- og veðurkontekst.

**Ósk:** Rannsaka og hanna eigin einfalt Íslandsleiðarkerfi / vegkaflagrunn fyrir
Teskeið, þar sem við eigum canonical vegkafla, tengingar, control points,
provider-station matching, hættumerkingar og leiða-cache. Kerfið þarf ekki að
vera nákvæmt niður í götu; það þarf að vera nógu gott fyrir langar leiðir,
ferðaveður, vegakafla, stöðvar, púlsgögn og yfirlit yfir Ísland.

**Vörustefna:**

- Byrja sem discovery/architecture áður en kóði er skrifaður.
- Google Routes má áfram vera fallback eða validation provider í fyrstu.
- Markmiðið er ekki að keppa við Google Maps í nákvæmri navigation, heldur að
  Teskeið eigi sitt eigið weather/road-intelligence lag fyrir Ísland.
- Leiðarkerfið á að hjálpa notanda að taka betri ferðaveðurákvörðun, ekki gefa
  fullkomin turn-by-turn fyrirmæli.
- Leiðir þurfa að vera skýrar, mannamálslegar og Teskeiðarlegar:
  `Gegnum Hólmavík`, `Til að sleppa við Öxi`, `Um firðina`,
  `Suðurleið`, `Norðurleið`, o.s.frv.
- Þetta tengist sterklega framtíðar yfirlitskorti, route-cache, interest heatmap,
  Vegagerðarpunktum, Veðurstofustöðvum, Yr samanburði og Veðurpúlsi.

**Við útfærslu / discovery:**

- Kortleggja hvaða gögn við höfum nú þegar:
  - Google route polyline,
  - curated route vias/control points,
  - `routeControlPoints`,
  - `routeCautions`,
  - Veðurstofustöðvar,
  - Vegagerðarpunkta,
  - route-cache/interest heatmap pælingar,
  - vinsælar leiðir og algengar route families.
- Skilgreina einfalt canonical road-segment model:
  - segment id,
  - display name,
  - geometry/control points,
  - connected segments,
  - direction/order,
  - provider stations nearby,
  - known safety flags,
  - route family labels.
- Meta hvort hægt sé að byrja með hand-curated backbone fyrir Ísland:
  - Hringvegurinn,
  - helstu fjallvegir,
  - Vestfirðir,
  - Austfirðir,
  - Suðurland,
  - Norðurland,
  - helstu ferðamannaleiðir.
- Skilgreina hvernig route matching myndi virka:
  - user origin/destination er map-að á næstu canonical node/segment,
  - leið er reiknuð yfir graph,
  - veðurstöðvar og Vegagerðarpunktar eru tengdir við segment,
  - Google Routes má nota til að sannreyna/teikna eða fallback-a þar sem graph
    vantar.
- Skilgreina hvernig route cache og interest heatmap nýtir segment-level gögn:
  - telja áhuga á vegkafla, ekki bara nákvæmu Reykjavík -> Akureyri query;
  - geta séð hvaða landshluta og vegkafla fólk er að spá í;
  - forðast að geyma nákvæm heimilisföng eða persónulegar route queries.
- Meta hvort open data sé til og leyfilegt:
  - Vegagerðin/open road data,
  - OpenStreetMap/OSM,
  - eigin curated JSON/TS registry til að byrja,
  - leyfi, attribution og cache-reglur.
- Huga að því hvort leiðarkerfið eigi að búa í kóða fyrst eða Supabase síðar.
  Fyrsti fasi má líklega vera typed registry í `lib/weather/` ef það heldur
  scope einföldu, en langtímaútgáfa gæti þurft DB.
- Ekki henda núverandi Google integration út fyrr en nýr grunnur er sannreyndur.
  Fasa þetta þannig að Google og eigið leiðarkerfi geti keyrt hlið við hlið.

**Tengist:**

- #70 Veður: leiðartími og route-provider samanburður
- #80 Veður: merkja hættulega eða óhentuga vegkafla
- #82 Veður: `Af stað!` fyrir custom/curated leiðir
- #83 Veður: veður-risk á route option spjöldum
- #89 Veður: spjall per live punkt og síðar vegakafla
- route-cache og interest heatmap handoff:
  `ai-handoff/2026-07-17-0627-todo-086-v382-codex-route-cache-and-interest-heatmap.md`
- deferred Vík/Reynisfjall/route-section vandamál:
  `ai-handoff/2026-07-17-0930-todo-086-v398-claude-vik-sections-deferred-verified-handoff.md`
- deferred Öxi/suðurleið/Höfn vandamál:
  `ai-handoff/2026-07-17-1039-todo-086-v409-deferred-oxi-south-coast-reynisfjall.md`

**Öryggi, kostnaður og gögn:**

- Ekki geyma nákvæm heimilisföng eða persónuleg leiðarhnit nema sérstök
  privacy-rýni og samþykki liggi fyrir.
- Route-interest heatmap á að vera aggregate og helst segment-level, ekki
  user-level.
- Ekki búa til navigation-kerfi sem gefur til kynna opinbera færð eða öryggi
  nema gögnin styðji það. Texti þarf að vera skýr: Teskeið hjálpar til við
  ákvörðun, en notandi ber ábyrgð og á að athuga Vegagerðina.
- Ef OSM/open data er notað þarf að staðfesta leyfi, attribution og cache-reglur.
- Ef Google er áfram notað sem fallback þarf að virða API-skilmála, caching
  reglur og kostnað.
- Ekki veikja núverandi public/auth gating, Supabase RLS eða feature flags.
- Ef SQL/DB registry kemur síðar þarf sér migration-plan með RLS, grants og
  rollback áður en nokkuð er keyrt.

**Manual pre-check áður en framkvæmd hefst:**

1. Kortleggja núverandi leiðarlógík:
   - Google route fetch,
   - curated vias,
   - control points,
   - route caution detection,
   - provider station matching,
   - route options UI.
2. Skrá 10-20 leiðir sem hafa valdið vandræðum eða eru mikilvægar:
   - Reykjavík -> Ísafjörður,
   - Ísafjörður -> Akureyri,
   - Höfn -> Egilsstaðir,
   - Reykjavík -> Egilsstaðir,
   - Vík -> Hella,
   - Höfn -> Þorlákshöfn,
   - fleiri helstu landsleiðir.
3. Fyrir hverja leið: bera saman hvað Google skilar núna, hvaða curated leiðir
   við viljum bjóða, hvaða vegkaflar skipta máli og hvaða stöðvar ættu að
   tengjast.
4. Staðfesta hvort einfalt graph yfir helstu vegi myndi leysa 80% vandans án
   þess að við þurfum fulla götunákvæmni.
5. Meta kostnað og maintenance:
   - hand-curated registry,
   - OSM import,
   - Google fallback,
   - Supabase cache,
   - prófunarbyrði.
6. Ákveða fyrsta minnsta áfanga:
   - aðeins architecture note,
   - typed registry fyrir 5-10 critical segments,
   - route matching við existing Google polyline,
   - eða eigin graph prototype á bakvið flag.

**Localhost checks for Stebbi eftir framtíðarbreytingu:**

1. Opna `/vedrid`.
2. Prófa nokkrar langar landsleiðir sem áður þurftu curated sérreglur.
3. Vænt: notandi sér mannamálslegar leiðir sem passa Íslandskontekst, t.d.
   `Gegnum Hólmavík` eða `Til að sleppa við Öxi`.
4. Vænt: Veðurstofu- og Vegagerðarpunktar tengjast réttum vegkafla, ekki aðeins
   hráum Google polyline-punktum.
5. Vænt: route-safety flags birtast á réttum route options.
6. Prófa leið þar sem Google fallback er enn notað.
7. Vænt: fallback virkar án þess að notandi upplifi brotið eða tvöfalt flæði.
8. Prófa public og innskráðan notanda.
9. Vænt: public sér opin ferðaveðursgögn sem eiga að vera public, innskráður
   heldur sínum stillingum og vistunum.
10. Prófa mobile 360-460 px og desktop.
11. Vænt: route-val, kort, warnings og provider-stöðvar valda ekki overflow,
    overlap eða dauðum loading states.
12. Ef route-interest/heatmap er hluti af fasa: staðfesta að aðeins aggregate
    segment-level gögn séu skráð og að engin nákvæm heimilisföng leki.
