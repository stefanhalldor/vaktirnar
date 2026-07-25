# TODO #091 — Release candidate review for Akstur / Road Map prototype

Created: 2026-07-25 10:19  
Timezone: Atlantic/Reykjavik

## Niðurstaða

**Engin release-blocking findings fundust í static review eða sjálfvirkum
release checks.**

Release candidate er grænn í:

- TypeScript type-check
- allri Vitest suite
- Next.js production build
- `git diff --check`
- JSON parsing á íslenskum og enskum messages

Stebbi bað Codex að prófa allt sem bíður útgáfu og útbúa handoff fyrir Claude
Code, sem mun síðan gefa út. Codex commit-aði, push-aði eða deployaði ekki.

## Findings / eftirstandandi áhætta

### Engin blocking findings

Engin type-, compile-, test-, RLS-, auth-, SQL- eða migration-villa fannst.
Engin SQL, Supabase, RLS, grants, functions, secrets eða production-gögn
breyttust í þessum release candidate.

### Non-blocking: browserprófun þarf enn

Automated suite sannreynir ekki að fullu:

- public 25 mínútna save-prompt og 30 mínútna session TTL;
- focus, Escape og skjálesarahegðun custom save-dialogsins;
- login-return sem les pending weather preferences og vistar þau;
- sjónræna forecast-card collision avoidance;
- sticky töfluhausa, „Fleiri…“ og „Stækka kort“ á raunverulegum mobile skjá.

Stebbi hefur verið að prófa breytingarnar á localhost. Claude Code skal ekki
líta á græn automated checks sem staðgengil fyrir checklistann neðar.

### Non-blocking: build warnings

`npm run build` var grænt en sýndi fyrirliggjandi ESLint warnings. Relevant
warning í release-skrá:

- `components/weather/RoadMapPrototypeMap.tsx:5961`
  - mount-effect með tómri dependency-listu notar nú meðal annars
    `isAuthenticated`.
  - Effectið er hannað sem one-time MapLibre initialization og prop-ið er
    server-resolved/stöðugt fyrir lifetime componentsins.
  - Ekki blocking fyrir þennan release, en Claude Code má ekki „laga“
    dependency-listann vélrænt fyrir útgáfu; það gæti endurinitializað kortið.

Aðrar build warnings voru í eldri/ótengdum skrám eða fyrirliggjandi
MapLibre-effectum. Build exit code var 0.

Vitest skrifaði tvisvar:

`Not implemented: navigation to another Document`

Þetta kom frá jsdom en engin test mistókust.

## Release scope — product files

Claude Code skal yfirfara og gefa út þessar product-breytingar:

- `components/weather/DepartureHeatmap.tsx`
- `components/weather/DriveJourneyPanel.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/WeatherChasePanel.tsx`
- `components/weather/WindStatusFilterPills.tsx`
- `messages/is.json`
- `messages/en.json`

## Hvað release candidate gerir

### Akstur og leiðaspá

- „Fleiri…“ er nú inni í lárétta departure scrubbernum.
- Mini-map í Akstri fær „Stækka kort“ sem opnar route map-context.
- Forecast-card collision placement tekur tillit til næsta marker-punkts til
  hægri.
- Route wind-limit inputs byrja tóm.
- Innskráður notandi með vistuð vindmörk getur valið „Nota síðustu vindmörk“.

### Veðurstöðvar og samanburðartafla

- Litlar töflur með allt að þrjár stöðvar hafa sticky station header.
- Wind-status pills toggle-a nú úr „show all“ með því að taka valinn flokk út
  og collapse-a aftur í empty-set þegar allt er valið.
- „Vista mínar veðurvæntingar“ birtist public notanda aðeins eftir
  raunverulega breytingu á hita-, vind- eða úrkomugildi.
- Þegar hámarksúrkomumörk eru `0` birtast jákvæð gildi undir `0,1` með meiri
  nákvæmni:
  - `0,01`–`0,09` með tveimur aukastöfum;
  - undir `0,01` sem `<0,01`;
  - raunverulegt núll áfram sem `0`.

### Public session og vistun

