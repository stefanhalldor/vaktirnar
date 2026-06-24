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
| 1   | **#37 `Nýlegt` sýni öll ólesin events og breytingasamhengi** | **Event/Ólesið grunnur.** Gera ólesið að raunverulegum inbox, ekki bara stuttu preview. |
| 2   | **#56 Breyta lánsdagsetningu og skiladegi á samþykktum lánum** | **Event/Ólesið pakki.** Lánveitandi geti breytt `loaned_at` og `due_at` jafnvel þegar lán er samþykkt. Þarfnast SQL/RPC breytinga. |
| 3   | **#38 Event þegar lánaboði er hafnað**                       | **Event/Ólesið pakki.** Bæta decline-eventi og ack/read-state samhliða #37. |
| 4   | **#39 Lánveitandi geti eytt samþykktum hlut**                | **Event/heimildir pakki.** Taka með event payload og delete-heimildir þegar event-grunnurinn er opinn. |
| 5   | **#27 Mýkra lánaboðsflæði**                                  | **Eftir event-grunn.** Full mýking lánaboða byggir á því að #37/#38/#39 séu orðin traust. |
| 6   | **#17 Hugmyndir úr hugmyndabankanum á `/heim`**              | **Heimaskjár pakki.** Skipta væntanlegt-lista í raunverulegar hugmyndir og kosningu; gott að taka með #42. |
| 7   | **#42 Tilbúnar Teskeiðar efst og síðast opnuð fyrst**        | **Heimaskjár pakki.** Gera virkar Teskeiðar efstar og skýrar áður en hugmyndir taka meira pláss á `/heim`. |
| 8   | **#41 Umönnun sem feature-flagged Teskeið**                  | **Feature-card/info quick win.** Sýna sem varlega feature-flagged Teskeið án þess að flytja Umönnun-gögn inn. |
| 9   | **#46 User+pass fallback þegar kóði berst ekki**             | **Auth reliability pakki.** Mikilvægt ef kóðar berast illa, en snertir auth/rate limit/reset og á að vera sér áfangi. |
| 10  | **#7 Langlíf innskráning**                                   | **Auth/session pakki.** Taka með #46 eða strax á eftir, en ekki blanda við láns/event quick wins. |
| 11  | **#22 Hreinsa sýnilegar `/auth-mvp/` slóðir**                | **Route cleanup.** Gera eftir að `/heim`, `/stillingar/*` og loan flæði eru stöðug; þarf redirect- og query-param próf. |
| 12  | **#13 Endurskilgreina hlutverk whitelist/admin-lista**       | **Admin/access ákvörðun.** Ákveða hlutverk listans áður en meira admin UI byggist á honum. |
| 13  | **#33 Fjöldi innskráðra notenda í admin tölfræði**           | **Admin quick win eftir #13.** Einföld talning, en skilgreining og service-role mörk þurfa að vera skýr. |
| 14  | **#10 Gáfuleg opnun tölfræðisíðu**                           | **Admin stats sérpakki.** Server-side heimsóknarrökfræði, race conditions og fallback; ekki opnunarblocker. |
| 15  | **#50 Fjölskyldumeðlimir sem tengsl**                        | **Future Tengsl data.** Bíður þar til Tengsl v1 hefur fengið raunnotkun; snertir viðkvæmari fjölskyldu-/barnagögn. |
| 16  | **#54 Spjall á hverjum lánaða hlut**                         | **Stærri future feature.** Byggir á detail-page access, event/read-state og skýrri privacy ákvörðun. |
| 17  | **#57 Timestamp format í ensku locale**                      | **Tech debt/i18n.** `formatEventTimestamp` notar `kl.` og íslenska orðröð utan messages-template. Lágt forgangsstig. |
| 18  | **#51 Tengja Facebook við prófílinn sinn**                   | **OAuth/secrets sérverk.** Ekki quick win; þarf sérstakt plan, provider-stillingar og privacy-rýni. |

## Vinnupakkar

**Pakki A — `Ólesið`, events og lánaboð:** #37, #38, #39 og síðan #27.
Þessi atriði eiga mjög vel saman: næst er að byggja traustan ólesinn/event grunn
og enda á mýkra lánaboðsflæði.

