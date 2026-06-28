# #5 v007 - Mobile app-upplifun: localhost audit og fyrsti lagfæringarhringur

## Fyrir Claude Code

Næsta opna TODO atriði er #5: samræmd mobile app-upplifun á öllu Teskeið.is.

Þetta er vítt atriði. Ekki reyna að laga allt internetið í einum rykk. Markmið
þessa áfanga er:

1. Prófa raunverulega mobile hegðun á localhost með Stebba.
2. Staðfesta hvaða vandamál eru enn til staðar.
3. Laga fyrsta afmarkaða hópinn: no-zoom inputs, navigation loader/pending state
   og augljós mobile overflow á virkum Teskeið-flæðum.
4. Skila closeout með nákvæmum localhost niðurstöðum og lista yfir það sem á að
   bíða næsta #5 áfanga.

Ekki ræsa, endurræsa eða drepa dev server nema Stebbi biðji sérstaklega um það.
Stebbi keyrir localhost sjálfur.

## Design.md sem skylduviðmið

Lesa `Design.md` áður en kóða er breytt. Sérstaklega:

- `Source of truth`
- `Mobile app-upplifun á öllu Teskeið.is`
- `Navigation feedback og loader`
- `Inputs`
- `Ferli fyrir nýjan eða breyttan skjá`

Mikilvægar reglur sem eiga við hér:

- Texti í `input`, `textarea` og `select` skal vera minnst 16 px á mobile.
- Ekki nota `maximum-scale`, `user-scalable=no` eða sambærilega zoom-bönn.
- Opnun/lokun mobile keyboard má ekki skilja síðuna eftir þysjaða, of breiða eða
  með rangri scroll-stöðu.
- Route segment sem bíður eftir auth, feature gate, server component eða
  gagnalestri skal hafa `loading.tsx` með canonical Teskeið-loader nema frávik sé
  rökstutt.
- Client navigation með `router.push`, `router.replace`, `router.back` eða
  sambærilegu þarf pending feedback ef notandi bíður.
- Loading state má ekki breyta breidd controls eða valda layout shift.

## Núverandi staða úr Codex-rýni

Til eru loading routes:

- `app/auth-mvp/heim/loading.tsx`
- `app/auth-mvp/lanad-og-skilad/loading.tsx`
- `app/auth-mvp/lanad-og-skilad/[id]/loading.tsx`
- `app/auth-mvp/lanad-og-skilad/ny/loading.tsx`
- `app/auth-mvp/lanad-og-skilad/breyta/[id]/loading.tsx`
- `app/auth-mvp/lanad-og-skilad/baeta-vid-adila/[id]/loading.tsx`
- `app/auth-mvp/minn-profill/loading.tsx`
- `app/stillingar/tengsl/loading.tsx`
- `app/stillingar/tengsl/[id]/loading.tsx`

Canonical loader:

- `components/teskeid/TeskeidLoader.tsx`

Virkir app-shellar/components til að skoða:

- `components/loans/LoanShell.tsx`
- `components/loans/LoanList.tsx`
- `components/loans/LoanSummaryCard.tsx`
- `components/loans/LoanForm.tsx`
- `components/loans/AddPartyForm.tsx`
- `components/tengsl/RelationshipDetailsForm.tsx`
- `components/tengsl/TagSelectForm.tsx`
- `app/innskraning/page.tsx`
- `components/teskeid/TeskeidLoginForm.tsx`
- `app/stillingar/tengsl/page.tsx`
- `app/stillingar/tengsl/[id]/page.tsx`

## Manual pre-check með Stebba áður en breyting hefst

Stebbi keyrir dev server. Claude má biðja Stebba að opna localhost, en á ekki að
starta eða drepa server án sérstakrar beiðni.

Prófa fyrst án kóðabreytinga:

1. Opna Chrome DevTools responsive mode:
   - 360 px breidd
   - 390 px breidd
   - 430/460 px breidd
2. Prófa `/innskraning`:
   - focus á netfang,
   - focus á kóða ef það er sýnilegt,
   - keyboard opið/lokað,
   - enginn óvæntur zoom eða horizontal scroll.
3. Prófa `/auth-mvp/heim`:
   - opna `Lánað og skilað`,
   - fara til baka,
   - staðfesta hvort loader eða pending feedback birtist ef navigation bíður.
4. Prófa `/auth-mvp/lanad-og-skilad`:
   - search input,
   - status/role filters,
   - sort select,
   - opna detail og til baka,
   - opna nýskráningu.
5. Prófa `/auth-mvp/lanad-og-skilad/ny`:
   - item name,
   - date inputs,
   - recipient email,
   - Tengsl picker ef hann birtist,
   - note textarea.
6. Prófa `/stillingar/tengsl`:
   - listi,
   - detail,
   - category select,
   - `Mitt heiti á þessum aðila`,
   - `Mín skýring`,
   - back navigation.

Skrá niður fyrir hvert flow:

- zoomar skjárinn óvænt?
- kemur horizontal scroll?
- hverfur virka inputið undir keyboard/browser chrome?
- sjást loader/pending states við navigation?
- er texti of stór/lítill eða skerðist?
- eru controls innan 360 px án overlap?

