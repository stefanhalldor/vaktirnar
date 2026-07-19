# TODO-086 v472 — /vedrid overview cleanup, Vegagerðin map layer, and Vegagerðin-first pulse

Created: 2026-07-18 09:15  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Type: implementation handoff for Claude Code  
Related handoffs: v456-v471, especially v470/v471 Vegagerðin cache/current flow

## Stutt mannamál

Stebbi vill hreinsa `/vedrid` yfirlitið þannig að það verði meira alvöru yfirlitskort og minna debug/lista-skjár.

Í þessu skrefi á Claude Code að:

- sýna Vegagerðarpunkta á sama korti og Veðurstofupunktar þegar Vegagerðin current-cache er til
- skipta núverandi provider status-kassa út fyrir tvær filter-pillur: `Veðurstofan` og `Vegagerðin`
- nota pillurnar til að sýna/fela provider layers, ekki status filters
- fjarlægja Veðurstofu status-yfirlitið og status-filterana/listann undir kortinu
- halda selected-station preview-spjaldinu
- setja Veðurpúls/aðstæðufréttir aftur inn, en með Vegagerðarstöðvar sem grunn
- laga provider-aware chat access ef Vegagerðarpúlsinn er annars óvart háður Veðurstofu-aðgangi

Ekki commit-a, push-a, deploya, keyra SQL eða breyta Vercel/env. Þetta er repo-útfærsla og localhost-prófanir.

## Skilningur á samþykki

Stebbi hefur ekki beðið Codex um að framkvæma kóðabreytingar. Þetta skjal er handoff/plan fyrir Claude Code.

Ef Stebbi sendir þetta til Claude Code með `Workflow`, þá má Claude Code framkvæma afmarkaða repo-breytingu samkvæmt þessu handoffi, en má ekki commit-a, push-a, deploya, keyra SQL/migration eða breyta Vercel/env nema Stebbi biðji sérstaklega um það.

## Núverandi staða í kóða

- `WeatherOverviewClient` sækir Veðurstofu-stöðvar úr `/api/teskeid/weather/vedurstofan/stations` og býr til `vedurstofanLayer`.
- `WeatherOverviewClient` sækir Vegagerðin current-cache úr `/api/teskeid/weather/vegagerdin/current` og býr til `vegagerdinLayer`.
- `WeatherOverviewShell` styður þegar mörg `ProviderMapLayer` á sama `IcelandOverviewMap`.
- Provider config er til, en bæði `vedurstofanProvider.canToggle` og `vegagerdinProvider.canToggle` eru `false`.
- Núverandi provider strip er status-row með litlum punktum og texta eins og `Engin gögn`, ekki nothæfur filter.
- Veðurstofu status summary og status filter/listi eru enn í `WeatherOverviewClient`:
  - summary strip með `280 stöðvar í skrá · Ný gögn...`
  - filter buttons `Allar / Í lagi / Gömul / Vantar`
  - neðri station listi yfir allar Veðurstofustöðvar
- `ConditionsFeedPreview` er nú renderað inni í `vedurstofanProvider.renderPreMap`, þó endpointið sæki nú bara `vegagerdin_station` feed. Það er röng ownership eftir að púlsinn er að færast yfir á Vegagerðina.
- `VegagerdinStationDetail` notar `WeatherPulseInline provider="vegagerdin"`, sem er rétt stefna.
- `checkChatAccess()` í `lib/chat/access.server.ts` krefst enn `weather-provider-vedurstofan` fyrir allan Veðurpúls. Það er líklega rangt fyrir Vegagerðarpúls þegar provider-gating verður sértæk.

## Product requirements

### 1. Provider filter pills

Skipta núverandi provider status-kassa út fyrir pillur:

```text
Veðurstofan   Vegagerðin
```

Kröfur:

- Pillurnar eiga að vera alvöru toggles/filterar.
- Báðar eru default sýnilegar ef provider hefur aðgengileg gögn.
- Smellur á `Veðurstofan` sýnir/felur Veðurstofu layer.
- Smellur á `Vegagerðin` sýnir/felur Vegagerðar layer.
- Ef provider er hidden, á selected marker frá þeim provider að hreinsast úr URL/state.
- Ekki sýna gamla provider status row með grænum punktum og `Engin gögn` sem aðalviðmót.
- Ef provider er ekki með gögn má pillan vera disabled/muted, en hún má ekki líta út eins og nothæfur filter sem gerir ekkert.
- Ef bæði layers eru slökkt skal sýna rólegt empty state og leyfa notanda að kveikja aftur.

