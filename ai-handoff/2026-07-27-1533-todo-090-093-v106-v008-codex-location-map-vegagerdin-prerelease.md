# Prerelease handoff: staðfest staðaval, kortaval og live-staðsetning í Vegagerðinni

**Created:** 2026-07-27 15:33

**Timezone:** Atlantic/Reykjavik

**Agent:** Codex

**Scope:** TODO-090 / TODO-093, v106 / v008

**Staða:** Útfært og sjálfvirkt prófað á local worktree. Bíður handvirkrar localhost/mobile-rýni Stebba fyrir commit eða útgáfu.

## Samþykkt umfang

Stebbi gaf afmarkað framkvæmdarleyfi til að:

- gera valda núverandi staðsetningu sýnilega og ótvíræða í staðaleitinni,
- bæta við provider-neutral „Velja af korti“, bæði frá grunni og með allar leitarniðurstöður, til dæmis alla staði sem heita Hella,
- bæta við live-staðsetningu notandans eingöngu í núverandi „Vegagerðin“ ham fyrir innskráða notendur,
- uppfæra sýnileg Vegagerðargögn þegar ný cache-gögn berast,
- laga ranga „Innan marka“ talningu og filterhegðun,
- sýna nöfn Vegagerðarstöðva,
- keyra prerelease-próf og útbúa handoff og tölvupóst með prófunarskrefum.

Leyfið náði ekki til commit, push, deployment, environment-breytinga, SQL eða Supabase-skrifa. Þessar aðgerðir voru ekki framkvæmdar.

## Plan áfangans

1. Kortleggja núverandi staðaleit, staðsetningarheimildir, kortalög, Vegagerðargögn og filtera.
2. Gera staðaval sýnilegt og bæta við sjálfstæðu kortavali án Google Maps-tengingar.
3. Einangra live-staðsetningu við „Vegagerðin“ nú-ham og tryggja hreinsun, friðhelgi og örugga gagnauppfærslu.
4. Laga stöðvanöfn, talningu og filtera.
5. Keyra targeted próf, type-check, lint, fulla prófasvítu og production build.
6. Stoppa fyrir commit/útgáfu og afhenda Stebba handvirk prófunarskref.

## Hvað var raunverulega gert

### Staðfest núverandi staðsetning

- Núverandi staðsetning og kortaval birtast sem sýnilegt valspjald með heiti, heimilisfangsupplýsingum eftir því sem þær fást og nákvæmni GPS.
- Nákvæm hnit tækisins eða kortsmellsins eru authoritative; reverse lookup er aðeins notað til að finna mannamálsheiti.
- Nákvæm device- og map-hnit eru ekki sjálfkrafa vistuð í nýlegum stöðum.
- Notandi getur breytt eða hreinsað val áður en haldið er áfram.

### „Velja af korti“

- Nýr full-screen, mobile-first MapLibre/CARTO picker er óháður Google Maps og samræmist því að hægt verði að útleiða Google Places síðar.
- Hægt er að opna kortið frá grunni og velja nákvæman punkt.
- Ef leitað er til dæmis að „Hella“ birtast allar niðurstöðurnar sem númeraðir punktar og samstilltur aðgengilegur listi.
- Kortsmellur velur nákvæm hnit; notandi þarf að staðfesta valið. Cancel varðveitir leitina.
- Ef kortið nær ekki að hlaðast er niðurstöðulistinn áfram nothæfur.

### Live-staðsetning í „Vegagerðin“

- Live tracking er aðeins í boði fyrir innskráðan notanda, með virka leið og þegar „Vegagerðin“/nú-hamur er valinn.
- Hnit fara aðeins í browser-local MapLibre marker. Þau eru ekki reverse-geocode-uð, vistuð, logguð eða send með network-kalli.
- Fyrsta staðsetning miðjar kort aðeins ef punkturinn er utan sýnilegs korts.
- Watch stöðvast og marker hverfur við toggle-off, brottför úr ham, hreinsun leiðar, hidden document og unmount.
- Staða sýnir nákvæmni þegar vafrinn gefur hana upp og sýnir nothæf villuboð við höfnun eða óstuddar aðstæður.

### Vegagerðargögn, stöðvanöfn og refresh

