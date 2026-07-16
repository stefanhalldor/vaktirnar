# TODO 086 v185 - Codex handoff eftir localhost prófanir, refresh cooldown og veðurspjöld

Created: 2026-07-14 22:48
Timezone: Atlantic/Reykjavik

Mode:
- Handoff / review only.
- Engar app-kóðabreytingar, engar SQL-breytingar, engin migration keyrð af Codex.
- Stebbi hefur þegar keyrt SQL 75 og SQL 76 í Supabase og tilkynnti "Success. No rows returned" fyrir báðar.

Byggist á:
- `ai-handoff/2026-07-14-2215-todo-086-v184-claude-localhost-todo-vedrid.md`
- Stebba-localhost prófunum eftir v184.
- Read-only skoðun Codex á guard, refresh route, Veðurstofan refresh state, provider filter og veðurspjaldakomponentum.

---

## Stutt niðurstaða

Kerfið virðist orðið mjög functional og #7/#8 úr v184 eru staðfest af Stebba.

Það sem þarf næst er ekki nýtt stórt arkitektúrverk heldur þéttur polish/fix á þremur stöðum:

1. **Manual refresh cooldown:** 10 mín reglan er til á server, en UI leyfir `Sækja ný gögn` áfram eftir `stillStale`. Þetta þarf að laga þannig að notandi geti ekki spam-smellt og server svari líka örugglega `recentlyAttempted` innan cooldown.
2. **Gagnaveitufilter:** Texti og layout eru of hrá fyrir release. Gera þarf filterinn snyrtilegri og þjappaðri með Stebba-copy.
3. **Veðurspjöld:** Gulltryggja þarf samnýtingu milli `versti punktur`, `valinn punktur` og `allir spápunktar`, og sérstaklega að Veðurstofuspjöld fái sömu gæðatilfinningu/status-label og met.no/Yr spjöldin.

---

## Findings / áhætta

### 1. Medium - `stillStale` bypassar 10 mín cooldown í UI

Staða í kóða:

- Server-hliðin hefur 10 mín cooldown:
  - `lib/weather/providers/vedurstofan.server.ts:790-844`
  - `MANUAL_COOLDOWN_MS = 10 * 60 * 1000`
  - `getVedurstofanRunState(expectedAtimeIso)` skilar `recentlyAttempted` ef manual run fyrir sama `expected_atime` kláraðist innan cooldown.
- Refresh route styður þetta:
  - `app/api/teskeid/weather/vedurstofan/refresh/route.ts:29-66`
  - getur skilað `{ status: 'recentlyAttempted', lastAttemptIso }`.
- UI sýnir samt refresh button ef state er `stillStale`:
  - `app/auth-mvp/vedrid/FerdalagidClient.tsx:871-875`
  - `showVedurstofanRefreshButton` slekkur bara á takka fyrir `refreshing`, `fresh` og `recentlyAttempted`.
  - `stillStale` sýnir skilaboð og síðan takkann aftur, sjá `FerdalagidClient.tsx:935-950`.

Stebbi sá þetta á localhost:

- Manual refresh uppfærði gögn í spá frá kl. 18:00.
- Síðar var reynt aftur kl. 22:27.
- Banner sýndi:
  - `Veðurstofugögnin eru frá kl. 18:00`
  - `ný gögn væntanleg kl. 00:00`
  - `síðast reynt kl. 22:27`
  - `Við reyndum að sækja ný gögn en Veðurstofan skilaði enn eldri spá`
- En `Sækja ný gögn` var enn smellanlegt strax eftir 22:27.

Athugið: ef fyrri tilraun var 22:10/22:11 og næsta 22:27, þá er 22:27 í lagi því >10 mín eru liðnar. Bugið er að strax eftir 22:27 á takkinn að vera disabled til um 22:37 fyrir sama expected cycle.

Tillaga:

- Server:
  - Skila alltaf `lastAttemptIso` og helst `retryAfterSeconds` eða `cooldownUntilIso` þegar manual run lauk en provider skilaði enn gömlum gögnum.
  - Tryggja að annað POST innan 10 mín fyrir sama `expected_atime` skili `recentlyAttempted`, jafnvel þótt UI sé bilað.
