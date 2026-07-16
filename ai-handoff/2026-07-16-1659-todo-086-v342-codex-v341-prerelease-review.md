# 2026-07-16 16:59 — TODO-086 v342 — Codex review of v341 prerelease

## Findings

### High: Vestfjarða-varúðin er enn origin/destination-regla, ekki vegkafla-regla

[lib/weather/routeCautions.ts](</c/Users/Lenovo/Documents/vaktirnar/lib/weather/routeCautions.ts:25>) kynnir `SensitiveRoadSegment`, en virka Vestfjarða-reglan notar `missing-via` með `anyPartyBounds` í stað þess að match-a actual varasaman vegkafla. Sjá sérstaklega:

- `missing-via` lýsingin krefst þess að origin eða destination sé inni í bounds: [lib/weather/routeCautions.ts](</c/Users/Lenovo/Documents/vaktirnar/lib/weather/routeCautions.ts:15>)
- active segmentið notar `anyPartyBounds: [WESTFJORDS_NORTH_BOUNDS]`: [lib/weather/routeCautions.ts](</c/Users/Lenovo/Documents/vaktirnar/lib/weather/routeCautions.ts:109>)
- matcherinn stoppar ef hvorugur endinn er í bounds: [lib/weather/routeCautions.ts](</c/Users/Lenovo/Documents/vaktirnar/lib/weather/routeCautions.ts:183>)

Þetta brýtur nýjustu product-regluna í v340: varúðin á að fylgja vegkaflanum sjálfum, alveg óháð því hvaðan er komið og hvert er verið að fara.

Afleiðingar:

- Route sem fer raunverulega um varasama Route 60-kaflann en hefur origin/destination utan `WESTFJORDS_NORTH_BOUNDS` fær enga varúð.
- Route sem er með Ísafjörð/Bolungarvík sem annan endapunkt og fer ekki nálægt Hólmavík fær varúð, jafnvel þó við höfum ekki sannað að hún fari um tiltekinn varasaman kafla.
- Kóðinn er orðinn “segment” að nafninu til, en ekki í hegðuninni fyrir eina virka regluna.

Ég myndi ekki kalla v340 “fully implemented” fyrr en Vestfjarða-reglan er annaðhvort:

1. raunverulegt `present-near-corridor` match á skilgreindan Route 60/varasaman kafla, eða
2. skýrt merkt sem transitional fallback sem má ekki vera endanlegt segment layer.

### Medium: Hólmavík alternate er enn einátta/destination-bound og getur ekki hjálpað í reverse/segment-first tilfellum

Curated Hólmavík-reglan er enn bundin við `destination: WESTFJORDS_NORTH_BOUNDS` og sleppir öllum origin inni í sömu bounds: [lib/weather/google.server.ts](</c/Users/Lenovo/Documents/vaktirnar/lib/weather/google.server.ts:200>). Matcherinn í `getCuratedRouteOptions` krefst svo að `from` passi origin og `to` passi destination: [lib/weather/google.server.ts](</c/Users/Lenovo/Documents/vaktirnar/lib/weather/google.server.ts:449>).

Þetta leysir Höfn → Ísafjörður, en ekki almenna reglu “ef selected route fer um varasaman vegkafla með þekktari einfaldari leið, bjóða alternate”. Claude kallar þetta sjálfur pending fyrir Ísafjörður → Höfn, en í samhengi v340 er þetta ekki bara future nicety heldur hluti af að losa okkur frá origin/destination pörum.

Tillaga:

- Halda alternate-route registry aðskildu frá warning registry, en triggera alternate út frá matched caution segment þegar hægt er.
- Ef það er of stórt núna, nefna það skýrt í UI/product handoff sem transitional limitation: “warning segment-first er ekki fullkomið fyrr en alternate generation verður líka segment-aware/bidirectional.”

### Medium: Öxi er enn ekki virk þrátt fyrir að v340 taldi hana með fyrstu tveimur vegkaflunum

Öxi er bara commented-out stub í [lib/weather/routeCautions.ts](</c/Users/Lenovo/Documents/vaktirnar/lib/weather/routeCautions.ts:125>). Það er skynsamlegt að virkja hana ekki með óstaðfestri geometry, en v341 segir “v340 fully implemented” og bætir `routeCautionOxiSummary` við messages.

Niðurstaðan er því:

- v340 product direction er ekki öll komin inn.
- Höfn → Egilsstaðir via Öxi mun ekki fá varúð ennþá.
- Test coverage fyrir Öxi er ekki til, eðlilega því virknin er disabled.

Ég myndi orða stöðuna sem “Westfjords transitional implementation done; Öxi pending visual geometry verification”, ekki “v340 fully implemented”.

### Medium: Prófin staðfesta núverandi proxy-reglu, ekki nýja segment-reglu