Mikilvægt: þetta er provider-filter, ekki freshness/status-filter.

### 2. Vegagerðin á kortið

Vegagerðarpunktar eiga að birtast á `/vedrid` kortinu þegar:

- `/api/teskeid/weather/vegagerdin/current` skilar `status: "ok"`
- `stations.length > 0`
- Vegagerðin provider pill er virk

Ekki kalla beint í live Vegagerðin upstream frá client. Client á aðeins að nota cache-only endpointið.

Ef Stebbi sér enn enga Vegagerðarpunkta eftir þessa breytingu þarf að staðfesta gagnastöðu:

- hefur `sql/80...` og `sql/81...` verið keyrt þar sem við á?
- hefur `/api/cron/warm-vegagerdin` verið keyrt með réttu `CRON_SECRET`?
- skilar `/api/teskeid/weather/vegagerdin/current` `status: "ok"`?

Ekki fake-a eða harðkóða Vegagerðarpunkta í UI.

### 3. Fjarlægja Veðurstofu debug/status UI

Fjarlægja úr `/vedrid` overview:

- summary strip: `280 stöðvar í skrá · Ný gögn (...) · Gömul gögn (...) · Vantar gögn (...)`
- status-filterana: `Allar / Í lagi / Gömul / Vantar`
- neðri listann yfir allar Veðurstofustöðvar
- status context í selected Veðurstofu-spjaldi ef hann er bara freshness/status (`Ný gögn`, `Gömul gögn`, `Vantar gögn`) og ekki hjálpar notanda við að skilja stöðina

Halda:

- kortinu
- marker selection
- selected station preview card
- forecast rows / relevant station context
- provider badge (`Veðurstofan` eða `Vegagerðin`)
- púls/aðstæðufréttir á provider-neutral grunni

Athugið: ekki er krafa í þessu skrefi að breyta litum á map markers. Það má halda tone/freshness litun á kortinu ef hún hjálpar, en ekki birta gamla status-debug UI undir kortinu.

### 4. Veðurpúls aftur inn, nú Vegagerðin-first

Stebbi vill sama konsept og áður, en nú með Vegagerðarstöðvar sem source.

Kröfur:

- Global/overview feed á að vera `Fréttir af aðstæðum frá notendum Teskeiðarinnar`.
- Feedið á að byggja á `vegagerdin_station`, ekki Veðurstofustöðvum.
- Það má vera falið ef engin Vegagerðarskilaboð eru til, sérstaklega fyrir public notanda. Ekki sýna tóman “Engar fréttir...” kassa á overview nema Stebbi samþykki það sérstaklega.
- Þegar skilaboð eru til á Vegagerðarstöðvum á feedið að sjást á `/vedrid`.
- Feedið má ekki vera líft undir `vedurstofanProvider.renderPreMap`; það á annaðhvort að vera:
  - `vegagerdinProvider.renderPreMap`, ef það á að fylgja Vegagerðin pillunni, eða
  - shell-level/global slot sem er provider-aware og ekki háð Veðurstofu layer.
- Selected Vegagerðin station preview á áfram að nota `WeatherPulseInline provider="vegagerdin"`.
- Ekki búa til nýjan Vegagerðin-only chat component ef `WeatherPulseInline`, `ConditionsFeedPreview`, `useChatPreview`, `useFeedLoader` eða `ScopedChatPanel` duga með provider param.

Best fit miðað við núverandi stöðu:

- Global conditions drawer: tengja við Vegagerðin provider, þannig að hann birtist þegar Vegagerðin pill er virk og feed-items eru til.
- Station preview: `WeatherPulseInline provider="vegagerdin"` í `VegagerdinStationDetail`, eins og byrjað er.
- Full pulse URL: `/auth-mvp/vedrid/puls/vegagerdin/stod/[stationId]`.

### 5. Provider-aware chat access

Þetta þarf að rýna og líklega laga í sama skrefi, því annars getur Vegagerðarpúls virkað óstöðugt eftir env/feature gate stillingum.