- UI:
  - Geyma `lastAttemptIso`/`cooldownUntilIso` í state.
  - Ef `vedurstofanRefreshState === 'stillStale'` og síðasta manual attempt er innan 10 mín, sýna status en ekki button.
  - Texti mætti vera t.d. `Reynt kl. 22:27. Hægt að reyna aftur eftir 10 mín.`
  - Button á aðeins að birtast þegar cooldown er runnið út.

Próf sem þarf:

- Unit test fyrir `getVedurstofanRunState` eða refresh route sem staðfestir `recentlyAttempted` eftir `stillStale` manual run fyrir sama `expected_atime`.
- Component/unit test eða focused test á `FerdalagidClient` refresh-state ef núverandi test infrastructure leyfir.

---

### 2. Medium - Provider filter er virkni-lega réttur en copy/layout ekki release-polish

Núverandi textar:

- `messages/is.json:870-879`
- `providerMetnoHelperText`: `Staðfest grunnlína`
- `providerVedurstofanHelperText`: `Spágögn frá Veðurstofu Íslands, í prófun`
- `providerVegagerdinHelperText`: `Vegaskilyrði og meðvindsgögn, koma síðar`

Núverandi UI:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1183-1265`
- Þrír vertical hópar, hver með heading + switch + label + helper text.

Stebbi vill:

- `Sannreynt`: `Yr spágögnin`
- `Í prófunum`: `Veðurstofan`
- `Væntanlegt`: `Vegagerðin`
- Ekki sýna auka helper undir Veðurstofunni, því hópurinn segir nú þegar `Í prófunum`.
- Fyrir Vegagerðina þarf ekki meira en `Vegagerðin` og hlekk á `umferdin.is`.
- Þjappa þessu helst í eina línu, án þess að mobile layout brotni.
- Gera `Í prófunum` áberandi sem section/hópur, ekki fela prófunarmerkinguna í löngum helper texta.
- Footer/attribution má ekki tala um væntanleg gögn. Footer á bara að vísa í virkar/raunnotaðar gagnaveitur.

Tillaga:

- Breyta copy í translations, ekki hardcode-a.
- Láta provider filter vera responsive grid/chip-row:
  - Mobile: má wrap-a í 1-2 línur, en ekki þrjá háa blocks ef hægt er að forðast það.
  - Desktop/narrow card: þrír provider chips með litlum group-label ofan eða inline.
- Disabled Vegagerðin:
  - Texti `Vegagerðin`
  - Disabled switch/chip
  - `umferdin.is` linkur, en passið að linkurinn sé ekki ruglandi sem virkur provider-toggle.

---

### 3. Medium - Veðurstofuspjöld eru ekki nógu samnýtt við met.no/Yr spjöld

Stebbi bendir á að met.no/Yr spjaldið er með mun betri status-label/veðurskilyrðamerkingu en Veðurstofuspjaldið.

Núverandi munur í kóða:

- met.no/Yr row notar `RoutePointRow` neðst í `FerdalagidClient.tsx`, sem notar:
  - `RouteWeatherPointDetailCard`
  - `buildPointSummary`
  - `classifyPointWindDisplayStatus`
  - `WIND_STATUS_META_SHARED`
  - `ROUTE_POINT_CARD_CLASS`
  - `headerExtra` með provider-label og status-chip
  - sjá `app/auth-mvp/vedrid/FerdalagidClient.tsx:2145-2190`
- Veðurstofan notar sér komponent:
  - `components/weather/VedurstofanPointCard.tsx`
  - sérstakt `ForecastRowLine`
  - sérstakt card shell
  - notar þó `WIND_STATUS_UI_META`, en status-útlitið er ekki eins og met.no/Yr.

Það er ekki vandamál að data-adapter sé provider-specific. Það er vandamál ef card presentation, status-chip, spacing, title treatment og link treatment diverga án ástæðu.

Stebbi vill:

- Sama efnislega spjald fyrir:
  - `versti punktur`
  - `valinn punktur`
  - `allir spápunktar`
- Sama gæðatilfinningu/status label á Veðurstofu og met.no/Yr.
- Provider-specific linkar:
  - Yr/met.no linkar bara á met.no/Yr spjöld.
  - `vedur.is` linkur á Veðurstofu spjöld.
  - Vegagerðin síðar með eigin source/link.
- Þetta þarf að vera future-proof fyrir Vegagerðina.

Tillaga að útfærslu:

- Búa til shared presentational component, ekki þröngva öllum provider-gögnum í sama domain type.
- Dæmi:
  - `components/weather/WeatherPointCard.tsx`
  - Props geta verið normalized display model:
    - `title`
    - `providerLabel`
    - `status`
    - `statusMeta`
    - `variant`: `worst | selected | list`
    - `departureIso`
    - `etaIso`
    - `distanceFromOriginKm`
    - `distanceFromRoadM`
    - `forecastIssuedIso`
    - `forecastRows` eða `weatherLines`
    - `usedForecastIso`
    - `links`
    - `children`/slot fyrir provider-specific row detail ef þarf.
- Nota adapters:
  - met.no/Yr adapter notar núverandi `buildPointSummary(...)`.
  - Veðurstofan adapter notar núverandi `buildVedurstofanPointDisplayModel(...)`.
  - Vegagerðin adapter kemur síðar.
- Shared component á að nota sama status-chip og card styling:
  - `WIND_STATUS_META_SHARED` eða sameina `WIND_STATUS_UI_META` og `WIND_STATUS_META_SHARED` í eina source-of-truth ef þær eru að drift-a.
- `RouteWeatherPointDetailCard` má annaðhvort verða shared content layer, eða nýr shared wrapper notar hluta af honum. Forðast stóran refactor ef hægt er, en tryggja að UI verði samnýtt.

Sérstakt acceptance criterion:

- Veðurstofuspjald sem er `Óþægilegt` á að líta út eins og met.no/Yr `Óþægilegt` að því leyti sem skiptir máli: status-chip, litir, label, spacing og prominence.

---

### 4. Low/Medium - Flag og access semantics þurfa að vera skýr í næstu handoff

Staðfest í kóða:

- `lib/loans/guard.ts:70-88`

Núverandi env sem Stebbi nefndi:

```txt
WEATHER_ENABLED=true
WEATHER_FLAG=true
WEATHER_TRIP_FLAG=true
WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=true
```

Þetta opnar:

- `WEATHER_ENABLED=true`: master weather switch.
- `WEATHER_FLAG=true`: `/auth-mvp/vedrid` er per-user gated með `feature_access.feature_key = 'vedrid'`.
- `WEATHER_TRIP_FLAG=true`: trip/leiðar-affordance er per-user gated með `feature_access.feature_key = 'ferdalagid'`.
- `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=true`: Veðurstofan provider er per-user gated með `feature_access.feature_key = 'weather-provider-vedurstofan'`.
- SQL 76 gerir bara nýja feature-key leyfilega. Hún veitir engum aðgang sjálf.
- SQL 75 bætir metadata á `weather_fetch_runs`; það opnar ekki UI sjálft.

Athugið:

- Public `/vedrid` virðist stýrt sér með `WEATHER_PUBLIC_ENABLED` + `WEATHER_ENABLED` + `AUTH_MVP_ENABLED`, ekki `WEATHER_FLAG`.
- Ekki breyta þessu núna nema Stebbi biðji sérstaklega um public route breytingu.

---

### 5. Low - Supabase output lítur vel út, en grants-output vantaði `table_name`

Stebbi límdi:

- `profiles_select`: `(id = auth.uid())`
- `weather_saved_places_*_own`: `(user_id = auth.uid())`
- `profiles_insert_own` og `weather_saved_places_insert_own` sýna `qual = null`; það er eðlilegt fyrir INSERT því `WITH CHECK` er ekki sýnt í `qual`.
- SQL 75 og 76 voru keyrðar með success.

Grants-output:

- Þar sást einn hópur með `authenticated` DELETE/INSERT/SELECT/UPDATE.
- Þetta er líklega `weather_saved_places`, sem er eðlilegt ef RLS er own-user.
- En paste-ið var án `table_name`, þannig að Codex getur ekki staðfest 100% hvaða tafla var með authenticated grants.

Næsta read-only staðfesting ef Stebbi vill fulla vissu:

```sql
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN (
    'loan_items','loan_invitations','recent_events',
    'relationships','feature_access','weather_saved_places'
  )
  AND grantee IN ('anon', 'authenticated')
