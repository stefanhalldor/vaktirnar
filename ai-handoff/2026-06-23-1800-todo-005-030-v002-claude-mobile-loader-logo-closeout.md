# TODO #5 + #30 v002 - Mobile loader + logo preview closeout

**Fra:** Claude Code
**Til:** Codex
**Dagsetning:** 2026-06-23 18:00
**Commit:** 89261bc
**Stada:** Lokid. #5 og #30 tilbuid til DONE ad mati Claude og Stebbi.

---

## Samhengi

Codex afhenti verkefnin i handoff `2026-06-23-1700-todo-005-030-v001-codex-mobile-loader-logo-package-handoff.md`. Claude klaeddi i kringum badan hluta.

---

## Hvad var gert

### #5 -- Loading screens fyrir lanad-og-skilad undirsiður

Fjórar undirsiður vantadi eigin `loading.tsx`. Foreldrasidan (`lanad-og-skilad/loading.tsx`) na ekki yfir barnahluti i Next.js App Router -- hver hluti þarf sitt eigid skjal.

Buid til:
- `app/auth-mvp/lanad-og-skilad/ny/loading.tsx`
- `app/auth-mvp/lanad-og-skilad/[id]/loading.tsx`
- `app/auth-mvp/lanad-og-skilad/breyta/[id]/loading.tsx`
- `app/auth-mvp/lanad-og-skilad/baeta-vid-adila/[id]/loading.tsx`

Allar fjórar eru identiskar og nota sama `TeskeidLoader` og foreldrasidan.

### #30 -- Allt/10 forskoðun

Buid til `public/favicon-options/cap-mark-allt-10-preview.svg`. Samasett og `cap-mark-10-5-preview.svg` nema letid er i tveimur linum:
- Lina 1: "Allt" -- y=241, fontSize=28
- Lina 2: "10" -- y=272, fontSize=28

(cap rect er fra y=224 til y=290, midja vid y=257)

Forskoðunarsida uppfaerd: `app/preview/favicons/codex/page.tsx` -- 6. option batt vid undir "10,5 derhúfa" faeringunni.

---

## Tests

```
npm run type-check --> 0 errors
```

Engar kóðabreytingar a testanlegum hlutum -- loading.tsx skrar eru einfaldar render-only stillingar.

---

## Engin SQL keyrd

Engar SQL functions, schema edda data breytingar.

---

## Localhost checks sem Stebbi a eftir ad gera

### A. Loading screens

1. Fara a `/auth-mvp/lanad-og-skilad` og smella a "Lana hlut" (ny/).
   - Vaent: TeskeidLoader setur ut a medan sidunni er hladen.
2. Smella a lan til ad sja detail ([id]/).
   - Vaent: TeskeidLoader.
3. Smella a "Breyta" a detail-sidu (breyta/[id]/).
   - Vaent: TeskeidLoader.
4. Smella a "Baeta vid adila" a detail-sidu (baeta-vid-adila/[id]/).
   - Vaent: TeskeidLoader.

### B. Allt/10 favicon forskoðun

1. Fara a `/preview/favicons/codex`.
2. Stadfesta ad "Allt/10 derhúfa" sest sem 6. valmoguleiki.
3. Bera saman vid "10,5 derhúfa" -- eru bader lesanlegar vid smar staeðir?

---

## Naesta skref

Ef Stebbi stadfestir localhost checks:

- Faera #5 i DONE.
- Faera #30 i DONE (eda framlengja ef Stebbi vill velja milli 10,5 og Allt/10 fyrir raunverulegt favicon).
- Halda afram med naesta TODO a listanum.
