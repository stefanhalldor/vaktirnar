# TODO-067 v056 - Codex localhost setup and test guide after v055

Created: 2026-07-05 22:04  
Timezone: Atlantic/Reykjavik  
From: Codex  
To: Stebbi  
Status: Detailed setup and localhost testing guide. Engar kóðabreytingar, engin SQL-keyrsla, ekkert deploy, ekkert commit og engar production/env breytingar voru framkvæmdar af Codex.

## Executive summary

v055 lítur tæknilega grænt út fyrir localhost prófanir.

Codex staðfesti:

- `npm run type-check` - exit code 0
- targeted weather tests - exit code 0, 112 tests passed
- `npm run build` - exit code 0, aðeins eldri warnings utan Veðrið
- full `npm run test:run` - exit code 0, 51 files passed, 1637 tests passed

Til að prófa Ferðalagið end-to-end þarftu Google Maps setup á localhost. AI/gervigreind þarf ekki.

Lágmarks `.env.local` fyrir full test:

```env
WEATHER_ENABLED=true
WEATHER_FLAG=true
WEATHER_AI_ENABLED=false
WEATHER_MAP_PROVIDER=google
GOOGLE_MAPS_SERVER_KEY=...
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=...
METNO_USER_AGENT=Teskeidin/1.0 (+https://teskeid.is; teskeid@gottvibe.is)
```

Ef `WEATHER_FLAG=true`, þarf innskráði notandinn þinn líka að hafa `vedrid` feature access. Ef þú vilt prófa án per-user gating á localhost má setja `WEATHER_FLAG=false` tímabundið, en þá þarf að endurræsa dev server.

## What v055 changed

v055 kláraði fjóra fix-passa:

1. General driving thresholds fyrir `trailerKind='none'`.
2. Destination-only forecast fyrir útigistingu/dvöl.
3. Route sampling hættir að þykjast halda destination punkti; destination forecast er sótt sérstaklega.
4. Static map confirmation í Ferðalagið wizard.

Relevant files:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `components/weather/MapConfirmation.tsx`
- `lib/weather/staticMap.ts`
- `app/api/teskeid/weather/travel/route.ts`
- `lib/weather/travel.ts`
- `lib/weather/thresholds.ts`
- `lib/__tests__/weather-travel.test.ts`
- `messages/is.json`
- `messages/en.json`

## Current local env status

Codex gerði read-only/redacted check á `.env.local`.

Status:

- `AUTH_MVP_ENABLED=<set>`
- `WEATHER_ENABLED=<set>`
- `WEATHER_FLAG=<set>`
- `WEATHER_AI_ENABLED=<set>`
- `METNO_USER_AGENT=<set>`
- `WEATHER_MAP_PROVIDER=<missing>`
- `GOOGLE_MAPS_SERVER_KEY=<missing>`
- `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=<missing>`
- `ANTHROPIC_API_KEY=<missing>`

Niðurstaða:

- Appið ætti að opna Veðrið ef auth + feature access er í lagi.
- PlaceSearch, kort og route weather virka ekki end-to-end fyrr en Google env vars eru komin.
- `ANTHROPIC_API_KEY` vantar, en það er í lagi. Phase 2B/2B fix-pass notar ekki AI.

## Google Cloud setup

### Important billing note

Google Maps Platform notar pay-as-you-go verðlíkan og usage er rakið á SKU. Google docs mæla með budget alerts og usage quotas til að fylgjast með og stýra kostnaði. Sjá official docs:

- Pricing overview: https://developers.google.com/maps/billing-and-pricing/overview
- Maps JavaScript usage/billing: https://developers.google.com/maps/documentation/javascript/usage-and-billing
- Places usage/billing: https://developers.google.com/maps/documentation/places/web-service/usage-and-billing
- Routes usage/billing: https://developers.google.com/maps/documentation/routes/usage-and-billing
- Maps Static usage/billing: https://developers.google.com/maps/documentation/maps-static/usage-and-billing

Codex framkvæmdi ekkert í Google Cloud. Þú gerir þetta sjálfur í browser.

### Recommended shape: two keys

Notaðu tvo aðskilda lykla:

1. **Browser key** fyrir það sem fer í browser:
   - `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`
   - Notað í `PlaceSearch` og static map image URL.

2. **Server key** fyrir server-side route calculation:
   - `GOOGLE_MAPS_SERVER_KEY`
   - Notað í `lib/weather/google.server.ts` fyrir Routes API.

Af hverju tveir lyklar:

- Browser key verður sýnilegur í browser bundle og static map image URL.
- Server key á ekki að leka í browser.
- Google mælir með bæði application restrictions og API restrictions á keys. Sjá security docs: https://developers.google.com/maps/api-security-best-practices

### Step 1 - Create or choose Google Cloud project

1. Opnaðu Google Cloud Console.
2. Veldu project eða búðu til nýtt, t.d. `teskeid-weather-local`.
3. Tengdu billing account við projectið.
4. Settu budget alert strax, áður en þú ferð að prófa:
   - Fyrir localhost mæli ég með mjög lágu alerti, t.d. `$5` eða `$10`.
   - Budget alerts stoppa ekki endilega notkun sjálfkrafa, en láta þig vita snemma.
5. Farðu líka í quotas fyrir viðkomandi APIs þegar þau eru virkjuð og settu lág dev/test mörk ef þú vilt vera extra varkár.

### Step 2 - Enable required APIs

Virkjaðu þessi APIs í Google Cloud projectinu:

1. **Maps JavaScript API**
   - Fyrir `@googlemaps/js-api-loader` og Places library í browser.
   - Official setup: https://developers.google.com/maps/documentation/javascript/get-api-key

2. **Places API (New)**
   - Fyrir `AutocompleteSuggestion.fetchAutocompleteSuggestions()` og `place.fetchFields()`.
   - Official setup: https://developers.google.com/maps/documentation/places/web-service/get-api-key

3. **Maps Static API**
   - Fyrir kortamyndina með pinna í confirmation card.
   - Official setup: https://developers.google.com/maps/documentation/maps-static/get-api-key

4. **Routes API**
   - Fyrir `computeRoutes` í server-side route calculation.
   - Official setup: https://developers.google.com/maps/documentation/routes/get-api-key

Optional:

5. **Geocoding API**
   - Nýja Ferðalagið `/travel` flæðið þarf þetta ekki beint.
   - Gamla `/api/teskeid/weather/ask` route branch notar provider geocode ef hún er kölluð.
   - Ef þú prófar bara nýja wizardinn þarftu líklega ekki Geocoding API núna.

### Step 3 - Create browser key

1. Farðu í Google Cloud Console → APIs & Services → Credentials.
2. Create credentials → API key.
3. Nefndu lykilinn t.d. `teskeid-local-browser-maps`.
4. Application restrictions:
   - Veldu **Websites** / HTTP referrers.
   - Bættu við localhost referrers:

```text
http://localhost:*/*
http://127.0.0.1:*/*
```

5. Ef þú ætlar síðar að nota sama key í preview/prod, bættu ekki við fyrr en þú þarft:

```text
https://teskeid.is/*
https://*.teskeid.is/*
```

Fyrir production mæli ég samt frekar með sér production browser key seinna.

6. API restrictions:
   - Veldu **Restrict key**.
   - Leyfðu aðeins:
     - Maps JavaScript API
     - Places API (New)
     - Maps Static API
7. Save.
8. Settu value í `.env.local` sem `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`.

### Step 4 - Create server key

1. Create credentials → API key.
2. Nefndu lykilinn t.d. `teskeid-local-server-routes`.
3. Application restrictions:
   - Fyrir local dev getur IP restriction verið pirrandi ef IP talan þín breytist.
   - Öruggasta practical byrjun:
     - API-restrict-a lykilinn strangt.
     - Setja lág quotas/budget alerts.
     - Ekki commit-a lykilinn.
   - Ef þú veist public IP töluna sem local dev requests koma frá geturðu sett **IP addresses** restriction á hana.
4. API restrictions:
   - Veldu **Restrict key**.
   - Leyfðu:
     - Routes API
   - Optional:
     - Geocoding API, aðeins ef þú ætlar að prófa gamla `/ask` route branch.
5. Save.
6. Settu value í `.env.local` sem `GOOGLE_MAPS_SERVER_KEY`.

