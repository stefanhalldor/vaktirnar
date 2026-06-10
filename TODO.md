# TODO

## Forgangsröðun

Þetta yfirlit stýrir vinnuröðinni. Númer atriðanna haldast óbreytt svo eldri
tilvísanir og verkefnasaga rofni ekki.

| Röð | Atriði                                                        | Forgangur og samhengi                                                                                                                                 |
| --- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **#19 Lesnir hlutir birtist ekki aftur sem `Nýlegt`**        | Taka næst: byggja varanlegan server-side `recent_events` grunn svo `Nýlegt` verði áreiðanlegt fyrir allar Teskeiðar, ekki lánasértækan read-state plástur. |
| 2   | **#27 Mýkra lánaboðsflæði**                                  | Taka með #19 sem framtíðarundirbúning: `Nýlegt` verður inngangsleið fyrir pending boð, en full #27 útfærsla bíður eftir event-feed grunni og Codex-rýni. |
| 3   | **#37 `Nýlegt` sýni öll ólesin events og breytingasamhengi** | Sýna ekki bara þrjú nýleg atriði; `Nýlegt` á að vera ólesinn inbox og geta útskýrt hvað breyttist, t.d. fyrri og ný skiladagsetning.                  |
| 4   | **#38 Event þegar lánaboði er hafnað**                       | Þegar viðtakandi hafnar lánaboði þarf sá sem sendi boðið að fá event, því það er mikilvæg breyting á láninu.                                           |
| 5   | **#39 Lánveitandi geti eytt samþykktum hlut**                 | Lánveitandi þarf að geta eytt hlut þó mótaðili sé búinn að samþykkja, og mótaðilinn á að fá event um eyðinguna.                                      |
| 6   | **#40 Filterar í lánalista hafi sjálfstætt state**            | Efri og neðri filter í lánalista eiga ekki að endurstilla hvorn annan, t.d. á neðri filter ekki að stökkva í `Allt` þegar efri er breytt.             |
| 7   | **#30 Stærra `10,5` og ný favicon-tillaga**                  | Stækka `10,5` á derhúfunni svo það sjáist betur og gera tillögu að favicon sem sýnir bara `10,5`.                                                     |
| 8   | **#22 Hreinsa sýnilegar `/auth-mvp/` slóðir**                | Public notendaslóðir ættu að verða `/heim`, `/minn-profill` og `/lanad-og-skilad`; geymt úr hraðri opnun til að minnka áhættu.                       |
| 9   | **#13 Endurskilgreina hlutverk whitelist/admin-lista**       | Whitelist stýrir ekki lengur public login/loans; ákveða hvort listinn verði framtíðar beta-listi, admin-tól eða verði arkiveraður.                    |
| 10  | **#5 Samræmd mobile app-upplifun**                           | Samræma innskráningu, form, viewport, keyboard og mobile layout sem framhaldsverk eftir opnun nema ný blocker finnist.                                 |
| 11  | **#7 Langlíf innskráning**                                   | Gera session app-líkt og öruggt sem framhaldsverk eftir opnun nema session-hegðun reynist blocker í prófun.                                           |
| 12  | **#17 Hugmyndir úr hugmyndabankanum á `/heim`**              | Skipta disabled `Væntanlegt` listanum út fyrir mobile-first framsetningu með raunverulegum, birtum hugmyndum og kosningarmöguleika.                   |
| 13  | **#10 Gáfuleg opnun tölfræðisíðu**                           | Sjálfstætt admin-atriði sem má taka eftir að notendaaðgangsflæðið er tilbúið.                                                                         |
| 14  | **#33 Fjöldi innskráðra notenda í admin tölfræði**           | Bæta einfaldri notendatalningu við admin tölfræði; skilgreina fyrst hvort telja eigi skráða notendur, virka notendur eða virkar sessions.             |
| 15  | **#36 Mannlegra orðalag á lánahlutverki**                    | Breyta `Ég er lánveitandinn` / `Ég er lántakandinn` í náttúrulegra orðalag í lánaskráningu, t.d. `Ég er að lána` / `Ég er að fá lánað`.               |
| 16  | **#41 Umönnun sem feature-flagged Teskeið**                  | Sýna Umönnun sem Teskeið undir feature flag og útskýra að hún sé áfram sér app vegna viðkvæmra gagna, notifications og spjalls.                         |

