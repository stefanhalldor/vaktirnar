# TODO #17/#42: Tilbúnar Teskeiðar sýnilegri og hugmyndir í collapsed skúffu

**Agent:** Codex  
**Fyrir:** Stebbi og Claude Code  
**Dagsetning:** 2026-06-18  
**Staða:** Beint framkvæmdarhandoff, Stebbi vill fara í útfærslu  
**Tengd TODO:** #17 Hugmyndir úr hugmyndabankanum á `/heim`; #42 Tilbúnar Teskeiðar efst og síðast opnuð fyrst  
**Byggir á:** `ai-handoff/2026-06-18-0726-todo-017-v002-codex-home-idea-bank-view-handoff.md`

## Ákvörðun Stebba

Stebbi vill gera tilbúnu Teskeiðarnar sýnilegri á `/heim`.

Ný stefna:

- Efra sectionið á ekki bara að vera einfaldur listi.
- Það á að heita `Tilbúnar Teskeiðar`.
- Þar á að sýna hugmyndir í stöðunni `Komið út`, sem eru raunverulega opnanlegar
  fyrir viðkomandi notanda.
- Þær mega nota svipaða sýn og hugmyndabankinn, en án atkvæðatalningar og án
  kosningatakka.
- Neðra sectionið `Hugmyndir sem verða líklega að Teskeiðum` á að fara í
  collapsed skúffu.
- Þegar skúffan er opnuð á hún að sýna hugmyndabankann fyrir non-launched
  hugmyndir og leyfa notanda að kjósa þar.

Markmið: Tilbúnar Teskeiðar eiga að vera það sem notandi tekur eftir fyrst.
Hugmyndirnar eru áfram til staðar, en aðeins bakgrunnslegri þar til notandi
opnar skúffuna.

## Núverandi staða

`app/auth-mvp/heim/page.tsx` er nú þegar með:

- `id="teskeidar"` á Teskeiða-section.
- Feature access check fyrir:
  - `lanad-og-skilad`
  - `umonnun`
- Einfaldan lista yfir virkar Teskeiðar.
- Gamlan disabled `Væntanlegt` lista eða væntanlegt hugmyndasvæði, eftir því
  hvar Claude Code er statt með v002.

Canonical hugmyndabankinn notar:

- `components/teskeid/PersonalizedIdeaGrid.tsx`
- `components/teskeid/IdeaGrid.tsx`
- `components/teskeid/IdeaCard.tsx`
- `components/teskeid/VoteButton.tsx`

`Komið út` samsvarar gagnastöðunni:

```ts
status === 'launched'
```

Ekki sía eftir íslenska textanum `Komið út`.

## Útlits- og hegðunarmarkmið

### 1. `Tilbúnar Teskeiðar`

Section efst undir kveðju og `Nýlegt`:

```txt
Tilbúnar Teskeiðar
[ card: Lánað og skilað ]
[ card: Umönnun ]
```

Cards eiga að vera greinilega primary:

- stærri og ríkari en gamla row-listinn
- title
- stutt lýsing úr `idea.short_description`
- status badge `Komið út`
- skýr CTA, t.d. `Opna`
- engin atkvæðatalning
- enginn vote button

Ekki þarf að gera þetta markaðslega flashy. Betra er að hafa þetta rólegt en
skýrt: tilbúnar lausnir fyrst, hugmyndir neðar.

### 2. `Hugmyndir sem verða líklega að Teskeiðum`

Neðan við `Tilbúnar Teskeiðar`:

```txt
[ closed drawer row ]
Hugmyndir sem verða líklega að Teskeiðum      Skoða
```

Collapsed by default.

Þegar notandi opnar:

- sýna public hugmyndir sem eru ekki `status='launched'`
- nota sömu röðunarlógík og hugmyndabankinn
- nota `PersonalizedIdeaGrid`
- leyfa kosningu með sama `VoteButton`
- cards fara á `/hugmyndir/[slug]`

