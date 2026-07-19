# 2026-07-18 11:00 - TODO 086 v482 - Codex review of v481, threshold-driven provider map

Created: 2026-07-18 11:00
Timezone: Atlantic/Reykjavik

Related handoff reviewed:
- `ai-handoff/2026-07-18-1050-todo-086-v481-claude-v480-done-prerelease.md`

## Stutt mannamálssamantekt

v481 lagaði mikilvæga hluti í Púlsinum og context-kortinu, en `/vedrid` overview-kortið er enn að lita Vegagerðarpunkta eftir því hvort mælingar eru nýjar eða gamlar. Það er röng aðalmerking fyrir notendur.

Næsta stóra skref á að vera að láta Vegagerðarpunkta og síðar aðra provider-punkta litast eftir sömu veðurmörkum og ferðalagið notar: `Innan marka`, `Nálgast óþægindi`, `Óþægilegt`, `Nálgast hættumörk`, `Hættulegt`, með sömu emoji/pillum og sama status-samningi og `/vedrid/ferdalagid`.

Ferskleiki gagna á áfram að sjást, en sem aukaupplýsing: t.d. `mælt kl. 10:27`, `gömul mæling`, eða í detail-texta. Hann á ekki að stýra aðallitum kortapunktanna.

## Findings

1. **Medium/Product: Vegagerðin marker color is still freshness-driven, not user-threshold-driven**

   `components/weather/WeatherOverviewClient.tsx:225`-`230` maps `measurementFreshness` directly to marker tone:
   - fresh -> `ok`
   - aging -> `warning`
   - stale/unknown -> `unavailable`

   Then every Vegagerðin station uses that same tone at `components/weather/WeatherOverviewClient.tsx:233`-`245`.

   This means the map visually says "green/orange/grey = data age", while the travel map says "green/yellow/orange/red = weather status against your limits". Stebbi's product direction is now clear: users mostly care whether conditions are within their limits, not whether the measurement cache is fresh.

   **Fix direction:** stop using `measurementFreshness` as primary marker tone. Classify each station observation against `ResolvedTravelThresholds`, then map that `WindDisplayStatus` to marker color/tone.

2. **Medium/Architecture: the status source of truth already exists, so do not invent another status model**

   Existing source of truth:
   - `lib/weather/windDisplayStatus.ts:14` defines `WindDisplayStatus`.
   - `lib/weather/windDisplayStatus.ts:26`-`37` defines canonical pill/filter order.
   - `lib/weather/windDisplayStatus.ts:56`-`64` defines canonical map marker colors.
   - `lib/weather/windDisplayStatus.ts:83`-`91` classifies raw point wind against `ResolvedTravelThresholds`.
   - `components/weather/windStatusUi.ts:20`-`27` defines canonical UI metadata for dots, labels, chips, icons.
   - `components/weather/WindStatusBadge.tsx:15`-`52` renders the reusable label/chip/badge.

   `TravelAuditMap` already uses this model for route-map marker colors and filter counts:
   - `components/weather/TravelAuditMap.tsx:455`-`469`
   - `components/weather/TravelAuditMap.tsx:501`-`519`

   **Fix direction:** Overview/Vegagerðin should plug into this same `WindDisplayStatus` contract. Do not create a parallel `VegagerdinRiskStatus`, separate color table, or provider-specific emoji list.

3. **Medium/UX: `/vedrid` overview needs the same threshold concept as `/ferdalagid`, but in a lighter form**

   `FerdalagidClient` owns threshold state today:
   - `app/auth-mvp/vedrid/FerdalagidClient.tsx:135`-`141`
   - threshold step UI around `app/auth-mvp/vedrid/FerdalagidClient.tsx:1429`-`1453`
   - summary box around `app/auth-mvp/vedrid/FerdalagidClient.tsx:1612`-`1619`

   `/vedrid` overview currently has no way for the user to set wind limits before looking at all Iceland. If overview markers become threshold-driven, we need a small shared threshold control/state pattern, not a hidden hardcoded default forever.

   **Fix direction:** extract a compact reusable threshold component or hook from the Ferðalagið flow, or create a provider-neutral `WeatherThresholdControls`/`useWeatherThresholds` layer that both overview and ferðalagið can use. Overview can start with defaults, but the UI should let users adjust wind thresholds and immediately recolor markers.