[lib/__tests__/weather-route-cautions.test.ts](</c/Users/Lenovo/Documents/vaktirnar/lib/__tests__/weather-route-cautions.test.ts:73>) notar `POINTS_NOT_VIA_HOLMAVIK` sem eru í raun punktar frá Garðabæ → mið/norður Ísland → Akureyri, ekki fixture sem sker sunnanverðan Vestfjarða/Route 60-kafla. Testin sanna því að “ef leið fer ekki nálægt Hólmavík og destination/origin er í Vestfjörðum þá kemur warning”, ekki að route geometry fari um varasaman vegkafla.

Vantar test sem sannar v340:

- route polyline sem sker varasaman segment fær warning óháð origin/destination
- route til Ísafjarðar sem fer ekki um segmentið fær ekki warning
- route sem hefur hvorugan endapunkt í Vestfjörðum en fer um segment fær warning
- reverse route með sömu segment geometry fær warning

### Low/UX: Compact textinn er inni í route-option button og gæti orðið þungur þegar fleiri cautions bætast við

[components/weather/RouteSelectionStep.tsx](</c/Users/Lenovo/Documents/vaktirnar/components/weather/RouteSelectionStep.tsx:478>) renderar alla route option sem einn stóran `<button>`, og caution summary fer inn í sama button: [components/weather/RouteSelectionStep.tsx](</c/Users/Lenovo/Documents/vaktirnar/components/weather/RouteSelectionStep.tsx:492>).

Þetta er líklega í lagi fyrir einn stuttan warning, en ef route fær 2+ cautions verður leiðarvalskortið fljótt hátt og allt textasvæðið verður clickable button. Það er ekki blocker fyrir v1, en þegar Öxi + aðrir kaflar koma inn þarf `max 1 summary + see details` eða route-details disclosure.

## Staðfestingar sem ég keyrði

- `npm run test:run -- lib/__tests__/weather-route-cautions.test.ts lib/__tests__/weather-google.test.ts` → pass, 2 files, 112/112 tests.
- `npm run type-check` → pass.

Ég keyrði ekki localhost/browserpróf.

## Það sem er gott í v341

- Caution matching er nú keyrt á fullri decoded route geometry áður en route points eru sample-uð: [lib/weather/google.server.ts](</c/Users/Lenovo/Documents/vaktirnar/lib/weather/google.server.ts:575>) og [lib/weather/google.server.ts](</c/Users/Lenovo/Documents/vaktirnar/lib/weather/google.server.ts:314>). Þetta lagar mikilvægan false-negative risk úr v338.
- Shared constants eru skref í rétta átt, þannig Hólmavík proximity er ekki duplicated milli route og caution logic.
- Compact texti undir route chip er product-wise betra en chip eitt og sér.
- Prófin bæta coverage fyrir núverandi hegðun og passa að Hólmavík curated option sé ekki bætt endalaust við.

## Tillaga að næsta skrefi

Ég myndi ekki gefa þetta út sem “segment-based caution model” ennþá.

Skynsamlegasta næsta skref:

1. Claude Code taki afstöðu: er `missing-via` fallback samþykkt tímabundið, eða á að laga Vestfjarða-regluna strax í `present-near-corridor`?
2. Ef Stebbi vill halda þessu áfram hratt: merkja kóðann og handoff skýrt sem transitional fallback, og ekki segja að v340 sé fully implemented.
3. Ef v340 á að vera rétt núna: skilgreina fyrsta approximate Route 60 corridor og match-a það með `present-near-corridor`, með conservative radius og localhost visual checks.
4. Öxi verði sér áfangi: fyrst staðfesta geometry visually, svo virkja segment og tests.

## Localhost checks for Stebbi

Ef Stebbi prófar þetta á localhost áður en næsta handoff fer til Claude:

1. Prófa `Höfn → Ísafjörður`
   - Staðfesta hvort “Gegnum Hólmavík” birtist.
   - Staðfesta hvort base routes fá `Varasamt með eftirvagna`.
   - Skoða hvort textinn undir chip sé læsilegur á mobile.

2. Prófa `Ísafjörður → Höfn`
   - Caution ætti að birtast samkvæmt v341.
   - Hólmavík alternate birtist líklega ekki. Það er nú þekkt limitation.

3. Prófa `Höfn → Egilsstaðir`
   - Ekki búast við Öxi-warning ennþá. Ef Google velur Öxi og engin varúð birtist er það samkvæmt núverandi kóða, en ekki lokamarkmiði.

4. Prófa mobile 360/390/460 px
   - Route card með chip + summary má ekki flæða út eða ýta duration í rugl.

Ekki keyra SQL, deploy eða Vercel-breytingar út frá þessari rýni.

## Óvissa / þarf að staðfesta

- Ég las ekki alla `FerdalagidClient.tsx` diffið í þessari umferð, aðeins v341-relevant route caution hluta. Safnpúls placement getur því enn þurft browser-rýni.
- Ég hef ekki visual-staðfest Google route geometry fyrir Hólmavík/Route 60 eða Öxi.
