# TODO 086 / v228 - Codex review - v227 prerelease og sql88

Created: 2026-07-20 10:18
Timezone: Atlantic/Reykjavik
Agent: Codex

## Niðurstaða

`sql/88_weather_user_preferences_status_filter_mode.sql` er líklega öruggt að keyra sem afmarkað schema-only migration, að því gefnu að `sql/82_weather_user_preferences.sql` sé þegar keyrt í sama umhverfi.

Ég myndi samt **ekki merkja v227 sem full-release-ready** út frá upprunalegri ósk Stebba, því tvö product atriði eru enn ókláruð:

- óinnskráður notandi sem velur/vill vista `Nánar` fer ekki í innskráningarflæði
- gamla hvíta detail-spjaldið virðist enn renderast fyrir neðan kortið samhliða nýja overlay-inu

TypeScript og test suite eru græn.

## Findings

### 1. Major - `Nánar` save flow fyrir óinnskráðan notanda er ekki afgreitt

Í v226 bað Stebbi um að `Nánar` færi í sama innskráningar- og vistunarferli og sjálfgefin vindmörk. V227 handoff staðfestir sjálft að þetta var ekki gert:

- `ai-handoff/2026-07-20-1015-todo-086-v227-claude-v226-done-prerelease.md:230`

Kóðinn staðfestir það líka:

- `components/weather/WeatherOverviewClient.tsx:149`-`165`: `handleStatusFilterModeChange` skrifar localStorage alltaf, en sendir API PUT aðeins þegar `menuVariant === 'authenticated'`.
- `components/weather/WeatherOverviewClient.tsx:499`-`579`: pending auth flow er til fyrir `teskeid_pending_wind_thresholds`, en það er engin samsvarandi pending-key eða login-return save fyrir `statusFilterMode`.

Áhrif:

- Innskráður notandi getur líklega vistað `Einfalt/Nánar` eftir að `sql88` hefur verið keyrt.
- Óinnskráður notandi fær ekki login flow þegar hann stillir `Nánar`.
- Þetta stenst ekki nákvæmlega ósk Stebba um "setja mig í innskráningarferli og í sama vistunarferli".

Tillaga:

- Annað hvort biðja Claude Code að klára pending auth flow áður en þetta fer út, eða samþykkja skýrt að það fari í follow-up.
- Ef farið er í follow-up, setja það mjög sýnilega í release notes/handoff, ekki fela sem smáatriði.

### 2. Major - Overlay kemur ofan á kortið, en gamla detail-spjaldið virðist enn birtast fyrir neðan kortið

`WeatherOverviewShell` renderar nýja overlay-ið inni í relative map wrapper:

- `components/weather/WeatherOverviewShell.tsx:323`-`331`

En það renderar líka áfram provider `renderPostMap` detail cards:

- `components/weather/WeatherOverviewShell.tsx:342`-`345`

Og providerarnir skila enn gömlu spjöldunum:

- `components/weather/WeatherOverviewClient.tsx:770`-`797`: `StationDetail`
- `components/weather/WeatherOverviewClient.tsx:992`-`1009`: `VegagerdinStationDetail`

Áhrif:

- Við click á marker er líklegt að notandi fái bæði nýtt overlay á kortinu og gamla hvíta detail-spjaldið fyrir neðan.
- Það er ekki endilega tæknilegt bug ef Stebbi vildi sannreyna overlay áður en gamla spjaldið er tekið út, en v227 má þá ekki segja að overlay-flowið sé fullafgreitt.

Tillaga:

- Áður en release er kallað tilbúið: ákveða hvort gamla detail-spjaldið á að vera áfram tímabundið.
- Ef markmið dagsins er að losna við gamla spjaldið, þarf að slökkva á `renderPostMap` detail cards þegar `renderSelectedOverlay` er virkt og staðfest.

### 3. Medium - `sql88` er öruggt í meginatriðum en migration style er aðeins rýr

`sql/88_weather_user_preferences_status_filter_mode.sql` er schema-only:

- bætir við nullable `status_filter_mode text`
- droppar/endursetur check constraint
- leyfir aðeins `simple`, `detailed` eða `null`

Það breytir ekki RLS, grants, auth eða notendagögnum beint.

Áhætta:

- Ef `weather_user_preferences` taflan er ekki til, failar migration.
- Skráin er ekki með `begin; ... commit;`, rollback-comment eða `comment on column`, sem flestar fyrri migrations í repo hafa.
- Ef hún failar eftir `add column` en fyrir constraint getur dálkurinn setið eftir án constraint, þó þetta sé lítil áhætta hér.

Tillaga:

- Safe enough að keyra ef Stebbi vill prófa persisted `Nánar`.
- Betra að Claude Code bæti `begin/commit`, rollback comment og `comment on column` áður en þetta verður long-term migration-saga.

### 4. Medium - API PUT styður ekki raunverulegt status-only update

`app/api/teskeid/weather/preferences/thresholds/route.ts:103`-`105` krefst enn gildra `cautionWindMs` og `redWindMs` fyrir öll PUT.

Núverandi UI sendir thresholds með þegar `statusFilterMode` breytist:

- `components/weather/WeatherOverviewClient.tsx:156`-`162`

Þannig þetta virkar líklega í þessari UI-leið. En API contract er ekki eins og v226 lagði til, þ.e. partial update fyrir display preference.

Áhrif:

- Ekki blocker fyrir núverandi logged-in flow.
- Getur ruglað næsta implementation ef Claude Code reynir síðar að vista bara `statusFilterMode`.

Tillaga:

- Annaðhvort skjalfesta að PUT krefst alltaf thresholds, eða breyta API í partial update með varðveislu núverandi DB thresholds.

### 5. Medium - Veðurstofu `Nánar` URL sýnir ekki endilega "gamla spjaldið"

