# Codex handoff: TODO #46 v003 - opna Veðrið/Umönnun án innskráningar + auth v002 prerelease blockers

Created: 2026-07-10 13:48
Timezone: Atlantic/Reykjavik
Tengist: TODO #46, TODO #7, TODO #67/#70/#75 og Umönnun feature flag pælingu

## Staða / af hverju þetta handoff er til

Stebbi velti upp mikilvægri product-spurningu eftir innskráningarvesen:

> Ættum við að leyfa fólki að opna Veðrið og Umönnun án þess að vera innskráð?
> Eina sem breytist í Veðrinu er þá að við vistum ekki þekkta áfangastaði fyrir
> óinnskráða. Markmiðið núna er að fá alla til að nota þetta, ekki að fólk lendi
> í innskráningarveseni.

Codex er sammála að þetta sé líklega rétt vöruáhersla fyrir næsta skref:

- Veðrið er gagnlegasta "prófa strax" Teskeiðin og þarf ekki endilega persónugögn.
- Umönnunarsíðan í Teskeið.is er nú fyrst og fremst upplýsingasíða með hlekkjum
  á sérappið, ekki raunveruleg viðkvæm Umönnunargögn.
- Lánað og skilað / Minnið á áfram að vera innskráð því þar eru einkagögn.
- Innskráning má áfram vera til fyrir vistun, admin/tölfræði, persónulegar
  Teskeiðar og framtíðarvirkni.

Þetta handoff inniheldur líka Codex-athugasemdir við
`2026-07-10-1328-todo-046-v002-claude-v001-done-prerelease.md` sem hefðu strax
átt að fara í handoff: v002 er ekki release-ready óbreytt.

## Design.md viðmið

Codex las `Design.md` áður en þetta plan var skrifað. Viðeigandi reglur:

- Mobile-first gildir líka um public síður, auth og form.
- Public opnun má ekki verða marketing landing page í stað actual usable flow.
- Navigation/loaders þurfa feedback þegar route/data bíður.
- Texti í inputs þarf minnst 16px á mobile.
- Ekki setja heilar sections í floating cards eða búa til kort inni í kortum.
- Allur nýr notendatexti á að fara í `messages/is.json` og `messages/en.json`.

## Findings fyrst: auth v002 má ekki fara út óbreytt

### P0 - `npm run type-check` fellur hjá Codex

Skrá: `lib/__tests__/user-codes.test.ts`

Línur:

- `lib/__tests__/user-codes.test.ts:249`
- `lib/__tests__/user-codes.test.ts:254`
- `lib/__tests__/user-codes.test.ts:258`

Vandamál:

Nýja test-skráin notar regex `s` flagg, en `tsconfig.json` er með
`target: "ES2017"`. TypeScript skilar:

```text
TS1501: This regular expression flag is only available when targeting 'es2018' or later.
```

Lagfæring:

Ekki breyta TS target í þessu litla auth-fixi nema það sé sér ákvörðun. Skipta
frekar `/.../s` út fyrir ES2017-væna regex-aðferð, t.d. `[\s\S]*`, eða brjóta
assertion í fleiri `toContain`/line-based checks.

Codex keyrði:

```text
npm run type-check
```

Niðurstaða: fail með TS1501.

Codex keyrði líka:

```text
npm run test:run -- lib/__tests__/user-codes.test.ts lib/__tests__/request-code.test.ts lib/__tests__/otp-verification.test.ts
```

Niðurstaða: 3 test files passed, 103 tests passed.

### P0 - SQL 72 þarf að vera keyrt áður en app-kóði fer út

Skrár:

- `sql/72_auth_email_code_request_idempotency.sql`
- `lib/auth/user-codes.ts`

Vandamál:

`lib/auth/user-codes.ts` kallar nýja RPC `create_user_otp_code_if_allowed`
beint. Ef app-kóðinn er deployaður áður en SQL 72 hefur verið keyrt í
production, þá er RPC ekki til og `/api/auth-mvp/request-code` getur skilað 500.
Það þýðir að login getur brotnað.

Þetta er rétt nefnt í Claude v002 handoff, en það þarf að vera release blocker:

1. Fyrst laga type-check.
2. Síðan, ef þessi auth-fix fer út, þarf SQL 72 að fara á undan deploy.
3. Ekki deploya app-kóðann fyrst.

Öruggari valkostur:

Skoða hvort `createUserCode()` eigi að hafa tímabundið fallback í gamla path ef
RPC vantar, en það eykur complexity. Einfaldari örugga leiðin er skýr
útgáfuröð: SQL fyrst, app deploy svo.

### P1 - Email-send failure eftir insert getur læst notanda í 120 sek.

Skrá: `app/api/auth-mvp/request-code/route.ts`

