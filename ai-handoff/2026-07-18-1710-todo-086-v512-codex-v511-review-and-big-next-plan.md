# 2026-07-18 17:10 - TODO 086 v512 - Codex review of v511 and big next plan

Created: 2026-07-18 17:10  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Mode: review + implementation handoff only, no product code changes

Relevant handoffs:

- `ai-handoff/2026-07-18-1656-todo-086-v511-claude-v510-done-prerelease.md`
- `ai-handoff/2026-07-18-1612-todo-086-v505-codex-prioritize-forecast-scrubber-yr-comparison.md`
- `ai-handoff/2026-07-18-1620-todo-086-v506-codex-metno-station-forecast-history-cache.md`

## Stutt Mannamál

v511 lokar Vegagerðin history fallbackinu að mestu leyti rétt: nýjasti fetch-batch er nú lesinn með nákvæmu `last_fetched_at` gildi, ekki 10 mínútna glugga sem gæti blandað saman cron keyrslum.

Það er samt eitt lítið review finding: innri JSDoc athugasemd í provider-kóðanum er enn gömul og lýsir `measured_at` + 10 mínútna batch window. Það er ekki hegðunarbugg, en það er nákvæmlega svona komment sem getur ruglað næsta agent síðar. Laga fyrst sem P0.

Næsta stórt skref sem ég treysti okkur til er:

1. Laga stale comment úr v511.
2. Útfæra 3-klst Veðurstofu spátíma-scrubber á `/vedrid`, með sömu status/pillu/lita-lógík og `/ferdalagid`.
3. Láta valda Veðurstofustöð sýna spágildi í kringum valinn tíma, t.d. tvö til baka og tvö áfram.
4. Skrifa SQL84 grunninn fyrir met.no/Yr history-cache á föstum punktum, en **ekki keyra SQL** og **ekki fetch-a Yr fyrir allar stöðvar**.

Þetta er stórt en enn öruggt skref: það bætir upplifunina mikið án þess að búa til dýr provider-köll eða breyta production DB.

## Findings

### Low: Stale JSDoc lýsir enn gömlu Vegagerðin fallback-lógíkinni

`lib/weather/providers/vegagerdinCurrent.server.ts:492` segir enn að fallback finni nýjasta `measured_at` og sæki raðir innan 10 mínútna batch-glugga. Kóðinn réttilega notar hins vegar:

- `.gte('last_fetched_at', cutoffIso)`
- `.order('last_fetched_at', { ascending: false })`
- `.eq('last_fetched_at', newestRow.last_fetched_at)`

Þetta er ekki runtime vandamál, en þarf að laga til að documentation í kóða passi nýja contractið.

Recommended replacement:

```ts
 * Finds the newest last_fetched_at within the 24-hour window, then fetches all
 * rows from that exact fetch batch.
```

## Review Notes On v511

Það sem lítur vel út:

- Exact-batch fallback er rétt stefna. Það verndar okkur gegn því að blanda saman tveimur nálægum cron keyrslum.
- Regression tests staðfesta að history query notar `last_fetched_at`, order-ar eftir `last_fetched_at`, og notar exact `.eq(...)` í seinni query.
- v511 handoff segir að full test suite hafi farið grænt: `3215 passed`, `27 skipped`, `0 failed`.
- Engin SQL var keyrð, ekkert push/deploy/production.

Eftirstandandi áhætta:

- `sql/83_vegagerdin_measurements_history.sql` er enn bara skrifuð migration þar til Stebbi keyrir hana sérstaklega.
- Ef SQL83 er ekki komin í Supabase, þá mun appið áfram þurfa að lifa á current cache/API og history fallback verður ekki virkur.
- Núverandi næsta skref má ekki verða “náum líka öllum Yr gögnum fyrir allar 280 stöðvar”; það þarf lazy/cache hönnun.

## Næsta Stóra Framkvæmdarplan

### Phase P0 - Close v511 Polish

Laga stale JSDoc í `lib/weather/providers/vegagerdinCurrent.server.ts`.

Engin hegðunarbreyting. Bara gera commentið rétt svo næsti lesandi skilji að batch contractið er `last_fetched_at`.

### Phase P1 - Reusable Forecast Anchor Classifier

Í `lib/weather/windDisplayStatus.ts` á að bæta við reusable helper sem tekur explicit spátíma:

```ts
classifyForecastWindDisplayStatusAt(forecasts, thresholds, anchorTime)
```

