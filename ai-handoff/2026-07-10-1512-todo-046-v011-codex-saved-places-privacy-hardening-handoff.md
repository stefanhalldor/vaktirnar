# Codex handoff: TODO #46 saved places privacy hardening

Created: 2026-07-10 15:12
Timezone: Atlantic/Reykjavik
Tengist: TODO #46, public Veðrið / saved places

## Staða

Stebbi sá `Þrastalundur` undir "Nýlegir staðir" og spurði hvort nýlegir
staðir gætu verið að leka milli notenda. Eftir stutta rýni virðist þetta
ekki vera cross-user leak:

- `weather_saved_places` er með RLS policies á `user_id = auth.uid()`.
- API notar authenticated Supabase server client, ekki `service_role`.
- Gestir fá `{ places: [] }`.
- Engin `localStorage`/`sessionStorage` notkun fannst fyrir weather saved places.
- Stebbi staðfesti síðan að `Þrastalundur` væri líklega staður sem hann hefði
  leitað að áður.

Samt er rétt að herða þetta sem defense-in-depth og draga úr ruglandi
guest/auth hegðun eftir að `/vedrid` varð public.

Engar kóðabreytingar voru gerðar í þessari Codex-rýni.

## Findings

### P1 - GET treystir á RLS en filterar ekki explicit á user_id

`app/api/teskeid/weather/saved-places/route.ts` notar authenticated Supabase
client, þannig RLS á að tryggja `user_id = auth.uid()`. Það er gott.

En GET query gerir:

```ts
.from('weather_saved_places')
.select(...)
.order('last_used_at', { ascending: false })
.limit(DISPLAY_LIMIT)
```

Það væri betra að bæta explicit:

```ts
.eq('user_id', user.id)
```

Þetta er ekki í stað RLS, heldur auka belti. Ef einhver breytir RLS seinna,
eða mock/próf fela raunverulega hegðun, þá helst app-query samt user-scoped.

### P1 - DELETE treystir líka eingöngu á RLS fyrir ownership

`app/api/teskeid/weather/saved-places/[id]/route.ts` delete-ar með:

```ts
.delete()
.eq('id', id)
```

RLS á að koma í veg fyrir að notandi eyði annarra röðum. En defense-in-depth
væri:

```ts
.delete()
.eq('id', id)
.eq('user_id', user.id)
```

Þetta passar líka við POST cap-delete sem er þegar með `.eq('user_id', user.id)`.

### P2 - Public `/vedrid` renderar `isGuest`, en fetch-ar samt saved places

`app/vedrid/page.tsx` renderar:

```tsx
<FerdalagidClient isGuest />
```

En `FerdalagidClient` fetch-ar saved places alltaf á mount:

```ts
fetch('/api/teskeid/weather/saved-places', { credentials: 'same-origin' })
```

Ef notandi er með login-cookie í sama browser, þá getur public `/vedrid`
samt fengið hans eigin saved places frá API, þó componentinn sé í `isGuest`
ham.

Þetta er ekki cross-user leak, en það er product/privacy ruglandi:

- UI lítur út eins og guest/public upplifun.
- Samt sjást persónulegir nýlegir staðir ef session cookie er til.
- `savePlaceBestEffort()` og delete guard-a með `if (isGuest) return`, þannig
  user getur séð lista en ekki endilega uppfært/deletað hann í sama ham.

Claude Code þarf að velja skýra hegðun:

1. **Public route er alltaf guest-mode:** ef `isGuest` er true, ekki fetch-a
   saved places og ekki senda þau í `RouteSelectionStep`.
2. **Public route verður auth-aware:** ef user er innskráður, rendera ekki
   `isGuest`; þá fá innskráðir sömu saved-place upplifun á `/vedrid` og á
   `/auth-mvp/vedrid`.

Codex mælir með valkosti 1 fyrir núverandi Phase 1, því Stebbi vildi að
óinnskráðir geti notað Veðrið án login og að þekktir staðir séu added value
fyrir innskráða. Þá á public guest route ekki að sýna persónuleg gögn þó
browserinn eigi login-cookie.

Ef valkostur 2 er valinn þarf að fjarlægja eða breyta guest hintinu fyrir
innskráða notendur sem opna `/vedrid`.

## Plan fyrir Claude Code

1. Herða GET saved places query:
   - bæta við `.eq('user_id', user.id)` áður en `order/limit` eru keyrð.
2. Herða DELETE saved place query:
   - bæta við `.eq('user_id', user.id)` við delete chain.
3. Gera `FerdalagidClient` saved-place fetch explicit guest-aware:
   - ef `isGuest` er true: ekki kalla `/api/teskeid/weather/saved-places`, setja/halda `savedPlaces=[]`.
   - tryggja að `RouteSelectionStep` fái tóman lista eða `undefined` fyrir guest.
4. Bæta við/uppfæra próf:
   - GET saved places query chain staðfestir `.eq('user_id', user.id)`.
   - DELETE query chain staðfestir `.eq('user_id', user.id)`.
   - Guest/public weather client fetch-ar ekki saved places þegar `isGuest=true`
     ef það er auðvelt að prófa á component-level. Ef erfitt, skrá sem
     manual localhost check.
