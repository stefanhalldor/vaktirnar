# 2026-07-22-1807-todo-086-v332-codex-eta-nearest-forecast-prerelease

Created: 2026-07-22 18:07  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
TODO: 086 / Road Intelligence MapLibre prototype

## Skilningur á samþykki

Stebbi bað Codex að skoða hvers vegna nýja Road Intelligence kortið notar Veðurstofuspá kl. 18 fyrir Mývatnsöræfi þegar gamla `/ferdalagid` notar kl. 21 við sama brottfarartíma kl. 19, og að samræma nýju hegðunina við gamla.

Þetta fól í sér afmarkaða kóðabreytingu og testabreytingu í repo. Þetta fól ekki í sér commit, push, deploy, SQL, migration, Supabase eða production breytingar.

## Rótorsök

Gamla `/ferdalagid` flæðið velur Veðurstofu forecast row með minnstu fjarlægð frá ETA stöðvarinnar:

`ETA = departureMs + routeFraction * routeDurationMs`

Síðan er valin sú `forecastRows` færsla sem er næst ETA, með absolute-diff samanburði.

Nýja Road Intelligence kortið notaði hins vegar `selectForecastRowAt()` / `classifyForecastWindDisplayStatusAt()`, sem eru hönnuð fyrir yfirlitskortið og nota at-or-before reglu: nýjasta spáröð sem er <= anchor tíma. Því lenti ETA milli kl. 18 og kl. 21 á kl. 18, jafnvel þegar kl. 21 er nær og gamla `/ferdalagid` hefði valið kl. 21.

## Hvað var gert

Bætt var við sérstöku route/ETA helper-pari í `lib/weather/windDisplayStatus.ts`:

- `selectNearestForecastRowAt()`
- `classifyNearestForecastWindDisplayStatusAt()`

Þessi helper er notaður aðeins þar sem verið er að meta stöðvar á leið m.v. ETA. Gamla `selectForecastRowAt()` hélt at-or-before hegðun sinni fyrir overview/specific forecast slot notkun.

Road Intelligence route scrubber og route Veðurstofu-lagið voru tengd við nýja helperinn:

- `lib/road-intelligence/routeSlotStatuses.ts`
  - `countVedurstofanForecastStatusesAt()` notar nú nearest ETA forecast row.
- `components/weather/RoadMapPrototypeMap.tsx`
  - `renderVedurstofanStations()` notar nú nearest ETA forecast row bæði fyrir marker status og valda forecast row í label/popup gögnum.

## Skrár skoðaðar

- `WORKFLOW.md`
- `ai-handoff/README.md`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `lib/weather/windDisplayStatus.ts`
- `lib/road-intelligence/routeSlotStatuses.ts`
- `components/weather/RoadMapPrototypeMap.tsx`
- `lib/__tests__/windObservationStatus.test.ts`
- `lib/__tests__/road-intelligence-route-slot-statuses.test.ts`

## Skrár breyttar

- `lib/weather/windDisplayStatus.ts`
  - bætti við nearest ETA forecast helperum án þess að breyta overview helpernum.
- `lib/road-intelligence/routeSlotStatuses.ts`
  - skipti ETA slot status talningu yfir í nearest ETA helper.
- `components/weather/RoadMapPrototypeMap.tsx`
  - skipti route Veðurstofu marker/label forecast selection yfir í nearest ETA helper.
- `lib/__tests__/windObservationStatus.test.ts`
  - bætti unit tests fyrir nearest forecast selection.
- `lib/__tests__/road-intelligence-route-slot-statuses.test.ts`
  - bætti regression test fyrir 19:00 departure / ETA 20:30 / forecast 18 vs 21 tilfellið.

Athugið: sama worktree inniheldur enn eldri ócommittuð v329/v331 verk í `components/weather/RoadMapPrototypeMap.tsx`, `lib/road-intelligence/routeSlotStatuses.ts` og `lib/__tests__/road-intelligence-route-slot-statuses.test.ts`. Þessi handoff lýsir nýjustu ETA-forecast breytingunni ofan á þá stöðu.

## Skipanir keyrðar

- `rg -n "selectForecastRowAt|classifyForecastWindDisplayStatusAt|forecastRows|routeFraction|departureMs|departureIso|ftimeIso|arrival|eta" ...`
  - Exit code: 0
  - Niðurstaða: staðfesti muninn á gömlu nearest-ETA lógíkinni og nýja at-or-before helpernum.
