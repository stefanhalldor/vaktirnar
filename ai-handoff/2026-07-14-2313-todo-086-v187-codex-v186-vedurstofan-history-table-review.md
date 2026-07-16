# TODO 086 v187 - Codex review of v186 history-table direction

Created: 2026-07-14 23:13
Timezone: Atlantic/Reykjavik

Mode:
- Rýni og plan only.
- Engar kóðabreytingar, engin SQL migration skrifuð eða keyrð, ekkert commit/push/deploy.
- Byggt á `2026-07-14-2300-todo-086-v186-claude-prev-row-og-rod.md`, `sql/74_vedurstofan_product_tables.sql`, `sql/75_weather_fetch_runs_metadata.sql` og stakri skoðun á Veðurstofan reader/projector kóða.

## Findings

### Medium - Ekki nota 6 klst retention í `vedurstofan_forecasts_latest` sem lausn

Claude Code bendir réttilega á að 21:00 "prev" röðin hverfur vegna þess að `vedurstofan_forecasts_latest` geymir bara nýjasta API-svar og projector eyðir eldri `fetched_at` röðum eftir successful upsert.

Codex mælir samt gegn því að breyta `latest` í hálf-sögutöflu með 6 klst retention. Það er freistandi flýtileið en býr til óhrein mörk:

- `latest` hættir að þýða "nýjasta projection".
- freshness/stale-lógík verður erfiðari að skilja.
- UI getur óvart lesið eldri forecast-cycle raðir sem líta út eins og current data.
- Það verður verra að bæta Vegagerðinni eða observations við með sömu patternum.

Ráðlegging: halda `vedurstofan_forecasts_latest` áfram sem hreinni latest/current product-töflu og bæta við sérstakri history-töflu.

### Medium - History reader má ekki blanda saman mismunandi `atime` cycles

Sögutafla leysir prev/used/next vandann, en hún má ekki leiða til þess að spjald sýni t.d. `prev` úr 09:00 útgáfu og `used` úr 18:00 útgáfu.

Regla fyrir framkvæmd:

- Finna current `atime` per station út frá `vedurstofan_forecasts_latest`.
- Lesa history aðeins fyrir sama `station_id` og sama current `atime`.
- Ekki nota eldri `atime` í útreikningum nema það sé með mjög skýrri stale/older-provider-state vöruákvörðun.

Þetta er mikilvægasta guardrailið í þessari breytingu.

### Medium - Retention þarf að vera með frá fyrsta degi

Sögutafla getur orðið stór fljótt. Gróf stærðarhugmynd:

- 280 stöðvar.
- 20-40 forecast rows per station per cycle.
- Um 8 forecast cycles á dag ef keyrt reglulega.
- Það getur orðið tugir þúsunda til nær 100k rows á dag, eftir payload.

Þetta er samt alveg eðlilegt fyrir Supabase/Postgres ef við dedupe-um rétt og höfum index/retention. En við eigum ekki að búa til óendanlega söfnun.

Ráðlegging:

- byrja með 14 daga retention fyrir forecast history,
- hafa indexa sem styðja station/time/atime lookup,
- hreinsa með öruggri bounded delete í warmer/projection eða sér jobbi.

### Low - Mixed provider ordering er rétt client/UI skref og óháð migration

Claude Code hefur rétt fyrir sér að "Allir spápunktar" eigi að blanda met.no/Yr og Veðurstofu í akstursröð eftir `distanceFromOriginM`. Það þarf ekki migration.

Þetta á að gerast samhliða shared-card vinnunni:

- sameina render-lista í `kind: 'metno' | 'vedurstofan' | later 'vegagerdin'`,
- raða eftir cumulative distance frá brottfararstað,
- rendera rétta provider-card eða sameiginlegt `WeatherPointCard` með provider-specific data.

## Staða sem Codex skilur

Núverandi product layer:

- `vedurstofan_forecasts_latest`: current/latest forecast rows, PK `(station_id, forecast_time)`.
- `vedurstofan_observations_latest`: latest observation per station, ekki history.
- `weather_fetch_runs`: run metadata, nú með `status`, `triggered_by`, `expected_atime`, `result_atime` eftir SQL 75.

Núverandi projector:

- les cached Veðurstofan payloads,
- býr til forecast rows,
- upsertar í `vedurstofan_forecasts_latest`,
- eyðir svo eldri rows fyrir sömu stöð með eldri `fetched_at`.

Þetta er rétta hegðunin fyrir latest-töflu. Vandinn er að UI þarf stundum næsta fyrra forecast slot, en latest-töflan má ekki bera ábyrgð á sögunni.

## Tillaga: ný sögutafla fyrir forecast rows

Codex mælir með nýrri migration, t.d. `sql/77_vedurstofan_forecasts_history.sql`, þegar Stebbi gefur skýrt migration/kóðaleyfi.

Meginhugmynd:

```sql
CREATE TABLE IF NOT EXISTS public.vedurstofan_forecasts_history (
  station_id text NOT NULL REFERENCES public.vedurstofan_stations (station_id) ON DELETE CASCADE,
  atime timestamptz NOT NULL,
  forecast_time timestamptz NOT NULL,
  wind_speed_ms numeric(6, 2),
  wind_direction_text text,
  temperature_c numeric(5, 1),
  precipitation_mm_per_hour numeric(6, 2),
  weather_text text,
  expires_at timestamptz,
  first_fetched_at timestamptz NOT NULL,
  last_fetched_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (station_id, atime, forecast_time)
);
```

Mögulegur aukadálkur:

- `last_fetch_run_id bigint` ef það er gagnlegt að tengja history row við síðasta run. Þetta er nice-to-have, ekki blocker.

Security:

- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.
- `REVOKE ALL ... FROM PUBLIC, anon, authenticated`.
- `GRANT SELECT, INSERT, UPDATE, DELETE ... TO service_role`.
- Engar anon/authenticated policies.

Indexar:

- `(station_id, atime, forecast_time)` er PK og helsti lookup.
- `(atime)` eða `(last_fetched_at)` getur hjálpað retention cleanup.
- Ef route query verður stór: `CREATE INDEX ... ON ... (station_id, forecast_time)`.

## Projection behavior

Projection á að skrifa í tvær product-töflur:

1. `vedurstofan_forecasts_latest`
   - Óbreytt latest behavior.
   - Upsert by `(station_id, forecast_time)`.
   - Delete stale rows by older `fetched_at` eins og núna.

2. `vedurstofan_forecasts_history`
   - Upsert by `(station_id, atime, forecast_time)`.
   - `first_fetched_at` helst fyrsta fetch.
   - `last_fetched_at`, values og `expires_at` uppfærast ef sama cycle/forecast row kemur aftur.
   - Ekki eyða current-cycle rows þó forecast_time sé nýlega liðinn.

Þetta þýðir að 21:00 row úr 18:00 cycle lifir áfram og getur verið `prev` fyrir ETA 23:08, án þess að latest-taflan þurfi að geyma söguna.

## Reader behavior

Núverandi `readVedurstofanProductForStations(stationIds)` les bara latest rows og veit ekkert um route ETA glugga.

Ráðlegging:

1. Bæta optional options við reader:

```ts
readVedurstofanProductForStations(stationIds, {
  includeHistory: true,
  forecastTimeFromIso,
  forecastTimeToIso,
})
```

2. Travel route API á að reikna bounded time window út frá leiðinni:

- frá: min ETA minus 3 klst,
- til: max ETA plus 3 klst,
- eða einfaldara fyrst: departure minus 6 klst til arrival plus 6 klst.

3. Reader les fyrst latest til að finna current `atime` per station.

4. Ef `includeHistory`, les hann history fyrir sömu stöðvar, bounded forecast window og aðeins current `atime` per station.

5. Merge/dedupe:

- sameina latest og history,
- dedupe by `(station_id, forecast_time)`,
- raða eftir `forecast_time`.

6. UI `selectPrevUsedNext` getur þá fundið:

- row á undan ETA,
- row sem er notað í mati,
- row á eftir.

## Forecast history vs observation history

Stebbi sagði "sögutöflu yfir veðurgildin frá Veðurstofunni".

Codex myndi skipta þessu svona:

1. Núna: `vedurstofan_forecasts_history`
   - Þetta leysir vandann sem er í v186: prev/used/next forecast rows fyrir ferðaveðrið.
   - Þetta tengist `type=forec`.

2. Síðar þegar observations eru komin almennilega inn:
   - `vedurstofan_observations_history`
   - þar verða gustar, observed time, núverandi mælingar og mögulega Vegagerðar-samanburður.

Ekki flækja fyrstu migration með observations-history nema Claude Code staðfesti að obs-ingestion sé þegar komin eða eigi að koma í sama áfanga. Það er betra að gera eina vel afmarkaða forecast-history töflu núna.

## Product behavior sem á að detta út úr þessu

### Veðurstofan card

Card á að geta sýnt:

- Brottfarartími.
- Áætlaðan tíma X km frá brottfararstað.
- Fjarlægð spápunkts/stöðvar frá veginum.
- `Spá gefin út kl. HH:mm` = `atime`.
- Row á undan notaðri spá.
- Notaða row, merkt skýrt sem notuð í mati.
- Row á eftir notaðri spá.
- Hlekk á veðurstöð á vedur.is.

Allar þrjár card-stöður eiga að nýta sömu grunnframsetningu:

- versti punktur,
- valinn punktur,
- allir spápunktar.

Provider-specific data má koma inn sem parameters, en condition/status label og megin-layout á að vera samnýtt eins mikið og hægt er.

### Útreikningur