Núverandi `classifyNowAnchoredForecastWindDisplayStatus(...)` á að lifa áfram sem wrapper yfir nýja helperinn.

Acceptance:

- Enginn nýr status-taxonomy.
- Engin ný sér-lógík fyrir `/vedrid` eingöngu.
- Sama status-merki, litir, pillur og thresholds og `/ferdalagid`.
- Unit tests fyrir explicit anchor:
  - notar rétt forecast slot þegar anchor er nákvæmlega á sloti
  - notar nýjasta slot at-or-before anchor
  - fellur í fyrsta future slot ef ekkert past/current er til
  - skilar `insufficient` þegar engin nothæf vindgildi eru til

### Phase P2 - Compact Forecast Time Scrubber On `/vedrid`

Setja 3-klst scrubber á `/vedrid` fyrir Veðurstofu spátíma.

Behavior:

- Derive-a available slots úr loaded Veðurstofan forecasts.
- Default selected slot:
  - nýjasta `forecast_time` sem er <= núna
  - ef ekkert er til, fyrsta future slot
- Hreyfing á scrubber:
  - breytir litum Veðurstofustöðva
  - uppfærir status counts og `WindStatusFilterPills`
  - uppfærir selected station detail
  - má ekki kalla aftur í Google routes
  - má ekki fetch-a Yr/met.no
- Vegagerðin er current observations og má ekki time-travel-a í þessum fasa.

UI:

- Nota sama visual DNA og `/ferdalagid` scrubber/heatmap, en ekki afrita stóran component ef hægt er að extract-a compact primitive.
- Mobile-first: stöðugar stærðir, enginn horizontal overflow, engin layout shift.
- Texti og controls í báðum tungumálum í `messages/is.json` og `messages/en.json`.

Design.md guardrails:

- Controls mega ekki hoppa eða breyta stærð við loading/active.
- Texti má ekki flæða út úr controls.
- Nýtt mynstur á að byggja á reusable components/helpers þegar hegðun birtist á fleiri en einum stað.
- Prófa 360/390/460 px.

### Phase P3 - Selected Veðurstofan Station Detail Follows Selected Time

Þegar notandi smellir á Veðurstofustöð á `/vedrid`:

- preview á að sýna `Spá gefin út kl. HH:mm`
- rows eiga að raðast í kringum selected scrubber time:
  - tvö slots til baka þegar til
  - selected/used slot
  - tvö slots áfram þegar til
- selected/used row þarf að vera skýr, t.d. `Notað á korti`
- `Sjá öll spágildi` má áfram opna fullan lista ef componentinn styður það.

Dæmi: ef klukkan er 09:43 og slot eru 06:00, 09:00, 12:00, 15:00, þá ættu þau öll að sjást.

### Phase P4 - SQL84 Met.no/Yr History-Cache Foundation

Skrifa migration:

- `sql/84_metno_point_forecasts_history.sql`

Markmið:

- Normaliseruð service-role-only tafla fyrir met.no/Yr forecast rows á föstum punktum.
- Fyrsti target: `vedurstofan_station`.
- Generic nógu mikið til að geta síðar nýst fyrir `vegagerdin_station`, en CHECK má í fyrsta fasa aðeins leyfa `vedurstofan_station` ef það er öruggara.

Ekki keyra SQL.

Ekki tengja þetta við runtime all-station fetching.

Migration á að fylgja v506:

- RLS enabled
- revoke frá `PUBLIC`, `anon`, `authenticated`
- grant aðeins til `service_role`
- primary key á `(target_type, target_id, metno_updated_at, forecast_time)` eða rökstuddri sambærilegri lykilskipan
- indexes fyrir target/cycle/time lookup
- `updated_at` trigger með `public.teskeid_set_updated_at()`
- rollback comment
- static SQL tests í `lib/__tests__/sql-migration.test.ts`

### Phase P5 - Do Not Yet Implement Yr Runtime Fetch

Í þessu stóra skrefi má undirbúa types/helpers ef það er lítið og eðlilegt, en ekki:

- fetch-a met.no/Yr fyrir allar Veðurstofustöðvar á `/vedrid`
- bæta við cron sem kallar met.no fyrir 280 punkta
- breyta `/ferdalagid` trip calculation
- keyra SQL
- breyta Vercel env
- commit-a, push-a eða deploy-a

Yr samanburður kemur strax á eftir þegar cache-grunnurinn og scrubberinn eru stöðug.

