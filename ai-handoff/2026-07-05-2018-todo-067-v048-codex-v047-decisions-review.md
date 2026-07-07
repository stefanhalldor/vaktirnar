# 2026-07-05 20:18 - TODO-067 v048 - Codex review of v047 Ferðalagið plan

## Staða

Codex rýni og ákvörðunarhandoff fyrir `2026-07-05-2020-todo-067-v047-claude-ferdalagid-plan`.

Engar kóðabreytingar, engin SQL-keyrsla, ekkert deploy og engin env-breyting var framkvæmd í þessu skrefi. Þetta skjal er eingöngu til að festa niður scope áður en Claude Code framkvæmir næsta áfanga.

## Findings

### Blocker - Supabase admin provider toggle á ekki lengur heima í Phase 2B

Í v047 er lagt til að Phase 2B innihaldi `app_settings` töflu, admin API og admin UI fyrir provider-toggle (`v047` línur 42-55, 70, 89-101 og 188-225).

Stebbi hefur nú valið einfaldari leið: **environment variable fyrst**. Það þýðir að Phase 2B á ekki að bæta við `sql/69_app_settings.sql`, `app/api/admin/weather-settings/route.ts`, admin page breytingu eða DB-lestri í `provider.server.ts`.

Rök: þetta heldur MVP minni, forðast óþarfa SQL/RLS/admin-yfirborð núna, og lætur okkur prófa Google fyrst án þess að binda vöruna við admin-stillingaflæði sem gæti breyst þegar Mapbox er útfært.

### Blocker - Phase 2A4 þarf að fara á undan Phase 2B

v047 setur Phase 2A4 sem fyrsta skref (`v047` lína 61), og það er rétt. Ekki byggja Ferðalagið ofan á núverandi Google Maps client stöðu fyrr en v043 blockers eru lagaðir.

Lágmark áður en Phase 2B byrjar:

- `@googlemaps/js-api-loader` v2 lagað með functional API (`setOptions()` / `importLibrary()`), ekki `new Loader()`.
- Sampling caps gerð strict og prófuð.
- Hardcoded user-facing text fluttur í `messages/is.json` og `messages/en.json`.
- `npm run type-check` grænt.

### Major - "Finndu góðan stað" bíður eftir Ferðalagið MVP

Stebbi skrifaði: "byrjum á að notandinn viti hvert hann er að fara" og "Framkvæmum 2A og 2B fyrst." Ég túlka því svarið "Byrjum á 2B" sem: **klárum Ferðalagið MVP fyrst, þar sem notandinn veit áfangastaðinn**.

"Finndu góðan stað innan X km" á því að vera Phase 2C eftir MVP, ekki hluti af Phase 2B. v047 segir þetta líka sem tillögu (`v047` línur 25-36 og 76), og sú leið er samþykkt.

### Major - Grill/Golf/chat UI á að vera alveg falið núna

Stebbi valdi að fela Grill/Golf algjörlega. Phase 2B á því ekki að skilja eftir "Aðrar spurningar" tab, fallback chat, prompt box eða UI sem lítur út eins og ChatGPT.

Ferðalagið á að vera product UI: leiðsögn, staðfesting, tímar, farartæki/gisting og deterministic niðurstaða.

### Medium - Native datetime-local er rétt byrjun, en þarf skýra túlkun

Stebbi valdi native `<input type="datetime-local">`. Það er rétta MVP-leiðin fyrir mobile.

Claude Code þarf samt að passa:

- 16px eða stærra font-size á input svo mobile zoom-i ekki.
- Validations fyrir brottför, heimferð og "seinast komin heim".
- Ekki senda óljósa dagsetningu inn í veðurlógík. Ef API tekur við local string þarf annað hvort að senda timezone með (`Atlantic/Reykjavik`) eða breyta á einum stað í skýrt ISO/UTC format.
- Ef `latestHomeBy` er á undan mögulegri heimkomu miðað við route duration á deterministic niðurstaðan að segja það skýrt.

### Medium - Env provider þarf clean degraded state

Provider-stillingin er env-var núna, ekki admin DB. Phase 2B má styðja gildi eins og:

- `WEATHER_MAP_PROVIDER=google`
- `WEATHER_MAP_PROVIDER=mapbox` sem framtíðar-gildi, en skili skýrri `provider_not_implemented` eða sé ekki virkjað fyrr en adapter er til.
- tómt/ósett gildi sem skilar skýrri `provider_not_configured`.

Ef kort eða route-provider er ekki configured á UI að sýna skýrt hvað vantar, ekki líta út eins og appið sé bilað.

## Codex decision for v047 open questions

1. **"Finndu góðan stað":** Phase 2C eftir Ferðalagið MVP. Ekki inn í Phase 2B.
2. **Grill/Golf:** Algjörlega falið í bili. Ekkert chat fallback.
3. **Tímaval UI:** Native `<input type="datetime-local">` í Phase 2B.
4. **Admin toggle:** Ekki admin UI og ekki Supabase `app_settings` núna. Nota environment variable fyrst, Google sem fyrsta virka provider, með möguleika á Mapbox síðar.

## Revised execution scope

