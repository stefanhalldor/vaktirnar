# Handoff: Pakki A eftir #48 - #5 mobile/app polish + #30 logo preview

Fra: Codex  
Til: Claude Code  
Dagsetning: 2026-06-23 17:00  
Stada: Ryni-fyrst handoff. Ekki buid ad breyta app-koda.

## Markmid pakkans

#48 var fært i DONE. Naesti opni quick-win pakki er:

- #5 Samræmd mobile app-upplifun a öllu Teskeið.is
- #30 Derhufumerki og ny favicon-tillaga

Thetta eru ekki jafn stor atridi:

- #5 er raunverulegt UX/polish audit og nokkrar litlar lagfæringar a virkum
  flæðum. Thetta a ad vera fyrsta áherslan.
- #30 er lágáhættu identity preview. Ekki skipta um production favicon eða
  canonical logo nema Stebbi samþykki það eftir preview.

## Codex-ryni a raunverulegri thorf

### #5 - a enn rett a ser

#5 a enn rett a ser, en er ad hluta til þegar leyst:

- `Design.md` hefur nu skyrar reglur um mobile app-upplifun, no-zoom inputs,
  navigation feedback og loadera.
- Route-level `loading.tsx` er til fyrir:
  - `app/auth-mvp/heim/loading.tsx`
  - `app/auth-mvp/lanad-og-skilad/loading.tsx`
  - `app/auth-mvp/minn-profill/loading.tsx`
  - `app/stillingar/tengsl/loading.tsx`
  - `app/stillingar/tengsl/[id]/loading.tsx`
- Nokkur mikilvæg form nota þegar `text-base` a inputs/select/textarea:
  - `components/loans/LoanForm.tsx`
  - `components/loans/AddPartyForm.tsx`
  - `components/tengsl/RelationshipDetailsForm.tsx`
  - `components/tengsl/TagSelectForm.tsx`
  - `components/teskeid/TeskeidLoginForm.tsx` a email input
- Tengsl navigation loaderar voru sérstaklega bættir vid i fyrri vinnu.

En #5 er ekki lokid thvi:

- Ekki hefur verid gert skipulegt audit yfir oll virk mobile flæði.
- Sum client navigation notar `router.push`/`router.back` an skyrs route-pending
  feedbacks, t.d. `AddPartyForm` cancel/back og delayed success redirect.
- `TeskeidMenu` logout notar `router.push('/innskraning')` eftir signOut an
  serstaks pending state.
- `TeskeidLoginForm` er virk, en þarf manual check a 360-460 px med keyboard
  opid/lokad. Koda-input notar storan texta og tracking, sem getur verið rett
  en þarf overflow check.
- Public idea submit form og preview/public Teskeid sidur nota sums stadar
  eldri gray/violet styles. Ekki þarf endilega ad laga allt i þessum pakka, en
  audit þarf ad greina hvort thetta snertir virka Teskeid upplifun.

### #30 - a enn rett a ser, en aðeins sem preview

#30 a enn rett a ser sem hönnunarprófun:

- `components/teskeid/TeskeidLogo.tsx` eyðir eldri `A&10` vector holum og setur
  `10,5` sem texta a derhufuna.
- `app/icon.svg` er enn eina production icon-skrain i `app/`.
- `public/favicon-options/` er til med nokkrum preview SVG-um:
  - `full-badge.svg`
  - `face-badge.svg`
  - `cap-mark.svg`
  - `cap-mark-10-5-preview.svg`
  - `glasses-smile.svg`
- `app/preview/favicons/codex/page.tsx` synir favicon valkosti i 16, 24, 32,
  48 og 64 px.

Nya osk Stebba er ad prófa texta inni i derhufunni:

```text
Allt
10
```

Sem stendur fyrir "Allt upp a 10".

Thetta a ekki ad fara beint i production. Fyrsta nidurstada a ad vera preview
og samanburdur, ekki app-wide logo replacement.

## Afmorkun

### Innan scope

1. Lesa `Design.md` og fylgja sérstaklega:
   - mobile app-upplifun;
   - no-zoom input reglur;
   - navigation feedback og loader;
   - form, text wrapping, overflow og touch targets.
2. Gera audit a virkum Teskeid flæðum:
   - `/innskraning`
   - `/auth-mvp/heim`
   - `/auth-mvp/minn-profill`
   - `/auth-mvp/lanad-og-skilad`
   - `/auth-mvp/lanad-og-skilad/ny`
   - `/auth-mvp/lanad-og-skilad/breyta/[id]`
   - `/auth-mvp/lanad-og-skilad/baeta-vid-adila/[id]`
   - `/stillingar/tengsl`
   - `/stillingar/tengsl/[id]`