Vandamál:

Nýja flæðið býr til kóða í DB og sendir svo email. Ef email-sending failar eftir
að kóði er búinn til, þá er virkur kóði til í DB sem notandinn fékk ekki. Ef
notandi reynir aftur innan 120 sekúndna fær serverinn `recent_active` og sendir
ekki nýjan póst.

Þetta er nefnt sem þekktur edge case í Claude handoff. Það má samþykkja það sem
tímabundið tradeoff, en þá þarf Stebbi að vita að þetta getur enn valdið
"ég fæ ekki kóðann" upplifun í 120 sekúndur ef Resend/send-mail bilar eða hangir.

Ef markmiðið er að minnka login-vesen strax, getur verið betra að opna Veðrið
og Umönnun fyrst og taka auth-fix í rólegri, öruggari útgáfu.

## Product recommendation: opna public guest mode

Codex mælir með að Claude Code geri fyrst plan, ekki framkvæmd, fyrir:

1. Public Veðrið guest mode.
2. Public Umönnun info page.
3. Login sem aukagildi, ekki inngangshlið.

Meginregla:

- Notandi á að geta prófað Veðrið án innskráningar.
- Notandi á að geta opnað Umönnun upplýsingasíðuna án innskráningar.
- Óinnskráður notandi fær engin vistuð persónugögn.
- Innskráning er kynnt sem leið til að vista áfangastaði og nýta persónulegar
  Teskeiðar, ekki sem forsenda fyrir að prófa.

## Núverandi tæknileg staða sem Claude á að staðfesta

Codex skoðaði eftirfarandi:

- `middleware.ts`
  - `/auth-mvp/heim`, `/auth-mvp/minn-profill`, `/auth-mvp/lanad-og-skilad` eru
    redirectuð til `/innskraning` ef user vantar.
  - Generic non-public API routes skila 401 ef user vantar.
- `app/auth-mvp/vedrid/page.tsx`
  - kallar `guardTeskeidSession()` og `guardFeatureAccess(..., 'vedrid')`.
- `app/api/teskeid/weather/travel/route.ts`
  - krefst Supabase user og `checkFeatureAccess(..., 'vedrid')`.
- `app/api/teskeid/weather/travel/routes/route.ts`
  - krefst Supabase user og `checkFeatureAccess(..., 'vedrid')`.
- `app/api/teskeid/weather/saved-places/route.ts`
  - krefst Supabase user og skrifar/les `weather_saved_places`.
- `app/auth-mvp/umonnun/page.tsx`
  - krefst `guardTeskeidSession()` og `guardFeatureAccess(..., 'umonnun')`.
  - sýnir bara upplýsingar og hlekki, ekki viðkvæm Umönnunargögn.
- `lib/loans/guard.ts`
  - `vedrid` og `umonnun` feature access er env/feature-flag stýrt.

## Proposed implementation direction

### Phase 1 - public Veðrið án vistunar

Mælt canonical public path:

- `https://www.teskeid.is/vedrid`

Ekki festa nýja public upplifun fast í `/auth-mvp/vedrid` ef hægt er að komast
hjá því. Það er nú þegar TODO um að hreinsa sýnilegar `/auth-mvp/` slóðir.

Tillaga:

- Búa til public route `app/vedrid/page.tsx` sem endurnýtir núverandi
  `FerdalagidClient`.
- Gera weather client/component með `mode="guest" | "authenticated"` eða
  sambærilegri prop ef þörf er á mismunandi hegðun.
- Authenticated `/auth-mvp/vedrid` má áfram virka eða redirecta síðar á
  `/vedrid`, en ekki breyta routing of mikið í fyrsta skrefi.
- Fyrir guest:
  - ekki sækja saved places eða meðhöndla 401 sem villu í UI,
  - ekki senda POST á saved-places,
  - fela eða milda "nýlegir/þekktir staðir" virkni,
  - sýna mögulega litla CTA: "Skráðu þig inn til að vista áfangastaði" en ekki
    trufla aðalflæðið.

### Phase 1 - weather APIs með optional auth

Núverandi APIs sem þarf að skoða:

- `app/api/teskeid/weather/travel/routes/route.ts`
- `app/api/teskeid/weather/travel/route.ts`
- mögulega `app/api/place/reverse-geocode/route.ts`
- mögulega `app/api/teskeid/weather/ask/route.ts` ef það er enn notað í UI
- `app/api/teskeid/weather/saved-places/route.ts`
- `app/api/teskeid/weather/saved-places/[id]/route.ts`

Mynstur:

- Ef user er til:
  - halda `checkFeatureAccess(user.id, user.email, 'vedrid')`.
  - halda saved places og usage events með `userId`.
