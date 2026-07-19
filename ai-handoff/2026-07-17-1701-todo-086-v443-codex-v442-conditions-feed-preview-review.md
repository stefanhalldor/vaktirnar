# 2026-07-17 17:01 - TODO-086 v443 - Codex review of v442 conditions feed preview

Created: 2026-07-17 17:01
Timezone: Atlantic/Reykjavik
Review target: `2026-07-17-1656-todo-086-v442-claude-b4e-b4f-conditions-feed-preview.md`

## Stutt niðurstaða

v442 er í rétta átt: public conditions feed notar nú sér endpoint, endurnýtanlegan `ConditionsFeedPreview` component og sama `ChatMessageRow` grunn og spjallið/púlsinn. Það er nákvæmlega rétta abstraction-stefnan.

Ég myndi samt ekki senda þetta óbreytt í næsta stóra skref fyrr en #1 er lagað, því public "Sjá fleiri skilaboð eða segja frá aðstæðum" linkurinn bendir á route sem er ekki til.

## Findings

1. **Medium: Public overview "Sjá fleiri..." linkur bendir á route sem er ekki til**

   [WeatherOverviewClient.tsx](../components/weather/WeatherOverviewClient.tsx) smíðar full pulse link út frá `stationPulseReturnBase`:

   - `stationHref` notar `${stationPulseReturnBase}/puls/stod/${id}` í `components/weather/WeatherOverviewClient.tsx:171-172`
   - public `/vedrid` sendir `stationPulseReturnBase="/vedrid"` í `app/vedrid/page.tsx:19-23`
   - repo hefur ekki `app/vedrid/puls/stod/[stationId]/page.tsx`; aðeins `app/auth-mvp/vedrid/puls/stod/[stationId]/page.tsx`

   Afleiðing: public notandi á `/vedrid` sér feedið, smellir á "Sjá fleiri skilaboð eða segja frá aðstæðum" og fer líklega á 404 eða ranga leið í stað þess að fara í innskráningu/fullan púls.

   Fix: ekki nota `stationPulseReturnBase` sem full-pulse route base. Bæta frekar við sér prop/utility fyrir fullan pulse URL sem bendir alltaf á auth route:

   ```ts
   /auth-mvp/vedrid/puls/stod/${id}?returnTo=${encodeURIComponent(`${stationPulseReturnBase}?stationId=${id}`)}
   ```

   Þannig public notandi lendir í login/fullum púlsi og `returnTo` heldur áfram að varðveita upphaflega public overview contextið. Bæta test/coverage fyrir public overview href ef hægt er.

2. **Medium: Public feed-preview endpoint fylgir ekki sama weather/provider access-contract og provider endpoints**

   Nýi endpointið `app/api/teskeid/weather/vedurpuls/feed-preview/route.ts:8-20` athugar bara `AUTH_MVP_ENABLED`. Til samanburðar athuga provider endpoints:

   - Veðurstofan stations: `getWeatherEnabledMode()`, `WEATHER_ELTA_VEDRID_FLAG`, og `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED` í `app/api/teskeid/weather/vedurstofan/stations/route.ts:11-34`
   - Vegagerðin current: `getWeatherEnabledMode()` og `WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED` í `app/api/teskeid/weather/vegagerdin/current/route.ts:9-35`

   Ef product decision er að "fréttir frá notendum" séu public óháð provider visibility, þá er þetta í lagi en þarf að vera skráð og testað sem meðvituð regla. Ef conditions feed á að fylgja veður-/provider-opnun, þarf endpointið að nota sama access helper contract og veðurlagið sem það birtist með.

   Ég myndi mæla með einni af tveimur skýrum leiðum:

   - **Product-public feed:** endpoint er public ef `WEATHER_ENABLED=All` og `AUTH_MVP_ENABLED=true`, óháð provider flaggi. Skrá það í comment/test.
   - **Provider-bound feed:** endpoint fylgir Veðurstofan provider gate á meðan target type er `vedurstofan_station`.

   Ekki skilja þetta eftir sem óskráða tilviljun.