5. Ekki breyta RLS policies nema sérstök þörf komi í ljós. Núverandi RLS lítur
   rétt út og á ekki að veikja.

## SQL / Supabase áhrif

Engin SQL breyting er nauðsynleg fyrir þessa herðingu.

Núverandi migration `sql/69_weather_saved_places.sql` lítur rétt út:

- `ENABLE ROW LEVEL SECURITY`
- revoke frá `PUBLIC`, `anon`, `authenticated`
- grants til `authenticated` og `service_role`
- SELECT/INSERT/UPDATE/DELETE policies með `user_id = auth.uid()`
- unique `(user_id, place_key)`

Ekki keyra SQL fyrir þetta mál nema Claude Code finni raunverulega RLS galla.

## Localhost checks for Stebbi

### Innskráður notandi á authenticated route

1. Skrá sig inn.
2. Opna `/auth-mvp/vedrid`.
3. Hafa tóman destination reit eða hreinsa destination.
4. Vænt: "Nýlegir staðir" sýnir aðeins staði fyrir þann innskráða notanda.
5. Velja nýjan stað, t.d. stað sem er örugglega ekki á listanum.
6. Vænt: staðurinn getur birst í "Nýlegir staðir" eftir val.

### Public route sem guest-mode

1. Í sama browser þar sem þú gætir verið með login-cookie, opna `/vedrid`.
2. Vænt ef valkostur 1 er útfærður: "Nýlegir staðir" birtist ekki, jafnvel þótt
   notandi hafi session-cookie, því public route er guest-mode.
3. Prófa í incognito óinnskráður.
4. Vænt: engir nýlegir staðir, engin villa.

### Privacy smoke test

1. Skrá sig inn sem notandi A og velja stað.
2. Skrá sig út eða nota annan browser/profile og skrá sig inn sem notandi B.
3. Opna `/auth-mvp/vedrid`.
4. Vænt: staður notanda A sést ekki hjá notanda B.

Ekki þarf að keyra eða breyta SQL fyrir þessi localhost checks.

## Read-only SQL check ef Stebbi vill staðfesta uppruna staðar

Má keyra í Supabase SQL Editor, en ekki líma niðurstöður með netföngum eða
persónugögnum í spjall nema nauðsynlegt sé:

```sql
select
  wsp.name,
  wsp.formatted_address,
  wsp.lat,
  wsp.lon,
  wsp.usage_count,
  wsp.created_at,
  wsp.last_used_at
from public.weather_saved_places wsp
join auth.users u on u.id = wsp.user_id
where lower(u.email) = lower(trim('SETJA_NETFANG_HER'))
order by wsp.last_used_at desc;
```

Til að athuga ákveðinn stað án þess að sýna allt:

```sql
select
  wsp.name,
  wsp.formatted_address,
  wsp.created_at,
  wsp.last_used_at
from public.weather_saved_places wsp
join auth.users u on u.id = wsp.user_id
where lower(u.email) = lower(trim('SETJA_NETFANG_HER'))
  and lower(wsp.name) like lower('%Þrastalundur%')
order by wsp.last_used_at desc;
```

Þetta er read-only en snertir user-specific gögn, þannig þarf að fara varlega
með output.

## Skipanir keyrðar af Codex

Read-only:

- `rg -n "saved-places|savedPlaces|Nýlegir staðir|recent places|recentPlaces|weather_saved_places|place_key|localStorage|sessionStorage" app components lib sql --glob '!node_modules'`
- `Get-Content -Encoding UTF8 'app/api/teskeid/weather/saved-places/route.ts'`
- `Get-Content -Encoding UTF8 'sql/69_weather_saved_places.sql'`
- `Get-Content -Encoding UTF8 'app/auth-mvp/vedrid/FerdalagidClient.tsx'`
- `Get-Content -Encoding UTF8 'components/weather/PlaceSearch.tsx'`
- `Get-Content -Encoding UTF8 'components/weather/RouteSelectionStep.tsx'`
- `Get-Content -LiteralPath 'app\api\teskeid\weather\saved-places\[id]\route.ts'`
- `Get-Content -Encoding UTF8 'app/vedrid/page.tsx'`
- `Get-Content -Encoding UTF8 'app/auth-mvp/vedrid/page.tsx'`
- `Get-Content -Encoding UTF8 'lib/__tests__/weather-saved-places-api.test.ts'`

## Áhætta / þarf að staðfesta

- RLS virðist rétt, en Codex hefur ekki keyrt SQL í Supabase til að staðfesta
  production policies. Ef Stebbi vill fulla staðfestingu þarf read-only
  policy/grant preflight.
- Ef Claude Code velur auth-aware public `/vedrid` í stað always-guest `/vedrid`,
  þarf að rýna copy og UI þannig innskráðir notendur fái ekki guest hint.
- Ekki veikja RLS eða grants í þessu máli.
