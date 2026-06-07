# TODO

## Forgangsröðun

Þetta yfirlit stýrir vinnuröðinni. Númer atriðanna haldast óbreytt svo eldri
tilvísanir og verkefnasaga rofni ekki.

| Röð | Atriði | Forgangur og samhengi |
| --- | --- | --- |
| 1 | **#6 Endurhanna lógó Teskeiðar** | Útbúa og samþykkja production-ready SVG sem verður grunnur að loader og almennri vörumerkjanotkun. |
| 2 | **#8 Teskeið-loader** | Hefst strax á eftir #6 og skal enda í endanlega samþykkta SVG-lógóinu. |
| 3 | **#4 Beta-aðgangur og útgáfustig** | Grunnlag fyrir örugga þróun og birtingu nýrra Teskeiða í `off`, `beta` og `public`. |
| 4 | **#9 Opin innskráning með aðgangsstýrðum Teskeiðum** | Byggir á skýrri aðgreiningu session og feature-aðgangs úr #4. |
| 5 | **#5 Samræmd mobile app-upplifun** | Víðtæk yfirferð á innskráningu, formum, viewport, keyboard og mobile layouti alls vefsins. |
| 6 | **#7 Langlíf innskráning** | Tekið eftir að almenna innskráningar- og aðgangsflæðið í #9 hefur verið ákveðið. |

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
- Ekki láta gamalt Krakkavaktar-lúkk leka inn í Teskeið-innskráninguna.
- Nota reglurnar í `Design.md` sem skyldubundið viðmið fyrir alla nýja og
  breytta skjái á `teskeid.is`.
- Prófa sérstaklega við 360-460 px viewport, með mobile keyboard opið og í
  portrait og landscape þar sem það skiptir máli.
- Staðfesta að enginn texti, hnappur eða input skarist og að síðan haldi réttri
  breidd og scroll-stöðu eftir að lyklaborði er lokað.
- Staðfesta að fixed/sticky controls, modals og neðri aðgerðir fari ekki undir
  mobile keyboard, browser chrome eða safe-area.

#6
## Endurhanna lógó Teskeiðar

**Staða:** Bíður

![Núverandi lógóhugmynd Teskeiðar](feedback/images/teskeid-logo-reference.png)

### Samþykkt aðalviðmið

![Samþykkt hringlaga skeiðarmaskott Teskeiðar](feedback/images/teskeid-circular-spoon-mascot-logo-reference.png)

![Viðmið fyrir loader og merkingu á derhúfu](feedback/images/teskeid-loader-and-cap-mark-reference.png)

**Vandamál:** Samþykkta lógóhugmyndin er nú til sem raster-viðmiðsmynd en ekki
sem hreint, skalanlegt og production-ready SVG. Það þarf að endurgera hana eins
nákvæmlega og mögulegt er í vector-formi, ekki hanna almennt eða lauslega tengt
val.

**Forgangur:** Hringlaga skeiðarmaskottið á nýju viðmiðsmyndinni er samþykkta
aðalstefnan. Eldri lárétta skeiðarhugmyndin hér að ofan er varðveitt sem saga og
samhengi, en á ekki að stýra SVG-endurgerðinni.

**Viðmið úr skjámynd Stebba:**

- Hringlaga badge með þykkum dökkgrænum ytri hring.
- Hlýr off-white eða mjög ljós krembakgrunnur.
- Upprétt dökkgræn skeið, miðjuð lóðrétt.
- Einfalt vinalegt andlit með ljósum sólgleraugum og litlu brosi.
- Baseball-húfa með ljósu framstykki, dökkgrænni útlínu og skyggni.
- Merkingin `A&10` miðjuð á framstykki húfunnar, nákvæmlega eins og á nýjasta
  samþykkta skjámyndarviðmiðinu. Eldri hugmyndirnar `A/10` og `A ↑ 10` gilda
  ekki lengur.
