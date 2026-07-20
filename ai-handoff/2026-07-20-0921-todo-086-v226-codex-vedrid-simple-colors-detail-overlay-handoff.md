# TODO 086 / v226 - Codex handoff - `/vedrid` einföld sýn, Nánar-vistun og korta-overlay

## Staða

Stebbi vísaði í `2026-07-20-0910-todo-086-v224-claude-v223-done-prerelease` og bað um rýni og handoff. Þetta er handoff til Claude Code, ekki framkvæmd.

Ég skoðaði:

- `ai-handoff/2026-07-20-0910-todo-086-v224-claude-v223-done-prerelease.md`
- `ai-handoff/2026-07-20-0911-todo-086-v225-codex-scrubber-prev-next-arrows-plan.md`
- `ai-handoff/README.md`
- `Design.md`
- `rg` niðurstöður fyrir `/vedrid` status-pillur, preference API, kortakomponenta og Veðurstofu/Vegagerðar púls-URL

Ekki var farið í kóðabreytingar í appinu í þessari lotu.

## Findings

1. **Einföld sýn virðist nú collapse-a síupillur, en ekki alla kortalitina.**  
   `WindStatusFilterPills` er komin með simple grouping, en `components/weather/windStatusUi.ts`, `lib/weather/windDisplayStatus.ts` og `WeatherOverviewClient.windStatusToTone()` halda enn sérlitum fyrir `nalgast-othaegindi` og `nalgast-haettumork`. Stebbi vill að pillurnar/litirnir á kortinu fylgi líka einföldu litunum.

2. **`Nánar` er enn local UI-state, ekki notandastilling.**  
   Núverandi preference API/table virðist aðeins geyma `cautionWindMs` og `redWindMs` í `weather_user_preferences`. Ef `Einfalt/Nánar` á að fylgja innskráðum notanda þarf schema + API + auth/save flow, sambærilegt og "Vista sem sjálfgefin vindmörk".

3. **Veðurstofustöð á nýju púls-URL má ekki skipta yfir í nálægustu Vegagerðarstöð.**  
   Stebbi vill byrja einfalt: þegar Veðurstofuspjald er opnað á nýju URL á að sýna gamla Veðurstofuspjaldið sem við þekkjum nú þegar, ekki tilraunina með nálægustu Vegagerðarstöð.

4. **Overlay-ið er óafgreitt en óskað sérstaklega.**  
   Stebbi vill fá litla korta-overlay labela, svipað og í skjámyndinni: vindhraði, hviður og síðasta athugasemd, með `Nánar` takka. Þetta þarf að vera gert þannig að það birtist sjálfkrafa þegar pláss er til, til dæmis þegar notandi hefur þysjað inn eða valið leið með fáum punktum.

5. **V225 scrubber-prev/next er enn sér follow-up.**  
   Handoff v225 fjallar um að örvar í tíma-scrubber eigi að velja fyrri/næsta punkt í stað þess að færa scrollbar. Þetta er ekki sama breyting og overlay/preference, en Stebbi vill klára það líka.

## Tillaga að áfangaskiptingu

### Áfangi A - Láta einfalda sýn stýra öllum status-litum

Markmið:

- Þegar `/vedrid` er í einfaldri sýn á UI að nota aðeins:
  - `innan-marka` = grænt
  - `othaegilegt` = appelsínugult
  - `haettulegt` = rautt með varúð
- Detailed/Nánar sýn heldur áfram að sýna fimm stöður.

Mælt með:

- Bæta við einum helper nálægt `WindStatusFilterPills` eða í `lib/weather/windDisplayStatus.ts`, t.d.:
  - `toSimpleWindDisplayStatus(status)`
  - `nalgast-othaegindi -> innan-marka`
  - `nalgast-haettumork -> othaegilegt`
  - annað óbreytt
- Nota helperinn í `/vedrid` þegar `statusFilterMode === 'simple'` fyrir:
  - marker tone/color í `WeatherOverviewClient`
  - status pill/count display
  - map marker color override ef notað
  - `WeatherSourceTimeSelector` punkta/liti ef þeir endurspegla sama status