4. **Low/Design consistency: data freshness should move into label/meta, not disappear**

   Freshness is still useful. It should not drive the point color, but it should still be visible where it helps trust:
   - marker tooltip/status label can say `mælt kl. HH:mm`
   - selected station card can show `Gömul mæling` or `Mælt kl. HH:mm`
   - provider pill can show loading/stale data copy if needed

   This fits `Design.md`: status colors must carry user-facing meaning, but not be the only way to communicate state. It also avoids misleading users into thinking a stale but calm station is "bad weather" or a fresh but windy station is "safe".

## Næsta stóra framkvæmdarskref fyrir Claude Code

Claude Code, rýndu þetta fyrst með `Workflow`-hugsun: ef eitthvað hér er óljóst eða ef þú sérð betri source-of-truth í kóðanum, stoppaðu og skilaðu spurningu/handoff. Ef ekki, framkvæmdu þetta sem einn afmarkaðan áfanga án commit/push/deploy/SQL.

### Markmið

Gera `/vedrid` overview-kortið status-drifið á sama hátt og `/vedrid/ferdalagid`, þannig að Vegagerðarpunktar litist eftir veðurmörkum notandans og noti sömu label/emoji/status-pilluupplifun og ferðalagið.

### Scope

1. **Búa til eða endurnýta hreinan adapter frá mælingu í `WindDisplayStatus`**
   - Nota `classifyPointWindDisplayStatus()` úr `lib/weather/windDisplayStatus.ts` ef jafnvindur er nóg.
   - Ef Vegagerðin á að taka mið af hviðum líka, þá má búa til litla reusable function í `lib/weather/windDisplayStatus.ts` eða nálægt henni, t.d. `classifyObservationWindDisplayStatus({ windMs, gustMs }, thresholds)`.
   - Hún á samt að skila `WindDisplayStatus`, ekki nýju provider-specific enum.
   - Fyrsta útgáfa má vera:
     - engin vindmæling -> `no_data`
     - jafnvindur flokkaður með `cautionWindMs` / `redWindMs`
     - hviður aðeins ef núverandi threshold-samningur styður það örugglega; annars skrifa skýra TODO/comment og halda hviðutexta sem aukaupplýsingu.

2. **Búa til reusable mapping frá `WindDisplayStatus` yfir í `ProviderMapMarkerTone`**
   - Ekki nota `measurementFreshness` í aðaltone fyrir Vegagerðarpunkta.
   - Möguleg mapping:
     - `innan-marka` -> `ok`
     - `nalgast-othaegindi` -> `warning`
     - `othaegilegt` -> `warning` eða nýr `orange` tone ef núverandi `ProviderMapMarkerTone` er of grófur
     - `nalgast-haettumork` / `haettulegt` -> `danger`
     - `no_data` -> `unavailable` eða `muted`
   - Athugaðu hvort `ProviderMapMarkerTone` sé of gróft til að endurskapa sömu litaupplifun og ferðalagið. Ef já, betra er að víkka provider-map contractið með `windStatus?: WindDisplayStatus` eða `markerColor?: string` en að tapa muninum á `Nálgast óþægindi` og `Óþægilegt`.
   - Meginreglan: ekki láta `IcelandOverviewMap` verða provider-specific; það má hins vegar styðja reusable display field sem kemur frá sameiginlegum status-samningi.

3. **Setja status-label á Vegagerðin markerana**
   - `statusLabel` á marker ætti að nota sömu þýðingar og `WindStatusBadge`, t.d. `Nálgast hættumörk`, ekki bara `Nústaða`.
   - Í selected preview/card má sýna `WindStatusBadge` með `variant="chip"` eða sambærilegu, eins og ferðalagið.
   - Ferskleiki fari í aðra línu: `Mælt kl. HH:mm`, `Gömul mæling`, eða sambærilegt.

4. **Bæta við threshold control á `/vedrid` overview**
   - Byrja má compact: `Þín veðurmörk` með núverandi default gildum og möguleika á að breyta `Óþægilegt` / `Hættulegt`.
   - Forðast stórt form ef það kæfir overview upplifunina. Þetta getur verið lokuð/lítil skúffa eða compact panel fyrir ofan kortið.
   - Sama state/API og ferðalagið á helst að nýtast síðar þegar notandi smellir `Reikna ferðaveðrið`, svo upplifunin verði samfelld milli `/vedrid` og `/vedrid/ferdalagid`.
   - Ef það er of stórt að flytja threshold-state alla leið milli skjáa í þessum áfanga, skráðu það sem næsta skref en láttu overview samt nota sömu default threshold source (`resolveThresholds('none')`) og sömu classifying function.

