# TODO-067 v052 - Codex review of v051 Phase 2B localhost readiness

Created: 2026-07-05 21:14  
Timezone: Atlantic/Reykjavik  
From: Codex  
To: Stebbi og Claude Code  
Status: Review. Engar kóðabreytingar, engin SQL-keyrsla, ekkert deploy, ekkert commit og engar production/env breytingar voru framkvæmdar af Codex.

## Niðurstaða

**Já, v051 er tilbúið í takmörkuð localhost smoke-próf núna.**

**Nei, v051 er ekki tilbúið í full end-to-end Ferðalagið próf fyrr en Google Maps env vars eru sett á localhost.**

AI/gervigreind þarf ekki fyrir Phase 2B. Það er í lagi að hafa `WEATHER_AI_ENABLED=false` og engan `ANTHROPIC_API_KEY`.

Google þarf hins vegar fyrir alvöru flæðið:

- `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` þarf fyrir `PlaceSearch`.
- `WEATHER_MAP_PROVIDER=google` þarf til að route endpoint velji Google provider.
- `GOOGLE_MAPS_SERVER_KEY` þarf fyrir route calculation.

Núverandi `.env.local` staða samkvæmt read-only redacted check:

- `AUTH_MVP_ENABLED=<set>`
- `WEATHER_ENABLED=<set>`
- `WEATHER_FLAG=<set>`
- `WEATHER_AI_ENABLED=<set>`
- `METNO_USER_AGENT=<set>`
- `WEATHER_MAP_PROVIDER=<missing>`
- `GOOGLE_MAPS_SERVER_KEY=<missing>`
- `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=<missing>`
- `ANTHROPIC_API_KEY=<missing>`

## Findings

### Blocker for full localhost test - Google env vars vantar

`PlaceSearch` kallar `loadPlacesLibrary()` þegar notandi slær inn stað. Sá helper krefst `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`. Án hans fær notandi bara leitarvillu og getur ekki valið uppruna eða áfangastað.

Þetta þýðir:

- Núna má prófa að `/auth-mvp/vedrid` opnist og að Ferðalagið UI sé komið í stað chat UI.
- Núna má prófa missing-key error behavior í staðarleit.
- Núna er ekki hægt að prófa fulla ferð frá Reykjavík til Akureyrar í UI.

Relevant code:

- `components/weather/PlaceSearch.tsx` notar `loadPlacesLibrary()` í search.
- `lib/weather/googleMaps.client.ts` krefst `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`.
- `app/api/teskeid/weather/travel/route.ts` skilar `provider_not_configured` ef `WEATHER_MAP_PROVIDER` vantar.

### Major - kortastaðfesting vantar enn í nýja wizardinn

Stebbi hafði sérstaklega valið að notandi ætti að staðfesta á korti hvaða stað væri um að ræða, meðal annars vegna tvíræðra staða eins og Suðurgata.

v051 sýnir staðfestingarkort sem texta-card með nafni og `formattedAddress`, en ekki actual map. Þetta er betra en `candidates[0]` gisk, en það uppfyllir ekki alveg product-ákvörðunina um visual comfort.