### Phase 2A4 - framkvæma fyrst

Laga v043 blockers:

- Google Maps loader v2 runtime issue.
- Strict route sampling caps.
- Hardcoded text í messages.
- Type-check og relevant tests.

Stoppa þar og skila handoff ef eitthvað óvænt kemur upp.

### Phase 2B - Ferðalagið MVP

Byggja Ferðalagið fyrir tilfellið þar sem notandinn veit hvert hann er að fara:

- Structured flow fyrir uppruna, áfangastað, brottför, heimferð/latest-home, eftirvagn og gistingu.
- Staðfesting á frá/til með korti þegar provider er configured.
- Engin destination-discovery.
- Engin Grill/Golf UI.
- Engin admin provider toggle.
- Deterministic travel-weather result byggt á route + weather data.
- AI ekki decision engine. Í mesta lagi síðar fyrir orðalag, ekki í þessum MVP nema Stebbi samþykki sérstaklega.

## Copy/paste til Claude Code

```text
Claude Code, rýndu v048 áður en þú framkvæmir v047.

Stebbi hefur svarað opnu spurningunum svona:
- Byrjum á Ferðalagið þar sem notandinn veit hvert hann er að fara.
- Framkvæmum Phase 2A4 fyrst og Phase 2B svo.
- "Finndu góðan stað" bíður þar til Phase 2C eftir Ferðalagið MVP. Ekki setja það inn í Phase 2B.
- Grill/Golf og chat UI eiga að vera algjörlega falin núna. Ekkert "Aðrar spurningar" tab og ekkert prompt-box fallback.
- Phase 2B notar native <input type="datetime-local">.
- Ekki byggja Supabase admin provider toggle núna. Ekki búa til app_settings SQL, admin API eða admin UI fyrir provider. Nota WEATHER_MAP_PROVIDER environment variable fyrst. Google er fyrsti virki provider. Mapbox má vera framtíðargildi í lógík ef það veldur ekki flækju, en ekki merkja það sem tilbúið fyrr en adapter er útfærður.

Revised execution:
1. Framkvæmdu Phase 2A4: laga Google Maps loader v2 issue, strict sampling caps, user-facing text í messages og type-check.
2. Framkvæmdu Phase 2B: structured Ferðalagið MVP með frá/til, staðfestingu, native datetime, eftirvagni/gistingu og deterministic route-weather niðurstöðu.
3. Ekki framkvæma destination-discovery, Grill/Golf, admin DB toggle, production/env setup, deploy, commit eða push.

Skilaðu handoff eftir framkvæmd með sömu köflum og WORKFLOW.md krefst, sérstaklega Localhost checks for Stebbi.
```

## Skrár skoðaðar

- `ai-handoff/2026-07-05-2020-todo-067-v047-claude-ferdalagid-plan.md`
- `ai-handoff/2026-07-05-1959-todo-067-v046-codex-travel-first-pivot-handoff.md`
- `Design.md`

## Skrár breyttar

- `ai-handoff/2026-07-05-2018-todo-067-v048-codex-v047-decisions-review.md`

## Skipanir keyrðar

- `Get-Date -Format "yyyy-MM-dd-HHmm"` - exit code 0
- `rg -n "Finndu|Grill|datetime|Supabase|app_settings|sql/69|provider|Phase 2A4|Phase 2B|Localhost" "ai-handoff/2026-07-05-2020-todo-067-v047-claude-ferdalagid-plan.md"` - exit code 0

## Supabase / production

Engin Supabase breyting var gerð. Engin migration var skrifuð eða keyrð. Engin RLS, auth, grants, policies, functions, secrets, billing eða production gögn voru snert.

Mikilvæg niðurstaða: Phase 2B á ekki að innihalda Supabase `app_settings` provider-toggle núna.

## Localhost checks for Stebbi

Þetta v048 skjal er ekki notendasýnileg kóðabreyting, þannig að það er ekkert nýtt UI að prófa strax.

Eftir að Claude Code framkvæmir Phase 2A4 + 2B á Stebbi að prófa á localhost:

1. Opna Veðrið með notanda sem hefur aðgang að `vedrid`.
2. Staðfesta að aðeins Ferðalagið sé sýnilegt, ekki Grill/Golf og ekki chat prompt.
3. Velja eða slá inn frá-stað og til-stað og staðfesta að kort/staðfesting hjálpi við tvíræða staði.
4. Velja brottför og heimferð með native datetime-inputum á mobile viewport án zoom/overflow.
5. Prófa ferð með engan eftirvagn og svo með hýsi/eftirvagn.
6. Prófa gistingu úti vs inni og staðfesta að niðurstaðan breytist í samræmi við áhættu.
7. Prófa `WEATHER_MAP_PROVIDER=google` með lyklum á localhost.
8. Prófa ósett/tómt `WEATHER_MAP_PROVIDER` og staðfesta að appið sýni skiljanlega provider-villu, ekki crash.
9. Passa sérstaklega að engin admin provider toggle UI sjáist.

Ekki prófa production, billing, Vercel env eða Supabase breytingar í tengslum við þetta án sérstöku leyfis.
