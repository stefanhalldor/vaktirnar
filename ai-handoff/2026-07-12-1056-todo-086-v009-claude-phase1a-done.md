# TODO 086 - Phase 1A done - Veðurstofan XML parser

Created: 2026-07-12 10:56
Timezone: Atlantic/Reykjavik
Author: Claude Code
Type: framkvæmdarhandoff / prerelease

## Hvað var samþykkt

Stebbi samþykkti Phase 1A: XML parser module og fixture-based tests. Engar breytingar á route.ts, assessment.ts, UI eða Supabase.

## Hvað var gert

### Nýjar skrár

**`lib/weather/providers/vedurstofanXml.ts`**

XML parser fyrir Veðurstofan `type=forec` svör. Engar external dependencies.

Public API:
```ts
parseVedurstofanXml(xml: string): VedurstofanXmlResult
```

Skilar:
```ts
type VedurstofanXmlResult = {
  stations: VedurstofanStationForecast[]
  parseErrors: string[]
}
```

Per station:
- `stationId`, `stationName`, `valid`, `atimeIso`, `errText`
- `forecasts[]` með `ftimeIso`, `windSpeedMs`, `windDirectionText`, `temperatureC`, `precipitationMmPerHour`, `rawR`, `weatherText`, `gustMs`, `maxWindMs`

Atriðalisti:
- Parse-ar `F`, `D`, `T`, `R`, `W` og optional `FG`/`FX`
- Umreiknar Íslenska kommutölur: `0,6` → `0.6`
- Umbreytir timestamps: `"2026-07-12 09:00:00"` → `"2026-07-12T09:00:00Z"` (Ísland = UTC alltaf)
- Öll fields nullable; vantar field → `null`, ekki 0
- `R` er `precipitationMmPerHour` per official docs (mm/klst); `rawR` er geymt samhliða til endurskoðunar
- `FG`/`FX` eru geymd en **mega ekki** nota í scoring eða threshold UI
- Multi-station XML: ein function call, skilar öllum stöðvum
- Attribute bug lagaður: `valid="1"` setti ekki `stationId: "1"` lengur (regex word boundary)
- Never throws; parse errors safnast í `parseErrors` array

**`lib/__tests__/weather-vedurstofan-xml.test.ts`**

28 tests. Fixtures notaðar, engar live network calls.

Prófa:
- Single/multi-station parsing
- Öll field gildi: F, D, T, R, W, FG, FX
- Decimal comma conversion
- ISO timestamp conversion
- Null safety þegar fields vantar
- Null atimeIso þegar atime er tómt
- Error handling: tómt input, engar stations, station án id

## Hvað var EKKI gert

- Engar breytingar á `route.ts`, `assessment.ts`, `travel.ts`, `metno.server.ts`
- Engar breytingar á UI eða components
- Engar Supabase eða SQL breytingar
- Engar feature flags
- Ekkert nýtt npm dependency
- Station mapping (Phase 1B)
- Fetch/cache wrapper (Phase 1C)
- Engar live calls á xmlweather.vedur.is

## Tests og type-check

```
Tests:  28 passed (28)
tsc:    no errors
```

## Localhost checks for Stebbi

Phase 1A breytir engu í `/vedrid`. Engar localhost prófanir þarf.

Ef þú vilt staðfesta:
- Opna `/vedrid`, reikna leið — hegðun óbreytt
- `npm run test:run` — öll 28 ný tests og 67 helpers tests ættu að pass-a
- Enginn kóði kallar á xmlweather.vedur.is við localhost navigation

## Næsta skref

Phase 1B: station mapping skeleton.
- `lib/weather/providers/vedurstofanStations.ts` — curated stöðvalisti með station IDs og WGS84 coordinates (lon negative)
- `mapRoutePointToVedurstofanStation()` fall
- Tests með lon sign guard og þekktar coordinates (Hellisheiði, Garðabær, Egilsstaðir, Höfn)

Þarf sérstakt framkvæmdarleyfi: "Claude Code, framkvæmdu Phase 1B."
