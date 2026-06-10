# TODO #5 - Codex plan fyrir mobile login baseline

Dagsetning: 2026-06-08
Agent: Codex
Tengt TODO: #5 - Samræmd mobile app-upplifun á öllu Teskeið.is
Tengd atriði: #16, #20, #21, #22

## Niðurstaða Codex

TODO #5 er stórt atriði og ætti ekki að leysa í einni risabreytingu yfir allt
repo. Codex mælir með litlum fyrsta áfanga: **#5A - innskráning og mobile input
baseline**.

Þessi áfangi lagar þekkt mobile-zoom vandamál á `/innskraning`, setur lógóið í
rétt link-mynstur, og bætir regression-prófum. Ekki snerta legacy Krakkavaktar
form eða admin form í þessum áfanga nema þau reynist nauðsynleg.

## Findings

### P2 - Email input er `text-sm`, sem getur valdið iOS/Safari auto-zoom

Skrá:
- `components/teskeid/TeskeidLoginForm.tsx:119-127`

`Design.md:148-149` segir að `input`, `textarea` og `select` skuli vera minnst
16 px á mobile. Email inputið notar `text-sm`, sem er 14 px í Tailwind.

Áhætta: Raunveruleg mobile UX villa, sérstaklega á iOS/Safari.

### P3 - Neðsta lógó á `/innskraning` er ekki smellanlegt

Skrá:
- `components/teskeid/TeskeidLoginForm.tsx:187-190`

TODO #5 biður um canonical lógó neðst á `/innskraning`, smellanlegt, með
server-side ákvörðuðum áfangastað út frá session.

Áhætta: UX ósamræmi, ekki security-vandi.

### P3 - `/innskraning` flag-off hegðun er óhrein en má ekki blanda óvart inn

Skrár:
- `app/innskraning/page.tsx:10-22`
- `lib/__tests__/innskraning-page.test.tsx:91-107`

Þetta er skráð í post-release review fyrir #9. Ef Claude Code tekur þetta með
í #5A, þarf að gera það sem meðvitað lítið fix með prófi. Annars geyma.

## Afmörkun fyrir #5A

Gera:

1. Breyta mobile font-size á Teskeið login controls.
   - Email input: `text-base sm:text-sm` eða einfaldlega `text-base`.
   - Code input er nú þegar `text-xl`, láta það vera nema layout krefjist annars.
   - Buttons þurfa ekki 16 px til að forðast input zoom, en mega haldast
     læsilegir og touch-vænir.

2. Gera neðsta lógóið á `/innskraning` smellanlegt.
   - Bæta við `Link` utan um `TeskeidLogo`.
   - Áfangastaður skal koma frá server-side page, ekki client-side session guess.
   - Í núverandi routing skal líklega nota `/auth-mvp/heim` fyrir innskráðan
     notanda og `/` fyrir óinnskráðan. Þegar #22 fer í vinnslu verður þetta
     canonical `/heim`.
   - Forðast hydration mismatch: `TeskeidLoginForm` má fá `logoHref` prop frá
     `app/innskraning/page.tsx`.

3. Halda UI afmörkuðu.
   - Ekki endurhanna alla síðuna í þessum áfanga nema það sé nauðsynlegt til að
     laga mobile-zoom eða lógó-link.
   - Ekki breyta auth API, OTP, rate-limit, Supabase eða SQL.

4. Bæta prófum.
   - `lib/__tests__/login-form.test.tsx`: email input hefur mobile-safe
     textastærð (`text-base` eða sambærilegt).
   - `lib/__tests__/login-form.test.tsx`: bottom logo er inni í link og notar
     prop/default href.
   - `lib/__tests__/innskraning-page.test.tsx`: page sendir rétt `logoHref`
     í mockað `TeskeidLoginForm`, ef prop er bætt við.

## Ekki gera í #5A

- Ekki laga öll admin/legacy form í sömu breytingu.
- Ekki bæta `maximum-scale`, `user-scalable=no` eða sambærilegum viewport hömlum.
- Ekki breyta `/auth-mvp/*` routing; það er TODO #22.
- Ekki tengja þetta við session-líftíma; það er TODO #7.
- Ekki laga bottom bar tvísmell nema vandinn finnist beint í sama touch/link
  mynstri; annars er það TODO #20.

## Manual browserpróf fyrir Stebba

Stebbi keyrir localhost sjálfur. Eftir breytingu:

1. Opna `/innskraning` í 360 px, 390 px og 460 px viewport.
2. Fókusa email input í mobile emulation og helst iPhone/Safari.
3. Staðfesta að vafrinn þysji ekki inn.
4. Slá inn netfang, fara í kóðaskref og staðfesta að kóða-input og aðalhnappur
   haldist sýnileg með keyboard opið.
5. Smella/tappa neðsta lógó:
   - óinnskráður notandi fer á `/`
   - innskráður notandi fer á heimleið samkvæmt núverandi routing

## Skipanir sem Claude Code ætti að keyra

```text
npm run type-check
npm run test:run -- login-form innskraning-page
npm run test:run
```

Ef project script styður ekki test filter með þessu formi, keyra bara
`npm run test:run`.

## Codex recommendation

Claude Code ætti að framkvæma #5A fyrst. Þetta er lág áhætta, lagar raunverulegt
mobile vandamál, og býr til betri grunn áður en stærri #5 audit eða #22 routing
cleanup hefst.
