# Handoff: TODO #48 - Endurkomunotandi fari sjalfgefid a Teskeidar

Fra: Codex  
Til: Claude Code  
Dagsetning: 2026-06-23 16:52  
Stada: Plan og rauntharfaryni. Ekki buid ad breyta koda.

## Markmid

Stebbi vill ad innskradur endurkomunotandi lendi sjalfgefid a `Teskeidar`,
ekki i hugmyndabankanum.

TODO #48 segir:

- innskradur notandi sem opnar rot eda login-entry a ad lenda a virku
  Teskeida-yfirliti;
- gestir eiga afram ad fa rett public/login hegdun;
- auth callback og logout mega ekki brotna;
- mobile og desktop eiga ad syna rettan fyrsta skjá an stokks eða redirect loop.

## Codex-ryni a raunverulegri thorf

Thetta atridi a enn rett a ser, en thad er liklega thengra en upphaflega
lysingin gaf i skyn.

Kodinn gerir nu thegar hluta af thessu:

- `middleware.ts` sendir innskradan notanda af `/` yfir a `/auth-mvp/heim`
  thegar `AUTH_MVP_ENABLED === 'true'`.
- `app/innskraning/page.tsx` sendir innskradan notanda af `/innskraning`
  yfir a `/auth-mvp/heim`.
- `components/teskeid/TeskeidLoginForm.tsx` sendir notanda med nafn eftir
  kodastadfestingu yfir a `/auth-mvp/heim`.
- `app/auth-mvp/heim/page.tsx` er med `section id="teskeidar"` og synir
  `Tilbunar Teskeidar` eftir kvedju og `Nyilegt`/recent hluta.
- `lib/__tests__/home-page.test.tsx` stadfestir ad `section#teskeidar` se til.

Thvi er spurningin ekki lengur "fer endurkomunotandi i hugmyndabankann?" i
kodanum. Svarid virðist vera nei, hann fer a `/auth-mvp/heim`.

Raunverulega opna spurningin er:

1. Er `/auth-mvp/heim` nogu greinilega `Teskeidar` i fyrstu mobile upplifun?
2. Eda vill Stebbi ad entrypoint fari beint a `#teskeidar`, t.d.
   `/auth-mvp/heim#teskeidar`, svo tilbunar Teskeidar se sjalfgefinn stadur?

Ekki framkvæma storar route-eda heimaskjarsbreytingar fyrr en Stebbi hefur
profad manual pre-check her fyrir nedan.

## Manual pre-check fyrir Stebba ad gera adur en kodabreyting hefst

Biddu Stebba ad keyra thetta a localhost adur en thu breytir koda.

Nauðsynlegt state:

- `AUTH_MVP_ENABLED=true`.
- Notandi er til og getur skrad sig inn.
- Best ad profa med notanda sem hefur display name og adgang ad amk einni
  tilbuninni Teskeid, t.d. `Lanad og skilad`.

Skref:

1. Verdu innskradur.
2. Opnadu nyjan tab a `http://localhost:3000/`.
3. Stadfestu hvort thu lendir a `/auth-mvp/heim`.
4. Athugadu fyrsta mobile skjainn, t.d. 360-430 px breidd:
   - Serdu `Tilbunar Teskeidar` an thess ad skrolla?
   - Ef ekki, finnst ther samt augljost ad thu ert kominn i appid?
   - Er hugmyndabankinn thad fyrsta sem upplifunin bendir a?
5. Verdu afram innskradur og opnadu `http://localhost:3000/innskraning`.
6. Stadfestu ad sidan sendi thig yfir a `/auth-mvp/heim`.
7. Skradu thig ut.
8. Opnadu `http://localhost:3000/`.
9. Stadfestu ad gestur sjai afram public lendingu/hugmyndabanka, ekki private
   Teskeidar.
10. Opnadu `http://localhost:3000/innskraning`.
11. Stadfestu ad gestur sjai login-form.
12. Skradu thig inn med koda og stadfestu hvert thu lendir eftir successful
    verify:
    - notandi med display name a ad fara a heim/Teskeidar;
    - notandi an display name a afram ad fara i profilstillingu.

Tulkunn:

- Ef Stebbi segir ad `/auth-mvp/heim` se nogu gott og Teskeidar se strax skyrt:
  ekki breyta koda. Fa stadfestingu og faera #48 i `DONE.md` med skyringu um
  ad nuverandi hegdun uppfylli thorfina.
- Ef Stebbi segir ad sidan lendi of ofarlega, ad `Nyilegt`/kvedja skyggi a
  Teskeidar, eda ad upplifunin finnist ekki sjalfgefid vera Teskeidar:
  framkvæma litla `#teskeidar` entrypoint-breytingu.

## Tillaga ef tharf ad framkvæma

Veldu minnsta orugga fixid:

1. Gera ekki stóra route cleanup i thessu atridi. #22 a eftir ad hreinsa
   synilegar `/auth-mvp/` slodir seinna.
2. Gera ekki heimaskjar-reorder i thessu atridi nema manual pre-check syni ad
   hash-navigation gefi vonda upplifun. Heimaskjar-reorder tengist frekar #42.
3. Nota helst `/auth-mvp/heim#teskeidar` bara fyrir entrypoints sem thydir
   "endurkomunotandi kemur aftur inn":
   - root redirect i `middleware.ts`;
   - session redirect i `app/innskraning/page.tsx`;
   - successful login i `components/teskeid/TeskeidLoginForm.tsx` thegar
     `hasName === true`.
4. Ekki breyta gestaflaedi:
   - gestur a `/` a ad fa public landing/hugmyndabanka;
   - gestur a `/innskraning` a ad fa login;
   - gestur a private routes a ad fara a `/innskraning`.
5. Ekki breyta logout redirect i fyrsta passanum. Logout ma afram fara a
   `/innskraning`.
6. Ekki breyta `app/auth/callback/route.ts` nema thu stadfestir ad callback
   default lendi rangt. Nuverandi callback notar `next ?? '/'`, og root
   middleware getur tekid vid innskradum notanda eftir callback.
7. Ekki breyta menu/logo links i fyrsta passanum nema Stebbi stadfesti ad
   "Teskeidar" i hamburger/menu eigi alltaf ad scrolla beint a `#teskeidar`.
   Menu/logo links eru mikid notud i tests og vidhengi vid navigation semantics.

### Mogulegar kodabreytingar ef hash-leid er valin

`middleware.ts`:

- I root redirect:
  - halda `url.pathname = '/auth-mvp/heim'`;
  - baeta vid `url.hash = 'teskeidar'`;
  - redirect a ad skila Location med `#teskeidar`.

`app/innskraning/page.tsx`:

- Breyta session redirect ur:
  - `redirect('/auth-mvp/heim')`
- i:
  - `redirect('/auth-mvp/heim#teskeidar')`

`components/teskeid/TeskeidLoginForm.tsx`:

- Breyta successful verify fyrir notanda med display name ur:
  - `router.push('/auth-mvp/heim')`
- i:
  - `router.push('/auth-mvp/heim#teskeidar')`
- Halda no-name flow obreyttu:
  - `router.push('/auth-mvp/minn-profill')`

Valfrjalst, aðeins ef Stebbi vill:

- `app/auth-mvp/minn-profill/page.tsx` sendir nyjan notanda eftir profilmotun a
  `/auth-mvp/heim`. Thetta er onboarding, ekki endurkomuflaedi. Latta vera
  obreytt nema Stebbi vilji ad nyir notendur lendi lika beint a `#teskeidar`.

## Skrar sem Codex skodadi

- `TODO.md`
  - #48 er i forgangi sem naesta atridi.
  - Nya vinnureglan krefst rauntharfaryni og manual pre-check adur en framkvaemd
    hefst.
- `middleware.ts`
  - root `/` redirect fyrir innskradan notanda fer nu a `/auth-mvp/heim`.
  - private auth-mvp routes senda gesti a `/innskraning`.
- `app/innskraning/page.tsx`
  - innskradur notandi med session redirectast a `/auth-mvp/heim`.
- `components/teskeid/TeskeidLoginForm.tsx`
  - successful code verification sendir notanda med display name a
    `/auth-mvp/heim`.
- `app/auth/callback/route.ts`
  - callback defaultar `next` i `/`; ekki augljost ad tharf ad breyta ef root
    redirect verdur rettur.