## Local `.env.local` setup

Opnaðu `.env.local`.

Settu eða staðfestu:

```env
AUTH_MVP_ENABLED=true
WEATHER_ENABLED=true
WEATHER_FLAG=true
WEATHER_AI_ENABLED=false
WEATHER_MAP_PROVIDER=google
GOOGLE_MAPS_SERVER_KEY=PASTE_SERVER_KEY_HERE
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=PASTE_BROWSER_KEY_HERE
METNO_USER_AGENT=Teskeidin/1.0 (+https://teskeid.is; teskeid@gottvibe.is)
```

Ekki setja:

```env
ANTHROPIC_API_KEY=
```

Það þarf ekki fyrir 2B. Það má vera tómt eða missing.

### If Veðrið does not show up

Ef `/auth-mvp/heim` sýnir ekki Veðrið:

1. Staðfestu `WEATHER_ENABLED=true`.
2. Ef `WEATHER_FLAG=true`, staðfestu að notandinn þinn hafi `vedrid` feature access.
3. Ef þú vilt einfalda local prófun, settu tímabundið:

```env
WEATHER_FLAG=false
```

Þá ættu allir logged-in users að sjá Veðrið þegar `WEATHER_ENABLED=true`.

Endurræstu dev server eftir env breytingu.

## Restart rules

Þú keyrir dev server sjálfur samkvæmt workflow.

Eftir breytingu á `.env.local`:

1. Stoppaðu dev server.
2. Ræstu hann aftur.
3. Gerðu hard refresh í browser.

Þetta er sérstaklega mikilvægt fyrir:

- `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`, því `NEXT_PUBLIC_*` fer í client bundle.
- `WEATHER_MAP_PROVIDER`, því server les env á request-time, en dev server hegðun er samt öruggust með restart.

## Localhost testing plan

Notaðu portið sem dev serverinn þinn sýnir. Dæmi hér miða við:

```text
http://localhost:3000
```

Ef dev server keyrir á öðru porti, notaðu það port.

### Test 0 - Basic access

Markmið: staðfesta auth, feature gate og að nýja Ferðalagið UI sé renderað.

1. Opnaðu:

```text
http://localhost:3000/auth-mvp/heim
```

2. Skráðu þig inn ef þú ert ekki logged in.
3. Staðfestu að Veðrið sé sýnilegt á heimaskjánum.
4. Opnaðu:

```text
http://localhost:3000/auth-mvp/vedrid
```

5. Vænt:
   - Header sýnir `Veðrið`.
   - Fyrsta skref sýnir `Hvaðan ferð þú?`.
   - Leitarinput birtist.
   - Þú sérð ekki prompt box.
   - Þú sérð ekki Grill.
   - Þú sérð ekki Golf.
   - Þú sérð ekki "Aðrar spurningar".

Ef þetta stenst ekki:

- Ef redirect á `/`: auth eða feature access vandamál.
- Ef gamla chat UI birtist: dev server gæti ekki verið endurræstur eða page import ekki nýtt.

### Test 1 - PlaceSearch + origin map

Markmið: staðfesta browser key, Places API og Static Maps API.

1. Í `Hvaðan ferð þú?`, sláðu:

```text
Reykjavík
```

2. Bíddu eftir suggestions.
3. Veldu `Reykjavík` úr suggestions.
4. Vænt:
   - Confirmation card birtist.
   - Static map birtist með pinna.
   - Texti sýnir staðarheiti.
   - `Breyta stað` hnappur birtist.
5. Smelltu `Breyta stað`.
6. Vænt:
   - Kort hverfur.
   - Leitarinput kemur aftur.
7. Veldu Reykjavík aftur.
8. Smelltu `Áfram`.

Ef suggestions koma ekki:

- Browser key vantar eða er rangt.
- Maps JavaScript API ekki virkjað.
- Places API (New) ekki virkjað.
- HTTP referrer restriction vantar `http://localhost:*/*` eða rétta portið.

Ef suggestions koma en kortamynd kemur ekki:

- Maps Static API ekki virkjað.
- Browser key API restriction leyfir ekki Maps Static API.
- Static Maps request er blocked af referrer/API restriction.
- Fallback með MapPin ætti að birtast, ekki crash.

