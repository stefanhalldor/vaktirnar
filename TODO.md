# TODO

## Forgangsröðun

Þetta yfirlit stýrir vinnuröðinni. Númer atriðanna haldast óbreytt svo eldri
tilvísanir og verkefnasaga rofni ekki.

| Röð | Atriði                                                        | Forgangur og samhengi                                                                                                                                |
| --- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **#16 Væntingastýring fyrir mobile-first beta**               | Segja notendum skýrt að Teskeið sé minimalískt, hannað fyrst fyrir síma og leggi grunn að framtíðarappi.                                             |
| 2   | **#4 Beta-aðgangur og útgáfustig**                            | Næsta tæknilega opnunarskref eftir #16: setja server-side grunnvörn fyrir `off`, `beta` og `public`.                                                 |
| 3   | **#9 Opin innskráning með aðgangsstýrðum Teskeiðum**          | Opna innskráningu eftir #16 og #4, með aðgangsstýrðum Teskeiðum og almennum svörum sem leka ekki stöðu notanda.                                      |
| 4   | **#18 Persónulegri headerkveðja fyrir innskráðan notanda**    | Skipta „Góðan dag, fullt nafn” út fyrir hlýrri kveðju með fyrsta nafni notanda.                                                                      |
| 5   | **#19 Lesnir hlutir birtist ekki aftur sem `Nýlegt`**         | Laga að lesnir hlutir komi ekki aftur inn sem nýlegir þegar nýr hlutur er búinn til eða listi endurhlaðinn.                                          |
| 6   | **#15 Íslenskar dagsetningar á lánaspjöldum**                 | Afmarkað UI-atriði: laga lánadagsetningu og sýna skiladagsetningu með sama sniði.                                                                    |
| 7   | **#12 Skýrari kosningatakki**                                 | Lítið UI/copy-atriði sem má loka með núverandi útlitsvinnu án breytinga á kosningavirkni.                                                            |
| 8   | **#8 Teskeið-loader**                                         | Byggja standalone preview úr endanlega samþykkta SVG-lógóinu og birtum hugmyndaheitum úr hugmyndabankanum áður en loader er settur í almenna notkun. |
| 9   | **#21 Derhúfumerking verði `10,5`**                           | Breyta merkingu á derhúfu úr `A&10` í `10,5` í samþykkta lógó-/loader-vinnunni.                                                                      |
| 10  | **#13 Umsjón með whitelist í admin**                          | Sýna og breyta aðgangslistanum með öruggum admin-only aðgerðum eftir að hlutverk hans í #4 hefur verið skilgreint.                                   |
| 11  | **#5 Samræmd mobile app-upplifun**                            | Samræma innskráningu, form, viewport, keyboard og mobile layout sem framhaldsverk eftir opnun nema ný blocker finnist.                                |
| 12  | **#7 Langlíf innskráning**                                    | Gera session app-líkt og öruggt sem framhaldsverk eftir opnun nema session-hegðun reynist blocker í prófun.                                          |
| 13  | **#17 Hugmyndir úr hugmyndabankanum á `/heim`**               | Skipta disabled `Væntanlegt` listanum út fyrir mobile-first framsetningu með raunverulegum, birtum hugmyndum og kosningarmöguleika.                  |
| 14  | **#10 Gáfuleg opnun tölfræðisíðu**                            | Sjálfstætt admin-atriði sem má taka eftir að notendaaðgangsflæðið er tilbúið.                                                                        |
| 15  | **#20 Bottom bar innskráning þarf stundum tvísmell á mobile** | Rýna mobile tap/navigation hegðun þar sem fyrra tap á `Innskráning` gerir stundum ekkert.                                                            |

#16
## Væntingastýring fyrir minimalíska mobile-first beta

**Staða:** Bíður

**Markmið:** Segja beta-notendum frá því að Teskeið sé meðvitað hannað sem
minimalísk og mobile-first lausn. Sú nálgun flýtir þróun, heldur upplifuninni
einfaldri og leggur grunn að sérstakri app-útgáfu síðar.

**Tillaga að notendatexta:**

> Teskeið er í beta og hannað fyrst fyrir símann. Markmiðið er einföld og hröð
> upplifun sem leggur grunn að framtíðarappi. Útlit á stærri skjám getur því enn
> tekið breytingum.

**Við útfærslu:**

- Birta skilaboðin á beta-/innskráningarsíðunni eða einu sinni við fyrstu
  innskráningu, ekki sem síendurtekinn banner inni í allri lausninni.
