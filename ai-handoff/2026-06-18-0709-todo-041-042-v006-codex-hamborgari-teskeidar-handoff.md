# TODO #42: Hamborgari sýni `Teskeiðar` í stað `Lánað og skilað`

**Agent:** Codex  
**Fyrir:** Stebbi og Claude Code  
**Dagsetning:** 2026-06-18  
**Staða:** Framkvæmdarhandoff, bíður Claude Code útfærslu  
**Tengd TODO:** #42 Tilbúnar Teskeiðar efst og síðast opnuð fyrst  
**Tengt samhengi:** #41 Umönnun sem feature-flagged Teskeið

## Samhengi frá Stebba

Stebbi benti á að hamborgaravalmyndin sýnir enn sértækt atriði:

`Lánað og skilað`

Nú þegar fleiri Teskeiðar eru komnar inn, sérstaklega `Umönnun`, er réttara að
hamborgaravalmyndin leiði notanda í almennt Teskeiða-yfirlit:

`Teskeiðar`

Markmiðið er að menu-ið verði skalanlegra og þurfi ekki að bæta við einni línu
fyrir hverja nýja Teskeið.

## Núverandi staða í kóða

Codex skoðaði:

- `components/teskeid/TeskeidMenu.tsx`
- `messages/is.json`
- `messages/en.json`
- `lib/__tests__/teskeid-menu.test.tsx`
- `app/auth-mvp/heim/page.tsx`

Núverandi authenticated menu items eru skilgreind í
`components/teskeid/TeskeidMenu.tsx`:

```ts
const AUTH_ITEMS = [
  { href: '/auth-mvp/heim', labelKey: 'home', icon: Home },
  { href: '/auth-mvp/minn-profill', labelKey: 'profile', icon: UserCircle },
  { href: '/auth-mvp/lanad-og-skilad', labelKey: 'loans', icon: Archive },
  { href: '/', labelKey: 'ideas', icon: Lightbulb },
  { href: '/senda-hugmynd', labelKey: 'submitIdea', icon: Send },
] as const
```

`messages/is.json` notar:

```json
"loans": "Lánað og skilað"
```

`messages/en.json` notar:

```json
"loans": "Loaned and returned"
```

## Tillaga Codex

### Útlit í authenticated hamborgara

Authenticated menu á að sýna:

- `Heim`
- `Minn prófíll`
- `Teskeiðar`
- `Hugmyndabankinn`
- `Ný hugmynd`
- `Útskrá`

Codex mælir með að halda röðinni eins nálægt núverandi menu og hægt er í þessum
litla pakka. Það minnkar áhættu og gerir breytinguna auðvelda fyrir Stebba að
prófa.

Ekki bæta `Umönnun` sem sér línu í hamborgarann í þessum pakka. `Teskeiðar` á að
leiða á yfirlitið þar sem feature-gating ræður hvort `Umönnun` birtist.

### Link hegðun

`Teskeiðar` í hamborgaranum á að vísa á Teskeiða-hlutann á heimaskjánum:

```txt
/auth-mvp/heim#teskeidar
```

Þetta þýðir að Claude Code þarf líklega að bæta `id="teskeidar"` við Teskeiða
section eða heading í `app/auth-mvp/heim/page.tsx`.

Ef `#teskeidar` reynist óþægilegt vegna layout/scroll má fallback vera
`/auth-mvp/heim`, en Codex mælir með anchor fyrst þar sem Stebbi er sérstaklega
að tala um Teskeiða-yfirlitið.

### Active state

Núverandi active check:

```ts
const active = pathname === href || (href !== '/' && pathname.startsWith(href + '/'))
```

Þetta virkar illa með `href="/auth-mvp/heim#teskeidar"`, því `usePathname()`
skilar ekki hash.

Claude Code á að bæta einföldu explicit active-mynstri við menu item, til dæmis:

```ts
{
  href: '/auth-mvp/heim#teskeidar',
  labelKey: 'teskeidar',
  icon: LayoutGrid,
  activePrefixes: ['/auth-mvp/lanad-og-skilad', '/auth-mvp/umonnun'],
}
```

Þá er `Teskeiðar` active þegar notandi er inni í virkum Teskeiðum, en `Heim`
helst active á `/auth-mvp/heim`.

Ekki láta bæði `Heim` og `Teskeiðar` vera active samtímis á venjulegu
`/auth-mvp/heim`.

## Framkvæmdarplan fyrir Claude Code

### 1. Uppfæra menu item

Í `components/teskeid/TeskeidMenu.tsx`:

- Skipta út authenticated item:
  - frá: `/auth-mvp/lanad-og-skilad`, `labelKey: 'loans'`, `Archive`
  - í: `/auth-mvp/heim#teskeidar`, `labelKey: 'teskeidar'`, lucide icon fyrir
    yfirlit, t.d. `LayoutGrid`
