# 2026-07-19 06:45 - TODO 086 v543 - Codex review: v542 + SQL86 migration gate

Created: 2026-07-19 06:45
Timezone: Atlantic/Reykjavik

Review target:

- `2026-07-19-0636-todo-086-v542-claude-v541-done-prerelease`
- `sql/86_weather_route_memory.sql`

Related:

- `2026-07-19-0638-todo-086-v542-codex-route-memory-map-picker-handoff`

---

## Short answer

**Já, Codex telur `sql/86_weather_route_memory.sql` nógu örugga til að Stebbi geti keyrt hana og hafið markvissar prófanir**, með þessum fyrirvörum:

1. Keyra **bara SQL86**. Ekki keyra 82/83/84/85 í þessari lotu.
2. SQL86 er additive: býr til tvær nýjar private/service-role töflur og á ekki að breyta núverandi hegðun eða gögnum beint.
3. Fyrstu route-memory write/lookup prófanir verða samt raunveruleg end-to-end prófun, því writer/lookup mock-próf vantar enn.
4. Ef `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true` í umhverfinu þarf að laga lookup provider-gating fyrir Veðurstofu líka áður en þetta er talið hreint access-contract.

`2026-07-19-0638-todo-086-v542-codex-route-memory-map-picker-handoff` breytir ekki migration-gate niðurstöðunni. Það handoff gerir SQL86 frekar mikilvægari, því kortadrifna `Frá`/`Til` upplifunin þarf route-memory gögn til að verða gagnleg.

---

## Findings

1. **Medium: route-memory lookup gatar Vegagerðina, en ekki Veðurstofuna**  
   `app/api/teskeid/weather/route-memory/lookup/route.ts:63`-`88` strip-ar `vegagerdinStationIds` ef `WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED=true` og notandi hefur ekki aðgang. Sambærileg gating vantar fyrir `vedurstofanStationIds`, þó `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED` og `weather-provider-vedurstofan` séu til í kerfinu.  
   Þetta er ekki bein SQL86 áhætta, því töflurnar sjálfar eru private og aðeins service-role les. En public lookup endpointið getur samt skilað Veðurstofu station IDs/route-memory hitum þótt Veðurstofan sé access-restricted.  
   **Ráðlegging:** Ef Stebbi er með Veðurstofuna opna (`WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED` ekki `true`) má keyra SQL86 og prófa. Ef Veðurstofan er lokuð í umhverfinu, láta Claude laga þetta áður en public prófanir fara langt.

2. **Medium: writer/lookup business logic er enn ekki prófað með Supabase mock**  
   v542 lagar race/provider cleanup/variant í kóða, en handoffið staðfestir að A6 prófin voru ekki skrifuð. Núverandi `weather-route-memory-migration.test.ts` prófar SQL textann statically, ekki raunverulegt `recordRouteMemory()` eða lookup handler.  
   Þetta er ekki migration-blocker, en þýðir að fyrstu prófanir eftir SQL86 þurfa að vera meðvitaðar: reikna leið í `/ferdalagid`, staðfesta að row skrifist, og staðfesta að `/vedrid` lesi nákvæm station sets.

3. **Low/Medium: `usage_count` er schema-ready en hækkar ekki**  
   `sql/86_weather_route_memory.sql` hefur `usage_count integer default 1`, en `recordRouteMemory()` uppfærir aðeins `last_seen_at`/`updated_at` við conflict (`lib/iceland-routes/routeMemory.server.ts:63`-`85`). Þetta er meðvituð v542 ákvörðun.  
   Ekki blocker fyrir exact station-set filter, en skiptir máli fyrir næsta korta-picker skref ef við viljum raða vinsælum leiðum eftir talningu. V1 má nota `last_seen_at`; popularity-count þarf seinna RPC eða atomic increment.

4. **Low: roadmap source-of-truth klofnaði í tvö skjöl**  
   Workflow vísar í root `IcelandRoadmap.md` sem leiðastefnu source-of-truth, en v542 bætir við `lib/iceland-routes/IcelandRoadmap.md`. Þetta stoppar ekki SQL86, en skapar hættu á að plan og implementation fari að vísa í mismunandi roadmap.  
   **Ráðlegging:** Sameina efnið aftur í root `IcelandRoadmap.md` eða breyta workflow meðvitað. Ekki skilja bæði eftir sem jafngild roadmap skjöl.

5. **Low: `git diff --check` er enn rautt**  
   `git diff --check` skilar áfram:
   - CRLF warnings á `TODO.md` og `WORKFLOW.md`
   - `lib/weather/routeCautionConstants.ts:49: new blank line at EOF`
   Þetta er ekki SQL86 blocker, en þarf að laga fyrir commit.

---

## Staðfestingar sem Codex keyrði

```bash
npm run type-check
```

Niðurstaða: exit 0.

```bash
npm run test:run -- lib/__tests__/route-place-normalization.test.ts lib/__tests__/weather-route-memory-migration.test.ts lib/__tests__/windObservationStatus.test.ts lib/__tests__/overview-route-draft.test.ts lib/__tests__/route-observation.test.ts lib/__tests__/iceland-routes-lens.test.ts
```

Niðurstaða: exit 0, 6 test files pass, 145 tests pass.

```bash
git diff --check
```