- `app/auth-mvp/heim/page.tsx`
  - `section id="teskeidar"` er til.
  - DOM rod er kvedja, recent/Nyilegt, sidan Teskeidar.
- `app/auth-mvp/minn-profill/page.tsx`
  - eftir ad vista profili fer notandi a `/auth-mvp/heim`.
- `lib/__tests__/middleware.test.ts`
  - helper `redirectedTo()` skilar bara `pathname`, ekki hash.
  - ef hash er testadur tharf anna hvort nyjan helper sem skilar
    `pathname + hash`, eda lesa `new URL(location).hash`.
- `lib/__tests__/innskraning-page.test.tsx`
  - vaentir nu `NEXT_REDIRECT:/auth-mvp/heim`.
- `lib/__tests__/login-form.test.tsx`
  - nær copy/logo tests en ekki endilega successful verify navigation.
- `lib/__tests__/home-page.test.tsx`
  - stadfestir `section#teskeidar`.
  - stadfestir lika ad `Nyilegt` kemur fyrir `Tilbunar Teskeidar` i DOM thegar
    recent events eru til.

## Profin sem tharf ad uppfaera/baeta ef kodabreyting er gerd

Ef enginn kodi breytist, keyra ekki endilega proffyrir allt; fa manual
stadfestingu fra Stebba og faera #48 i DONE.

Ef hash-entrypoint er innleiddur, baeta/uppfaera:

1. `lib/__tests__/middleware.test.ts`
   - Uppfaera testid "authenticated user on / -> /auth-mvp/heim".
   - Athuga: nuverandi `redirectedTo()` missir hash af thvi hann skilar bara
     `pathname`. Baeta vid helper, t.d. `redirectedPathAndHash(res)`, eda assert-a
     `new URL(res.headers.get('location')!).hash === '#teskeidar'`.
   - Halda gestatestinu obreyttu.

2. `lib/__tests__/innskraning-page.test.tsx`
   - Uppfaera tvö authenticated session tests til ad vaenta
     `NEXT_REDIRECT:/auth-mvp/heim#teskeidar`.
   - Halda unauthenticated tests obreyttum.

3. `lib/__tests__/login-form.test.tsx`
   - Ef ekki til staðar, baeta vid test fyrir successful code submit:
     - mocka `/api/auth-mvp/verify-code` sem `ok: true`;
     - mocka `/api/teskeid/profile` med `display_name`;
     - fylla netfang og koda;
     - stadfesta `router.push('/auth-mvp/heim#teskeidar')`;
     - stadfesta `router.refresh()`.
   - Baeta vid test fyrir successful verify an display name:
     - `router.push('/auth-mvp/minn-profill')` a ad vera obreytt.

4. `lib/__tests__/home-page.test.tsx`
   - Núverandi `section#teskeidar` test dugir liklega.
   - Ekki tharf visual scroll test i jsdom.

5. Ekki breyta `teskeid-menu.test.tsx` nema thu breytir menu href.

### Skipanir til ad keyra

Ef koda er breytt:

```powershell
npm run test:run -- lib/__tests__/middleware.test.ts lib/__tests__/innskraning-page.test.tsx lib/__tests__/login-form.test.tsx lib/__tests__/home-page.test.tsx
npm run type-check
```

Ef thu snertir menu/logo links, baeta vid:

```powershell
npm run test:run -- lib/__tests__/teskeid-menu.test.tsx lib/__tests__/loan-pages.test.tsx lib/__tests__/profile-page.test.tsx
```

## Ahaetta og atridi sem Codex vill ad Claude passi

- Hash redirect getur valdid skyndilegu scrolli. Thetta er kannski rett, en tharf
  manual mobile profun.
- Ef `RecentSection` hefur olesin events og er ofan vid `#teskeidar`, tha mun
  hash sleppa yfir `Nyilegt`. Thad er product-akvordun: #48 segir Teskeidar
  fyrst, en #37/#52 vilja gera olesid mikilvaegt. Ekki leysa thad her.
- Ekki breyta public `/` landingunni fyrir gesti. Stebbi vill ad public
  hugmyndabanki se afram adgengilegur.
- Ekki snerta legacy `/home`, `/login`, `/signup` cleanup i thessu atridi.
  Thad tengist #22 og eldra auth-flæði.