Núverandi vandamál:

- `lib/chat/access.server.ts` krefst `weather-provider-vedurstofan` fyrir allan púls.
- Vegagerðarpúls ætti ekki að vera háður því að notandi hafi Veðurstofu provider-aðgang þegar Vegagerðin er sjálfstæður provider.
- `messages` POST er þegar takmarkað við `WEATHER_PULSE_PRIMARY_TARGET_TYPES = ['vegagerdin_station']`, sem er rétt stefna.

Tillaga:

- Breyta `checkChatAccess(user)` í provider-aware access eða bæta við nýjum helper, t.d.:

```ts
checkWeatherPulseAccess(user, { provider?: 'vedurstofan' | 'vegagerdin' })
```

- Fyrir `provider='vedurstofan'`: halda legacy/read-only hegðun eins og við þurfum fyrir eldri Veðurstofupúls.
- Fyrir `provider='vegagerdin'`: nota `weather-provider-vegagerdin` gating þegar `WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED === 'true'`.
- `TESKEID_CHAT_ENABLED=true`, base weather access og session kröfur gilda áfram.
- `WEATHER_PULSE_ACCESS_REQUIRED=true` má áfram setja per-user gate á sjálfan púlsinn ef þörf er á.
- Full page `app/auth-mvp/vedrid/puls/vegagerdin/stod/[stationId]/page.tsx` þarf að kalla provider-aware access.
- `thread` API getur lesið `provider` úr body áður en access er metið og kallað provider-aware access.
- `messages/read/report/feed` sem taka aðeins `threadId` þurfa annaðhvort:
  - fyrst að staðfesta thread scope/provider server-side og svo provider-aware access, án þess að leka thread til óviðkomandi notanda, eða
  - halda einfaldari graduated access ef provider gates eru ekki virk, en test-a skýrt að Vegagerðin sé ekki óvart háð Veðurstofu.

Ekki veikja auth/RLS. Þetta er server-side access refactor, ekki client-only fix.

### 6. UI simplification and Design.md

Fylgja `Design.md`:

- mobile-first
- þétt en ekki þröngt
- engin debug-data sem notar mikið skjápláss
- pillur/segmented controls fyrir show/hide val
- no nested card feel
- no horizontal overflow
- texti í controls minnst 16px ef um input er að ræða; provider pillur mega vera minni en þurfa touch-friendly target

Það má vera mjög einfalt:

```text
[Veðurstofan] [Vegagerðin]
```

Virk pilla:

- primary/dark eða subtle green
- `aria-pressed=true`

Óvirk pilla:

- border + muted text
- `aria-pressed=false`

Disabled/unavailable:

- muted
- `disabled`
- má sýna litla hjálparsetningu ef engin gögn eru til, en ekki taka mikið pláss

## Suggested implementation path

### Phase A — provider pill state in overview shell

1. Add visibility state in `WeatherOverviewClient`:
   - `showVedurstofanLayer`, default `true`
   - `showVegagerdinLayer`, default `true`
2. Set `canToggle: true`, `isVisible` based on provider availability + user toggle.
3. Pass `onToggle` callbacks.
4. In `WeatherOverviewShell`, replace provider status strip with provider filter pills.
5. If a provider is toggled off while selected, clear selected marker and URL.
6. Keep provider unavailable handling but present it quietly.

### Phase B — remove Veðurstofan status/list UI

1. Remove `filter` state and `Filter` type from `WeatherOverviewClient` unless still needed internally.
2. Set all Veðurstofu markers `visible: true` when layer is visible.
3. Remove summary strip.
4. Remove status filter tabs.
5. Remove station list.
6. Keep `StationDetail`.
7. Simplify `StationDetail` context line if it is only freshness/debug status.

### Phase C — Vegagerðin visible + selected preview

1. Ensure `vegagerdinLayer` contributes to `mapLayers` when data is `ok`.
2. Ensure Vegagerðin markers can be selected from the map.
3. Ensure selected Vegagerðin station card opens below map.
4. Keep measurements clearly labelled as current measurements, not forecasts.
5. Keep nearby Veðurstofan forecast context on full Vegagerðin pulse page, not necessarily in compact marker preview unless it is already tidy.

### Phase D — move conditions feed ownership