- Stöðvaval public notanda lifir Gagna/Kort view-switch.
- Sama val lifir refresh í sama browser-tab með `sessionStorage`.
- Public session draft er aðeins endurheimt ef það er yngra en 30 mínútur.
- Eftir 25 mínútur birtist „Viltu geyma veðurstillingarnar?“.
- „Halda áfram tímabundið“ endurnýjar session gluggann.
- „Skrá inn og geyma“ setur pending preferences og fer beint í login án
  óþarfs 401 PUT.
- Public hydration sleppir auth-only preferences GET og public map sleppir
  feature-gated road-segment requestum. Þetta fjarlægir console 401 noise.
- React maximum-update-depth loop var brotin með identity comparison áður en
  parent preference-state er uppfært.

## Skrár skoðaðar

- `AGENTS.md` leiðbeiningar úr session context
- `WORKFLOW.md`
- `Design.md`
- `IcelandRoadmap.md`
- `ai-handoff/README.md`
- allar product-skrár í release scope
- `package.json`
- `TODO.md` með `rg` leit
- git status, stat, diff og fyrri handoff v031–v034

## Skrár breyttar af Codex í síðasta localhost-hring

- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/WeatherChasePanel.tsx`
- `messages/is.json`
- `messages/en.json`
- handoff v031–v035

Aðrar product-breytingar í release scope voru þegar ócommittaðar og voru
varðveittar.

## Skipanir og niðurstöður

### Type-check

```text
npm run type-check
Exit code: 0
tsc --noEmit
```

### Öll Vitest suite

```text
npm run test:run
Exit code: 0
Test Files: 135 passed (135)
Tests: 3598 passed | 27 skipped | 8 todo (3633)
Duration: 43.99s
```

### Production build

```text
npm run build
Exit code: 0
Next.js: 15.5.14
Compiled successfully: 8.7s
Static pages generated: 100/100
/auth-mvp/vedrid/road-map-prototype: 48.4 kB, First Load JS 265 kB
```

### Aðrar checks

```text
git diff --check
Exit code: 0

messages/is.json | ConvertFrom-Json
Exit code: 0

