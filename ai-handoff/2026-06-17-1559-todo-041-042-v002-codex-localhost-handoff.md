# TODO #41 + #42 - Localhost handoff fyrir heimaskja, Umonnun og pending loan copy

**Agent:** Codex  
**Fyrir:** Stebbi og Claude Code  
**Dagsetning:** 2026-06-17  
**Stada:** Til localhost-profunar, ekki committad  
**Tengd TODO:** #41 Umonnun sem feature-flagged Teskeid; #42 Tilbunar Teskeidar efst og sidast opnud fyrst  
**Aukaatridi i sama profunarpakka:** pending loan-card copy cleanup i `Lánad og skilad`

## Samantekt

Thessi handoff skra lysir nuverandi ocommittudu breytingunum sem Stebbi aetlar
ad profa saman a localhost:

- `/auth-mvp/heim` adskilur nu virkar Teskeidar fra vaentanlegum/hugmyndum.
- `Umonnun` getur birst sem virk Teskeid bak vid `UMONNUN_ENABLED`.
- `Umonnun` opnar innri upplysingasidu, ekki Umonnun gogn.
- `Lánad og skilad` pending creator-kort synir ekki lengur tvitekin
  `Bíður svars`/`Bíður samþykkis` skilabod.
- #36 og #40 voru faerd ur TODO i DONE i vinnuskranum eftir post-release
  stadfestingu.

Engin SQL, engar migrations, engar Supabase RLS/policy/grant breytingar, engin
deploy/adgerd og engin `.env.local` lesning voru gerd af Codex.

## Breytingar i virkni

### #42 - Heimaskjar: virkar Teskeidar adskildar fra hugmyndum

`app/auth-mvp/heim/page.tsx` saekir nu adgang ad tveimur feature flags:

- `lanad-og-skilad`
- `umonnun`

Ef annad hvort er virkt birtist ser virkt Teskeidar-svaedi fyrir ofan
vaentanlegu/hugmynda-listana. `Lánad og skilad` heldur pending badge ef
pending invitations eru til. Vaentanlegu atridin eru undir ser fyrirsogn:
`Hugmyndir`.

**Mikilvaeg takmorkun:** "sidast opnud fyrst" er ekki implementad i thessum
breytingum. Thad er engin localStorage, cookie eda server-side per-user rodun.
Ekki merkja #42 sem fullklarad nema Stebbi samthykkir ad fyrsti afangi se bara
adskilnadur virkra Teskeida fra hugmyndum. Annars a ad opna eftirfylgni fyrir
last-opened rodun.

### #41 - Umonnun sem feature-flagged Teskeid

`lib/loans/guard.ts` styður nu:

- `LOANS_ENABLED=true` fyrir `lanad-og-skilad`
- `UMONNUN_ENABLED=true` fyrir `umonnun`

`app/auth-mvp/heim/page.tsx` birtir `Umonnun` card/link adeins ef
`UMONNUN_ENABLED === 'true'` server-side.

Ny sida er til i:

- `app/auth-mvp/umonnun/page.tsx`

Hún:

- krefst innskraningar med `guardTeskeidSession()`
- synir utskyringu ad Umonnun se ser app
- segir ad Umonnun predates Teskeid.is og snerti vidkvaem gogn
- synir hlekki a `umonnun.is`, App Store og Play Store
- synir engin Umonnun notendagogn og notar enga Umonnun API lykla/secrets

**Production-athugasemd:** Beina slodin `/auth-mvp/umonnun` er ekki sjalf
feature-flag-gated, bara cardid a `/heim`. Hun er samt innskraningarvarin og
synir eingongu almennan upplysingatexta. Ef Stebbi vill ad flag off feli
sidu lika fyrir beinni slod, a Claude Code ad laga thad adur en commit/deploy.

### Pending loan-card copy cleanup

`components/loans/LoanCard.tsx` var lagad eftir skjamynd fra Stebba.

Fyrir pending creator-kort, t.d. thegar Stebbi hefur sent bod en motadili hefur
ekki tekid afstodu, a kortid ekki lengur ad syna:

- `Bíður svars` i subtitle
- aftur `Bíður svars` i ser linu
- og `Bíður samþykkis` i annarri linu

Nuna a kortid ad syna pending status einu sinni i header/subtitle, halda
`Boð sent`, `Afturkalla boð` og `Eyða`, og ekki rugla creator-megin med gamla
samthykktarordalaginu.

Recipient soft-ack flaeðið a afram ad syna `Þekki málið` og
`Kannast ekki við þetta` thegar vidtakandi er ad taka afstodu.

