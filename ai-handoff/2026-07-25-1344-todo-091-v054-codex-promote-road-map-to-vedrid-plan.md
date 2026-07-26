# TODO 091 v054 — plan til að setja nýja kortið undir `/vedrid`

Created: 2026-07-25 13:44  
Timezone: Atlantic/Reykjavik

## Niðurstaða

Enginn grunn-tæknilegur eða release-build blocker kemur í veg fyrir promotion.
Release candidate v053 er grænn í type-check, fullri Vitest suite og production
build.

Promotion er þó **ekki öruggt sem einfalt rename eða file move**. Núverandi
route-, auth- og navigation-contract þarf að samræma fyrst.

## Það sem er fyrir

### 1. `/vedrid` er nú þegar virk vara

- Public `/vedrid` renderar `WeatherOverviewClient`.
- Authenticated `/auth-mvp/vedrid` renderar sama overview með authenticated
  menu og feature access.
- Middleware redirectar innskráðum notanda frá `/vedrid` yfir á
  `/auth-mvp/vedrid`.

Ákvörðun þarf að vera skýr: nýja kortið á að **leysa overviewið af hólmi** á
báðum routes, ekki aðeins public `/vedrid`, annars sjá public og auth notendur
ólíka vöru.

### 2. Hardcode-aðar prototype-slóðir

`RoadMapPrototypeMap` og `DriveJourneyPanel` vísa enn á
`/auth-mvp/vedrid/road-map-prototype` fyrir:

- route return snapshot;
- „Til baka í akstur“;
- pulse `returnTo`;
- sign-in `next`;
- point-selection fallback.

Þetta þarf að parameterize-a með canonical public/auth base path. Annars
hoppar notandi aftur á prototype-slóðina eftir station page eða innskráningu.

### 3. MapLibre CSS og viewport

MapLibre CSS og `viewportFit: cover` eru aðeins í
`app/auth-mvp/vedrid/road-map-prototype/layout.tsx`.

Við promotion þarf sameiginlegt weather layout eða öruggan annan import-stað
sem nær bæði `/vedrid` og `/auth-mvp/vedrid`. Annars getur kortið misst
stærð/controls við fyrstu render.

### 4. Public vs authenticated shell

`RoadMapPrototypeMap` tekur nú aðeins `isAuthenticated`. Promotion þarf lítið
page wrapper contract, til dæmis:

- `basePath`;
- `stationPulseBase` eða `returnBase`;
- `menuVariant`;
- `tripHref`, ef gamla `/vedrid/ferdalagid` flæðið á að vera áfram.

Middleware-canonicalization má halda áfram, en báðir page entrypoints þurfa að
rendera sama nýja component með réttum props.

### 5. Station pages

Canonical pulse pages eru undir `/auth-mvp/vedrid/puls/...` og krefjast auth.
Public notandi á nýju `/vedrid` getur séð punkta, en smellur á full station
page getur því leitt í innskráningu.

Stebbi þarf að staðfesta annað af þessu:

- full station cards eru auth-only og public notandi fær skýrt sign-in flow;
- eða read-only public station routes eru gerðar canonical undir `/vedrid`.

Ekki opna chat/thread/write endpoints public. Public preview endpoints eru nú
read-only og afmörkuð.

### 6. Gamla overview-flæðið

Núverandi `WeatherOverviewClient` inniheldur route-memory picker,
overview-selection URLs og `/vedrid/ferdalagid` tengingar. Áður en honum er
skipt út þarf Claude Code að staðfesta hvaða virkni nýja kortið hefur þegar
tekið yfir og hvað má ekki týnast.

## Mælt promotion-plan

1. Extract-a sameiginlegan page wrapper, til dæmis
   `RoadMapWeatherPage`, sem renderar `RoadMapPrototypeMap` með base-path props.
2. Parameterize-a öll prototype path literals.
3. Láta bæði:
   - `app/vedrid/page.tsx`;
   - `app/auth-mvp/vedrid/page.tsx`
   rendera sama nýja wrapperinn með public/auth stillingum.
4. Færa MapLibre CSS/viewport contract upp í layouts sem ná báðum routes.
5. Halda `/auth-mvp/vedrid/road-map-prototype` tímabundið sem redirect á
   canonical `/vedrid` eða `/auth-mvp/vedrid`, með query string varðveittum.
6. Uppfæra `pulseBack`, sign-in `next`, route restore og tests fyrir canonical
   paths.
7. Staðfesta að `/vedrid/ferdalagid` og authenticated counterpart haldist
   virk þar til Stebbi ákveður annað.
8. Keyra fullan v053 staðfestingarhring og sérstök middleware/page/browser
   regression-próf.

## Route intelligence check

Promotion breytir aðeins canonical UI route og navigation. Það bætir ekki við
nýrri route-family, segmenti, caution eða provider-reglu. Engin breyting á
`IcelandRoadmap.md` eða `lib/iceland-routes/` er nauðsynleg nema promotion
fjarlægi eða breyti route-memory contract gamla overview-skjásins.

## Security og rollout

- Public road APIs eru tilbúin fyrir `WEATHER_ENABLED=All`, en Claude Code þarf
  áfram að rýna map-proxy abuse/cost.
- Ekki opna auth pulse/chat endpoints með prefix-reglu.
- Halda kill switch `WEATHER_ENABLED`.
- Engin SQL eða migration ætti að þurfa.
- Mælt er með einu promotion commit og redirect compatibility, ekki að eyða
  prototype route strax.

## Localhost checks for Stebbi

Eftir framkvæmd:

1. Óinnskráður, `WEATHER_ENABLED=All`:
   - `/vedrid` sýnir nýja kortið;
   - public session/default stations og Akstur virka;
   - refresh og tab-state haldast.
2. Innskráður:
   - `/vedrid` canonicalize-ar á `/auth-mvp/vedrid`;
   - sama nýja kort birtist með authenticated menu/autosave.
3. Gamall prototype-linkur:
   - `/auth-mvp/vedrid/road-map-prototype?...` redirectar á rétt canonical
     route og varðveitir query/restore context.
4. Smella á Veðurstofu- og Vegagerðarpunkta og fara til baka með bæði UI-back
   og browser/síma-back.
5. Prófa sign-in frá public save CTA:
   - `next` lendir á canonical authenticated weather route;
   - session staðir/settings merge-ast án overwrite.
6. Prófa `/vedrid/ferdalagid` og `/auth-mvp/vedrid/ferdalagid`.
7. Prófa middleware við `WEATHER_ENABLED=off`, `Authenticated` og `All`.
8. Prófa 360, 390, 460, 530 px og desktop; console án hydration, 401,
   `map_not_ready` eða navigation loop.

## Tillaga Codex

Já, halda áfram með promotion, en sem lítinn afmarkaðan route-integration
pakka samkvæmt skrefunum hér að ofan. Ekki leggja nýja componentinn beint í
`app/vedrid/page.tsx` með núverandi hardcode-uðum prototype-slóðum.

Confidence: hátt.
