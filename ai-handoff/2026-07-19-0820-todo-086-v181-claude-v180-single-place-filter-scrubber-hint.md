# 2026-07-19 09:00 - TODO 086 v181 - Claude v180: single-place filter, scrubber filter, hint text

Created: 2026-07-19 09:00
Timezone: Atlantic/Reykjavik

## Hvað var gert

v180 polish lokið. Þrjár breytingar:

### 1. Single-place map filter

Þegar notandi velur `Frá` stað (og hefur ekki valið `Til`) filterar kortið nú niður á næstu veðurstöð fyrir valinn stað.

- **Veðurstofan:** `singlePlaceVedurstofanIds` = `Set` með einum `stationId` frá `nearestStationRequest`. Notað sem fallback þegar `routeMemory.status !== 'resolved'` og `fromPlaceDraft && !toPlaceDraft`.
- **Vegagerðin:** `nearestVegagerdinStationId` useMemo reiknar næstu Vegagerðarstöð úr `vegagerdinData` (enginn Google kall). `singlePlaceVegagerdinIds` notað á sama hátt.
- Þegar bæði `Frá` og `Til` eru valin og `routeMemory.status === 'resolved'`: nákvæmar route-memory stöðvar frá DB taka yfir.
- Þegar leið er hreinsuð: öll stöðvar sýnilegar aftur (null filter).

Skráarbreytingar: `components/weather/WeatherOverviewClient.tsx`

### 2. Scrubber filter

`forecastSlotStatuses` memo (sem keyrir scrubber dot litina) itererar nú aðeins gegnum stöðvar sem eru í virka filteri.

- Bætti við `if (vedurstofanRouteFilterIds !== null && !vedurstofanRouteFilterIds.has(s.stationId)) continue` inni í lykkjunni.
- Bætti `vedurstofanRouteFilterIds` við deps array.
- Færði `vedurstofanRouteFilterIds` uppfyrir `forecastSlotStatuses` svo hann sé til staðar þegar memo er reiknað.

Áhrif: þegar Akureyri er valin, sýna scrubber-punktarnir versta veður hjá Akureyri-stöðinni eingöngu, ekki allri Íslandi.

### 3. Hint text í RouteMemoryPicker

Þegar notandi hefur valið `Frá` en ekki `Til`, og destinations lista er kominn (ekki loading, ekki tómur), birtist lítill texti:

- **IS:** `Er áfangastaðurinn ekki hér? Veldu nálægan stað eða opnaðu Ferðalagið fyrir ítarlegri útreikning.`
- **EN:** `Destination not shown? Pick a nearby place or open Ferðalagið for a more detailed calculation.`

Textar eru í `messages/is.json` og `messages/en.json` undir `routeMemoryPickerHint` lykli.

Skráarbreytingar: `components/weather/RouteMemoryPicker.tsx`, `messages/is.json`, `messages/en.json`

## Verification

```
npm run type-check  → exit 0
npm run test:run (targeted 6 files, 152 tests) → exit 0
```

## Breytar skrár

- `components/weather/WeatherOverviewClient.tsx` — single-place filter for Veðurstofan + Vegagerðin, scrubber filter
- `components/weather/RouteMemoryPicker.tsx` — hintText í labels interface + render
- `messages/en.json` — routeMemoryPickerHint
- `messages/is.json` — routeMemoryPickerHint

## Build gate (/contacts)

Type-check er grænt. Allar skrár sem contacts page importar eru til og exportar eru rétt. Vandamálið sem Codex fann er líklega local-only artifact. Ekki tengt v179/v180 breytingum.

## Localhost checks fyrir Stebbi

1. Opna `/vedrid`.
2. Velja `Akureyri` sem `Frá`.
3. Vænst: kortið sýnir aðeins Akureyri-stöðina (ekki allt Ísland). Detail card opnar sig.
4. Vænst: scrubber punktar endurspegla veður hjá Akureyri eingöngu.
5. Vænst: hint texti sýnilegur undir `Til` valkostum.
6. Velja `Reykjavík` sem `Til`.
7. Vænst: kortið filterar á nákvæmar route-memory stöðvar á Akureyri/Reykjavík leiðinni.
8. Hreinsa leið.
9. Vænst: fullt yfirlitskort kemur aftur.
10. Network tab: engin `maps.googleapis.com` eða `places.googleapis.com` kall.

## Release status

Allt v180 polish lokið. Tilbúið til release candidate ef Stebbi samþykkir localhost check.
