# Codex review: v426 B3B Suspense/404/cache hardening

Created: 2026-07-17 13:34  
Timezone: Atlantic/Reykjavik  
Source handoff: `2026-07-17-1330-todo-086-v426-claude-b3b-suspense-404-cache-hardening`

## Findings

1. **Low/process: source handoff timestamp er ósamræmdur filename og workflow-reglu**  
   Handoff-skráin heitir `2026-07-17-1330-...`, en inni í henni stendur `Created: 2026-07-17 14:00`. Það er ekki product blocker, en þetta brýtur audit trail regluna í `WORKFLOW.md` um að keyra tímaskipun rétt áður en handoff er búið til og nota sama tíma í filename og `Created`.  
   Fix: biðja Claude Code að passa þetta í næsta handoff. Ekki þarf að breyta þessari skrá nema Stebbi vilji sérstaklega hreinsa audit trail.

2. **Low/UX: degraded state er öruggur en mjög þögull**  
   `components/weather/WeatherOverviewClient.tsx:67-75` meðhöndlar nú 401/403/404 sem `providerRestricted` og sýnir ekki harða villu. Það leysir v425 findingið. En þegar Veðurstofulagið er slökkt eða lokað birtist `/vedrid` í raun bara sem titill + CTA í ferðaveður.  
   Þetta er ásættanlegt sem hardening, en ef `/vedrid` verður default inngangur væri betra í B3C að hafa rólegan muted texta eða empty-state sem segir að stöðvayfirlitið sé ekki virkt/sýnilegt núna, án þess að hljóma eins og bilun.

3. **Low/clarification: RLS-óvissan í Claude-handoffinu virðist ekki eiga við**  
   Claude skrifar að anon-key/RLS á `vedurstofan_forecasts_latest` gæti valdið `null/undefined`. Ég skoðaði `lib/weather/providers/vedurstofan.server.ts:222-229`; `readVedurstofanProductForStations()` notar `getAdmin()` service role. Public endpointið treystir því ekki á anon RLS fyrir þennan lestur.  
   Það er gott að vera með defensive `raw instanceof Map ? raw : new Map()`, en raunverulega ábyrgðin er að endpointið skili aðeins public-safe payload. Núverandi test `does not expose user id, email, or Supabase internals` styður það.

## Niðurstaða

Enginn release-blocking bug fannst í v426. Suspense/loading lagfæringin er studd af production buildi, 404 verður nú rólegt degraded state, og cache headerinn er varfærinn (`private`) þannig að restricted/open mode blandast ekki milli notenda eða CDN.

Ég myndi telja þetta tilbúið í localhost validation. Eftir það má halda áfram í B3C provider-neutral overview shell, frekar en að fikta lengur í B3B nema localhost sýni nýtt vandamál.

## Staðfest í kóða

- `app/vedrid/loading.tsx` var bætt við og notar canonical `TeskeidLoader`.
- `components/weather/WeatherOverviewClient.tsx` meðhöndlar nú 401/403/404 sem silent/degraded provider state.
- `app/api/teskeid/weather/vedurstofan/stations/route.ts` skilar 200 svörum með:
  - `Cache-Control: private, max-age=60, stale-while-revalidate=300`
- `readVedurstofanProductForStations()` notar service role (`getAdmin()`), þannig að public station overview endpointið er server-side projection/read, ekki client/anon DB access.

## Keyrðar skipanir

- `npm run type-check`  
  Niðurstaða: exit 0.
- `npm run test:run -- lib/__tests__/weather-vedurstofan-station-explorer-api.test.ts lib/__tests__/weather-provider-stations.test.ts lib/__tests__/pulseBack.test.ts lib/__tests__/weather-travel.test.ts`  
  Niðurstaða: 4 files passed, 165 passed, 5 skipped.
- `npm run build`  
  Niðurstaða: exit 0. Production build fór í gegnum compile, lint/type, page data og static generation án Suspense/prerender villu.

Build warnings sem komu upp en virðast eldri/utan v426:

- `app/s/[sessionId]/page.tsx` missing hook deps
- `components/landing/Avatar.tsx` notar `<img>`
- `components/weather/IcelandOverviewMap.tsx` ref cleanup warning
- `components/weather/TravelAuditMap.tsx` missing hook deps

## Design.md / UX rýni

Ég las viðeigandi kafla í `Design.md` um mobile-first layout, navigation/loading feedback, buttons og error/empty states.

v426 er í takt við Design-reglurnar að því leyti að:

- public `/vedrid` fær route-level loader (`loading.tsx`) með canonical loader
- destructive error er ekki sýndur þegar provider er bara lokaður/slökktur
- cache hardening á að minnka upplifaða bið og dauðan skjá

Eina UX athugasemdin er að silent degraded state getur verið of tómur þegar `/vedrid` verður aðal entry. Það á heima í B3C sem empty-state/overview shell ákvörðun.

## Næsta skref

**Mælt næst:** B3C provider-neutral overview shell.

Markmið B3C:

1. Extract-a generic `WeatherOverviewShell`.
2. Halda Veðurstofu sem fyrsta provider layer config.
3. Undirbúa Vegagerðina sem næsta provider án þess að tvöfalda overview skjá.
4. Sameina:
   - loading/degraded/error states
   - provider filters/toggles
   - selected-provider preview card
   - pulse preview hooks/links
   - empty-state þegar engin provider-lög eru sýnileg
5. Halda ferðaveðri í `/vedrid/ferdalagid` og `/auth-mvp/vedrid/ferdalagid`.

Ekki fara strax í Vegagerðargögnin sjálf fyrr en shell/layer contractið er orðið skýrt.

## Suggested prompt for Claude Code

```text
Workflow

Rýndu `ai-handoff/2026-07-17-1334-todo-086-v427-codex-v426-b3b-hardening-review.md`.

Ef localhost validation hjá Stebba staðfestir v426, farðu í B3C sem næsta stóra skref:
- Extract-a provider-neutral `WeatherOverviewShell`.
- Halda Veðurstofunni sem fyrsta provider config/layer.
- Undirbúa contractið þannig að Vegagerðin geti komið inn síðar án duplicate overview skjás.
- Bæta við rólegu degraded/empty-state þegar ekkert provider layer er sýnilegt á `/vedrid`.
- Ekki breyta env, ekki SQL, ekki commit/push/deploy.
- Lesa `Design.md` fyrir UI/navigation states og nefna reusable components í handoff.

Stoppaðu og skilaðu review ef þú sérð að þetta verður of stórt eða ef provider-neutral contractið kallar á ákvörðun frá Stebba.
```

## Localhost checks for Stebbi

Prófa v426 áður en haldið er áfram í B3C:

1. **Public `/vedrid`, opið Veðurstofulag**
   - Env: `WEATHER_ENABLED=All`, `WEATHER_ELTA_VEDRID_FLAG=true`, og `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED` annaðhvort vantar eða er ekki `true`.
   - Opna `/vedrid` óinnskráður.
   - Vænt: title/CTA birtast strax, Veðurstofustöðvar koma á kortið, engin hang/refresh þörf.

2. **Public `/vedrid`, provider restricted**
   - Env: `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true`.
   - Opna `/vedrid` óinnskráður.
   - Vænt: title/CTA sjást, engin stöðvagögn, enginn rauður/destructive villa-texti.

3. **Public `/vedrid`, station-layer kill-switch off**
   - Env: `WEATHER_ELTA_VEDRID_FLAG` annað en `true` eða fjarlægt.
   - Opna `/vedrid`.
   - Vænt: title/CTA sjást, engin stöðvagögn, enginn load error.

4. **Auth overview**
   - Opna `/auth-mvp/vedrid` sem innskráður.
   - Vænt: sami overview-kjarni, CTA fer á `/auth-mvp/vedrid/ferdalagid`.

5. **Compat route**
   - Opna `/auth-mvp/vedrid/elta-vedrid`.
   - Vænt: sami skjár, back-link “Til baka í Veðrið”.

6. **Púls returnTo**
   - Velja stöð á public `/vedrid`, opna púls, fara til baka.
   - Vænt: kemur aftur á `/vedrid?stationId=...`.
   - Endurtaka sem innskráður á `/auth-mvp/vedrid`.

7. **Loading/hang regression**
   - Refresh-a `/vedrid` nokkrum sinnum og skipta milli `/vedrid` og `/vedrid/ferdalagid`.
   - Vænt: engin endalaus “Sæki veðurgögn...”, enginn hvítur/hangandi skjár.

Ekki breyta Vercel/production env fyrir þessi próf nema það sé sérákvörðun.

## Óvissa / þarf að staðfesta

- Ég keyrði ekki browser/localhost, bara build og automated tests.
- Ég staðfesti ekki sjónrænt hvort title + CTA-only degraded state sé nógu gott; ég tel það non-blocking en líklega B3C UX ákvörðun.
- Build bjó til `.next` output staðbundið; ég gerði engar product-code breytingar.
