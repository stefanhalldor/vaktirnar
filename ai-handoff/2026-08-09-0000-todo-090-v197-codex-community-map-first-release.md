# TODO-090 v197 — Samfélagið map-first production release

Created: 2026-08-09 00:00
Timezone: Atlantic/Reykjavik

## Samþykki og umfang

Stebbi samþykkti að Codex gæfi afmarkaða Samfélagið-breytingu út á production og sendi tölvupóst þegar hægt væri að prófa hana. Umfangið er átta source/test/message skrár. Engin SQL, migration, Supabase-gagnabreyting, env/secrets-breyting eða RLS/auth-breyting fylgir.

## Niðurstaða

- `Samfélagið` opnar allt Ísland og alla leyfilega athugasemdapunkta án veðurstöðva eða botn-scrubbers.
- Aðgerðaskúffan er opin sjálfgefið; minimize sýnir aðeins fljótandi `Aðgerðir`-hnapp neðst.
- Formið notar `Fyrir samfélagið` sjálfgefið en má skipta yfir í einkarábendingu til Teskeiðar fram að sendingu.
- Aldur athugasemda styður 10/30/60 mín., sólarhring, 3 daga, viku, mánuð og `Allar` sjálfgefið. Custom valmynd helst innan mobile viewport.
- Gamli veðurstöðvastraumurinn er fjarlægður úr Samfélaginu og ref-guard kemur í veg fyrir að stöðvamerki endurbirtist við reconciliation.
- Smellur á punkt zoomar/hreyfir ekki kortið. Athugasemdin birtist neðst; valdi punkturinn verður appelsínugulur með halo. Listaval má miðja punkt en varðveitir nákvæmt zoom.
- `hours=all` sleppir tímaskilyrði en repository heldur 150-færslu öryggismörkum.

## Breyttar skrár

- `components/weather/MapNotesPanel.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `lib/map-notes/contracts.ts`
- `lib/map-notes/repository.server.ts`
- `messages/is.json`
- `messages/en.json`
- `lib/__tests__/map-notes-api.test.ts`
- `lib/__tests__/map-notes-contracts.test.ts`

## Staðfesting fyrir release

- `npm.cmd run type-check` — exit 0.
- Markviss Vitest-keyrsla — exit 0, 17/17 próf græn.
- `git diff --check` — exit 0, aðeins LF/CRLF viðvaranir.
- `npm.cmd run build` — compile og type/lint hlutar grænir, síðan exit 1 við page-data collection fyrir `/api/dashboard` vegna `supabaseUrl is required`. Einangraða release-vinnutréð hefur viljandi enga `.env.local`; engin secret var afrituð. Vercel-build með production env verður endanleg release-hlið.

## Localhost checks for Stebbi

1. Opna `/auth-mvp/vedrid` og `Samfélagið`; allt Ísland og samfélagspunktar eiga að sjást, án veðurstöðva og scrubbers.
2. Minimize-a skúffuna; aðeins grænn `Aðgerðir`-hnappur á að vera neðst. Opna aftur með honum.
3. Prófa aldursvalmynd á 360–460 px viewport; hún má ekki fara út fyrir skjáinn.
4. Smella á athugasemdapunkt; kortið má hvorki zooma né hreyfast. Athugasemdin á að birtast neðst og punkturinn appelsínugulur með halo.
5. Opna lista og velja staðsetta athugasemd; kortið má miðja hana en zoom þarf að haldast óbreytt.
6. Prófa community/private pillu, staðarleit, núverandi stað, kortaval og óháða staðsetningu.
7. Loka Samfélaginu og staðfesta að Veðrið/Akstur endurheimti sín kortalög og controls.

Sending prófunarathugasemdar getur skrifað í Supabase-environment sem keyrslan vísar á; nota skal augljós prófunargögn. Engin migration á að keyra.

## Release og eftirstandandi hlið

Commit/push/Vercel niðurstaða og tölvupóstsending verða staðfest eftir að handoffið er skrifað. Tölvupóstur skal aðeins sendur ef production deployment er grænt. Route intelligence check á ekki við; engin leiðarþekking eða routing-provider hegðun breyttist.