1. Move overview `ConditionsFeedPreview` out of `vedurstofanProvider.renderPreMap`.
2. Attach it to Vegagerðin provider or a shell-level global slot that is explicitly Vegagerðin/conditions-owned.
3. Keep `emptyBehavior="hide"` so no empty public block appears when there are no messages.
4. Keep polling/new-since-open logic.
5. Ensure feed target click selects `provider=vegagerdin&stationId=...` on the map.
6. Ensure `targetHref` uses `vegagerdinPulseHref()` for Vegagerðin items.

### Phase E — provider-aware chat access hardening

1. Refactor `checkChatAccess()` or add provider-aware companion.
2. Update:
   - `app/auth-mvp/vedrid/puls/vegagerdin/stod/[stationId]/page.tsx`
   - `app/api/auth-mvp/vedurpuls/thread/route.ts`
   - `app/api/auth-mvp/vedurpuls/messages/route.ts`
   - `app/api/auth-mvp/vedurpuls/feed/route.ts`
   - `app/api/auth-mvp/vedurpuls/read/route.ts`
   - `app/api/auth-mvp/vedurpuls/report/route.ts`
   - `app/api/auth-mvp/vedurpuls/access/route.ts`, if it remains generic
3. Update tests in `lib/__tests__/chat-access.test.ts` and relevant API tests.
4. Do not weaken Supabase/RLS.

### Phase F — tests and handoff

Run:

```bash
npm run type-check
npm run test:run -- lib/__tests__/chat-access.test.ts lib/__tests__/vedurpuls-api.test.ts lib/__tests__/vedurpuls-feed.test.ts lib/__tests__/weather-conditions-feed-preview-api.test.ts lib/__tests__/weather-vegagerdin-current-api.test.ts lib/__tests__/overviewSelectionUrl.test.ts lib/__tests__/pulseTarget.test.ts
```

If component tests do not exist for `WeatherOverviewShell`, add focused unit tests where practical. If not practical in this step, document the gap and rely on localhost visual checks.

## Acceptance criteria

On `/vedrid` and `/auth-mvp/vedrid`:

- The top provider row is now filter pills, not status dots.
- Veðurstofan pill toggles Veðurstofu markers.
- Vegagerðin pill toggles Vegagerðin markers.
- If Vegagerðin current cache has stations, Vegagerðarpunktar appear on the map.
- The old Veðurstofan status summary strip is gone.
- The old Veðurstofan status filter tabs are gone.
- The old full Veðurstofan station list under the map is gone.
- Selecting a Veðurstofu marker still opens a selected-station card.
- Selecting a Vegagerðin marker opens a selected-station card with current measurements.
- Vegagerðin selected-station card includes `WeatherPulseInline provider="vegagerdin"` and a link to full pulse page.
- Global conditions feed appears if there are Vegagerðin messages and hides cleanly if empty.
- Global conditions feed is not dependent on Veðurstofan being visible or available, unless intentionally tied to Vegagerðin visibility.
- Public user can see public preview messages.
- Signed-in user can open full Vegagerðin pulse and post if chat/provider access allows it.
- No deploy, no SQL execution, no Vercel/env changes.

## Localhost checks for Stebbi

Before testing UI, confirm whether Vegagerðin cache exists:

1. Open `http://localhost:3004/api/teskeid/weather/vegagerdin/current`.
2. Expected if warmed: JSON with `status: "ok"` and `stations.length > 0`.
3. Expected if not warmed: `status: "unavailable"` and no Vegagerðarpunktar on the map. That is data-state, not necessarily UI failure.

Then test overview:

1. Open `http://localhost:3004/vedrid` as public.
2. Confirm provider controls are pill filters for `Veðurstofan` and `Vegagerðin`.
3. Toggle `Veðurstofan` off/on and confirm only Veðurstofu markers hide/show.
4. Toggle `Vegagerðin` off/on and confirm only Vegagerðarpunktar hide/show.
5. Confirm the old Veðurstofu status strip and bottom station list are gone.
6. Click a Veðurstofu marker and confirm selected card still opens and closes.
7. Click a Vegagerðin marker and confirm current-measurement card opens and closes.
8. If no Vegagerðin messages exist, confirm global conditions feed is hidden and not showing an empty public block.
9. If Vegagerðin messages exist, confirm `Fréttir af aðstæðum frá notendum Teskeiðarinnar` appears and station names/links select/open the correct Vegagerðin station.

