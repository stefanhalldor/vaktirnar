# Codex review — v440 + next big step for conditions feed

Created: 2026-07-17 16:36  
Timezone: Atlantic/Reykjavik  
TODO: 086  
Source reviewed: `2026-07-17-1630-todo-086-v440-claude-b4d-vegagerdin-adapter-hardening.md`

## Stutt samantekt

v440 lítur vel út tæknilega: fyrri B4D findings voru tekin, Vegagerðin er áfram cache-only, access-contract er betri, DTO-mapping komin inn, user-facing texti færður í messages og targeted tests eru græn.

Næsta stóra skref ætti samt ekki að vera Vegagerðin live-fetch strax. Það ætti að vera:

**B4E/B4F: Samnýtt “Fréttir af aðstæðum” feed fyrir Veðurpúls/conditions, public preview og clickable stöðvar.**

Ástæðan: núverandi “Safnpúls” á overview notar auth endpoint, hverfur hjá public þegar skúffan opnast, og UI-ið er enn of mikið “feed dump” frekar en skýr Teskeið-yfirsýn. Þetta er gott tækifæri til að gera reusable conditions-feed grunninn almennilega áður en Vegagerðin bætist við sem næsti provider.

## Findings

### 1. Medium: Overview “Safnpúls” hverfur hjá public vegna auth endpoint

Í [components/weather/WeatherOverviewClient.tsx](../components/weather/WeatherOverviewClient.tsx:395) sækir `WeatherPulseFeed`:

```ts
/api/auth-mvp/vedurpuls/feed?limit=50
```

Sá endpoint er með auth/chat-access gate í [app/api/auth-mvp/vedurpuls/feed/route.ts](../app/api/auth-mvp/vedurpuls/feed/route.ts:18), og skilar 401/403/503 þegar public notandi reynir að opna feedið. Componentinn setur þá `accessDenied=true` og returnar `null` ([WeatherOverviewClient.tsx](../components/weather/WeatherOverviewClient.tsx:397)).

Áhrif:

- Public notandi sér feed/skúffu fyrst, smellir, og þá hverfur hún.
- Þetta er nákvæmlega gagnstætt markmiðinu: public má sjá preview, en þarf innskráningu til að skrifa eða opna fullan púls.

Tillaga:

- Ekki nota auth endpoint fyrir public preview.
- Búa til public-safe preview endpoint fyrir “latest conditions from stations”, t.d.:
  - `GET /api/teskeid/weather/vedurpuls/feed-preview?limitStations=10`
  - eða provider-neutral path ef við viljum hugsa lengra: `/api/teskeid/chat/public-preview?domain=weather&targetType=vedurstofan_station`
- Endpoint má aðeins lesa visible, non-deleted, non-hidden messages og skila public-safe DTO.
- Full feed/pagination og write actions mega áfram vera auth-gated.

### 2. Medium/UX: Nafnið “Safnpúls” er orðið of innanhússlegt fyrir notanda

Í [messages/is.json](../messages/is.json:985) stendur:

```json
"feedTitle": "Safnpúls"
```

Stebbi vill breyta þessu í eitthvað skýrara, t.d.:

**“Fréttir af aðstæðum frá notendum Teskeið.is”**

Ég er sammála. “Safnpúls” má vera internal/architecture heiti, en í viðmóti segir nýi textinn betur hvað notandi fær.

Tillaga:

- Nota `conditionsFeedTitle` eða sambærilegt message key.
- Setja íslenskt: `Fréttir af aðstæðum frá notendum Teskeið.is`
- Enskt: `Condition reports from Teskeið.is users`
- Ekki hardcode-a textann í component.

### 3. Medium/UX: Feedið á að sýna nýjustu frétt frá hverri stöð, ekki langan message-lista

Núverandi `WeatherPulseFeed` birtir plain `messages.map(...)` úr global feedinu ([WeatherOverviewClient.tsx](../components/weather/WeatherOverviewClient.tsx:443)). Það getur sýnt mörg skilaboð frá sömu stöð og gefur ekki góða yfirsýn.

Ósk Stebba:

- Sýna **nýjustu frétt frá hverri stöð**.
- Raða stöðvum þannig að stöðin með nýjustu fréttina sé efst.
- Stöðvaheiti sé meira áberandi.
- Stöðvaheiti sé clickable og opni stöðina eins og þegar hún er opnuð af korti.

Tillaga:

- Repository/API skili station-grouped DTO:

```ts
type ConditionsFeedStationPreviewDto = {
  stationId: string
  stationName: string
  latestMessage: MessageDto
  latestAt: string
}
```

- Query strategy:
  - Lesa `teskeid_chat_threads` fyrir `domain='weather'`, `target_type='vedurstofan_station'`, `message_count > 0`, `last_message_at not null`, ordered by `last_message_at desc`, limit N.
  - Fyrir þau N threads, sækja nýjasta visible message per thread.
  - Sleppa thread ef nýjasta skilaboð eru deleted/hidden og engin visible skilaboð finnast.
  - Skila stöðvum sorted by actual latest visible message timestamp desc.

Þetta er mun ódýrara og skýrara en að sækja 50 raw messages og group-a á client.

### 4. Medium/Architecture: Þetta þarf að verða reusable conditions-feed component, ekki þriðja sérlausnin

Við erum nú með:

- `WeatherPulseFeed` í overview.
- `VedurstofanRoutePulseSummary` á ferðaleið.
- `VedurstofanPulseInline` á einstökum spjöldum/stöðvum.
- `ScopedChatPanel`/chat-core sem undirliggjandi chat grunn.

Næsta skref má ekki búa til enn eina sérlausn. Það á að extract-a reusable read-only preview component, t.d.:

```tsx
<ConditionsFeedPreview
  title={...}
  items={...}
  emptyBehavior="hide" | "message"
  stationClickMode="select-marker" | "link"
  onSelectStation={...}
  fullPulseHrefForStation={...}
/>
```

Notkun:

- Overview `/vedrid`: public preview, newest station first, station click selects marker (`ctx.onSelectMarker(stationId)`).
- Route summary `/vedrid/ferdalagid`: scoped preview for stations on selected route, either newest-first per latest note or `sortMode="route"` if we consciously preserve route order.
- Station cards: keep `VedurstofanPulseInline` for per-station compose/write, but reuse row/list styling and message DTO rendering where possible.

Design.md styður þetta: við eigum að endurnýta components, halda mobile-first layout, nota skýr textastig og forðast “kort inni í kortum” eða óþarfa feed dump.

### 5. Low/UX backlog: Stöðvalistinn undir kortinu er lame í einni röð

Stebbi vill setja aftast í listann að endurskoða stöðvalistann undir kortinu. Ég er sammála, en myndi ekki blanda því inn í B4E ef markmiðið er hraði.

Backlog / deferred:

- Endurskoða station list undir overview korti.
- Ekki sýna allar stöðvar sem flat row/list án hierarchy.
- Skoða grouped list, bottom sheet, filter drawer, virtualized list eða “selected/nearby/recent” UI.
- Þetta þarf að taka með provider-neutral linsunni því Vegagerðin mun bæta fleiri punktum við.

## Staðfestingar sem ég keyrði

- `npm run type-check`  
  Niðurstaða: clean, exit code 0.

- `npm run test:run -- lib/__tests__/weather-vegagerdin-current-api.test.ts lib/__tests__/weather-vegagerdin-current.test.ts lib/__tests__/middleware.test.ts lib/__tests__/guard.test.ts lib/__tests__/feature-access-api.test.ts lib/__tests__/sql-migration.test.ts lib/__tests__/vedurpuls-feed.test.ts lib/__tests__/chat-repository.test.ts`  
  Niðurstaða: 8 files passed, 517 tests passed, exit code 0.

Ég keyrði ekki fulla test suite og ekki localhost/browserpróf.

## Næsta stóra framkvæmdaskref fyrir Claude Code

### B4E/B4F — Public conditions feed + reusable preview component

Markmið:

Laga public disappearance bug, endurnefna “Safnpúls”, gera feedið skýrara, og búa til reusable preview component sem nýtist bæði overview, route summary og síðar Vegagerðarpunktum.