- Ekki bæta `Umönnun` sem sér menu item.
- Ekki breyta public menu.

### 2. Uppfæra active state

Bæta við stuðningi við explicit active prefixes eða sambærilegt einfalt mynstur.

Viðmið:

- `Heim` active á `/auth-mvp/heim`
- `Teskeiðar` active á:
  - `/auth-mvp/lanad-og-skilad`
  - `/auth-mvp/lanad-og-skilad/ny`
  - `/auth-mvp/lanad-og-skilad/breyta/[id]`
  - `/auth-mvp/umonnun`
- `Heim` ekki active þegar notandi er á `/auth-mvp/lanad-og-skilad`
- `Teskeiðar` þarf ekki að vera active á `/auth-mvp/heim`, því þar er `Heim`
  eðlilegt active item.

### 3. Bæta við anchor á heimaskjá

Í `app/auth-mvp/heim/page.tsx`:

- Setja `id="teskeidar"` á section eða heading sem inniheldur virkar Teskeiðar.
- Bæta við `scroll-mt-*` ef sticky/nav staða veldur því að heading fer undir
  efri brún.

Ekki breyta feature access logic í þessum pakka.

### 4. Uppfæra þýðingar

Í `messages/is.json`, undir `teskeid.nav`:

```json
"teskeidar": "Teskeiðar"
```

Í `messages/en.json`, undir `teskeid.nav`:

```json
"teskeidar": "Teskeiðar"
```

Codex mælir með `Teskeiðar` líka á ensku þar sem þetta er vörumerkjaheiti á
safni Teskeiða. Ef Stebbi vill síðar enskara orð má skoða `Tools`, en ekki taka
það í þessari litlu breytingu.

Ekki breyta `loans` þýðingunni; hún er áfram notuð víða fyrir `Lánað og skilað`.

### 5. Uppfæra próf

Í `lib/__tests__/teskeid-menu.test.tsx`:

- Bæta `teskeidar: 'Teskeiðar'` við mock translations.
- Uppfæra test sem segir:
  - frá: `shows Heim, Minn prófíll, Lánað og skilað when open`
  - í: `shows Heim, Minn prófíll, Teskeiðar when open`
- Assert-a að authenticated menu sýni `Teskeiðar`.
- Assert-a að authenticated menu sýni ekki `Lánað og skilað`.
- Assert-a að linkið sé:
  - `a[href="/auth-mvp/heim#teskeidar"]`
- Uppfæra active state tests:
  - `Teskeiðar` active á `/auth-mvp/lanad-og-skilad`
  - `Teskeiðar` active á subroute `/auth-mvp/lanad-og-skilad/ny`
  - `Teskeiðar` active á deep subroute `/auth-mvp/lanad-og-skilad/breyta/abc`
  - `Heim` ekki active á `/auth-mvp/lanad-og-skilad`
  - ef Umönnun route er til í testum: `Teskeiðar` active á `/auth-mvp/umonnun`

Í `lib/__tests__/home-page.test.tsx`:

- Bæta eða uppfæra test sem staðfestir að Teskeiða-section hafi anchor
  `id="teskeidar"`.

## Ekki í scope

Claude Code á ekki að:

- Bæta `Umönnun` sem sér línu í hamborgarann.
- Breyta feature-gating fyrir `Umönnun`.
- Breyta `LOANS_ENABLED`, `UMONNUN_ENABLED` eða `UMONNUN_FLAG`.
- Breyta SQL, migrations eða Supabase.
- Breyta public routes eða canonical `/auth-mvp/*` hreinsun úr #22.
- Endurraða öllu menu-inu nema nauðsynlegt sé til að leysa þetta snyrtilega.

## Áhætta

**Heildaráhætta:** Lág.

Helsta áhættan er UI-regression:

- `Teskeiðar` linkur gæti ekki scrollað rétt á heimaskjá.
- Active state gæti orðið röng, sérstaklega ef `href` inniheldur hash.
- Test sem reikna með `Lánað og skilað` í menu þurfa uppfærslu.

Engin Supabase, RLS, auth, production gögn eða secrets eiga að verða fyrir áhrifum.

## Próf og skipanir sem Claude Code á að keyra

```bash
npm run test:run -- lib/__tests__/teskeid-menu.test.tsx lib/__tests__/home-page.test.tsx
npm run type-check
```

Ef Claude Code snertir önnur menu/nav components, keyra líka viðeigandi próf:

```bash
npm run test:run -- lib/__tests__/teskeid-menu.test.tsx lib/__tests__/home-page.test.tsx lib/__tests__/profile-page.test.tsx lib/__tests__/loan-pages.test.tsx
```

## Localhost checks for Stebbi

Stebbi keyrir dev server sjálfur.

