# TODO-067 v050 - Codex Phase 2B execution handoff

Created: 2026-07-05 20:45  
Timezone: Atlantic/Reykjavik  
From: Codex  
To: Stebbi og Claude Code  
Status: Handoff / execution guardrails for Phase 2B. Engar kóðabreytingar, engin SQL-keyrsla, ekkert deploy, ekkert commit og engar production/env breytingar voru framkvæmdar af Codex.

## Niðurstaða

Codex mælir með að Stebbi setji **Phase 2B - Ferðalagið MVP** af stað núna, en með þröngum og skýrum ramma.

Phase 2A4 virðist loka lágmarks-blockerum sem þurftu að fara á undan 2B:

- Google Maps browser loader var færður yfir á `@googlemaps/js-api-loader` v2 functional API.
- Sampling caps voru hert.
- User-facing textar úr `PlaceSearch` og `MapConfirmation` voru færðir í messages.
- Codex keyrði `npm run type-check` og fékk exit code 0.

Það er samt eitt mikilvægt atriði sem Phase 2B verður að loka: núverandi route-branch í `app/api/teskeid/weather/ask/route.ts` velur enn fyrsta geocoder-candidate (`candidates[0]`) fyrir route origin/destination ef staður er ekki curated. 2B má ekki byggja áfram á þeirri hegðun sem notenda-facing leið. Frá og til verða að vera curated eða staðfest af notanda áður en route weather keyrir.

## Review findings

### Blocker for release, not blocker for starting Phase 2B - route geocoding confirmation

Í núverandi `ask/route.ts` eru origin/destination leyst með curated list fyrst, en ef það tekst ekki er farið í geocoder og `candidates[0]` valið sjálfkrafa.

Þetta er einmitt vandamálið sem Phase 2B á að laga með structured Ferðalagið UI:

- Notandi velur eða slær inn frá-stað.
- Kerfið sýnir/staðfestir réttan stað.
- Notandi velur eða slær inn til-stað.
- Kerfið sýnir/staðfestir réttan stað.
- API fær staðfesta coordinates/place candidates, ekki óstaðfest texta sem server geocoder giskar á.

Phase 2B má byrja núna, en má ekki teljast tilbúið fyrr en þessi hegðun er farin úr notendasýnilega route-flæðinu.

### Major - v049 handoff vantaði skyldu-kafla

`2026-07-05-2038-todo-067-v049-claude-phase2a4-shipped.md` vantaði `Localhost checks for Stebbi`.

Þetta stoppar ekki Phase 2B, en Claude Code þarf að passa að næsta handoff fylgi `WORKFLOW.md` og `ai-handoff/README.md`:

- Hafa `Localhost checks for Stebbi`.
- Skrá nákvæm skref, vænta niðurstöðu og regression sem Stebbi á að passa.
- Taka sérstaklega fram að engin production/env/billing/deploy/Supabase breyting var gerð nema Stebbi hafi samþykkt slíkt sérstaklega.

### Major - halda Phase 2B frá chat/AI upplifuninni

Stebbi vill ekki að Veðrið upplifist eins og ChatGPT spjall. Phase 2B á því að vera product UI, ekki prompt UI.

Ekki skilja eftir:

- opið prompt box,
- "Aðrar spurningar" tab,
- Grill/Golf val,
- fallback chat mode,
- AI-generated decision sem virðist taka ákvörðunina.

### Major - enginn Supabase admin provider toggle í Phase 2B

v047 stakk upp á Supabase `app_settings`, admin API og admin UI til að skipta provider. Stebbi valdi einfaldari leið í v048:

- Nota `WEATHER_MAP_PROVIDER` environment variable.
- Google er fyrsti virki provider.
- Mapbox má vera framtíðargildi í lógík ef það flækir ekki, en má ekki vera sýnt sem tilbúið eða valanlegt fyrr en adapter er raunverulega til.

Phase 2B á ekki að skrifa migration, búa til `app_settings`, bæta við admin route eða breyta admin UI.