### Test 2 - Destination map

1. Í `Hvert ferð þú?`, sláðu:

```text
Akureyri
```

2. Veldu Akureyri úr suggestions.
3. Vænt:
   - Destination confirmation card birtist.
   - Static map birtist með pinna.
   - `Breyta stað` virkar.
4. Smelltu `Áfram`.

### Test 3 - Ambiguous place comfort

Markmið: staðfesta að kortið hjálpi við tvíræð heiti.

1. Byrjaðu aftur eða notaðu `Breyta stað`.
2. Sláðu:

```text
Suðurgata
```

3. Skoðaðu suggestions.
4. Veldu eina niðurstöðu.
5. Skoðaðu kortið:
   - Er pinna staðsetningin plausible?
   - Er address/location nógu skýrt?
   - Er notandi líklegur til að sjá ef þetta er röng Suðurgata?
6. Smelltu `Breyta stað` ef staðurinn er rangur.

Það sem þú ert að meta hér er product-confidence, ekki bara technical success.

### Test 4 - Time inputs

1. Á `Hvenær?` skrefinu:
   - Settu brottför innan næstu 1-3 daga.
   - Láttu heimferð tóma fyrst.
   - Láttu latest home tómt fyrst.
2. Vænt:
   - `Áfram` var disabled þar til brottför var sett.
   - Enginn mobile zoom á input focus.
   - Enginn horizontal overflow.
3. Smelltu `Áfram`.

### Test 5 - No trailer + no lodging full run

Markmið: staðfesta full route/weather flow og general driving thresholds path.

1. Veldu:
   - Origin: Reykjavík
   - Destination: Akureyri
   - Brottför: innan næstu daga
   - Eftirvagn: `Enginn eftirvagn`
   - Gisting: `Gisti ekki`
2. Smelltu `Skoða veður`.
3. Vænt:
   - Loading state: `Sæki veðurspá...`
   - Result birtist með `Gott`, `Meðgótt` eða `Slæmt`.
   - `Af hverju?` birtist.
4. Opnaðu `Af hverju?`.
5. Staðfestu facts:
   - `Leið: Reykjavík → Akureyri (...)`
   - `Brottferð — vindur: ...`
   - Disclaimer: `Þetta er veðurmat...`

Athugaðu sérstaklega:

- Ef veður er slæmt án eftirvagns má niðurstaðan nú vera `Meðgótt` eða `Slæmt`; hún á ekki alltaf að verða `Gott`.

### Test 6 - Caravan / hjólhýsi

1. Smelltu `Byrja aftur`.
2. Veldu aftur Reykjavík → Akureyri.
3. Settu brottför.
4. Veldu:
   - Eftirvagn: `Hjólhýsi / karavan`
   - Gisting: `Gisti ekki`
5. Smelltu `Skoða veður`.
6. Vænt:
   - Niðurstaðan er strangari gagnvart vindi/hviðum en `Enginn eftirvagn`.
   - Ef hviður/vindur eru nálægt threshold, ætti status að verða `Meðgótt` eða `Slæmt`.

### Test 7 - Tent stay uses destination forecast

Markmið: staðfesta fix B í notendaflæði.

1. Smelltu `Byrja aftur`.
2. Veldu:
   - Origin: Reykjavík
   - Destination: Mývatn eða Akureyri
   - Brottför: innan næstu 1-3 daga
   - Heimferð: daginn eftir brottför
   - Eftirvagn: `Enginn eftirvagn` eða `Hjólhýsi / karavan`
   - Gisting: `Tjald`
3. Smelltu `Skoða veður`.
4. Opnaðu `Af hverju?`.
5. Leitaðu að:

```text
Dvöl á áfangastað — vindur: ...
```

6. Vænt:
   - Dvöl á áfangastað endurspeglar destination forecast.
   - Hún á ekki að litast af versta route point á leiðinni.

Practical note:

- Þú sérð ekki beint í UI hvaða veður var á hverjum route point. Hér ertu að sanity-checka að facts séu skýr og ekki obviously fáránleg.
- Ef þú sérð `Dvöl á áfangastað` með mjög hátt gildi sem passar alls ekki destination veður, sendu screenshot/handoff til Claude/Codex.

