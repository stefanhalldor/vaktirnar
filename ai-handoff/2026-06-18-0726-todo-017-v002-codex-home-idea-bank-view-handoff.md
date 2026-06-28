# TODO #17: `/heim` sýni hugmyndabankann sem annað view

**Agent:** Codex  
**Fyrir:** Stebbi og Claude Code  
**Dagsetning:** 2026-06-18  
**Staða:** Framkvæmdarhandoff, bíður Claude Code útfærslu  
**Tengd TODO:** #17 Hugmyndir úr hugmyndabankanum á `/heim`  
**Tengt samhengi:** #42 Tilbúnar Teskeiðar efst og hugmyndir aðskildar frá virkum Teskeiðum

## Samhengi frá Stebba

Stebbi vill laga `Hugmyndir` sectionið á `/heim`.

Ný hegðun:

- Sectionið á að heita `Hugmyndir sem verða líklega að Teskeiðum`.
- Það á að sýna hugmyndabankann með öllum birtum hugmyndum sem eru ekki í
  stöðunni `Komið út`.
- Það á að nota nákvæmlega sömu röðunarlógík og hugmyndabankinn sjálfur.
- Notendur eiga að geta kosið beint af `/heim`.
- Þetta er í raun bara annað view á hugmyndabankann.

## Núverandi staða í kóða

Codex skoðaði:

- `app/auth-mvp/heim/page.tsx`
- `app/page.tsx`
- `components/teskeid/PersonalizedIdeaGrid.tsx`
- `components/teskeid/IdeaGrid.tsx`
- `components/teskeid/IdeaCard.tsx`
- `components/teskeid/VoteButton.tsx`
- `components/teskeid/StatusBadge.tsx`
- `app/api/votes/route.ts`
- `lib/teskeid/types.ts`
- `lib/__tests__/home-page.test.tsx`

Núverandi `/heim` notar harðkóðaðan lista:

```ts
const UPCOMING_KEYS = [
  'upcomingEmail',
  'upcomingExpenses',
  'upcomingPartner',
  'upcomingWeather',
  'upcomingKidsShift',
  'upcomingThirdShift',
  'upcomingOutToPlay',
] as const
```

Síðan birtir hann listann sem disabled buttons merkt `Væntanlegt`.

Canonical hugmyndabankinn á public forsíðu notar:

```ts
supabase
  .from('ideas')
  .select('*')
  .eq('is_public', true)
  .order('is_featured', { ascending: false })
  .order('votes_count', { ascending: false })
```

og renderar:

```tsx
<PersonalizedIdeaGrid ideas={ideas ?? []} />
```

`PersonalizedIdeaGrid` endurraðar síðan ókosnum hugmyndum fyrir ofan kosnar
hugmyndir í sama browser, en varðveitir server-röðun innan hvors hóps.

`IdeaCard` notar `VoteButton`, þannig að kosningalógíkin er þegar til og á að
endurnýtast.

## Mikilvæg gagnaregla

Í kóðanum er staðan `Komið út` ekki geymd sem íslenskur texti heldur sem:

```ts
status: 'launched'
```

`StatusBadge` mappar:

```ts
launched: 'Komið út'
```

Þess vegna á filterinn að vera á gagnagildinu:

```ts
.neq('status', 'launched')
```

Ekki sía eftir strengnum `Komið út`.

## Markmið

Á `/heim` á sectionið undir virkum Teskeiðum að verða lifandi hugmyndabanka-view:

1. Virkar Teskeiðar eru áfram efst undir heading `Teskeiðar`.
2. Þar fyrir neðan kemur heading:
   `Hugmyndir sem verða líklega að Teskeiðum`
3. Þar birtast birtar hugmyndir úr `ideas` sem eru ekki `status = 'launched'`.
4. Röðun er sama og í hugmyndabankanum:
   - `is_featured desc`
   - `votes_count desc`
   - og síðan client-side `PersonalizedIdeaGrid` sem færir þegar kosnar
     hugmyndir neðar fyrir sama browser.
5. Hver hugmynd notar sama card og vote button og public hugmyndabankinn.
6. Smellur á hugmynd fer á canonical `/hugmyndir/[slug]`.

## Framkvæmdarplan fyrir Claude Code

### 1. Fjarlægja harðkóðaða disabled lista

Í `app/auth-mvp/heim/page.tsx`:

- Fjarlægja `UPCOMING_KEYS`.
- Fjarlægja disabled button renderið sem sýnir `Væntanlegt`.
- Ekki halda gamla listanum sem fallback nema Stebbi biðji sérstaklega um það.

### 2. Sækja hugmyndir úr sama gagnagjafa og hugmyndabankinn

Í `app/auth-mvp/heim/page.tsx`:

- Nota `createClient()` með venjulegum Supabase server client, ekki `getAdmin()`.
- Sækja úr `ideas`:

```ts
supabase
  .from('ideas')
  .select('*')
  .eq('is_public', true)
  .neq('status', 'launched')
  .order('is_featured', { ascending: false })
  .order('votes_count', { ascending: false })
```

Athugið:

- Þetta má keyra samhliða profile query ef það passar vel.
- Ekki nota service-role fyrir þetta.
- Ekki sýna drög eða falin admin gögn.
- `archived` er tæknilega ekki `launched`, þannig að það birtist ef það er
  `is_public=true`. Þetta fylgir orðalagi Stebba: allar hugmyndir sem eru ekki
  komnar í stöðuna `Komið út`. Claude Code á ekki að útiloka `archived` nema
  Stebbi samþykki það sérstaklega.

### 3. Endurnýta `PersonalizedIdeaGrid`

Í `app/auth-mvp/heim/page.tsx`:

- Importa `PersonalizedIdeaGrid`:

```ts
import { PersonalizedIdeaGrid } from '@/components/teskeid/PersonalizedIdeaGrid'
```

- Rendera hugmyndirnar með:

```tsx
<PersonalizedIdeaGrid ideas={homeIdeas ?? []} />
```

Ekki búa til nýjan vote button, nýja card componenta eða sér kosningalógík fyrir
`/heim`.

Ef spacing eða card-stærð verður of þung á mobile má Claude Code búa til
afmarkaðan prop á `IdeaGrid` síðar, en fyrsta útfærsla á að endurnýta
canonical komponentana.

### 4. Texti og þýðingar

Í `messages/is.json`, undir `teskeid.home`:

- Breyta eða bæta við lykli fyrir section heading:

```json
"homeIdeasTitle": "Hugmyndir sem verða líklega að Teskeiðum"
```

Codex mælir með að nota nýjan lykil frekar en að endurnýta
`upcomingIdeasTitle`, því gamla nafnið `upcoming` tengist disabled-listanum sem
er að hverfa.

Í `messages/en.json`, undir `teskeid.home`:

```json
"homeIdeasTitle": "Ideas likely to become Teskeiðar"
```

Ekki setja þennan texta hardcoded í component.

### 5. Villa og tómt state

Ef query á `ideas` mistekst:

- `/heim` má ekki brotna.
- Sýna annaðhvort engan hugmyndahluta eða rólegt fallback.
- Ekki logga Supabase error details sem gætu innihaldið óþarfa gögn.
- Generic log er í lagi, t.d. `[heim/page] ideas query failed`.

Ef engar hugmyndir finnast:

- `PersonalizedIdeaGrid`/`IdeaGrid` sýnir núna `Engar hugmyndir fundust.`
- Það er ásættanlegt í Phase A.

### 6. Ekki breyta canonical hugmyndabankanum nema nauðsynlegt sé

Ef Claude Code finnur endurtekna query-lógík milli `app/page.tsx` og
`app/auth-mvp/heim/page.tsx`, má bæta við litlum shared helper, til dæmis:

```ts
getPublicIdeasQuery(supabase)
```

En ekki gera stóra refactoringu. Þetta er lítil product-breyting og á ekki að
opna nýtt data-lag nema það minnki raunverulega áhættu.

## Ekki í scope

Claude Code á ekki að:

- Breyta voting API.
- Breyta `votes` töflum, SQL, RLS eða migrations.
- Breyta admin hugmyndaviðmóti.
- Breyta canonical `/hugmyndir/[slug]` síðum nema test sýni nauðsyn.
- Breyta public forsíðu nema til að deila litlum helper með sömu query-röðun.
- Búa til nýja carousel-lógík.
- Bæta við harðkóðuðum hugmyndalista.
- Sýna hugmyndir með `is_public=false`.
- Sýna `status='launched'` í þessum `/heim` hugmyndahluta.

## Áhætta

**Heildaráhætta:** Lág til miðlungs.

Áhættan er aðallega UI/data regression:

- `/heim` gæti orðið þyngri ef margar hugmyndir eru birtar. Fyrsta útgáfa má
  samt sýna allar, því Stebbi bað um allar ekki-launched hugmyndir.
- Ef public RLS/grants á `ideas` bila, má `/heim` ekki hrynja.
- `PersonalizedIdeaGrid` kallar `/api/votes?idea_ids=...`; það þarf að virka
  inni á authenticated `/heim` eins og á public forsíðu.
- Kosning af `/heim` þarf að uppfæra count og voted state eins og á public
  hugmyndabankanum.

Engin Supabase schema-breyting, RLS-breyting, production gögn eða auth-gögn eiga
að verða fyrir áhrifum.

## Prófanir sem Claude Code á að uppfæra eða bæta við

### `lib/__tests__/home-page.test.tsx`

Uppfæra gömlu upcoming tests:

- Fjarlægja eða breyta tests sem búast við 7 disabled `Væntanlegt` rows.
- Bæta við tests sem staðfesta:
  - heading `Hugmyndir sem verða líklega að Teskeiðum` birtist.
  - query á `ideas` notar `is_public=true`.
  - query á `ideas` útilokar `status='launched'`.
  - röðun notar `is_featured desc` og `votes_count desc`.
  - birt hugmynd birtist sem linkur á `/hugmyndir/[slug]`.
  - `status='launched'` hugmynd birtist ekki.
  - `is_public=false` hugmynd birtist ekki.
  - query-villa brýtur ekki `/heim`.

### Component/vote tests

Ef `PersonalizedIdeaGrid` er ekki auðvelt að prófa í `home-page.test.tsx`, bæta
við focused test sem tryggir að `/heim` renderi `IdeaCard`/`VoteButton` gegnum
canonical componentana.

Ef núverandi mocks gera það erfitt, má mocka `PersonalizedIdeaGrid` í
`home-page.test.tsx` og hafa sér integration-ish test fyrir raunverulega
komponenta. Mikilvægast er að koma í veg fyrir að `/heim` fái nýja sér
kosningalógík.

## Skipanir sem Claude Code á að keyra

```bash
npm run test:run -- lib/__tests__/home-page.test.tsx
npm run test:run -- lib/__tests__/votes.test.ts lib/__tests__/home-page.test.tsx
npm run type-check
```

Ef `votes.test.ts` er ekki til eða heitir öðru nafni skal Claude Code keyra þau
próf sem verja `/api/votes`.

Ef breytingin snertir `PersonalizedIdeaGrid`, `IdeaGrid`, `IdeaCard` eða
`VoteButton`, keyra líka viðeigandi component tests ef þau eru til.

## Localhost checks for Stebbi

Stebbi keyrir dev server sjálfur.

### Test 1: Heading og listi birtast á `/heim`

Setup:

- Skrá inn á localhost.
- Hafa til nokkrar public hugmyndir í local gagnagrunni.

Skref:

1. Fara á `/heim`.
2. Skruna niður fyrir virkar Teskeiðar.

Vænt:

- Section heitir `Hugmyndir sem verða líklega að Teskeiðum`.
- Gamli disabled listinn með `Væntanlegt` birtist ekki.
- Hugmyndir birtast sem cards, ekki disabled rows.

### Test 2: `Komið út` birtist ekki

Setup:

- Local gagnagrunnur hefur að minnsta kosti eina hugmynd með
  `status='launched'`, til dæmis `Lánað og skilað` eða `Umönnun`.

Skref:

1. Fara á `/heim`.
2. Skoða hugmyndahlutann.

Vænt:

- Hugmyndir í stöðunni `Komið út` birtast ekki í þessum hluta.
- Virkar Teskeiðar geta samt birst ofar í `Teskeiðar` hlutanum samkvæmt feature
  access.

### Test 3: Sömu hugmyndir og hugmyndabankinn, mínus `Komið út`

Skref:

1. Fara á public forsíðu `/`.
2. Skoða röðun hugmynda í hugmyndabankanum.
3. Fara á `/heim`.
4. Bera saman hugmyndahlutann.

Vænt:

- `/heim` notar sömu röðunarlógík og hugmyndabankinn.
- Munurinn er að `/heim` útilokar `Komið út`.
- Featured hugmyndir koma ofar.
- Fleiri atkvæði raða ofar innan sömu featured stöðu.

