# TODO

## Forgangsröðun

Þetta yfirlit stýrir vinnuröðinni. Númer atriðanna haldast óbreytt svo eldri
tilvísanir og verkefnasaga rofni ekki.

| Röð | Atriði                                                        | Forgangur og samhengi                                                                                                                                 |
| --- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **#19 Lesnir hlutir birtist ekki aftur sem `Nýlegt`**        | Taka næst: byggja varanlegan server-side `recent_events` grunn svo `Nýlegt` verði áreiðanlegt fyrir allar Teskeiðar, ekki lánasértækan read-state plástur. |
| 2   | **#27 Mýkra lánaboðsflæði**                                  | Taka með #19 sem framtíðarundirbúning: `Nýlegt` verður inngangsleið fyrir pending boð, en full #27 útfærsla bíður eftir event-feed grunni og Codex-rýni. |
| 3   | **#30 Stærra `10,5` og ný favicon-tillaga**                  | Stækka `10,5` á derhúfunni svo það sjáist betur og gera tillögu að favicon sem sýnir bara `10,5`.                                                     |
| 4   | **#22 Hreinsa sýnilegar `/auth-mvp/` slóðir**                | Public notendaslóðir ættu að verða `/heim`, `/minn-profill` og `/lanad-og-skilad`; geymt úr hraðri opnun til að minnka áhættu.                       |
| 5   | **#13 Endurskilgreina hlutverk whitelist/admin-lista**       | Whitelist stýrir ekki lengur public login/loans; ákveða hvort listinn verði framtíðar beta-listi, admin-tól eða verði arkiveraður.                    |
| 6   | **#5 Samræmd mobile app-upplifun**                           | Samræma innskráningu, form, viewport, keyboard og mobile layout sem framhaldsverk eftir opnun nema ný blocker finnist.                                 |
| 7   | **#7 Langlíf innskráning**                                   | Gera session app-líkt og öruggt sem framhaldsverk eftir opnun nema session-hegðun reynist blocker í prófun.                                           |
| 8   | **#17 Hugmyndir úr hugmyndabankanum á `/heim`**              | Skipta disabled `Væntanlegt` listanum út fyrir mobile-first framsetningu með raunverulegum, birtum hugmyndum og kosningarmöguleika.                   |
| 9   | **#10 Gáfuleg opnun tölfræðisíðu**                           | Sjálfstætt admin-atriði sem má taka eftir að notendaaðgangsflæðið er tilbúið.                                                                         |
| 10  | **#33 Fjöldi innskráðra notenda í admin tölfræði**           | Bæta einfaldri notendatalningu við admin tölfræði; skilgreina fyrst hvort telja eigi skráða notendur, virka notendur eða virkar sessions.             |
| 11  | **#34 Meira áberandi `Skrá hlut í láni` takki**              | Gera aðalaðgerðina í `Lánað og skilað` sýnilegri svo nýskráning hlutar sé ekki of falin eða veik í UI.                                                |
| 12  | **#35 Vista-state helst virkt þar til redirect klárast**     | Þegar smellt er á `Vista` birtast punktar fyrst, en takkinn má ekki verða eðlilegur aftur á meðan 2-3 sekúndna redirect-bið stendur yfir.             |
| 13  | **#36 Mannlegra orðalag á lánahlutverki**                    | Breyta `Ég er lánveitandinn` / `Ég er lántakandinn` í náttúrulegra orðalag í lánaskráningu, t.d. `Ég er að lána` / `Ég er að fá lánað`.               |

#19
## Lesnir hlutir birtist ekki aftur sem `Nýlegt`

**Staða:** Bíður

**Núverandi staða 2026-06-09:** Cookie-lausn með per-item lyklum reyndist ekki
nógu áreiðanleg í prófun hjá Stebba. Eftir frekari yfirferð er niðurstaðan að
`Nýlegt` eigi ekki að fá lánasértækan `read-state` plástur, heldur varanlegan
server-side `recent_events` grunn sem getur síðar þjónað öllum Teskeiðum.

**Næsta handoff:** Sjá
`ai-handoff/2026-06-09-2329-todo-019-027-v009-codex-nylegt-event-feed-final-plan.md`.

**Vandamál:** Þegar notandi hefur merkt hlut sem lesinn getur hann birst aftur
sem `Nýlegt`, til dæmis eftir að nýr hlutur er búinn til eða listinn
endurhlaðinn. Þá blandast saman hlutir sem notandi hefur þegar afgreitt og
hlutir sem hann hefur raunverulega ekki séð.