## Suggested Prompt For Claude Code

```text
Workflow

Lestu fyrst með gagnrýnum augum:
ai-handoff/2026-07-18-1656-todo-086-v511-claude-v510-done-prerelease.md
ai-handoff/2026-07-18-1710-todo-086-v512-codex-v511-review-and-big-next-plan.md
ai-handoff/2026-07-18-1612-todo-086-v505-codex-prioritize-forecast-scrubber-yr-comparison.md
ai-handoff/2026-07-18-1620-todo-086-v506-codex-metno-station-forecast-history-cache.md

Skilningur á samþykki:
Stebbi hefur samþykkt að þú framkvæmir afmarkað repo-skref samkvæmt þessu handoffi ef engar blocking spurningar koma upp.
Þetta felur í sér kóðabreytingar og að skrifa SQL migration-skrá.
Þetta felur ekki í sér að keyra SQL/migration, commit-a, push-a, deploy-a, breyta Vercel env eða gera production breytingar.

Ef rýnin vekur blocking spurningu, stoppaðu og skilaðu review/handoff.
Ef ekkert blokkerar, framkvæmdu þetta sem eitt stórt en öruggt skref:

1. Lagaðu stale JSDoc í lib/weather/providers/vegagerdinCurrent.server.ts sem lýsir enn measured_at + 10 mínútna batch window.
2. Bættu við reusable explicit-anchor forecast classifier í lib/weather/windDisplayStatus.ts.
3. Haltu classifyNowAnchoredForecastWindDisplayStatus sem wrapper fyrir eldri consumer-a.
4. Settu compact 3-klst Veðurstofu forecast-time scrubber á /vedrid.
5. Láttu Veðurstofan marker colors, marker status counts og WindStatusFilterPills á /vedrid fylgja selected forecast time.
6. Láttu selected Veðurstofan station detail sýna spágildi í kringum selected time, helst tvö til baka og tvö áfram þegar til.
7. Passaðu að Vegagerðin sé áfram current-observation layer og time-travel-i ekki með scrubbernum.
8. Ekki búa til nýtt status/pillu/marker-color kerfi. Endurnýttu WindDisplayStatus, WindStatusFilterPills, WeatherThresholdBar, marker metadata og núverandi threshold logic.
9. Skrifaðu SQL84 migration fyrir met.no/Yr normalized point forecast history/cache samkvæmt v506.
10. Bættu við static SQL tests fyrir SQL84.
11. Ekki keyra SQL84.
12. Ekki implementa runtime Yr/met.no all-station fetch, cron eða UI samanburð í þessu skrefi.
13. Allur nýr notendatexti fer í messages/is.json og messages/en.json.
14. Ekki commit-a, push-a eða deploy-a.

Keyrðu:
- npm run type-check
- targeted tests fyrir windDisplayStatus/overview/scrubber ef til eru eða sem þú bætir við
- targeted SQL migration tests

Ef breytingarnar snerta víðar en þetta, útskýrðu af hverju í handoffi.

Eftir framkvæmd skaltu strax búa til nýtt handoff með:
- hvað var gert
- hvaða skrár voru skoðaðar
- hvaða skrár breyttust
- hvaða commands voru keyrðar og exit codes
- hvað var sleppt
- SQL áhrif: hvaða migration var skrifuð, hvort hún var keyrð, áhrif á RLS/grants/auth/production
- áhætta sem er eftir
- spurningar fyrir Codex
- Localhost checks for Stebbi
```

## Acceptance Criteria

1. v511 stale JSDoc er leiðrétt.
2. `/vedrid` sýnir 3-klst forecast-time scrubber þegar Veðurstofugögn eru til.
3. Scrubber default-ar á skynsamlegan current slot.
4. Veðurstofu punktar á korti breyta litum eftir selected forecast time.
5. Status pillur undir korti sýna sömu status taxonomy og `/ferdalagid`.
6. Status counts og filtering fylgja selected forecast time.
7. Valin Veðurstofustöð sýnir forecast rows kringum selected time.
8. Vegagerðin breytist ekki með scrubbernum.
9. Engin Yr/met.no all-station fetch eða ný dýr runtime hegðun.
10. SQL84 er skrifuð og testuð static, en ekki keyrð.
11. Engin SQL/production/env/commit/push/deploy aðgerð.
12. Mobile 360/390/460 px er án overflow eða control jump.

## Localhost Checks For Stebbi

