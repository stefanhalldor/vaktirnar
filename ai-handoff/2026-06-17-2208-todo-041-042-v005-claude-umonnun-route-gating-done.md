# TODO #41 + #42 - Umönnun route-gating framkvæmt

**Agent:** Claude Code
**Fyrir:** Stebbi (localhost-prófun og samþykki fyrir commit)
**Dagsetning:** 2026-06-17
**Staða:** Framkvæmt, bíður localhost-prófunar
**Tengd TODO:** #41 Umönnun sem feature-flagged Teskeid; #42 Tilbúnar Teskeiðar efst
**Byggir á:** v004-codex-umonnun-route-gating-review

## Hvað var gert

### Breyting 1: Route-gating á `/auth-mvp/umonnun`

**Skrá:** `app/auth-mvp/umonnun/page.tsx`

Bætt við importi og tveim línum efst í `UmonnunPage()`:

```ts
import { guardFeatureAccess } from '@/lib/loans/guard'

const { user } = await guardTeskeidSession()
await guardFeatureAccess(user.email!, 'umonnun')
```

Áður var aðeins:

```ts
await guardTeskeidSession()
```

Röðun er rétt: `guardTeskeidSession()` kemur alltaf fyrst og sér um login.
`guardFeatureAccess` kemur á eftir og sér um feature flag. Óinnskráðir notendur
fá login-redirect áður en flag-gating skiptir máli.

`user.email!` er notað samkvæmt ábendingu Codex -- ekki tómur strengur -- svo
framtíðar email-gating brjóti ekki hljóðlega.

### Breyting 2: Regression-próf í `guard.test.ts`

**Skrá:** `lib/__tests__/guard.test.ts`

Bætt við tveimur nýjum `describe`-blokkum:

**`checkFeatureAccess — umonnun`** (3 próf):

- `UMONNUN_ENABLED` ekki sett → skilar `false`
- `UMONNUN_ENABLED=false` → skilar `false`
- `UMONNUN_ENABLED=true` → skilar `true`

**`guardFeatureAccess — umonnun`** (3 próf):

- `UMONNUN_ENABLED` ekki sett → redirectar á `/`
- `UMONNUN_ENABLED=false` → redirectar á `/`
- `UMONNUN_ENABLED=true` → redirectar ekki

## Niðurstöður prófa og type-check

```
npm run type-check  → exit 0, engar villur
npm run test:run -- lib/__tests__/guard.test.ts
                    lib/__tests__/home-page.test.tsx
                    lib/__tests__/loan-card.test.tsx
→ 3 test files, 88 tests, 0 failed
```

## Breyttar skrár í þessum pakka

Þær breytingar sem eru nú ócommittaðar og Stebbi þarf að prófa:

### Frá v002-codex-localhost-handoff (Codex-breytingar):

- `app/auth-mvp/heim/page.tsx` — virkar Teskeiðar aðskildar frá hugmyndum,
  `umonnunEnabled` flag
- `app/auth-mvp/umonnun/page.tsx` (ný skrá) — Umönnun upplýsingasíða
- `components/loans/LoanCard.tsx` — pending creator-kort sýnir ekki tvítekið
  copy
- `lib/loans/guard.ts` — `checkFeatureAccess` styður `umonnun` feature key
- `.env.example` — `UMONNUN_ENABLED` bætt við
- `messages/is.json` og `messages/en.json` — Umönnun-textar
- `lib/__tests__/home-page.test.tsx` — próf fyrir Umönnun-flag og active vs
  upcoming separation
- `lib/__tests__/loan-card.test.tsx` (ný skrá) — próf fyrir pending copy cleanup
- `TODO.md` og `DONE.md` — #36 og #40 færð í DONE

### Frá þessari Claude Code framkvæmd:

- `app/auth-mvp/umonnun/page.tsx` — route-gating bætt við
- `lib/__tests__/guard.test.ts` — `umonnun` regression-próf bætt við

## Localhost checks fyrir Stebbi

Stebbi keyrir dev server sjálfur. Claude Code keyrir hann ekki.

### Setup

1. Opna `.env.local`.
2. Byrja með `UMONNUN_ENABLED` ekki `true` (tómt eða ekki til staðar).
3. Tryggja að `LOANS_ENABLED=true` ef Stebbi vill prófa Lánað og skilað líka.
4. Ef `.env.local` er breytt þarf að endurræsa dev server.

---

### Prófunarhluti A: Route-gating (nýtt í þessum pakka)