- Ekki breyta classification logic sjálfu. Þetta er display-grouping, ekki veðurmat.

Acceptance:

- Í einfaldri sýn birtast ekki amber/red "nálgast" litir sem sérflokkar.
- Í `Nánar` sýn sjást gömlu fimm status-flokkarnir áfram.
- Síur og markerar tala sama tungumál: ef pilla er græn á punktur í sama collapsed status líka að líta grænn út.

### Áfangi B - Vista `Nánar` niður á notanda

Markmið:

- Notandi getur valið `Nánar` og vistað það sem sjálfgefna veðursýn.
- Óinnskráður notandi fer í innskráningarflæði og síðan sama vistunarflæði og vindmörkin nota.
- Innskráður notandi fær valið sitt aftur eftir reload og milli sessiona.

Mælt með:

- Nota orðalag Stebba í UI: `Einfalt` / `Nánar`. Ef Claude vill halda `Nákvæmt` skal fá Stebba til að samþykkja það sérstaklega.
- Búa til nýtt migration, líklega `sql/88_weather_user_preferences_status_filter_mode.sql`, sem bætir við dálki á sömu töflu og vindmörkin:

```sql
alter table public.weather_user_preferences
  add column if not exists status_filter_mode text not null default 'simple';

alter table public.weather_user_preferences
  drop constraint if exists weather_user_preferences_status_filter_mode_check;

alter table public.weather_user_preferences
  add constraint weather_user_preferences_status_filter_mode_check
    check (status_filter_mode in ('simple', 'detailed'));
```

- Ekki veikja RLS. Sama `user_id = auth.uid()` policy á að duga ef dálkurinn er á `weather_user_preferences`.
- Útfæra API afturábak-samhæft:
  - `GET /api/teskeid/weather/preferences/thresholds` skili líka `statusFilterMode`.
  - `PUT /api/teskeid/weather/preferences/thresholds` taki við partial eða öllu payloadi án þess að krefjast þess að vindmörk séu send þegar aðeins er verið að vista sýn.
  - Ef API er áfram nefnt `thresholds`, íhuga að breyta aðeins innri naming/comments eða bæta nýju endpointi seinna. Fyrir hotfix er betra að stækka núverandi endpoint varlega.
- Pending auth flow:
  - nota sambærilega `sessionStorage` pending-key og vindmörkin nota
  - geyma pending `statusFilterMode`
  - eftir login, apply-a og vista í API
  - passa að ekki logga eða leka user payload/secrets

Acceptance:

- Óinnskráður smellir á `Nánar`/vista default, fer í login, kemur til baka og sýnin helst.
- Innskráður notandi getur breytt `Einfalt <-> Nánar`, refreshað `/vedrid` og stillingin helst.
- Public/anon notandi notar localStorage/default án DB-vistunar.
- Vindmörk halda áfram að vistast eins og áður.

### Áfangi C - Veðurstofu station URL sýnir gamla Veðurstofuspjaldið

Markmið:

- Þegar notandi smellir `Nánar` á Veðurstofustöð og fer á nýja slóð, á að sýna núverandi gamla Veðurstofuspjaldið, ekki næstu Vegagerðarstöð.

Mælt með:

- Endurnýta eða extract-a `StationDetail` úr `components/weather/WeatherOverviewClient.tsx` í shared component.
- Nota shared component bæði í overview detail og `app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx`.
- Halda `returnTo` hegðuninni.
- Ef vantar forecast/station data á URL, sýna mjúkt "gögn fundust ekki" state með leið til baka. Ekki detta í autoselect á Vegagerðarstöð.

Acceptance:

- Veðurstofustöð opnuð af `/vedrid` sýnir sama veður/forecast-detail og gamla hvíta spjaldið sýndi.
- Engin "nálægasta Vegagerðarstöð" tillaga birtist í þessu skrefi.
- Vegagerðarstöðvar halda sínum Vegagerðarpúls.

### Áfangi D - Korta-overlay með vind/hviðum/síðustu athugasemd og `Nánar`

