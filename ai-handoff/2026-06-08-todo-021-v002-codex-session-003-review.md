# TODO #21 / Session 003 - Codex review

Dagsetning: 2026-06-08
Agent: Codex
Rýnt handoff: `ai-handoff/2026-06-08-session-003-handoff-codex-review.md`
Tengd atriði: #21, #5A, #9 P3 cleanup

## Findings

### P2 - `/preview/favicons/codex` vísar í ótrackuð public assets

Skrár:
- `app/preview/favicons/codex/page.tsx:21-34`
- `public/favicon-options/cap-mark.svg`
- `public/favicon-options/face-badge.svg`
- `public/favicon-options/full-badge.svg`
- `public/favicon-options/glasses-smile.svg`

`app/preview/favicons/codex/page.tsx` sýnir fimm favicon options. Aðeins
`public/favicon-options/cap-mark-10-5-preview.svg` er trackað í Git. Hin fjögur
base options eru til á disknum en birtast sem untracked í `git status`, og
`git ls-files public/favicon-options` sýnir þau ekki.

Áhrif: Clean checkout eða Vercel deploy frá Git getur sýnt brotnar myndir fyrir
núverandi A&10, face, full og glasses favicon options á `/preview/favicons/codex`.
Next build grípur þetta ekki því þetta eru runtime `/public` paths.

Tillaga: Claude Code ætti annað hvort að committa þessi fjögur base SVG assets
eða breyta preview-síðunni svo hún vísi aðeins í assets sem eru trackuð/generate-uð
á áreiðanlegan hátt. Ef `scripts/generate-teskeid-favicon-options.mjs` á að vera
source of truth, þá þarf að ákveða hvort generated output eigi að vera commit-að
eða generation keyrð í build ferli. Núna er hvorugt tryggt fyrir base options.

## Engin blocker fundust í #5A

`components/teskeid/TeskeidLoginForm.tsx`:
- Email input er nú `text-base sm:text-sm`, sem passar við `Design.md:148-149`
  og ætti að laga iOS/Safari auto-zoom á mobile.
- Neðsta lógó er komið í `next/link` með `aria-label="Teskeið"`.

`app/innskraning/page.tsx`:
- `logoHref="/"` kemur frá server-side page og veldur ekki client-side
  session-guess/hydration vandamáli.

Prófin í `login-form.test.tsx` og `innskraning-page.test.tsx` eru nægileg fyrir
þennan afmarkaða #5A áfanga.

## #21 mat

Preview-first nálgunin er rétt: production `teskeidLogoPaths.ts`, `app/icon.svg`
og PWA iconar eru óbreytt, og nýja `10,5` merkið er skýrt merkt sem forskoðun.

Eftir asset-fixið hér að ofan þarf Stebbi að skoða:
- `/preview/favicons/codex`
- `/preview/teskeid-logo/codex`

Codex mælir ekki með að færa `10,5` í production logo fyrr en Stebbi hefur
samþykkt visualið og ákveðið hvort ný reference image eða handteiknað vector path
verður source of truth.

## Staðfest af Codex

Codex keyrði:

```text
npm run type-check -> exit 0
npm run test:run  -> exit 0, 28 files passed, 807 passed | 22 skipped | 8 todo
npm run build     -> exit 0
```

Build sýndi aðeins fyrirliggjandi lint warnings:
- `app/s/[sessionId]/page.tsx` vantar dependency í tveimur `useEffect` köllum.
- `components/landing/Avatar.tsx` notar `<img>`.

Codex keyrði ekki SQL, commit-aði ekki, push-aði ekki og deployaði ekki.