### Medium - native datetime-local þarf góða validation

Stebbi valdi native `<input type="datetime-local">`, sem er rétt fyrir MVP og mobile.

Claude Code þarf samt að passa:

- `font-size: 16px` eða stærra svo mobile zoom-i ekki.
- Skýr required/optional stöðugildi.
- Brottför má ekki vera tómt þegar route weather er reiknað.
- Heimferð og `latestHomeBy` þurfa að vera rökrétt ef þau eru sett.
- Ef `latestHomeBy` er fyrr en raunhæf heimkoma miðað við route duration, á deterministic result að segja það skýrt.
- Date parsing þarf að vera miðlægt og skýrt. Fyrir Ísland er timezone einföld núna, en ekki senda óljósa local string milli laga án þess að ákveða hvernig hún er túlkuð.

### Medium - provider-not-configured þarf að vera góð vara, ekki crash

Stebbi mun setja lykla inn síðar. Á localhost þarf appið að þola:

- ekkert `WEATHER_MAP_PROVIDER`,
- `WEATHER_MAP_PROVIDER=google` en lykla vantar,
- browser key vantar,
- server key vantar,
- Google API svarar ekki,
- route unavailable.

Í öllum þessum tilvikum á UI að skila skiljanlegri stöðu og ekki crash-a.

### Medium - Design.md þarf að ráða UI ákvörðunum

Ferðalagið er mobile-first app-flow. Claude Code þarf að fylgja `Design.md` áður en UI er útfært eða rýnt:

- Enginn óþarfur landing/marketing skjár.
- App-like flow beint á nytsamlega aðgerð.
- Enginn horizontal overflow.
- Enginn mobile input zoom.
- Engin texta-overlap í compact/mobile view.
- Sýnilegt pending/loader feedback þegar route/weather/map provider er að vinna.
- Ekki card-inside-card eða of þungt decorative layout.
- User-facing textar í `messages/is.json` og `messages/en.json`.

## Phase 2B accepted scope

Phase 2B má innihalda:

1. Nýtt Ferðalagið UI í Veðrið sem aðal- og eina notendasýnilega flæði núna.
2. Structured form/wizard fyrir:
   - hvaðan notandi fer,
   - hvert notandi fer,
   - hvenær notandi leggur af stað,
   - hvenær notandi vill fara heim,
   - hvenær notandi þarf í síðasta lagi að vera kominn heim,
   - eftirvagn/hýsi,
   - gisting inni/úti/annað.
3. Staðfest frá og til áður en route weather keyrir.
4. Native `<input type="datetime-local">`.
5. Deterministic travel-weather endpoint eða helper sem vinnur úr staðfestri route + forecast gögnum.
6. Niðurstaða sem sýnir:
   - hvort ferðin lítur út fyrir að vera í lagi,
   - versta punkt / versta tímabil,
   - hvað ræður stöðunni,
   - hvaða þáttur skiptir mestu máli fyrir hýsi/eftirvagn/gistingu,
   - einfalt næsta ráð.
7. Tests fyrir deterministic travel logic og validation, eftir áhættu.
8. Messages í `messages/is.json` og `messages/en.json`.
9. Clean error/degraded states fyrir missing provider/keys.

## Explicit non-goals for Phase 2B

Phase 2B á ekki að innihalda:

- "Finndu góðan stað" eða destination discovery.
- Grill.
- Golf.
- Chat UI.
- Open-ended natural language weather prompt.
- AI decision engine.
- Supabase admin provider toggle.
- `app_settings` migration.
- Admin API fyrir weather provider.
- Admin UI fyrir weather provider.
- Production env setup.
- Google Cloud billing/key setup.
- Mapbox adapter nema Claude Code komist að því að það sé nauðsynlegt og stoppi fyrst fyrir Stebba/Codex rýni.
- Commit, push eða deploy.
- Að ræsa/endurræsa/drepa dev server.

