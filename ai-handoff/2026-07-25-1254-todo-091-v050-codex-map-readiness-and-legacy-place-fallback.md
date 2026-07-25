# TODO 091 v050 — map readiness and legacy saved-place fallback

Created: 2026-07-25 12:54  
Timezone: Atlantic/Reykjavik

## Samþykkt umfang

Stebbi gaf Codex framkvæmdarleyfi til að laga `map_not_ready` villuna í
Akstrinum og leysa tilfelli þar sem eldri vistaður staður, til dæmis Melás 8,
er ekki í styttri staðalista nýja kerfisins.

Þetta fól í sér staðbundnar kóða-, texta- og prófabreytingar. Það fól ekki í
sér commit, push, deploy, migration, Supabase-keyrslu, production-breytingu
eða ræsingu/endurræsingu dev servers.

## Niðurstaða

- Gamall vistaður staður með gild hnit er áfram notaður beint í
  leiðarútreikningi, þótt hann sé ekki í curated staðalista nýja kerfisins.
- Ef leiðarútreikningur mistekst er nálægasti þekkti curated staður innan
  30 km boðinn sem skýr valkostur. Hann er aldrei settur inn sjálfkrafa.
- Notandi sér upprunalega staðinn, nálæga staðinn og áætlaða fjarlægð og getur
  valið að nota tillöguna.
- Hreinsun leiðar hreinsar einnig fallback-tillöguna.
- `map_not_ready` race condition var aðskilið vandamál: kortið beið áður eftir
  `isStyleLoaded()`, sem getur orðið false meðan raster-flísar hlaðast þó að
  nauðsynleg lög séu tilbúin. Nú er sérstakt initialization-ready flagg notað.
- Kortaviðbúnaður og route API keyra samhliða og niðurstaðan er ekki teiknuð
  fyrr en kortauppsetningu er lokið. Biðin styður timeout og abort.

## Breyttar skrár

- `components/weather/RoadMapPrototypeMap.tsx`
- `lib/road-intelligence/roadMapPlaces.ts`
- `lib/__tests__/road-intelligence-road-map-places.test.ts`
- `messages/is.json`
- `messages/en.json`

Ótengdar fyrirliggjandi breytingar í dirty worktree, meðal annars
`.obsidian/workspace.json`, voru ekki snertar eða afturkallaðar.

## Keyrðar skipanir og niðurstöður

- `npm.cmd run type-check`
  - Exit code 0.
- `npm.cmd run test:run -- lib/__tests__/road-intelligence-road-map-places.test.ts lib/__tests__/drive-journey-panel.test.ts lib/__tests__/pulseBack.test.ts`
  - Exit code 0; 3 test files og 38 próf stóðust.
- JSON parse á `messages/is.json` og `messages/en.json`
  - Báðar skrár gildar.
- `git diff --check`
  - Exit code 0; engin whitespace-villa. Aðeins fyrirliggjandi CRLF warnings.
- `git status --short`
  - Read-only yfirlit; staðfesti dirty worktree og ótengda Obsidian-breytingu.

Engin löng browser-, integration- eða full-suite próf voru keyrð. Enginn dev
server var ræstur eða endurræstur.

## Route intelligence check

- Breytingin er almenn fyrir uppruna og áfangastað á Íslandi en ekki bundin
  ákveðnum vegkafla eða route-family.
- Nálægðarleit er provider-neutral og notar curated
  `ROAD_MAP_PLACES`; hún geymir hvorki heimilisfang, ferð né route-niðurstöðu.
- Engin ný canonical segment-, control-point-, caution-, station-matching- eða
  cache-regla þurfti að bætast við.
- `IcelandRoadmap.md` var ekki uppfært því breytingin bætir ekki við nýrri
  leiðaþekkingu; hún nýtir núverandi staðaskrá sem opt-in fallback.
- Google/provider var ekki skipt út og engin raw provider-gögn eru vistuð.

## Design.md samræmi

Fallbackið er mobile-first inline warning/callout með skýrri secondary action,
án sjálfvirkrar navigation eða óvæntrar staðabreytingar. Notendatexti er í
báðum message-skrám. Aðgerðin heldur valinu undir stjórn notandans og bætir
ekki við fixed UI, láréttu overflowi eða input zoom áhættu.

## Áhætta og prófunargöt

- 30 km er varfærnislegt fast hámark. Sumir dreifbýlisstaðir fá því enga
  tillögu, sem er viljandi betra en villandi langur staðgengill.
- Generic route-villa getur verið provider-bilun fremur en óþekktur staður.
  Tillagan er því aðeins valkostur og almenn leiðarvilla er áfram sýnd.
- Engin browser-automation hermdi eftir hægum raster-flísum eða gamla vistaða
  staðnum; það þarf handvirka localhost-staðfestingu.

Confidence: hátt fyrir TypeScript/pure helper og orsök readiness race;
miðlungs-hátt fyrir end-to-end hegðun þar til Stebbi hefur prófað hana í
browser með raunverulegum vistuðum stað.

## Localhost checks for Stebbi

Slóð: `/auth-mvp/vedrid/road-map-prototype`, Akstur.

1. Veldu gamlan vistaðan stað eins og Melás 8 í `Frá`, veldu gildan annan stað
   í `Til` og ýttu á `Reikna`.
   - Vænt: gamli staðurinn heldur nafni og hnitum; kerfið krefst ekki þess að
     hann sé í nýja curated listanum.
2. Endurtaktu með venjulegri leið og fylgstu með console.
   - Vænt: engin `map_not_ready` villa og leiðin birtist þegar bæði API og
     kortauppsetning eru tilbúin, jafnvel ef kortaflísar eru hægar.
3. Ef route provider hafnar gamla staðnum:
   - Vænt: inline tillaga birtist um nálægan þekktan stað innan 30 km, með
     fjarlægð og hnappi. Staðurinn breytist ekki sjálfkrafa.
4. Smelltu á `Nota [stað] í staðinn` og síðan `Reikna`.
   - Vænt: aðeins viðeigandi `Frá` eða `Til` reitur breytist og leiðin er
     reiknuð frá/til tillögunnar.
5. Prófaðu að gamli staðurinn sé í `Til` í stað `Frá`, og ýttu svo á
   `Hreinsa`.
   - Vænt: gagnkvæm hegðun; hreinsun fjarlægir einnig fallback-tillögu.
6. Regression:
   - Venjulegar curated staðatillögur virka áfram.
   - Ekki er hægt að setja sama stað í Frá og Til.
   - Auth/rate-limit villur sýna ekki villandi nálægan stað.
   - Prófaðu við 360 px og 530 px að callout og hnappur valdi ekki láréttu
     overflowi.

Þessi localhost-prófun les aðeins núverandi API/gögn eftir venjulegu flæði.
Ekki þarf og má ekki keyra migration, breyta Supabase/RLS, deploya eða prófa
gegn production með breytingunum án nýs skýrs leyfis.

## Næsta skref

Stebbi sannreynir browser-flæðið á localhost. Claude Code getur síðan rýnt
diffið og tekið breytingarnar með í útgáfuhandoff. Commit, push og deploy bíða
sérstaks samþykkis.
