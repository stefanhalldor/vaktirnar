# TODO #67 Vedrid - Codex review of v012 polish prerelease

**Dagsetning:** 2026-07-03 08:03  
**Fra:** Codex  
**Til:** Stebbi og Claude Code  
**Samhengi:** Review a `2026-07-03-0759-todo-067-v012-claude-polish-prerelease.md` og localhost skjámyndum fra Stebba.

## Verdict

v012 leysir v011 polish atriðin að mestu og grunnflæðið virkar á localhost fyrir `Reykjavík`: Stebbi fékk svar, status, facts og met.no attribution.

Ég myndi samt ekki kalla þetta production-polished fyrr en `mosó`/place extraction bug er lagað. Það er lítið fix en mikil UX-áhrif, sérstaklega þar sem Mósó er eitt af dæmunum og Stebbi prófaði eðlilegt afbrigði sem brást.

## Findings

### Medium - `mosó` finnst ekki þó `Mósó` og `moso` séu studd

Skjámynd Stebba sýnir:

- input: `Er grillveður í mosó í kvöld?`
- niðurstaða: `Ég þekki ekki þennan stað...`

Rót:

- `lib/weather/places.ts` hefur `resolvePlace()` sem normalize-ar íslenska stafi og myndi geta leyst `mosó` yfir í `moso`.
- En API route notar fyrst handskrifaðan `PLACE_PATTERNS` lista og `q.includes(p)` án normalization.
- Listinn inniheldur `mósó` og `moso`, en ekki `mosó`.

Þetta þarf að laga áður en production rollout er samþykkt. Best væri að fjarlægja tvöfalda staðagreiningu: route ætti að nota sameiginlegt resolver/search helper sem normalizes spurninguna og aliasa, eða bæta normalization í `extractPlace()`.

Lágmarks test:

- `Er grillveður í mosó í kvöld?` á að skila `Mosfellsbær`.
- `Er grillveður í moso í kvöld?` á áfram að virka.
- `Er grillveður í Mósó í kvöld?` á áfram að virka.

### Low - screenshot staðfestir deterministic flæði, ekki endilega AI flæði

Seinni skjámyndin með Reykjavík sýnir gott deterministic svar og facts:

- status: `Gott`
- svar: `Já, þetta lítur vel út til að grilla í Reykjavík!`
- facts: vindur, úrkoma, hitastig

Ég sé ekki AI source línu í expanded details, þannig þetta staðfestir fyrst og fremst deterministic/met.no flæðið. Það er fínt sem fyrsta skref, en áður en AI hluti er talinn samþykktur þarf sérstakt smoke-test með `WEATHER_AI_ENABLED=true` og valid `ANTHROPIC_API_KEY`.

## Staðfestingar

### v011 Medium 1 - admin UI vedrid section

Staða: leyst.

`app/(admin)/admin/page.tsx` hefur nú:

- prop type sem leyfir `vedrid`
- `FeatureAccessSection` með `featureKey="vedrid"`
- `heading="Veðrið-aðgangur"`
- `flagName="WEATHER_FLAG"`

### v011 Medium 2 - example chips í messages

Staða: leyst.

`VedridClient` sækir nú example questions úr `messages` með `t('exampleQuestion1')` o.s.frv.

### v011 Medium 3 - precipitation missing-data filter

Staða: að mestu leyst.

`parseMetnoForecast()` sleppir nú entries þar sem bæði `next_1_hours` og `next_6_hours` vantar. Það minnkar false-green áhættu töluvert. Residual áhætta er enn ef period er til en `details.precipitation_amount` vantar; það er líklega sjaldgæft, en má herða síðar.

## Prófanir keyrðar af Codex

```text
npm run type-check
Exit code: 0

npm run test:run
Exit code: 0
Test Files: 47 passed (47)
Tests: 1486 passed, 22 skipped, 8 todo (1516)
```

Engar migrations voru keyrðar af Codex. Engar Supabase, Vercel, production, env eða billing breytingar voru gerðar.

## Leiðbeiningar fyrir Stebba núna

### Fyrir áframhaldandi localhost test

Þú getur haldið áfram að prófa deterministic flæðið local/dev, en hafðu í huga:

- `Reykjavík` virkar samkvæmt skjámynd.
- `mosó` er þekktur bug.
- Prófaðu `Mósó` eða `moso` á meðan Claude lagar `mosó`.

### Ekki production rollout enn

Ekki setja þetta í Vercel/prod fyrr en:

1. `mosó`/place extraction bug er lagað og testað.
2. AI smoke-test hefur verið keyrt ef AI á að vera hluti af fyrsta release.
3. Dev Supabase hefur staðfest `weather_cache` row án notendagagna/prompta.
4. Allowlisted og non-allowlisted user hafa verið prófaðir með `WEATHER_FLAG=true`.

## Localhost checks for Stebbi

Eftir að Claude lagar place extraction:

1. Spyrja:
   - `Er grillveður í mosó í kvöld?`
   - vænt: svar fyrir `Mosfellsbær`, ekki unknown-place villa.
2. Regression:
   - `Er grillveður í Mósó í kvöld?`
   - `Er grillveður í moso í kvöld?`
   - `Er grillveður í Reykjavík í kvöld?`
   - vænt: öll skila veðursvari.
3. Unknown place:
   - `Er grillveður á Tunglinu í kvöld?`
   - vænt: falleg unknown-place villa.
4. AI:
   - setja `WEATHER_AI_ENABLED=true` og valid `ANTHROPIC_API_KEY`
   - restart dev server
   - spyrja Reykjavík eða Mósó spurningu
   - vænt: AI-orðað svar eða skýr deterministic fallback ef AI failar.
5. Feature gate:
   - allowlisted user sér kort og route.
   - non-allowlisted user sér ekki kort og kemst ekki inn á route.

Ekki keyra production SQL, setja Vercel env, deploya eða snerta production `feature_access` án sérstöku leyfis.

## Næsta skref

Bidja Claude Code um mjög afmarkað v014 fix:

- laga place extraction þannig `mosó` virki
- bæta tests fyrir `mosó`, `mósó`, `moso`
- skila stuttu handoffi

Eftir það er localhost smoke-test mun líklegra til að vera raunverulega representative fyrir notendur.
