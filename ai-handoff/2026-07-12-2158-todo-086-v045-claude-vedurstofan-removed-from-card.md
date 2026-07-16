# TODO 086 - v045 Veðurstofan fjarlægt af detail card

Created: 2026-07-12 22:00
Timezone: Atlantic/Reykjavik
Author: Claude Code
Type: Release handoff
Commit: `597ccd6 feat: remove Veðurstofan from route point detail card (#86)`
Scope: Committed og pushed til `main`. Vercel build í gangi.

---

## Hvað var gert

Veðurstofan-hlutinn fjarlægður af `RouteWeatherPointDetailCard` og úr öllum callers.

**Ástæða:** Veðurstofan-stöðin gæti verið nokkrar km frá route-punktinum. Að birta hana í MET/Yr route-point spjaldinu gaf í skyn að þetta væru beint samanburðarlegar mælingar á sama stað, en það er villandi.

**Hvað breyttist:**

`components/weather/RouteWeatherPointDetailCard.tsx`
- Fjarlægt `selectNearestVedurstofanRow` úr import
- Fjarlægt `RouteWeatherPoint` úr import (ekki lengur notað)
- Fjarlægt `vedurstofanStation` prop úr destructuring og type signature
- Fjarlægt allan Veðurstofan UI-hlutann

`components/weather/TravelAuditMap.tsx`
- Fjarlægt `vedurstofanStation` úr `PointDetailsPanel` props, type og passing til `RouteWeatherPointDetailCard`
- Fjarlægt `vedurstofanStation={selectedPoint?.vedurstofanStation}` úr `PointDetailsPanel` call

`app/auth-mvp/vedrid/FerdalagidClient.tsx`
- Fjarlægt `vedurstofanStation={pt.vedurstofanStation}` úr `RouteWeatherPointDetailCard` call

**Hvað breyttist EKKI:**

- `lib/weather/types.ts` -- `vedurstofanStation` er enn í `RouteWeatherPoint` type
- `app/api/teskeid/weather/travel/route.ts` -- API skilar enn `vedurstofanStation` í route points
- `lib/weather/providers/vedurstofan.server.ts` -- fetch/cache logic óbreytt
- `components/weather/travelAuditMap.helpers.ts` -- `selectNearestVedurstofanRow` og `VedurstofanForecastRow` eru enn þar
- Allar prófanir óbreyttar -- enrichment, timeout, row-selection tests ganga enn

Gögnin berast til clients en eru ekki notuð í UI að svo stöddu.

---

## Verification

```
npm run type-check -- exit 0
```

3 skrár. 1 insertion, 47 deletions.

---

## Næstu skref — Phase 2B0

Samkvæmt Codex v040 og v044 er næst:

**"Elta veðrið" station explorer**

- Innri/feature-gated síða (ekki hluti af route-flow)
- Sýnir allar Veðurstofan-stöðvar á Íslandskort
- Smellir á stöð: stöðvarnafn, hnit, nýleiki, forecast rows, stale/villa-stöður
- Engin route-reiknibreyting, engin verdict, engin heatmap

Þarf sérstakt framkvæmdarleyfi frá Stebba. Þegar leyfi berst er fyrsta skref að gera implementation plan (route/page, feature gate, map approach, message keys, tests) til Codex-rýni.

---

## Supabase / RLS / Production

- Engar SQL-breytingar
- Engin migration
- Engar RLS, auth, eða production schema-breytingar
- `weather_cache` óbreytt