Markmið:

- Marker click á `/vedrid` sýnir lítið overlay á kortinu sjálfu í stað stóra hvíta detail-spjaldsins fyrir neðan kort, þegar overlay hegðun hefur verið sannreynd.
- Overlay sýnir:
  - station name eða mjög stutta label
  - vindhraða
  - hviður þegar þær eru til
  - síðustu athugasemd/púls ef til
  - `Nánar` takka
- `Nánar` opnar:
  - Vegagerðarstöð: Vegagerðarpúls
  - Veðurstofustöð: nýja Veðurstofu station URL með gamla Veðurstofuspjaldinu

Mælt með MVP hegðun:

- Ekki byrja á flókinni collision-engine.
- Fyrst:
  - selected marker sýnir alltaf overlay
  - route-filter með fáum punktum, t.d. <= 10 visible markers, má sýna overlay fyrir alla sýnilega punkta
  - annars sýna overlay sjálfkrafa þegar zoom er nógu hátt, t.d. >= 8 eða >= 9
- Ef overlay eru mörg:
  - halda þeim litlum, hvítum, með `text-xs`, skýrum border og stöðugri breidd
  - fela eða takmarka overlay frekar en að leyfa overlap yfir Google controls/attribution
- Nota `google.maps.OverlayView` eða sambærilega DOM overlay nálgun í `IcelandOverviewMap` ef það fellur betur að núverandi marker registry.
- Ekki fjarlægja gamla detail-spjaldið fyrr en overlay + `Nánar` flow hefur verið staðfest á localhost.

Acceptance:

- Click á punkt sýnir lítið overlay á kortinu, ekki stórt autoscroll-spjald.
- `Nánar` virkar fyrir báða providera.
- Á mobile 360-460 px kemur ekki horizontal overflow, Google controls verða ekki hulin og overlay má ekki gera kortið ólesanlegt.
- Þegar route filter gefur fáa punkta má birta fleiri overlay sjálfkrafa.
- Þegar Ísland allt er fullt af punktum á low zoom á overlay ekki að fylla skjáinn.

### Áfangi E - Scrubber örvar úr v225

Þetta var áður handoffað í `2026-07-20-0911-todo-086-v225-codex-scrubber-prev-next-arrows-plan.md` og er enn gilt:

- Örvar eiga að velja fyrri/næsta tíma-slot, ekki hreyfa scrollbar.
- Á við um `/vedrid` source/time selector og ferðaleiða heatmap þar sem þessar örvar eru sýndar.
- Passa disabled state, aria-labels og keyboard/focus.

## Release guard

Ekki gefa út þetta sem "búið" nema Stebbi samþykki hvaða áfanga mega bíða. Ef markmiðið er hraður prerelease:

1. Áfangi A og B eru líklega mikilvægust áður en einföld/nánar sýn er sett í hendur venjulegra notenda.
2. Áfangi C er nauðsynlegur áður en `Nánar` takki á Veðurstofustöð er kynntur sem endanlegt flow.
3. Áfangi D má fara í sér PR/commit ef það reynist stærra, en Stebbi vill klára það og það á að standa skýrt sem óafgreitt þar til komið.
4. Áfangi E er sjálfstætt UX follow-up úr v225.

## Supabase / SQL

Ef Áfangi B er framkvæmdur þarf nýtt SQL migration.

Tillaga:

- `sql/88_weather_user_preferences_status_filter_mode.sql`
- Idempotent `alter table ... add column if not exists`
- `check (status_filter_mode in ('simple', 'detailed'))`
- Engin breyting á RLS policy nema sérstök ástæða komi upp
- Engin anon grants
- Ekki keyra migration nema Stebbi gefi skýrt SQL leyfi

Athugið líka release dependency frá fyrri lotum:

- Ef kóði fyrir varasamar leiðir treystir á `route_caution_ids`, þarf `sql/87_weather_route_memory_route_cautions.sql` að vera keyrt á réttu umhverfi áður en sá hluti er talinn öruggur.

## Files Claude Code should inspect first

