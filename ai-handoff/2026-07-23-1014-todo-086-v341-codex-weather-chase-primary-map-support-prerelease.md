# 2026-07-23 10:14 - TODO 086 v341 - Codex Weather Chase Primary + Map Support

## 1. Plan áfangans

- Prófa nýja stefnu þar sem **Elta veðrið** verður primary inngangur fyrir venjulega veðurskoðun.
- Halda kortinu sýnilegu sem stuðningslagi, en ekki láta það vera aðalflæðið þegar notandi er bara að bera saman staði.
- Sýna valda staði á kortinu með nýja compact veðurpunktinum.
- Leyfa Yr/met.no stað að kalla fram nálægar Veðurstofustöðvar á kortinu.
- Færa röðun valdra staða inn í töfluna sjálfa, ekki sem sér controls í pillunum.

## 2. Hvað var gert

- `WeatherChasePanel` fékk ný props:
  - `onSelectedItemsChange`
  - `onShowNearbyStations`
  - `nearbyStationItemId`
- Valdir staðir eru nú sendir upp til `RoadMapPrototypeMap`, þannig kortið getur teiknað þá.
- Röðunarhnappar eru nú inni í samanburðinum sjálfum:
  - í compact/lóðréttri sýn birtast þeir undir staðarheiti hvers staðar
  - í breiðri töflusýn birtast þeir í sticky staðardálkinum
- Selected-place pillurnar eru nú einfaldari: heiti, provider badge og fjarlægja.
- Fyrir Yr/met.no staði birtist hnappurinn **Sýna nálægar Veðurstofustöðvar**.
- Þegar notandi smellir á þann hnapp:
  - þrjár nálægustu Veðurstofustöðvar eru fundnar út frá hnitum
  - þær birtast á kortinu sem secondary markers
  - sami hnappur togglar stöðvarnar aftur af
- Þegar `Elta veðrið` er opið:
  - almenn overview station markers eru faldir
  - selected Weather Chase markers eru sýndir á korti
  - kortið fit-ar að völdum stöðum og nearby-stöðvum þegar valið breytist
  - bounds-key kemur í veg fyrir að kortið hoppi aftur bara af því að lazy-load spágildi klárast
- WeatherChase overlay er ekki lengur full-screen:
  - það er nú app-líkt panel yfir kortinu
  - kortið sést áfram undir og til hliðar
  - pointer-events eru sett þannig að panelið grípi input en kortið sé áfram til staðar í upplifuninni
- Cleanup bætt:
  - WeatherChase map markers eru hreinsaðir við lokun og map cleanup.
- Vantaður textalykill bættur við bæði `is` og `en`.

## 3. Skrár sem voru skoðaðar

- `WORKFLOW.md`
- `Design.md`
- `components/weather/WeatherChasePanel.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`
- `messages/en.json`

## 4. Skrár sem voru breyttar

- `components/weather/WeatherChasePanel.tsx`
  - client component marker
  - props fyrir selected-items callback og nearby Veðurstofustöðvar
  - röðun í töflu/stöðvardálki
  - einfaldari selected-place pills
  - aria/title á nearby button
- `components/weather/RoadMapPrototypeMap.tsx`
  - WeatherChase selected/nearby marker state
  - map marker rendering fyrir WeatherChase
  - nearest Veðurstofustöðvar frá Yr/met.no stað
  - overlay breytt úr full-screen í kort-support panel
  - cleanup og map fit fyrir selected markers
- `messages/is.json`
  - `roadMapPrototypeWeatherChaseShowNearbyStations`
- `messages/en.json`
  - `roadMapPrototypeWeatherChaseShowNearbyStations`

## 5. Skipanir sem voru keyrðar

- `npm run type-check`

## 6. Niðurstöður og exit codes

- `npm run type-check`
  - Exit code: `0`
  - Niðurstaða: `tsc --noEmit` fór í gegn.

## 7. Hvað mistókst eða var sleppt

- Engin browserprófun var keyrð af Codex. Stebbi keyrir localhost/dev server sjálfur samkvæmt AGENTS.
- Ekki var sett inn persistent vistun á valinni röð/stöðum.
- Ekki var sett inn ný SQL eða feature flag.
- Ekki var farið í fulla provider-merge hönnun þar sem sami staður birtist sem Yr og Veðurstofan hlið við hlið sem grouped entity. Þetta er enn næsta product-skref.
- Kortið notar nú selected WeatherChase markers, en collision/label density fyrir þessa marker-a er enn einföld.

## 8. Ákvarðanir sem Codex tók