5. **Uppfæra kort/filter upplifun**
   - Ef við sýnum filter-pillur fyrir statusa á overview-kortinu, nota `WIND_DISPLAY_STATUS_PILL_ORDER` og `WindStatusBadge`/`WIND_STATUS_UI_META`.
   - Ef status-filterar koma ekki inn í þessum áfanga, undirbúðu gögnin þannig að þeir verði auðveldir næst.
   - Provider show/hide pillur (`Veðurstofan`, `Vegagerðin`) mega vera áfram provider toggles, en litir punktanna eiga að vera veðurstöðu-litir.

6. **Tests**
   - Bæta unit testum fyrir nýja adapterinn:
     - ekkert gildi -> `no_data`
     - undir caution -> `innan-marka`
     - nálægt caution -> `nalgast-othaegindi`
     - yfir caution -> `othaegilegt`
     - nálægt red -> `nalgast-haettumork`
     - yfir red -> `haettulegt`
   - Bæta test eða assertion sem tryggir að `measurementFreshness='stale'` eitt og sér geri Vegagerðin marker ekki gráan þegar vindgildi eru til.
   - Keyra minnst:
     - `npm run type-check`
     - targeted Vitest fyrir nýju status/overview-helperana

### Out of scope í þessum áfanga

- Ekki breyta SQL.
- Ekki keyra SQL 81.
- Ekki commit-a, push-a eða deploya.
- Ekki færa Púlsinn aftur yfir á Veðurstofustöðvar.
- Ekki tengja Vegagerðin inn í ferðatíma-optimization eða `Mest krefjandi á leiðinni` sem ákvarðandi spágagnapunkt. Þetta skref er overview/current-observation visualization.
- Ekki byggja sérstaka provider-specific status-lógík sem verður síðar hent.

## Localhost checks for Stebbi

Eftir framkvæmd á Stebbi að prófa:

1. Opna `http://localhost:3004/vedrid`.
2. Kveikja/slökkva á `Vegagerðin` og `Veðurstofan` provider-pillum.
3. Staðfesta að Vegagerðarpunktar séu clickable/toggleable þótt mælingar séu gamlar.
4. Staðfesta að litir Vegagerðarpunkta fylgi veðurmörkum:
   - lægri vindur -> grænn / `Innan marka`
   - nálægt óþægilegu -> gulur / `Nálgast óþægindi`
   - óþægilegt -> appelsínugult / `Óþægilegt`
   - nálægt hættumörkum eða hættulegt -> rautt / `Nálgast hættumörk` eða `Hættulegt`
5. Breyta veðurmörkum á overview og sjá markerana endurlitast án þess að endurhlaða síðuna eða sækja gögn aftur.
6. Opna Vegagerðin punkt og staðfesta að preview/full pulse sýni:
   - sama status label/chip og overview markerinn
   - freshness/mælitíma sem aukaupplýsingu, ekki sem aðallit
7. Smella `Reikna ferðaveðrið` og staðfesta að `/vedrid/ferdalagid` sé enn með sömu status-pilluupplifun og kortið þar hafi ekki regressað.
8. Prófa í 390-460 px mobile breidd:
   - enginn horizontal overflow
   - threshold controls valda ekki mobile zoomi
   - provider pillur og status pillur passa í skjáinn
   - loading/pending states líta ekki út eins og dauðir takkar

## SQL / Supabase / öryggi

- Þessi breyting ætti ekki að þurfa SQL.
- Ekki keyra SQL 81 nema Stebbi biðji sérstaklega um það.
- Engin RLS/policy/grants breyting á að vera hluti af þessum áfanga.
- Engin production/Vercel/env breyting á að vera hluti af þessum áfanga.

## Óvissa / þarf að staðfesta

- Ég hef ekki staðfest nákvæmlega hvaða reitir eru alltaf til á `VegagerdinCurrentStationDto` fyrir jafnvind/hviður. Claude Code þarf að skoða type-ið áður en adapterinn er skrifaður.
- Það þarf product-ákvörðun hvort hviður eigi að hafa áhrif á punktalit strax. Ef hviður eru teknar með, þarf sama regla að vera skýr og endurnýtanleg, ekki falin í overview componenti.
- `ProviderMapMarkerTone` er hugsanlega of gróft til að sýna alla `WindDisplayStatus` liti. Ef svo er, er betra að víkka reusable map contractið en að þjappa merkingunni niður og missa samræmið við ferðalagið.

## Codex confidence

High um product/architecture direction: litir eiga að vera threshold/status-driven og núverandi source-of-truth er þegar til.

Medium um nákvæma implementation leið: þarf að staðfesta Vegagerðin DTO reiti og hvort map contractið eigi að taka `WindDisplayStatus` beint eða styðja custom marker color.
