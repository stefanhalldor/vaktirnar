# Review — TODO #91 public Ferðaveður parity undir Akstur

Created: 2026-07-24 10:05  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Relevant TODO: #91 — Veður: basemap refresh og kortapússun

## Niðurstaða

Claude v002 túlkaði verkefnið sem map-station interaction:

1. smella á stöð;
2. sýna compact station card;
3. opna sérstakt full-detail overlay.

Það er ekki lengur rétt product direction samkvæmt endurskoðaðri ósk Stebba.

Stebbi vill að **Akstur** verði sjálfstæð aðalsýn fyrir ferðaveðrið og
endurskapi núverandi public Ferðaveðurviðmót eins nákvæmlega og hægt er.
**Kort** verður sérstök einfaldari og stærri kortasýn á sömu ferð.

## Skilningur Codex á beiðni Stebba

### Akstur

Þegar notandi velur `Akstur` á efnið að birtast beint undir Akstur-sýninni.
Það á ekki að vera falið:

- inni í kortapopup;
- inni í compact station card;
- inni í „Sjá nánar“ skúffu;
- inni í sér full-screen map overlay.

Akstur á að endurnýta canonical útlit og upplýsingaskipan úr núverandi:

`/auth-mvp/vedrid/ferdalagid`

Skjámyndir 2026-07-24 092649 og 092656 eru sjónrænt source of truth ásamt
núverandi public útfærslu.

Markmiðið er **nákvæm parity**, ekki nýtt summary sem er aðeins svipað:

- sömu card-skel;
- sömu spacing, borders, typography og responsive hegðun;
- sami brottfarartíma-scrubber;
- sami context-texti um hvaða brottfarartíma útreikningurinn notar;
- sama `Á leiðinni` summary;
- sama mest krefjandi/versta punkts framsetning;
- sama áfangastaðar-/komusamantekt þar sem Veðurstofugögn styðja hana;
- sömu ítarspjöld og röð spápunkta;
- sömu disclosure-/detail-mynstur og nú þegar hafa verið fínpússuð í public
  Ferðaveðrinu.

Rétta tæknilega nálgunin er að extract-a/endurnýta núverandi public components
og summary-samsetningu sem canonical shared UI. Ekki á að reyna að endurteikna
þetta handvirkt inni í `RouteTravelDetails`.

### Gögn í Akstur

Útlitið kemur úr public Ferðaveðrinu, en gögnin í nýju Akstur-sýninni eiga að
vera Veðurstofan-first/Veðurstofan-only samkvæmt ósk Stebba:

- sleppa Yr/met.no sem notendavalkosti og sýnilegri gagnaveitu;
- sleppa provider-/gagnaveitukortunum efst;
- sleppa provider toggle UI;
- ekki sýna `Hrá met.no gögn`, Yr-hlekki eða met.no merkingar;
- status, spápunktar, ETA-matching og summary eiga að byggjast á
  Veðurstofugögnum.

Þetta þýðir ekki að eyða met.no integration úr repo í sama áfanga. Það á aðeins
ekki að vera source eða sýnilegt UI í nýju Akstur-sýninni.

Ef tiltekið public-spjald byggir nú eingöngu á met.no-gildi, t.d.
destination-arrival weather eða all-route sampled point, þarf fyrst að
skilgreina samsvarandi Veðurstofu view-model. Ekki má falsa fulla parity með
gögnum sem Veðurstofulagið hefur ekki.

### Kort

`Kort` er aðskilin sýn á sömu virku ferð:

- stærra og einfaldara kort;
- route-lína;
- einfaldir punktar;
- bíll/ETA þar sem við á;
- lítið staðbundið spjald við punktasmell ef gagnlegt;
- ekki öll summary- og spápunktaspjöldin yfir kortinu.

Kort á ekki að vera aðalcontainer utan um Akstur-upplýsingarnar. Notandi skiptir
á milli:

- `Akstur`: full ferðagreining í canonical public Ferðaveður-lúkki;
- `Kort`: sjónræn, rúmgóð og einföld route-yfirsýn.

### Sameiginlegt state

Akstur og Kort þurfa að lesa sömu:

- valda leið;
- brottfarartíma;
- vindmörk;
- route duration/ETA;
- Veðurstofustöðvar og statusa.

Skipti milli Akstur og Kort mega ekki endurreikna aðra ferð, tapa
brottfarartíma eða sýna ósamræmd statusgildi.