- Setja textann í `messages/is.json` og `messages/en.json`.
- Orða þetta sem meðvitaða hönnunarákvörðun og stefnu, ekki afsökun fyrir
  ókláruðu viðmóti.
- Desktop skal áfram vera nothæft, aðgengilegt og án layout-vandamála þótt
  mobile sé fyrsti hönnunarpunkturinn.
- Halda framsetningunni stuttri, rólegri og samræmdri núverandi beta-texta.

#18
## Persónulegri headerkveðja fyrir innskráðan notanda

**Staða:** Bíður

**Vandamál:** Header innskráðs notanda segir nú „Góðan dag, fullt nafn“. Það er
rétt en svolítið almennt og notar fullt nafn þar sem fyrsta nafn væri hlýrra.

**Ósk:** Láta headerinn frekar segja „Fyrsta nafn, þú ert með allt í teskeið!“.
Í tilfelli Stebba væri textinn:

> Stefán, þú ert með allt í teskeið!

**Við útfærslu:**

- Nota fyrsta nafn notanda, ekki fullt nafn.
- Skilgreina öruggt fallback ef nafn vantar eða er tómt.
- Setja notendatextann í `messages/is.json` og `messages/en.json`, ekki
  hardcode-a hann í component.
- Halda tóninum stuttum, hlýjum og samræmdum Teskeið.

#19
## Lesnir hlutir birtist ekki aftur sem `Nýlegt`

**Staða:** Bíður

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
- Bæta regression-prófi þar sem notandi merkir hlut lesinn, býr til nýjan hlut
  og gamli hluturinn birtist ekki aftur sem `Nýlegt`.

#4
## Beta-aðgangur og útgáfustig fyrir nýjar Teskeiðar

**Staða:** Bíður

**Markmið:** Stebbi og valdir prófarar geti notað nýjar Teskeiðar í production
á meðan almennir notendur sjá aðeins útgefið efni.

Hver Teskeið skal geta verið á einu af þremur útgáfustigum:

- `off`: enginn hefur aðgang
- `beta`: aðeins Stebbi og valdir prófarar hafa aðgang
- `public`: allir viðeigandi innskráðir notendur hafa aðgang

**Tillaga að útfærslu:**

- Geyma release-stage fyrir hverja Teskeið miðlægt.
- Geyma beta-allowlist í gagnagrunni, tengda `feature_key` og `user_id`.
- Búa til eitt sameiginlegt server-side aðgangslag, t.d.
  `guardFeatureAccess(featureKey)`.
- Búa til sameiginlegt yfirlit fyrir viðmótið, t.d.
  `getAvailableFeatures(userId)`.
- Fela óaðgengilegar Teskeiðar í heimaskjá og navigation.
- Verja einnig beinar slóðir, server actions og API endpoints.
- Ekki treysta á client-side eða `NEXT_PUBLIC_*` flagg sem öryggisvörn.
- Halda RPC-functions áfram service-role-only þar sem það á við.
- Bæta við regression-prófum fyrir `off`, `beta`, `public`, óskráðan notanda
  og beina slóð.

**Mikilvæg aðgreining:** Beta-aðgangur í production stýrir sýnileika og
notkun, en einangrar ekki áhættusamar schema-breytingar eða production-gögn.
Stórar eða destructive gagnagrunnstilraunir þurfa áfram sérstakt staging
Supabase-project.

Áður en útfærsla hefst þarf að ákveða hvort release-stage eigi að vera í
gagnagrunni, environment variables eða blandað. Forgangstillaga er DB-stýrt
release-stage og DB-stýrð beta-allowlist svo hægt sé að færa `beta` í `public`
án nýs deploys.

#5
## Samræmd mobile app-upplifun á öllu Teskeið.is

**Staða:** Bíður

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

#8
## Teskeið-loader með hugmyndaheitum úr hugmyndabankanum

**Staða:** Bíður

![Viðmið fyrir loader og merkingu á derhúfu](feedback/images/teskeid-loader-and-cap-mark-reference.png)

**Hugmynd:** Búa til stutta, rólega loading-stöðu þar sem nýja hringlaga
Teskeiðarlógóið er miðpunkturinn og heiti birtra hugmynda úr hugmyndabankanum
birtast eitt í einu á meðan hleðsla stendur yfir.