Skúffan þarf að nota rétt accessibility:

- button, ekki bara div
- `aria-expanded`
- `aria-controls`
- skýr focus state
- chevron/icon má snúast eða breytast

Ekki nota auto-open, ekki vista persistent state í Phase A nema það sé mjög
einfalt og hættulaust. Collapsed by default er nóg.

## Gagnalógík

### Sækja hugmyndir úr canonical public data

Í `app/auth-mvp/heim/page.tsx`:

- Nota venjulegan Supabase server client úr `createClient()`.
- Ekki nota `getAdmin()` eða service-role fyrir hugmyndabankann.
- Sækja public hugmyndir:

```ts
supabase
  .from('ideas')
  .select('*')
  .eq('is_public', true)
  .order('is_featured', { ascending: false })
  .order('votes_count', { ascending: false })
```

Síðan skipta í:

```ts
const launchedIdeas = ideas.filter((idea) => idea.status === 'launched')
const futureIdeas = ideas.filter((idea) => idea.status !== 'launched')
```

Þetta heldur sömu server-röðun og hugmyndabankinn.

Ef Claude Code vill frekar query-a tvö sett má það vera í lagi, en þá verður að
nota sömu röðun á bæði sett og forðast duplication sem getur farið úr sync við
public hugmyndabankann.

### Aðeins sýna tilbúnar Teskeiðar sem notandi má opna

Ekki sýna `launched` card nema notandi hafi aðgang að raunverulegri virkni.

Lágmarks route/access mapping:

```ts
const READY_TESKEID_ROUTES = {
  'lanad-og-skilad': {
    href: '/auth-mvp/lanad-og-skilad',
    enabled: loansEnabled,
  },
  umonnun: {
    href: '/auth-mvp/umonnun',
    enabled: umonnunEnabled,
  },
}
```

Viðmið:

- `Lánað og skilað` birtist aðeins ef `loansEnabled === true`.
- `Umönnun` birtist aðeins ef `umonnunEnabled === true`.
- Ef til er public `launched` hugmynd án route/access mapping, ekki sýna hana í
  `Tilbúnar Teskeiðar` í Phase A. Það kemur í veg fyrir dauða linka eða að
  notandi sjái Teskeið sem hann getur ekki opnað.

Ekki breyta feature access logic í þessum pakka.

## Component tillaga

Claude Code má velja einföldustu leiðina, en Codex mælir með tveimur litlum
componentum frekar en stórri refactoringu:

### `ReadyTeskeidCard`

Staðsetning:

- annaðhvort inni í `app/auth-mvp/heim/page.tsx` ef lítið
- eða `components/teskeid/ReadyTeskeidCard.tsx` ef betra fyrir test/enduruse

Props:

```ts
{
  idea: Idea
  href: string
}
```

Hegðun:

- notar `Link`
- sýnir title, short_description, `StatusBadge`
- sýnir CTA `Opna`
- sýnir ekki `VoteButton`
- sýnir ekki atkvæðatölu

Má endurnýta icon-mynstur úr `IdeaCard`, en ekki gera stóra refactoringu nema
það sé einfalt. Ef icon helper er private í `IdeaCard`, má annaðhvort færa hann
varlega í shared helper eða nota einfalt default icon í Phase A.

### `HomeIdeasDrawer`

Staðsetning:

- `components/teskeid/HomeIdeasDrawer.tsx` eða local client component nálægt
  heimaskjánum.

Props:

```ts
{
  title: string
  ideas: Idea[]
}
```

Hegðun:

- client component með `useState(false)`
- collapsed by default
- renderar heading/toggle button
- þegar opið: `<PersonalizedIdeaGrid ideas={ideas} />`

Ekki endurútfæra kosningalógík.

## Textar og i18n

Í `messages/is.json`, undir `teskeid.home`, bæta við eða nota:

```json
"readyTeskeidarTitle": "Tilbúnar Teskeiðar",
"homeIdeasTitle": "Hugmyndir sem verða líklega að Teskeiðum",
"homeIdeasDrawerOpen": "Skoða hugmyndir",
"homeIdeasDrawerClose": "Fela hugmyndir",
"readyTeskeidOpen": "Opna"
```

Í `messages/en.json`, undir `teskeid.home`:

```json
"readyTeskeidarTitle": "Ready Teskeiðar",
"homeIdeasTitle": "Ideas likely to become Teskeiðar",
"homeIdeasDrawerOpen": "View ideas",
"homeIdeasDrawerClose": "Hide ideas",
"readyTeskeidOpen": "Open"
```

Ekki hardcode-a nýjan notendatexta í component.

## Ekki í scope

Claude Code á ekki að:

- Breyta `/api/votes`.
- Breyta SQL, migrations, RLS eða grants.
- Breyta feature access logic.
- Bæta við Umönnun gögnum inn í Teskeið.is.
- Sýna launched card sem notandi hefur ekki aðgang að.
- Búa til nýja kosningalógík.
- Breyta admin hugmyndabankanum.
- Innleiða “síðast opnuð fyrst” server-side röðun í þessum pakka. Það er enn
  sér hluti af #42.

## Áhætta

**Heildaráhætta:** Miðlungs-lág.

Helstu áhættur:

- Ready cards gætu sýnt eitthvað sem notandi má ekki opna ef route/access mapping
  er ekki rétt.
- Drawer gæti gert kosningahlutann óaðgengilegan ef `button`/ARIA/focus er ekki
  rétt.
- `/heim` gæti orðið þyngri ef margar hugmyndir eru renderaðar þegar skúffan er
  opnuð.
- Ef `PersonalizedIdeaGrid` er inni í collapsed drawer þarf að staðfesta að vote
  sync og layout virki þegar drawer opnast.

Engin production gögn eða Supabase schema eiga að verða fyrir áhrifum.

## Prófanir sem Claude Code á að uppfæra eða bæta við

### `lib/__tests__/home-page.test.tsx`

Bæta við eða uppfæra tests fyrir:

- Heading `Tilbúnar Teskeiðar` birtist.
- Heading `Teskeiðar` er ekki lengur section heading ef Stebbi samþykkir nýja
  nafnið.
- `launched` hugmynd með aðgang birtist sem ready card.
- Ready card hefur link á rétta route, t.d. `/auth-mvp/lanad-og-skilad`.
- Ready card sýnir `Komið út`.
- Ready card sýnir ekki vote button og ekki atkvæðatölu.
- `launched` hugmynd án feature access birtist ekki.
- `launched` hugmynd án route/access mapping birtist ekki.
- Drawer heading `Hugmyndir sem verða líklega að Teskeiðum` birtist.
- Drawer er collapsed by default.
- Non-launched hugmyndir sjást ekki áður en drawer er opnuð.
- Þegar drawer er opnuð birtast non-launched public hugmyndir.
- Non-launched hugmyndir hafa vote button.
- `status='launched'` hugmynd birtist ekki í drawer.
- `is_public=false` hugmynd birtist hvergi.
- Query villa á ideas brýtur ekki `/heim`.

### `lib/__tests__/teskeid-menu.test.tsx`

Ef handoff v006 er útfært samhliða:

- Staðfesta að `Teskeiðar` hamburger link fari enn á `#teskeidar`.
- Staðfesta að nýja `Tilbúnar Teskeiðar` sectionið sé enn undir `id="teskeidar"`.

### Component tests

Ef `HomeIdeasDrawer` eða `ReadyTeskeidCard` verða sér componentar:

- Testa collapsed/open hegðun.
- Testa `aria-expanded`.
- Testa að ready card renderi `Opna` en ekki `VoteButton`.

## Skipanir sem Claude Code á að keyra

```bash
npm run test:run -- lib/__tests__/home-page.test.tsx
npm run test:run -- lib/__tests__/teskeid-menu.test.tsx lib/__tests__/home-page.test.tsx
npm run type-check
```