### Test 8 - Return leg

1. Smelltu `Byrja aftur`.
2. Veldu Reykjavík → Akureyri.
3. Settu:
   - Brottför: á næstu dögum.
   - Heimferð: 1-2 dögum seinna.
   - Latest home: nokkrum klst eftir áætlaða heimkomu.
4. Veldu eftirvagn, t.d. `Hjólhýsi / karavan`.
5. Veldu gistingu, t.d. `Inni`.
6. Smelltu `Skoða veður`.
7. Opnaðu `Af hverju?`.
8. Vænt:
   - Facts innihalda `Heimferð — vindur: ...` ef forecast nær yfir heimferð.

### Test 9 - Latest home warning

1. Smelltu `Byrja aftur`.
2. Veldu stutta eða meðal-langa leið.
3. Settu:
   - Heimferð t.d. kl. 18:00.
   - Latest home t.d. kl. 18:15, en leiðin tekur meira en 15 mín.
4. Smelltu í gegnum og keyrðu `Skoða veður`.
5. Opnaðu `Af hverju?`.
6. Vænt:
   - Facts innihalda warning um að heimkoma sé seinni en skilyrð heimkoma.

### Test 10 - Hestakerra caveat

1. Smelltu `Byrja aftur`.
2. Veldu route og brottför.
3. Veldu:
   - Eftirvagn: `Hestakerra`
   - Gisting: `Gisti ekki`
4. Keyrðu `Skoða veður`.
5. Opnaðu `Af hverju?`.
6. Vænt:
   - Facts innihalda caveat um hestakerru og hliðarvind/ökuréttindi.

### Test 11 - Time validation error

1. Smelltu `Byrja aftur`.
2. Veldu origin/destination.
3. Settu:
   - Brottför: 2026-07-08 12:00
   - Heimferð: 2026-07-08 10:00
4. Haltu áfram og smelltu `Skoða veður`.
5. Vænt:
   - Friendly villa: `Tímar eru ekki rökréttir. Athugaðu brottför og heimkomu.`
   - App crash-ar ekki.
   - `Til baka` leyfir þér að laga.

### Test 12 - Missing provider error

Þetta próf krefst að PlaceSearch virki, en server provider sé slökkt.

1. Í `.env.local`, haltu browser key inni:

```env
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=...
```

2. Slökktu á provider/server:

```env
WEATHER_MAP_PROVIDER=
GOOGLE_MAPS_SERVER_KEY=
```

3. Endurræstu dev server.
4. Opnaðu `/auth-mvp/vedrid`.
5. Veldu origin/destination með PlaceSearch.
6. Fylltu út tíma, eftirvagn og gistingu.
7. Smelltu `Skoða veður`.
8. Vænt:
   - Friendly villa um að veðurspá á leiðinni sé í þróun / provider ekki configured.
   - Enginn crash.

Settu svo aftur:

```env
WEATHER_MAP_PROVIDER=google
GOOGLE_MAPS_SERVER_KEY=...
```

og endurræstu áður en þú heldur áfram.

### Test 13 - Static map fallback

Markmið: prófa að kort mynd bilar án þess að UI crash-i.

Auðveldasta leið:

1. Haltu `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` inni svo PlaceSearch virki.
2. Í Google Cloud, fjarlægðu tímabundið Maps Static API úr browser key API restrictions, eða disable-aðu Maps Static API tímabundið.
3. Endurræstu dev server ef þú breyttir env ekki, refresh gæti dugað, en hard refresh er betra.
4. Veldu stað í wizard.
5. Vænt:
   - Static image bilar.
   - Fallback box með MapPin birtist.
   - `Breyta stað` virkar.
   - Enginn crash.
6. Kveiktu aftur á Maps Static API/restriction.

### Test 14 - Mobile layout

Prófa í devtools eða raunverulegum síma:

1. 360 px breidd.
2. 390 px breidd.
3. 460 px breidd.

Á hverri breidd:

1. Opna `/auth-mvp/vedrid`.
2. Focus-a staðarleit.
3. Slá inn `Reykjavík`.
4. Velja stað.
5. Skoða static map card.
6. Fara áfram í datetime inputs.
7. Focus-a hvert datetime input.
8. Fara áfram í option listana.
9. Keyra result.

