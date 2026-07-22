# 2026-07-22 19:36 - TODO-086 v334 - Codex Road Map Drawer Scrubber Polish

Created: 2026-07-22 19:36  
Timezone: Atlantic/Reykjavik

## Samthykki

Stebbi gaf skyrt framkvæmdarleyfi:

> Codex, matt framkvaema þessa lagfaeringu

Rammann tok Codex sem afmarkada UI lagfaeringu a Road Intelligence prototype:

- laga ad `Nuna` i akstursskuffu se ekki sama active state og efri Vegagerdar-nustada,
- skyra efri nuna-label i `Nustadan hja Vegagerdinni`,
- fjarlægja hring og `Besti` ur nyja RoadMap scrubber,
- lata nedri litina/filterana fylgja `Einfalt/Nanar`.

Engin heimild var gefin fyrir commit, push, deploy, SQL, migration, env breytingu, Supabase eda production adgerd.

## Hvad Var Gert

### 1. `DepartureHeatmap` fekk explicit RoadMap controls

Skrar:

- `components/weather/DepartureHeatmap.tsx`

Baett vid tveimur props:

- `selectFirstSlotWhenNone?: boolean`
  - Default: `true`, til ad halda eldri `/ferdalagid` hegðun.
  - RoadMap prototype setur `false`, svo `selectedIdx=null` merkir ekki lengur ad fyrsta `Nuna` slottid se selected.
- `showBestWindowHint?: boolean`
  - Default: `true`, til ad halda eldri `/ferdalagid` supporti.
  - RoadMap prototype setur `false`, svo hvorki ringur ne `Besti` birtist i nyja kortinu.

### 2. Slot litir fylgja nu `Einfalt/Nanar`

Skrar:

- `components/weather/DepartureHeatmap.tsx`

Baett vid `getDisplaySlotStatus()`.

- I `detailed` mode notar slotid raunstatus.
- I `simple` mode einfaldar slotid status med `toSimpleWindDisplayStatus()`.
- Dot color og icon fylgja display status, ekki bara raw status.

Thessi breyting lagar ad nedri slot-litirnir verda i takti vid efra `Einfalt/Nanar` hakið.

### 3. RoadMap prototype slekkur a first-slot-auto-select og Besti

Skrar:

- `components/weather/RoadMapPrototypeMap.tsx`

`DepartureHeatmap` i RoadMap fær nu:

```tsx
selectFirstSlotWhenNone={false}
showBestWindowHint={false}
```

Afleiding:

- Ef efri `Nustadan hja Vegagerdinni` er active, tha er ekkert slot i akstursskuffu selected.
- Thegar notandi smellir a `Nuna` i skuffunni, tha verdur `selectedCandidateIdx=0` og map fer i forecast mode.
- `Besti` og ringur eiga ekki ad birtast i nyja RoadMap scrubber.

### 4. Efri label texti skyrdur

Skrar:

- `messages/is.json`
- `messages/en.json`

IS:

- `Nústaðan hjá Vegagerðinni kl. {time}`
- fallback: `Nústaðan hjá Vegagerðinni`

EN:

- `Current conditions from Vegagerðin at {time}`
- fallback: `Current conditions from Vegagerðin`

## Skra Sem Voru Skodadar

- `WORKFLOW.md`
- `Design.md`
- `components/weather/DepartureHeatmap.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/WindStatusFilterPills.tsx`
- `messages/is.json`
- `messages/en.json`
- `ai-handoff/README.md`

## Skra Sem Var Breytt

- `components/weather/DepartureHeatmap.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`
- `messages/en.json`

Athugid: vinnustreid var fyrir med ocommittadar breytingar fra fyrri Road Intelligence lotum, thar a medal:

- `components/weather/RoadMapPrototypeMap.tsx`
- `lib/road-intelligence/routeSlotStatuses.ts`
- `lib/weather/windDisplayStatus.ts`
- `lib/__tests__/road-intelligence-route-slot-statuses.test.ts`
- `lib/__tests__/windObservationStatus.test.ts`
- eldri nyjar `ai-handoff/` skrár

`.obsidian/workspace.json` var dirty og otengd. Codex snerti hana ekki.

## Skipanir Sem Voru Keyrdar

- `Get-Content -Encoding UTF8 WORKFLOW.md`
  - Exit code 0.
- `Get-Content -Encoding UTF8 Design.md`
  - Exit code 0.
- `git status --short`
  - Exit code 0, en Git syndi warning um permission a global git ignore.
- `rg -n "..."`
  - Exit code 0.
- `npm run type-check`
  - Exit code 0.
