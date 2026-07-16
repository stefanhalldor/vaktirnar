# TODO 086 v189 - Codex review of v188 history architecture

Created: 2026-07-14 23:23
Timezone: Atlantic/Reykjavik

Mode:
- Rýni og plan only.
- Engar kóðabreytingar, engin SQL migration skrifuð eða keyrð, ekkert commit/push/deploy.
- Byggt á `2026-07-14-2320-todo-086-v188-claude-history-table-architecture.md` og fyrri Codex rýni `2026-07-14-2313-todo-086-v187-codex-v186-vedurstofan-history-table-review.md`.

## Findings

### Medium - v188 er rétt um að Veðurstofan og Vegagerðin eigi ekki að deila source-history töflu

Codex er sammála Claude Code:

- `vedurstofan_forecasts_history` á að vera sér tafla fyrir Veðurstofu forecast rows.
- `vegagerdin_conditions_history` á síðar að vera sér tafla fyrir Vegagerðar road/condition observations.
- Sameinuð greining á milli þeirra á ekki heima í source-töflunum sjálfum.

Þetta er betra fyrir:

- schema gæði,
- TypeScript type safety,
- query performance,
- retention,
- RLS/security,
- og framtíðar provider-a.

### Medium - Ekki byggja `weather_route_assessments_history` núna

Claude Code nefnir `weather_route_assessments_history` sem framtíðar analytics/ML layer. Hugmyndin er góð, en hún á ekki að fara í TODO 086 implementation núna.

Ástæða:

- Við erum enn að festa grunninn fyrir provider product layer.
- Vegagerðin er ekki komin inn.
- Route-assessment history gæti orðið persónugreinanleg ef hún tengist raunverulegum ferðum, saved trips eða user behavior.
- Þetta þarf sér privacy/RLS/hönnun þegar komið er að saved trips/framtíðarvörunni.

Skýr regla fyrir Claude Code:

- Núna: bara `vedurstofan_forecasts_history`.
- Síðar: `vegagerdin_conditions_history`.
- Enn síðar: analytics/assessment layer, með sér security review.

### Medium - Future aggregation layer þarf privacy-by-design

Ef við búum síðar til `weather_route_assessments_history`, þá þarf hún ekki bara tæknilegt schema heldur privacy schema.

Sérstaklega þarf að ákveða:

- geymum við user_id eða aldrei user_id?
- geymum við nákvæm route coordinates eða bara coarse/fingerprint?
- hversu lengi geymum við gögn?
- má notandi eyða saved trips og þarf það að eyða tengdum assessment history?
- eru þetta operational logs, analytics eða user-owned data?
- hvaða RLS/grants eiga við?

Þetta er ekki blocker fyrir Veðurstofu-history núna, en það þarf að standa skýrt í handoff svo við byggjum ekki óvart ferðasögu sem lekur persónulegum mynstrum.

### Low - v188 vantar `Localhost checks for Stebbi`

Samkvæmt workflow á öll handoff/review/plan skjöl að innihalda `Localhost checks for Stebbi`. v188 er arkitektúrgreining og ekki implementation handoff, en reglan gildir samt.

Þetta er ekki tæknilegt blocker, en Claude Code á að bæta þessu í næstu handoffum.

## Codex niðurstaða

v188 er rétt stefnumótun:

1. Ekki sameina Veðurstofu og Vegagerðar raw/source history í eina töflu.
2. Byrja á `vedurstofan_forecasts_history`.
3. Geyma Vegagerðina í sér töflu síðar.
4. Hugsa sameinaða greiningu sem derived/analytics layer, ekki source-of-truth.

Það sem Codex vill skerpa áður en framkvæmd hefst:

- Claude Code á ekki að skrifa Vegagerðar-history eða route-assessment history núna.
- SQL 77 á að vera þröngt: Veðurstofan forecast history only.
- Ekki má veikja RLS/grants.
- Ekki má breyta public weather behavior fyrir óflaggaða notendur.
- History reader má ekki blanda mismunandi `atime` cycles.

