# TODO #67 Vedrid - Codex recommendation for v037 dependency decision

Created: 2026-07-03 15:49
Timezone: Atlantic/Reykjavik
From: Codex
To: Stebbi og Claude Code
Status: Review/recommendation only. Engar kóðabreytingar, dependency breytingar, SQL, env breytingar, commit, push, deploy eða production breytingar gerðar.

Reviewed:
- `ai-handoff/2026-07-03-1545-todo-067-v037-claude-execution-ready-handoff.md`
- `package.json`
- Official Google Maps JavaScript loading docs
- Official `@googlemaps/js-api-loader` README

## Recommendation

Velja **A - `@googlemaps/js-api-loader`**, en með þessari nákvæmu útfærslu:

- Nota nýja v2-style API-ið: `setOptions()` + `importLibrary('places')`.
- Ekki nota gamla `new Loader(...).load()` mynstrið í nýjum kóða.
- Bæta við `@googlemaps/js-api-loader` í `dependencies`.
- Bæta við `@types/google.maps` í `devDependencies`, því appið er TypeScript og Google mælir með því fyrir TS notendur.
- Gera þetta aðeins í Phase 2A2 með skýru framkvæmdarleyfi frá Stebba, því þetta breytir `package.json` og `package-lock.json`.

## Rökstuðningur

### 1. Þetta er official leið og minnkar eigin loader-kóða

Google listar þrjár leiðir til að hlaða Maps JavaScript API: dynamic library import, direct script tag og NPM `js-api-loader`. Loader-pakkinn er official npm wrapper utan um dynamic library import. Hann gefur Promise-based `importLibrary()` interface og heldur hleðslunni á einum stað.

Fyrir Teskeið þýðir það minna custom script-state í React componentum: engin global callback nöfn, minni líkur á tvöfaldri hleðslu og einfaldara error/loading handling í `PlaceSearch.tsx`.

### 2. Betra fyrir Next/React component boundary

Við þurfum Google Places bara í client component þegar notandi þarf að breyta eða velja stað. Með loader getum við:

- kallað `setOptions()` einu sinni í client-only helper,
- kallað `importLibrary('places')` þegar `PlaceSearch` þarf það,
- mockað helperinn í tests,
- haldið Maps JS út úr server code,
- forðast að setja `<Script>` í app/layout sem hleður Google á síðum sem nota það ekki.

Native `<Script>` virkar, en það býr til meiri boilerplate í kringum `window.google`, load callbacks, duplicate-load guard og race conditions.

### 3. Betri undirbúningur fyrir Capacitor

Capacitor mun enn keyra web client code í WebView. Promise-based loader/helper er líklegri til að flytjast hreint yfir í WebView en handskrifað script tag í layouti sem þarf að passa við route lifecycle, hydration og mobile retry states.

Þetta leysir ekki Capacitor auth/store packaging, en það heldur Maps-loading ákvörðuninni tiltölulega portable.

### 4. Dependency overhead er ásættanlegt hér

Venjulega myndi ég forðast dependency ef hún sparar bara 10 línur. Hér sparar hún samt ekki bara línur, heldur state management:

- load-once behavior,
- Promise/error path,
- typed import boundary,
- current Google `importLibrary()` pattern,
- minni líkur á að við skrifum okkar eigin loader vitlaust.

Þetta er lítil, official og afmörkuð dependency sem tengist beint kjarnavirkni Phase 2A2.

## Implementation constraints for Claude Code

Þegar Phase 2A2 fær framkvæmdarleyfi:

1. Bæta við dependency með package manager, ekki handskrifa lockfile:
   - `@googlemaps/js-api-loader`
   - `@types/google.maps` sem dev dependency
2. Búa til lítinn client-only helper, t.d. `lib/weather/googleMaps.client.ts`, sem:
   - les `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`,
   - kallar `setOptions({ key, language: 'is', region: 'IS' })` einu sinni,
   - exportar `loadPlacesLibrary()` sem notar `importLibrary('places')`,
   - skilar skýrri villu ef key vantar.
3. `PlaceSearch.tsx` notar helperinn, ekki raw script tag.
4. Tests mocka helperinn og staðfesta:
   - ekkert load við <2 stafi,
   - debounce/stale guard,
   - `includedRegionCodes: ['is']`,
   - sessionToken fer á autocomplete request,
   - `fetchFields()` er kallað án token.

## Suggested message to Claude Code

```text
Veljum A fyrir opna atriðið í v037: @googlemaps/js-api-loader.

Skilyrði:
1. Notaðu v2-style API: setOptions() + importLibrary('places'), ekki gamla new Loader(...).load() mynstrið.
2. Bættu við @googlemaps/js-api-loader í dependencies og @types/google.maps í devDependencies, en aðeins þegar Stebbi gefur Phase 2A2 framkvæmdarleyfi, því þetta breytir package.json/package-lock.json.
3. Hafðu Maps JS loading í litlum client-only helper, ekki í app/layout global scripti.
4. PlaceSearch notar helperinn og mockar hann í tests.
5. Halda öllum v037 ákvörðunum: Places API New, includedRegionCodes ['is'], language is, sessionToken á AutocompleteRequest, fetchFields() án token.
```

## Localhost checks for Stebbi

Þetta er ákvörðunarskjal, svo ekkert nýtt er tilbúið til localhost prófunar enn. Þegar Phase 2A2 hefur verið útfærður með A:

1. Opna veðurflæði sem kallar á Places leit.
2. Staðfesta að Google Maps JS hleðst ekki fyrr en Places leit þarf að birtast.
3. Prófa `Suðurgata`, `Mosó`, `Húsavík` og sjá íslenska candidates.
4. Prófa lélegt net eða tímabundna Google failure ef auðvelt er: UI á að sýna skýra retry/villu, ekki brotna.
5. DevTools Network: `GOOGLE_MAPS_SERVER_KEY` má aldrei sjást; browser key má sjást í Maps JS/Places/Static Maps requests.
6. Mobile 360/390/460 px: Places input er 16px eða stærra, enginn zoom/overflow, loading state hoppar ekki til.

Ekki breyta production env, Google quotas eða billing stillingum án sérstaks samþykkis.

## Sources checked

- Google Maps JS loading options: https://developers.google.com/maps/documentation/javascript/load-maps-js-api
- Google Maps JS API loader package: https://github.com/googlemaps/js-api-loader