**Ósk:** `Nýlegt` eigi aðeins að sýna hluti sem notandi hefur ekki merkt sem
lesna. Hlutir sem hafa verið merktir lesnir mega ekki koma aftur inn í
`Nýlegt` bara vegna þess að annar hlutur var búinn til eða gögn voru sótt aftur.

**Við útfærslu:**

- Kortleggja hvar `Nýlegt` state og `lesið`/read state eru geymd og uppfærð.
- Tryggja að read state sé varðveitt þegar nýr hlutur er búinn til og þegar
  listi er refetchaður.
- Reikna `Nýlegt` út frá raunverulegu unread/read ástandi notandans, ekki bara
  nýjustu fetch- eða created/updated-röðun.
- Stoppa eða endurvinna ókeyrða `loan_recent_read_state` migration-leið ef hún
  hefur ekki þegar verið keyrð; nota `recent_events` sem framtíðargrunn.
- Bæta regression-prófi þar sem notandi merkir hlut lesinn, býr til nýjan hlut
  og gamli hluturinn birtist ekki aftur sem `Nýlegt`.

#5
## Samræmd mobile app-upplifun á öllu Teskeið.is

**Staða:** Bíður

**Næsta handoff:** Sjá sameiginlegan rýni-fyrst pakka fyrir #30, #5, #7 og #17:
`ai-handoff/2026-06-09-2341-todo-030-005-007-017-v001-codex-mobile-home-identity-review-plan.md`.

**Umfang:** Reglurnar í þessu atriði gilda alls staðar á `teskeid.is`, bæði á
opinberum síðum, innskráningu, prófíl, heimaskjá og inni í öllum Teskeiðum.

**Vandamál:** Í farsíma þysjar vafrinn sjálfkrafa inn þegar notandi slær í
ákveðna innsláttarreiti, meðal annars netfangið á Teskeið-innskráningarsíðunni.
Eftir innslátt þarf notandinn að þysja handvirkt út aftur. Sambærileg
viewport-, keyboard-, overflow- og layout-vandamál mega ekki koma upp annars
staðar á vefnum. Allt `teskeid.is` á að upplifast eins og samræmt mobile app.

**Ósk:**

- Tryggja að engir innsláttarreitir á `teskeid.is` valdi óæskilegu
  mobile-zoom, sérstaklega í Safari/iOS.
- Halda eðlilegri aðgengilegri textastærð og forðast að banna notandanum
  almennt að zooma síðuna.
- Yfirfara öll form og controls á vefnum, þar á meðal netfang, kóða,
  dagsetningar, leit, textarea, select og tengdar auth-síður.
- Endurhanna Teskeið-innskráningarsíðuna samkvæmt `Design.md`, með canonical
  Teskeið-litunum, spacing, typography, controls, focus-visible og
  mobile-first app-upplifun.
- Setja canonical Teskeið-lógóið neðst á `/innskraning`, í sama stærðar- og
  staðsetningarmynstri og á öðrum Teskeið-síðum, og hafa það smellanlegt.
- Áfangastaður lógósins skal ráðast af staðfestri server-side session-stöðu:
  innskráður notandi fer á `/heim`, en óinnskráður notandi fer á forsíðu
  Teskeiðar (`/`). Lausnin má ekki valda client/server hydration-misræmi eða
  sýna rangan áfangastað á meðan session er lesin.
- Ekki láta gamalt Krakkavaktar-lúkk leka inn í Teskeið-innskráninguna.
- Nota reglurnar í `Design.md` sem skyldubundið viðmið fyrir alla nýja og
  breytta skjái á `teskeid.is`.
- Prófa sérstaklega við 360-460 px viewport, með mobile keyboard opið og í
  portrait og landscape þar sem það skiptir máli.
- Staðfesta að enginn texti, hnappur eða input skarist og að síðan haldi réttri
  breidd og scroll-stöðu eftir að lyklaborði er lokað.
- Staðfesta að fixed/sticky controls, modals og neðri aðgerðir fari ekki undir
  mobile keyboard, browser chrome eða safe-area.

#7
## Langlíf innskráning með app-líkri mobile-upplifun

**Staða:** Bíður