Útreikningur á áfram alltaf að taka mið af öllum völdum providers:

- met.no/Yr þegar valið,
- Veðurstofan þegar valið og user hefur flagg,
- Vegagerðin síðar þegar provider bætist við.

Ef aðeins Veðurstofan er valin, eiga worst point, selected point, scrubber og map að byggja á Veðurstofu-punktum, ekki met.no punktum.

History table breytir ekki þessari provider-reglu; hún tryggir bara að Veðurstofan hafi nóg af forecast rows til að birta rétt og meta rétt.

## Supabase / RLS / production áhrif

Þessi tillaga krefst migration ef hún er framkvæmd.

Áður en Claude Code framkvæmir þarf Stebbi að gefa skýrt leyfi fyrir:

- að skrifa migration,
- að breyta projector/reader kóða,
- og sérstaklega áður en SQL er keyrt í Supabase.

Áætluð áhrif:

- Ný tafla í public schema.
- Engin client/anon/authenticated direct access.
- Service role les/skrifar.
- RLS enabled með engum public policies.
- Engin user data í töflunni, aðeins provider weather data.
- Samt þarf passa að API route skili bara route-relevant/provider-relevant data, ekki stórum raw/history dumps.

## Test plan fyrir Claude Code

Unit/static tests sem ættu að fylgja:

- `sql-migration.test.ts`: staðfesta að SQL 77 búi til history table, RLS, revoke/grant, PK og indexa.
- Projector tests:
  - upsertar í latest eins og áður,
  - upsertar líka í history,
  - latest cleanup helst óbreytt,
  - history row dedupe-ar á `(station_id, atime, forecast_time)`,
  - `first_fetched_at` tapast ekki við endurfetch, `last_fetched_at` uppfærist.
- Product reader tests:
  - án `includeHistory` hegðar sér eins og áður,
  - með `includeHistory` finnur prev row úr history,
  - blandar ekki mismunandi `atime`,
  - virðir bounded time window.
- Travel API tests:
  - sendir time-window í Veðurstofan reader þegar layer er virkt,
  - fail-open ef history query bilar,
  - heldur met.no-only behavior óbreytt þegar Veðurstofan er ekki valin/flagguð.

## Localhost checks for Stebbi

Þegar Claude Code er búinn að framkvæma og Stebbi hefur keyrt migration + refresh þar sem við á:

1. Opna ferðaveður route sem fer nálægt Hellisheiði/Sandskeiði og kveikja á Veðurstofunni.
2. Velja brottfarartíma þar sem ETA fellur á milli forecast slots, t.d. milli 21:00 og 00:00 eða milli 18:00 og 21:00.
3. Opna Veðurstofu-spjald í "Allir spápunktar".
4. Vænt:
   - spjaldið sýnir row á undan, notaða row og row á eftir,
   - allar rows eru úr sömu `Spá gefin út kl.` cycle,
   - notaða row er merkt skýrt sem notuð í mati.
5. Prófa aðeins met.no:
   - engin Veðurstofu history hefur áhrif.
6. Prófa aðeins Veðurstofu:
   - map/scrubber/worst point/selected point nota Veðurstofu-punkta,
   - met.no punktar birtast ekki sem worst eða selected.
7. Prófa báðar veitur:
   - "Allir spápunktar" raðast í akstursröð, ekki fyrst allir met.no og svo allar Veðurstofustöðvar.
8. Ekki prófa SQL eða production refresh kæruleysislega:
   - migration og Supabase keyrsla þurfa sérstakt leyfi,
   - ekki nota production manual refresh endurtekið nema cooldown/anti-stampede sé staðfest.

## Ráðlagt næsta skref fyrir Claude Code

Ef Stebbi samþykkir framkvæmd:

1. Skrifa `sql/77_vedurstofan_forecasts_history.sql`.
2. Uppfæra `sql-migration.test.ts`.
3. Uppfæra projector til að skrifa í history og latest.
4. Uppfæra reader með optional history/time-window.
5. Uppfæra travel route til að senda bounded ETA window.
6. Uppfæra eða staðfesta card/shared-card þannig að prev/used/next komi úr history-augmented rows.
7. Gera mixed provider list í akstursröð ef það hefur ekki þegar verið gert.
8. Keyra afmörkuð tests og typecheck.

Ekki keyra migration, ekki commit-a, ekki push-a og ekki deploya nema Stebbi gefi það sérstaklega.

## Óvissa / þarf að staðfesta

- Nákvæmt format á Veðurstofan API: hvort `atime` sé alltaf til staðar fyrir allar forecast rows. Ef `atime` getur verið null þarf annað cycle-key.
- Hvort observation ingestion er nógu nálægt til að búa líka til `vedurstofan_observations_history` núna. Codex mælir með að byrja á forecast-history.
- Nákvæmur time-window í reader þarf að passa við hvernig route ETA er reiknað í núverandi travel API.
