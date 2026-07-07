# TODO-067 v054 - Codex handoff after Stebbi decisions on v053

Created: 2026-07-05 21:42  
Timezone: Atlantic/Reykjavik  
From: Codex  
To: Stebbi og Claude Code  
Status: Decision handoff / execution scope. Engar kóðabreytingar, engin SQL-keyrsla, ekkert deploy, ekkert commit og engar production/env breytingar voru framkvæmdar af Codex.

## Context

Codex las `WORKFLOW.md` og síðan `2026-07-05-2131-todo-067-v053-claude-v052-review.md`.

Stebbi svaraði opnu spurningunum í v053:

1. **Kortastaðfesting:** Stebbi vill flotta lausn með korti.
2. **Leyfi til lagfæringar:** Já, laga Major 2-4.

Þetta handoff festir niður nákvæman ramma áður en Claude Code framkvæmir næsta fix-pass.

## Codex interpretation

### 1. Kort: flott MVP-lausn, ekki texta-only

Stebbi vill ekki láta textastaðfestingu duga. Ferðalagið þarf visual confirmation þannig að notandi sjái betur hvort réttur staður hafi verið valinn, sérstaklega fyrir tvíræð heiti eins og `Suðurgata`.

Codex mælir með **polished static map confirmation card** í þessum fix-pass:

- sýna kortamynd með pinna fyrir valinn stað,
- sýna nafn og formatted address yfir eða undir korti,
- hafa skýran `Breyta` action,
- hafa loading/error fallback ef static map URL fæst ekki,
- nota Teskeið tokens og mobile-first layout,
- ekki bæta við fullu draggable interactive map nema Claude Code sjái sterka ástæðu og stoppi fyrst fyrir Stebba/Codex rýni.

Rök: static map gefur notandanum visual comfort án þess að stækka scope í nýtt interactive map editing-flow. Notandi velur stað í Places; kortið staðfestir valið.

### 2. Major 2-4 eiga að lagast núna

Claude Code má laga:

- `trailerKind='none'` sem skilar alltaf `graent`,
- stay/lodging sem notar route-wide forecasts í stað destination forecast,
- sampling sem getur misst destination punktinn.

Þetta er kóðabreytingarleyfi fyrir afmarkað fix-pass, en ekki commit/push/deploy/env/Supabase/SQL.

## Required fixes

### Fix A - General driving thresholds fyrir engan eftirvagn

Núverandi hegðun í `lib/weather/travel.ts`:

```ts
if (trailerKind === 'none') return { stada: 'graent' }
```

Þetta má ekki standa. Ef enginn eftirvagn er valinn þarf Ferðalagið samt að meta hættulegan vind/úrkomu fyrir almennan akstur.

Útfærsla:

- Bæta `driving` thresholds við `WEATHER_THRESHOLDS` í `lib/weather/thresholds.ts`.
- Mælt byrjun:
  - `cautionWindMs: 15`
  - `redWindMs: 20`
  - `redGustMs: 28`
  - nota áfram `WEATHER_THRESHOLDS.dry.maxPrecipMmPerHour` fyrir úrkomu warning.
- Uppfæra `evalDrivingLeg()` þannig að `trailerKind === 'none'` noti `WEATHER_THRESHOLDS.driving`.
- Bæta/uppfæra tests:
  - no trailer + calm -> `graent`,
  - no trailer + caution wind -> `gult`,
  - no trailer + red wind -> `rautt`,
  - no trailer + red gust -> `rautt`,
  - no trailer + precipitation -> `gult`.

### Fix B - Destination forecast fyrir stay/lodging

Núverandi hegðun:

- `/travel/route.ts` sækir forecast fyrir route points.
- `checkTravelWeather()` notar sömu `pointForecasts` fyrir stay window.

Það er rangt fyrir gistingu. Dvöl á áfangastað á að nota áfangastaðarspá, ekki versta veður á allri leiðinni.

Útfærsla:

- Í `app/api/teskeid/weather/travel/route.ts`, sækja forecast sérstaklega fyrir `destination.lat` / `destination.lon`.
- Senda það inn í `checkTravelWeather()` sem sérstakt input, t.d.:

```ts
destinationForecast: { hours: HourPoint[] }
```

eða:

```ts
destinationForecasts: Array<{ hours: HourPoint[] }>
```

Ef einn destination forecast nægir, halda API einföldu.

- Í `lib/weather/travel.ts`, nota destination forecast einvörðungu fyrir stay/lodging window.
- Route point forecasts eiga áfram að meta outbound og return driving legs.
- Ef destination forecast vantar eða nær ekki yfir stay window, skila conservative `gult` / `no_data` fyrir stay, en ekki blanda inn route-wide forecasts.
- Bæta tests:
  - windy route point during stay + calm destination + tent -> ekki gult/rautt út af route point,
  - calm route + windy destination stay + tent -> gult/rautt út af destination,
  - no destination stay data -> `gult`/`no_data` þegar outdoor lodging + returnDepartureAt.

### Fix C - Sampling missir ekki destination

Ef destination forecast er sótt sérstaklega leysist stærsta áhættan, en route sampling má samt ekki vera villandi.

Útfærsla:

- Gera sampling helper sem heldur fyrsta og síðasta punkt innan cap ef route forecast á enn að innihalda destination.
- Eða, ef destination er alltaf sótt sérstaklega, document-a að route sampling er fyrir driving exposure points og destination forecast er outside route cap.
- Ekki hafa `push(last)` og síðan `splice(MAX_WEATHER_POINTS)` sem getur fjarlægt last point óvart.
- Bæta tests fyrir long route sampling ef helper er extract-aður.

### Fix D - Kortastaðfesting í wizard

Núverandi `FerdalagidClient` er með local `PlaceConfirmation` sem sýnir bara `MapPin`, nafn og address.

Stebbi vill kort.

Útfærsla sem Codex mælir með:

1. Bæta static map URL við stað eftir PlaceSearch selection.
2. Ekki nota server key í browser. Nota browser-restricted key eða provider helper sem er öruggur fyrir client.
3. Reuse eða refactor `components/weather/MapConfirmation.tsx`, en laga ef þarf:
   - alt text í messages eða skýrlega non-UX dynamic text ef ákveðið,
   - attribution áfram `Map data ©Google`,
   - rounded radius 8-12px samkvæmt Design.md,
   - stable aspect ratio,
   - loading/error fallback.
4. Staðfestingarkort í origin og destination skrefum:
   - kort ef key/provider er til,
   - text fallback ef static map getur ekki birtst,
   - `Breyta` action alltaf til staðar.
5. Ekki bæta við admin toggle, Supabase, Mapbox eða interactive draggable map í þessum fix-pass.

Athugið: `PlaceSearch` keyrir í browser og skilar lat/lon. Það er líklega einfaldast að búa til client-safe `staticMapUrl` helper fyrir Google Static Maps með `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`, en Claude Code þarf að passa key restrictions í handoff og `.env.example`.

## Design.md requirements

Claude Code þarf að fylgja `Design.md` sérstaklega þar sem þetta snertir UI:

- mobile-first 360/390/460 px,
- enginn horizontal overflow,
- input font-size minnst 16px,
- touch targets um 40px+,
- texti má ekki skarast eða flæða út,
- kort ekki inni í nested card-flækju,
- nota Teskeið tokens,
- loading/error states mega ekki valda layout shift,
- allur notendatexti í `messages/is.json` og `messages/en.json`,
- route/data pending state sýnilegur.

## Explicit non-goals

Þessi fix-pass má ekki innihalda:

- commit,
- push,
- deploy,
- production env breytingar,
- `.env.local` breytingar nema Stebbi biðji sérstaklega um það,
- Google Cloud/billing/key setup,
- Supabase migration,
- SQL keyrslu,
- admin provider toggle,
- Mapbox adapter,
- destination discovery / "Finndu góðan stað",
- Grill/Golf/chat UI,
- AI decision engine,
- dev server restart.

## Copy/paste til Claude Code