Pass/fail:

- Pass: ekkert horizontal scroll.
- Pass: enginn input zoom.
- Pass: map heldur 2:1 aspect ratio.
- Pass: buttons eru nothæfir.
- Pass: texti sker ekki controls.
- Fail: kort eða address veldur overflow.
- Fail: keyboard focus skilur skjá eftir zoom-aðan/skakkan.
- Fail: result facts flæða út.

### Test 15 - English sanity check

Ef appið styður locale switch í þínu local state:

1. Skiptu yfir í ensku.
2. Opna `/auth-mvp/vedrid`.
3. Farðu í gegnum fyrstu 2-3 skref.
4. Staðfestu að:
   - PlaceSearch textar eru enskir.
   - Map alt/fallback textar eru ekki missing key.
   - Buttons og errors eru ekki íslensk nema það sé meðvitað fallback.

## Suggested test log template

Notaðu þetta á meðan þú prófar:

```md
## Veðrið Ferðalagið localhost test

Date:
Browser:
Viewport:
Env:
- WEATHER_MAP_PROVIDER=
- Browser key APIs:
- Server key APIs:

### Access
- /auth-mvp/heim shows Veðrið: yes/no
- /auth-mvp/vedrid opens wizard: yes/no
- Chat/Grill/Golf hidden: yes/no

### Places/maps
- Reykjavík suggestions: yes/no
- Origin map visible: yes/no
- Destination map visible: yes/no
- Suðurgata ambiguity understandable: yes/no

### Weather
- No trailer result:
- Caravan result:
- Tent stay result:
- Return leg facts:
- Latest-home warning:

### Mobile
- 360:
- 390:
- 460:

### Bugs/screenshots
- ...
```

## Troubleshooting

### PlaceSearch says "Villa við leit"

Likely causes:

- `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` missing.
- Dev server not restarted after adding `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`.
- Maps JavaScript API not enabled.
- Places API (New) not enabled.
- Browser key HTTP referrer restriction does not include your actual local URL/port.
- Browser key API restrictions do not include Maps JavaScript API and Places API (New).

### Suggestions work, but map does not show

Likely causes:

- Maps Static API not enabled.
- Browser key API restrictions do not include Maps Static API.
- Static Maps image request blocked by referrer restrictions.
- Browser cache stale.

Expected behavior:

- Map image falls back to muted box with MapPin.
- App should not crash.

### Result says provider not configured

Likely causes:

- `WEATHER_MAP_PROVIDER` missing or not `google`.
- Dev server not restarted after env change.

Fix:

```env
WEATHER_MAP_PROVIDER=google
```

Restart dev server.

### Result says route unavailable

Likely causes:

- `GOOGLE_MAPS_SERVER_KEY` missing/wrong.
- Routes API not enabled.
- Server key API restrictions do not include Routes API.
- Google Cloud billing not enabled.
- Route between selected points cannot be computed.

### Result says forecast unavailable

Likely causes:

- met.no unavailable.
- `METNO_USER_AGENT` missing or invalid.
- Selected route points/destination forecasts all failed.

### Veðrið not visible on home

Likely causes:

- `WEATHER_ENABLED` not true.
- `WEATHER_FLAG=true` but user lacks `vedrid` feature access.
- Auth/session issue.

Local testing workaround:

```env
WEATHER_FLAG=false
```

Restart dev server. Do not treat this as production config.

### Static map appears but wrong place

This is exactly why the map exists.

Action:

1. Click `Breyta stað`.
2. Select a different suggestion.
3. Try adding municipality/town in search, e.g. `Suðurgata Reykjavík` or `Suðurgata Hafnarfjörður`.
4. Screenshot the confusing case and send to Claude/Codex if UX is not good enough.

## What not to do yet

Do not:

- set production Vercel env yet,
- deploy,
- commit,
- push,
- run SQL/migrations,
- enable `WEATHER_AI_ENABLED=true`,
- set `ANTHROPIC_API_KEY`,
- add Google keys to source files,
- paste secrets into chat,
- loosen RLS/auth,
- test on production users.