### Test 4: Kosning virkar á `/heim`

Skref:

1. Velja hugmynd á `/heim` sem Stebbi hefur ekki kosið áður í sama browser.
2. Smella á vote button.
3. Fylgjast með count og state.
4. Refresh-a `/heim`.
5. Fara á public forsíðu `/` eða canonical hugmyndasíðu `/hugmyndir/[slug]`.

Vænt:

- Count hækkar strax eða eftir stutta stund.
- Button fer í voted state.
- Eftir refresh er hugmyndin enn merkt kosin.
- Public hugmyndabankinn/canonical síða sýnir sama vote state/count.
- Ekki er hægt að kjósa sömu hugmynd tvisvar í sama browser.

### Test 5: Smellur á hugmynd opnar canonical síðu

Skref:

1. Smella á hugmyndacard á `/heim`.

Vænt:

- Notandi fer á `/hugmyndir/[slug]`.
- Þar birtist sama hugmynd og hægt er að kjósa þar líka.

### Test 6: Feature access hefur ekki áhrif á hugmyndahlutann

Setup:

- Prófa með `LOANS_ENABLED=false`.
- Prófa með `UMONNUN_ENABLED=false`.

Skref:

1. Fara á `/heim`.
2. Skoða virkar Teskeiðar.
3. Skoða hugmyndahlutann.

Vænt:

- Virkar Teskeiðar fela sig samkvæmt feature flags.
- Hugmyndahlutinn birtist samt, því hann byggir á public hugmyndabankanum.
- Engin login/auth villa kemur vegna hugmyndahlutans.

### Test 7: Mobile 360-460 px

Setup:

- Opna `/heim` í mobile viewport, 360-460 px.

Skref:

1. Skruna frá kveðju niður í virkar Teskeiðar og hugmyndahlutann.
2. Skoða cards, status badges og vote buttons.
3. Kjósa eina hugmynd.

Vænt:

- Enginn horizontal scroll.
- Texti skarast ekki.
- Vote button er snertivænn.
- Cards eru ekki of þröng eða klunnaleg.

### Hvað á ekki að prófa kæruleysislega

- Ekki breyta production hugmyndagögnum í þessari localhost-prófun.
- Ekki keyra SQL eða migrations.
- Ekki breyta RLS/grants.
- Ekki nota production Supabase service-role lykil á localhost.
- Ekki eyða eða fela public hugmyndir bara til að prófa þetta.

## Copy/paste til Claude Code

```text
Claude Code: Vinsamlegast útfærðu TODO #17 sem afmarkaða breytingu á `/heim`.

Markmið: Gamli `Hugmyndir`/`Væntanlegt` disabled-listinn á `/heim` á að verða annað view á hugmyndabankann. Sectionið á að heita `Hugmyndir sem verða líklega að Teskeiðum` og sýna allar birtar hugmyndir sem eru ekki í stöðunni `Komið út`.

Vinsamlegast:
1. Fjarlægðu `UPCOMING_KEYS` og disabled `Væntanlegt` listann úr `app/auth-mvp/heim/page.tsx`.
2. Sæktu hugmyndir úr `ideas` með venjulegum Supabase server client, ekki service-role: `is_public=true`, `status != 'launched'`, `order is_featured desc`, `order votes_count desc`.
3. Endurnýttu `PersonalizedIdeaGrid` svo `/heim` noti sömu röðun eftir voted-state og sama `IdeaCard`/`VoteButton` og public hugmyndabankinn.
4. Bættu við i18n lykli undir `teskeid.home`, t.d. `homeIdeasTitle`: `Hugmyndir sem verða líklega að Teskeiðum` og ensku samsvörun.
5. Ekki búa til nýja kosningalógík, ekki breyta `/api/votes`, SQL, RLS, admin eða public hugmyndasíðunum nema lítil shared helper minnki duplication.
6. Uppfærðu `lib/__tests__/home-page.test.tsx`: gömlu upcoming tests eiga að víkja fyrir tests sem staðfesta heading, public-only gögn, launched-exclusion, röðun, canonical links og að query-villa brjóti ekki `/heim`.
7. Keyrðu `npm run test:run -- lib/__tests__/home-page.test.tsx`, viðeigandi vote tests og `npm run type-check`.
8. Skilaðu handoffi með breyttum skrám, prófum, exit codes, áhættu og Localhost checks for Stebbi.
```