**Hönnunarmarkmið:** Halda upplifuninni minimalískri, rólegri og mobile first.
Loaderinn, lógóið og hugmyndaheitin eiga að styðja hleðsluna án þess að
skjárinn verði þungur, skrautlegur eða yfirfullur.

**Forsenda:** Formlega SVG-lógóið í TODO #6 þarf fyrst að vera hannað og
samþykkt. Loaderinn skal byggja á sömu vector-formum, hlutföllum, litum og
andliti svo loka-frame sé raunverulega lógóið, ekki laus eftirlíking.

**Ósk:**

- Loaderinn skal vera stuttur, skýr og hlýr, ekki langur eða endalaust
  truflandi.
- Láta nýja hringlaga Teskeiðarlógóið vera aðalmerkið í loadernum, með mjög
  einfaldri hreyfingu eins og mjúku fade, pulse eða smávægilegri umbreytingu.
- Birta heiti úr hugmyndabankanum eitt í einu nálægt lógóinu, þannig að það
  líti út eins og róleg hleðsluvísa en ekki full hugmyndasíða.
- Merkingin á derhúfunni í loka-frame skal vera `10,5`, í samræmi við TODO #21
  og endanlega samþykkta lógóið.
- Halda stílnum minimal, flötum og samræmdum við samþykkta lógóið.
- Nota SVG/CSS animation eða sambærilega létta veflausn, ekki þunga myndbandsskrá.
- Forðast óþarfa dependencies og tryggja að animation valdi ekki layout shift.
- Loaderinn skal virka í litlum mobile-stærðum og á stærri skjám.
- Á meðan hleðsla stendur yfir skal loaderinn geta flett í gegnum heiti þeirra
  hugmynda sem hafa verið birtar í hugmyndabankanum.
- Hvert hugmyndaheiti skal að jafnaði fá um eina sekúndu á skjánum áður en
  næsta heiti tekur við, með mjúkri og læsilegri skiptingu.
- Sýna aðeins birtar hugmyndir sem almenningur má sjá og skilgreina öruggt
  fallback ef listinn er tómur eða ekki næst að sækja hann.
- Prófa hvaða biðtímar réttlæta fulla animation. Fyrir mjög stutta bið skal
  forðast flökt eða að sýna aðeins brot úr sögunni.
- Ekki tefja raunverulega navigation eða gagnabirtingu til að animation nái að
  klárast eða til að hvert hugmyndaheiti nái fullri sekúndu.
- Styðja `prefers-reduced-motion`: sýna kyrrt lógó og einfalt hugmyndaheiti eða
  mjög milda fade-stöðu án áberandi hreyfingar.
- Tryggja að loader hafi aðgengilegt loading-heiti þar sem það á við, en að
  einstakir skrautlegir SVG-hlutar séu faldir fyrir skjálesurum.
- Útbúa fyrst standalone demo/samanburð fyrir Stebba áður en loaderinn er settur
  inn almennt í navigation eða gagnasöfnun.

#9
## Opin innskráning með aðgangsstýrðum Teskeiðum

**Staða:** Bíður

**Hugmynd:** Innskráning í bottom bar opni Teskeið-innskráningu með netfangi
fyrir alla notendur. Whitelist eigi ekki lengur að loka á innskráninguna eða
`/auth-mvp/heim`, heldur stýra því hvaða Teskeiðar viðkomandi má sjá og nota
inni á heimaskjánum.

**Markmið:** Aðgreina auðkenningu notanda frá aðgangi að einstökum eiginleikum:

- Innskráning staðfestir hver notandinn er.
- `/auth-mvp/heim` og `/auth-mvp/minn-profill` eru aðgengileg öllum rétt
  innskráðum notendum.
- Whitelist eða release-stage stýrir aðgangi að hverri Teskeið.
- Óaðgengilegar Teskeiðar eru faldar, læstar eða merktar `Væntanlegt` eftir
  þeirri upplifun sem verður ákveðin.

**Endanlegar notendaslóðir:**

- Fjarlægja tímabundna `/auth-mvp` forskeytið úr sýnilegum Teskeið-slóðum.
- Nota stuttar canonical slóðir, meðal annars `/heim`, `/minn-profill` og
  `/lanad-og-skilad`, ásamt samsvarandi undirsíðum hverrar Teskeiðar.
- Uppfæra öll innri link, redirect, middleware-reglur, auth-flæði og próf svo
  nýju slóðirnar séu eina leiðin sem viðmótið vísar á.
