# 2026-07-17 10:39 — TODO-086 v409 — Deferred: Öxi suðurleið og Reynisfjall

Created: 2026-07-17 10:39
Timezone: Atlantic/Reykjavik

## Samantekt

Tvö mál eru sett til hliðar til skoðunar síðar. Þau eru óháð hvert öðru og hafa ekki áhrif á núverandi framleiðslu.

---

## Mál 1: "Til að sleppa við Öxi suðurleiðina" — kemur ekki inn

### Staða

Kóðinn er til staðar en leiðin kemur aldrei inn á localhost. Þetta er **ekki** production-villa — hlutfallið er þvert á móti: við bættum við reglu sem reynist vera of stíf og kemur aldrei inn.

### Hvað við reyndum

- **Upphafsregla (röng)**: `vias: [HELLISHEIDI_VIA, HOFN_VIA]` — þetta sendi notandann vestur yfir Hellisheiði, sem er alveg í rangan átt.
- **Síðari tilraun**: `vias: [DJUPIVOGUR_VIA]` með `corridorGuard: { point: DJUPIVOGUR_VIA, radiusM: 15_000 }`.
  - `DJUPIVOGUR_VIA = { lat: 64.655, lon: -14.285 }` — á Route 1 austur af þar sem Road 939 greinist.
  - Kenning: að gefa Google "farðu í gegnum Djúpivogur" þyrfti að neyða leiðina til að fara framhjá Öxi-mótinu á suðurhliðinni.
  - Niðurstaða: kemur samt ekki inn. Líklega vegna þess að Google skilar sömu eða verri leið.

### Líklegar skýringar

1. **Geometry dedup**: Ef Google skilar leið sem er nánast eins og einhver base-leið er hún felld brott.
2. **Google veit besta veginn**: Djúpivogur-via-pointurinn gæti einfaldlega ekki neytt Google til að sleppa Öxi.
3. **Mikil aukaferð**: Leið via Djúpivogur og upp strandaleiðina til Egilsstaða er svo mikið lengri en Öxi að Google gæti hafnað henni.

### Hvað þarf til að skoða þetta aftur

1. Prófa á localhost: Reykjavík → Egilsstaðir eða Höfn → Egilsstaðir.
2. Skoða í Google Routes API hvort via-point við Djúpivogur skilar yfirleitt leið sem forðast Road 939.
3. Hugsanlega þarf via-point sem er nánar skilgreindur — t.d. á Route 96 norður af Djúpivogur frekar en beint á Route 1.
4. Ef Google skilar alltaf sama eða verri leið: þá er þetta ekki framkvæmanlegt með þessum nálgun og þarf aðra hugmynd.

### Núverandi kóðastaða

Kóðinn í `google.server.ts` er með `avoid-oxi-south-coast` regluna. Hún kemur ekki inn en gerir enga skaða. Hægt er að:
- Láta hana vera (öruggt, gerir ekkert í raun)
- Eða fjarlægja hana til að hreinsa upp, og bæta aftur við þegar rétt lausn finnst

Skrár sem snerta þetta mál:
- `lib/weather/google.server.ts` — reglan `avoid-oxi-south-coast`, `DJUPIVOGUR_VIA`, corridorGuard-rök
- `components/weather/RouteSelectionStep.tsx` — `CURATED_AVOID_OXI_SOUTH_COAST` label branch
- `messages/is.json` / `messages/en.json` — `routeOptionAvoidOxiViaSouth`
- `lib/__tests__/weather-google.test.ts` — 3 próf fyrir `CURATED_AVOID_OXI_SOUTH_COAST`

---

## Mál 2: Reynisfjall kemur ekki inn á localhost en gerir það á raun

### Staða

Veðurstofan-stöðin á Reynisfirði (eða Reynisfjalli) birtist á framleiðsluþjóni en kemur ekki inn á localhost. Þetta er **ekki** production-villa, raun er rétt. Vandinn er á localhost.

### Hvað við vitum

- Anchors í `ring-road-vik-west` (section `ring-road-vik-west`) ná yfir Reynisfjall-stöðina:
  - Gate 1: `(63.438, -19.450, 10000m)` og Gate 2: `(63.420, -18.870, 10000m)`
  - Anchor: `(63.448, -19.040, 1000m)` — Reynisfjall
- Próf standast — stöðin kemur inn í prófum.
- Í hverfi á localhost virðist hún ekki birtast.

### Líklegar skýringar

1. **Hot-reload timing**: Localhost er með stale state á milli breytinga.
2. **Veðurstofan-gögn**: Stöðin gæti einfaldlega ekki verið að skila gögnum á localhost á þeim tíma (t.d. sía á stöðvar sem eru virkar).
3. **`verified:false` guard**: `ring-road-vik-west` er með `verified:false` — `augmentProviderMatchingPoints` sleppir þessum hlutum í production. Á localhost á dev-umhverfi ætti þetta að vera opið. Ef localhost er keyrandi með production-umhverfi gæti þetta verið vandinn.

### Hvað þarf til að skoða þetta aftur

1. Staðfesta á localhost að `NODE_ENV !== 'production'` sé rétt stillt.
2. Prófa með sömu leið og á raun (t.d. Reykjavík → Vík) og athuga browser console og server logs.
3. Ef vandinn endurtekur sig: bæta við console.log tímabundið í `augmentProviderMatchingPoints` til að sjá hvort stöðin er að berast frá API.

### Tengd skrár

- `lib/weather/routeControlPoints.ts` — `ring-road-vik-west`, `augmentProviderMatchingPoints`
- Commit `69b6441` — tvær-hluta Vík/Mýrdalur endurskipulagning

---

## Hvað þarf ekki að gera núna

- Engar SQL-breytingar.
- Engar env-breytingar.
- Engar production-breytingar.
- `verified:true` á Vík-hlutana — bíður þar til báð mál að ofan eru leyst.

## Næstu skref (utan þessara mála)

Þessi tvö mál eru bönnuð á meðan þau eru skoðuð. Restin af B/V-fasanum heldur áfram eðlilega. Sjá `2026-07-17-1003-todo-086-v407-codex-v406-review-hofn-south-route.md` (kafli "Suggested Phase Order") fyrir heildarmyndina.
