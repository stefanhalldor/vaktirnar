# TODO 091 v062 — Codex review á v061 og ákvörðun um næsta skref

Created: 2026-07-25 15:14  
Timezone: Atlantic/Reykjavik

## Niðurstaða

V061 leysir sequencing-finding v060 í vinnutrénu: `/vedrid` og
`/auth-mvp/vedrid` eru áfram `overview` þar til page promotion verður
framkvæmt atomically. Type-check og 54 targeted próf eru græn.

**Page promotion er þó ekki tilbúið til framkvæmdar samkvæmt v061 óbreyttu.**
Redirect-designið er rangt fyrir public legacy notendur og Next.js 15
`searchParams` contract, og access-málið þarf explicit capability-gating.

Codex breytti engum runtime-skrám í þessari rýni.

## Findings

### High — prototype redirect má ekki fara beint á auth-only canonical slóð

V061 leggur til redirect frá
`/auth-mvp/vedrid/road-map-prototype` yfir á `/auth-mvp/vedrid`.

Gamla prototype-slóðin er hins vegar skráð sem exact public path í
`middleware.ts:77`. Public bókamerki og eldri tenglar myndu því fara frá
public síðu yfir á auth-only síðu og enda í innskráningu. Það væri regression
frá núverandi public prototype.

**Ákvörðun:** Legacy redirect á að fara á public canonical `/vedrid` og
varðveita query string. Middleware canonicalize-ar síðan innskráðan notanda
frá `/vedrid` yfir á `/auth-mvp/vedrid`, með query óbreytt.

Targeted tests þurfa að staðfesta:

- public prototype URL → `/vedrid?...`;
- authenticated prototype URL → `/vedrid?...` → `/auth-mvp/vedrid?...`;
- query values, repeated keys og route restore state varðveitast;
- engin redirect loop.

### High — v061 redirect-signature passar ekki við Next.js 15 í repo-inu

V061 sýnir synchronous:

```ts
searchParams: Record<string, string | string[]>
```

Núverandi Next.js 15 síður í repo-inu nota
`searchParams: Promise<...>` og `await searchParams`, meðal annars pulse
station pages. Redirect-page þarf því að vera `async` og await-a
`searchParams`.

Nota skal typed helper eða afmarkað server-component implementation sem
varðveitir `string | string[] | undefined`. Ekki smíða slóð með handvirkri
óescaped string-concatenation.

### High — velja explicit road-intelligence capability, ekki hljóðlát 404

V061 mælir með valkosti A, þar sem allir authenticated weather users fá
componentinn og gated road-intelligence fetches mega mistakast hljóðlega.
Það er ekki öruggt UX- eða diagnostics-contract:

- `resolveAuthenticatedWeatherShellAccess()` leyfir notendum án
  `road-intelligence-v1` að opna weather shell;
- road segment fetch kastar á non-OK;
- map-proxy raster source getur framleitt tile errors;
- component-comment segir að virkni sé aðeins sýnileg notendum með flaggið.

**Ákvörðun:** Nota valkost B, en sem capability fremur en page-wide gate:

- `RoadMapPrototypeMap` fær explicit `hasRoadIntelligence` boolean;
- public `/vedrid` í `WEATHER_ENABLED=all` fær capability `true`, í samræmi
  við API access;
- authenticated page reiknar capability sem
  `WEATHER_ENABLED=all || checkFeatureAccess(..., 'road-intelligence-v1')`;
- capability stjórnar road-network source, segment fetchum, surface fetchum
  og tengdum controls;
- grunnveðurkort og akstursreikningur mega áfram virka án capability;
- engin viljandi 401/403/404 console-noise sem feature-detection.

Þetta er ekki krafa um að afrita `RoadIntelligencePreview`; það component
tilheyrir gamla overview UI og fellur út með promotion.

### Medium — halda `/vedrid/ferdalagid` óbreyttu í þessum áfanga

Standalone route-ið hefur eigið `FerdalagidClient`, feature/access hegðun,
middleware canonicalization og deep-link contracts. Að fjarlægja eða
redirecta það stækkar promotion scope án þess að vera nauðsynlegt.

**Ákvörðun:** Valkostur A. Halda bæði public og authenticated
`/vedrid/ferdalagid` óbreyttum í áfanga 2. Meta deprecation sérstaklega síðar.

### Medium — nested prototype layout má fjarlægja, loading þarf replacement

Nýju parent layouts sjá um MapLibre CSS og viewport. Nested
`road-map-prototype/layout.tsx` verður því redundant eftir redirect.

`road-map-prototype/loading.tsx` má þó ekki einfaldlega hverfa án þess að
staðfesta canonical route loading UX. `Design.md` og `AGENTS.md` krefjast
canonical Teskeið-loader fyrir route transitions sem geta beðið. Promotion
þarf að tryggja `app/vedrid/loading.tsx` og
`app/auth-mvp/vedrid/loading.tsx`, eða rökstyðja endurnýtingu úr parent
segment.