#### Test A-1 — Flag slökkt, bein slóð redirectar

Slóð: `http://localhost:3000/auth-mvp/umonnun`

Skref:

1. Hafa `UMONNUN_ENABLED` ekki `true`.
2. Vera innskráður í Teskeid.
3. Fara beint á slóðina.

Vaent:

- Notandi fær redirect á `/`.
- Umönnun-síðan birtist ekki.

#### Test A-2 — Flag kveikt, bein slóð virkar

Skref:

1. Setja `UMONNUN_ENABLED=true` í `.env.local`.
2. Endurræsa dev server.
3. Fara beint á `http://localhost:3000/auth-mvp/umonnun`.

Vaent:

- Umönnun-upplýsingasíðan birtist.
- Sýnir aðeins almennan texta og ytri hlekki.
- Engin Umönnun-gögn, netföng eða secrets birtast.

#### Test A-3 — Flag kveikt, farið frá `/heim`

Skref:

1. Fara á `http://localhost:3000/auth-mvp/heim`.
2. Smella á Umönnun-kortið.

Vaent:

- Fer á `/auth-mvp/umonnun`.
- Back-link efst fer aftur á `/auth-mvp/heim`.

---

### Prófunarhluti B: /heim -- virkar Teskeiðar vs hugmyndir (frá v002)

#### Test B-1 — Umönnun off á /heim

Skref:

1. Hafa `UMONNUN_ENABLED` ekki `true`.
2. Fara á `http://localhost:3000/auth-mvp/heim`.

Vaent:

- `Lánað og skilað` birtist (ef `LOANS_ENABLED=true`).
- `Umönnun` birtist ekki.
- `Hugmyndir` birtist sem eigin fyrirsögn fyrir óvirku atriðin.
- Virk Teskeid blandast ekki í sama lista og hugmyndir.

#### Test B-2 — Umönnun on á /heim

Skref:

1. Setja `UMONNUN_ENABLED=true`.
2. Fara á `/heim`.

Vaent:

- `Umönnun` birtist í virka Teskeiða-svæðinu.
- Smellur á `Umönnun` fer á `/auth-mvp/umonnun`, ekki beint á ytri síðu.

#### Test B-3 — Aðeins UMONNUN_ENABLED=true, LOANS_ENABLED=false

Skref:

1. Setja `UMONNUN_ENABLED=true` og `LOANS_ENABLED=false`.
2. Fara á `/heim`.

Vaent:

- `Umönnun` birtist.
- `Lánað og skilað` birtist ekki.
- Hugmyndir-listinn birtist eðlilega.

---

### Prófunarhluti C: Lánað og skilað -- pending creator-kort (frá v002)

Slóð: `http://localhost:3000/auth-mvp/lanad-og-skilad`

Gagna-state:

- Nota loan þar sem innskráður notandi er creator.
- Invitation er `pending`, attempt er `sent`, móðadili hefur ekki svarað.

Vaent:

- Subtitle má vera á borð við `Ég fékk lánað · Bíður svars`.
- `Bíður svars` birtist bara einu sinni á kortinu.
- `Bíður samþykkis` birtist ekki.
- `Boð sent`, `Afturkalla boð` og `Eyða` birtast enn.
- `Merkja skilað` birtist ekki fyrr en invitation er accepted.

---

### Regressions sem þarf að passa yfir allt

- Óinnskráður notandi fær áfram login-redirect (guardTeskeidSession kemur
  áður en guardFeatureAccess).
- Pending badge á `Lánað og skilað` á `/heim` hverfur ekki ef pending
  invitations eru til.
- Recipient soft-ack kort sýnir enn `Þekki málið` og `Kannast ekki við þetta`.
- Accepted loan sýnir enn return/undo controls rétt.
- `/auth-mvp/lanad-og-skilad` virkar áfram án breytinga.

---

### Hvað á ekki að prófa kæruleysislega

- Ekki setja Umönnun API lykla eða secrets í `.env.local`.
- Ekki tengja raunveruleg Umönnun production gögn.
- Ekki keyra SQL eða Supabase migrations.
- Ekki pusha fyrr en Stebbi hefur prófað localhost og samþykkt.

## Tillaga að næsta skrefi

1. Stebbi keyrir prófanirnar að ofan.
2. Ef allt er gott, commit þennan pakka.
3. Ákveða hvort #42 "síðast opnuð fyrst" er aðskilin Phase B eða nýtt TODO.
4. Pushar og fylgist með Vercel build log.