3. **Low/Medium: Global feed getur skilað færri stöðvum en limit segir ef nýlegir threads hafa engin visible skilaboð**

   `getLatestStationConditionPreviews()` sækir `limitStations * 2` thread candidates í `lib/chat/repository.server.ts:463-478`, sækir svo eitt visible message per thread og sker niður í `limitStations` í `lib/chat/repository.server.ts:494-497`.

   Þetta er skynsamlegt sem fyrsta skref, en ef margar nýlegar stöðvar eru með deleted/hidden-only messages getur feedið orðið óþarflega tómt þótt eldri valid stöðvar séu til. Þar sem endpointið er public og read-only er betra að gera þetta determinískara áður en feedið verður stórt product-surface:

   - annaðhvort overfetcha meira, t.d. `Math.max(limitStations * 5, 50)` með max cap
   - eða byggja query sem sækir latest visible messages beint

   Ekki blocker fyrir v442 ef moderering/deletion er sjaldgæf, en gott að laga áður en við treystum þessu sem "landspúls".

4. **Low: Route summary notar nýjan component, en er enn hálfpartinn gamla route-preview útfærslan**

   `VedurstofanRoutePulseSummary.tsx` notar nú `ConditionsFeedPreview`, sem er gott. En componentinn:

   - kallar enn `route-preview` með `limitPerStation: 3` í `components/weather/VedurstofanRoutePulseSummary.tsx:66-70`
   - notar svo bara nýjustu skilaboðin í `components/weather/VedurstofanRoutePulseSummary.tsx:96-109`
   - heldur enn `safnpulsRouteTitle`/`safnpulsRouteSummaryStations` keys í `messages/is.json:979-980`
   - commentar tala enn um "Safnpúls" í `components/weather/VedurstofanRoutePulseSummary.tsx:31-36`

   Þetta er ekki functional bug, en það er tækniskuld akkúrat á því svæði sem Stebbi hefur verið að biðja okkur að passa: reusable chat core og samræmdur conditions feed. Laga í næsta cleanup:

   - route-summary kalli `limitPerStation: 1` ef aðeins eitt skilaboð á að birtast
   - rename-a UI/translation keys úr `safnpuls*` yfir í `conditionsFeed*` eða route-specific `routeConditions*`
   - halda `ConditionsFeedPreview` sem eini rendering-kjarninn

5. **Low/i18n: Loading text í `ConditionsFeedPreview` er hardcoded `...`**

   `components/weather/ConditionsFeedPreview.tsx:58-61` birtir `...` þegar loading er true. Þetta er smátt, en samkvæmt `Design.md` og project-reglum eiga notendatextar að vera í `messages/is.json`/`messages/en.json`. Ef loading state á að vera sýnilegur, láta caller senda `loadingLabel` eða nota skeleton án texta.

## Staðfest sem gott

- `ConditionsFeedPreview` endurnýtir `ChatMessageRow`, þannig timestamp/author/redaction/kind labels koma úr sama chat-grunni.
- Public feed endpoint lekur ekki `userId` eða email í DTO samkvæmt testum og `MessageDto` contract.
- Middleware opnar nýja endpointið exact-match, ekki með breiðum prefix.
- Overview buggið þar sem public feed hvarf vegna auth endpoint virðist leyst: `WeatherOverviewClient` sækir nú `/api/teskeid/weather/vedurpuls/feed-preview`.
- Route summary felur tómt feed og sýnir nýjustu frétt per stöð í stað langrar station-by-station romsu.

## Commands run

```bash
npm run type-check
# exit 0

npm run test:run -- lib/__tests__/weather-conditions-feed-preview-api.test.ts lib/__tests__/chat-repository.test.ts lib/__tests__/weather-vegagerdin-current-api.test.ts lib/__tests__/middleware.test.ts lib/__tests__/vedurpuls-feed.test.ts
# exit 0
# 5 files, 123 tests passed
```

