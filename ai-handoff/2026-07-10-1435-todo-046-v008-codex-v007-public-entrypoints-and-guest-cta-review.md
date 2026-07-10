# Codex review: TODO #46 v007 public entrypoints + guest CTA

Created: 2026-07-10 14:35
Timezone: Atlantic/Reykjavik
Tengist: TODO #46, v007 prerelease handoff

## Staða

Stebbi staðfesti á localhost að bæði `/vedrid` og `/umonnun` opnast beint hjá
óinnskráðum notanda. Það þýðir að env, middleware og nýju public route-in sjálf
eru í lagi.

Vandinn er í inngangunum inn í public flæðin og í útliti/framsetningu á
innskráningar-hvatningu í Veðrinu.

Engar kóðabreytingar voru gerðar í þessari Codex-rýni.

## Findings

### P1 - Public ready cards senda enn alla óinnskráða á login

`app/page.tsx` notar `href="/innskraning"` fyrir öll launched ready cards hjá
óinnskráðum notendum. Þetta þýðir að kortin opna ekki nýju public route-in
þrátt fyrir að `/vedrid` og `/umonnun` séu nú til.

Afleiðing:

- Veðrið-kortið á forsíðu fer á `/innskraning` í stað `/vedrid`.
- Umönnun-kortið á forsíðu fer á `/innskraning` í stað `/umonnun`.
- Þetta lítur út eins og `WEATHER_PUBLIC_ENABLED` virki ekki, þó það virki.

Tillaga:

- Bæta við litlum helper fyrir public launched card routes:
  - `vedrid` -> `/vedrid`
  - `umonnun` -> `/umonnun`
  - `lanad-og-skilad` -> `/innskraning` í bili
  - fallback -> `/innskraning`
- Nota helperinn í `app/page.tsx`.
- Uppfæra próf sem búast enn við gömlum auth-route/login href fyrir public ready cards.

### P1 - Hugmynda-detail CTA þarf sömu vöruákvörðun

`app/hugmyndir/[slug]/page.tsx` sýnir `Fáðu þér ókeypis aðgang` fyrir launched
hugmyndir og vísar á `/innskraning`.

Ef markmiðið er að óinnskráðir notendur geti prófað public Veðrið og Umönnun
strax, þarf detail-síðan líka að nota sömu route-rökfræði fyrir launched public
Teskeiðar:

- `vedrid` -> CTA á `/vedrid`
- `umonnun` -> CTA á `/umonnun`
- `lanad-og-skilad` -> áfram `/innskraning` þar til hún verður public

Ef Claude Code telur að detail CTA eigi áfram alltaf að vera signup CTA þarf
að kalla það skýrt út sem product decision, því það stangast við public trial
markmiðið.

### P2 - Stebbi er ekki ánægður með núverandi guest login strip/takka

Skjámynd frá Stebba sýnir grænan strip:

> Þekktir staðir vistast fyrir innskráða notendur og þeir geta reiknað
> ótakmarkaðan fjölda af ferðum   Innskrá

Stebbi sagði sérstaklega að hann væri ekki ánægður með þennan takka.

Codex-rýni:

- Stripið les sem stór system alert eða skylduskref, ekki róleg added-value
  hjálparmerking.
- `Innskrá` takkinn hægra megin keppir við aðalflæði Veðursins og getur látið
  óinnskráðan notanda halda að innskráning sé nauðsynleg.
- Á mobile getur löng setning + takki í sömu línu orðið þröngt og ófaglegt.
- Design.md mælir með mobile-first, rólegu app-yfirbragði, skýrum hierarchy,
  ekki óþarfa sterku visual accent í compact summary/operational flæði.

Tillaga að útfærslu:

- Endurhanna þetta sem subtilt added-value hint, ekki grænt CTA-banner.
- Nota neutral/hlýjan ljósan flöt eða mjög létta border-row, ekki sterka
  græna bakgrunnsmerkingu.
- Hafa textann sem aðalatriði og login sem secondary text-link eða lítinn
  secondary button.
- Á mobile má login-aðgerðin fara í sér línu undir textanum eða vera inline
  text-link, svo hún þrengi ekki að copy.
- Mögulegt orðalag fyrir link/takka:
  - `Innskrá`
  - eða `Innskrá til að vista staði`
  - eða sem textalink: `Skráðu þig inn til að vista staði og reikna fleiri ferðir.`
- Halda merkingu Stebba:
  `Þekktir staðir vistast fyrir innskráða notendur og þeir geta reiknað ótakmarkaðan fjölda af ferðum`
  en Claude Code má stytta ef layout krefst þess, svo lengi sem merkingin tapast ekki.

### P2 - Gömlu auth route-in mega áfram vera lokuð, en mega ekki vera default entrypoint

