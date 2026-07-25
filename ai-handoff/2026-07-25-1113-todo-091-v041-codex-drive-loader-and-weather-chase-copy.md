# TODO-091 — Loader í Akstri og texti fyrir veðureltara

Created: 2026-07-25 11:13  
Timezone: Atlantic/Reykjavik

## Samþykkt og plan

Stebbi samþykkti að Codex:

1. skipti dauða „Reikna…“ loading-textanum í Akstri út fyrir canonical Teskeiðar-loader
2. breyti „Veldu staði og berðu saman veðrið“ í „Fyrir þá sem eru að elta veðrið“

Þetta heimilaði kóða- og þýðingabreytingar, en ekki commit, push, deploy, migration eða production-breytingar.

## Framkvæmt

- Endurnýtti núverandi `TeskeidLoader` inni í opna Akstursspjaldinu meðan leið er reiknuð.
- Loaderinn notar sömu þrjá núverandi útreikningstexta og fullskjás-loader Aksturskortsins.
- Hélt loading-svæðinu stöðugu með `min-h-[320px]`; canonical component sér um `role="status"` og reduced-motion.
- Uppfærði íslensku fyrirsögnina í „Fyrir þá sem eru að elta veðrið“.
- Uppfærði ensku samsvörunina í „For those chasing the weather“.

Lausnin fylgir `Design.md`: canonical Teskeið component er endurnýttur, loading state gefur sýnilegt og aðgengilegt feedback og veldur ekki breiddarbreytingu á control.

## Skrár skoðaðar

- `WORKFLOW.md`
- `Design.md`
- `components/teskeid/TeskeidLoader.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/WeatherWatchersComparison.tsx`
- `messages/is.json`
- `messages/en.json`

## Skrár breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`
- `messages/en.json`
- þessi handoff-skrá

## Skipanir og niðurstöður

- `npm.cmd run type-check` — exit 0
- JSON parse á `messages/is.json` og `messages/en.json` — exit 0
- `git diff --check` — exit 0; aðeins fyrirliggjandi line-ending viðvaranir

Enginn dev server var ræstur. Engin browserpróf, commit, push, deploy, SQL eða migration voru framkvæmd.

## Localhost checks for Stebbi

1. Opna `/auth-mvp/vedrid/road-map-prototype?context=route&view=information`.
2. Setja inn frá- og áfangastað og ýta á „Reikna“.
3. Vænt niðurstaða: inni í Akstursspjaldinu birtist Teskeiðar-logo-loader með skiptandi útreikningstextum; stakur „Reikna…“ texti sést ekki.
4. Athuga á mjóum farsímaskjá að loaderinn flæði ekki lárétt og að spjaldið hoppi ekki til.
5. Opna veðursamanburðinn og staðfesta fyrirsögnina „Fyrir þá sem eru að elta veðrið“.
6. Skipta yfir í ensku og staðfesta „For those chasing the weather“.

Engin auth-, Supabase-, RLS- eða notendagagnabreyting fylgir þessu verki.

## Route intelligence check

Breytingin snertir aðeins loading-presentasjón núverandi leiðarútreiknings. Engum route-provider, segmentum, control points, cache-lykli, leiðagögnum eða privacy-hegðun var breytt. `IcelandRoadmap.md` þurfti því ekki uppfærslu.

## Óvissa / næsta skref

Confidence: high. Stebbi þarf aðeins að sannreyna raunverulegt útlit og hæð loadersins á localhost fyrir útgáfu.