## Recommended implementation scope for next Claude Code phase

Ef Stebbi gefur skýrt framkvæmdarleyfi, þá er næsti áfangi:

### In scope

- `sql/77_vedurstofan_forecasts_history.sql`
- static SQL tests fyrir migration
- projector skrifar í bæði:
  - `vedurstofan_forecasts_latest`
  - `vedurstofan_forecasts_history`
- reader getur sótt bounded history fyrir current `atime`
- travel API sendir time window í reader
- Veðurstofu-card getur sýnt prev/used/next úr history-augmented data
- tests fyrir projector/reader/travel API

### Explicitly out of scope

- `vegagerdin_conditions_history`
- `weather_route_assessments_history`
- ML/statistical model
- saved trips persistence
- production migration keyrsla nema Stebbi biðji sérstaklega
- commit/push/deploy

## Suggested copy/paste instruction to Claude Code

```text
Claude Code, rýndu v189 Codex review og uppfærðu framkvæmdaráætlunina fyrir næsta skref.

Mikilvæg afmörkun:
- Núna eigum við aðeins að undirbúa/framkvæma Veðurstofu forecast history.
- Ekki skrifa Vegagerðar-history, route-assessment-history eða ML/analytics layer í þessum áfanga.
- SQL 77 á að vera `vedurstofan_forecasts_history` only, nema þú finnir tæknilega ástæðu til að stoppa og spyrja fyrst.
- `vedurstofan_forecasts_latest` á áfram að vera hrein latest/current product-tafla.
- History reader má aðeins lesa history rows úr sama `atime` forecast cycle og current latest rows per station.
- Passaðu RLS/grants: service_role only, engin anon/authenticated access.
- Ekki keyra migration, commit-a, push-a eða deploya nema Stebbi gefi það sérstaklega.

Skilaðu fyrst stuttu framkvæmdarplani með skrám, testum og áhættum áður en þú framkvæmir.
```

## Localhost checks for Stebbi

Þegar þessi áfangi verður síðar framkvæmdur og Stebbi hefur keyrt migration/refresh með skýru leyfi:

1. Opna ferðaveður á localhost með notanda sem hefur Veðurstofu-provider flagg.
2. Prófa leið nálægt Hellisheiði/Sandskeiði.
3. Kveikja á Veðurstofunni og velja brottfarartíma þar sem ETA lendir milli forecast slots.
4. Vænt:
   - Veðurstofu-spjald sýnir previous row, used row og next row.
   - `Spá gefin út kl.` er sama cycle fyrir allar þrjár rows.
   - Notaða row er merkt sem notuð í mati.
5. Prófa met.no only:
   - engin Veðurstofu-history hefur áhrif.
6. Prófa Veðurstofan only:
   - worst point, selected point, scrubber og map nota Veðurstofu-punkta.
7. Prófa báðar veitur:
   - allir spápunktar raðast í akstursröð.
8. Ekki prófa production migration eða repeated manual refresh án skýrs leyfis og cooldown/anti-stampede staðfestingar.

## Supabase / RLS note

Þessi næsti áfangi þarf migration ef framkvæmdur. SQL má ekki keyra í Supabase nema Stebbi biðji sérstaklega um það.

Expected safe shape:

- ný tafla fyrir provider weather data, ekki user data,
- RLS enabled,
- allur public/anon/authenticated access revoked,
- service_role only,
- bounded API response, ekki raw dump af history.

## Óvissa / þarf að staðfesta

- Hvort `atime` sé alltaf til í Veðurstofu forecast payload. Ef ekki þarf fallback cycle-key áður en history schema er læst.
- Hvar best er að keyra retention cleanup: í projector eftir successful run eða í sér cleanup job.
- Hversu langur retention gluggi á að vera fyrst. Codex lagði til 14 daga sem pragmatic upphaf.