Relevant code:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx` `PlaceConfirmation` sýnir `MapPin`, nafn og address, en ekkert static map.

Codex mat: þetta stoppar ekki localhost smoke-test, en ætti að vera lagað áður en Stebbi metur þetta sem MVP tilbúið.

### Major - "enginn eftirvagn" lætur akstursveður alltaf verða grænt

Í `lib/weather/travel.ts` skilar `evalDrivingLeg()` alltaf `graent` ef `trailerKind === 'none'`, jafnvel við 20 m/s vind, 28 m/s hviður eða úrkomu.

Það er test sem staðfestir þessa hegðun. Hún getur verið í lagi ef Phase 2B er stranglega "hýsi/eftirvagn" tool, en Ferðalagið sem vara virðist breiðara: notandi gæti spurt hvort ferðalag sé í lagi án eftirvagns.

Relevant code:

- `lib/weather/travel.ts`: `if (trailerKind === 'none') return { stada: 'graent' }`

Codex mat: þetta er product-risk. Áður en release/commit er hugsað myndi ég biðja Claude Code um að annaðhvort:

1. bæta við mildari general-driving thresholds fyrir `none`, eða
2. gera UI mjög skýrt að veðurmatið sé fyrst og fremst fyrir eftirvagna/hýsi.

### Major - útigisting notar alla route punkta, ekki bara áfangastað

`checkTravelWeather()` metur stay window með `worstConditions(pointForecasts, arrivalAt, returnDepartureAt)`. `pointForecasts` eru forecast fyrir route punkta, ekki sérstaklega bara áfangastað.

Þetta getur gert tjald-/hýsisgistinguna of svartsýna: slæmt veður einhvers staðar á leiðinni á meðan notandi er kominn á áfangastað getur litað "dvöl á áfangastað".

Relevant code:

- `app/api/teskeid/weather/travel/route.ts` býr til `pointForecasts` úr route points.
- `lib/weather/travel.ts` notar sömu `pointForecasts` fyrir stay window.

Codex mat: ekki blocker fyrir smoke-test, en niðurstöður geta orðið villandi. Betra væri að sækja destination forecast sérstaklega og nota það fyrir stay/lodging.

### Medium - route sampling getur misst destination punktinn

Bæði Google provider sampling og travel endpoint subsampling bæta last point við, en enforce-a cap með `slice(0, maxPoints)` eða `splice(MAX_WEATHER_POINTS)` eftir á. Ef last point var append-aður sem aukapunktur getur hann dottið aftur út.

Relevant code:

- `lib/weather/google.server.ts` `return sampled.slice(0, maxPoints)`
- `app/api/teskeid/weather/travel/route.ts` `weatherPoints.splice(MAX_WEATHER_POINTS)`

Þetta skiptir máli því destination weather er sérstaklega mikilvægt fyrir gistingu og niðurstöðu.

### Medium - gamla `/ask` route-branch er enn virkur

Gamla chat/ask endpointið er ekki lengur notendasýnilegt úr `/auth-mvp/vedrid`, en route branch í `/api/teskeid/weather/ask` velur enn `candidates[0]` fyrir óþekktan origin/destination.

Relevant code:

- `app/api/teskeid/weather/ask/route.ts` origin `candidates[0]`
- `app/api/teskeid/weather/ask/route.ts` destination `candidates[0]`

Codex mat: ekki blocker fyrir localhost UI-próf ef engin UI notar `/ask`, en ætti að fjarlægja/fela fyrir release eða tryggja að það sé ekki aðgengilegt sem route weather public surface.

### Medium - missing-key state kemur of snemma í PlaceSearch

v051 handoff segir að án Google lykla sýni `/travel` `provider_not_configured`, en í UI kemst notandi ekki svo langt, því PlaceSearch stoppar áður en uppruni er valinn.

Þetta er eðlilegt miðað við núverandi hönnun, en mikilvægt fyrir Stebba: án `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` getur hann ekki prófað result-step errorið nema með handvirku API calli eða mock.

## Það sem er gott

- `app/auth-mvp/vedrid/page.tsx` renderar nú `FerdalagidClient`, ekki gamla prompt UI.
- Nýja `/travel` endpointið tekur structured payload og velur ekki geocoder candidate sjálft.
- Server validate-ar auth, `vedrid` feature access, coordinates, date strings og enum values.
- AI er ekki decision engine í nýja `/travel` flæðinu.
- `npm run type-check` er grænt.
- Relevant weather tests eru græn.
- Full test-suite er græn.
- `npm run build` er grænt.
- Engin Supabase migration, SQL, commit, push, deploy eða production/env breyting var framkvæmd.

## Commands run by Codex

- `Get-Content -Encoding UTF8 "WORKFLOW.md"` - exit code 0
- `Get-Content -Encoding UTF8 "ai-handoff/README.md"` - exit code 0
- `Get-Content -Encoding UTF8 "ai-handoff/2026-07-05-2105-todo-067-v051-claude-phase2b-shipped.md"` - exit code 0
- `git status --short` - exit code 0, með warning um `C:\Users\Lenovo/.config/git/ignore` permission denied
- `git diff --stat` - exit code 0
- Read-only skoðun á `Design.md`, weather route/helper/client/test files og messages
- Redacted `.env.local` key presence check - exit code 0
- `npm run type-check` - exit code 0
- `npm run test:run -- lib/__tests__/weather-travel.test.ts lib/__tests__/weather-google.test.ts lib/__tests__/weather-coords.test.ts lib/__tests__/weather-tools.test.ts` - exit code 0, 106 tests passed
- `npm run build` - exit code 0, með eldri warnings í `app/s/[sessionId]/page.tsx` og `components/landing/Avatar.tsx`
- `npm run test:run` - exit code 0, 51 files passed, 1631 tests passed, 22 skipped, 8 todo

## Localhost checks for Stebbi

### A. Prófa núna án Google/AI lykla

Markmið: staðfesta að nýja UI opnist, að chat/grill/golf sé falið og að missing Google key sé meðhöndlað án crash.

Forsendur:

- Stebbi keyrir dev server sjálfur.
- `AUTH_MVP_ENABLED` og `WEATHER_ENABLED` eru virk í `.env.local`.
- Ef `WEATHER_FLAG=true`, þarf innskráður notandi að hafa `vedrid` feature access.

Skref:

1. Ræstu eða endurræstu localhost dev server sjálfur ef hann er ekki í gangi.
2. Opnaðu `/auth-mvp/heim`.
3. Staðfestu að Veðrið sé sýnilegt fyrir þinn notanda. Ef ekki, þá vantar annaðhvort `WEATHER_ENABLED=true`, `WEATHER_FLAG`/feature access eða session.
4. Opnaðu `/auth-mvp/vedrid`.
5. Staðfestu að þú sjáir `Veðrið` og fyrsta Ferðalagið skrefið: `Hvaðan ferð þú?`.
6. Staðfestu að þú sjáir ekki prompt box, Grill, Golf, "Aðrar spurningar" eða chat UI.
7. Sláðu inn `Reykjavík` í staðarleit.
8. Vænt niðurstaða án Google browser key: leitin endar í villu, líklega `Villa við leit. Reyndu aftur.`
9. Staðfestu að síðan crash-i ekki, layout fari ekki í rugl og input zoom-i ekki á mobile.
10. Prófaðu 360 px / 390 px / 460 px mobile viewport ef þú notar browser devtools.

Þetta er smoke test, ekki full virkni.

### B. Setja lágmarks Google env fyrir fulla localhost prófun

AI þarf ekki. Ekki setja `ANTHROPIC_API_KEY` fyrir þetta.

Bættu við eða stilltu í `.env.local`:

```env
WEATHER_MAP_PROVIDER=google
GOOGLE_MAPS_SERVER_KEY=þinn_server_key
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=þinn_browser_key
WEATHER_AI_ENABLED=false
```

Google API lágmark fyrir Phase 2B:

- Browser key: Maps JavaScript API + Places API (New), með localhost referrer restriction.
- Server key: Routes API. Geocoding API er gagnlegt fyrir gamla `/ask` flæðið, en nýja `/travel` flæðið þarf fyrst og fremst Routes API á server.

Eftir að `.env.local` er breytt þarf Stebbi að endurræsa localhost dev server sjálfur, sérstaklega af því `NEXT_PUBLIC_*` fer í browser bundle.

### C. Full Ferðalagið próf með Google env

1. Opnaðu `/auth-mvp/vedrid`.
2. Staðfestu að aðeins Ferðalagið wizard sé sýnilegur.
3. Í `Hvaðan ferð þú?`, sláðu inn `Reykjavík`.
4. Veldu niðurstöðu úr Google suggestions.
5. Staðfestu að confirmation card sýni nafn og heimilisfang.
6. Athugaðu sérstaklega: það er ekki kort í v051, bara textastaðfesting. Ef þér finnst það ekki nóg, þá er það valid feedback.
7. Smelltu `Áfram`.
8. Í `Hvert ferð þú?`, sláðu inn `Akureyri`.
9. Veldu niðurstöðu úr suggestions og smelltu `Áfram`.
10. Í `Hvenær?`, settu brottför innan næstu daga sem met.no spáin nær yfir.
11. Láttu heimferð og latest-home vera tómt í fyrstu tilraun.
12. Smelltu `Áfram`.
13. Veldu `Hjólhýsi / karavan`.
14. Smelltu `Áfram`.
15. Veldu `Gisti ekki`.
16. Smelltu `Skoða veður`.
17. Vænt niðurstaða: loading birtist, svo kemur stöðukort með `Gott`, `Meðgótt` eða `Slæmt`, svartexta og `Af hverju?`.
18. Opnaðu `Af hverju?` og staðfestu að facts innihaldi leið, vind/hviður/úrkomu og disclaimer.
19. Smelltu `Byrja aftur`.
20. Endurtaktu með heimferð settri og gistingu `Tjald`.
21. Prófaðu óraunhæfa tímaröð: heimferð fyrr en brottför. Vænt: friendly time validation villa.
22. Prófaðu `Hestakerra`. Vænt: facts innihalda caveat um hestakerru.
23. Prófaðu mobile viewport: 360, 390 og 460 px. Passa að ekkert horizontal scroll, overlap eða mobile zoom komi.

### D. Prófa provider error eftir að UI virkar

Til að prófa `provider_not_configured` í UI þarftu helst browser key áfram, svo staðarleit virki, en slökkva á server provider:

```env
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=þinn_browser_key
WEATHER_MAP_PROVIDER=
GOOGLE_MAPS_SERVER_KEY=
```

Endurræstu localhost dev server sjálfur eftir breytingu.

Skref:

1. Veldu frá og til með PlaceSearch.
2. Fylltu út brottför.
3. Veldu eftirvagn/gistingu.
4. Smelltu `Skoða veður`.
5. Vænt niðurstaða: friendly provider-not-configured villa, ekki crash.

## Recommendation

Codex mælir með:

1. Stebbi prófi fyrst A án lykla til að sjá nýja UI og staðfesta að chat/grill/golf sé horfið.
2. Stebbi setji síðan Google env vars á localhost og prófi C.
3. Áður en commit/release er samþykkt, fá Claude Code til að laga eða taka skýra ákvörðun um:
   - kortastaðfestingu í wizard,
   - `trailerKind='none'` sem gerir akstursveður alltaf grænt,
   - destination/stay forecast sem nú notar route-wide forecasts,
   - sampling sem getur misst destination punkt.

## Supabase / production / billing

Codex gerði engar Supabase breytingar, engar SQL breytingar, keyrði enga migration, breytti engum RLS policies, auth, grants, functions, secrets, Vercel env, production stillingum eða billing.

Google key setup getur haft billing áhrif ef Stebbi setur það upp í Google Cloud, en Codex framkvæmdi ekkert slíkt.

Ekki prófa production, Vercel env, Google billing, Supabase migrations, RLS, auth policy breytingar eða notendagögn í tengslum við v051 nema Stebbi gefi sérstakt leyfi.

## Óvissa / þarf að staðfesta

- Codex prófaði ekki í browser, því Stebbi keyrir localhost/dev server sjálfur samkvæmt workflow.
- Codex staðfesti ekki raunverulega Google Maps API behavior, því env lyklar eru ekki settir.
- Codex staðfesti ekki útlit með screenshot eða mobile keyboard, aðeins code-level Design.md rýni.