- `components/weather/WeatherOverviewClient.tsx`
- `components/weather/WindStatusFilterPills.tsx`
- `components/weather/windStatusUi.ts`
- `lib/weather/windDisplayStatus.ts`
- `components/weather/WeatherOverviewShell.tsx`
- `components/weather/IcelandOverviewMap.tsx`
- `components/weather/WeatherSourceTimeSelector.tsx`
- `components/weather/DepartureHeatmap.tsx`
- `app/api/teskeid/weather/preferences/thresholds/route.ts`
- `app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx`
- `app/auth-mvp/vedrid/puls/vegagerdin/stod/[stationId]/VegagerdinPulsClient.tsx`
- `messages/is.json`
- `messages/en.json`
- `Design.md`

## Tests / validation Claude Code should run

Recommended after implementation:

- `npm run type-check`
- `npm run test:run`

Targeted tests to add/update where practical:

- `WindStatusFilterPills` grouping/default mode tests
- helper test for simple display status mapping
- preference API GET/PUT test for `statusFilterMode`
- auth pending-flow test if there is existing coverage pattern for threshold save
- pulse target/link tests for Veðurstofan `Nánar`

## Commands Codex ran in this handoff pass

- `Get-Date -Format "yyyy-MM-dd HH:mm"` - exit 0
- `Get-ChildItem -File ai-handoff | Sort-Object LastWriteTime -Descending | Select-Object -First 12 Name,LastWriteTime,Length` - exit 0
- `git status --short` - exit 0
- `rg -n "statusFilterMode|WindStatusFilterPills|simple|detailed|nalgast|haettulegt|othaegilegt" components app lib messages` - exit 0
- `rg -n "weather_user_preferences|cautionWindMs|redWindMs|preferences/thresholds|useWeatherThresholds|Save" app components lib sql messages` - exit 0
- `rg -n "VedurstofanPulsClient|puls/stod|StationDetail|selectedStation|IcelandOverviewMap|Marker|Overlay" app components lib` - exit 0

No build/test command was run because this pass only creates handoff guidance.

## Files changed by Codex

- `ai-handoff/2026-07-20-0921-todo-086-v226-codex-vedrid-simple-colors-detail-overlay-handoff.md`

No app code, SQL, commit, push, deploy or production data was changed.

## Localhost checks for Stebbi

Use localhost with the normal dev server that Stebbi controls.

1. Open `/vedrid` as public/anon user.
2. Confirm default mode is `Einfalt`.
3. Verify status/filter colors on pills, map markers and timeline/scrubber:
   - within + near discomfort collapse visually into green
   - uncomfortable + near danger collapse visually into orange
   - dangerous remains red with warning treatment
4. Switch to `Nánar`.
5. Confirm the five detailed statuses return and colors match the previous detailed behavior.
6. As anon user, try to save `Nánar` as default.
7. Expected: login flow starts, returns to `/vedrid`, and `Nánar` is saved after auth.
8. As logged-in user, toggle `Einfalt`/`Nánar`, refresh, leave and return to `/vedrid`.
9. Expected: the chosen mode persists like saved wind thresholds.
10. Click a Vegagerðar marker.
11. Expected after overlay phase: small map overlay opens with wind, gust if available, latest comment if available, and `Nánar` opens Vegagerðarpúls.
12. Click a Veðurstofu marker.
13. Expected after overlay phase: small map overlay opens and `Nánar` opens the Veðurstofu station URL showing the old Veðurstofuspjald, not nearest Vegagerðarstöð.
14. Test route-filtered `/vedrid` with few markers and zoomed-in map.
15. Expected after overlay phase: labels may appear automatically when there is space, without hiding controls or creating horizontal overflow.
16. Test full-country map on low zoom.
17. Expected: overlay labels do not overwhelm the map.
18. If v225 is implemented in same batch, test scrubber arrows:
   - previous arrow selects previous slot
   - next arrow selects next slot
   - disabled states work at ends

Do not test production SQL behavior unless the relevant migration has been explicitly applied with Stebbi approval.