- Ekki bua til route abstraction sem dregur inn server-only eda browser-only
  dependencies i middleware. Ef route constant er buinn til, hafdu hann pure
  string exports.
- Ekki keyra SQL. Engin gagnagrunnsbreyting a ad thurfa.

## Tillaga ad naesta skrefi

1. Latta Stebba gera manual pre-check fyrst.
2. Ef Stebbi er sattur vid nuverandi `/auth-mvp/heim` upplifun:
   - engar kodabreytingar;
   - faera #48 ur `TODO.md` yfir i `DONE.md`;
   - skra ad kodinn hafi þegar uppfyllt thorfina med root/login redirects.
3. Ef Stebbi vill strakari lendingu a tilbunum Teskeidum:
   - framkvæma litla `/auth-mvp/heim#teskeidar` breytingu i entrypoints;
   - uppfaera tests;
   - senda Codex handoff til ryni adur en #48 er fært i DONE.

## Supabase / SQL

Engin SQL-skrá.

Ekki keyra SQL.

Engin breyting a:

- RLS;
- auth policies;
- grants;
- functions;
- production data;
- notendagögnum;
- service role.

Thetta er routing/UX breyting eingongu ef hun verdur framkvæmd.

## Localhost checks for Stebbi

Eftir að Claude hefur annaðhvort lokað #48 án kóðabreytinga eða innleitt
`#teskeidar` entrypoint þarf Stebbi að prófa:

### A. Innskráður endurkomunotandi

1. Skráðu þig inn á localhost.
2. Opnaðu `http://localhost:3000/` í nýjum tab.
3. Vænt niðurstaða:
   - ef engin kóðabreyting: þú lendir á `/auth-mvp/heim`;
   - ef hash-fix var gert: þú lendir á `/auth-mvp/heim#teskeidar`;
   - upplifunin á að vera greinilega Teskeiðar/app, ekki public hugmyndabanki.

### B. Innskráður notandi sem fer á login

1. Á meðan þú ert innskráður, opnaðu `http://localhost:3000/innskraning`.
2. Vænt niðurstaða:
   - þú ert sendur áfram á heim/Teskeiðar;
   - engin redirect loop;
   - ekkert autt loading-state hangir.

### C. Ný innskráning með kóða

1. Skráðu þig út.
2. Farðu á `http://localhost:3000/innskraning`.
3. Skráðu þig inn með kóða sem notandi með display name.
4. Vænt niðurstaða:
   - successful login fer á heim/Teskeiðar;
   - ef hash-fix var gert, fer hann á `#teskeidar`;
   - loader/submit-state birtist á meðan beðið er;
   - ekkert mobile zoom eða layout jump sem lítur út eins og bug.

### D. Notandi án display name

1. Prófaðu eða hermaðu notanda sem hefur ekki display name.
2. Skráðu inn með kóða.
3. Vænt niðurstaða:
   - hann fer áfram í `/auth-mvp/minn-profill`;
   - profile onboarding brotnar ekki;
   - eftir profile save fer hann á heim eins og núverandi product-regla segir,
     nema Claude og Stebbi hafi sérstaklega ákveðið annað.

### E. Óinnskráður gestur

1. Skráðu þig út.
2. Opnaðu `http://localhost:3000/`.
3. Vænt niðurstaða:
   - gestur sér áfram public lendingu/hugmyndabanka;
   - gestur fer ekki óvart á private `/auth-mvp/heim`.
4. Opnaðu `http://localhost:3000/auth-mvp/heim`.
5. Vænt niðurstaða:
   - gestur fer á `/innskraning`.

### F. Mobile upplifun

1. Prófaðu 360-430 px breidd.
2. Opnaðu `/`, `/innskraning` og successful login flow.
3. Vænt niðurstaða:
   - enginn óþægilegur skjáþysj eða tvöfaldur scroll-hop;
   - Teskeiðar eru skýrar sem default app-lending;
   - hamburger/menu er ekki að færa notanda óvænt á rangan stað;
   - public og private upplifun blandast ekki.

Ef einhver þessara checka sýnir að hash-lendingin sé of harkaleg eða sleppi
yfir mikilvægt `Ólesið`, stoppið og rýnið með Codex áður en það er fært í DONE.