### Test 1: Authenticated hamborgari sýnir `Teskeiðar`

Setup:

- Skrá inn á localhost.
- Fara á `/auth-mvp/heim`.

Skref:

1. Opna hamborgaravalmyndina.
2. Skoða listann.

Vænt:

- Menu sýnir `Teskeiðar`.
- Menu sýnir ekki `Lánað og skilað` sem sér línu.
- `Heim`, `Minn prófíll`, `Hugmyndabankinn`, `Ný hugmynd` og `Útskrá` eru áfram
  til staðar.

### Test 2: `Teskeiðar` fer í rétt yfirlit

Setup:

- Vera á síðu sem er ekki þegar á Teskeiða-section, t.d. `/auth-mvp/minn-profill`
  eða efst á `/auth-mvp/heim`.

Skref:

1. Opna hamborgaravalmynd.
2. Smella á `Teskeiðar`.

Vænt:

- Notandi fer á `/auth-mvp/heim#teskeidar` eða `/auth-mvp/heim`.
- Ef anchor er útfærður lendir notandi við Teskeiða-hlutann.
- `Lánað og skilað` og `Umönnun` birtast áfram aðeins samkvæmt feature access.

### Test 3: Engin sér `Umönnun` lína í hamborgara

Setup:

- Prófa bæði með `UMONNUN_ENABLED=true` og með `UMONNUN_FLAG=true` ef local
  feature access er í prófun.

Skref:

1. Opna hamborgaravalmynd.

Vænt:

- `Umönnun` er ekki sér línu í hamborgaranum.
- Notandi finnur `Umönnun` inni í `Teskeiðar` á `/heim` ef feature access leyfir.

### Test 4: Active state á lánasíðum

Setup:

- Fara á `/auth-mvp/lanad-og-skilad`.

Skref:

1. Opna hamborgara.

Vænt:

- `Teskeiðar` er merkt active.
- `Heim` er ekki merkt active.

Endurtaka á undirsíðu, ef einfalt:

- `/auth-mvp/lanad-og-skilad/ny`
- `/auth-mvp/lanad-og-skilad/breyta/[id]` ef til er local hlutur

Vænt:

- `Teskeiðar` helst active á undirsíðum.

### Test 5: Active state á Umönnun

Setup:

- `Umönnun` þarf að vera sýnileg á local samkvæmt feature flags.

Skref:

1. Fara á `/auth-mvp/umonnun`.
2. Opna hamborgara.

Vænt:

- `Teskeiðar` er active.
- Engin viðkvæm Umönnun gögn birtast í Teskeið.is.

### Test 6: Mobile breidd

Setup:

- Opna localhost í 360-460 px viewport.

Skref:

1. Opna hamborgara á `/auth-mvp/heim`.
2. Skoða texta og touch-svæði.
3. Smella á `Teskeiðar`.

Vænt:

- Enginn texti skarast.
- Enginn horizontal scroll.
- `Teskeiðar` er læsilegt og takkinn er auðvelt að hitta.
- Menu lokast þegar item er valið.

## Copy/paste til Claude Code

```text
Claude Code: Vinsamlegast útfærðu litla menu-breytingu tengda TODO #42/#41.

Markmið: authenticated hamborgaravalmynd á ekki lengur að sýna `Lánað og skilað` sem sér menu item. Hún á að sýna `Teskeiðar`, sem vísar á Teskeiða-yfirlitið á heimaskjánum.

Vinsamlegast:
1. Í `components/teskeid/TeskeidMenu.tsx`, skiptu authenticated iteminu `/auth-mvp/lanad-og-skilad` + `labelKey: 'loans'` út fyrir `Teskeiðar`, helst `href: '/auth-mvp/heim#teskeidar'` og nýjan `labelKey: 'teskeidar'`.
2. Bættu við einföldu explicit active-mynstri svo `Teskeiðar` sé active á `/auth-mvp/lanad-og-skilad*` og `/auth-mvp/umonnun`, en `Heim` sé ekki active á lánasíðum.
3. Bættu `id="teskeidar"` við Teskeiða-section í `app/auth-mvp/heim/page.tsx`.
4. Bættu `teskeidar: "Teskeiðar"` í `messages/is.json` og `messages/en.json`; ekki breyta `loans` þýðingunni.
5. Uppfærðu `lib/__tests__/teskeid-menu.test.tsx` og bættu við/uppfærðu home-page test fyrir anchor ef við á.
6. Ekki bæta `Umönnun` sem sér línu í hamborgara og ekki breyta feature flags, SQL, Supabase eða auth.
7. Keyrðu `npm run test:run -- lib/__tests__/teskeid-menu.test.tsx lib/__tests__/home-page.test.tsx` og `npm run type-check`.
8. Skilaðu stuttu handoffi með breyttum skrám, prófum, exit codes og localhost checks.
```
