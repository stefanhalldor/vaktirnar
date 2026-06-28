# TODO #41 + #42 — Codex-rýni á route-gating fyrir Umönnun

**Agent:** Codex  
**Fyrir:** Stebbi og Claude Code  
**Dagsetning:** 2026-06-17  
**Staða:** Samþykkt með tveimur breytingum áður en Claude Code framkvæmir  
**Tengd TODO:** #41 Umönnun sem feature-flagged Teskeið; #42 Tilbúnar Teskeiðar efst og síðast opnuð fyrst  
**Rýnt skjal:** `ai-handoff/2026-06-17-2053-todo-041-042-v003-claude-umonnun-route-gating-plan.md`

## Niðurstaða

Codex samþykkir leiðina að bæta page-level feature guard á
`/auth-mvp/umonnun`. Þetta er rétta einfalda lausnin fyrir þetta scope:
kortið á `/auth-mvp/heim` er þegar feature-flagged, og beina slóðin á
upplýsingasíðuna á líka að lúta sama flaggi.

Engin SQL, Supabase, RLS, auth-policy, migration, production-gagna eða
deployment breyting á að vera hluti af þessu atriði.

## Findings

### P2 — Ekki nota tóman email-streng í `guardFeatureAccess`

Claude Code leggur til:

```ts
await guardFeatureAccess('', 'umonnun')
```

Þetta myndi virka í dag vegna þess að `checkFeatureAccess` notar bara
`process.env.UMONNUN_ENABLED` fyrir `umonnun`. Samt er þetta brothætt mynstur:
`guardFeatureAccess` tekur email sem fyrsta argument og framtíðar per-user
feature-gating gæti þurft rétt email.

Claude Code á að nota session user sem `guardTeskeidSession()` skilar:

```ts
const { user } = await guardTeskeidSession()
await guardFeatureAccess(user.email!, 'umonnun')
```

Þetta heldur núverandi hegðun en skilur ekki eftir tækniskuld í nýjum kóða.

### P3 — Bæta þarf við regression-prófi

Planið nefnir localhost-próf en ekki sjálfvirkt próf. Þetta er lítið scope og
þarf ekki stórt prófasett, en það ætti að vera regression-próf fyrir route-gating:

- `UMONNUN_ENABLED` ekki `true` => bein `/auth-mvp/umonnun` leið redirectar.
- `UMONNUN_ENABLED=true` => `/auth-mvp/umonnun` renderast fyrir innskráðan notanda.

Ef það er of óþægilegt að prófa page redirect beint má bæta við focused guard
testum fyrir `guardFeatureAccess(..., 'umonnun')`, en Codex mælir helst með
page-level test ef núverandi test setup leyfir það.

## Samþykkt framkvæmdarleið

Claude Code má gera eftirfarandi litlu breytingu:

1. Uppfæra `app/auth-mvp/umonnun/page.tsx`.
2. Bæta við importi:

```ts
import { guardFeatureAccess } from '@/lib/loans/guard'
```

3. Breyta upphafi `UmonnunPage()` úr:

```ts
await guardTeskeidSession()
```

yfir í:

```ts
const { user } = await guardTeskeidSession()
await guardFeatureAccess(user.email!, 'umonnun')
```

4. Bæta við focused regression-prófi.
5. Keyra viðeigandi próf og type-check.

Ekki breyta SQL, migrations, Supabase, RLS, policies, auth guards almennt,
deployment stillingum eða `.env.local` í þessu atriði.

## Áhætta

**Heildaráhætta:** Mjög lág ef scope helst svona þröngt.

Áhætta sem þarf samt að passa:

- Ef `guardTeskeidSession()` og `guardFeatureAccess()` eru sett í öfuga röð getur
  óinnskráður notandi fengið rangan redirect eða óþarfa hegðun.
- Ef tómt email er notað gæti framtíðar email-gating brotnað hljóðlega.
- Ef engin regression-próf eru bætt við gæti beina slóðin opnast aftur síðar án
  þess að nokkur taki eftir.

Engin þekkt gagnalekaáhætta er í fyrirhugaðri breytingu. Umönnun-síðan sýnir
aðeins almennan upplýsingatexta og enga Umönnun-notendagögn.

## Skrár sem Claude Code ætti að breyta

Væntanlegt:

- `app/auth-mvp/umonnun/page.tsx`
- líklega `lib/__tests__/home-page.test.tsx`, `lib/__tests__/guard.test.ts` eða
  nýtt lítið page/route test, eftir því sem passar best við núverandi test setup

Ekki væntanlegt:

- `sql/`
- `messages/is.json` eða `messages/en.json`, nema próf þurfi mock-texta
- `.env.local`
- Supabase config, RLS, policies eða grants

## Prófanir sem Claude Code á að keyra

Lágmark:

```bash
npm run type-check
npm run test:run -- lib/__tests__/guard.test.ts
```

Ef page-próf er bætt við í annarri skrá skal keyra þá skrá líka. Ef breytingin
snertir núverandi home-page test mocka skal keyra:

```bash
npm run test:run -- lib/__tests__/home-page.test.tsx
```

## Localhost checks for Stebbi

Stebbi keyrir dev server sjálfur. Codex og Claude Code eiga ekki að ræsa hann
nema Stebbi biðji sérstaklega um það.

### Setup

1. Stebbi opnar sjálfur `.env.local`.
2. Fyrst skal prófa með `UMONNUN_ENABLED` tómt, vantað eða eitthvað annað en
   `true`.
3. Síðan skal prófa með `UMONNUN_ENABLED=true`.
4. Ef `.env.local` er breytt þarf Stebbi líklega að endurræsa dev server svo
   Next lesi nýja env-gildið.

### Test 1 — Flag slökkt, bein slóð

Slóð:

- `http://localhost:3000/auth-mvp/umonnun`

Skref:

1. Hafa `UMONNUN_ENABLED` ekki `true`.
2. Vera innskráður í Teskeið.
3. Opna slóðina beint.

Vænt:

- Notandi fær redirect á `/`.
- Umönnun-upplýsingasíðan birtist ekki.

### Test 2 — Flag kveikt, bein slóð

Skref:

1. Setja `UMONNUN_ENABLED=true`.
2. Endurræsa dev server ef þarf.
3. Vera innskráður í Teskeið.
4. Opna `http://localhost:3000/auth-mvp/umonnun` beint.

Vænt:

- Umönnun-upplýsingasíðan birtist.
- Hún sýnir aðeins almennan texta og ytri hlekki.
- Engin Umönnun-gögn, netföng, secrets eða API-lyklar birtast.

### Test 3 — Flag kveikt, farið frá `/heim`

Skref:

1. Opna `http://localhost:3000/auth-mvp/heim`.
2. Staðfesta að Umönnun birtist sem virk Teskeið.
3. Smella á Umönnun.

Vænt:

- Notandi fer á `/auth-mvp/umonnun`.
- Back-link á síðunni fer aftur á `/auth-mvp/heim`.

### Regression-próf á localhost

Staðfesta að eftir breytinguna:

- `/auth-mvp/lanad-og-skilad` virki áfram.
- Pending badge á `Lánað og skilað` á `/heim` breytist ekki.
- Umönnun birtist ekki á `/heim` þegar flaggið er slökkt.
- Óinnskráður notandi fær áfram login/session-hegðun frá `guardTeskeidSession()`
  áður en feature-gating skiptir máli.

## Hvað má ekki prófa kæruleysislega

- Ekki setja Umönnun API lykla eða secrets í `.env.local`.
- Ekki tengja raunveruleg Umönnun production gögn.
- Ekki keyra SQL eða Supabase breytingar fyrir þetta atriði.
- Ekki deploya eða pusha fyrr en Stebbi hefur prófað localhost og samþykkt.

## Copy/paste til Claude Code

```md
Codex samþykkir route-gating planið fyrir `/auth-mvp/umonnun` með tveimur skilyrðum:

1. Ekki nota `await guardFeatureAccess('', 'umonnun')`.
   Notaðu session user:
   `const { user } = await guardTeskeidSession()`
   og svo:
   `await guardFeatureAccess(user.email!, 'umonnun')`

2. Bættu við focused regression-prófi:
   - `UMONNUN_ENABLED` ekki `true` => bein `/auth-mvp/umonnun` leið redirectar.
   - `UMONNUN_ENABLED=true` => síðan renderast fyrir innskráðan notanda.

Ekki breyta SQL, Supabase, RLS, auth-policy, deployment stillingum eða `.env.local`.
Keyrðu `npm run type-check` og viðeigandi test-skrá(r), og skilaðu post-implementation handoff með niðurstöðum og localhost-skrefum fyrir Stebba.
```