- `npm run test:run -- lib/__tests__/road-intelligence-route-slot-statuses.test.ts lib/__tests__/windObservationStatus.test.ts`
  - Exit code 0.
  - 2 test files passed, 67 tests passed.
- `git diff -- components/weather/DepartureHeatmap.tsx components/weather/RoadMapPrototypeMap.tsx messages/is.json messages/en.json`
  - Exit code 0.
- `Get-Date -Format 'yyyy-MM-dd-HHmm'`
  - Exit code 0.

## Nidurstodur

- TypeScript er grænt.
- Markviss Vitest run er grænt.
- Engin SQL, migration, commit, push, deploy, Supabase, auth eda production breyting.

## Route Intelligence Check

- Snertir Road Intelligence prototype route UI a `/auth-mvp/vedrid/road-map-prototype`.
- Snertir ekki route provider, road graph, Google Routes kall, canonical segments, station matching rules eda cache lykla.
- Lausnin er UI/state level og provider-neutral ad thvi marki ad hun skilur current provider (`Vegagerdin`) fra forecast provider (`Vedurstofan`) i vidmotinu.
- `IcelandRoadmap.md` var ekki uppfaert thvi breytingin bætir ekki vid nyjum route-domain gognum, segmentum eda matching-reglum.
- Engin persónuleg route-gögn eru vistud.

## Ahaetta / Tharf Ad Stadfesta

- `DepartureHeatmap` default behavior er viljandi ohreyft fyrir gamla `/ferdalagid`. Claude þarf ad ryna hvort eitthvert annad usage ætti ad setja `selectFirstSlotWhenNone={false}`.
- RoadMap prototype notar nu `showBestWindowHint={false}`. Ef Stebbi vill seinna hafa "best departure" i nyja kortinu þarf ad hanna thad upp a nytt, ekki endurlifga gamla `Besti` labelinn.
- Simple/detailed mode einfaldar nu slot-liti, en raw status er enn notadur fyrir counts/filter grouping undir hoodinu. Thad a ad vera rett vegna `WindStatusFilterPills` group logic, en Stebbi þarf ad stadfesta visual med localhost.

## Localhost Checks For Stebbi

Slod:

- `/auth-mvp/vedrid/road-map-prototype`
- `ROAD_INTELLIGENCE_V1_ENABLED=true`
- innskradur notandi med `road-intelligence-v1` feature access.

Prufa 1: `Nustadan hja Vegagerdinni`

1. Reikna leid, t.d. `Reykjavik -> Isafjordur`.
2. Staðfesta ad efri current-hnappur se valinn eftir ad kort opnast.
3. Hann a ad heita `Nústaðan hjá Vegagerðinni kl. hh:mm`.
4. Opna akstursskuffu.
5. Staðfesta ad `Nuna` inni i skuffunni se ekki selected a medan efri Vegagerdar current er active.

Prufa 2: `Nuna` i akstursskuffu

1. Med skuffuna opna, smella a `Nuna` inni i skuffunni.
2. Kortid a ad skipta i brottfararspa/Vedurstofu-mode.
3. Efri Vegagerdar current hnappur a ekki lengur ad vera active.
4. Smella aftur a efri `Nústaðan hjá Vegagerðinni kl. hh:mm`.
5. Skuffan a ad lokast og kortid a ad fara aftur i Vegagerdar current.

Prufa 3: Enginn `Besti`

1. Opna akstursskuffu og bída þar til brottfararslot birtast.
2. Staðfesta ad ekkert slot syni `Besti`.
3. Staðfesta ad enginn grænn best-window ringur birtist utan um god slot.

Prufa 4: `Einfalt/Nánar` stýrir nedri scrubber-litunum

1. Velja `Einfalt`.
2. Staðfesta ad nedri slot-litir sameinist i einföldu litina: grænt/appelsínugult/rautt.
3. Velja `Nánar`.
4. Staðfesta ad nedri slot-litir geta aftur synt nær-mörkum/fine-grained stöður.
5. Prófa status-pillur undir korti og inni i skuffu; þær eiga ad fylgja sama mode.

Regression ad passa:

- Gamla `/auth-mvp/vedrid/ferdalagid` heatmapid ma ekki missa first-slot default hegðun ef hún var notuð þar.
- `Nústaðan hjá Vegagerðinni` ma ekki telja eða lita eftir Veðurstofu forecast.
- Akstursskuffu-`Nuna` ma ekki sýna current Vegagerdin gildi; það er brottfararspá m.v. að leggja af stað núna.
- Ekki keyra production, Supabase, SQL eða deploy til að prófa þetta.
