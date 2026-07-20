# Codex Review: v232 prerelease og SQL88 ákvörðun

Created: 2026-07-20 11:59
Timezone: Atlantic/Reykjavik
Agent: Codex
Relevant TODO: 086
Reviewed handoff: `2026-07-20-1150-todo-086-v232-claude-v231-done-prerelease.md`
Review type: prerelease review + SQL88 gate

## Findings

1. **Medium - v232 lokar InfoWindow þegar anchor vantar, en ekki þegar valinn marker er falinn með status-filter.**  
   Í `components/weather/IcelandOverviewMap.tsx:263` er aðeins tékkað á `!anchor`, en map reconciliation geymir falda marker-a áfram í `markerRegistryRef` og kallar `marker.setVisible(m.visible !== false)` í `components/weather/IcelandOverviewMap.tsx:215`. Þess vegna getur `anchor` enn verið til þó marker sé ósýnilegur eftir filter. `buildSelectedCallout` í `components/weather/WeatherOverviewClient.tsx:999` og `components/weather/WeatherOverviewClient.tsx:1019` tékkar líka bara á route-filter, ekki `isVisibleInCurrentFilter(status)`.  
   **Áhrif:** Localhost check #10 úr v232 ("status-filter sem felur valda stöð á að loka InfoWindow") er líklega ekki tryggt. Þetta er ekki SQL88-blocker, en ég myndi láta Claude Code laga þetta áður en v232 er gefið út sem hreint overlay/status-filter fix. Einfaldasta lagfæring: annað hvort loka í `IcelandOverviewMap` ef `anchor.getVisible?.() === false`, eða láta `buildSelectedCallout` skila `null` þegar valin stöð fellur utan núverandi status-filter. Best er að gera bæði ef það helst lítið.

2. **Low - `pulseStation` whitelist lagar blindgötuna, en prófa þarf nested `returnTo` handvirkt.**  
   `lib/weather/pulseBack.ts:59` samþykkir nú `/auth-mvp/vedrid/puls/stod/{stationId}` með query/hash. Þetta leysir fyrri blockerinn. Þar sem Veðurstofan -> Vegagerðin púls getur borið `returnTo` inni í öðru `returnTo`, þarf að prófa browser-flæðið með raunverulegri slóð svo URL-encoding tapist ekki í keðjunni.

3. **Low - blái hardcode-aði link-liturinn í InfoWindow stendur enn.**  
   `components/weather/IcelandOverviewMap.tsx:297` notar `#2563eb`. Þetta er ekki release-blocker, en er áfram smá Design.md skuld ef overlayið á að líta út eins og Teskeið.

## SQL88 svar

**Já, Stebbi má keyra `sql/88_weather_user_preferences_status_filter_mode.sql` núna, að því gefnu að `sql/82_weather_user_preferences.sql` sé þegar keyrt á production.**

SQL88 gerir aðeins þetta:

- bætir nullable dálki við `public.weather_user_preferences`: `status_filter_mode text`
- endurskapar check constraint sem leyfir aðeins `null`, `'simple'` eða `'detailed'`
- breytir ekki RLS
- breytir ekki grants
- breytir ekki auth
- breytir ekki functions/triggers
- uppfærir ekki núverandi notendagögn nema að PostgreSQL þurfi að skrá schema-breytinguna sjálfa

Áhættan er lág. Helsti fyrirvarinn er að `ALTER TABLE` tekur lock á `weather_user_preferences` á meðan dálkur/constraint eru sett inn. Taflan ætti að vera lítil og lockið stutt. Ef `weather_user_preferences` vantar, mun SQL88 faila vegna þess að það gerir ráð fyrir sql82.

SQL88 er líka idempotent í meginatriðum (`add column if not exists`, `drop constraint if exists`). Það vantar þó `begin; commit;` og rollback-comment miðað við stíl margra eldri migration-skráa. Það er ekki functional blocker, en ef Claude Code fær tíma fyrir útgáfu væri snyrtilegra að bæta því við áður en Stebbi keyrir migration.

## Release recommendation

- **SQL88:** má keyra núna ef sql82 er inni. Keyra handvirkt í Supabase SQL editor eða þeirri production-migration leið sem Stebbi notar. Codex keyrði ekki SQL.
- **v232 code:** ekki full "clean release" fyrr en InfoWindow-hidden-marker atriðið hér að ofan er annað hvort lagað eða sannreynt í browser að það gerist ekki. Þetta er óháð SQL88.
- **Ef markmiðið er bara að vista `Einfalt/Nánar` á notanda:** SQL88 er rétta næsta skrefið. Án SQL88 notar API fallback og wind-threshold saves eiga að halda áfram að virka, en `statusFilterMode` vistast ekki varanlega í DB.

