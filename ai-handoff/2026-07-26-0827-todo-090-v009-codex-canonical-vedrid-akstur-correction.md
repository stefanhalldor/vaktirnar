# TODO 090 — Canonical `/vedrid` Akstur correction

Created: 2026-07-26 08:27  
Timezone: Atlantic/Reykjavik  
Agent: Codex

## Leiðrétting á v008

Þetta skjal supersede-ar UI/localhost hluta v008. Stebbi benti réttilega á að
canonical Akstur er nú inni á `/vedrid` í `RoadMapPrototypeMap`, ekki gamla
`/vedrid/ferdalagid` flæðið. Fyrsta útfærslan hafði tengt server candidate rétt,
en sett sýnilegu tilraunamerkinguna í gamla `RouteSelectionStep` componentinn.

## Hvað var leiðrétt

- Tilrauna-UI var fjarlægt aftur úr gamla `RouteSelectionStep`.
- Canonical `RoadMapPrototypeMap` var þegar að sækja `/travel/routes` eftir að
  aðalleið birtist, en `renderRouteSurfaceChoices()` var aldrei kallað í JSX.
- Route choices birtast nú efst í scrollable Akstursgögn-panelnum, beint ofan
  við `DriveJourneyPanel`.
- Teskeið candidate fær labelið „Teskeiðarleið“ og textann
  „Tilraun · Google er áfram aðalviðmið“.
- Candidate surface facts úr road graph eru notuð beint fyrir möl/bundið
  slitlag þegar þau eru fullstaðfest; mixed/unknown er áfram óstaðfest.
- Val á Teskeiðarleið kallar núverandi `handleSelectSurfaceRouteChoice`, sem
  endurreiknar canonical Akstursgögn og kort með sama `selectedRouteId`.
- Nýja flaggið er server-derived prop á bæði `/vedrid` og
  `/auth-mvp/vedrid`. Það er því ekki óvart háð `road-intelligence-v1` flagginu.
- Flagg-off kallar ekki fram route-choice fetch fyrir notanda sem hefur ekki
  Road Intelligence; núverandi Road Intelligence route choices haldast óbreytt.

## Skrár leiðréttar í v009

- `app/vedrid/page.tsx`
- `app/auth-mvp/vedrid/page.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/RouteSelectionStep.tsx`
- `messages/is.json`
- `messages/en.json`

Server helper/API/type/test/docs breytingarnar úr v008 haldast gildar.

## Design.md check

- Endurnýtir núverandi horizontal route-choice cards og Akstursgögn panel.
- Enginn nýr skjár, nested-card eða navigation route var bætt við.
- Tilraunastaða er textamerkt, ekki aðeins litamerkt.
- Choice cards eru inni í horizontal scroll container og halda núverandi
  mobile touch/focus hegðun.
- Nýr texti er í báðum locale skrám.

## Prófanir

- Targeted candidate/routes/travel suite: exit 0; 62 próf standast.
- `npm run test:run`: exit 0; 144 files passed, 1 skipped; 3.674 tests passed,
  28 skipped, 8 todo.
- `npm run build`: exit 0; canonical `/vedrid` og `/auth-mvp/vedrid` builda.
- `npm run type-check` keyrt eitt og sér eftir build: exit 0.
- `git diff --check`: exit 0; aðeins CRLF/LF warnings.

Ein samhliða type-check keyrsla fékk TS6053 á generated `.next/types` meðan
`next build` var að endursmíða sömu möppu. Hrein sequential type-check eftir
build var exit 0; þetta var tool concurrency race, ekki source villa.

## Localhost checks for Stebbi

Rétt slóð er sú sem Stebbi notar nú þegar:

- innskráður: `http://localhost:3004/auth-mvp/vedrid`
- public canonical ef við á: `http://localhost:3004/vedrid`

Forsendur:

1. `TESKEID_ROUTE_CANDIDATE_ENABLED=true` í `.env.local`.
2. Stebbi endurræsir sjálfur localhost server eftir env-breytingu.

Skref:

1. Opna `/auth-mvp/vedrid`, velja Akstursgögn og reikna t.d. Reykjavík → Akureyri.
2. Google-leið á að reiknast fyrst og birtast á kortinu eins og áður.
3. Um 1,2 sek. síðar á route-choice röð að birtast efst í Akstursgögn-panelnum.
4. „Teskeiðarleið“ á að vera aftast og merkt
   „Tilraun · Google er áfram aðalviðmið“.
5. Smella Teskeiðarleið. Card sýnir „Sæki leið…“ og síðan eiga kort,
   vegalengd, tími, stöðvar og Akstursgögn að endurreiknast fyrir Teskeiðarleið.
6. Prófa Reykjavík → Ísafjörður og staðfesta möl/óstaðfest slitlag þar sem við á.
7. Slökkva flagginu og endurræsa: engin Teskeiðarleið á að birtast. Núverandi
   Google/Road Intelligence choices mega halda áfram samkvæmt sínum flags.
8. Prófa 360/390/460 px: horizontal choice röðin scrollar, panelinn fær ekki
   page-level horizontal overflow og texti/touch targets haldast læsileg.

Ekki virkja Vercel/production flagg án sérstaks leyfis. Enginn dev server,
commit, push, deploy, Supabase eða migration var gerður.

## Óvissa / þarf að staðfesta

Confidence er high fyrir canonical wiring, server gating, build og sjálfvirk
próf. Confidence er medium fyrir raunverulega browser placement þar sem Stebbi
keyrir localhost og sjónræna prófunin er næsta nauðsynlega skref.