Niðurstaða: exit 1 vegna whitespace/CRLF atriða nefndra í finding #5.

---

## SQL86 mat

`sql/86_weather_route_memory.sql`:

- býr til `weather_route_memory_routes`
- býr til `weather_route_memory_stations`
- geymir ekki user ID
- geymir ekki raw heimilisföng
- geymir ekki raw Google geometry, steps, duration eða distance
- geymir ekki Google place IDs
- geymir aðeins normalized public-ish place keys/labels og provider station IDs
- enable-ar RLS
- revoke-ar anon/authenticated/public
- grant-ar aðeins service_role
- er wrapped í transaction
- hefur rollback comment

Þetta er gott fyrir migration-gate.

**Ráðlegging Codex:** Stebbi má keyra SQL86 til að hefja prófanir, ef markmiðið er að sannreyna route-memory end-to-end. Þetta er ekki sama og “tilbúið til útgáfu án frekari rýni”.

---

## Breytir map-picker handoffið stöðunni?

Nei, ekki þannig að SQL86 eigi að bíða.

`2026-07-19-0638-todo-086-v542-codex-route-memory-map-picker-handoff` byggir einmitt á því að route-memory sé til og fari að fyllast. Að keyra SQL86 núna hjálpar næsta skrefi:

1. `/ferdalagid` byrjar að skrifa route-memory.
2. Stebbi getur reiknað helstu leiðir.
3. Nýja map-picker upplifunin getur síðar lesið raunverulegar `Frá`/`Til` leiðir úr route-memory í stað dummy/corridor lista.

Það sem map-picker handoffið gæti síðar þurft:

- aggregate endpoint fyrir `from` places
- endpoint fyrir destinations per `from`
- hugsanlega betri index ef gagnamagn verður stórt
- canonical place coords registry

En það krefst ekki að SQL86 sé endilega frestað. Núverandi index `(from_place_key, to_place_key, last_seen_at desc)` er nægilega góður fyrir fyrstu route-memory lookup og líklega fyrstu destination-lista prófanir.

---

## Nákvæm migration-ráðlegging

Ef Stebbi vill prófa þetta núna:

1. Keyra `sql/86_weather_route_memory.sql`.
2. Ekki keyra `82`, `83`, `84` eða `85`.
3. Staðfesta að SQL keyrsla klárist án villu.
4. Prófa strax með localhost eða því umhverfi sem notar sama Supabase:
   - reikna leið í `/vedrid/ferdalagid`
   - fara á `/vedrid`
   - velja sama `Frá`/`Til`
   - staðfesta að kortið filteri eftir route-memory station IDs

Ef SQL86 failar:

- ekki keyra rollback í blindni
- vista villuna
- senda Claude/Codex villuna
- líklegustu fail atriði væru extension/permission/schema mismatch, en SQL virðist eðlilegt fyrir Supabase.

---

## Localhost checks for Stebbi

### Fyrir SQL86

1. Opna `/vedrid`.
2. Velja `Frá` og `Til` sem ekki hafa route-memory table enn.
3. Expected: enginn crash; route-memory lookup skilar miss og kortið heldur áfram að virka.

### Eftir SQL86

1. Opna `/vedrid/ferdalagid`.
2. Reikna leið, t.d. `Reykjavík -> Akureyri`.
3. Velja leið og klára niðurstöðu þannig að travel API keyri.
4. Opna `/vedrid`.
5. Velja sama `Frá` og `Til`.
6. Expected:
   - route-memory status verður resolved
   - kortið sýnir ekki allar landsstöðvar
   - aðeins stöðvar sem ferðalagið vistaði sjást
   - status pillur undir korti telja bara route-filteraðar stöðvar

### Variant próf

1. Reikna leið sem hefur fleiri route options.
2. Velja annan route option.
3. Fara aftur á `/vedrid` með sama `Frá`/`Til`.
4. Expected v1: nýjasta variant sé valin fyrst. Seinna map-picker UI á að geta sýnt variants skýrar.

### Access próf

1. Ef `WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED=true`, prófa public/óheimilan notanda.
2. Expected: `vegagerdinStationIds` skili tómu setti.
3. Ef `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true`, vera meðvitaður um finding #1: núverandi lookup virðist ekki strip-a `vedurstofanStationIds`.

---

## Next handoff til Claude Code

Ef Stebbi vill senda næsta skref til Claude, láta Claude taka:

1. Laga Veðurstofan provider gating í route-memory lookup.
2. Bæta writer/lookup tests.
3. Sameina `lib/iceland-routes/IcelandRoadmap.md` inn í root `IcelandRoadmap.md` eða taka skýra ákvörðun um eitt source-of-truth.
4. Halda áfram með `2026-07-19-0638-todo-086-v542-codex-route-memory-map-picker-handoff`.

---

## Codex niðurstaða

SQL86 er nógu þröng, additive og privacy-safe til að keyra fyrir prófanir.

Staðan með nýja map-picker handoffinu er ekki “bíða með SQL86”, heldur “keyra SQL86 hjálpar okkur að fylla gögnin sem map-picker þarf”.

Stærsti fyrirvarinn er ekki SQL-ið sjálft, heldur að route-memory logic þarf enn writer/lookup próf og provider-gating þarf að samræma Veðurstofu og Vegagerð áður en þetta telst fullgert.