#### 1. Public-safe feed preview endpoint

Búa til nýjan public read-only endpoint, ekki breyta auth full-feed endpointinum í public nema það sé meðvitað product decision.

Mælt:

```text
GET /api/teskeid/weather/vedurpuls/feed-preview?limitStations=10
```

Contract:

- Engin auth krafa.
- Engin thread creation.
- Engin write action.
- Engin email/user_id/private metadata í response.
- Skilar max N stöðvum.
- Hver stöð skilar aðeins nýjustu visible skilaboðum.
- Raðað newest station first.

DTO:

```ts
type ConditionsFeedStationPreviewDto = {
  stationId: string
  stationName: string
  latestMessage: MessageDto
  latestAt: string
}
```

Öryggi:

- Nota service role eingöngu server-side.
- Lesa aðeins `domain='weather'` og `target_type='vedurstofan_station'`.
- Skila aðeins `MessageDto` public fields sem eru þegar sanitized með fornafni.

#### 2. Repository helper fyrir latest-per-station

Bæta við helper í chat repository, t.d.:

```ts
getLatestStationConditionPreviews(limitStations: number): Promise<ConditionsFeedStationPreviewDto[]>
```

Hann á ekki að lesa allar stöðvar og öll skilaboð.

Recommended approach:

- Query `teskeid_chat_threads` með:
  - `domain='weather'`
  - `target_type='vedurstofan_station'`
  - `last_message_at not null`
  - order `last_message_at desc`
  - limit aðeins meira en N ef hidden/deleted gætu þurft fallback, t.d. `N * 2`.
- Fyrir thread candidates, sækja nýjustu visible skilaboð.
- Skila max N stöðvum með visible latest message.

#### 3. Reusable component

Extract-a component, t.d.:

```tsx
components/weather/ConditionsFeedPreview.tsx
```

Props:

```ts
type ConditionsFeedPreviewProps = {
  title: string
  items: ConditionsFeedStationPreviewDto[]
  loading?: boolean
  emptyLabel?: string
  emptyBehavior?: 'hide' | 'message'
  onSelectStation?: (stationId: string) => void
  stationHref?: (stationId: string) => string
  viewMoreLabel?: string
}
```

Behavior:

- Ef public overview og engar fréttir: helst fela component eða sýna mjög létt empty state eftir samhengi.
- Station name is prominent.
- Station name is clickable:
  - overview: `onSelectStation(stationId)` opnar marker/detail.
  - route/full contexts: `stationHref` fer á pulse station URL ef það er réttara.
- Ekki nota texta sem placeholder fyrir action sem virkar ekki.
- Mobile-first, enginn horizontal overflow.

#### 4. Replace `WeatherPulseFeed`

Í `WeatherOverviewClient.tsx`:

- Skipta út núverandi `WeatherPulseFeed` sem notar `/api/auth-mvp/vedurpuls/feed`.
- Nota nýja public preview endpoint.
- Titill: `Fréttir af aðstæðum frá notendum Teskeið.is`.
- Opnun skúffu má ekki fela component fyrir public.
- Public users mega sjá preview.
- Full pulse/write þarf áfram auth.

#### 5. Route-scoped component samræming

`VedurstofanRoutePulseSummary` á að nýta sama preview/list-row component.

Product decision:

- Fyrir overview: newest station first.
- Fyrir route summary: Stebbi bað nú sérstaklega um newest station first í þessari feed framsetningu. Ef Claude Code telur route-order enn betra í route-specific samhengi, stoppa og flagga sem product-spurningu. Ekki gera ósýnilegt “best of both worlds” án skýrs prop.

Mælt:

- `sortMode="latest"` fyrir nýja conditions drawer.
- Ef þörf er síðar: `sortMode="route"` fyrir leiðarsamhengi.

#### 6. Messages

Uppfæra `messages/is.json` og `messages/en.json`.

IS tillögur:

- `conditionsFeedTitle`: `Fréttir af aðstæðum frá notendum Teskeið.is`
- `conditionsFeedEmpty`: `Engar fréttir af aðstæðum ennþá.`
- `conditionsFeedOpenStation`: `Opna stöð`
- `conditionsFeedViewMore`: `Sjá fleiri skilaboð eða segja frá aðstæðum`