- Ef user er ekki til:
  - leyfa route/weather útreikning ef `WEATHER_PUBLIC_ENABLED === 'true'` og
    `WEATHER_ENABLED === 'true'`.
  - ekki leyfa saved places write.
  - saved places GET á annaðhvort að skila `{ places: [] }` fyrir guest eða
    client á að sleppa kallinu. Ekki láta guest UI fá sýnilega 401-villu.
  - usage events mega vera með `userId: null` ef `recordTeskeidUsageEvent` styður
    það, en metadata má ekki innihalda raw lat/lon, placeId, address eða
    persónugögn.

### Abuse/cost guard fyrir public weather

Þetta er mikilvægt áður en Veðrið verður public:

- Google route calculations geta haft beinan kostnað.
- Met.no er ekki beinn kostnaður en þarf að virða fair use og rate.
- Public endpoint þarf basic per-IP rate limit eða annað abuse guard.
- Ekki treysta á client-only throttling.

Lágmarks tillaga:

- Létt per-IP rate limit á:
  - `/api/teskeid/weather/travel/routes`
  - `/api/teskeid/weather/travel`
- Skila generic 429 eða 200 með notendavænu "reyndu aftur síðar" eftir
  núverandi API-mynstri.
- Ekki logga IP nema núverandi logging policy leyfi það; nota hash eða
  núverandi rate-limit helper ef til er.
- Hugleiða cache fyrir route pair / departure windows síðar, en ekki búa til
  stóran cache-pakka í fyrsta skrefi nema nauðsynlegt reynist.

### Phase 1 - Umönnun public info page

Núverandi `app/auth-mvp/umonnun/page.tsx` virðist bara vera upplýsinga- og
linkasíða.

Tillaga:

- Búa til public canonical path:
  - `https://www.teskeid.is/umonnun`
- Opna eingöngu upplýsingasíðuna, ekki nein Umönnunargögn.
- Halda feature flag / env guard fyrir sýnileika.
- CTA fer á `umonnun.is`, App Store og Play Store.
- Ekki bæta við Supabase queries, service_role eða persónugögnum.
- Authenticated app má áfram linka þangað eða á sama component.

### Heim / public cards

Á `www.teskeid.is` hjá óinnskráðum:

- Ready cards mega vísa beint á public:
  - Veðrið -> `/vedrid`
  - Umönnun -> `/umonnun`
- Lánað og skilað / Minnið heldur áfram að fara í `/innskraning` eða á skýra
  login-gated kynningu þar sem það er private-data Teskeið.
- Texti þarf að passa:
  - "Prófa Veðrið"
  - "Skoða Umönnun"
  - "Skráðu þig inn til að vista og nota persónulegar Teskeiðar"

Ekki gera alla public home breytinguna í sama diffi ef það stækkar málið of
mikið. Fyrsta skref má vera public `/vedrid` og `/umonnun`, svo card routing.

## Security / privacy hard boundaries

Má ekki gera:

- Ekki veikja RLS.
- Ekki gefa anon aðgang að `weather_saved_places`.
- Ekki gera Umönnunargögn public.
- Ekki opna Lánað og skilað án auth.
- Ekki setja service_role í client.
- Ekki geyma guest route history í DB án sérstakrar ákvörðunar.
- Ekki logga raw netföng, raw heimilisföng, lat/lon pör, placeId eða polyline í
  public usage logs.

Má gera:

- Allow public route/weather calculation með valid Iceland coords, rate limit og
  sanitized usage events.
- Return `{ places: [] }` fyrir guest saved-places GET eða sleppa client-callinu.
- Null `user_id` usage events ef schema og helper styðja það.

## Suggested task split for Claude Code

### Task A - plan-only audit

Claude Code á fyrst að gera stutt plan/rýni, ekki framkvæma:

1. Telja nákvæmlega hvaða routes/API köll `FerdalagidClient` notar.
2. Staðfesta hvað þarf til að keyra Veðrið sem guest án saved places.
3. Staðfesta hvort `recordTeskeidUsageEvent` styður `userId: null` í raun.
4. Staðfesta núverandi rate-limit helpers sem má endurnýta fyrir public weather.
5. Staðfesta hvort public `/umonnun` getur endurnýtt núverandi component án auth.
6. Skila áhættumati fyrir Google/Met.no kostnað og rate.

### Task B - implementation phase 1, aðeins eftir samþykki Stebba

Mögulegur fyrsti implementation diff:

1. Public `/vedrid`.
2. Weather APIs optional-auth + public flag + rate limit.
3. Guest saved places gracefully disabled.
4. Public `/umonnun` info page.
5. Ready-card links uppfærðir ef umfang leyfir.
6. Tests fyrir guest/authenticated branching.