messages/en.json | ConvertFrom-Json
Exit code: 0
```

Dev server var ekki ræstur, stöðvaður eða endurræstur.

## Git/worktree varúð fyrir Claude Code

Núverandi status inniheldur einnig:

- `.obsidian/workspace.json` modified
  - Þetta er local workspace-state og á **ekki** að fara í product release
    nema Stebbi biðji sérstaklega um það.
- `ai-handoff/2026-07-24-1430-todo-091-v006-claude-pills-loader-nav-saved-places.md`
  er deleted.
- `ai-handoff/2026-07-24-1400-todo-091-v006-claude-pills-loader-nav-saved-places.md`
  er untracked.
  - Þetta lítur út eins og leiðrétting á filename/tíma fyrir sama v006
    handoff. Claude Code skal staðfesta rename-intent áður en staging fer fram.
- Handoff v031–v035 eru untracked og mega fylgja collaboration history ef það
  er venjan, en eru ekki runtime product dependency.

Claude Code skal stage-a með explicit file paths, ekki `git add .`.

## Design.md samræmi

- Mobile-first bottom-sheet notar safe-area padding.
- Primary og secondary actions eru 44 px eða hærri.
- Inputs halda `text-base` á mobile.
- Engin ný route navigation var búin til án feedback; save-login notar
  full-page navigation og pending payload.
- Sticky headers og compact controls draga úr endurtekningu án nested-card
  flækju.

Eftirstandandi accessibility atriði: custom save-dialog hefur `role=dialog`,
`aria-modal` og label, en ekki fulla focus trap/Escape stjórnun eins og Radix
Dialog myndi gefa. Ekki talið blocking fyrir þennan prompt, en þarf manual
keyboard check.

## Route intelligence check

- Breytingarnar snerta route map presentation, route forecast timeline og
  public/auth access að feature-gated road-segment lagi.
- Engin ný canonical leið, vegkafli, control point, station matching regla,
  cache lykill eða persisted route observation var bætt við.
- Public notandi fær provider-neutral weather map en ekki auth-only
  road-segment fetch.
- Engin nákvæm heimilisföng eða persónulegar ferðir eru geymdar; public
  sessionStorage geymir aðeins valdar public station/place preferences.
- `IcelandRoadmap.md` var því ekki uppfært.

## Localhost checks for Stebbi

### Public veðurstöðvar og session

Slóð:
`/auth-mvp/vedrid/road-map-prototype`

State: signed-out/public í nýjum browser-tab.

1. Velja aðrar veðurstöðvar.
2. Skipta Gögnum → Kort → Gögn.
3. Vænt: stöðvaval helst og engin `Maximum update depth exceeded`.
4. Refresh-a í sama tab.
5. Vænt: valið endurheimtist.
6. Opna nýjan tab.
7. Vænt: draft flyst ekki milli taba.
8. Skoða console við load, zoom og pan.
9. Vænt: engin 401 frá `/preferences/chase` eða `/road-segments`.

### Save prompt og login-return

Til að prófa án 25 mínútna biðar má tímabundið lækka
`PUBLIC_WEATHER_CHASE_PROMPT_DELAY_MS` local-only. Ekki stage-a eða commit-a
þeirri tímabundnu breytingu.

1. Láta prompt birtast.
2. Velja „Halda áfram tímabundið“ og einnig prófa X.
3. Vænt: prompt lokast og núverandi val helst.
4. Opna prompt aftur og velja „Skrá inn og geyma“.
5. Vænt: login opnast; eftir login/return vistast pending preferences.
6. Staðfesta keyboard Tab, Shift+Tab og Escape hegðun. Escape er ekki
   sérútfært og þarf product ákvörðun ef það reynist truflandi.

Ekki prófa með raunverulegum production notendagögnum eða secrets.

### Veðurvæntingar og úrkoma

1. Opna public settings án þess að breyta gildum.
2. Vænt: „Vista mínar veðurvæntingar“ er falinn.
3. Breyta einu normalized gildi.
4. Vænt: takkinn birtist.
5. Setja hámarksúrkomu í `0`.
6. Vænt: jákvæð gildi undir `0,1` sýna tvo aukastafi eða `<0,01`, grámast
   áfram, en raunverulegt `0` grámast ekki vegna úrkomumarks.

### Akstur / route map

State: gild leið með forecast candidates.

1. Prófa „Fleiri…“ í scrubber og staðfesta að fleiri tímar bætist við án
   layout jump.
2. Prófa „Stækka kort“ á mini-map.
3. Vænt: route map-context opnast með leið og vali intact.
4. Prófa forecast cards þar sem station markers eru þéttir.
5. Vænt: card fer ekki yfir næsta marker-punkt hægra megin.
6. Prófa mobile 530 px og mjórri, bæði portrait og desktop.
7. Passa horizontal overflow, sticky headers, bottom strip og safe areas.

### Authenticated regression

1. Opna innskráður með `road-intelligence-v1`.
2. Vænt: saved weather preferences hlaðast.
3. Vænt: „Nota síðustu vindmörk“ birtist aðeins þegar saved thresholds eru
   til og route inputs eru tóm.
4. Vænt: road-segment lag getur enn hlaðist.
5. Public prompt birtist ekki.

## Fyrir Claude Code — release workflow

1. Rýna þetta handoff og current diff fyrst með production-gleraugum.
2. Ef localhost browser checks að ofan eru ekki staðfestir af Stebba, spyrja
   Stebba áður en release fer áfram.
3. Staðfesta exact staging scope og útiloka `.obsidian/workspace.json`.
4. Staðfesta hvort v006 handoff filename breytingin eigi að vera staged sem
   rename.
5. Ef engar blocking spurningar eru, commit-a aðeins samþykkt scope.
6. Push-a samkvæmt skýru útgáfubeiðni Stebba.
7. Fylgjast með Vercel með `vercel ls` þar til deployment er terminal og
   grænt.
8. Ef Vercel mistekst, stoppa og skila nákvæmri villu; ekki kalla release
   lokið.
9. Skila nýju Claude Code handoffi með commit SHA, push niðurstöðu, Vercel
   deployment URL/stöðu og öllum skipunum/exit codes.

## Óvissa / þarf að staðfesta

- Hvort Stebbi hefur nú þegar lokið öllum manual localhost checks að ofan.
- Hvort custom dialog án focus trap/Escape er samþykkt fyrir þennan release.
- Hvort v006 handoff deletion/untracked file er viljandi rename.
- Hvort handoff v031–v035 eiga að fylgja commit eða vera aðeins local
  collaboration history.

