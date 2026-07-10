# Claude prerelease handoff: TODO #46 v008 — public entrypoints + guest CTA redesign

Created: 2026-07-10 14:45
Timezone: Atlantic/Reykjavik
Tengist: TODO #46 v008

## Staða

v008 Codex-rýni er framkvæmd. Ekkert commitað, pushað eða deployað.

## Hvað var gert

### P1 — Public ready cards senda ekki lengur alla á login

**`app/page.tsx`**

Bætti við `publicReadyCardHref(slug)` hjálparfalli:
- `vedrid` → `/vedrid`
- `umonnun` → `/umonnun`
- allt annað → `/innskraning`

Ready cards á forsíðu nota nú helperinn í stað harðkóðaðs `/innskraning`.

### P1 — Hugmynda-detail CTA notar sama routing

**`app/hugmyndir/[slug]/page.tsx`**

`showFreeAccessCta` block notar nú `launchedCtaHref`:
- `vedrid` → `/vedrid`
- `umonnun` → `/umonnun`
- allt annað → `/innskraning`

`/innskraning` er enn rétt destination fyrir `lanad-og-skilad` og aðrar
lokaðar Teskeiðar.

### P2 — Guest added-value strip endurhannaður

**`app/auth-mvp/vedrid/FerdalagidClient.tsx`**

Eldur hönnun: stór grænur `bg-[#e9f4e6]` banner með tekst og takka hliðar
við hvort annað.

Ný hönnun:
- `border border-border` með hvítum/ólit bakgrunni — engin sterk litatilvísun
- Texti: `text-muted-foreground` — hlýr en ekki commanding
- `Innskrá`: `text-sm font-medium text-primary hover:underline` — textalink í
  sinni eigin línu (flex-col gap-1.5), ekki takki sem keppist við aðalflæði
- Á mobile: textalinkurinn færist sjálfkrafa í sér línu, engin horizontal overflow

Rate-limited state (guestRateLimited): sama subtle stíll, `text-foreground`
(örlítið meira áberandi þar sem flæðið stöðvast), en enn textalink á
`/innskraning`, ekki Primary button.

### Nýr prófskrár

**`lib/__tests__/public-landing.test.ts`** — 11 nýtt próf:
- `publicReadyCardHref`: vedrid→/vedrid, umonnun→/umonnun, lanad-og-skilad→/innskraning,
  óþekkt slug→/innskraning
- `launchedCtaHref`: sama rökvirkni fyrir detail CTA
- guest strip contract: staðfestir að stíllinn sé textalink, ekki primary button,
  og engin sterk grænumerkjagrunnur

## Localhost athuganir fyrir Stebbi

### Forsíða → ready cards

1. Opna `/` óinnskráður (incognito).
2. Smella á Veðrið ready card.
   - **Vænt**: fer á `/vedrid`, ekki `/innskraning`.
3. Fara aftur, smella á Umönnun ready card.
   - **Vænt**: fer á `/umonnun`, ekki `/innskraning`.
4. Smella á Lánað og skilað ready card.
   - **Vænt**: fer á `/innskraning` (óbreytt).

### Hugmynda detail CTAs

5. Opna `/hugmyndir/vedrid` óinnskráður.
   - **Vænt**: CTA-takkinn fer á `/vedrid`.
6. Opna `/hugmyndir/umonnun` óinnskráður.
   - **Vænt**: CTA-takkinn fer á `/umonnun`.

### Guest strip í Veðrinu

7. Opna `/vedrid` óinnskráður.
   - **Vænt**: litla added-value hint með þunnum border, grár/hlýr texti,
     `Innskrá` sem textalink undir textanum.
   - **Ætti EKKI að líta út eins og**: stór grænur banner, skylduskref, alert.
8. Aðalflæðið (Frá/Til, leiðir, thresholds) er nothæft án þess að smella á Innskrá.
9. Á 360px: texti og link þrengja ekki á Frá/Til inputs, engin láréttur overflow.

### Rate limit UI

10. Reikna yfir 5 ferðir sem gestur.
    - **Vænt**: rate limit message birtist með þunnum border (eins og guest strip),
      `Innskrá` textalink, ekki villumeldur eða stór grænur CTA.

## Prófunarniðurstöður

```
Test Files  65 passed (65)
Tests  2052 passed | 27 skipped | 8 todo (2087)
```

TypeScript: tsc --noEmit: engar villur.

## Hvað á eftir

- Commit og push (Stebbi þarf að gefa leyfi)
- Env var uppfærsla á Vercel (WEATHER_PUBLIC_ENABLED=true)
- SQL 72 + auth v001 deploy (aðskilið release)