## Áhrif á Claude v002

Eftirfarandi úr v002 á ekki að verða meginstefnan:

- compact station card sem aðalinngangur í ferðadetail;
- full-detail overlay ofan á kortið;
- `RouteTravelDetails` sem ný endurgerð á gamla summaryinu;
- að notandi þurfi fyrst að smella á kortastöð til að sjá ferðagreininguna.

Hlutar v002 geta mögulega nýst inni í `Kort`, t.d. einfaldur punktasmellur og
lítið staðbundið spjald. Þeir eiga ekki að skilgreina `Akstur`.

## Tillaga að framkvæmdaráföngum ef Stebbi samþykkir síðar

1. Kortleggja nákvæmlega public Ferðaveður-blockið og extract-a canonical shared
   journey-results component án sjónrænnar breytingar.
2. Setja shared component beint undir `Akstur`.
3. Búa til Veðurstofan-only adapter/view-model sem fóðrar sama UI.
4. Fjarlægja provider selector, Yr/met.no copy og met.no-only links úr nýja
   Akstur-samhenginu.
5. Halda public Ferðaveðrinu óbreyttu þar til shared component parity er
   staðfest.
6. Þrengja `Kort` í einfalt route-kort og endurnýta aðeins gagnlega
   station-popup hluta úr v002.
7. Staðfesta state-sync milli Akstur og Kort.

## Mikilvægar varnir

- Ekki copy/paste-a stóra inline summary-blockið í annað component og búa til
  tvo drifting UI-kóða.
- Ekki fjarlægja met.no backend eða public provider comparison sem hluta af
  þessari UI-breytingu nema Stebbi biðji sérstaklega um það.
- Ekki breyta route provider, route geometry eða Road Segment Engine.
- Ekki láta nýja Veðurstofan-only adapterinn lækka eða missa threshold/status
  merkingu sem public card sýnir.
- Ekki setja Akstur aftur inn í korta-overlay.

## Óvissa / þarf að staðfesta fyrir framkvæmd

1. „Allt sem er á public Ferðaveðri“ er hér túlkað sem full niðurstöðusamsetning
   frá threshold-boxi/scrubber niður í summary og spápunkta, en án
   provider-kortanna efst og án Yr/met.no-sýnileika.
2. Weather comparison milli origin/destination er hluti public flæðisins. Þarf
   að staðfesta hvort það eigi líka inn undir Akstur eða hvort „allt“ stöðvast
   við route-point listann.
3. Sum public-spjöld nota met.no-only view-model í dag. Það þarf að staðfesta
   hvaða Veðurstofugögn eiga að fylla þau áður en nákvæm parity er möguleg.
4. Skjámyndir 092649, 092656 og 100243 fundust ekki sem skrár í
   `feedback/images/`; túlkunin byggist því á lýsingu Stebba, Claude-handoffinu
   og núverandi `FerdalagidClient.tsx`.

## Localhost checks for Stebbi

Þessi skrá er interpretation/review og engin virkni var breytt. Eftir
framtíðarframkvæmd þarf Stebbi að:

1. Opna `/auth-mvp/vedrid/ferdalagid` og nýju Akstur-sýnina hlið við hlið.
2. Reikna sömu leið og velja sama brottfarartíma.
3. Staðfesta sjónræna parity:
   - card-skel;
   - spacing;
   - scrubber;
   - context-texta;
   - `Á leiðinni`;
   - mest krefjandi punkt;
   - áfangastað;
   - spápunkta;
   - mobile scroll.
4. Staðfesta að ný Akstur-sýn sýni ekki provider-kort, Yr/met.no copy eða
   met.no-hlekki.
5. Skipta yfir í `Kort`.
6. Staðfesta að sama leið, brottfarartími og status haldist en kortið sé stærra
   og einfaldara.
7. Prófa 360, 390 og 460 px og desktop.
8. Vænt: enginn horizontal overflow, mobile zoom, tvöfaldur overlay-scroll eða
   dautt pending state.

## Framkvæmdarstaða

- Engar kóða- eða messages-breytingar voru gerðar.
- Engin próf voru keyrð, þar sem þetta var eingöngu read-only túlkun.
- Engin SQL, migration, Supabase-, auth-, env-, secrets-, billing- eða
  production-breyting var gerð.
- Ekkert commit, push eða deploy var gert.
