# TODO-091 v027 — Notandastillingar án localStorage og kortafallback

Created: 2026-07-25 00:22  
Timezone: Atlantic/Reykjavik

## Samþykktur rammi

Stebbi samþykkti að Codex:

- fjarlægði varanlega browser-vistun veðurstillinga,
- léti innskráða notendur nota server-side stillingar og autosave,
- héldi public vistunarhnappi sem einu sinni innskráningarflæði,
- bætti fallback og diagnostics við Spákortið meðan Stebbi skráði
  `teskeid.is` hjá Stadia.

Ekki var samþykkt commit, push, deploy, migration eða breyting hjá
Stadia/Supabase.

## Hvað var gert

### Veðurstillingar

- `localStorage` lestur og skrif voru fjarlægð fyrir:
  - valdar stöðvar,
  - veðurmörk,
  - sýnilega tíma.
- Innskráðir nota nú eingöngu
  `/api/teskeid/weather/preferences/chase` og 1,2 sek. autosave.
- Public stillingar lifa aðeins í React state fram að reload.
- Public sér hnappinn **Vista mínar veðurstillingar**.
- Við smell fer payload tímabundið í `sessionStorage`, notandi fer í
  innskráningu og payload er vistað server-side eftir innskráningu.
- Eftir innskráningu hverfur hnappurinn; autosave tekur við.
- Eldri localStorage-lyklar eru fjarlægðir einu sinni við mount:
  - `teskeid_weather_chase_preferences_v1`,
  - `teskeid_forecast_card_scale_v1`.
- A−/A+ er nú session-only state og endurstillist við reload.
- Gamalt „vistað í þessum vafra“ status og þýðingar voru fjarlægð.

### Spákort

- Carto Voyager raster er nú neðsta forecast-lagið.
- Stadia Terrain background/lines liggja ofan á og fela fallback þegar þau
  hlaðast rétt.
- Ef Stadia auth eða tile-provider bregst verður kortið Carto í stað hvíts.
- MapLibre source-villur eru nú loggaðar einu sinni per einstök villuskilaboð,
  einnig í production console.

## Design.md

- Public vistun er skýr einu sinni aðgerð; innskráðir þurfa ekki að ýta á
  vistunarhnapp vegna autosave.
- Fallback kemur í veg fyrir tómt/deytt kort meðan navigation og markerar
  halda áfram að virka.
- Núverandi mobile controls og 40 px touch targets eru óbreytt.

## Skrár breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/WeatherChasePanel.tsx`
- `messages/is.json`
- `messages/en.json`
- `ai-handoff/2026-07-25-0022-todo-091-v027-codex-server-preferences-and-map-fallback.md`

## Prófanir

- `npm run type-check`
  - Exit code 0.
- `npm run test:run -- lib/__tests__/weather-chase-panel-hydration.test.tsx lib/__tests__/weather-chase-preferences.test.ts lib/__tests__/road-intelligence-road-map-places.test.ts`
  - Exit code 0; 3 skrár og 8 próf stóðust.
- `git diff --check`
  - Exit code 0; aðeins fyrirliggjandi line-ending viðvaranir.
- `npm run build`
  - Fyrsta keyrsla: exit code 1 vegna tímabundins `.next` chunk
    `MODULE_NOT_FOUND`.
  - Óbreytt endurkeyrsla: exit code 0.
  - Fyrirliggjandi lint-viðvaranir eru áfram.

## Ekki gert

- Engin SQL eða migration.
- Engin breyting á RLS, auth, grants eða Supabase schema.
- Engin Stadia account/domain breyting.
- Ekkert committað, push-að eða deployað.
- Dev server/browser var ekki ræstur.

## Áhætta og óvissa

- Stadia þarf áfram domain authentication fyrir terrain í production.
- Þar til lénaskráning tekur gildi sýnir fallback Carto með provider-heitum,
  sem er örugg en sjónrænt lakari niðurstaða en label-laust Terrain.
- `sessionStorage` er best-effort. Ef browser bannar það getur public notandi
  þurft að stilla aftur eftir innskráningu; ekkert er vistað local.
- Autosave API villa skilur stillingar eftir í minni en sýnir ekki enn
  persistent retry/banner fyrir innskráðan notanda.
- Production tile diagnostics geta birt nokkrar mismunandi villur ef margar
  tile-slóðir mistakast, en sama message er aðeins loggað einu sinni.

## Supabase, auth og production

- Fyrirliggjandi `weather_chase_preferences` API er áfram eina varanlega
  veðurstillingageymslan.
- Public PUT fær 401 og kveikir innskráningarhandoff; engin public gögn eru
  skrifuð í gagnagrunn.
- Engin production-aðgerð framkvæmd.

## Route intelligence check

Breytingin snertir Spá/notandastillingar og basemap-fallback, ekki leiðir,
vegkafla eða route matching. `IcelandRoadmap.md` var því ekki breytt.

## Localhost checks for Stebbi

Slóð: `/auth-mvp/vedrid/road-map-prototype`

### Public

1. Opnaðu í private/incognito glugga.
2. Breyttu stöðvum, mörkum og tímum.
3. Endurhladdu án þess að vista.
   - Vænt: sameiginlegt default kemur aftur; breytingin var ekki browser-vistuð.
4. Breyttu aftur og ýttu á **Vista mínar veðurstillingar**.
   - Vænt: innskráning opnast.
5. Skráðu þig inn.
   - Vænt: pending stillingar vistast á notandann og vistunarhnappurinn
     hverfur.

### Innskráður

1. Breyttu stöð, mörkum eða tíma og bíddu minnst 1,2 sek.
2. Endurhladdu síðuna.
   - Vænt: server-side val endurheimtist.
3. Opnaðu sama notanda í öðrum vafra/tæki.
   - Vænt: sama val kemur frá notandastillingum.
4. Skráðu þig út.
   - Vænt: public default birtist, ekki val fyrri notanda.

### Kort

1. Með Stadia-domain óskráð eða tile-kall blockað, opnaðu **Spákort**.
   - Vænt: Carto fallback birtist; kortið er ekki hvítt.
2. Eftir að `teskeid.is` og `www.teskeid.is` hafa verið samþykkt hjá Stadia,
   gerðu hard refresh.
   - Vænt: Terrain hillshade/landslag birtist ofan á fallback.
3. Prófaðu desktop og 360/390/460 px.
   - Vænt: markerar, tímascrubber og A−/A+ virka í báðum tilfellum.
4. Skoðaðu console ef terrain vantar.
   - Vænt: ein afmörkuð MapLibre source-villa per einstök villuskilaboð.

Ekki þarf að breyta Supabase eða keyra SQL fyrir prófin. Stadia-domain breyting
er ytri account-aðgerð sem Stebbi framkvæmir sérstaklega.