**Næsta handoff:** Sjá sameiginlegan rýni-fyrst pakka fyrir #30, #5, #7 og #17:
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

**Næsta handoff:** Sjá sameiginlegan rýni-fyrst pakka fyrir #30, #5, #7 og #17:
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

#34
## Meira áberandi `Skrá hlut í láni` takki

**Staða:** Bíður

**Næsta handoff:** Sjá quick-fix plan fyrir #34 og #35:
`ai-handoff/2026-06-10-0017-todo-034-035-v002-codex-loan-cta-save-redirect-gap-plan.md`.

**Samhengi:** `Skrá hlut í láni` er aðalaðgerðin í `Lánað og skilað`, en Stebbi
vill að hún verði meira áberandi.

**Vandamál:** Aðgerðin er til staðar, en hún grípur ekki augað nógu vel miðað
við mikilvægi hennar. Notandi getur misst af því hvar hann á að byrja að skrá
nýjan hlut í láni.

**Ósk:** Gera `Skrá hlut í láni` takkann sýnilegri og augljósari án þess að
gera síðuna háværa eða klunnalega.

**Við útfærslu:**

- Skoða staðsetningu, stærð, lit, icon og texta takkans á mobile og desktop.
- Tryggja að takkinn sé greinilega primary action á lánalistanum.
- Halda orðalaginu `Skrá hlut í láni`.
- Passa að takkinn virki vel með hamborgaranum, bottom nav og öðrum sticky/fixed
  svæðum.
- Forðast að taka of mikið pláss frá listanum sjálfum á litlum skjám.
- Prófa tóman lista, lista með mörgum hlutum og bæði `Enn í láni`/`Skilað`
  samhengi ef nýja pilluviðmótið er komið.

**Prófanir:**

- Takkinn sést strax eða mjög auðveldlega á lánalistanum á 360-460 px viewport.
- Takkinn er enn aðgengilegur með lyklaborði og skjálesara.
- Enginn horizontal scroll eða overlap verður til.
- Smellur fer á rétta nýskráningarleið.

#35
## Vista-state helst virkt þar til redirect klárast

**Staða:** Bíður

**Næsta handoff:** Sjá quick-fix plan fyrir #34 og #35:
`ai-handoff/2026-06-10-0017-todo-034-035-v002-codex-loan-cta-save-redirect-gap-plan.md`.

**Vandamál:** Þegar Stebbi er að vista nýjan hlut og smellir á `Vista` koma
punktar fyrst á takkann. Síðan verður `Vista` takkinn aftur eðlilegur og það
líða 2-3 sekúndur þangað til redirect gerist og hluturinn sést sem vistaður.
Þessi millitími lætur líta út fyrir að aðgerðin sé búin eða hafi ekki virkað og
getur ýtt undir tvísmelli eða óöryggi.

**Ósk:** Pending/loading-state á að birtast strax og haldast virkt þar til
redirect er klárað eða vistun mistekst.

**Við útfærslu:**

- Kortleggja nýskráningarformið fyrir lánahlut og hvernig `Vista` kallar
  server action.
- Athuga sérstaklega bilið eftir successful server action og áður en
  `router.push`/redirect klárast.
- Setja loading-state samstundis við submit og halda því virku í gegnum
  success-feedback/redirect-biðina.
- Disable-a `Vista` meðan vistun og redirect-bið stendur yfir til að koma í veg
  fyrir tvísmelli.
- Sýna spinner, loader eða skýran texta sem passar við núverandi Teskeið UI.
- Endurheimta takkann rétt ef validation eða vistun mistekst.
- Halda field validation og error skilaboðum óbreyttum.
- Tryggja að loader birtist líka á hægu neti og í mobile Safari.

**Prófanir:**

- Loader/pending-state birtist strax eftir fyrsta smell á `Vista`.
- Takkinn verður ekki aftur venjulegur `Vista` á meðan beðið er eftir redirect.
- Takkinn er disabled meðan vistun og redirect-bið stendur yfir.
- Tvísmellur býr ekki til tvítekna færslu.
- Validation villa fjarlægir loader og sýnir villu eðlilega.
- Successful save fer áfram á réttan stað og skilur ekki eftir fastan loader.

#36
## Mannlegra orðalag á lánahlutverki

**Staða:** Bíður

**Samhengi:** Í nýskráningarformi fyrir `Lánað og skilað` velur notandi hvort
hann er í hlutverki þess sem lánar eða fær lánað.