Ekki taka auth v002 SQL 72 fix og public weather í sama commit nema Stebbi
biðji sérstaklega um það. Þetta eru tvær mismunandi áhættur.

## Localhost checks for Stebbi

Þegar Claude hefur útfært public guest mode á localhost:

### Guest Veðrið

1. Opna incognito/private browser eða skrá sig út.
2. Fara á `/vedrid`.
3. Vænt:
   - síðan opnast án redirect á `/innskraning`,
   - hægt er að velja brottfararstað og áfangastað,
   - route options birtast,
   - "Sæki leiðarmöguleika..." loader virkar ef hann er í núverandi útgáfu,
   - hægt er að reikna ferðaveður og sjá niðurstöðu.
4. Vænt:
   - engin "þekktir/vistaðir staðir" birtast fyrir guest,
   - ekkert save-place error sést í UI,
   - DevTools console/network sýnir ekki sýnilegan 401 sem truflar flæðið.

### Authenticated Veðrið

1. Skrá sig inn.
2. Fara á `/vedrid` og/eða `/auth-mvp/vedrid` eftir því sem Claude velur.
3. Vænt:
   - sama ferðaveðurvirkni virkar,
   - saved places halda áfram að virka fyrir innskráðan notanda,
   - engin cross-user gögn birtast.

### Umönnun public

1. Skrá sig út / incognito.
2. Fara á `/umonnun`.
3. Vænt:
   - upplýsingasíðan opnast án login,
   - hlekkir á `umonnun.is`, App Store og Play Store virka,
   - engin persónugögn eða Umönnunargögn birtast.

### Private Teskeiðar áfram private

1. Skrá sig út.
2. Prófa `/auth-mvp/lanad-og-skilad`.
3. Vænt: redirect á `/innskraning` eða sambærileg auth-gating hegðun.
4. Prófa private API ef þörf, t.d. loans endpoint.
5. Vænt: 401/redirect samkvæmt núverandi mynstri.

### Mobile checks

Prófa public `/vedrid`, `/umonnun` og `/innskraning` við 360px, 390px og 460px:

- enginn horizontal overflow,
- inputs valda ekki iOS zoom,
- keyboard skilur ekki síðu eftir skakka,
- CTA og route controls eru snertanleg,
- loader/pending state ýtir ekki efni til.

### Auth v002 checks ef það fer áfram

Ef Stebbi ákveður að halda áfram með SQL 72 auth-fix:

1. Laga type-check fyrst.
2. Keyra `npm run type-check`.
3. Keyra auth tests.
4. Keyra SQL 72 á réttu DB áður en app-code deploy fer út.
5. Prófa að biðja um kóða einu sinni og staðfesta eina nýja röð í
   `auth_email_codes`.
6. Prófa tvísmell/retry og staðfesta að fleiri active kóðar séu ekki búnir til.
7. Staðfesta í logs hvort tafirnar eru í DB eða email sendingu.

Ekki prófa production rate-limit/abuse kæruleysislega með mörgum raunverulegum
netföngum. Nota eigið netfang og takmarkaðar keyrslur.

## Spurningar fyrir Claude Code

1. Er einfaldast að búa til nýja public routes `/vedrid` og `/umonnun`, eða
   breyta núverandi `/auth-mvp/*` routes í optional-auth? Codex hallar að
   public canonical routes.
2. Hvaða API köll notar `FerdalagidClient` nákvæmlega í guest flow?
3. Er núverandi `recordTeskeidUsageEvent` öruggt með `userId: null`, bæði types
   og DB?
4. Hvaða rate-limit helper er öruggast að endurnýta fyrir public weather?
5. Hvernig tryggjum við að saved places séu fullkomlega disabled fyrir guest án
   þess að brjóta UI?
6. Er `WEATHER_PUBLIC_ENABLED` nýtt env flag rétt leið, eða á `WEATHER_ENABLED`
   eitt og sér að duga?
7. Á Umönnun public route að vera alltaf sýnileg þegar `UMONNUN_ENABLED=true`,
   eða þarf sér `UMONNUN_PUBLIC_ENABLED`?

## Óvissa / þarf að staðfesta

- Codex skoðaði ekki allt `FerdalagidClient.tsx` vegna stærðar. Claude þarf að
  kortleggja öll fetch/save-place köll áður en implementation hefst.
- Codex staðfesti ekki hvort `recordTeskeidUsageEvent` tekur `userId: null` í
  TypeScript þótt SQL 71 leyfi nullable `user_id`.
- Google Maps kostnaður þarf að meta áður en public weather fer út án rate
  limit.
- Þetta handoff breytir engu í kóða, SQL eða TODO. Það er plan/rýni fyrir
  næsta Claude hring.