## Suggested technical direction for Claude Code

### API/data shape

Mælt er með að Phase 2B noti explicit structured payload, ekki route prompt parsing:

```ts
type ConfirmedPlace = {
  name: string
  lat: number
  lon: number
  placeId?: string
  provider?: 'curated' | 'google' | 'mapbox' | 'manual'
  formattedAddress?: string
}

type TravelWeatherRequest = {
  origin: ConfirmedPlace
  destination: ConfirmedPlace
  departureAt: string
  returnDepartureAt?: string
  latestHomeBy?: string
  trailerKind: 'none' | 'generic_trailer' | 'tent_trailer' | 'folding_camper' | 'caravan' | 'horse_trailer'
  lodgingKind: 'none' | 'tent' | 'tent_trailer' | 'folding_camper' | 'caravan' | 'indoor' | 'other'
}
```

Server þarf samt að validate-a:

- lat/lon eru tölur,
- coordinates eru innan Íslands,
- name er non-empty,
- departureAt er valid,
- return/latest-home eru valid ef sett,
- trailer/lodging enum eru þekkt gildi.

### Route/provider

Route calculation má nota `getWeatherMapProvider()` og `provider.getRouteGeometry(origin, destination)` eftir staðfestingu.

Ekki láta server velja geocoder candidate fyrir route-flæði án þess að notandi sjái og staðfesti staðinn. Ef server þarf enn route-branch í gamla `/ask` endpoint fyrir backward compatibility, á hann annað hvort að skila `confirmation_required` eða vera falinn/ónotaður frá nýja UI.

### Deterministic travel result

Ferðalagið þarf ekki AI til að ákveða niðurstöðu. Mælt er með lógík sem:

- sækir route points,
- takmarkar fjölda veðurpunkta með strict cap,
- sækir forecast fyrir punkta,
- metur outbound leg frá departureAt + route duration,
- metur return leg ef returnDepartureAt er sett,
- metur stay/lodging window ef outdoor lodging er valið,
- finnur versta punkt/tímabil,
- hættir snemma ef deterministic threshold er greinilega rautt og ekki þarf að vinna meira til að svara,
- skilar structured facts svo UI geti birt niðurstöðu án AI.

### Text/UI

Allur notendatexti á að fara í messages:

- field labels,
- helper text,
- validation errors,
- result labels,
- provider error states,
- loading states.

Íslenska á að vera stutt, náttúruleg og óformleg í Teskeið-tón.

## Copy/paste til Claude Code