## Commands run by Codex

- `Get-Content -Encoding UTF8 WORKFLOW.md` - exit 0
- `Get-Content -Encoding UTF8 ai-handoff/README.md` - exit 0
- `Get-Content -Encoding UTF8 sql/88_weather_user_preferences_status_filter_mode.sql` - exit 0
- `Get-Content -Encoding UTF8 ai-handoff/2026-07-20-1150-todo-086-v232-claude-v231-done-prerelease.md` - exit 0
- `rg -n "buildSelectedCallout|isVisibleInCurrentFilter|selectedCallout|onSelectProviderMarker|statusFilterMode" ...` - exit 0
- `rg -n "weather|Veður|route|leið|mobile|kort|pill|overlay|InfoWindow|status" Design.md IcelandRoadmap.md` - exit 0
- `git diff --check` - exit 0, only LF/CRLF warnings for `.obsidian/workspace.json` and `components/weather/WindStatusFilterPills.tsx`
- `npm run type-check` - exit 0
- `npm run test:run` - exit 0, 118 test files passed, 3428 tests passed, 27 skipped, 8 todo
- `Get-Date -Format "yyyy-MM-dd HH:mm"` - exit 0, used for this filename and `Created`

## Files reviewed

- `ai-handoff/2026-07-20-1150-todo-086-v232-claude-v231-done-prerelease.md`
- `sql/88_weather_user_preferences_status_filter_mode.sql`
- `app/api/teskeid/weather/preferences/thresholds/route.ts`
- `components/weather/WeatherOverviewClient.tsx`
- `components/weather/WeatherOverviewShell.tsx`
- `components/weather/IcelandOverviewMap.tsx`
- `lib/weather/pulseBack.ts`
- `lib/__tests__/pulseBack.test.ts`
- `Design.md`
- `IcelandRoadmap.md`

## Files changed by Codex

- `ai-handoff/2026-07-20-1159-todo-086-v233-codex-v232-prerelease-review-sql88.md`

No app code, SQL, migrations, production data, commit, push, or deploy was changed/run by Codex.

## Supabase / SQL impact

For `sql/88_weather_user_preferences_status_filter_mode.sql`:

- SQL file: `sql/88_weather_user_preferences_status_filter_mode.sql`
- Was it run by Codex: no
- Data impact: no row rewrite expected from nullable column without default; existing rows get `null`
- RLS impact: none
- Auth impact: none
- Grants impact: none
- Policies impact: none
- Functions/triggers impact: none
- Production risk: low, but it is still a production schema change and should be run intentionally

Suggested quick preflight before running in production:

```sql
select to_regclass('public.weather_user_preferences') as preferences_table;
```

Expected: `weather_user_preferences`.

Optional post-check after running:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'weather_user_preferences'
  and column_name = 'status_filter_mode';
```

Expected: one row, `text`, nullable.

## Design.md check

The remaining InfoWindow issue touches map UI and mobile behavior. Design.md expects mobile-first behavior, no incoherent overlap, and visible navigation feedback. The SQL88 migration itself has no direct UI surface, but the preference it enables (`Einfalt/Nánar`) must be validated on mobile because it changes pill density and marker filtering.

## Route intelligence check

This review does not add route knowledge or change route-memory matching. It touches `/vedrid` marker filtering and overlay behavior, but no canonical route family, segment, caution ID, or station matching rule is added. No IcelandRoadmap update is needed for SQL88. Privacy remains fine because SQL88 stores only a user UI preference (`simple`/`detailed`) on the authenticated user's preferences row.

## Localhost checks for Stebbi

1. Before release, ask Claude Code to patch or verify the hidden-marker InfoWindow case.
2. Open `/auth-mvp/vedrid` as authenticated user with both Veðurstofan and Vegagerðin access.
3. Select a marker so the overlay opens.
4. Toggle status pills so that marker's status is hidden.
5. Expected: overlay closes immediately and no disconnected InfoWindow remains on the map.
6. Toggle `Einfalt` and `Nánar`; reload page.
7. Expected after SQL88 is run: authenticated user keeps the saved mode from DB, not only localStorage.
8. Test mobile widths around 360, 390, 460 px: no horizontal overflow, no overlay covering Google controls awkwardly, no zoom caused by controls.
9. Do not test SQL casually against production with ad hoc updates/deletes. Running SQL88 is a schema change and should be done once, intentionally, after confirming sql82 exists.

## Óvissa / þarf að staðfesta

- I did not run the app in a browser, so the InfoWindow-hidden-marker issue is inferred from code paths and Google marker registry behavior.
- I did not run SQL88. The recommendation assumes `sql/82_weather_user_preferences.sql` has already been applied in production.