### TODO/DONE housekeeping

`TODO.md` og `DONE.md` hafa ocommittudar breytingar sem faera:

- #36 Mannlegra ordalag a lanahlutverki
- #40 Filterar i lanalista hafa sjalfstaett state

ur TODO yfir i DONE med stadfestingu a commitum `7416ab9` og `bef246e`.

## Breyttar skrár

App/UI:

- `app/auth-mvp/heim/page.tsx`
- `app/auth-mvp/umonnun/page.tsx` (ny skra)
- `components/loans/LoanCard.tsx`

Feature flags og textar:

- `lib/loans/guard.ts`
- `.env.example`
- `messages/is.json`
- `messages/en.json`

Profanir:

- `lib/__tests__/home-page.test.tsx`
- `lib/__tests__/loan-card.test.tsx` (ny skra)

Verkefnastada/handoff:

- `TODO.md`
- `DONE.md`
- `ai-handoff/2026-06-17-1026-todo-041-042-v001-codex-home-teskeid-cards-handoff.md`
- `ai-handoff/2026-06-17-1045-todo-036-040-v001-claude-post-release.md`
- `ai-handoff/2026-06-17-0938-todo-040-v002-codex-filter-state-quick-fix-handoff.md`
- thessi skra

Ekki hluti af app-pakkanum en sjast sem untracked local files:

- `.obsidian/*`
- eldri untracked `ai-handoff/2026-06-10-*` skjol

## Skipanir sem voru keyrdar

Codex keyrdi:

- `Get-Content -Encoding UTF8 'ai-handoff/README.md'` - exit 0
- `Get-Date -Format 'yyyy-MM-dd-HHmm'` - exit 0, skra notar timann `1559`
- `git status --short --untracked-files=all` - exit 0, med warning um
  `C:\Users\Lenovo/.config/git/ignore` permission denied
- `git diff --stat` - exit 0
- `npm run test:run -- lib/__tests__/loan-card.test.tsx` - exit 0, 1 test passed
- `npm run type-check` - exit 0
- `npm run test:run -- lib/__tests__/home-page.test.tsx lib/__tests__/loan-card.test.tsx` - exit 0, 62 tests passed

Codex raesti ekki dev server og las ekki `.env.local`.

## Ahættumat

**Overall risk:** Medium-low fyrir localhost-profun ef scope helst UI/config/test.

Helstu ahættur:

1. #42 er ekki fullt scope ef `sidast opnud fyrst` er skilyrdi.
2. `/auth-mvp/umonnun` er direct route sem er login-varin en ekki flag-gated.
3. `UMONNUN_ENABLED` er server-side env flag; Stebbi þarf ad stilla local flag
   sjalfur i `.env.local` til ad profa on/off.
4. Store links eru hardcoded i `app/auth-mvp/umonnun/page.tsx`; textinn er i
   messages en URL-in eru ekki i config. Ef thad skiptir mali fyrir production
   a ad fa serakvordun.
5. Engin manual mobile profun hefur verid gerð enn a 360-460 px.

Ekki seð risk:

- Engin Supabase schema/data/RLS breyting.
- Engin Umonnun gogn saett eda birt.
- Engin secrets eda API lyklar baettir vid.
- Engin deployment/GitHub/push adgerd.

## Localhost checks for Stebbi

Stebbi keyrir dev server sjalfur. Codex raesti hann ekki.

### Setup

1. Opna `.env.local` sjalfur.
2. Til ad profa loans a `/heim`, tryggja ad `LOANS_ENABLED=true`.
3. Til ad profa Umonnun off-state, hafa `UMONNUN_ENABLED` tomt eda ekki `true`.
4. Til ad profa Umonnun on-state, setja `UMONNUN_ENABLED=true`.
5. Ef `.env.local` er breytt þarf Stebbi liklega ad endurraesa sinn eigin dev
   server svo Next lesi env aftur.

Ekki setja nein Umonnun secrets/API lykla i `.env.local`. Thessi pakki þarf bara
boolean flag.

### /heim - Umonnun off

Page:

- `http://localhost:3000/auth-mvp/heim`

Skref:

1. Innskra sem venjulegur notandi.
2. Hafa `UMONNUN_ENABLED` ekki `true`.
3. Opna `/auth-mvp/heim`.

Vaent:

- `Lánad og skilad` birtist ef `LOANS_ENABLED=true`.
- `Umonnun` birtist ekki a heimaskja.
- `Hugmyndir` birtist sem ser fyrirsogn fyrir vaentanlegu atridin.
- Virk Teskeid blandast ekki i sama bordered lista og hugmyndir.