Signed-in checks:

1. Open `http://localhost:3004/auth-mvp/vedrid`.
2. Repeat provider filter and marker-selection checks.
3. Open full Vegagerðin pulse from a selected station card.
4. Confirm returnTo works back to the same overview station selection.
5. If `TESKEID_CHAT_ENABLED=true` and SQL 81 has been applied in the local DB, confirm sending a Vegagerðin pulse message works.
6. If SQL 81 has not been applied, do not treat write failure as UI failure; document it clearly in handoff.

Do not test production, Vercel env, SQL migrations, or cron warm in this step unless Stebbi explicitly approves.

## Risks / things to watch

- If `ConditionsFeedPreview` stays under `vedurstofanProvider.renderPreMap`, the feed can disappear when Veðurstofan is restricted/off even though the feed is now Vegagerðin-based.
- If `checkChatAccess()` remains Veðurstofan-specific, Vegagerðarpúls can be incorrectly blocked when Veðurstofan provider gate is on.
- If provider toggle state hides a selected marker without clearing URL, reload/back can reopen stale or invisible selection.
- If no Vegagerðin cache exists, map cannot show Vegagerðarpunkta. Do not solve that with UI hacks.
- If SQL 81 is not applied, full Vegagerðin pulse thread creation/write will fail at DB constraint. UI should fail gracefully and handoff must say whether SQL was merely required or actually run.

## Files likely touched

- `components/weather/WeatherOverviewClient.tsx`
- `components/weather/WeatherOverviewShell.tsx`
- `components/weather/IcelandOverviewMap.tsx` only if toggle/refit behavior needs adjustment
- `components/weather/WeatherPulseInline.tsx` only if returnTo/provider behavior needs cleanup
- `lib/chat/access.server.ts`
- `lib/chat/api.server.ts` if access result names/target helpers change
- `app/auth-mvp/vedrid/puls/vegagerdin/stod/[stationId]/page.tsx`
- `app/api/auth-mvp/vedurpuls/thread/route.ts`
- `app/api/auth-mvp/vedurpuls/messages/route.ts`
- `app/api/auth-mvp/vedurpuls/feed/route.ts`
- `app/api/auth-mvp/vedurpuls/read/route.ts`
- `app/api/auth-mvp/vedurpuls/report/route.ts`
- `app/api/auth-mvp/vedurpuls/access/route.ts`
- `messages/is.json`
- `messages/en.json`
- relevant tests under `lib/__tests__/`

## Notes from Codex review

Read-only context gathered:

- `WORKFLOW.md`
- `ai-handoff/README.md`
- `Design.md`
- `components/weather/WeatherOverviewClient.tsx`
- `components/weather/WeatherOverviewShell.tsx`
- `components/weather/IcelandOverviewMap.tsx`
- `components/weather/WeatherPulseInline.tsx`
- `components/weather/ConditionsFeedPreview.tsx`
- `components/weather/ProviderStationPreviewCard.tsx`
- `lib/weather/pulseTarget.ts`
- `lib/weather/useConditionsFeedPreview.ts`
- `lib/weather/useFeedLoader.ts`
- `lib/chat/access.server.ts`
- `app/api/teskeid/weather/vegagerdin/current/route.ts`
- `app/api/teskeid/weather/vedurpuls/feed-preview/route.ts`
- relevant Vegagerðin pulse page/API files

Commands run by Codex:

- read-only file inspection via `Get-Content`
- `rg` searches
- `git status --short`

No tests were run for this handoff. No product code, SQL, env, commit, push, deploy, or production changes were made by Codex.

## Óvissa / þarf að staðfesta

- Whether SQL 80/81 have been run locally/production affects whether Vegagerðin provider access and Vegagerðin pulse writes can work. This handoff does not authorize running them.
- If Stebbi wants global conditions feed to show an empty prompt even when no Vegagerðin messages exist, that is a product decision. Based on earlier feedback, default should remain hidden when empty on public overview.
- Marker colors are still freshness/status-coded. This handoff removes visible debug/status UI under the map, but does not require changing marker tones unless Stebbi asks specifically.