`/auth-mvp/vedrid` og `/auth-mvp/umonnun` mega áfram vera authenticated app
routes. Það sem þarf að laga er að public entrypoints vísi ekki þangað eða á
login nema það sé viljandi fyrir viðkomandi Teskeið.

## Plan fyrir Claude Code

1. Útbúa route-helper fyrir launched public ready cards.
2. Nota helperinn á forsíðu public ready cards.
3. Beita sömu route-rökfræði á launched CTA í `app/hugmyndir/[slug]/page.tsx`,
   eða kalla skýrt út ef detail CTA á viljandi að vera signup-only.
4. Endurhanna guest added-value strip í Veðrinu samkvæmt Design.md:
   mobile-first, subtle, secondary login affordance, ekki alert-líkt banner.
5. Uppfæra `messages/is.json` og `messages/en.json` ef texti breytist.
6. Uppfæra/eða bæta við prófum:
   - public home ready card for `vedrid` hrefar á `/vedrid`
   - public home ready card for `umonnun` hrefar á `/umonnun`
   - public home ready card for `lanad-og-skilad` hrefar áfram á `/innskraning`
   - guest strip/login CTA er til staðar en ekki primary blocking state

## Design.md viðmið

Viðeigandi kaflar:

- Mobile-first og app-upplifun: public pages mega ekki valda þrengslum,
  overflowi eða controlum sem líta út eins og þau þurfi zoom.
- Buttons: primary action á að vera skýr en ekki nota primary þar sem aðgerðin
  er aukaleg.
- Microcopy: stutt, hlýtt, beint, praktískt.
- Navigation feedback: ef card/link navigation getur tekið tíma þarf ekki nýtt
  route loader hér nema breytt route-segment bíði sýnilega, en linkar mega ekki
  virðast dauðir.

## Localhost checks for Stebbi

Prófa sem óinnskráður notandi, helst í incognito/private glugga:

1. Opna `/`.
2. Smella á Veðrið ready card.
   - Vænt: fer á `/vedrid`, ekki `/innskraning`.
3. Fara aftur á `/` og smella á Umönnun ready card.
   - Vænt: fer á `/umonnun`, ekki `/innskraning`.
4. Smella á Lánað og skilað ready card.
   - Vænt: má enn fara á `/innskraning` í þessari útgáfu.
5. Opna `/vedrid` sem gestur.
   - Vænt: added-value login hint sést, en lítur ekki út eins og skylduskref
     eða stór alert. Login-aðgerðin er secondary.
   - Vænt: hægt er að halda áfram að nota Veðrið án þess að skrá sig inn.
6. Prófa mobile breidd, sérstaklega um 360-390 px.
   - Vænt: texti og login-link/takki skarast ekki, valda ekki láréttu overflowi
     og þrengja ekki að aðalflæðinu.
7. Ef detail pages eru uppfærðar:
   - `/hugmyndir/vedrid` CTA opnar `/vedrid`.
   - `/hugmyndir/umonnun` CTA opnar `/umonnun`.

Ekki þarf að prófa Supabase/RLS sérstaklega fyrir þessa UI/link-lagfæringu
nema Claude Code breyti aftur API eða saved-place hegðun.

## Skipanir keyrðar af Codex

Read-only:

- `Get-Content -Encoding UTF8 'WORKFLOW.md'`
- `Get-Content -Encoding UTF8 'Design.md'`
- `Get-ChildItem -File 'ai-handoff' | Where-Object { $_.Name -like '*todo-046*' } | Select-Object Name,Length,LastWriteTime | Sort-Object Name`
- `Get-Date -Format 'yyyy-MM-dd-HHmm'`
- `Get-Content -Encoding UTF8 'ai-handoff/2026-07-10-1425-todo-046-v007-claude-v006-done-prerelease.md'`
- Fyrri read-only skoðun í samtalinu á `app/page.tsx`, `app/vedrid/page.tsx`,
  `app/umonnun/page.tsx`, `app/hugmyndir/[slug]/page.tsx`, `middleware.ts` og
  `ReadyTeskeidCard.tsx`.

## Áhætta / þarf að staðfesta

- Þarf að staðfesta hvort launched detail CTA eigi að opna public feature eða
  áfram vera "fáðu aðgang" CTA. Codex mælir með public feature route fyrir
  `vedrid` og `umonnun`, í takt við markmiðið að leyfa notkun án login.
- Þarf að passa að authenticated heimaskjárinn haldi áfram að nota rétta
  authenticated routes/saved-data hegðun.
- Engar SQL-, Supabase-, RLS-, migration-, commit-, push- eða deploy-breytingar
  voru gerðar í þessari rýni.