### Low — v061 handoff timestamp er aftur ósamræmt

Filename segir `1510`, `Created` segir `15:30`, en skráin var komin til
Codex áður en staðartímaskipun sýndi `15:13`. Næsta Claude Code handoff þarf
að nota raunverulegt úttak tímaskipunar rétt áður en skráin er búin til.

## Samþykkt compatibility matrix

| Contract | Ákvörðun fyrir áfanga 2 |
|---|---|
| `isOverview` | Fellur út |
| `tripHref` | Fellur út úr canonical map page; standalone trip route helst |
| `stationPulseReturnBase` | Leyst með `navigation` |
| `menuVariant` | Leyst með `isAuthenticated` |
| `hasRoadIntelligence` | Ný explicit capability-prop |
| Public canonical | `/vedrid` |
| Auth canonical | `/auth-mvp/vedrid` |
| Legacy prototype redirect | Alltaf fyrst á `/vedrid`, query varðveitt |
| `/vedrid/ferdalagid` | Óbreytt |

## Næsta afmarkaða framkvæmdarskref

Claude Code getur útbúið **leiðrétt implementation plan fyrir atomic áfanga
2**, byggt á ákvörðunum hér að ofan. Runtime-framkvæmd á page promotion þarf
síðan skýrt framkvæmdarleyfi Stebba samkvæmt `WORKFLOW.md`.

Plan og tests eiga að ná yfir:

1. capability-prop og allar road-intelligence network/UI branches;
2. public/auth canonical page wrappers;
3. Promise-based query-preserving redirect til `/vedrid`;
4. middleware redirect chain og query preservation;
5. atomic `pulseBack` reclassification;
6. canonical loading routes;
7. preservation á `/vedrid/ferdalagid`;
8. full type-check, targeted tests, full tests, build og `git diff --check`.

## Keyrðar skipanir

1. Read-only code searches og skráaskoðun á pages, middleware, API gates,
   Map component, trip routes og loading/layout files.
2. `npm.cmd run type-check`
   - Exit code 0.
3. `npm.cmd run test:run -- lib/__tests__/pulseBack.test.ts lib/__tests__/road-map-navigation.test.ts lib/__tests__/pulseTarget.test.ts`
   - Exit code 0.
   - 3 files, 54 tests passed.

Enginn dev server var ræstur eða endurræstur.

## Route intelligence check

Rýnin snertir aðeins access og navigation að reusable road-intelligence
endpoints. Engin route-family, control point, provider matching, route cache
eða ferðagögn breyttust. `IcelandRoadmap.md` þarf því ekki uppfærslu.

## Design.md samræmi

Explicit capability kemur í veg fyrir dauð controls og console-errors hjá
notendum sem hafa ekki feature-aðgang. Canonical loading routes halda
sýnilegu feedbacki á mobile og desktop. Standalone trip flow helst óbreytt,
sem minnkar regression-scope.

## Localhost checks for Stebbi

Eftir að atomic áfangi 2 hefur fengið sérstakt framkvæmdarleyfi og verið
útfærður:

1. Public, signed out, `WEATHER_ENABLED=all`:
   - opna `/vedrid`;
   - vænt: promoted kort, public menu, road layers tiltæk;
   - opna legacy prototype URL með route query;
   - vænt: `/vedrid` með sama query og endurheimtu view.
2. Authenticated með `road-intelligence-v1`:
   - opna `/vedrid`;
   - vænt: middleware sendir á `/auth-mvp/vedrid`, query varðveitt;
   - road layers og controls tiltæk.
3. Authenticated án `road-intelligence-v1` þegar weather er ekki public:
   - vænt: grunnkort og veður/akstur virkar;
   - road-intelligence layers/controls ekki sýnd eða sótt;
   - engar væntanlegar 401/403/404 villur í console.
4. Opna `/vedrid/ferdalagid` og authenticated counterpart:
   - vænt: núverandi standalone flow er óbreytt.
5. Prófa Veðurstofu- og Vegagerðarspjald:
   - „Til baka í akstur“;
   - sama route/view endurheimtist;
   - browser/device back hegðar sér eins.
6. Staðfesta loader við canonical route transition og að MapLibre CSS,
   viewport, mobile scroll og overflow séu rétt.

Ekki prófa production, deploy, Supabase, RLS eða raunveruleg notendagögn án
sérstaks leyfis.

## Framkvæmdarstaða

Aðeins þessi review/handoff-skrá var búin til. Engum runtime-, test-,
middleware-, route-, config- eða gagnaskrám var breytt. Ekkert commit, push,
deploy, migration eða production-inngrip var gert.