**Pakki B — heimaskjár og virkar Teskeiðar:** #17, #42 og #41. Þetta mótar hvað
notandi sér fyrst eftir innskráningu: virkar Teskeiðar, hugmyndir og varlega
feature-flagged Umönnun.

**Pakki C — auth reliability:** #46 og #7. Þetta er mikilvægt, en snertir
innskráningu, sessions, reset/rate-limit og öryggi; best sem sérpakki með
sérstakri rýni.

**Pakki D — routes og admin:** #22, #13, #33 og #10. Taka þegar core notendaflæði
eru stöðug, svo canonical slóðir og admin-tölfræði byggist ekki á fljótandi
grunnhegðun.

**Pakki E — stærri framtíðareiginleikar:** #50, #54 og #51. Þetta eru ekki
fyrstu quick wins: þau snerta viðkvæmari gögn, nýja gagnastrúktúra, spjall eða
ytri OAuth provider.

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
## Tengja Facebook við prófílinn sinn

**Staða:** Bíður

**Stofnað:** 2026-06-21

**Samhengi frá Stebba:** Stebbi vill að notandi geti tengt Facebook við
prófílinn sinn.

**Ósk:** Bæta við möguleika fyrir innskráðan notanda að tengja Facebook við
Teskeið-prófílinn sinn.

**Við útfærslu:**

- Skilgreina fyrst hvort Facebook-tenging á að vera aðeins sýnilegur
  prófíl-hlekkur, account-linking fyrir innskráningu, eða bæði.