- Boginn texti `Teskeið.is` eftir neðri innri boga hringsins.
- Enginn glans eða shiny highlight á skeiðinni.
- Lúkkið skal vera minimal, hreint, flatt, örlítið leikandi og svolítið
  cheeky án þess að verða flókið.
- Litatillaga: dökkgrænn nálægt `#145A32` og hlýr ljós litur nálægt `#F7F4EE`.

**Ósk:**

- Endurgera samþykkta mynd eins nákvæmlega og mögulegt er sem handunnið inline
  SVG. Ekki búa til generic alternative, raster-mynd eða canvas-lausn.
- Ytri hringurinn skal vera ráðandi rammi, skeiðin sitja þægilega í miðju,
  húfan sitja eðlilega og bogni textinn vera skýrt læsilegur.
- Tryggja að lógóið skali hreint og haldist skarpt og auðþekkjanlegt í navbar,
  profile-marki, favicon/app-icon og stærri birtingu.
- Búa til reusable React component:
  `TeskeidLogo.tsx`.
- Component skal nota inline SVG og engin external dependencies.
- Props:
  - `size?: number`, sjálfgefið `160`
  - `className?: string`
  - `showBackground?: boolean`
- Þegar `showBackground` er `false` skal SVG-bakgrunnurinn vera transparent en
  ytri hringur, maskott og aðrir lógóhlutar haldast.
- Aðgengi:
  - `<title>Teskeið.is logo</title>`
  - styðja decorative notkun með `aria-hidden` þar sem við á
- Nota SVG paths, circles, `textPath` og grouped shapes eftir þörfum, með hreinni
  og viðhaldanlegri vector-uppbyggingu.
- Skila component-skránni og stuttum usage-dæmum fyrir sjálfgefna stærð, lítinn
  navbar og stærri hero.
- Ekki skipta út núverandi logo-assets eða setja nýja componentinn í production
  UI fyrr en Stebbi hefur séð samanburð við viðmiðsmyndina og samþykkt útkomuna.

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
## Teskeið-loader sem endar í nýja lógóinu

**Staða:** Bíður

![Viðmið fyrir loader og merkingu á derhúfu](feedback/images/teskeid-loader-and-cap-mark-reference.png)

**Hugmynd:** Búa til stutta, leikandi loading-hreyfingu þar sem Teskeið matar
einhvern. Viðkomandi brosir að lokum og myndin umbreytist eða rennur saman við
nýja hringlaga Teskeiðarlógóið.

**Forsenda:** Formlega SVG-lógóið í TODO #6 þarf fyrst að vera hannað og
samþykkt. Loaderinn skal byggja á sömu vector-formum, hlutföllum, litum og
andliti svo loka-frame sé raunverulega lógóið, ekki laus eftirlíking.

**Ósk:**

- Hreyfingin skal vera stutt, skýr og hlý, ekki löng eða endalaust truflandi.
- Sýna skeið fara að munni eða andliti, einfalt mataratriði og bros sem
  niðurstöðu.
- Láta síðasta frame umbreytast mjúklega í hringlaga Teskeiðarlógóið.
- Merkingin á derhúfunni í loka-frame skal vera `A&10`, nákvæmlega eins og í
  endanlega samþykkta lógóinu.
- Halda stílnum minimal, flötum og samræmdum við samþykkta lógóið.
- Nota SVG/CSS animation eða sambærilega létta veflausn, ekki þunga myndbandsskrá.
- Forðast óþarfa dependencies og tryggja að animation valdi ekki layout shift.
- Loaderinn skal virka í litlum mobile-stærðum og á stærri skjám.
- Prófa hvaða biðtímar réttlæta fulla animation. Fyrir mjög stutta bið skal
  forðast flökt eða að sýna aðeins brot úr sögunni.
- Ekki tefja raunverulega navigation eða gagnabirtingu til að animation nái að
  klárast.
- Styðja `prefers-reduced-motion`: sýna kyrrt lógó eða mjög einfalda fade-stöðu
  án matarhreyfingar.
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