3. Laga litlar, staðfestar mobile/navigation vöntunir:
   - inputs/select/textarea undir 16 px;
   - router navigation án feedbacks;
   - texti/control sem getur farið út fyrir mobile breidd;
   - route segment sem getur beðið eftir server/auth/data án loader.
4. Fyrir #30:
   - bæta við preview valkosti fyrir `Allt / 10`;
   - uppfæra preview-síðu þannig Stebbi geti borið saman núverandi og nýja leið;
   - ekki skipta út `app/icon.svg` eða production favicon.

### Utan scope

- Ekki endurhanna allt Teskeið.is.
- Ekki hreinsa allar legacy `/auth-mvp/` slóðir. Það er #22.
- Ekki laga langlífa innskráningu. Það er #7.
- Ekki byggja nýja event/inbox virkni. Það er #52/#37/#38.
- Ekki skipta production lógói, `app/icon.svg`, metadata icons eða Vercel assets
  án skýrs samþykkis Stebba eftir preview.
- Ekki snerta SQL, Supabase, RLS eða auth policies.

## Manual pre-check fyrir Stebba áður en Claude breytir kóða

Biddu Stebba ad gera thessi stuttu check a localhost. Markmidid er ad finna
hvar #5 verkurinn er raunverulegur, ekki laga eftir minni.

### A. Mobile no-zoom og keyboard

Viewport: 360 px, 390 px og 460 px.

1. Opna `/innskraning`.
2. Focusera netfang, skrifa netfang, loka keyboard.
3. Fara i koda-step, focusa koda-input, skrifa 6 tölur, loka keyboard.
4. Opna `/auth-mvp/lanad-og-skilad/ny`.
5. Prófa:
   - heiti hlutar;
   - recipient email;
   - tengsl picker ef til staðar;
   - date fields;
   - note textarea.
6. Opna `/stillingar/tengsl/[id]`.
7. Prófa:
   - flokk select;
   - mitt heiti;
   - min skýring textarea.

Vænt:

- ekkert auto-zoom i iOS/Safari;
- engin lárétt scroll;
- page fer ekki skökk eftir að keyboard lokast;
- texti og controls fara ekki undir keyboard.

### B. Navigation feedback

1. Fra `/auth-mvp/heim`, opna `Lánað og skilað`.
2. Opna nytt lán.
3. Fara til baka.
4. Opna tengilið i `/stillingar/tengsl`.
5. Fara til baka.
6. Í add-party flow, ýta á hætta við/back.
7. Í menu, skrá út.

Vænt:

- þegar bið er sýnileg, birtist canonical loader eða skýrt pending state;
- linkar og buttons virðast ekki dauðir;
- back navigation skilur skjáinn ekki eftir í hálfnuðu state.

### C. Logo/favicons

1. Opna núverandi preview ef til staðar:
   `/preview/favicons/codex`.
2. Skoða hvað virkar í 16, 24, 32 og 48 px.
3. Athuga sérstaklega hvort `Allt / 10` hugmyndin sé eitthvað sem Stebbi vill
   sjá sem preview áður en production asset er snert.

Ef Stebbi sér enga raunverulega mobile/loader vöntun i A/B, þá má þrengja #5
aðeins og halda breytingum mjög litlum.

## Tillaga að framkvæmd

### Phase 0 - audit, ekkert production-risk

1. Lesa `Design.md` viðeigandi kafla.
2. Kortleggja route segments og loading.tsx coverage.
3. Kortleggja active forms og client navigations.
4. Skila stuttri athugasemd i handoff/closeout:
   - hvað er þegar í lagi;
   - hvað vantar raunverulega;
   - hvað var vísvitandi látið vera.

Ekki breyta mörgum ótengdum public/legacy skjám i sama passanum.

### Phase 1 - #5 litlar lagfæringar

Forgangur:

1. Fixa staðfesta no-zoom eða overflow galla i virkum Teskeid flæðum.
2. Bæta skýru pending/navigation feedbacki við client actions sem nota:
   - `router.push`
   - `router.back`
   - delayed redirect eftir success
   - signOut navigation
3. Tryggja að route-level loader sé til þar sem server/auth/data bið getur
   orðið sýnileg.
4. Nota núverandi `TeskeidLoader`, `messages/is.json` og `messages/en.json`.
5. Nota messages fyrir nýjan user-facing texta. Ekki hardcode-a íslensku/ensku
   í components ef textinn sést notanda.

Athugasemdir um mögulega snertifleti:

- `components/loans/AddPartyForm.tsx`
  - `router.back()` cancel er án pending state.
  - success bíður 2500 ms og fer svo `router.push`. Meta hvort núverandi
    status-texti sé nóg eða hvort þarf navigation pending.
  - submit sýnir `...`; betra gæti verið þýddur texti ef breyting er gerð.
- `components/teskeid/TeskeidMenu.tsx`
  - logout er async og navigation eftir signOut. Meta pending/disabled state.
- `components/teskeid/TeskeidLoginForm.tsx`
  - email input notar `text-base`.
  - code input notar stóran texta og tracking. Prófa overflow á 360 px.
  - eftir successful verify er `router.push` + `router.refresh`; núverandi
    button loading stendur líklega meðan request er í gangi, en meta hvort
    navigation gap sé til staðar.
- `components/loans/LoanForm.tsx`
  - inputClass er `text-base`.
  - submit hefur `saving` state og router push.
  - recipient listbox text/note wrapping er líklega þegar bætt.
- `components/tengsl/*`
  - forms nota `text-base`.
  - loaderar eru til fyrir list/detail.
  - samt prófa back/list/detail navigation.

### Phase 2 - #30 preview

Lágáhættu leið:

1. Ekki breyta `app/icon.svg`.
2. Búa til nýtt preview SVG í `public/favicon-options/`, t.d.
   `cap-mark-allt-10-preview.svg`.
3. Uppfæra `app/preview/favicons/codex/page.tsx` til að sýna nýja valkostinn.
4. Ef þörf er á preview fyrir fulla logo-útgáfu, gera hana sem preview-only
   component/page eða asset, ekki skipta út canonical `TeskeidLogo` fyrr en
   Stebbi samþykkir.
5. Sýna samanburð við núverandi:
   - `10,5` í fullu lógói;
   - `cap-mark-10-5-preview.svg`;
   - nýtt `Allt / 10` preview.

Athuga að `TeskeidLogo.tsx` notar `letterSpacing="-1"` fyrir lógótextann. Ef
það er snert, þarf að rökstyðja sem logo-specific vector ákvörðun eða laga ef
það skemmir læsileika. Almenn UI-regla í `Design.md` er letter spacing 0.

## Skrár sem Codex skodadi

- `TODO.md`
  - #5 og #30 eru nú efst eftir #48 lokun.
- `DONE.md`
  - #48 var fært í DONE sem staðfest product/UX lokun.
- `Design.md`
  - mobile app-upplifun, no-zoom inputs, navigation feedback og loader eru
    skyldubundin viðmið.
- `components/teskeid/TeskeidLoader.tsx`
  - canonical loader, `role="status"`, reduced motion support.
- `app/auth-mvp/heim/loading.tsx`
- `app/auth-mvp/lanad-og-skilad/loading.tsx`
- `app/auth-mvp/minn-profill/loading.tsx`
- `app/stillingar/tengsl/loading.tsx`
- `app/stillingar/tengsl/[id]/loading.tsx`
  - route loaderar fyrir helstu virk flæði.
- `components/teskeid/TeskeidLoginForm.tsx`
  - login inputs og router navigation.
- `components/teskeid/TeskeidMenu.tsx`
  - logout navigation og menu state.
- `components/loans/LoanForm.tsx`
  - create/edit loan form, recipient picker, submit navigation.
- `components/loans/AddPartyForm.tsx`
  - add-party picker, cancel/back, delayed success redirect.
- `components/tengsl/RelationshipDetailsForm.tsx`
- `components/tengsl/TagSelectForm.tsx`
  - Tengsl edit controls.
- `components/teskeid/TeskeidLogo.tsx`
  - current `10,5` cap text.
- `public/favicon-options/`
  - current preview SVG assets.
- `app/preview/favicons/codex/page.tsx`
  - preview page for favicon options.
- `app/icon.svg`
  - production app icon. Ekki breyta án samþykkis.

## Prófanir sem Claude ætti að keyra

Velja eftir snertifleti, en lágmarkssett ef #5/#30 kóða er breytt:

```powershell
npm run test:run -- lib/__tests__/login-form.test.tsx lib/__tests__/loan-form.test.tsx lib/__tests__/loan-pages.test.tsx lib/__tests__/tengsl-pages.test.tsx lib/__tests__/teskeid-menu.test.tsx
npm run type-check
```

Ef preview/favicons page er breytt og engin dedicated test eru til:

- type-check er lágmark;
- manual preview á `/preview/favicons/codex` er nauðsynlegt.

Ef nýr message texti er bættur við:

- uppfæra bæði `messages/is.json` og `messages/en.json`;
- keyra relevant component tests eða type-check.

## Ahaetta

- #5 er vítt. Stærsta áhættan er að reyna að laga allt vefsvæðið í einu.
  Halda scope við virk Teskeid flæði og staðfesta raunverulega vöntun.
- Loader/pending state má ekki valda layout shift eða falsa árangri. Ef action
  er enn að vinna server-side á button að vera disabled/pending.
- `router.back()` er erfitt að tryggja ef browser history er óvænt. Ekki breyta
  í nýja fallback hegðun án rýni.
- Logo/favicons mega ekki fara í production fyrir slysni. Preview-only fyrst.
- Ekki setja `maximum-scale` eða `user-scalable=no` til að leysa zoom. Það brýtur
  accessibility og Design.md.
- Ekki skipta út `TeskeidLogo` globally með ólesinni `Allt / 10` útgáfu án
  samþykkis Stebba.

## Supabase / SQL

Engin SQL-skrá.

Ekki keyra SQL.

Engin breyting á:

- RLS;
- auth policies;
- grants;
- functions;
- production data;
- notendagögnum;
- service role.

Ef Claude sér þörf fyrir auth/session breytingar í tengslum við #5 eða #7, skal
stoppa. Það er ekki hluti af þessum pakka.

## Localhost checks for Stebbi

Eftir að Claude hefur gert audit/fixes þarf Stebbi að prófa þetta á localhost.
Stebbi keyrir dev server sjálfur.

### A. `/innskraning`

Viewport: 360 px, 390 px og 460 px.

1. Opna `/innskraning`.
2. Focusa netfangsreit.
3. Skrifa netfang.
4. Loka keyboard.
5. Fara í kóða-step.
6. Focusa kóða-input, skrifa 6 tölur, loka keyboard.

Vænt:

- ekkert óæskilegt mobile zoom;
- formið heldur miðju/breidd;
- hnappur sýnir loading/pending þegar beðið er;
- lógó neðst er rétt staðsett og veldur ekki overflowi.

### B. Loan flæði

1. Opna `/auth-mvp/lanad-og-skilad`.
2. Smella á nýtt lán.
3. Fylla heiti, viðtakanda, dagsetningar og nótu.
4. Prófa tengsl picker ef hann birtist.
5. Vista.
6. Fara í edit á láni.
7. Prófa add-party flow og cancel/back.

Vænt:

- engin input valda zoomi;
- listbox/nótur/netföng wrap-a innan mobile breiddar;
- save/cancel/navigation sýnir skýrt pending eða loader þegar bið er til staðar;
- ekkert situr fast á `...` án merkingar.

### C. Tengsl flæði

1. Opna `/stillingar/tengsl`.
2. Smella á tengilið.
3. Fara til baka.
4. Opna tengilið aftur.
5. Breyta flokki.
6. Breyta `Mitt heiti á þessum aðila`.
7. Breyta `Mín skýring`.

Vænt:

- navigation sýnir loader þegar hún bíður;
- input/select/textarea valda ekki zoomi;
- löng skýring eða langt netfang fer ekki út fyrir skjá;
- back navigation er app-lík og skilur ekki eftir skakka scroll-stöðu.

### D. Menu/logout

1. Opna hamburger menu.
2. Smella á nokkrar leiðir.
3. Prófa `Útskrá`.

Vænt:

- menu lokast eðlilega;
- navigation eða signOut bíður með sýnilegu feedbacki ef það tekur tíma;
- notandi endar á `/innskraning`;
- ekki kemur redirect loop.

### E. Logo/favicons preview

1. Opna `/preview/favicons/codex`.
2. Bera saman núverandi `10,5`, `A&10` og nýja `Allt / 10` preview valkostinn.
3. Skoða 16, 24, 32, 48 og 64 px stærðir.
4. Skoða í mobile og desktop.

Vænt:

- `Allt / 10` er annaðhvort greinilega læsilegt eða augljóslega of þröngt;
- preview sýnir samanburð án þess að production icon hafi breyst;
- Stebbi getur tekið ákvörðun um hvort #30 eigi að fara í næsta production pass.

### F. Regression

1. Public `/` virkar áfram fyrir gesti.
2. `/senda-hugmynd` virkar áfram ef hún er snert.
3. `/auth-mvp/heim` sýnir tilbúnar Teskeiðar.
4. `/auth-mvp/minn-profill` vistun og logout virka áfram.

Ef mobile check sýnir fleiri vandamál en þetta handoff nær yfir, skrá þau sem
ný undiratriði frekar en að stækka þennan pakka stjórnlaust.