```text
Claude Code, lestu WORKFLOW.md, ai-handoff/README.md, Design.md og v054. Framkvæmdu svo afmarkaðan TODO-067 fix-pass út frá ákvörðunum Stebba í v053/v054.

Skilningur á samþykki:
Stebbi hefur samþykkt kóðabreytingar fyrir þennan afmarkaða fix-pass:
1. Flott kortastaðfesting í Ferðalagið wizard.
2. Laga Major 2: trailerKind='none' má ekki alltaf skila graent.
3. Laga Major 3+4: destination/stay forecast þarf að vera destination-only og sampling má ekki missa destination punkt á villandi hátt.

Þetta felur í sér UI/helper/API/test/message breytingar eftir þörfum.
Þetta felur EKKI í sér commit, push, deploy, production env breytingar, .env.local breytingar, Google Cloud/billing/key setup, Supabase migration, SQL keyrslu, admin provider toggle, Mapbox adapter, destination discovery, Grill/Golf/chat UI, AI decision engine eða dev-server restart.

Framkvæmdu:

1. Kortastaðfesting:
- Settu polished static map confirmation card inn í Ferðalagið wizard fyrir bæði origin og destination.
- Kortið á að sýna pinna á völdum stað, nafn og formatted address, og skýrt "Breyta" action.
- Nota client-safe browser key fyrir Static Maps eða örugga provider-lausn. Ekki leka server key í browser.
- Hafa fallback ef kort birtist ekki, en texta-only má ekki vera default þegar key er til.
- Fylgja Design.md: mobile-first, stable aspect ratio, enginn horizontal overflow, ekki nested card-flækja, texti í messages þar sem við á.

2. General driving thresholds:
- Bættu WEATHER_THRESHOLDS.driving við lib/weather/thresholds.ts.
- Mælt byrjun: cautionWindMs=15, redWindMs=20, redGustMs=28.
- Uppfærðu lib/weather/travel.ts þannig að trailerKind='none' meti almennan akstur með þessum thresholds, ekki alltaf graent.
- Bættu tests fyrir calm/gult/rautt/gust/precip þegar trailerKind='none'.

3. Destination forecast:
- Í app/api/teskeid/weather/travel/route.ts skaltu sækja forecast sérstaklega fyrir destination lat/lon.
- Sendu destination forecast sérstaklega inn í checkTravelWeather.
- Í lib/weather/travel.ts skal stay/lodging window nota eingöngu destination forecast, ekki route-wide pointForecasts.
- Route point forecasts meta outbound og return driving legs.
- Bættu tests sem sýna að windy route point á stay window litar ekki dvöl ef destination er calm, og að windy destination litar dvöl rétt.

4. Sampling:
- Fjarlægðu eða lagaðu push(last)+splice pattern sem getur hent destination punkti.
- Ef destination forecast er alltaf sótt sérstaklega, skráðu í kóða/testum að route sampling er fyrir driving exposure og destination forecast er utan cap.
- Bættu test ef sampling helper er extract-aður.

5. Gamla /ask branch:
- Ekki nauðsynlegt í þessum fix-pass nema breytingarnar séu litlar og öruggar.
- Ef þú snertir hana, ekki leyfa notendasýnilegt route-flow að velja candidates[0] án staðfestingar.

Keyrðu að minnsta kosti:
- npm run type-check
- npm run test:run -- lib/__tests__/weather-travel.test.ts lib/__tests__/weather-google.test.ts lib/__tests__/weather-coords.test.ts lib/__tests__/weather-tools.test.ts
- npm run build ef breytingar snerta Next client/server boundary
- full npm run test:run ef tími leyfir

Skilaðu handoff í ai-handoff/ með réttum tíma samkvæmt WORKFLOW.md. Handoffið þarf að innihalda findings/summary, breyttar skrár, skipanir og exit codes, hvað var ekki gert, Supabase/production/billing kafla og nákvæm Localhost checks for Stebbi. Ekki skrifa bara í spjallið.
```

## Localhost checks for Stebbi eftir fix-pass

Stebbi þarf ekki að prófa þetta fyrr en Claude Code hefur skilað nýju handoffi eftir framkvæmd.