EN:

- Natural equivalents, not raw Icelandic brand copy unless intended.

#### 7. Tests

Bæta við / uppfæra tests:

- Public preview endpoint:
  - 200 signed-out.
  - Skilar max N stations.
  - One latest visible message per station.
  - Newest station first.
  - Does not expose `user_id`, email, hidden/deleted body, private metadata.
  - Handles empty state.
- `WeatherPulseFeed`/component behavior if existing component tests are feasible:
  - 401 from auth endpoint should no longer matter because overview uses public preview endpoint.
- Keep existing `vedurpuls-feed.test.ts` for auth full feed unchanged.

#### 8. Deferred item: station list under map

Bæta við handoff/backlog kafla, ekki framkvæma strax nema enn sé tími:

> Endurskoða stöðvalistann undir overview korti. Núverandi flat list/row verður veik þegar Veðurstofan + Vegagerðin + fleiri providers koma inn. Hanna provider-neutral list/drawer með skýrri hierarchy, filters og selected station context.

## Ekki gera í þessu skrefi

- Ekki keyra SQL/migration.
- Ekki breyta RLS.
- Ekki keyra live Vegagerðin fetch.
- Ekki tengja Vegagerðina inn í trip risk.
- Ekki commit-a, push-a eða deploy-a.
- Ekki gera stóra endurhönnun á öllum overview skjánum utan conditions feed, nema hún sé nauðsynleg til að laga public bugið.

## Localhost checks for Stebbi

1. Public overview:
   - Opna `/vedrid` sem óinnskráður.
   - Opna “Fréttir af aðstæðum frá notendum Teskeið.is”.
   - Expected: component hverfur ekki.
   - Expected: nýjasta frétt frá hverri stöð sést, newest station first.
   - Expected: enginn compose box fyrir public í preview.

2. Public station click:
   - Smella á stöðvaheiti í feedinu.
   - Expected: stöðin opnast á kortinu/detail eins og þegar marker er valinn.
   - URL má uppfærast með `stationId` ef shell notar það nú þegar.

3. Auth overview:
   - Opna `/auth-mvp/vedrid`.
   - Expected: sama preview hegðun.
   - Ef opnað er fullan pulse/write flow, þá má innskráður notandi skrifa áfram.

4. Empty state:
   - Prófa með engum skilaboðum eða mock/fixture sem skilar `[]`.
   - Expected: annaðhvort falinn component eða mjög létt empty state, ekki brotin skúffa.

5. Mobile:
   - Prófa 360/390/460 px.
   - Station name, timestamp og body mega ekki overflow-a.
   - Touch targets fyrir stöðvaheiti/opna station þurfa að vera auðsmellanleg.

6. Regression:
   - Per-station `VedurstofanPulseInline` á Veðurstofuspjöldum virkar áfram.
   - Route-scoped route preview virkar áfram og sýnir ekki duplicate/óskýra stöðvaskilaboð.
   - Vegagerðin provider strip/cache-empty breytingar úr v440 haldast óbreyttar.

## Óvissa / þarf að staðfesta

1. Fyrir route-scoped feed: á röðun að vera newest-first alls staðar eða route-order þegar feedið er inni í ferðaleið? Síðasta ósk Stebba bendir á newest-first, en route-order hefur líka product-rök. Ég myndi byrja á newest-first fyrir nýja drawerinn, en hafa `sortMode` prop svo þetta verði ekki fastmótað.

2. Full pulse URL frá public overview: á “Sjá fleiri skilaboð eða segja frá aðstæðum” að fara beint í `/auth-mvp/vedrid/puls/stod/[stationId]` með `returnTo=/vedrid?stationId=...`? Það virðist samræmast núverandi returnTo-módeli.

3. Ef feedið verður public, þarf að ákveða hvort author first-name sé alltaf í lagi í public preview. Núverandi chat DTO notar fornafn og engin email/user_id, sem virðist vera samþykkt mynstur, en þetta er rétt að staðfesta áður en fleiri contextar nota sama component.