Þegar Claude Code skilar næsta handoffi:

1. Opnaðu `http://localhost:3004/vedrid` sem public notandi.
2. Staðfestu að Veðurstofan og Vegagerðin birtist sem provider pillur/lög ef gögn eru til.
3. Veldu `Veðurstofan (spá)`.
4. Staðfestu að 3-klst scrubber birtist nálægt korti/status pillum.
5. Færðu scrubber fram og til baka.
6. Vænt niðurstaða:
   - Veðurstofupunktar skipta um lit eftir völdum spátíma.
   - status pillur og talningar breytast með valda spátímanum.
   - filter á `Innan marka`, `Nálgast óþægindi`, `Óþægilegt`, `Nálgast hættumörk`, `Ófullnægjandi gögn` virkar enn.
7. Smelltu á Veðurstofustöð.
8. Vænt niðurstaða:
   - spjaldið sýnir spágildi í kringum selected time
   - línan sem er notuð á kortinu er augljós
   - dagsetningar/tímar eru á íslensku og passa í mobile.
9. Veldu `Vegagerðin (núna)` og hreyfðu Veðurstofu scrubberinn.
10. Vænt niðurstaða:
    - Vegagerðarpunktar eru current observations og breytast ekki vegna forecast scrubbers.
11. Opnaðu `http://localhost:3004/vedrid/ferdalagid`.
12. Vænt niðurstaða:
    - núverandi ferðalagsscrubber og route calculation virka áfram.
13. Prófaðu mobile widths 360, 390 og 460 px.
14. Passaðu sérstaklega:
    - enginn horizontal overflow
    - engin dauð buttons eða links
    - loading state ef data er að koma
    - ekkert óvænt map reload við scrubber-hreyfingu

Ef SQL84 er aðeins skrifuð:

- Ekki keyra hana í Supabase fyrr en Codex hefur rýnt diffið.
- Í handoffi Claude á að standa skýrt að migration hafi ekki verið keyrð.

## Næstu Fasar Eftir Þetta

### Fasi Q1 - Yr/met.no Comparison Runtime, Lazy

Þegar SQL84 og scrubber eru komin:

- Fetch-a Yr/met.no eingöngu fyrir selected station eða route-scoped subset.
- Nota raw `weather_cache` áfram sem upstream cache.
- Skrifa normalized rows í SQL84 með service role.
- Sýna `Veðurstofan` vs `Yr` comparison aðeins þar sem gögn eru til.
- Engin all-280 station fetch á page load.

### Fasi Q2 - Varfærnasta Matið

Búa til provider-comparison mode:

- `Varfærnasta matið`: notar áhættusamara matið milli Veðurstofu og Yr.
- `Samanburður`: sýnir bæði hlið við hlið.
- Forðast að gera `Mildasta/Jákvæðasta` að safety-default.

### Fasi Q3 - Route Selection Uses Same Time Model

Leiðarvalskort á `/vedrid/ferdalagid` má þá nota sama lower-level selected forecast time model og overview, en route trip calculation heldur áfram sínu departure-driven módeli.

### Fasi Q4 - Vegagerðin Reliability

Áfram:

- keyra SQL83 þegar Stebbi samþykkir
- stilla cron á skynsamlegu bili
- tryggja history fallback í production
- flytja Púls grunninn meira yfir á Vegagerðina þegar gögn eru nógu traust.

### Fasi Q5 - Route Cache / Teskeið Interest Heatmap

Varðveita pælinguna úr:

- `ai-handoff/2026-07-17-0627-todo-086-v382-codex-route-cache-and-interest-heatmap.md`

Ekki blanda henni inn í scrubber/Yr SQL84 skrefið.

### Fasi Q6 - Staðbundin Route Geometry Gæði

Seinna:

- Vík/Reynisfjall/Vatnsskarðshólar/Mýrdalssandur section issue
- Öxi/suðurleið/Höfn deferred issue
- betra staðbundið leiðarlíkan þar sem Google polyline er of gróf

## Óvissa / Þarf Að Staðfesta

- Ég rýndi v511 út frá handoffi og targeted source reads, ekki með því að keyra test suite aftur.
- SQL83/SQL84 á ekki að keyra fyrr en Stebbi biður sérstaklega um það.
- Ef Claude Code telur að scrubber extraction úr `DepartureHeatmap` verði of stór refactor, má búa til minni shared primitive fyrst, en ekki copy/paste-a status/lita-lógík.