Þegar fix-pass er kominn:

1. Setja Google env vars á localhost ef ekki þegar gert:
   - `WEATHER_MAP_PROVIDER=google`
   - `GOOGLE_MAPS_SERVER_KEY=...`
   - `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=...`
   - `WEATHER_AI_ENABLED=false`
2. Endurræsa localhost dev server sjálfur eftir env breytingu.
3. Opna `/auth-mvp/vedrid`.
4. Velja origin, t.d. `Reykjavík`.
5. Staðfesta að confirmation card sýni kort með pinna, nafn/address og `Breyta`.
6. Velja destination, t.d. `Akureyri`.
7. Staðfesta að destination confirmation sýni líka kort með pinna.
8. Prófa tvírætt heiti eins og `Suðurgata` og skoða hvort kortið gefi betra confidence en texti einn.
9. Prófa ferð án eftirvagns í slæmu veðri ef hægt er að finna tíma/leið: hún má ekki alltaf verða `Gott`.
10. Prófa ferð með `Tjald` og heimferð, og staðfesta að `Dvöl á áfangastað` vísi í áfangastaðarveður, ekki versta route point.
11. Prófa mobile widths 360/390/460 px: ekkert horizontal overflow, ekkert input zoom, kortið heldur stable aspect ratio.
12. Prófa missing map/key fallback ef hægt: UI má ekki crash-a.

Ekki prófa production, Vercel env, Google billing, Supabase migrations, RLS, auth policy breytingar eða notendagögn nema Stebbi gefi sérstakt leyfi.

## Skrár skoðaðar af Codex

- `WORKFLOW.md`
- `ai-handoff/README.md`
- `Design.md`
- `ai-handoff/2026-07-05-2131-todo-067-v053-claude-v052-review.md`
- `components/weather/MapConfirmation.tsx`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `lib/weather/travel.ts`
- `app/api/teskeid/weather/travel/route.ts`
- `lib/weather/thresholds.ts`

## Skrár breyttar af Codex

- `ai-handoff/2026-07-05-2142-todo-067-v054-codex-v053-stebbi-decisions-handoff.md`

Engar app-kóðaskrár, message-skrár, SQL-skrár, env-skrár eða production stillingar voru breyttar af Codex í þessu skrefi.

## Skipanir keyrðar af Codex

- `Get-Content -Encoding UTF8 "WORKFLOW.md"` - exit code 0
- `Get-Content -Encoding UTF8 "ai-handoff/2026-07-05-2131-todo-067-v053-claude-v052-review.md"` - exit code 0
- `Get-Content -Encoding UTF8 "ai-handoff/README.md"` - exit code 0
- `Get-Date -Format "yyyy-MM-dd-HHmm"` - exit code 0
- `Get-Content -Encoding UTF8 "Design.md"` - exit code 0
- `Get-Content -Encoding UTF8 "components/weather/MapConfirmation.tsx"` - exit code 0
- `Get-Content -Encoding UTF8 "app/auth-mvp/vedrid/FerdalagidClient.tsx"` - exit code 0
- `Get-Content -Encoding UTF8 "lib/weather/travel.ts"` - exit code 0
- `Get-Content -Encoding UTF8 "app/api/teskeid/weather/travel/route.ts"` - exit code 0
- `Get-Content -Encoding UTF8 "lib/weather/thresholds.ts"` - exit code 0

## Supabase / production / billing

Codex gerði engar Supabase breytingar, engar SQL breytingar, keyrði enga migration, breytti engum RLS policies, auth, grants, functions, secrets, Vercel env, production stillingum eða billing.

Claude Code á ekki að gera slíkt í þessum fix-pass.

## Óvissa / þarf að staðfesta

- Codex túlkar "flotta lausn með korti" sem polished static map confirmation card í MVP. Ef Stebbi vill fullkomið interactive draggable map strax þarf að stoppa og plana það sérstaklega, því það stækkar scope og testing.
- Google keys eru enn forsenda fyrir full localhost próf. Þetta handoff biður Claude Code ekki um að setja upp lykla eða breyta `.env.local`.
