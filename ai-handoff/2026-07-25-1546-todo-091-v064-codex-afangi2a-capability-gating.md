# TODO 091 v064 — Áfangi 2-A capability-gating

Created: 2026-07-25 15:46  
Timezone: Atlantic/Reykjavik

## Skilningur á samþykki

Stebbi samþykkti að Codex rýndi v063 og framkvæmdi næsta afmarkaða
framkvæmdarskref ef enginn blocker fyndist. V063 skilgreindi skref 2-A sem
`hasRoadIntelligence` capability-gating inni í `RoadMapPrototypeMap`.

Þetta leyfi náði ekki til canonical page promotion, redirect-breytinga,
`pulseBack` reclassification, route-eyðinga, commit, push, deploy, migration,
Supabase eða production.

## Rýni á v063

V063 er í meginatriðum tilbúið sem atomic promotion-plan og tekur réttar
ákvarðanir úr v062:

- legacy redirect fer fyrst á public `/vedrid`;
- auth middleware canonicalize-ar þaðan og varðveitir query;
- `/vedrid/ferdalagid` helst óbreytt;
- canonical pages munu senda explicit road-intelligence capability;
- `pulseBack` semantic breyting verður atomic með page promotion.

Eitt sequencing-frávik var tekið í 2-A: capability-prop er tímabundið
`true` að defaulti til að núverandi prototype missi ekki road layers áður en
canonical wrappers í 2-B/2-C geta sent explicit access-result. API routes eru
áfram security boundary. Þegar 2-B/2-C eru framkvæmd skulu báðir wrappers
senda prop explicit; þá má meta hvort gera eigi prop required eða default
`false`.

## Hvað var gert

### `components/weather/RoadMapPrototypeMap.tsx`

Bætt var við:

```ts
hasRoadIntelligence?: boolean
```

Capability stjórnar nú:

- hvort Vegagerðin road-network raster source/layer er yfirhöfuð búið til;
- hvort road-condition segment fetch er ræst við load eða `moveend`;
- hvort road layers geta orðið visible við context-skipti;
- hvort road-intelligence station-marker fallback er sótt;
- hvort road-surface summary er sótt;
- hvort surface/route-choice background load og UI eru virk.

Capability stjórnar ekki:

- CARTO grunnkorti;
- Veðurstofu forecast markers;
- venjulegum Vegagerðin veðurgögnum sem koma um weather-provider flæði;
- staðaleit;
- grunnleiðarreikningi;
- akstursveðurspám.

Denied API responses eru því ekki lengur notuð sem client-side
feature-detection þegar capability er `false`.

## Skrár sem breyttust í þessu skrefi

- `components/weather/RoadMapPrototypeMap.tsx`
- þessi handoff-skrá

Fyrri ócommittaðar breytingar úr v057–v063 voru varðveittar. Ótengda
`.obsidian/workspace.json` breytingin var ekki snert.

## Keyrðar skipanir

1. Read-only leit og kóðaskoðun á öllum road-intelligence fetchum, layers,
   refs, route-surface state og UI consumers í `RoadMapPrototypeMap`.
2. `npm.cmd run type-check`
   - Exit code 0.
3. `npm.cmd run test:run -- lib/__tests__/pulseBack.test.ts lib/__tests__/road-map-navigation.test.ts lib/__tests__/pulseTarget.test.ts`
   - Exit code 0.
   - 3 files, 54 tests passed.
4. `git diff --check`
   - Exit code 0.
   - Aðeins line-ending warnings á fyrirliggjandi vinnuskrám.

Enginn dev server var ræstur eða endurræstur.

## Rýni sem Claude Code á að gera

1. Staðfesta að `station-markers` fallback sé rétt road-intelligence consumer,
   en að aðal Vegagerðin weather-provider flæði eigi áfram að vera óháð
   capability.
2. Staðfesta að surface route-choice UI eigi allt að vera falið þegar
   capability er `false`; route alternatives endpointið sjálft er ekki
   security-gated en þetta UI er bundið surface feature-inu.
3. Leita að öðrum óbeinum consumers af `map-proxy`, `road-segments`,
   `road-surface` eða `station-markers` sem kunna að vera utan þessa
   components.
4. Við 2-B/2-C: senda `hasRoadIntelligence` explicit frá báðum canonical page
   wrappers. Ekki reiða sig á compatibility-default.
5. Í loka atomic promotion: meta hvort prop verði required eða default
   `false` eftir að legacy page er orðin redirect.

## Eftirstandandi áhætta

- Engin component/browser-test fixture er til sem sannreynir network silence
  með `hasRoadIntelligence={false}`. Þetta þarf manual localhost check eða
  afmarkað test harness áður en promotion er gefið út.
- Map initialization effect mount-ar einu sinni; capability er ætlað að vera
  immutable server-derived prop fyrir hverja page mount. Runtime toggle er
  ekki stutt.
- Atomic page promotion, redirect og `pulseBack` breytingar eru enn
  óframkvæmdar.

## Route intelligence check

Engin route-family, vegkaflaþekking, provider matching regla, route cache eða
persónuleg ferðagögn breyttust. Breytingin stýrir aðeins access að núverandi
provider-neutral UI capability yfir Vegagerðin-backed same-origin endpoints.
`IcelandRoadmap.md` þarf ekki uppfærslu.

## Design.md samræmi

Notendur án capability fá ekki dauð road controls, ósýnileg hálfhlaðin layers
eða væntanlegar 404-villur. Grunnkort og meginakstursflæði haldast tiltæk.
Engin layout-, mobile zoom-, overflow- eða navigation-breyting var gerð.

## Localhost checks for Stebbi

Skref 2-A er ekki enn tengt canonical pages, svo núverandi prototype notar
compatibility-default og á að líta eins út og áður.

Eftir að Claude Code hefur tímabundið eða með test wrapper sannreynt bæði
prop-gildi:

1. `hasRoadIntelligence={true}`:
   - opna prototype og reikna leið;
   - vænt: vegakerfi, vegfærðarkaflar og surface route choices virka eins og
     áður.
2. `hasRoadIntelligence={false}`:
   - opna kort og reikna leið;
   - vænt: grunnkort, staðaleit, leið og Veðurstofuveður virka;
   - engin köll á
     `/api/teskeid/road-intelligence/map-proxy`,
     `/road-segments`, `/road-surface` eða `/station-markers`;
   - engar tilheyrandi 401/403/404 villur í console;
   - ekkert surface/road control eða hálftómt surface UI.
3. Prófa mobile map/information tabs:
   - vænt: engin overlap, overflow eða dauð controls.

Ekki prófa production, deploy, Supabase, RLS eða raunveruleg notendagögn.

## Næsta skref

Claude Code rýnir skref 2-A sérstaklega. Ef enginn blocker finnst og Stebbi
gefur skýrt framkvæmdarleyfi er næsta skref atomic 2-B til 2-G promotion,
ásamt explicit capability props, redirect tests, `pulseBack` tests,
type-check, fullum tests, build og `git diff --check`.

## Framkvæmdarstaða

Ekkert commit, push, deploy, migration, Supabase-, env- eða
production-inngrip var gert.