- Halda server-side redirectum frá gömlu `/auth-mvp/*` slóðunum yfir á réttar
  nýjar slóðir svo eldri bókamerki og tenglar brotni ekki.
- Forðast redirect-lykkjur og varðveita query parameters sem hafa gildi, til
  dæmis invitation- eða claim-samhengi.
- Meðhöndla innri `/api/auth-mvp/*` heiti sem sérstaka tæknilega ákvörðun. Þau
  þurfa ekki að breytast aðeins til að hreinsa sýnilegar notendaslóðir.

**Tillaga að útfærslu:**

- Fjarlægja allowlist-höfnun úr beiðni og staðfestingu á innskráningarkóða, en
  halda svörum almennum svo þau leki ekki upplýsingum um skráð netföng.
- Skipta núverandi `guardTeskeidAccess()` í skýr aðgangslög, til dæmis:
  - `guardTeskeidSession()` fyrir virka innskráningu.
  - `guardFeatureAccess(featureKey)` fyrir aðgang að einstakri Teskeið.
- Nota session-guard fyrir `/auth-mvp/heim` og `/auth-mvp/minn-profill`.
- Verja beinar Teskeiðarslóðir, server actions, API routes og RPC-flæði
  server-side. Ekki treysta aðeins á sýnileika í viðmótinu.
- Nota núverandi `auth_mvp_allowlist` tímabundið sem beta-lista fyrir
  `Lánað og skilað`, án þess að veikja núverandi SQL-varnir.
- Samræma lausnina síðar við release-stage kerfið í TODO #4:
  `off`, `beta` og `public`.
- Ákveða hvort óheimilaður notandi sjái læsta Teskeið eða aðeins
  `Væntanlegt`, án þess að upplýsa um innri aðgangsreglur.

**Öryggi og misnotkunarvarnir:**

- Halda rate limiting á beiðnum um innskráningarkóða og staðfestingartilraunum.
- Meta CAPTCHA eða sambærilega vörn ef opin kóðasending veldur misnotkun eða
  óþarfa tölvupóstkostnaði.
- Ekki leka því hvort netfang, notandi eða Teskeið sé á whitelist.
- Halda allri feature-aðgangsstýringu server-side og varðveita RLS, grants og
  service-role mörk.

**Prófanir:**

- Óinnskráður notandi kemst á innskráningarsíðuna en ekki inn á `/heim`.
- Netfang utan whitelist getur fengið kóða, skráð sig inn og séð `/heim`.
- Sami notandi kemst ekki inn í beta-Teskeið með beinni slóð, API eða action.
- Whitelist-notandi fær áfram fullan aðgang að `Lánað og skilað`.
- Rate limiting, röng kóðahegðun, útrunninn kóði og almenn villuskilaboð virka
  áfram án upplýsingaleka.

#17
## Hugmyndir úr hugmyndabankanum á `/heim`

**Staða:** Bíður

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

#15
## Íslenskar dagsetningar á lánaspjöldum

**Staða:** Bíður

**Vandamál:** Lánadagsetning á spjaldi blandar saman íslensku og ensku, til
dæmis: „Lánað laugardaginn June 6, 2026“. Þegar hlut hefur verið skilað sést
heldur ekki skýrt hvenær skilin áttu sér stað.

**Ósk:**

- Breyta lánadagsetningunni í fullíslenska framsetningu:
  „Lánað laugardaginn 6. júní, 2026“.
- Þegar `returned_at` er til staðar skal einnig birta „Skilað“ á spjaldinu með
  sama dagsetningarsniði, til dæmis:
  „Skilað sunnudaginn 7. júní, 2026“.
- Nota íslensk heiti vikudaga og mánaða, dag mánaðar sem tölu og fullt ártal.
- Reikna `returned_at` í `Atlantic/Reykjavik` svo UTC-tímastimpill færi
  skiladagsetninguna ekki óvart um dag.
- Halda enskri framsetningu eðlilegri þegar enskt tungumál er virkt.
- Setja notendatexta í `messages/is.json` og `messages/en.json`, ekki
  hardcode-a hann í component.

**Prófanir:**

- `2026-06-06` birtist sem „Lánað laugardaginn 6. júní, 2026“ á íslensku.
- Skilaður hlutur sýnir bæði lánadagsetningu og skiladagsetningu.
- Óskilaður hlutur sýnir enga „Skilað“-línu.
- `returned_at` nálægt miðnætti birtir réttan dag í `Atlantic/Reykjavik`.
- Enskt locale sýnir ekki íslensk heiti vikudaga eða mánaða.