Ef ný component test verða til skal keyra þau sérstaklega líka.

Ef Claude Code snertir `VoteButton`, `IdeaCard`, `IdeaGrid` eða
`PersonalizedIdeaGrid`, keyra viðeigandi tests og a.m.k. vote API tests ef þau
eru til.

## Localhost checks for Stebbi

Stebbi keyrir dev server sjálfur.

### Test 1: Tilbúnar Teskeiðar eru efst og sýnilegri

Setup:

- Skrá inn á localhost.
- Hafa `LOANS_ENABLED=true`.
- Hafa `UMONNUN_ENABLED=true` og viðeigandi `UMONNUN_FLAG`/feature access ef
  Stebbi vill sjá Umönnun líka.

Skref:

1. Fara á `/heim`.
2. Skoða svæðið undir kveðju og `Nýlegt`.

Vænt:

- Section heitir `Tilbúnar Teskeiðar`.
- `Lánað og skilað` birtist sem card, ekki bara þunn row.
- Ef Umönnun access er virkur birtist `Umönnun` líka sem card.
- Cards eru greinilega meira áberandi en hugmyndaskúffan.

### Test 2: Ready cards opna rétta virkni

Skref:

1. Smella á `Lánað og skilað` ready card eða `Opna`.
2. Fara til baka á `/heim`.
3. Ef Umönnun sést, smella á `Umönnun` ready card eða `Opna`.

Vænt:

- `Lánað og skilað` fer á `/auth-mvp/lanad-og-skilad`.
- `Umönnun` fer á `/auth-mvp/umonnun`.
- Engin card opnar `/hugmyndir/[slug]` fyrir tilbúna Teskeið í þessu sectioni.

### Test 3: Ready cards sýna ekki atkvæði

Skref:

1. Skoða `Tilbúnar Teskeiðar`.

Vænt:

- Enginn vote button er inni í ready cards.
- Engin atkvæðatala birtist í ready cards.
- `Komið út` badge má birtast.

### Test 4: Feature access ræður ready cards

Setup:

- Prófa með `LOANS_ENABLED=false`.
- Prófa með `UMONNUN_ENABLED=false` eða án per-user Umönnun access.

Skref:

1. Fara á `/heim`.
2. Skoða `Tilbúnar Teskeiðar`.

Vænt:

- `Lánað og skilað` hverfur þegar `LOANS_ENABLED=false`.
- `Umönnun` hverfur þegar notandi hefur ekki Umönnun access.
- Hugmyndaskúffan getur samt verið til staðar.

### Test 5: Hugmyndaskúffa er collapsed by default

Skref:

1. Fara á `/heim`.
2. Finna `Hugmyndir sem verða líklega að Teskeiðum`.

Vænt:

- Sectionið er sýnilegt sem skúffa/toggle.
- Hugmyndacards eru ekki sýnileg strax.
- Toggle sýnir eitthvað á borð við `Skoða hugmyndir`.

### Test 6: Opna hugmyndaskúffu

Skref:

1. Smella á `Skoða hugmyndir`.

Vænt:

- Skúffan opnast.
- Non-launched hugmyndir birtast.
- Cards líta út eins og hugmyndabankinn.
- Vote button er til staðar.
- Toggle breytist í `Fela hugmyndir` eða samsvarandi stöðu.

### Test 7: Kosning virkar inni í skúffu

Skref:

1. Opna hugmyndaskúffu.
2. Kjósa hugmynd sem Stebbi hefur ekki kosið áður í sama browser.
3. Refresh-a `/heim`.
4. Opna skúffu aftur.

Vænt:

- Atkvæði hækkar.
- Button fer í voted state.
- Eftir refresh er state varðveitt eins og á public hugmyndabankanum.
- Ekki er hægt að kjósa sömu hugmynd tvisvar í sama browser.

### Test 8: `Komið út` er ekki í hugmyndaskúffu

Skref:

1. Opna hugmyndaskúffu.
2. Leita að `Lánað og skilað` eða `Umönnun` ef þær eru `Komið út`.

Vænt:

- Tilbúnar Teskeiðar birtast ekki aftur í hugmyndaskúffunni.
- Þær eru aðeins í `Tilbúnar Teskeiðar`.

### Test 9: Mobile 360-460 px

Skref:

1. Opna `/heim` í mobile viewport.
2. Skoða `Tilbúnar Teskeiðar`.
3. Opna/loka hugmyndaskúffu.
4. Kjósa hugmynd.

Vænt:

- Enginn horizontal scroll.
- Ready cards eru skýr en ekki of stór.
- Drawer toggle er auðvelt að hitta.
- Vote buttons virka án overlap.
- Texti skarast ekki.

### Hvað á ekki að prófa kæruleysislega

- Ekki keyra SQL eða migrations.
- Ekki breyta production hugmyndagögnum.
- Ekki breyta Vercel env í production.
- Ekki nota production service-role lykil á localhost.
- Ekki setja Umönnun gögn inn í Teskeið.is.

## Copy/paste til Claude Code

```text
Claude Code: Stebbi vill fara beint í framkvæmd á næsta `/heim` áfanga fyrir TODO #17/#42.

Markmið:
- Efra sectionið á `/heim` heiti `Tilbúnar Teskeiðar`.
- Þar birtast public hugmyndir með `status='launched'` sem notandinn má raunverulega opna, t.d. `Lánað og skilað` ef `loansEnabled` og `Umönnun` ef `umonnunEnabled`.
- Ready cards eiga að vera sýnilegri en gamla row-listinn, svipuð hugmyndabankakortum en án atkvæðatalningar og án vote buttons. CTA: `Opna`.
- `Hugmyndir sem verða líklega að Teskeiðum` fer í collapsed skúffu, closed by default.
- Þegar skúffan er opnuð sýnir hún public hugmyndir með `status !== 'launched'`, sömu röðun og hugmyndabankinn og sömu `PersonalizedIdeaGrid`/`VoteButton` kosningalógík.

Vinsamlegast:
1. Sæktu public ideas með venjulegum Supabase server client, ekki service-role: `is_public=true`, order `is_featured desc`, order `votes_count desc`.
2. Skiptu þeim í `launchedIdeas` og `futureIdeas` á `status === 'launched'`.
3. Sýndu aðeins launched ready cards sem hafa explicit route/access mapping: `lanad-og-skilad -> /auth-mvp/lanad-og-skilad` þegar `loansEnabled`, `umonnun -> /auth-mvp/umonnun` þegar `umonnunEnabled`.
4. Búðu til litla `ReadyTeskeidCard` lausn eða local component sem sýnir title, description, `Komið út` badge og `Opna`, en engan vote button og enga atkvæðatölu.
5. Búðu til collapsed drawer fyrir `Hugmyndir sem verða líklega að Teskeiðum` með `aria-expanded`, `aria-controls`, focus state og `PersonalizedIdeaGrid` inni þegar hún er opin.
6. Bættu i18n lyklum við `messages/is.json` og `messages/en.json`: `readyTeskeidarTitle`, `homeIdeasTitle`, `homeIdeasDrawerOpen`, `homeIdeasDrawerClose`, `readyTeskeidOpen`.
7. Ekki breyta `/api/votes`, SQL, RLS, feature access logic eða admin.
8. Uppfærðu próf í `lib/__tests__/home-page.test.tsx` fyrir ready cards, collapsed drawer, launched/non-launched skiptingu, access gating og að ready cards hafi ekki vote UI.
9. Keyrðu `npm run test:run -- lib/__tests__/home-page.test.tsx`, `npm run test:run -- lib/__tests__/teskeid-menu.test.tsx lib/__tests__/home-page.test.tsx` og `npm run type-check`.
10. Skilaðu handoffi með breyttum skrám, prófum, exit codes, áhættu og Localhost checks for Stebbi.
```