V227 handoff segir að engar breytingar hafi þurft á `VedurstofanPulsClient.tsx`, en upprunalega óskin var að nýja URL-ið sýndi gamla Veðurstofuspjaldið.

Ég staðfesti ekki í þessari rýni að `app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx` sé raunverulega sama UI og gamla `StationDetail` í overview. Þar þarf localhost-staðfestingu.

Tillaga:

- Stebbi eða Claude Code þarf að smella á Veðurstofu `Nánar` og bera saman við gamla detail-spjaldið.
- Ef það er ekki sama upplifun þarf annaðhvort extract-a `StationDetail` eða samræma URL spjaldið betur.

### 6. Minor - Auto overlay þegar pláss er til er ekki útfært

V227 handoff segir sjálft:

- `ai-handoff/2026-07-20-1015-todo-086-v227-claude-v226-done-prerelease.md:231`

Þetta er ekki blocker ef Stebbi samþykkir selected-marker overlay sem fyrsta skref, en ekki kalla "overlay eins og skjámyndin" fullafgreitt.

## SQL88 - á Stebbi að keyra?

Já, **ef markmiðið er að prófa eða gefa út v227 þar sem innskráður notandi á að geta vistað `Einfalt/Nánar` í gagnagrunn**.

Ég myndi keyra `sql88` með þessum skilyrðum:

- staðfesta fyrst að `sql82` sé þegar keyrt í sama Supabase umhverfi
- keyra á rétta umhverfi, ekki óvart local/staging/prod víxlað
- keyra sem schema migration, ekki sem handahófs SQL með öðrum breytingum
- vita að þetta klárar ekki óinnskráða login-save flowið

Ég myndi ekki keyra `sql88` ef:

- v227 verður ekki gefið út eða prófað núna
- þú vilt fyrst að Claude Code lagi pending auth flow og gamla detail-spjaldið
- þú vilt að migration skráin fylgi repo-style með transaction/rollback/comment áður en hún er keyrð

## Validation

Codex keyrði:

- `npm run type-check` - exit 0
- `npm run test:run` - exit 0

Test niðurstaða:

- 118 test files passed
- 3424 tests passed
- 27 skipped
- 8 todo

## Commands run by Codex

- `Get-Content -Encoding UTF8 'WORKFLOW.md'`
- `Get-ChildItem -File 'ai-handoff' | Sort-Object LastWriteTime -Descending | Select-Object -First 8 Name,LastWriteTime,Length`
- `git status --short`
- `Get-Content -Encoding UTF8 'ai-handoff\2026-07-20-1015-todo-086-v227-claude-v226-done-prerelease.md'`
- `Get-Content -Encoding UTF8 'sql\88_weather_user_preferences_status_filter_mode.sql'`
- `git diff --stat`
- `git diff --unified=80 -- 'app/api/teskeid/weather/preferences/thresholds/route.ts'`
- `git diff --unified=80 -- 'components/weather/WeatherOverviewClient.tsx'`
- `git diff --unified=80 -- 'lib/weather/windDisplayStatus.ts' 'components/weather/WeatherSourceTimeSelector.tsx' 'components/weather/DepartureHeatmap.tsx' 'components/weather/WeatherOverviewShell.tsx'`
- `Select-String ...` for relevant route/API/overlay/pending-auth locations
- `Get-Content -Encoding UTF8 'ai-handoff\README.md'`
- `npm run type-check`
- `npm run test:run`
- `Get-Date -Format "yyyy-MM-dd HH:mm"`

## Files changed by Codex

- `ai-handoff/2026-07-20-1018-todo-086-v228-codex-v227-prerelease-review-sql88.md`

Codex breytti ekki app-kóða, SQL migration innihaldi, Supabase, production, commit, push eða deploy.

## Localhost checks for Stebbi

Áður en v227 er gefið út:

1. Keyra localhost eins og Stebbi gerir venjulega.
2. Opna `/vedrid` sem public/anon notandi.
3. Velja `Nánar`.
4. Expected per original ósk: notandi ætti að fara í innskráningarflæði ef þetta á að vistast sem notandastilling.
5. Current expected per v227 code: líklega aðeins localStorage breyting, engin innskráning. Þetta er ósamræmi sem þarf ákvörðun.
6. Opna `/auth-mvp/vedrid` sem innskráður notandi.
7. Velja `Nánar`, refresha.
8. Ef `sql88` hefur verið keyrt: `Nánar` á að haldast.
9. Velja `Einfalt`, refresha.
10. Ef `sql88` hefur verið keyrt: `Einfalt` á að haldast.
11. Smella á Vegagerðar marker.
12. Staðfesta hvort bæði overlay og gamla hvíta detail-spjaldið birtast. Ef bæði birtast, ákveða hvort það sé tímabundið samþykkt.
13. Smella á Veðurstofu marker.
14. Smella `Nánar`.
15. Staðfesta að nýja URL-ið sýni gamla Veðurstofuspjaldið, ekki nýtt/óvænt Púls-only eða Vegagerðar-nearby flow.
16. Prófa mobile breidd 360-460 px:
    - overlay má ekki valda horizontal overflow
    - overlay má ekki hylja Google attribution/controls þannig að kortið verði klunnalegt
    - nýju scrubber örvarnar mega ekki þrengja tímaskrun svo mikið að UI verði ólesanlegt

Production/Supabase varúð:

- Ekki keyra `sql88` nema Stebbi sé viss um rétt Supabase umhverfi.
- `sql88` er schema change. Hún breytir ekki núverandi gildum, en hún snertir production schema ef keyrð á raun.
- Ekki prófa innskráningar-/notendastillingar kæruleysislega á raun nema þú sért sáttur við að vista stillingu á þinn notanda.