#19
## Lesnir hlutir birtist ekki aftur sem `Nýlegt`

**Staða:** Bíður

**Núverandi staða 2026-06-09:** Cookie-lausn með per-item lyklum reyndist ekki
nógu áreiðanleg í prófun hjá Stebba. Eftir frekari yfirferð er niðurstaðan að
`Nýlegt` eigi ekki að fá lánasértækan `read-state` plástur, heldur varanlegan
server-side `recent_events` grunn sem getur síðar þjónað öllum Teskeiðum.

**Næsta handoff:** Sjá nýjasta framhaldsplan fyrir #19, #27 og #37:
`ai-handoff/2026-06-10-0708-todo-019-027-037-v014-codex-nylegt-all-unread-event-detail-plan.md`.

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
- Sýna öll ólesin events sem notandinn á eftir að lesa, ekki aðeins þrjú nýjustu,
  með skýrri UI-hegðun ef fjöldinn verður mikill.
- Þegar event er opnað skal notandi geta séð hvað breyttist, ekki bara að eitthvað
  hafi breyst; t.d. að skiladagsetning hafi verið fjarlægð og hver fyrri
  dagsetningin var.
- Bæta regression-prófi þar sem notandi merkir hlut lesinn, býr til nýjan hlut
  og gamli hluturinn birtist ekki aftur sem `Nýlegt`.

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

#40
## Filterar í lánalista hafi sjálfstætt state

**Staða:** Bíður

**Næsta handoff:** Sjá sameiginlegan pakka fyrir #36, #37, #38, #39 og #40:
`ai-handoff/2026-06-10-1721-todo-036-037-038-039-040-v001-codex-loans-polish-events-package.md`.

**Samhengi:** Lánalistinn er með filtera efst sem notandi notar til að skoða
mismunandi stöðu eða samhengi lána.

**Vandamál:** Þegar Stebbi er að vinna með filterana efst virðast þeir stundum
hafa áhrif þvert á hvorn annan. Þegar efri filter er breytt skýst neðri filter
stundum í `Allt`, þó það sé óskylt í huga notanda.

**Ósk:** Filterarnir eigi að hafa sjálfstætt state. Að breyta efri filter á ekki
að endurstilla neðri filter nema það sé mjög meðvituð, sýnileg og skiljanleg
varaákvörðun.

**Við útfærslu:**

- Kortleggja filter-state í lánalistanum og hvort state er afleitt,
  endurreiknað, reset-að í effect eða bundið við tab/route breytingu.
- Aðskilja state efri og neðri filters þannig að þeir endurstilli ekki hvorn
  annan óvænt.
- Ef til eru samsetningar sem skila tómum lista skal sýna rólegt empty-state
  frekar en að breyta filter vali sjálfkrafa.
- Varðveita query params eða route-state ef filterar eru tengdir URL.
- Tryggja að breyting valdi ekki hydration-misræmi eða mobile layout jump.

**Prófanir:**

- Breyting á efri filter heldur vali neðri filters óbreyttu.
- Breyting á neðri filter heldur vali efri filters óbreyttu.
- Tóm samsetning sýnir skiljanlegt empty-state en reset-ar ekki í `Allt`.
- Filterar virka áfram á mobile 360-460 px án overlap eða horizontal scroll.
- Keyboard/focus hegðun helst eðlileg þegar filter er breytt.

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
að síðar verði ákveðið hvort Umönnun verði í raun sér Teskeið. Á meðan
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

#36
## Mannlegra orðalag á lánahlutverki

**Staða:** Bíður

**Næsta handoff:** Sjá sameiginlegan pakka fyrir #36, #37, #38, #39 og #40:
`ai-handoff/2026-06-10-1721-todo-036-037-038-039-040-v001-codex-loans-polish-events-package.md`.

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

**Næsta tengda skref:** #19/#37 server-side event-feed grunnur er tekinn fyrst
svo `Nýlegt` verði örugg og áreiðanleg inngangsleið fyrir framtíðar #27:
`ai-handoff/2026-06-10-0708-todo-019-027-037-v014-codex-nylegt-all-unread-event-detail-plan.md`.

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