- Taflan er látin vera primary panel en kortið er áfram sýnilegt sem stuðningur, frekar en að skipta alfarið yfir í hreina töflusíðu.
- Nearby Veðurstofustöðvar eru aðeins boðnar fyrir Yr/met.no staði, því það er þar sem notandi þarf að finna samanburðarstöð.
- Notað er einfalt nearest-by-haversine val, þrjár næstu stöðvar. Þetta er gott prufuskref áður en við bætum við flóknari landfræðilegri/gagnaveitu rökfræði.
- Kortið fit-ar bara þegar selected/nearby identity breytist, ekki þegar veðurgildi lazy-loadast.

## 9. Áhætta sem er enn til staðar

- `WeatherChasePanel.tsx` er untracked skrá frá fyrri áfanga. Claude þarf að staðfesta að hún sé með í commit/review.
- Veðurstofustöðvar geta verið með stytt eða óljós nöfn. UX fyrir “sama staður, mismunandi provider” þarf líklega grouped result síðar.
- WeatherChase map markers eru byggðir á nýja detail marker helpernum. Ef sá helper er breytt fyrir aksturskortið getur það haft áhrif á þessa prufusýn.
- Bounds fit gæti verið of ágengt ef notandi vill pan-a kortinu handvirkt á meðan WeatherChase panelið er opið. Þetta ætti þó bara að gerast þegar val breytist.

## 10. Tillaga að næsta skrefi

- Claude rýni hvort overlayið sé rétt sem primary WeatherChase inngangur:
  - sérstaklega mobile hæð, keyboard/focus, dropdown og scroll.
- Næsta implementation væri:
  - grouped search results þar sem einn staður getur sýnt bæði Yr/met.no og nálægar Veðurstofustöðvar
  - “bera saman provider-a fyrir sama stað” sem explicit action
  - optional saved/default WeatherChase place list per user
  - map/table toggle eða layout sem er enn skýrari ef Stebbi vill table-first alveg án kortsins.

## 11. Spurningar sem Claude á sérstaklega að rýna

- Er `max-h-[72vh]` rétt á mobile, eða þarf panelið að vera lægra svo kortið sjáist betur?
- Er betra að nearby Veðurstofustöðvar birtist sem stöðvar í töflunni líka, eða er nóg að sýna þær fyrst á korti?
- Eigum við að auto-opna “Skoða samanburð nánar” þegar fleiri en þrír staðir eru valdir, eða halda compact sýninni á forsíðu?
- Þarf “Sýna nálægar Veðurstofustöðvar” að segja hversu margar stöðvar munu birtast?

## 12. Supabase / SQL

- Engin SQL-skrá var skrifuð.
- Engin migration var keyrð.
- Engin breyting á RLS, auth, grants, policies, functions, production gögnum eða notendagögnum.

## 13. Localhost checks for Stebbi

Opna:

- `/auth-mvp/vedrid/road-map-prototype`

Skilyrði:

- `ROAD_INTELLIGENCE_V1_ENABLED=true`
- Notandi þarf að vera með per-user feature flag fyrir `road-intelligence-v1`, eins og áður.
- Dev server er keyrður af Stebba.

Prófun:

1. Smelltu á 🌦️ hnappinn.
   - Vænt: `Elta veðrið` opnast sem panel yfir kortinu, ekki sem heilt hvítt/full-screen lag.
   - Vænt: kortið sést enn á bakvið og valdir staðir birtast á kortinu.

2. Leitaðu að stað, t.d. `Akureyri`.
   - Vænt: dropdown birtir niðurstöður á meðan skrifað er.
   - Vænt: hægt er að bæta við bæði Veðurstofu/Yr stað ef hann finnst í viðkomandi provider-lista.

3. Veldu fleiri en þrjá staði.
   - Vænt: taflan skiptir yfir í lárétta samanburðarsýn.
   - Vænt: staðardálkurinn er sticky vinstra megin.
   - Vænt: upp/niður controls eru í staðardálkinum og breyta röð taflunnar.

4. Veldu Yr/met.no stað og smelltu á **Sýna nálægar Veðurstofustöðvar**.
   - Vænt: hnappurinn verður virkur.
   - Vænt: þrjár nálægar Veðurstofustöðvar birtast á kortinu sem secondary markers.
   - Vænt: annar smellur felur þær aftur.

5. Prófaðu að fjarlægja stað úr selected listanum.
   - Vænt: taflan uppfærist.
   - Vænt: kortamerki hverfur.
   - Vænt: ef nearby focus var á fjarlægðum stað, hverfur nearby focus líka.

6. Mobile regression:
   - Prófaðu 375-430px breidd.
   - Vænt: ekkert lárétt page overflow.
   - Vænt: input veldur ekki óæskilegum zoomi.
   - Vænt: dropdown helst læsilegt og yfir panelinu.

Ekki þarf að prófa Supabase eða production gögn sérstaklega fyrir þennan áfanga; breytingin er client/UI + núverandi API lestur.