- Nöfn Vegagerðarstöðva eru nú hluti af station labelinu í stað sérstaks collision-prone textalags.
- Þegar virkur nú-hamur er sýnilegur sækir client cache-first gögn úr núverandi same-origin endpointi á 60 sekúndna fresti og við afturkomu í sýnilegan tab.
- Refresh notar `no-store`, kemur í veg fyrir overlapping köll, abortar við cleanup og ver sig gegn gömlum route-run niðurstöðum.
- Aðeins nýrri `fetchedAt` gögn leysa eldri mælingar af hólmi; last-good state er varðveitt við tímabundna villu.
- Freshness getur færst úr fresh í aging/stale án þess að nýtt payload þurfi að berast.
- Endpointið er cache/history lestur; þessi breyting kallar ekki beint í upstream og skrifar ekki í Supabase.

### „Innan marka“ og engar mælingar

- Einfalda talningin „Innan marka“ leggur nú saman `innan-marka` og `nalgast-othaegindi`, í samræmi við þær sýnilegu stöðvar sem notandi sér sem innan marka.
- Filterinn byggir á canonical status-setti og virkar því einnig þegar aðeins einn status-hópur er sýnilegur.
- `no_data` og `no_wind_data` teljast ekki sem nothæfar vindmælingar.
- Tómt mælingasafn verður ekki sjálfkrafa grænt eða túlkað sem öruggt; UI segir þess í stað að engar vindmælingar séu tiltækar.

### Privacy-safe Google fallback diagnostics

- Fyrirliggjandi prerelease test fann eitt log-safety frávik í eldri fallback diagnostics.
- Loggerinn notar nú aðeins fasta, leyfða failure-category strengi.
- Aldrei er skráð query, heimilisfang, hnit, notandi, API-lykill, response body, secret eða villudetail.

## Skrár sem voru skoðaðar

- `AGENTS.md`
- `WORKFLOW.md`
- `Design.md`
- `ai-handoff/README.md`
- núverandi place-search, reverse-geocode, route-map, Vegagerðin cache og filter implementation og tengd próf.

## Skrár sem voru breyttar

