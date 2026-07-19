# Codex review: v425 B3B hardening prerelease

Created: 2026-07-17 13:20  
Timezone: Atlantic/Reykjavik  
Source handoff: `2026-07-17-1315-todo-086-v425-claude-b3b-hardening-prerelease`

## Stutt mannamál

v425 virðist laga aðalatriðin úr síðustu rýni: `/vedrid` getur nú verið yfirlitsskjár fyrir public notendur, `/auth-mvp/vedrid` notar sama reusable overview client fyrir innskráða, og gamla `/auth-mvp/vedrid/elta-vedrid` er orðið legacy/compat leið sem vísar í sama kjarna. Þetta er í rétta átt fyrir stærri myndina: eitt yfirlit, eitt kortalagsskeljamynstur, og ferðaveðrið færist í `/vedrid/ferdalagid`.

Ég myndi ekki stoppa á stóru blocker hér, en ég myndi taka eitt smá hardening atriði með næsta skrefi áður en þetta verður “fullkomlega rólegt” sem public default.

## Findings

1. **Medium: Overview client meðhöndlar ekki `WEATHER_ELTA_VEDRID_FLAG` kill-switch 404 mjúklega**  
   `app/api/teskeid/weather/vedurstofan/stations/route.ts:17` skilar 404 þegar `WEATHER_ELTA_VEDRID_FLAG !== 'true'`. `components/weather/WeatherOverviewClient.tsx:66-88` meðhöndlar 401/403 sem “provider restricted” en öll önnur non-ok svör fara í `loadError`.  
   Þetta er ekki öryggisgat, en ef Vercel env gleymist eða flaggið er tekið niður til að slökkva á stöðvayfirliti mun `/vedrid` sýna error state í stað þess að degradera snyrtilega. Þar sem `/vedrid` er nú public inngangur ætti kill-switch/off-state annaðhvort:
   - sýna public yfirlit án Veðurstofulags með CTA í ferðaveður, eða
   - sýna rólegt “stöðvayfirlit er ekki virkt núna” state, ekki destructive error.

2. **Low/Architecture: `WeatherOverviewClient` er reusable skref, en enn Veðurstofu-specific kjarni undir generic nafni**  
   Þetta er líklega í lagi fyrir B3B, en þegar Vegagerðin kemur inn þarf ekki að tvöfalda þennan skjá. Núverandi component er í `components/weather/WeatherOverviewClient.tsx`, en notar `teskeid.vedrid.eltaVedrid` translations, `VedurstofanPulseInline`, `vedurstofan` layer id og Veðurstofu-specific station data.  
   Næsta stærra skref ætti að extract-a:
   - `WeatherOverviewShell` eða sambærilegan provider-neutral skjá/structure
   - provider layer config fyrir Veðurstofuna
   - reusable selected-station/provider preview contract
   Þá getur Vegagerðin komið inn sem annað layer án þess að skrifa annan samskonar skjá.

3. **Low: Browser/local validation vantar enn áður en þetta er “release confidence high”**  
   TypeScript og targeted tests eru græn, en ég keyrði ekki localhost/browserpróf. Þar þarf sérstaklega að staðfesta mobile, public/auth state, legacy route og returnTo úr púlsinum.

## Staðfest í kóða

- `app/vedrid/page.tsx` notar nú `WeatherOverviewClient` sem public overview og sendir ferðaveður í `/vedrid/ferdalagid`.
- `app/auth-mvp/vedrid/page.tsx` notar sama `WeatherOverviewClient` fyrir innskráða og sendir ferðaveður í `/auth-mvp/vedrid/ferdalagid`.
- `app/auth-mvp/vedrid/elta-vedrid/page.tsx` notar sama component og er þar með compat-leið, ekki sér UI.
- `lib/weather/pulseBack.ts` leyfir nú public `/vedrid` og auth `/auth-mvp/vedrid` sem örugga overview returnTo áfangastaði.
- Station endpointið normalizar product-read niðurstöðu í `Map`, sem lokar v424 `raw.get is not a function` áhættunni.

## Keyrð próf

- `npm run test:run -- lib/__tests__/weather-vedurstofan-station-explorer-api.test.ts lib/__tests__/weather-provider-stations.test.ts lib/__tests__/pulseBack.test.ts`  
  Niðurstaða: 3 files passed, 67 tests passed.
- `npm run type-check`  
  Niðurstaða: exit 0.
- `npm run test:run -- lib/__tests__/loginNext.test.ts lib/__tests__/public-landing.test.ts lib/__tests__/home-page.test.tsx`  
  Niðurstaða: 3 files passed, 121 tests passed. Vitest prentaði `Not implemented: navigation to another Document`, en testin stóðust.

Ég keyrði ekki fulla test suite.

## Design.md / UX rýni

Ég las viðeigandi kafla í `Design.md` um mobile-first layout, navigation feedback, buttons og loading/error states. v425 er að mestu í takt við það:

- mobile-first `max-w-2xl` wrapper og 16px padding
- reusable client component í stað tvítekins route-local UI
- loading state til staðar fyrir station fetch
- CTA er text-sm og primary-ish, án oversized hero-mynsturs

Frávik/athugun: ef endpoint skilar 404 vegna flaggs er error state líklega of harður fyrir public overview. Það tengist Design-reglunni um empty/error states og ætti að mýkja.

## Næsta stærra skref

Ég myndi halda áfram í stærri skrefum, en með þessari röð:

1. **B3B.1 hardening áður en farið er lengra**
   - Láta `WeatherOverviewClient` meðhöndla `404` frá station endpointi sem “layer disabled/unavailable”, ekki destructive `loadError`, eða skilgreina sérstaklega að `WEATHER_ELTA_VEDRID_FLAG` sé hard off sem eigi að fela overview layer.
   - Bæta lágmarksprófi fyrir þetta ef auðvelt er, sérstaklega þar sem public `/vedrid` er nú public entry.

2. **B3C provider-neutral overview shell**
   - Extract-a generic `WeatherOverviewShell`.
   - Halda Veðurstofunni sem fyrsta provider config/layer.
   - Undirbúa Vegagerðina sem næsta provider án þess að setja inn gögnin strax.
   - Tryggja að kort, selected-provider preview, filters, pulse preview og empty/error states séu endurnýtanleg.

3. **B3D routing/product IA**
   - Staðfesta endanlega product routing:
     - `/vedrid` = land/yfirlit sjálfgefið
     - `/vedrid/ferdalagid` = ferðaveður
     - `/auth-mvp/vedrid` = innskráð yfirlit með vistunum þegar við á
     - `/auth-mvp/vedrid/ferdalagid` = innskráð ferðaveður
     - `/auth-mvp/vedrid/elta-vedrid` = legacy/compat redirect eða áfram thin wrapper tímabundið
   - Passa að öll CTA og back/returnTo fylgi þessari mynd.

4. **B4 Vegagerðin**
   - Nýta provider-neutral shell/layer contractið.
   - Ekki bæta Vegagerðinni inn sem sérskjá eða sérkort nema við neyðumst til.

## Suggested prompt for Claude Code

```text
Workflow

Rýndu `ai-handoff/2026-07-17-1320-todo-086-v426-codex-v425-b3b-hardening-review.md`.

Markmið:
1. Taktu fyrst afstöðu til `WEATHER_ELTA_VEDRID_FLAG`/404 hegðunar í public `/vedrid` overview. Ef station endpoint er slökkt eða flag vantar á overview ekki að sýna harðan/destructive error. Það á annaðhvort að degradera snyrtilega yfir í public ferðaveður-CTA án Veðurstofulags eða sýna rólegt “stöðvayfirlit ekki virkt” state.
2. Ef engar blocking spurningar vakna, framkvæmdu B3B.1 hardeningið með afmörkuðum breytingum og targeted testum.
3. Að því loknu má undirbúa næsta stóra skref sem plan/handoff: B3C provider-neutral overview shell fyrir Veðurstofu núna og Vegagerðina síðar.

Passaðu sérstaklega:
- Ekki gefa út, ekki commit-a, ekki push-a, ekki deploya.
- Ekki breyta env eða Vercel.
- Ekki keyra SQL/migration.
- Halda `WeatherOverviewClient`/overview kjarna reusable og ekki byggja annan sérskjá fyrir næsta provider.
- Lesa `Design.md` fyrir UI/navigation states og nefna hvernig lausnin fylgir því.

Skilaðu strax handoff eftir framkvæmd eða ef þú stoppar á spurningu.
```

## Localhost checks for Stebbi

Prófa eftir næsta B3B.1 hardening eða áður en v425 fer áfram:

1. **Public overview**
   - Opna `/vedrid` sem óinnskráður.
   - Vænt: yfirlitsskjár birtist, kort/stöðvar ef Veðurstofulag er opið, og CTA í ferðaveður.
   - Prófa mobile breidd 360-460px og desktop.

2. **Public ferðaveður**
   - Smella `Reikna ferðaveðrið`.
   - Vænt: fer á `/vedrid/ferdalagid` og núverandi ferðaveðurflæði virkar.

3. **Innskráð yfirlit**
   - Opna `/auth-mvp/vedrid` sem innskráður notandi.
   - Vænt: sami overview-kjarni, CTA í `/auth-mvp/vedrid/ferdalagid`.

4. **Legacy station explorer**
   - Opna `/auth-mvp/vedrid/elta-vedrid`.
   - Vænt: sami skjár, með back-link “Til baka í Veðrið”.

5. **Púls returnTo**
   - Opna stöð, smella í fullan púls, skrá inn ef þarf.
   - Vænt: back/returnTo skilar á `/vedrid?stationId=...` eða `/auth-mvp/vedrid?stationId=...` eftir því hvaðan komið var.

6. **Provider restricted**
   - Með `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true` í localhost/Vercel-prófunarumhverfi: public notandi á ekki að sjá Veðurstofulagið, en `/vedrid` sjálft á ekki að hrynja.

7. **Kill-switch/off-state ef B3B.1 er lagað**
   - Með `WEATHER_ELTA_VEDRID_FLAG` ekki `true`: `/vedrid` á að sýna rólegt degraded state, ekki villu sem lítur út eins og bilaður skjár.

Ekki prófa Vercel/env breytingar kæruleysislega á production nema þú ætlir sérstaklega að staðfesta public/restricted hegðun þar.

## Óvissa / þarf að staðfesta

- Ég staðfesti ekki í browser hvort `/vedrid` overview sé sjónrænt eins gott og ætlað er á mobile/desktop.
- Ég veit ekki hvort Stebbi vill halda `WEATHER_ELTA_VEDRID_FLAG` sem hard kill-switch eða leggja það niður þegar Veðurstofan er opnuð almennt. Kóðinn notar það enn sem hard 404.
- Ég skoðaði ekki fulla test suite.