## When localhost is good enough

Codex would consider this ready for commit review only when:

1. Type-check/tests/build are still green.
2. Google setup works locally.
3. Origin and destination map confirmation works.
4. Tvírætt staðarheiti test is understandable.
5. Full Reykjavík → Akureyri run works.
6. No-trailer can produce non-green in bad weather.
7. Tent stay uses destination facts.
8. Mobile 360/390/460 is clean.
9. Missing-key/provider fallbacks do not crash.
10. Stebbi is comfortable with billing/quota guardrails.

## Sources used for Google setup

Official Google docs checked on 2026-07-05:

- Maps JavaScript API setup: https://developers.google.com/maps/documentation/javascript/get-api-key
- Google Maps API security best practices: https://developers.google.com/maps/api-security-best-practices
- Places API (New) setup: https://developers.google.com/maps/documentation/places/web-service/get-api-key
- Routes API setup: https://developers.google.com/maps/documentation/routes/get-api-key
- Maps Static API setup: https://developers.google.com/maps/documentation/maps-static/get-api-key
- Google Maps pricing overview: https://developers.google.com/maps/billing-and-pricing/overview
- Places usage/billing: https://developers.google.com/maps/documentation/places/web-service/usage-and-billing
- Routes usage/billing: https://developers.google.com/maps/documentation/routes/usage-and-billing
- Maps Static usage/billing: https://developers.google.com/maps/documentation/maps-static/usage-and-billing
- Maps JavaScript usage/billing: https://developers.google.com/maps/documentation/javascript/usage-and-billing

## Commands run by Codex

- `Get-Content -Encoding UTF8 "WORKFLOW.md"` - exit code 0
- `Get-Content -Encoding UTF8 "ai-handoff/2026-07-05-2158-todo-067-v055-claude-fix-pass-a-b-c-d-shipped.md"` - exit code 0
- `Get-Content -Encoding UTF8 "ai-handoff/README.md"` - exit code 0
- `git status --short` - exit code 0, with warning about `C:\Users\Lenovo/.config/git/ignore`
- `git diff --stat` - exit code 0
- Read-only inspection of `lib/weather/staticMap.ts`, `components/weather/MapConfirmation.tsx`, `app/auth-mvp/vedrid/FerdalagidClient.tsx`, `app/api/teskeid/weather/travel/route.ts`, `lib/weather/travel.ts`, `lib/weather/thresholds.ts`, `lib/__tests__/weather-travel.test.ts`, `.env.example`, `messages/is.json`
- Redacted `.env.local` presence check - exit code 0
- `npm run type-check` - exit code 0
- `npm run test:run -- lib/__tests__/weather-travel.test.ts lib/__tests__/weather-google.test.ts lib/__tests__/weather-coords.test.ts lib/__tests__/weather-tools.test.ts` - exit code 0, 112 tests passed
- `npm run build` - exit code 0, with existing warnings outside Veðrið
- `npm run test:run` - exit code 0, 51 files passed, 1637 tests passed, 22 skipped, 8 todo

## Supabase / production / billing

Codex gerði engar Supabase breytingar, engar SQL breytingar, keyrði enga migration, breytti engum RLS policies, auth, grants, functions, secrets, Vercel env, production stillingum eða billing.

Google Cloud setup getur haft billing áhrif. Það er ástæðan fyrir budget alerts, quotas og key restrictions áður en fullar prófanir hefjast.

## Localhost checks for Stebbi

The detailed localhost checks are the main content of this file. Minimum required pass before asking for next commit/release review:

1. Access test passes.
2. PlaceSearch works.
3. Static map confirmation works for origin and destination.
4. Ambiguous place test is understandable.
5. Full no-trailer route test works.
6. Caravan route test works.
7. Tent stay/destination forecast test works.
8. Return leg/latest-home tests work.
9. Missing provider and static map fallback do not crash.
10. Mobile 360/390/460 px checks pass.

## Óvissa / þarf að staðfesta

- Codex did not operate Google Cloud and did not see the actual Google key setup.
- Codex did not run browser/localhost manually, because Stebbi runs dev server himself.
- Exact Google Cloud UI labels may vary slightly, but the required APIs/restrictions are based on current official docs.
