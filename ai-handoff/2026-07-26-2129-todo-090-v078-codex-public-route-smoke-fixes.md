# TODO-090 v078 — public route smoke lagfæringarpakki

**Created:** 2026-07-26 21:29  
**Timezone:** Atlantic/Reykjavik  
**Tengt handoff:** `2026-07-26-2118-todo-091-v077-codex-history-corner-control.md`

## Samþykki og umfang

Stebbi bað Codex skýrt um að framkvæma litla lagfæringarpakkann sem fannst í public `/vedrid` smoke-prófi. Leyfið náði til þriggja afmarkaðra kóða-/textabreytinga, regression-prófs og handoff. Engin SQL-, Supabase-, dev-server-, commit-, push-, deploy- eða production-aðgerð var framkvæmd.

## Findings og lagfæringar

### 1. Canonical varúðartexti endurheimtur

Ócommittuð prerelease-breyting hafði stytt fyrri málsgrein Google Maps varúðartextans á localhost. Production/`HEAD` var með rétt orðalag samkvæmt staðfestingu Stebba.

- Íslenski canonical production-textinn var endurheimtur óbreyttur.
- Enska canonical samsvörunin var einnig endurheimt.
- Seinni áherslumálsgreinin var þegar rétt og var ekki breytt.

### 2. `MISSING_MESSAGE: enlargeMap` lagað

`RoadMapPrototypeMap` notar bæði overview-þýðingar (`t`) og ferðalagsþýðingar (`tf`). `enlargeMap` er réttilega til undir `teskeid.vedrid.ferdalagid`, en nýja route comparison mini-map kallaði `t('enlargeMap')` í overview namespace.

Kallinu var breytt í `tf('enlargeMap')`. Enginn nýr eða tvítekinn message-lykill var búinn til.

### 3. Public `/api/place/search` fær að ná eigin handler-gates

Public Akstur kallaði `/api/place/search`, en middleware skilaði 401 áður en route-handlerinn gat keyrt. Handlerinn er þegar hannaður fyrir public weather access og framfylgir sjálfur:

- `AUTH_MVP_ENABLED` og weather-mode;
- `resolveWeatherBaseAccess`;
- rate-limit;
- 2–100 stafa query-mörkum;
- provider-availability;
- síun að íslenskum hnitum.

Aðeins nákvæma slóðin `/api/place/search` var sett í `EXACT_PUBLIC_PATHS`. Subpaths eru áfram private. Middleware regression-prófið var uppfært til að staðfesta bæði exact allow og subpath deny.

## Skrár breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`
- `messages/en.json`
- `middleware.ts`
- `lib/__tests__/middleware.test.ts`
- þetta handoff

Fyrirliggjandi ócommittar prerelease-breytingar voru varðveittar.

## Athuganir

Samkvæmt ósk Stebba voru próf, type-check og build ekki keyrð eftir þessum litla pakka; sameiginleg lokakeyrsla verður gerð eftir browser-smoke.

- JSON parse `messages/is.json` — exit 0.
- JSON parse `messages/en.json` — exit 0.
- `git diff --check` — exit 0; aðeins fyrirliggjandi LF/CRLF warnings.
- Nákvæmar línuleitir staðfestu canonical textann, `tf('enlargeMap')`, exact middleware-slóðina og bæði middleware-prófin.
- Ein samsett read-only `rg` skipun mistókst vegna PowerShell-gæsalappavillu. Hún breytti engu og allar aðskildar staðfestingar fóru í gegn.

## Öryggi

Middleware-breytingin opnar ekki prefix eða subpaths og veikir ekki handler-gates. Endpointið er read-only geocoding; það les hvorki user gögn né Supabase töflur og skilar aðeins provider-niðurstöðum innan Íslands. Engin RLS-, auth-, grants-, secret- eða production-stilling breyttist.

## Localhost checks for Stebbi

**Slóð:** `/vedrid`, signed out/incognito.

1. Opna `Akstur` og staðfesta að fulli canonical varúðartextinn sé sá sami og á production.
2. Reikna Reykjavík → Ísafjörður.
3. Staðfesta að `Stækka kort` birtist án `MISSING_MESSAGE` overlay/console-villu.
4. Staðfesta að `/api/place/search` skili ekki lengur 401 og að staðatillögur virki.
5. Public smoke áfram: `Spágögn`, `Kort`, `Akstur` og `/manifest.json`; engar rauðar væntanlegar 401/404/503 villur.

Ekki þarf að framkalla rate-limit eða provider-villu og ekki á að breyta env/Supabase til prófunar.

## Næsta skref

Stebbi endurhleður public `/vedrid` og endurtekur stutta Akstur-smoke-ið. Ef það er grænt er public console/manifest pakkinn klár og næsti stóri browser-pakki er OTP/innskráning. Heildarpróf, type-check og production-build bíða sameiginlegrar lokakeyrslu.

## Óvissa / þarf að staðfesta

Browser-hegðun hefur ekki verið staðfest af Codex og nýja/uppfærða regression-prófið er enn ókeyrt samkvæmt prófunarósk Stebba. Confidence á orsökum og afmörkun lagfæringanna er hátt.
