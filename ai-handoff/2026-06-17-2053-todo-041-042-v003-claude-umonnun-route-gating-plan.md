# TODO #41 + #42 - Route-gating fyrir /auth-mvp/umonnun

**Agent:** Claude Code
**Fyrir:** Codex (yfirferð) og Stebbi (samþykki)
**Dagsetning:** 2026-06-17
**Staða:** Plan -- bíður Codex-yfirferðar og Stebbi-samþykkis
**Tengd TODO:** #41 Umönnun sem feature-flagged Teskeid

## Bakgrunnur

Við yfirferð á `v002-codex-localhost-handoff` greindi Claude Code að
`/auth-mvp/umonnun` er aðeins login-varin, ekki feature-flag-gated. Þ.e.
innskráðir notendur geta farið beint á slóðina þótt `UMONNUN_ENABLED` sé ekki
`true`. Handoff-skrá Codex flaggaði þetta sem þekkt áhætta og bað Stebbi um
ákvörðun.

Stebbi hefur ákveðið: við gerum hlutina almennilega og bætum við route-gating.
Engin shortcut.

## Vandinn

`app/auth-mvp/umonnun/page.tsx`:

```ts
export default async function UmonnunPage() {
  await guardTeskeidSession()   // login-vörn
  // ... engin flag-gating
```

`app/auth-mvp/heim/page.tsx` sýnir Umönnun-kortið aðeins þegar
`umonnunEnabled === true`. En beina slóðin `/auth-mvp/umonnun` er ósett.

## Lausnin

Bæta við `guardFeatureAccess` kalli efst í `UmonnunPage()` rétt fyrir neðan
`guardTeskeidSession()`. `guardFeatureAccess` er þegar til í `lib/loans/guard.ts`
og redirectar á `/` ef flaggið er af.

### Breyting á `app/auth-mvp/umonnun/page.tsx`

Núverandi:
```ts
export default async function UmonnunPage() {
  await guardTeskeidSession()
  const t = await getTranslations('teskeid.home')
```

Eftir breytingu:
```ts
import { guardFeatureAccess } from '@/lib/loans/guard'

export default async function UmonnunPage() {
  await guardTeskeidSession()
  await guardFeatureAccess('', 'umonnun')
  const t = await getTranslations('teskeid.home')
```

Það er ekkert annað sem þarf að breyta. Engin SQL, engar migrations, engar
Supabase-breytingar.

## Athuganir

### Röðun guards

`guardTeskeidSession()` á alltaf að koma fyrst -- hún sér um login-athugun og
setur session. `guardFeatureAccess` kemur á eftir. Þetta er sama mynstur og er
notað á öðrum stöðum í kóðanum.

### `guardFeatureAccess` sendir tóman userId

`guardFeatureAccess` í `lib/loans/guard.ts` tekur `email` og `featureKey` en
engin email-gating er til staðar fyrir umonnun -- flaggið er eingöngu env-var-
basað. Þess vegna er tómi strengurinn `''` í lagi hér, sama og í loans-guard.

Ef einhvern tímann verður per-user email-gating bætt við, þarf að uppfæra
þessa skrá. Það er þó ekki hluti af þessum pakka.

### Redirect á `/` ekki `/auth-mvp/heim`

`guardFeatureAccess` redirectar á `/`. Þetta er sama hegðun og loans-guard
notar. Notendur með active session pristane á Teskeid-heimasíðuna beint. Eðlilegt.

### Engin middleware-leið

Hægt væri að setja þetta í Next.js middleware. Það er flóknara og óþarft fyrir
eina slóð. Page-level guard er nóg og fylgir mynstrinu sem er þegar í gangi.

## Áhættumat

**Overall risk: Mjög lág.**

- Engin Supabase-breyting.
- Engin schema/migration.
- Engar RLS/policy breytingar.
- Engin gögn fara í hættu.
- Eina breyting er ein `import`-lína og eitt `await`-kall.
- Notendur með `UMONNUN_ENABLED=true` sjá engar breytingar.
- Notendur án flags fá redirect á `/` í stað 200 á upplýsingasíðu -- þetta er réttara.

Mögulegar hliðaráhrif: engar þekktar.

## Skrár sem breytast

- `app/auth-mvp/umonnun/page.tsx` -- ein `import` og eitt `await guardFeatureAccess` kall

## Localhost checks for Stebbi

### Setup

1. Tryggja að `UMONNUN_ENABLED` sé ekki `true` í `.env.local` (eða að keylan
   vanti).
2. Vera innskráður í Teskeid.

### Test 1 -- Flag af, bein slóð

Slóð: `http://localhost:3000/auth-mvp/umonnun`

Skref:

1. Hafa `UMONNUN_ENABLED` ekki `true`.
2. Fara beint á slóðina.

Vaent:

- Notandi fær redirect á `/`, ekki 200 með upplýsingasíðu.

### Test 2 -- Flag á, bein slóð

Skref:

1. Setja `UMONNUN_ENABLED=true` í `.env.local`.
2. Endurræsa dev server.
3. Fara beint á `http://localhost:3000/auth-mvp/umonnun`.

Vaent:

- Umönnun-síðan birtist eðlilega.

### Test 3 -- Flag á, via /heim

Skref:

1. Fara á `/auth-mvp/heim`.
2. Smella á Umönnun-kortið.

Vaent:

- Fer á `/auth-mvp/umonnun` eðlilega.

### Regressions

- `/auth-mvp/lanad-og-skilad` -- ekkert breytist þar.
- Pending badge á Lánad og skilað -- ekkert breytist þar.
- Notandi án Teskeid-session fær login-redirect sem áður (guardTeskeidSession
  kemur áður en guardFeatureAccess).

### Ekki prófað kaeruleysislega

- Engar Supabase/production-aðgerðir eru hluti af þessum pakka.
- Ekki pusha fyrr en Stebbi og Codex hafa samþykkt.

## Tillaga að næsta skrefi

1. Codex yfirfer þessa handoff-skrá.
2. Stebbi gefur Claude Code grænt ljós.
3. Claude Code gerir eina línubreytinguna.
4. Stebbi keyrir localhost-prófanirnar að ofan.
5. Ef allt er gott, commit og deploy ásamt öðrum breytingum úr v002-pakka.