```text
Claude Code, framkvæmdu Phase 2B fyrir TODO #67 Ferðalagið MVP.

Skilningur á samþykki áður en þú byrjar:
Stebbi er að samþykkja afmarkaða kóðabreytingu fyrir Phase 2B Ferðalagið MVP.
Þetta felur í sér UI/API/helper/test/message breytingar sem þarf til að gera Ferðalagið nothæft á localhost.
Þetta felur ekki í sér commit, push, deploy, production env breytingar, Supabase migration, SQL keyrslu, Google billing/key setup, Mapbox útfærslu eða dev-server restart.

Rammaðu framkvæmdina strangt svona:

1. Byggja Ferðalagið þar sem notandinn veit hvert hann er að fara.
2. Nota structured UI/endpoint fyrir frá-stað, til-stað, brottför, heimferð/latest-home, eftirvagn og gistingu.
3. Ekki nota gamla route prompt-flowið sem velur candidates[0] án staðfestingar. Frá og til þurfa að vera curated eða confirmed áður en route weather keyrir.
4. Fela Grill/Golf og chat UI algjörlega. Ekkert "Aðrar spurningar", ekkert prompt-box fallback.
5. Nota native <input type="datetime-local"> með mobile-safe font-size og validation.
6. Nota WEATHER_MAP_PROVIDER env-var. Ekki búa til Supabase app_settings, admin API eða admin provider UI.
7. Google er fyrsti virki provider. Mapbox er ekki notendasýnilegur nema það sé raunverulega útfært.
8. Ferðalagið niðurstaðan á að vera deterministic. AI má ekki vera decision engine og ekki setja AI-orðalag inn í MVP nema Stebbi samþykki sérstaklega.
9. Allur notendatexti fer í messages/is.json og messages/en.json.
10. Fylgdu Design.md fyrir mobile-first app-flow: ekkert horizontal overflow, enginn input zoom, skýrir loading/pending states og engin chat/landing upplifun.
11. Engin production env breyting, deploy, commit, push eða migration.
12. Ekki ræsa, endurræsa eða drepa dev server.

Sérstaklega þarf að laga residual v049 áhættu:
- Núverandi route branch í app/api/teskeid/weather/ask/route.ts velur candidates[0] fyrir óþekktan origin/destination. Phase 2B má ekki skilja notendasýnilegt route-flow eftir þannig. Nýja Ferðalagið flæðið þarf staðfest frá/til áður en route weather keyrir.

Skilaðu handoff eftir framkvæmd með öllum köflum sem WORKFLOW.md krefst:
- hvað var samþykkt,
- hvað var gert,
- hvaða skrár voru skoðaðar,
- hvaða skrár voru breyttar,
- hvaða skipanir voru keyrðar,
- exit codes,
- hvað mistókst eða var sleppt,
- ákvarðanir sem Claude Code tók,
- áhætta sem er enn til staðar,
- tillaga að næsta skrefi,
- Supabase/production kafli sem segir skýrt að ekkert SQL/migration/deploy/env/production var gert nema eitthvað slíkt hafi verið sérstaklega samþykkt,
- Localhost checks for Stebbi með nákvæmum prófunarskrefum.

Áður en þú byrjar skaltu skrifa stutt "Skilningur á samþykki" samkvæmt WORKFLOW.md. Ef eitthvað í þessu stangast á við núverandi kóða eða krefst stærri ákvörðunar, stoppaðu og skilaðu spurningu/handoff frekar en að víkka scope.
```

## Localhost checks for Stebbi

Þetta v050 skjal er handoff/guardrail og breytir ekki notendasýnilegri virkni. Það er því ekkert nýtt UI að prófa beint eftir þetta skjal.

Eftir að Claude Code framkvæmir Phase 2B á Stebbi að prófa á localhost:

1. Opna Veðrið sem notandi með `vedrid` aðgang.
2. Staðfesta að Ferðalagið sé eina sýnilega flæðið.
3. Staðfesta að Grill, Golf, prompt box, "Aðrar spurningar" og chat-lík UI sjáist ekki.
4. Slá inn eða velja frá-stað, t.d. Reykjavík.
5. Slá inn eða velja til-stað, t.d. Akureyri.
6. Staðfesta að appið biðji um eða sýni staðfestingu á réttum frá/til stöðum áður en route weather keyrir.
7. Prófa tvírætt staðarheiti, t.d. Suðurgata, og staðfesta að notandi sé ekki látinn óvart samþykkja rangan stað.
8. Velja brottför með native datetime inputi á mobile viewport og staðfesta að input zoom-i ekki.
9. Setja heimferð og "þarf að vera komin/nn heim í síðasta lagi" og staðfesta validation ef tímar eru órökréttir.
10. Prófa án eftirvagns.
11. Prófa með hjólhýsi eða fellihýsi og staðfesta að niðurstaðan taki meira tillit til vinds/hviða.
12. Prófa gistingu inni vs úti og staðfesta að útigisting hafi áhrif á niðurstöðuna.
13. Prófa þegar `WEATHER_MAP_PROVIDER=google` og lyklar eru til staðar á localhost.
14. Prófa þegar `WEATHER_MAP_PROVIDER` er tómt eða vantar og staðfesta að appið sýni skiljanlega villu/degraded state, ekki crash.
15. Prófa að Google route/geocode skili villu eða engum niðurstöðum ef hægt er, og staðfesta að UI gefi skýra stöðu.
16. Staðfesta að niðurstaðan sé deterministic og vísi í veðurgögn/route facts, ekki AI-giskað svar.
17. Staðfesta mobile layout: ekkert horizontal scroll, enginn overlap, enginn handvirkur zoom þarf, buttons/input eru nothæf.
18. Staðfesta loading/pending state á meðan route/weather gögn eru sótt.