- Ef þetta er account-linking þarf sérstakt auth-plan áður en kóðavinna hefst.
- Nota öruggt OAuth-mynstur og geyma client secret aðeins server-side.
- Skilgreina hvaða Facebook gögn má sækja og vista. Safna aðeins lágmarksgögnum.
- Passa að Facebook-tenging leki ekki einkagögnum til annarra notenda.
- Skilgreina hvernig notandi getur aftengt Facebook aftur.
- Meta áhrif á núverandi kóða-/OTP-innskráningu og framtíðar
  user+pass fallback (#46), svo Facebook brjóti ekki núverandi auth-flæði.
- Ekki setja Facebook App ID, secret eða redirect URLs í client-kóða eða
  handahófskennda logs.

**Öryggi og gögn:**

- Þetta snertir auth/account-linking, ytri OAuth provider, secrets og
  persónugögn og þarf því sérstakt plan og rýni áður en framkvæmd hefst.
- Ef Supabase Auth provider stillingum þarf að breyta skal fá sérstakt samþykki
  frá Stebba áður en það er gert.

**Prófanir:**

- Innskráður notandi getur tengt Facebook við sinn eigin prófíl.
- Notandi getur aftengt Facebook aftur.
- Annar notandi sér ekki Facebook gögn sem eiga að vera private.
- Núverandi kóða-/OTP-innskráning virkar áfram óbreytt.
- Rangur OAuth callback, hafnað consent og útrunnið state/token fá skýra og
  örugga hegðun.

#37
## `Nýlegt` sýni öll ólesin events og breytingasamhengi

**Staða:** Bíður

**Næsta handoff:** Sjá sameiginlegan pakka fyrir #36, #37, #38, #39 og #40:
`ai-handoff/2026-06-10-1721-todo-036-037-038-039-040-v001-codex-loans-polish-events-package.md`.

**Samhengi:** `Nýlegt` er að verða mikilvæg inngangsleið fyrir #27 mýkra
lánaboðsflæði. Ef þar birtast aðeins þrjú atriði getur notandi misst af ólesnum
events, sérstaklega þegar pending lánaboð eiga að birtast þar.

**Vandamál:** Núverandi hegðun virðist sækja aðeins takmarkaðan fjölda atriða í
`Nýlegt`, líklega þrjú nýjustu. Það gerir `Nýlegt` að stuttu preview-i frekar en
áreiðanlegum ólesnum inbox. Auk þess segir event aðeins að hlutur hafi breyst,
en sýnir ekki endilega breytinguna sjálfa.

**Ósk:** `Nýlegt` eigi að sýna öll events sem notandinn á eftir að lesa. Þegar
notandi smellir á atriði sem var að breytast á hann að sjá hvað breyttist, t.d.
að skiladagsetning hafi verið tekin út og að fyrri skiladagsetning hafi verið
tiltekin dagsetning.

**Við útfærslu:**

- Kortleggja hvar `Nýlegt` setur fjöldatakmörk, meðal annars server-side fetch,
  helper defaults og UI rendering.
- Breyta hegðuninni þannig að öll ólesin events birtist eða, ef tæknilegt þak er
  nauðsynlegt, að notandi sjái skýrt fjölda og geti opnað öll ólesin atriði.
- Hönnun skal halda mobile-first upplifun rólegri þótt mörg ólesin events séu til
  staðar; forðast layout shift, horizontal overflow og of langan fyrsta skjá.
- Skilgreina event-detail/diff payload fyrir breytingar á lánum, þar á meðal
  fyrra og nýtt gildi fyrir heiti, nótu, lánadagsetningu, skiladagsetningu,
  skilað/óskilað state og pending invitation state þar sem við á.
- Ekki setja viðkvæm eða óþörf gögn í event payload. Sérstaklega má recipient
  email ekki leka í client payload, logs eða `Nýlegt`.
- Þegar notandi opnar event skal leiðin sýna viðeigandi samhengi, t.d. detail,
  edit, claim eða highlighted list row, ekki bara generíska síðu ef hægt er að
  gera betur.
- Event sem tengist claim/decline í #27 þarf að ack-ast eða uppfærast þannig að
  sama boð haldist ekki ólesið eftir að notandi hefur tekið afstöðu.
- Halda SQL migrations idempotent og með skýrt rollout/recovery plan ef breyta
  þarf `recent_events` payload eða helper contracti.

**Prófanir:**

- Fleiri en þrjú ólesin events birtast eða eru aðgengileg sem öll ólesin atriði.
- `Lesið`/mark-read fjarlægir aðeins rétt events og þau birtast ekki aftur.
- Breytt skiladagsetning sýnir fyrra og nýtt gildi.
- Fjarlægð skiladagsetning sýnir að dagsetning hafi verið tekin út og hver hún
  var áður.
- Pending lánaboð úr #27 birtist ekki tvöfalt eða týnist í `Nýlegt`.
- Óviðkomandi notandi getur ekki séð event eða payload annars notanda.
- Mobile 360-460 px sýnir mörg ólesin atriði án overlap eða horizontal scroll.

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

#38
## Event þegar lánaboði er hafnað

**Staða:** Bíður

**Næsta handoff:** Sjá sameiginlegan pakka fyrir #36, #37, #38, #39 og #40:
`ai-handoff/2026-06-10-1721-todo-036-037-038-039-040-v001-codex-loans-polish-events-package.md`.

**Samhengi:** Þetta tengist #27 mýkra lánaboðsflæði og #37 event-sögu í
`Nýlegt`. Þegar mótaðili tekur afstöðu til lánaboðs er það mikilvæg breyting
fyrir þann sem sendi boðið.

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
## Lánveitandi geti eytt samþykktum hlut

**Staða:** Bíður

**Næsta handoff:** Sjá sameiginlegan pakka fyrir #36, #37, #38, #39 og #40:
`ai-handoff/2026-06-10-1721-todo-036-037-038-039-040-v001-codex-loans-polish-events-package.md`.

**Samhengi:** Í `Lánað og skilað` getur mótaðili verið búinn að samþykkja boð.
Stebbi vill samt að lánveitandi geti eytt hlutnum ef hann á að hverfa úr
kerfinu.

**Vandamál:** Sem lánveitandi þarf notandi að geta eytt hlut þó að mótaðili sé
búinn að samþykkja. Núverandi réttindi eða UI virðast ekki endilega leyfa það.

**Ósk:** Lánveitandi geti eytt samþykktum hlut. Mótaðilinn á að fá event í
atburðasöguna sína svo eyðingin sé ekki þögul eða ruglingsleg.

**Við útfærslu:**

- Kortleggja núverandi delete-réttindi í UI, server action og SQL/RPC.
- Skilgreina nákvæmlega hver má eyða samþykktum hlut:
  lánveitandi, skráningaraðili, eða báðir eftir skýrum reglum.
- Framfylgja reglunni server-side í RPC/server action, ekki aðeins með földum
  client-hnappi.
- Þegar hlutur er eyddur skal skrá event fyrir mótaðila ef hann er til staðar.
- Event payload má ekki leka recipient email eða óþarfa persónugögnum.
- Ákveða hvort eyddur hlutur birtist sem sögufærsla í `Nýlegt` án þess að hafa
  clickable edit/detail slóð á horfinn hlut.
- Tryggja að eyðing veikji ekki RLS, grants, service-role mörk eða aðgangsmörk
  óviðkomandi notenda.

**Prófanir:**

- Lánveitandi getur eytt samþykktum hlut.
- Mótaðili fær event um eyðinguna.
- Óviðkomandi notandi getur ekki eytt hlut með beinni köllun.
- Recipient email eða önnur óþörf gögn leka ekki í event payload eða logs.
- Eyddur hlutur hverfur úr venjulega lánalistanum en eventið er áfram skiljanlegt.

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

#27
## Mýkra lánaboðsflæði

**Staða:** Bíður eftir áframhaldandi event-feed vinnu í #37 áður en full
útfærsla hefst

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

**Næsta tengda skref:** #37 byggir á #19 server-side event-feed grunninum
svo `Nýlegt` verði örugg og áreiðanleg inngangsleið fyrir framtíðar #27:
`ai-handoff/2026-06-10-0708-todo-019-027-037-v014-codex-nylegt-all-unread-event-detail-plan.md`.

#56
## Breyta lánsdagsetningu og skiladegi á samþykktum lánum

**Staða:** Bíður

**Stofnað:** 2026-06-24

**Samhengi:** Komið upp sem follow-up við #37. Stebbi bað upphaflega um að geta breytt `Lánað` og `Skila fyrir` jafnvel þegar lán er samþykkt (accepted), amk sem sá sem lánaði. Þetta var ekki hluti af #37 scope en tilheyrir sama event/Ólesið pakka.

**Vandamál:** Þegar lán er samþykkt fer edit-síðan í `LoanItemDetailsForm`, sem breytir aðeins nafni og athugasemd. SQL `update_loan_with_diff` stoppar samþykkt lán með `not_editable`. Lánveitandi getur ekki breytt `loaned_at` eða `due_at` eftir samþykki.

**Ósk:** Lánveitandi geti breytt lánsdagsetningu og skiladegi á samþykktum lánum. Breytingarnar eiga að birtast í `Ólesið` hjá mótaðila sem `Breytt lánsdagsetning` og `Breyttur skiladagur` - label-grunnurinn er þegar til frá #37.

**Við útfærslu:**

- Skilgreina nákvæmlega hvaða hlutverks notendur fá leyfi til að breyta dagsetningum á samþykktum lánum (lánveitandi, skráningaraðili, eða báðir).
- Breyta eða bæta við SQL/RPC sem leyfir þessa breytingu án þess að hafa áhrif á önnur heimildarlag.
- Uppfæra `LoanItemDetailsForm` eða búa til nýtt form sem inniheldur dagsetningasvið þegar notandi hefur leyfi.
- Tryggja að mótaðili fái `loan_updated` event með `Breytt lánsdagsetning`/`Breyttur skiladagur` label í `Ólesið`.
- Halda `not_editable` vörn fyrir aðrar aðstæður þar sem hún á við.

**Öryggi:** Framfylgja heimildum server-side í RPC, ekki aðeins í UI. Enginn notandi má breyta dagsetningum á láni sem hann á ekki rétt á að breyta.

**Prófanir:**

- Lánveitandi getur breytt `loaned_at` og `due_at` á samþykktum láni.
- Lántakandi (sem á ekki leyfi) fær viðeigandi villu.
- Mótaðili fær `Breytt lánsdagsetning` / `Breyttur skiladagur` event í `Ólesið`.
- Regression: aðrar heimildar- og breytingareglur breytast ekki.

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