Ef pre-check sýnir engin raunvandamál í tilteknum flow, ekki laga það flow í
þessum áfanga.

## Afmörkuð implementation strategy

Laga aðeins það sem pre-check staðfestir. Líklegir staðir:

### Inputs/no zoom

- Finna `input`, `select`, `textarea` með `text-xs` eða `text-sm` þar sem þau
  geta fengið focus á mobile.
- Breyta í `text-base` eða responsive class sem tryggir 16 px á mobile.
- Passa að texti passi í controls og layout stækki ekki óeðlilega.
- Ekki breyta metadata texta sem er ekki form control.

### Navigation loader/pending feedback

- Staðfesta að existing `loading.tsx` routes noti `TeskeidLoader` eða sambærilegt
  canonical loader.
- Fyrir client navigation, bæta pending state á buttons/links sem nota
  `router.push`, `router.replace` eða `router.back` og geta tekið tíma.
- Ekki bæta við global hacki sem sýnir loader við allar link-hover/instant
  transitions.

### `/stillingar/tengsl`

Stebbi nefndi sérstaklega að þessi síða hafi enn of veflega mobile upplifun.
Rýna sérstaklega:

- detail form input/select/textarea font sizes,
- back navigation loader/pending state,
- mobile width og overflow,
- hvort löng skýring eða langt netfang geti ýtt layout út fyrir skjá.

### Innskráning

Rýna hvort `/innskraning` sé nú þegar í lagi eftir fyrri #5 vinnu. Ef ekki:

- nota `text-base` á focusable fields,
- halda canonical Teskeið-litum og lógói,
- ekki endurvekja gamalt Krakkavaktar-lúkk,
- ekki breyta auth logic að óþörfu.

## Ekki gera í þessum áfanga

- Ekki laga allar legacy Krakkavaktar/landing/chat/admin síður nema pre-check
  staðfesti að þær séu hluti af virku Teskeið mobile-flæði.
- Ekki gera stórt route cleanup (#22).
- Ekki snerta auth/session líftíma (#7) nema þú sért bara að prófa redirect/loader.
- Ekki breyta SQL, RLS, Supabase auth eða production gögnum.
- Ekki setja `user-scalable=no`.
- Ekki skipta út Design.md-reglum með ad hoc CSS-hakki.

## Suggested commands

Keyra eftir breytingar, eftir því hvaða skrár snertast:

```powershell
npm run type-check
npm run test:run -- lib/__tests__/login-form.test.tsx lib/__tests__/loan-form.test.tsx lib/__tests__/loan-pages.test.tsx lib/__tests__/tengsl-pages.test.tsx lib/__tests__/teskeid-loader.test.tsx
```

Ef aðeins docs/handoff er breytt þarf ekki að keyra test.

## Localhost checks for Stebbi

Stebbi prófar í eigin localhost eftir breytingar. Prófa við 360, 390 og 430/460
px breidd.

### Auth

1. Opna `/innskraning`.
2. Focus á netfang.
3. Vænt: enginn iOS/Safari-style zoom, enginn horizontal scroll.
4. Ef kóðareitur birtist, focus þar líka.
5. Vænt: keyboard lokun skilur ekki síðuna eftir þysjaða eða skakka.

### Heim og navigation

1. Opna `/auth-mvp/heim`.
2. Smella á `Lánað og skilað`.
3. Fara til baka.
4. Vænt: ef route bíður, sést Teskeið-loader eða skýrt pending state.
5. Vænt: enginn skjástökk, enginn horizontal scroll.

### Lánað og skilað

1. Opna `/auth-mvp/lanad-og-skilad`.
2. Prófa search, filter pills og sort select.
3. Opna detail og fara til baka.
4. Opna `Skrá hlut í láni`.
5. Focus á öll form controls.
6. Vænt: enginn zoom, controls halda breidd, takkarnir skarast ekki.

### Tengsl

1. Opna `/stillingar/tengsl`.
2. Opna tengsl-detail.
3. Prófa flokk select, `Mitt heiti á þessum aðila` og `Mín skýring`.
4. Fara til baka.
5. Vænt: app-lík upplifun, loader/pending state þar sem bið er, enginn zoom,
   enginn overflow, löng netföng/skýringar passa innan mobile skjás.

### Regression

1. Prófa desktop breidd.
2. Vænt: ekkert er orðið óþarflega stórt eða klunnalegt á desktop.
3. Prófa keyboard navigation/focus-visible á helstu controls.
4. Vænt: focus sést og controls eru enn aðgengileg.

## Closeout requirements

Claude closeout þarf að segja:

- hvað var prófað á localhost fyrir breytingu,
- hvaða vandamál voru raunverulega staðfest,
- hvaða skrár voru breyttar,
- hvaða Design.md reglur voru notaðar,
- hvaða tests voru keyrð,
- hvað Stebbi þarf að prófa aftur,
- hvaða hlutar #5 eru enn opnir fyrir næsta áfanga.

Ekki færa #5 í DONE nema Stebbi staðfesti að mobile app-upplifunin sé nægilega
samræmd í helstu flæðum. Líklegra er að closeoutið þrengi #5 og skrái næsta
minni áfanga.