#12
## Skýrari kosningatakki á hugmyndasíðum

**Staða:** Bíður

![Núverandi kosningatakki á hugmynd](feedback/images/idea-vote-button-copy-reference.png)

**Vandamál:** Núverandi kosningatakki sýnir aðeins ör og atkvæðafjölda. Það er
ekki nógu skýrt hvað atkvæðið merkir eða hvaða áhrif aðgerðin hefur.

**Ósk:** Láta takkann segja skýrt að notandinn vilji sjá hugmyndina verða hluta
af Teskeið. Orðalag gæti verið á borð við:
„Já, ég vil hafa þetta í Teskeið“.

**Við útfærslu:**

- Velja stutt, náttúrulegt íslenskt orðalag sem passar í takkann á mobile.
- Halda atkvæðafjöldanum sýnilegum án þess að merking hans verði óljós.
- Gera valið og óvalið state skýrt, bæði sjónrænt og fyrir skjálesara.
- Varðveita núverandi kosningavirkni, API-hegðun og vörn gegn tvöföldum
  atkvæðum.
- Setja notendatextann í viðeigandi `messages/is.json` og `messages/en.json`,
  ekki hardcode-a hann í component.

#13
## Umsjón með whitelist í admin

**Staða:** Bíður

**Markmið:** Admin geti séð núverandi whitelist, bætt netfangi við listann og
fjarlægt netfang af honum án þess að þurfa að keyra SQL handvirkt.

**Ósk:**

- Bæta afmörkuðu whitelist-yfirliti við núverandi admin-viðmót.
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
- Ákveða við útfærslu hvernig listinn tengist beta-aðgangi í #4 og opinni
  innskráningu í #9, svo sama tafla fái ekki tvær ósamræmdar merkingar.

**Prófanir:**

- Óinnskráður og venjulegur innskráður notandi fá engan aðgang að listanum eða
  breytingaaðgerðum.
- Admin getur lesið lista, bætt við gildu netfangi og fjarlægt færslu.
- Tvítekið og ógilt netfang breytir ekki gögnum.
- Fjarlæging á netfangi hefur skilgreind áhrif á núverandi session og virkan
  Teskeið-aðgang.

#20
## Bottom bar innskráning þarf stundum tvísmell á mobile

**Staða:** Bíður

**Vandamál:** Að minnsta kosti í mobile þarf stundum að smella tvisvar á
`Innskráning` í bottom bar áður en innskráningarsíðan opnast. Fyrra smelli/tap
virðist stundum ekki gera neitt.

**Ósk:** Innskráningartakkinn í bottom bar eigi að opna innskráningarsíðuna
áreiðanlega við fyrsta tap á mobile.

**Við útfærslu:**

- Endurskapa vandann á mobile viewport og helst raunverulegu touch-tæki eða
  browser mobile emulation.
- Rýna hvort fyrsta tap sé að fara í focus, hover/active state, hydration,
  route prefetch, overlay, pointer-events, z-index eða annan client-side state.
- Athuga hvort vandinn gerist aðeins þegar síðan er nýhlaðin, eftir scroll, eftir
  route change eða þegar bottom bar er nýkominn inn í viewport.
- Laga hegðunina án þess að veikja navigation, aðgengi eða keyboard/focus virkni.
- Bæta regression-prófi ef vandinn reynist rekjanlegur í component logic; annars
  skrá handvirkt browserpróf með mobile viewport.

#21
## Derhúfumerking verði `10,5`

**Staða:** Bíður

**Vandamál:** Núverandi merking á derhúfu er eða vísar til `A&10`, en Stebbi vill
að merkingin verði `10,5`.

**Ósk:** Breyta merkingunni á derhúfunni úr `A&10` í `10,5` í samþykktri
lógó-/loader-vinnu.

**Við útfærslu:**

- Finna allar útgáfur þar sem derhúfumerkingin birtist, þar á meðal SVG-lógó,
  favicon-/preview-tilraunir, loader demo og skjámyndaviðmið ef við á.
- Breyta aðeins merkingunni sjálfri, ekki stærð, formum, litum eða öðru útliti
  nema það þurfi til að `10,5` passi snyrtilega.
- Tryggja að `10,5` sé læsilegt í litlum stærðum, sérstaklega í loader og mobile.
- Uppfæra tengd viðmið eða preview ef þau eru hluti af lógó-/loader-vinnunni.