- `Get-Content -Encoding UTF8 "WORKFLOW.md"`
  - Exit code: 0
- `Get-Content -Encoding UTF8 "ai-handoff/README.md"`
  - Exit code: 0
- `npm run test:run -- windObservationStatus road-intelligence-route-slot-statuses`
  - Exit code: 0
  - 2 test files passed, 67 tests passed.
- `npm run type-check`
  - Exit code: 0
- `git diff --check`
  - Exit code: 0
  - Aðeins line-ending warnings, engar whitespace villur.
- `git status --short`
  - Exit code: 0
  - Sýndi einnig unrelated `.obsidian/workspace.json` dirty state sem Codex snerti ekki.

## Niðurstaða

Nýja Road Intelligence kortið ætti nú að velja sama Veðurstofu forecast row og gamla `/ferdalagid` þegar verið er að meta stöð á leið m.v. ETA.

Dæmið sem þetta grípur:

- Brottför: 19:00
- Stöð á 50% af 3 klst leið
- ETA: 20:30
- Forecast rows: 18:00 og 21:00
- Nýja kortið velur nú 21:00, ekki 18:00.

## Áhætta / edge cases

- Tie behavior heldur fyrstu röðinni sem finnst, eins og gamla `/ferdalagid` reduce-lógíkin gerði. Ef forecast rows eru sorted ascending og ETA er nákvæmlega mitt á milli tveggja spátíma, verður fyrri spátíminn valinn.
- Overview helperinn var ekki breyttur. Það er vísvitandi til að minnka regression áhættu á `/vedrid` yfirlitinu.
- Ef `forecastRows` eru ósorteruð skiptir það ekki máli fyrir nearest valið nema í nákvæmu jafntefli.

## Route Intelligence Check

- Snertir route weather ETA matching fyrir allar leiðir í nýja MapLibre Road Intelligence kortinu.
- Engum nýjum canonical segmentum, control points, route cache lyklum eða Supabase gögnum var bætt við.
- Lausnin er provider-neutral að því marki að helperinn vinnur á almennum forecast row gögnum, en consumerinn er Veðurstofu route layer.
- Engin persónugögn, route geometry eða production gögn voru vistuð.
- `IcelandRoadmap.md` var ekki uppfært þar sem þetta er forecast row selection bugfix en ekki ný leiðaþekking eða vegagrunnsákvörðun.

## Localhost checks for Stebbi

Opna:

- `http://localhost:3004/auth-mvp/vedrid/road-map-prototype`
- bera saman við gamla `/auth-mvp/vedrid/ferdalagid` ef sama leið er prófuð þar.

Skref:

1. Reikna sömu leið og í skjámyndinni, með brottfarartíma kl. 19 ef UI býður upp á departure-slot val.
2. Velja forecast slotinn sem sýndi áður Mývatnsöræfi kl. 18 í nýja kortinu.
3. Smella/opna Mývatnsöræfi eða skoða label/popup sem sýnir hvaða forecast row er notað.
4. Vænt niðurstaða: nýja kortið notar kl. 21 þegar ETA stöðvarinnar er nær kl. 21 en kl. 18.
5. Athuga líka að `/vedrid` overview forecast scrubber hegði sér eðlilega þegar valinn er nákvæmur forecast time slot.

Regressions sem þarf að passa:

- Núna/Vegagerðin current route mode á ekki að breytast.
- Future departure slots eiga enn að lita sig eftir Veðurstofu ETA stöðvum.
- Yfirlitskortið á ekki að byrja að velja óvæntan næsta framtíðar forecast þegar notandi smellir á ákveðinn forecast tíma í scrubber.

## Næsta skref

Claude Code ætti að rýna sérstaklega:

1. Hvort `renderVedurstofanStations()` sé eini route map staðurinn þar sem selected forecast row þarf nearest ETA regluna.
2. Hvort `countVedurstofanForecastStatusesAt()` með nearest ETA dugir fyrir scrubber status litina í öllum departure slots.
3. Hvort tie behavior eigi að vera nákvæmlega eins og gamla `/ferdalagid` eða hvort við viljum síðar taka vöruákvörðun um að velja framtíðarspá í jafntefli.

## SQL / Supabase

Engin SQL breyting, engin migration, ekkert keyrt í Supabase, engin RLS/auth/grants/policies/functions breyting og engin production áhrif.

