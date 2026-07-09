# Handoff: TODO #75 v025 — Forecast drawer sticky header, hlekkirnir, hitastigslitur

Created: 2026-07-09 07:48
Timezone: Atlantic/Reykjavik
Ástand: Framkvæmt, type-check og tests grænir, ekki commitað

---

## Hvað var gert

### 1. `ForecastDrawer.tsx` — Sticky header + nýjar props

**Nýjar props:**
- `yrnoUrl?: string` — Yr-hlekkur fyrir staðinn
- `googleMapsUrl?: string` — Google Maps-hlekkur
- `departureContext?: { originDisplay: string; departureIso: string }` — "Ferðin hefst frá X kl. hh:mm"
- Fjarlægð `highlightedLabel?: string` (kemur í stað þess með `forecastHighlightedRowLabel` static lykli)

**Sticky header** — `sticky top-0 bg-background z-10 border-b border-muted/40`:
1. Titill + loka-takki
2. [Yr] [Google Maps] hlekkirnir (ef til)
3. "Ferðin hefst frá {origin} kl. {time}" (ef `departureContext` til)
4. Dálkaheiti (alltaf)

**Dálkalayout** umbreytt úr `<table>` í CSS grid: `grid-cols-[1fr_2.5rem_5rem_3rem]` — header og raðir nota sama template svo dálkar eru alltaf samræmdir.

**Highlighted röð label:** "Spágildið sem notað var í útreikning" (static, án tíma)

### 2. Hitastigslitur

`lib/weather/travel.ts`: `buildForecastRows` stillir nú `temperature.tone`:
- `'positive'` (grænn) þegar hitastig hækkar ≥ 0,5°C milli mælinga
- `'negative'` (gult) þegar það lækkar ≥ 0,5°C milli mælinga
- `'neutral'` þegar breytingin er < 0,5°C (eða fyrsta mælingin)

`ForecastDrawer.tsx`: `tempToneClass` bætt við líkt og `windToneClass` og `precipToneClass`.

### 3. `FerdalagidClient.tsx`

State type `forecastDrawerData` uppfærð: `highlightedLabel` fjarlægt, `yrnoUrl`, `googleMapsUrl`, `departureContext` bætt við.

Allar þrjár `setForecastDrawerData` kallsstaðir uppfærðar:
- **Áfangastaður:** `yrnoUrl`/`googleMapsUrl` búin til úr `destination.lat/lon`, `departureContext` úr `activeOutboundCandidate.departureIso` + dative origin
- **Map route point:** `pt.yrnoUrl`, `pt.googleMapsUrl` (þegar til á `RouteWeatherPoint`), `departureContext` úr `activeCandidate`
- **List route point (RoutePointRow):** sama

### 4. `messages/is.json` + `messages/en.json`

- `forecastHighlightedRowLabel` = "Spágildið sem notað var í útreikning" / "The forecast value used in calculation"
- `forecastDepartureFrom` = "Ferðin hefst frá {origin} kl. {time}" / "Trip departs from {origin} at {time}"
- Fjarlægt: `forecastUsedByTeskeid`, `forecastUsedByTeskeidAt`

---

## Niðurstöður

```
Type-check: PASS (0 villur)
Tests: 1958 pass, 27 skipped, 8 todo — PASS
```

---

## Skrár breyttar

- `components/weather/ForecastDrawer.tsx` — full rewrite: sticky header, grid layout, nýjar props, hitastigslitur
- `lib/weather/travel.ts` — temperature tone í buildForecastRows
- `app/auth-mvp/vedrid/FerdalagidClient.tsx` — state type + 3 setForecastDrawerData kallsstaðir
- `messages/is.json` + `messages/en.json` — 2 nýir lyklar, 2 fjarlægðir

---

## Localhost checks fyrir Stebbi

1. Opna `/auth-mvp/vedrid` og keyra leið (t.d. Garðabær -> Akranes)
2. Velja brottfararstund og smella á "Skoða spána á áfangastað betur"
3. **Sticky header** — skruna niður í spátöflunni: titill, hlekkirnir og dálkaheiti fylgja alltaf með
4. **Yr / Google Maps** — hlekkirnir opnast á réttum stað (áfangastaður)
5. **"Ferðin hefst frá Garðabæ kl. 22:34"** — birtist undir hlekkunum
6. **Highlighted röð** — sér "Spágildið sem notað var í útreikning" (án tíma) undir tímagildi
7. **Hitastigslitur** — hækkandi hitastig (≥ 0,5°C) er grænt, lækkandi er gult, lítil breyting er hlutlægt
8. Opna route point drawer (kortið eða "Hvernig" lista) — Yr/GMaps/departure context birtast þar líka
9. Regression: drawer lokar þegar smellt er á bakgrunn
10. Regression: sticky day labels í scrubber halda sér

---

## Hvað er eftir

- Commit + push (þegar Stebbi staðfestir)
- Design.md kafli á íslensku (minniháttar, P3 úr v023)
- Phase 2 (frestað)