Ég keyrði ekki localhost/browserpróf og ekki fulla test suite.

## Design.md check

Ég skoðaði viðeigandi kafla í `Design.md`:

- mobile-first og stable layout
- textastig: metadata `text-xs`, card title `text-sm/base`
- no unnecessary nested cards
- user text in messages
- navigation/loading feedback

`ConditionsFeedPreview` er að mestu í takt við þetta: compact card/panel, `text-xs` fyrir skilaboð, `text-sm` station title og endurnýtanlegur chat row. Það sem stendur út af er hardcoded loading `...` og að linkur notar plain `<a href>` sem veldur full navigation. Það getur verið í lagi, en ef þetta verður mikilvæg in-app navigation ætti að nota `Link` eða setja pending state í samræmi við Design.md.

## Recommended next step for Claude Code

Claude Code ætti að taka v443 sem afmarkað hardening-step áður en haldið er í næsta stóra Vegagerðin/provider-neutral áfanga:

1. Laga public full-pulse href í `WeatherOverviewClient`:
   - Public overview á `/vedrid` má ekki smíða `/vedrid/puls/stod/...`
   - Fullur púls á alltaf að fara í `/auth-mvp/vedrid/puls/stod/...`
   - `returnTo` á að vera public eða auth overview URL sem notandinn kom frá, t.d. `/vedrid?stationId=32097`
2. Taka með test eða að minnsta kosti unit helper fyrir href-regluna.
3. Taka afstöðu til feed-preview access contract:
   - public weather-only, eða provider-bound
   - skrifa comment og tests sem staðfesta ákvörðunina
4. Smá cleanup:
   - route summary `limitPerStation: 1` ef aðeins nýjasta er birt
   - rename-a `safnpulsRoute*` keys/commenta yfir í route conditions wording
   - loading text í component úr hardcoded `...`
5. Að því loknu má halda áfram í stærra skref:
   - provider-neutral conditions feed sem getur síðar tekið Vegagerðin target types
   - station-list UX undir kortinu
   - Vegagerðin map/detail integration

## Localhost checks for Stebbi

Eftir að Claude Code lagar v443 finding #1:

1. Opna `/vedrid` sem óinnskráður notandi.
2. Staðfesta að "Fréttir af aðstæðum frá notendum Teskeið.is" birtist ef gögn eru til.
3. Smella á stöðvarheiti í feedinu.
   - Vænt: stöðin opnast/velst á kortinu og URL fær `?stationId=...`.
4. Smella á "Sjá fleiri skilaboð eða segja frá aðstæðum".
   - Vænt: óinnskráður notandi fer í auth/full-pulse flæði, ekki 404.
   - Eftir innskráningu á notandi að lenda á fullum púlsi fyrir rétta stöð.
   - "Til baka" eða return action á að fara aftur á `/vedrid?stationId=...`.
5. Prófa sama sem innskráður á `/auth-mvp/vedrid`.
   - Vænt: linkur fer beint í `/auth-mvp/vedrid/puls/stod/...` og returnTo heldur station context.
6. Prófa route result í ferðaveðri með nokkrum Veðurstofustöðvum.
   - Vænt: route conditions drawer sýnir nýjustu frétt per stöð og "Sjá fleiri skilaboð" virkar.
7. Prófa empty DB/empty feed ef hægt er á localhost án production gagna.
   - Vænt: public overview feedið er falið, ekki tómt/klaufalegt box.

Ekki prófa með production SQL eða eyða production chat-gögnum án sérstakrar samþykktar.

## Óvissa / þarf að staðfesta

- Product decision: á public conditions feed endpoint að vera public þegar `WEATHER_ENABLED=All`, eða á hann líka að fylgja provider-specific gate fyrir Veðurstofuna?
- Ég staðfesti ekki í browser hvort `/vedrid/puls/stod/...` skilar 404, en skráartréið sýnir enga slíka route og aðeins auth route er til.
- Ég skoðaði ekki fulla test suite, aðeins targeted tests sem tengjast þessari breytingu.