**Vandamál:** Núverandi orðalagið `Ég er lánveitandinn` og `Ég er
lántakandinn` er formlegt og minna mannlegt en Teskeið-tónninn.

**Ósk:** Breyta orðalaginu í eitthvað náttúrulegra, t.d. `Ég er að lána` og
`Ég er að fá lánað`.

**Við útfærslu:**

- Finna núverandi þýðingalykla fyrir hlutverkatakkana í lánaskráningu.
- Uppfæra íslenska notendatextann í `messages/is.json`.
- Uppfæra enska samsvörun í `messages/en.json` þannig að merking haldist skýr.
- Ekki hardcode-a texta í component.
- Staðfesta að textinn passi í segmented control/takka á 360-460 px viewport án
  overlap eða horizontal scroll.

**Prófanir:**

- Nýja íslenska orðalagið birtist í nýskráningarformi.
- Enska útgáfan heldur réttri merkingu.
- Hlutverkaval virkar áfram óbreytt tæknilega.
- Textinn skarst ekki eða flæðir út úr takkanum á mobile.

#22
## Hreinsa sýnilegar `/auth-mvp/` slóðir

**Staða:** Bíður

**Samhengi:** Public beta var opnuð hratt og meðvitað var ákveðið að geyma
sýnilegu `/auth-mvp/*` slóðirnar til að minnka útgáfuáhættu. Það er tæknilega
í lagi í bili, en sem public UX lítur `/auth-mvp/` út eins og innri MVP-slóð.

**Ósk:** Færa sýnilegar notendaslóðir yfir á styttri canonical slóðir:

- `/heim`
- `/minn-profill`
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

**Staða:** Bíður eftir #19 event-feed grunni áður en full útfærsla hefst

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
- Endurskoða #19 samhliða, því cookie-only read-state hefur ekki reynst nógu
  áreiðanlegt fyrir flæði þar sem `Nýlegt` verður mikilvæg inngangsleið.
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

**Næsta tengda skref:** #19 server-side event-feed grunnur er tekinn fyrst svo
`Nýlegt` verði örugg og áreiðanleg inngangsleið fyrir framtíðar #27:
`ai-handoff/2026-06-09-2329-todo-019-027-v009-codex-nylegt-event-feed-final-plan.md`.

#30
## Stærra `10,5` og ný favicon-tillaga

**Staða:** Bíður

**Næsta handoff:** Sjá sameiginlegan rýni-fyrst pakka fyrir #30, #5, #7 og #17:
`ai-handoff/2026-06-09-2341-todo-030-005-007-017-v001-codex-mobile-home-identity-review-plan.md`.

**Vandamál:** Merkingin `10,5` á derhúfunni er komin inn, en hún mætti vera
sýnilegri. Í favicon-stærðum er hætta á að fulla lógóið og derhúfumerkingin verði
of smá til að lesa vel.

**Ósk:** Stækka `10,5` á derhúfunni þannig að það verði sýnilegra og gera
tillögu að nýju favicon sem sýnir bara:

> 10,5

**Við útfærslu:**

- Skoða núverandi `TeskeidLogo`, `app/icon.svg` og tengdar favicon/preview
  útgáfur áður en breyting er hönnuð.
- Stækka `10,5` á derhúfunni án þess að skemma andlit, hlutföll eða almennt
  karakter lógósins.
- Gera aðskilda favicon-tillögu þar sem aðeins `10,5` er sýnilegt og læsilegt í
  mjög litlum stærðum.
- Ekki skipta út production favicon fyrr en Stebbi hefur séð og samþykkt
  tillöguna.
- Útbúa preview/samanburð ef það hjálpar Stebba að velja á milli núverandi og
  nýrrar útgáfu.
- Tryggja að `10,5` sé læsilegt í 16x16, 32x32, 192x192 og 512x512 samhengi ef
  favicon/app-icons verða uppfærð.
- Halda litum og formmáli samræmdu canonical Teskeið-lógóinu.

**Prófanir:**

- `10,5` sést skýrar á derhúfunni án þess að lógóið verði klunnalegt.
- Sér favicon-tillaga með bara `10,5` er læsileg í litlum stærðum.
- Preview sýnir samanburð á núverandi og nýrri tillögu.
- Engin production icon-skrá er skipt út án samþykkis Stebba.