- `app/api/place/search/route.ts`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `components/weather/PlaceSearch.tsx`
- `components/weather/PlaceMapPicker.tsx` (ný)
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/WindStatusFilterPills.tsx`
- `lib/places/currentLocation.client.ts`
- `lib/places/liveLocation.client.ts` (ný)
- `lib/places/types.ts`
- `lib/road-intelligence/placeSearchBridge.ts`
- `messages/is.json`
- `messages/en.json`
- `lib/__tests__/current-location-client.test.ts`
- `lib/__tests__/hms-place-api.test.ts`
- `lib/__tests__/place-search-ui.test.tsx`
- `lib/__tests__/live-location-client.test.ts` (ný)
- `lib/__tests__/map-place-source-contract.test.ts` (ný)
- `lib/__tests__/place-map-picker-ui.test.tsx` (ný)
- `lib/__tests__/road-map-vegagerdin-live-ui.test.ts` (ný)
- `lib/__tests__/wind-status-filter-pills.test.tsx` (ný)

`.obsidian/workspace.json` er user-owned breyting og var ekki snert eða tekin inn í scope. Eldri ótrackaðar handoff-skrár voru varðveittar.

## Skipanir og niðurstöður

- Targeted Vitest: **10 test files, 51 tests passed**, exit 0.
- Type-check: **passed**, exit 0.
- Full lint: **passed**, exit 0. Aðeins fyrirliggjandi warnings, engar nýjar lint-villur.
- Fyrra production build: **passed**, exit 0.
- Fyrri full suite: 4045 passed og 1 failure í static log-safety prófi; frávikið var lagað eins og lýst er að ofan.
- Targeted HMS/log-safety endurpróf: **2 files, 130 tests passed**, exit 0.
- Loka full Vitest suite: **186 files passed, 1 skipped; 4046 passed, 28 skipped, 8 todo (4082 total)**, exit 0.
- Loka production build: **passed**, exit 0.
- Focused ESLint eftir síðustu logger-breytingu: **passed**, exit 0.
- `git diff --check`: **clean**, exit 0.
- `HEAD` og `origin/main`: bæði `19e91db`; ekkert commit eða push var gert.

Next build prentaði venjulega línu um að `.env.local` væri environment source. Codex opnaði hvorki né breytti skránni og engin gildi eða secrets birtust í outputi.

## Design.md og UX

- Lausnin er mobile-first, notar full-screen dialog fyrir kortaval, `100dvh`/safe-area meðferð og minnst 40px snertiflöt.
- Inputs halda stærð sem forðar óæskilegu mobile zoom-i.
- Kort og niðurstöðulisti eru samstillt og keyboard/focus hegðun er studd.
- Reduced-motion er virt þar sem smooth hreyfing á við.
- Þýðanlegur notendatexti er í bæði `messages/is.json` og `messages/en.json`; recovery-leiðbeiningar halda sérstöku íslensku/ensku tungumálaskipti án þess að breyta öllu viðmótinu.

## Ákvarðanir

- „Velja af korti“ notar MapLibre/CARTO, ekki Google Maps, svo staðavalið sé provider-neutral.
- GPS- og kortshnit eru ekki auto-saved vegna friðhelgi og nákvæmni.
- Live-staðsetning er eingöngu staðbundið presentation-state og blandast aldrei saman við Vegagerðarstöðvar, counts eða filtera.
- Client refresh les aðeins sama cache endpoint og núverandi flæði; hann býr ekki til nýjan upstream poller.
- Engin breyting var gerð á `IcelandRoadmap.md`, því áfanginn bætti ekki við canonical vegþekkingu heldur UI, browser-location og cache-observation hegðun.

## Það sem mistókst eða var sleppt

- Fyrsta type-check fann of þrönga display-type skilgreiningu fyrir valinn stað; hún var löguð með provider-neutral optional display fields.
- Fyrsta fulla suite fann dynamic argument í privacy logger; hann var færður í exhaustive fasta category strengi og öll próf voru endurkeyrð.
- Ekki var ræstur eða endurræstur dev server; Stebbi á localhost keyrsluna.
- Ekki var hægt að staðfesta raunverulegt browser Permission prompt, GPS movement, iOS safe-area, MapLibre rendering eða að ný Vegagerðarmæling birtist án handvirkrar tækjaprófunar.
- Ekkert commit, push, deployment, environment-variable change, SQL eða Supabase read/write var gert.

## Eftirstandandi áhætta

- Native geolocation permissions eru browser/OS háð og verða að vera prófuð á raunverulegum síma.
- iOS getur stöðvað eða seinkað watchPosition í bakgrunni; implementation hreinsar marker viljandi þegar document verður hidden.
- Cache refresh sést aðeins sem ný mæling ef endpointið hefur nýrra `fetchedAt`; Stebbi getur ekki þvingað upstream breytingu í UI-prófi.
- Map labels frá reverse lookup geta verið almenn nálægðarheiti, en valin hnit haldast nákvæm.
- Handvirk mobile-rýni er nauðsynleg áður en Stebbi heimilar commit og útgáfu.

## Localhost checks for Stebbi

### A. Núverandi staðsetning og staðfest val

**Síða og state:** Opnaðu innskráður `/auth-mvp/vedrid` (eða canonical `/vedrid` ef hún er sú sem localhost notar) í 390px mobile viewport eða raunverulegum síma. Leyfðu staðsetningu í browser/OS.

1. Ýttu á **Nota núverandi staðsetningu** í „Frá“.
2. Staðfestu að native leyfisgluggi birtist ef leyfi er óákveðið.
3. Eftir samþykki á sýnilegt valspjald að birtast strax með nálægðarheiti og `±` nákvæmni. Textinn „Enginn staður fannst“ á ekki að vera eftir sem lokastaða.
4. Staðfestu að hægt sé að breyta eða hreinsa valið.
5. Prófaðu höfnun. Opnaðu hjálparskúffuna, skiptu yfir á ensku og aftur á íslensku, lagaðu leyfið og ýttu á reyna aftur.

**Vænt:** Það er ótvírætt hvaða staðsetning var valin áður en farið er í næsta skref; engin nákvæm hnit birtast í console eða network payloadi nema þau same-origin reverse-lookup hnit sem notandinn bað beinlínis um.

### B. Velja Hella af korti

1. Skrifaðu **Hella** í staðaleitina.
2. Staðfestu að venjulegar HMS niðurstöður birtist óbreyttar.
3. Ýttu á **Velja af korti**.
4. Staðfestu að allir Hella-staðir úr núverandi niðurstöðulista birtist sem númeraðir punktar og sem listi með aðgreinanlegum heimilisföngum/sveitarfélögum.
5. Veldu einn punkt eða lista-item og staðfestu valið.
6. Opnaðu picker aftur, cancel-aðu og staðfestu að fyrri leit/val glatist ekki.

**Vænt:** Réttur Hella er auðveldur að aðgreina og valspjaldið sýnir það sem var valið.

### C. Velja punkt af korti frá grunni

1. Hreinsaðu leitina og opnaðu **Velja af korti**.
2. Pannaðu/zoom-aðu og ýttu á punkt á Íslandi.
3. Bíddu eftir nálægðarheiti, staðfestu punktinn og athugaðu valspjaldið.
4. Veldu bæði „Frá“ og „Til“ en staðfestu að leið sé ekki reiknuð fyrr en venjulegt submit/reikna-skref er tekið.
5. Prófaðu 360px, 390px og 460px breidd, opið keyboard, portrait og scroll. Passaðu sérstaklega lárétt overflow, zoom, falinn confirm-takka og focus sem hoppar út af skjá.

### D. Vegagerðin: stöðvanöfn, talning og filter

**Síða og state:** Reiknaðu leið sem hefur nokkrar Vegagerðarstöðvar og veldu núverandi **Vegagerðin** ham.

1. Staðfestu að stöðvanöfn sjáist í viðeigandi station labels.
2. Berðu **Innan marka** töluna saman við sýnilegar grænar/einfaldlega innan-marka stöðvar. Hún á að telja bæði „innan marka“ og „nálgast óþægindi“ samkvæmt einföldu UI-flokkuninni.
3. Ýttu á „Innan marka“ og staðfestu að aðrir markerar hverfi í stað þess að filterinn geri ekkert.
4. Prófaðu aðra filtera og reset; markerar, tala og selection eiga að fylgjast að.
5. Ef engin nothæf vindmæling er til á leið á UI ekki að lita stöðuna græna eða fullyrða að aðstæður séu góðar.

### E. Vegagerðin: live-staðsetning

1. Í sama nú-ham, ýttu á **Sýna núverandi staðsetningu**.
2. Leyfðu staðsetningu og staðfestu bláan user-marker og sýnilega `±` nákvæmni.
3. Færðu símann örlítið á öruggan hátt eða bíddu eftir annarri GPS mælingu; marker á að uppfærast án þess að Vegagerðarstöðvar eða „Innan marka“ talning breytist vegna user pointsins.
4. Slökktu á toggle; marker á að hverfa.
5. Kveiktu aftur og skiptu yfir í spá/annan ham, settu tab í bakgrunn eða hreinsaðu leiðina. Tracking á að stoppa og marker að hverfa.
6. Prófaðu höfnun staðsetningarleyfis; villan á að vera skýr en önnur kortavirkni áfram nothæf.

**Öryggisathugun:** Ekki prófa þetta meðan þú ekur. GPS-hnit eiga ekki að birtast í app logs, analytics eða Vegagerðin network payloadum.

### F. Vegagerðin: cache refresh

1. Hafðu nú-ham opinn og sýnilegan í rúma mínútu.
2. Settu tab í bakgrunn og komdu aftur.
3. Staðfestu að UI haldist stöðugt án flicker og að mæling/freshness uppfærist ef endpointið hefur nýrra `fetchedAt`.
4. Ef ekkert nýtt cache-payload hefur borist er eðlilegt að mæligildin séu óbreytt; freshness má samt eldast.

### G. Regression checks

1. Prófaðu HMS leit með **Melás**, **Melás 8**, **melas 8** og **Reykjavík**.
2. Prófaðu venjulega leiðarútreikninga með handvirkt leitarvali, núverandi staðsetningu og kortavali.
3. Staðfestu að Google fallback komi aðeins við þegar local provider skilar ekki nothæfri niðurstöðu samkvæmt núverandi flæði.
4. Staðfestu að route map, forecast mode, nýlegir staðir og veðurupplýsingar virki óbreytt.
5. Skoðaðu console og network: engin secrets, API-lyklar, leitarstrengir, heimilisföng, user-id eða GPS-hnit eiga að leka í nýju diagnostic loggin.

## Næsta skref

Stebbi framkvæmir ofangreinda localhost- og mobile-rýni og skilar Codex niðurstöðum/skjámyndum. Ef hún er græn getur Stebbi gefið nýtt, afmarkað leyfi fyrir commit, push, Vercel monitoring og production smoke. Ekki gefa út þennan worktree áður en raunveruleg GPS-, korta- og filterhegðun hefur verið staðfest á tæki.

## Tölvupóstur

Tölvupóstur með styttri útgáfu af prófunarskrefunum var sendur frá tengda Gmail-reikningnum til sama reiknings eftir að handoffið var vistað.

- **Subject:** `Teskeið prerelease tilbúið til prófunar – staðaval og Vegagerðin`
- **Gmail message/thread ID:** `19fa4390c15e9820`
- Pósturinn segir skýrt að þetta sé local prerelease, ekki production-útgáfa, og biður Stebba að koma aftur með niðurstöður/skjámyndir fyrir commit eða rollout.