Ekki prófa production, Vercel env, Google billing, Supabase migrations, RLS, auth policy breytingar eða notendagögn í tengslum við Phase 2B nema Stebbi gefi sérstakt leyfi.

## Skrár skoðaðar í þessu skrefi

- `WORKFLOW.md`
- `ai-handoff/README.md`
- `ai-handoff/2026-07-05-2038-todo-067-v049-claude-phase2a4-shipped.md`
- `ai-handoff/2026-07-05-2018-todo-067-v048-codex-v047-decisions-review.md`

Í fyrri rýni rétt áður en þetta handoff var skrifað skoðaði Codex einnig lykil diff og línur í:

- `app/api/teskeid/weather/ask/route.ts`
- `lib/weather/google.server.ts`
- `lib/weather/googleMaps.client.ts`
- `lib/weather/provider.server.ts`
- `lib/weather/provider.types.ts`
- `components/weather/PlaceSearch.tsx`
- `components/weather/MapConfirmation.tsx`
- `messages/is.json`
- `messages/en.json`
- `.env.example`
- `package.json`

## Skrár breyttar af Codex

- `ai-handoff/2026-07-05-2045-todo-067-v050-codex-phase2b-execution-handoff.md`

Engar app-kóðaskrár, message-skrár, SQL-skrár, env-skrár eða production stillingar voru breyttar af Codex í þessu skrefi.

## Skipanir keyrðar af Codex

- `Get-Date -Format "yyyy-MM-dd-HHmm"` - exit code 0
- `Get-Content -Encoding UTF8 "WORKFLOW.md"` - exit code 0
- `Get-Content -Encoding UTF8 "ai-handoff/README.md"` - exit code 0
- `Get-Content -Encoding UTF8 "ai-handoff/2026-07-05-2038-todo-067-v049-claude-phase2a4-shipped.md"` - exit code 0
- `Get-Content -Encoding UTF8 "ai-handoff/2026-07-05-2018-todo-067-v048-codex-v047-decisions-review.md"` - exit code 0
- `Get-ChildItem -File "ai-handoff" | Sort-Object Name | Select-Object -Last 12 Name,Length` - exit code 0

Í fyrri rýni rétt áður en þetta handoff var skrifað keyrði Codex einnig:

- `npm run type-check` - exit code 0
- `git diff --stat` - exit code 0
- `git diff` á lykilskrám í weather/provider/UI/messages - exit code 0
- `git status --short` - exit code 0, með warning um `C:\Users\Lenovo/.config/git/ignore` permission denied

## Supabase / production / billing

Codex gerði engar Supabase breytingar, engar SQL breytingar, keyrði enga migration, breytti engum RLS policies, auth, grants, functions, secrets, Vercel env, production stillingum eða billing.

Phase 2B á einnig að forðast allt slíkt nema Stebbi gefi nýtt, skýrt og afmarkað leyfi.

## Óvissa / þarf að staðfesta

- Codex staðfesti `npm run type-check`, en keyrði ekki fulla test-suite í þessu skrefi. v049 segir að Claude Code hafi keyrt 1613 prófanir án brots.
- Codex hefur ekki keyrt browser/localhost próf, því Stebbi keyrir dev server sjálfur samkvæmt workflow.
- Það þarf að staðfesta í 2B handoffi hvort gamla `/api/teskeid/weather/ask` route branch er fjarlægð, falin eða látin skila confirmation-required fyrir route intent. Aðalatriðið er að notendasýnilegt Ferðalagið noti ekki óstaðfest `candidates[0]`.