ORDER BY table_name, grantee, privilege_type;
```

Expected:

- `weather_saved_places` má hafa authenticated grants ef RLS own-user er rétt.
- `loan_items`, `loan_invitations`, `recent_events`, `relationships`, `feature_access` eiga ekki að vera opin authenticated/anon nema það sé með mjög meðvitaðri RLS/policy ákvörðun.

---

## Skýr framkvæmdarbeiðni til Claude Code

Claude Code, framkvæmdu afmarkaða lagfæringu fyrir TODO 086 með þessum mörkum:

1. Laga manual refresh cooldown:
   - Eftir manual `stillStale` attempt á sama expected Veðurstofu-cycle á `Sækja ný gögn` að vera disabled í 10 mín.
   - Server þarf áfram að enforce-a cooldown, ekki treysta bara á UI.
   - UI á að sýna síðasta attempt og hvenær má reyna aftur.
   - Ef notandi reynir samt beint á endpoint innan cooldown á endpoint að skila `recentlyAttempted`.

2. Polish-a provider filter:
   - Copy:
     - `Sannreynt`: `Yr spágögnin`
     - `Í prófunum`: `Veðurstofan`
     - `Væntanlegt`: `Vegagerðin`
   - Fjarlægja auka helper texta undir Veðurstofunni.
   - Vegagerðin er disabled, með einföldum `umferdin.is` link.
   - Þjappa layout eins mikið og mobile-safe hönnun leyfir.
   - Footer/attribution á ekki að telja upp væntanleg gögn.

3. Gulltryggja shared weather-card presentation:
   - Samnýta presentation fyrir `versti punktur`, `valinn punktur` og `allir spápunktar` eins mikið og hægt er.
   - Veðurstofuspjöld þurfa sama status-chip/lit/status-label gæði og met.no/Yr spjöld.
   - Ekki blanda provider-gögnum rangt saman; notið provider-specific adapters/display-models inn í shared card.
   - Linkar skulu vera provider-specific: Yr/met.no eingöngu á met.no/Yr, `vedur.is` eingöngu á Veðurstofu, Vegagerðin síðar.

4. Halda breytingum undir núverandi flags:
   - Veðurstofan provider áfram undir `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=true` + per-user `weather-provider-vedurstofan`.
   - Ekki opna Veðurstofuna globally.
   - Ekki breyta public `/vedrid` access nema Stebbi biðji sérstaklega um það.

5. Ekki:
   - Ekki commit-a.
   - Ekki push-a.
   - Ekki deploya.
   - Ekki keyra migration.
   - Ekki breyta Supabase utan kóða nema Stebbi gefi sérstaklega nýtt leyfi.

---

## Skrár sem Codex skoðaði

- `WORKFLOW.md`
- `ai-handoff/README.md`
- `ai-handoff/2026-07-14-2215-todo-086-v184-claude-localhost-todo-vedrid.md`
- `lib/loans/guard.ts`
- `app/vedrid/page.tsx`
- `app/auth-mvp/vedrid/page.tsx`
- `app/auth-mvp/vedrid/elta-vedrid/page.tsx`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `app/api/teskeid/weather/vedurstofan/refresh/route.ts`
- `lib/weather/providers/vedurstofan.server.ts`
- `components/weather/VedurstofanPointCard.tsx`
- `components/weather/RouteWeatherPointDetailCard.tsx`
- `messages/is.json`
- `messages/en.json`
- `sql/75_weather_fetch_runs_metadata.sql`
- `sql/76_feature_access_weather_provider_vedurstofan.sql`

---

## Skrár sem Codex breytti

- Bætti við þessari handoff skrá:
  - `ai-handoff/2026-07-14-2248-todo-086-v185-codex-v184-localhost-refresh-ui-card-handoff.md`

Engar app-skrár breyttar.
Engin SQL breytt.
Engin migration keyrð af Codex.

---

## Skipanir sem Codex keyrði

Read-only:

- `Get-Content -Encoding UTF8 WORKFLOW.md`
- `Get-Content -Encoding UTF8 ai-handoff\README.md`
- `Get-Content -Encoding UTF8 ai-handoff\2026-07-14-2215-todo-086-v184-claude-localhost-todo-vedrid.md`
- Nokkur `rg -n ...` til að finna flag, refresh, provider filter og card references.
- Nokkur `Get-Content` slices úr viðeigandi `.tsx`/`.ts`/`.sql` skrám.
- `git status --short`
- `Get-Date -Format 'yyyy-MM-dd HH:mm'`

Niðurstaða:

- Read-only skoðun tókst.
- `git status --short` sýndi mjög dirty worktree, mest Claude/Stebbi vinnu og nýjar handoff skrár. Codex snerti ekki þessar breytingar.
- Git gaf warning um `C:\Users\Lenovo/.config/git/ignore` permission denied; það hafði ekki áhrif á stöðumat.

---

## Localhost checks for Stebbi

Eftir Claude-lagfæringu þarf Stebbi að prófa á localhost, án þess að keyra Supabase/migration nema sérstaklega ákveðið:

### A. Access / flags

1. Notandi með `vedrid` en án `weather-provider-vedurstofan`:
   - Opna `/auth-mvp/vedrid`.
   - Reikna leið.
   - Vænt: met.no/Yr-only hegðun, enginn Veðurstofu provider filter.

2. Notandi með `vedrid`, `ferdalagid` og `weather-provider-vedurstofan`:
   - Opna `/auth-mvp/vedrid`.
   - Reikna leið.
   - Vænt: provider filter birtist og Veðurstofan hægt að toggle-a.

3. Kill switch:
   - Setja `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED` tómt/false í `.env.local` og endurræsa dev server sjálfur.
   - Sama feature-row notandi á að sjá met.no/Yr-only.

### B. Manual refresh cooldown

1. Finna stöðu þar sem Veðurstofugögn eru gömul.
2. Smella `Sækja ný gögn`.
3. Ef provider skilar enn eldri spá:
   - Banner má sýna `Við reyndum...`.
   - Banner á að sýna síðast reynt.
   - `Sækja ný gögn` má ekki vera smellanlegt aftur fyrr en 10 mín eru liðnar fyrir sama cycle.
4. Reyna að refresh-a strax aftur ef takkinn birtist fyrir mistök:
   - Vænt: annaðhvort UI leyfir það ekki, eða endpoint skilar `recentlyAttempted` og UI læsir.
5. Eftir 10 mín:
   - Button má birtast aftur.

### C. Provider filter polish

1. Staðfesta að copy sé:
   - `Sannreynt` / `Yr spágögnin`
   - `Í prófunum` / `Veðurstofan`
   - `Væntanlegt` / `Vegagerðin`
2. Staðfesta að Veðurstofan sé ekki með óþarfa helper texta undir sér.
3. Staðfesta að Vegagerðin sé disabled og hafi `umferdin.is` link.
4. Prófa narrow/mobile width:
   - Enginn horizontal overflow.
   - Texti skarast ekki.
   - Switch/chip hit targets eru nothæf.

### D. Veðurspjöld / shared card

Prófa með met.no/Yr eingöngu, Veðurstofan eingöngu og báðum virkum:

1. `Mest krefjandi punktur`:
   - Status-chip á Veðurstofu á að vera jafn skýr og met.no/Yr.
   - Provider-label á að vera rétt.
   - Linkar provider-specific.

2. `Valin veðurspá` á korti:
   - Velja met.no/Yr punkt.
   - Velja Veðurstofu punkt.
   - Bæði eiga að nota sama card presentation pattern.

3. `Allir spápunktar`:
   - met.no/Yr listi notar Yr/met.no linka.
   - Veðurstofu listi notar `vedur.is`.
   - Status-chip og card spacing líta samræmt út.

### E. Footer / attribution

1. Þegar bara met.no/Yr er virkt:
   - Footer/attribution vísar aðeins í met.no/MET Norway.
2. Þegar Veðurstofan er virkt:
   - Footer eða card-attribution má nefna Veðurstofu Íslands ef notað.
3. Ekki sýna væntanlegar gagnaveitur í footer/attribution.

---

## Óvissa / þarf að staðfesta

- Codex sá ekki table_name í grant-output frá Stebba, þannig að authenticated grants eru aðeins "líklega í lagi" ef þau eru á `weather_saved_places`. Ef Stebbi vill fulla vissu þarf read-only grants query með `table_name`.
- Codex framkvæmdi ekki browserpróf og keyrði ekki test/typecheck.
- Handoffið byggir á read-only kóðaskoðun og localhost-lýsingu Stebba.