Regression sem þarf ad passa:

- Pending badge a `Lánad og skilad` hverfur ekki ef pending invitations eru til.
- Heimaskjarinn brotnar ekki ef engar pending invitations eru til.

### /heim - Umonnun on

Skref:

1. Setja `UMONNUN_ENABLED=true` i `.env.local`.
2. Endurraesa dev server ef thorf er a.
3. Opna `/auth-mvp/heim`.

Vaent:

- `Umonnun` birtist i virka Teskeida svaedinu.
- `Umonnun` er ekki i sama lista og vaentanlegu hugmyndirnar.
- Smellur a `Umonnun` fer a `/auth-mvp/umonnun`, ekki beint a ytri sidu.

Athugid:

- Ef `LOANS_ENABLED=false` en `UMONNUN_ENABLED=true`, a `Umonnun` samt ad geta
  birst.

### /auth-mvp/umonnun

Page:

- `http://localhost:3000/auth-mvp/umonnun`

Skref:

1. Opna Umonnun ur `/heim`.
2. Lesa textann.
3. Profa back-link efst.
4. Profa ytri hlekkina ef Stebbi vill stadfesta URL.

Vaent:

- Sidud synir bara upplysingar, engin Umonnun notendagogn.
- Textinn segir rolega ad Umonnun se ser app i bili.
- Textinn gefur ekki i skyn ad vidkvaem Umonnun gogn hafi flust inn i Teskeid.is.
- Back-link fer aftur a `/auth-mvp/heim`.
- Hlekkir opnast i nyjum tab/window vegna `target="_blank"`.

Production-akvordun:

- Profa direct URL med `UMONNUN_ENABLED` off. Sidud er login-varin en ekki
  feature-flag-gated. Stebbi þarf ad akveda hvort thad se i lagi fyrir almenna
  upplysingasidu, eda hvort Claude Code eigi ad fela route lika.

### Lánad og skilad - pending creator kort

Page:

- `http://localhost:3000/auth-mvp/lanad-og-skilad`

Gagna-state:

- Nota loan item thar sem innskradur notandi er creator.
- Invitation er `pending`.
- Invitation attempt er `sent`.
- Motadili hefur ekki smellt `Þekki málið` enn.

Skref:

1. Opna `Lánad og skilad`.
2. Finna pending kort svipað og skjámynd Stebba.

Vaent:

- Subtitle ma vera a bord vid `Ég fékk lánað · Bíður svars`.
- `Bíður svars` birtist bara einu sinni a kortinu.
- `Bíður samþykkis` birtist ekki.
- `Boð sent`, `Afturkalla boð` og `Eyða` birtast enn ef control-state leyfir.
- Ekki a ad birtast `Merkja skilað` fyrr en invitation er accepted.

Regression sem þarf ad passa:

- Recipient pending soft-ack kort synir enn `Þekki málið` og
  `Kannast ekki við þetta`.
- Accepted loan synir enn return/undo controls rett.
- Declined/cancelled/expired invitations syna skiljanlegt status ef thau birtast.

### Mobile

Profa vid 360-460 px breidd:

- `/auth-mvp/heim`
- `/auth-mvp/umonnun`
- pending loan card i `/auth-mvp/lanad-og-skilad`

Vaent:

- Enginn horizontal scroll.
- Texti skarst ekki inni i button/card.
- Umonnun hlekkir eru snertivanir.
- Loan card buttons raðast ekki of þrett eda yfir hvorn annan.

## Hvad a ekki ad profa kaeruleysislega

- Ekki tengja raunveruleg Umonnun production gogn.
- Ekki setja Umonnun API lykla/secrets i `.env.local`.
- Ekki keyra SQL/Supabase migrations fyrir thessi atridi.
- Ekki deploya/pusha fyrr en Stebbi hefur profad localhost og tekid akvordun um
  route feature-gating og #42 last-opened scope.

## Tillaga ad naesta skrefi

1. Stebbi profar ofangreint a localhost.
2. Ef allt er gott nema #42 last-opened, akveda hvort thad fari i ser TODO eda
   hvort #42 verdi merkt sem "Phase A done, last-opened eftir".
3. Ef direct `/auth-mvp/umonnun` a ad vera falin thegar flag er off, lata Claude
   Code laga route-gating adur en commit.
4. Ef local profun stenst, keyra aftur:
   - `npm run test:run -- lib/__tests__/home-page.test.tsx lib/__tests__/loan-card.test.tsx`
   - `npm run type-check`

